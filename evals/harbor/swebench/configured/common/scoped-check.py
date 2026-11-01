#!/usr/bin/env python3
"""Run existing file-scoped tests; this helper has no benchmark-answer knowledge.

Mappings use repository layout, matching filenames, and direct Python imports.
Unknown paths fail as incomplete (2). Native test failures preserve a nonzero exit.
"""
import ast
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys

ROOT = Path.cwd().resolve()
os.environ['PATH'] = str(ROOT / 'node_modules' / '.bin') + os.pathsep + os.environ['PATH']
PROFILE = json.loads((Path(__file__).parent / 'repo-profile.json').read_text())
KIND = PROFILE['kind']
NATIVE_PYTHON = '/opt/miniconda3/envs/testbed/bin/python'


def incomplete(message):
    print('INCOMPLETE: ' + message, file=sys.stderr)
    raise SystemExit(2)


def relpath(value):
    path = (ROOT / value).resolve()
    try:
        relative = path.relative_to(ROOT).as_posix()
    except ValueError:
        incomplete('path is outside the repository: ' + value)
    if not path.is_file():
        incomplete('expected an existing file: ' + value)
    return relative


def tracked_paths():
    result = subprocess.run(['git', 'ls-files', '-co', '--exclude-standard', '-z'], check=True, stdout=subprocess.PIPE)
    return sorted(set(p for p in result.stdout.decode().split('\0') if p))


def changed_paths():
    # A local actor commit must not hide changed dependencies from the rebuild.
    base = PROFILE.get('baseCommit', '')
    if not re.fullmatch(r'[0-9a-f]{40}', base):
        incomplete('the repository profile must pin its original base commit')
    try:
        changed = subprocess.check_output(['git', 'diff', '--name-only', '--no-renames', '-z', base, '--']).decode().split('\0')
        changed += subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z']).decode().split('\0')
    except subprocess.CalledProcessError:
        incomplete('cannot compare source changes with the original base commit')
    return sorted(set(path for path in changed if path))


def test_file(path):
    if KIND == 'babel':
        return bool(re.match(r'^(packages|codemods|eslint)/[^/]+/test/.+\.m?js$', path)) and not any('/test/' + x + '/' in path for x in ['fixtures', 'debug-fixtures', 'tmp', '__data__', 'helpers', 'expressions', 'regressions']) and not path.endswith('_browser.js')
    if KIND == 'immutable':
        return bool(re.match(r'^__tests__/[^/]+\.(js|ts)$', path)) and path != '__tests__/utils.js'
    if KIND == 'preact':
        return bool(re.match(r'^(?:(?:compat|debug|devtools|hooks|test-utils|jsx-runtime)/)?test/(?:browser|shared|node)/.*\.test\.js$', path))
    if KIND == 'axios':
        return path.startswith('test/unit/') and path.endswith('.js')
    if KIND == 'sphinx':
        return bool(re.match(r'^tests/test_[^/]+\.py$', path))
    if KIND == 'django':
        return path.startswith('tests/') and bool(re.search(r'/(?:test_[^/]+|tests)\.py$', path))
    return False


def stem_key(path):
    value = Path(path).stem
    value = re.sub(r'^(test_)|(?:\.test|\.spec)$', '', value)
    return re.sub(r'[^a-z0-9]', '', value.lower())


def python_candidates(source, tests):
    module = source[:-3].replace('/', '.')
    if module.endswith('.__init__'):
        module = module[:-9]
    result = set()
    for test in tests:
        # Exact ordinary filename conventions supplement direct source imports.
        if KIND == 'sphinx':
            flattened = (module[7:] if module.startswith('sphinx.') else module).replace('.', '_')
            if Path(test).stem == 'test_' + flattened:
                result.add(test)
        elif source.startswith('django/utils/'):
            if test == 'tests/utils_tests/test_' + Path(source).stem + '.py':
                result.add(test)
        try:
            tree = ast.parse((ROOT / test).read_text())
        except (SyntaxError, UnicodeDecodeError):
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Import) and any(alias.name == module for alias in node.names):
                result.add(test)
            elif isinstance(node, ast.ImportFrom) and node.level == 0:
                if node.module == module or any((node.module or '') + '.' + alias.name == module for alias in node.names):
                    result.add(test)
    # A common entry point must not silently select a large fraction of a suite.
    return sorted(result) if len(result) <= 12 else []


