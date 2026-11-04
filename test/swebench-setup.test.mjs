import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { excludePathspecs } from '../dist/claude/tools/count-logic-lines.mjs'

const root = resolve(import.meta.dirname, '..')
const configured = join(root, 'evals/harbor/swebench/configured')
const python = (process.env.HAECHI_EVAL_PYTHON ? [process.env.HAECHI_EVAL_PYTHON] : ['python3.14', 'python3.13', 'python3.12', '/usr/bin/python3', 'python3'])
  .find(candidate => spawnSync(candidate, ['-c', 'import shlex; assert hasattr(shlex, "join")']).status === 0)
assert.ok(python, 'setup regressions need Python 3.8+; set HAECHI_EVAL_PYTHON')

function fixture(t, kind = 'babel') {
  const dir = mkdtempSync(join(tmpdir(), 'haechi-setup-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const put = (file, text) => { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), text) }
  const run = (command, args = [], env = {}) => spawnSync(command, args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } })
  const git = (...args) => {
    const result = run('git', args)
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'synthetic@example.com')
  git('config', 'user.name', 'Synthetic setup test')
  put('.gitignore', '**/lib/\n')
  const commit = () => { git('add', '.'); git('commit', '-qm', 'Synthetic setup fixture'); return git('rev-parse', 'HEAD') }
  const install = (baseCommit) => {
    for (const name of ['scoped-check.py', 'babel-scope-build.cjs']) copyFileSync(join(configured, 'common', name), join(dir, name))
    put('repo-profile.json', JSON.stringify({ kind, baseCommit }))
  }
  const executable = (name, body) => { put(`node_modules/.bin/${name}`, '#!/bin/sh\n' + body); chmodSync(join(dir, 'node_modules/.bin', name), 0o755) }
  const check = (...args) => run(python, ['scoped-check.py', ...args])
  return { dir, put, run, git, commit, install, executable, check }
}

const copyingWorker = `const fs = require('node:fs'), path = require('node:path');
exports.transform = async (src, dest) => {
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  fs.writeFileSync(dest, fs.readFileSync(src));
};\n`

test('Babel rebuild removes outputs of deleted sources', t => {
  const f = fixture(t)
  f.put('packages/sample/src/index.js', "module.exports = require('./removed.js');\n")
  const base = f.commit()
  f.put('packages/sample/lib/index.js', 'old bootstrap input')
  f.put('packages/sample/lib/removed.js', "module.exports = 'stale output';")
  f.put('babel-worker.cjs', copyingWorker)
  f.install(base)
  const built = f.run(process.execPath, ['babel-scope-build.cjs', 'packages/sample'])
  assert.equal(built.status, 0, built.stderr)
  assert.equal(existsSync(join(f.dir, 'packages/sample/lib/removed.js')), false)
  const loaded = f.run(process.execPath, ['-e', "require('./packages/sample/lib/index.js')"])
  assert.notEqual(loaded.status, 0, 'deleted source must not resolve through stale lib output')
  assert.match(loaded.stderr, /Cannot find module '\.\/removed\.js'/)
  assert.deepEqual(readdirSync(join(f.dir, 'packages/sample')).filter(p => p.startsWith('.haechi-scope-')), [])
})

test('Babel keeps bootstrap inputs available until all native transforms finish', t => {
  const f = fixture(t)
  f.put('packages/sample/src/index.js', 'new compiled output')
  const base = f.commit()
  f.put('packages/sample/lib/index.js', 'old bootstrap input')
  f.put('babel-worker.cjs', copyingWorker.replace('fs.mkdirSync', "if (fs.readFileSync('packages/sample/lib/index.js', 'utf8') !== 'old bootstrap input') throw new Error('bootstrap input disappeared');\n  fs.mkdirSync"))
  f.install(base)
  const built = f.run(process.execPath, ['babel-scope-build.cjs', 'packages/sample'])
  assert.equal(built.status, 0, built.stderr)
  assert.equal(readFileSync(join(f.dir, 'packages/sample/lib/index.js'), 'utf8'), 'new compiled output')
})

test('Babel failed native transform preserves previous lib and cleans staging', t => {
  const f = fixture(t)
  f.put('packages/sample/src/index.js', 'new source')
  const base = f.commit()
  f.put('packages/sample/lib/index.js', 'old compiled output')
  f.put('packages/sample/lib/removed.js', 'old dependency')
  f.put('babel-worker.cjs', copyingWorker.replace('fs.writeFileSync(dest, fs.readFileSync(src));', "fs.writeFileSync(dest, 'partial output'); throw new Error('SYNTHETIC_TRANSFORM_FAILURE');"))
  f.install(base)
  const built = f.run(process.execPath, ['babel-scope-build.cjs', 'packages/sample'])
  assert.notEqual(built.status, 0)
  assert.match(built.stderr, /SYNTHETIC_TRANSFORM_FAILURE/)
  assert.equal(readFileSync(join(f.dir, 'packages/sample/lib/index.js'), 'utf8'), 'old compiled output')
  assert.equal(readFileSync(join(f.dir, 'packages/sample/lib/removed.js'), 'utf8'), 'old dependency')
  assert.deepEqual(readdirSync(join(f.dir, 'packages/sample')).filter(p => p.startsWith('.haechi-scope-')), [])
})

test('Babel skips unchanged native-excluded raw helpers and verifies ordinary helpers index', t => {
  const f = fixture(t)
  f.put('packages/babel-helpers/src/helpers/raw.js', 'raw helper source')
  f.put('packages/babel-helpers/src/index.ts', "module.exports = 'fresh helpers index';")
  const base = f.commit()
  f.put('babel-worker.cjs', copyingWorker)
  f.install(base)
  const built = f.run(process.execPath, ['babel-scope-build.cjs', 'packages/babel-helpers'])
  assert.equal(built.status, 0, built.stderr)
  assert.equal(existsSync(join(f.dir, 'packages/babel-helpers/lib/helpers/raw.js')), false)
  assert.equal(readFileSync(join(f.dir, 'packages/babel-helpers/lib/index.js'), 'utf8'), "module.exports = 'fresh helpers index';")
})

for (const generated of ['packages/babel-helpers/src/helpers/raw.js', 'packages/babel-helpers/src/helpers-generated.ts', 'packages/babel-types/src/builders/generated/index.ts', 'packages/babel-types/scripts/generators/validators.js', 'packages/sample/package.json']) {
  test(`Babel refuses committed generation changes: ${generated}`, t => {
    const f = fixture(t)
    f.put(generated, 'original source')
    f.put('packages/sample/src/index.js', 'ordinary source')
    const base = f.commit()
    f.put(generated, 'committed changed source')
    f.commit()
    f.put('babel-worker.cjs', copyingWorker)
    f.install(base)
    const built = f.run(process.execPath, ['babel-scope-build.cjs', 'packages/sample'])
    assert.equal(built.status, 2, built.stderr)
    assert.match(built.stderr, /INCOMPLETE:.*native.*(?:generat|build)/i)
    assert.equal(existsSync(join(f.dir, 'packages/sample/lib')), false)
  })
}

test('Babel verify does not map a generator script to tests over stale generated source', t => {
  const f = fixture(t)
  f.put('packages/sample/scripts/generator.js', 'generator source')
  f.put('packages/sample/test/index.js', 'synthetic test')
  f.install(f.commit())
  f.executable('yarn', 'echo unexpected > ran-tests\n')
  const result = f.check('verify', 'packages/sample/scripts/generator.js')
  assert.equal(result.status, 2, result.stderr)
  assert.match(result.stderr, /INCOMPLETE: no safe automatic test scope/)
  assert.equal(existsSync(join(f.dir, 'ran-tests')), false)
})

test('Babel scoped check includes committed dependency source changes against immutable base', t => {
  const f = fixture(t)
  f.put('packages/a/test/index.js', 'synthetic test')
  f.put('packages/b/src/index.js', 'original source')
  const base = f.commit()
  f.put('packages/b/src/index.js', 'changed committed source')
  f.commit()
  f.install(base)
  f.executable('yarn', 'echo "$@" >> commands.log\n')
  const result = f.check('test-one', 'packages/a/test/index.js')
  assert.equal(result.status, 0, result.stderr)
  const commands = readFileSync(join(f.dir, 'commands.log'), 'utf8').trim().split('\n')
  assert.match(commands[0], /babel-scope-build\.cjs packages\/a packages\/b$/)
  assert.equal(commands[1], 'jest --runInBand --runTestsByPath packages/a/test/index.js')
})