def candidates(source, tests):
    if source in tests:
        return [source]
    if KIND == 'babel':
        match = re.match(r'^((?:packages|codemods|eslint)/[^/]+)/(?:src|test)/', source)
        return [test for test in tests if match and test.startswith(match[1] + '/test/')]
    if KIND == 'immutable':
        return [test for test in tests if stem_key(test) == stem_key(source)]
    if KIND == 'preact':
        part = source.split('/')[0]
        prefix = part + '/' if part in ['compat', 'debug', 'devtools', 'hooks', 'test-utils', 'jsx-runtime'] else ''
        scoped = [test for test in tests if test.startswith(prefix + 'test/')]
        return [test for test in scoped if stem_key(test) == stem_key(source)]
    if KIND == 'axios' and source.startswith('lib/'):
        wanted = 'test/unit/' + source[4:]
        return [test for test in tests if test == wanted]
    if KIND in ['sphinx', 'django'] and source.endswith('.py'):
        return python_candidates(source, tests)
    return []


def run(command, env=None):
    print('+ ' + shlex.join(command), flush=True)
    result = subprocess.run(command, env=env)
    if result.returncode:
        raise SystemExit(result.returncode if result.returncode > 0 else 1)


def execute(tests):
    if KIND == 'babel':
        changed = changed_paths()
        package_paths = set()
        for file in [*tests, *supplied, *changed]:
            match = re.match(r'^((?:packages|codemods|eslint)/[^/]+)/(?:src|test)/', file)
            if match:
                package_paths.add(match[1])
        env = os.environ.copy()
        env['BABEL_ENV'] = 'test'
        run(['yarn', 'node', '/opt/benchmark/babel-scope-build.cjs', *sorted(package_paths)], env)
        run(['yarn', 'jest', '--runInBand', '--runTestsByPath', *tests], env)
    elif KIND == 'immutable':
        env = os.environ.copy()
        env.pop('CI', None)  # The repository resolver tests live src/ outside CI.
        run(['node', 'node_modules/jest/bin/jest.js', '--runInBand', '--runTestsByPath', *tests], env)
    elif KIND == 'preact':
        unsupported = [test for test in tests if re.match(r'^[^/]+/test/(?:shared|node)/', test)]
        if unsupported:
            incomplete('subpackage shared/node tests need a verified native scoped build: ' + ', '.join(unsupported))
        if any(test.startswith(('test/node/', 'test/shared/')) for test in tests):
            # These Mocha tests import the package root, whose main is dist/preact.js.
            run(['npm', 'run', 'build:core'])
        # The pristine Karma configuration accepts one exact filename as grep.
        # It supplies its existing ChromeNoSandboxHeadless launcher and source aliases.
        for test in tests:
            if test.startswith(('test/node/', 'test/shared/')):
                run(['node', 'node_modules/mocha/bin/mocha', '--require', '@babel/register', test])
                continue
            env = os.environ.copy()
            env.update({'BABEL_NO_MODULES': 'true', 'COVERAGE': 'false', 'PERFORMANCE': 'false', 'MINIFY': 'false'})
            run(['node', 'node_modules/karma/bin/karma', 'start', 'karma.conf.js', '--single-run', '--browsers', 'ChromeNoSandboxHeadless', '--grep', test], env)
    elif KIND == 'axios':
        run(['node', 'bin/ssl_hotfix.js', 'node_modules/.bin/mocha', *tests, '--timeout', '30000', '--exit'])
    elif KIND == 'sphinx':
        run([NATIVE_PYTHON, '-m', 'pytest', '-rA', '--durations', '25', *tests])
    elif KIND == 'django':
        # Repository test_sqlite.py uses in-memory SQLite; no external database.
        labels = [test[6:-3].replace('/', '.') for test in tests]
        run([NATIVE_PYTHON, 'tests/runtests.py', *labels, '--settings=test_sqlite', '--parallel', '1', '--verbosity', '1'])
    else:
        incomplete('unknown repository kind: ' + KIND)


if len(sys.argv) < 3 or sys.argv[1] not in ['test-one', 'verify', 'plan']:
    incomplete('usage: scoped-check.sh (test-one|verify|plan) file [file ...]')
mode, supplied = sys.argv[1], [relpath(value) for value in sys.argv[2:]]
all_tests = [path for path in tracked_paths() if test_file(path) and (ROOT / path).is_file()]
if mode == 'test-one':
    if len(supplied) != 1 or not test_file(supplied[0]):
        incomplete('test-one requires one supported existing test file, not a directory or fixture')
    selected = supplied
else:
    mapping = {source: candidates(source, all_tests) for source in supplied}
    print(json.dumps({'sourceToTests': mapping}, indent=2), flush=True)
    missing = [source for source, tests in mapping.items() if not tests]
    if missing:
        incomplete('no safe automatic test scope for ' + ', '.join(missing) + '; choose an existing relevant test file explicitly')
    selected = sorted({test for tests in mapping.values() for test in tests})
if not selected:
    incomplete('no tests selected')
if mode == 'plan':
    print(json.dumps({'tests': selected, 'executed': False}, indent=2))
else:
    execute(selected)