test('unmapped source returns explicit incomplete without running any tests', t => {
  const f = fixture(t, 'immutable')
  f.put('src/unmapped.js', 'synthetic source')
  f.put('__tests__/Other.js', 'synthetic test')
  f.install(f.commit())
  f.executable('node', 'echo unexpected > ran-tests\n')
  const result = f.check('verify', 'src/unmapped.js')
  assert.equal(result.status, 2)
  assert.match(result.stderr, /INCOMPLETE: no safe automatic test scope/)
  assert.equal(existsSync(join(f.dir, 'ran-tests')), false)
})

test('Preact core shared tests run native scoped core build before Mocha and stop on build failure', t => {
  const f = fixture(t, 'preact')
  f.put('test/shared/context.test.js', 'synthetic test')
  f.install(f.commit())
  f.executable('npm', 'echo "npm $@" >> commands.log\nexit "${BUILD_EXIT:-0}"\n')
  f.executable('node', 'echo "node $@" >> commands.log\n')
  const result = f.check('test-one', 'test/shared/context.test.js')
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(readFileSync(join(f.dir, 'commands.log'), 'utf8').trim().split('\n'), [
    'npm run build:core', 'node node_modules/mocha/bin/mocha --require @babel/register test/shared/context.test.js',
  ])
  rmSync(join(f.dir, 'commands.log'))
  const failure = f.run(python, ['scoped-check.py', 'test-one', 'test/shared/context.test.js'], { BUILD_EXIT: '7' })
  assert.equal(failure.status, 7)
  assert.equal(readFileSync(join(f.dir, 'commands.log'), 'utf8').trim(), 'npm run build:core')
})

test('Preact subpackage shared tests are explicit incomplete until their native build is supported', t => {
  const f = fixture(t, 'preact')
  f.put('hooks/test/shared/context.test.js', 'synthetic test')
  f.install(f.commit())
  f.executable('node', 'echo unexpected > ran-tests\n')
  const result = f.check('test-one', 'hooks/test/shared/context.test.js')
  assert.equal(result.status, 2, result.stderr)
  assert.match(result.stderr, /INCOMPLETE:.*subpackage.*native.*build/i)
  assert.equal(existsSync(join(f.dir, 'ran-tests')), false)
})

test('Babel testDirs exclude nested tests using actual frozen-tool Git pathspecs', t => {
  const f = fixture(t)
  for (const file of ['packages/a/src/index.js', 'packages/a/test/nested/plain.js', 'codemods/a/test/plain.js', 'eslint/a/test/plain.js']) f.put(file, 'synthetic file')
  f.commit()
  const settings = JSON.parse(readFileSync(join(configured, 'profiles/babel/.haechi.json'), 'utf8'))
  const kept = f.git('ls-files', '--', 'packages', 'codemods', 'eslint', ...excludePathspecs(settings)).split('\n')
  assert.deepEqual(kept, ['packages/a/src/index.js'])
})

test('configured profiles pin original public base commits from selection', () => {
  const selection = JSON.parse(readFileSync(join(root, 'evals/harbor/swebench/selection.json'), 'utf8'))
  const byRepo = Object.fromEntries(selection.instances.map(({ repo, base_commit }) => [repo, base_commit]))
  for (const [kind, repo] of Object.entries({ babel: 'babel/babel', preact: 'preactjs/preact', immutable: 'immutable-js/immutable-js', axios: 'axios/axios', sphinx: 'sphinx-doc/sphinx', django: 'django/django' })) {
    const profile = JSON.parse(readFileSync(join(configured, 'profiles', kind, 'repo-profile.json'), 'utf8'))
    assert.equal(profile.baseCommit, byRepo[repo])
  }
})
