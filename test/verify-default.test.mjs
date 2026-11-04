import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { planChecks } from '../dist/claude/tools/verify-default.mjs'

const jsTools = { pm: 'yarn', js: { eslint: true, vitest: true, jest: false }, py: { runner: 'pip', ruff: false, pytest: false } }
const pyTools = { pm: 'npm', js: { eslint: false, vitest: false, jest: false }, py: { runner: 'uv', ruff: true, pytest: true } }

test('JS/TS files get eslint and related vitest through the package manager', () => {
  const { plan, skipped } = planChecks(['src/a.tsx', 'src/tests/a.test.tsx', 'README.md'], jsTools)
  assert.deepEqual(plan.map((step) => step.command), [
    'yarn eslint src/a.tsx src/tests/a.test.tsx',
    'yarn vitest related --run src/a.tsx src/tests/a.test.tsx',
  ])
  assert.deepEqual(skipped, [])
})

test('jest is used when there is no vitest', () => {
  const { plan } = planChecks(['src/a.ts'], { ...jsTools, pm: 'npm', js: { eslint: false, vitest: false, jest: true } })
  assert.deepEqual(plan.map((step) => step.command), ['npx jest --findRelatedTests src/a.ts --passWithNoTests'])
})

test('Python still runs changed test files and identifies unmapped sources', () => {
  const { plan, skipped } = planChecks(['app/views.py', 'tests/test_views.py'], pyTools)
  assert.deepEqual(plan.map((step) => step.command), ['uv run ruff check app/views.py tests/test_views.py', 'uv run pytest tests/test_views.py'])
  assert.match(skipped.join(), /unmapped Python source: app\/views.py/)
})

test('paths with spaces are quoted', () => {
  const { plan } = planChecks(['src/my file.ts'], jsTools)
  assert.equal(plan[0].command, 'yarn eslint "src/my file.ts"')
})

test('missing tools are reported instead of silently passing', () => {
  const { plan, skipped } = planChecks(['src/a.ts'], { ...jsTools, js: { eslint: false, vitest: false, jest: false } })
  assert.deepEqual(plan, [])
  assert.deepEqual(skipped, ['no eslint for JS/TS files', 'no vitest or jest for JS/TS files'])
})

test('docs-only changes plan nothing', () => {
  assert.deepEqual(planChecks(['README.md', 'docs/a.md'], jsTools), { plan: [], skipped: [], pythonTests: [] })
})

const mapped = { pythonTestMap: [{ source: 'app/', tests: ['tests/test_api.py'] }] }

test('source-only changes combine exact and directory matches without duplicate tests', () => {
  const settings = { pythonTestMap: [
    ...mapped.pythonTestMap,
    { source: 'app/orders.py', tests: ['tests/test_orders.py', 'tests/test_api.py'] },
  ] }
  const { plan, skipped } = planChecks(['app/orders.py', 'app/items.py', 'tests/test_api.py'], pyTools, settings)
  assert.equal(plan[1].command, 'uv run pytest tests/test_api.py tests/test_orders.py')
  assert.deepEqual(skipped, [])
})

test('directory matching respects boundaries and exact files do not match other files', () => {
  const { plan, skipped } = planChecks(['app/orders.py', 'apps/orders.py', 'app/order.py'], pyTools, {
    pythonTestMap: [{ source: 'app/orders.py', tests: ['tests/test_orders.py'] }],
  })
  assert.equal(plan[1].command, 'uv run pytest tests/test_orders.py')
  assert.deepEqual(skipped, ['unmapped Python source: apps/orders.py', 'unmapped Python source: app/order.py'])
  const directory = planChecks(['app/orders.py', 'apps/orders.py'], pyTools, mapped)
  assert.deepEqual(directory.skipped, ['unmapped Python source: apps/orders.py'])
})

test('a custom single-test command keeps options and works without detected pytest', () => {
  const settings = { ...mapped, commands: { testOne: 'docker compose exec api pytest -q {file}' } }
  const { plan, skipped } = planChecks(['app/api.py', 'tests/test_other.py'], { ...pyTools, py: { ...pyTools.py, pytest: false } }, settings)
  assert.deepEqual(plan.slice(1).map((step) => step.command), [
    'docker compose exec api pytest -q tests/test_other.py',
    'docker compose exec api pytest -q tests/test_api.py',
  ])
  assert.deepEqual(skipped, [])
})

test('conftest changes need an explicit map and missing pytest is never complete', () => {
  assert.match(planChecks(['tests/conftest.py'], pyTools).skipped.join(), /unmapped.*conftest/)
  const result = planChecks(['tests/test_api.py'], { ...pyTools, py: { ...pyTools.py, pytest: false } })
  assert.match(result.skipped.join(), /no pytest.*commands.testOne/)
})

test('malformed settings and unsafe mappings fail before a plan is returned', () => {
  for (const settings of [null, [], { pythonTestMap: null }, { pythonTestMap: {} }, { pythonTestMap: [null] },
    { pythonTestMap: [{ source: 'app/', tests: [] }] }, { commands: { testOne: 'pytest' } },
    { commands: { testOne: null } }]) {
    assert.throws(() => planChecks(['app/api.py'], pyTools, settings), /settings|pythonTestMap|testOne/)
  }
  for (const path of ['/tmp/test_api.py', '../test_api.py', 'tests/../test_api.py', '-test_api.py', '@test_api.py',
    'tests/*.py', 'tests/test_api.py::test_one', 'tests/$(touch owned).py', 'tests/a;echo.py', 'tests/a".py', 'tests/a\\b.py']) {
    assert.throws(() => planChecks(['app/api.py'], pyTools, { pythonTestMap: [{ source: 'app/', tests: [path] }] }), /path|pythonTestMap/)
  }
  assert.throws(() => planChecks(['app/$(touch owned).py'], pyTools, mapped), /path/)
  assert.throws(() => planChecks(['app/api.py'], pyTools, { pythonTestMap: [{ source: '../app/', tests: ['tests/test_api.py'] }] }), /path/)
})

test('mapped test paths with spaces remain one argument', () => {
  const { plan } = planChecks(['app/api.py'], pyTools, { pythonTestMap: [{ source: 'app/', tests: ['tests/test api.py'] }] })
  assert.equal(plan[1].command, 'uv run pytest "tests/test api.py"')
})

const verifier = fileURLToPath(new URL('../dist/claude/tools/verify-default.mjs', import.meta.url))
const fixture = (t, settings = mapped) => {
  const root = mkdtempSync(join(tmpdir(), 'haechi-python-verify-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  execFileSync('git', ['init', '-q', root])
  for (const directory of ['app', 'tests', 'bin']) mkdirSync(join(root, directory))
  writeFileSync(join(root, 'app/api.py'), '# source\n')
  writeFileSync(join(root, 'tests/test_api.py'), '# test\n')
  writeFileSync(join(root, 'requirements-dev.txt'), 'ruff\npytest\n')
  writeFileSync(join(root, '.haechi.json'), JSON.stringify(settings))
  const runner = `require('node:fs').appendFileSync('calls.jsonl', JSON.stringify({tool:require('node:path').basename(process.argv[1]),args:process.argv.slice(2)})+'\\n'); if(process.argv[1].includes('pytest')) { if(process.env.FAIL_TEST) process.exit(1); console[process.env.TEST_STDERR ? 'error' : 'log'](process.env.TEST_OUTPUT ?? '1 passed in 0.01s'); }`
  for (const name of ['ruff', 'pytest']) {
    const path = join(root, 'bin', name)
    writeFileSync(path, `#!${process.execPath}\n${runner}\n`)
    chmodSync(path, 0o755)
    if (process.platform === 'win32') writeFileSync(`${path}.cmd`, `@"${process.execPath}" "${path}" %*\r\n`)
  }
  writeFileSync(join(root, 'calls.jsonl'), '')
  return {
    root,
    run: (files = ['app/api.py'], env = {}) => spawnSync(process.execPath, [verifier, ...files], {
      cwd: root, encoding: 'utf8', env: { ...process.env, PATH: [join(root, 'bin'), dirname(process.execPath), process.env.PATH].join(delimiter), ...env },
    }),
    calls: () => readFileSync(join(root, 'calls.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse),
  }
}

test('CLI selects source-related tests, reports failure and recovers after the test passes', (t) => {
  const repo = fixture(t)
  const failed = repo.run(undefined, { FAIL_TEST: '1' })
  assert.equal(failed.status, 1, failed.stdout + failed.stderr)
  assert.deepEqual(repo.calls().map((call) => call.tool), ['ruff', 'pytest'])
  const passed = repo.run()
  assert.equal(passed.status, 0, passed.stdout + passed.stderr)
  assert.match(passed.stdout, /checks passed/)
  assert.deepEqual(repo.calls().at(-1).args, ['tests/test_api.py'])
})

test('CLI exits incomplete when one source is unmapped or Python tools are absent', (t) => {
  const repo = fixture(t)
  writeFileSync(join(repo.root, 'other.py'), '# unmapped\n')
  const result = repo.run(['app/api.py', 'other.py'])
  assert.equal(result.status, 2, result.stdout + result.stderr)
  assert.match(result.stdout, /unmapped Python source: other.py/)
  assert.match(result.stdout, /checks incomplete/)
  writeFileSync(join(repo.root, 'requirements-dev.txt'), '')
  assert.equal(repo.run().status, 2)
})

test('CLI treats exit-zero no-tests output as incomplete', (t) => {
  const repo = fixture(t, { ...mapped, commands: { testOne: 'node no-tests.cjs {file}' } })
  writeFileSync(join(repo.root, 'no-tests.cjs'), "console.log('no tests collected'); console.error('runner diagnostic')\n")
  const result = repo.run()
  assert.equal(result.status, 2, result.stdout + result.stderr)
  assert.match(result.stdout, /no tests collected/)
  assert.match(result.stderr, /runner diagnostic/)
  assert.match(result.stdout, /checks incomplete/)
  assert.doesNotMatch(result.stdout, /verification complete/)
  assert.match(result.stdout, /do not prove acceptance coverage or task completion/)
})

test('CLI validates all selected test files before running even Ruff', (t) => {
  const repo = fixture(t, { pythonTestMap: [{ source: 'app/', tests: ['tests/missing.py'] }] })
  const result = repo.run()
  assert.equal(result.status, 1)
  assert.match(result.stderr, /test file.*tests\/missing.py/)
  assert.deepEqual(repo.calls(), [])
})

test('CLI rejects symlinked tests escaping the repository', { skip: process.platform === 'win32' }, (t) => {
  const repo = fixture(t, { pythonTestMap: [{ source: 'app/', tests: ['tests/outside.py'] }] })
  const outside = mkdtempSync(join(tmpdir(), 'haechi-outside-'))
  t.after(() => rmSync(outside, { recursive: true, force: true }))
  writeFileSync(join(outside, 'test_api.py'), '# external\n')
  symlinkSync(join(outside, 'test_api.py'), join(repo.root, 'tests/outside.py'))
  const result = repo.run()
  assert.equal(result.status, 1)
  assert.match(result.stderr, /outside.*repository/)
  assert.deepEqual(repo.calls(), [])
})

test('CLI rejects malformed JSON and does not invoke a custom verify recursively', (t) => {
  const repo = fixture(t, { ...mapped, commands: { verify: 'false', testOne: 'pytest -q {file}' } })
  assert.equal(repo.run().status, 0)
  assert.deepEqual(repo.calls().at(-1).args, ['-q', 'tests/test_api.py'])
  writeFileSync(join(repo.root, '.haechi.json'), '{broken')
  const result = repo.run()
  assert.equal(result.status, 1)
  assert.match(result.stderr, /settings|haechi.json/)
})

test('CLI preserves paths with spaces in fallback and already-quoted custom commands', (t) => {
  const settings = { pythonTestMap: [{ source: 'app/', tests: ['tests/test api.py'] }] }
  const repo = fixture(t, settings)
  writeFileSync(join(repo.root, 'tests/test api.py'), '# spaced test\n')
  assert.equal(repo.run().status, 0)
  assert.deepEqual(repo.calls().at(-1).args, ['tests/test api.py'])
  const commands = process.platform === 'win32' ? ['pytest -q "{file}"'] : ['pytest -q "{file}"', "pytest -q '{file}'"]
  for (const testOne of commands) {
    writeFileSync(join(repo.root, '.haechi.json'), JSON.stringify({ ...settings, commands: { testOne } }))
    assert.equal(repo.run().status, 0)
    assert.deepEqual(repo.calls().at(-1).args, ['-q', 'tests/test api.py'])
  }
})

test('CLI keeps documentation-only changes successful and marks skipped JS checks incomplete', (t) => {
  const repo = fixture(t)
  const docs = repo.run(['README.md'])
  assert.equal(docs.status, 0)
  assert.match(docs.stdout, /no behavior tests ran/)
  assert.deepEqual(repo.calls(), [])
  assert.equal(repo.run(['app/main.ts']).status, 2)
})

test('CLI preserves explicit placeholder quoting inside shell wrappers', { skip: process.platform === 'win32' }, (t) => {
  const settings = { pythonTestMap: [{ source: 'app/', tests: ['tests/test api.py'] }] }
  const repo = fixture(t, settings)
  writeFileSync(join(repo.root, 'tests/test api.py'), '# spaced test\n')
  for (const testOne of ['sh -c "pytest \'{file}\'"', 'sh -c \'pytest "{file}"\'']) {
    writeFileSync(join(repo.root, '.haechi.json'), JSON.stringify({ ...settings, commands: { testOne } }))
    const result = repo.run()
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.deepEqual(repo.calls().at(-1).args, ['tests/test api.py'])
  }
})

test('CLI rejects an ambiguous placeholder inside a quoted shell snippet before checks run', (t) => {
  const settings = {
    pythonTestMap: [{ source: 'app/', tests: ['tests/test api.py'] }],
    commands: { testOne: 'sh -c "pytest {file}"' },
  }
  const repo = fixture(t, settings)
  writeFileSync(join(repo.root, 'tests/test api.py'), '# spaced test\n')
  const result = repo.run()
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stderr, /testOne.*quot/)
  assert.deepEqual(repo.calls(), [])
})

// Scripted runner summaries test the verifier boundary, not integrations with those runners.
test('CLI accepts positive pytest, Jest, Vitest and Node TAP execution summaries', (t) => {
  const repo = fixture(t)
  for (const output of [
    '======================== 2 passed, 1 warning in 0.05s ========================',
    'Tests:       2 passed, 2 total',
    ' Tests  2 passed (2)',
    '\u001b[32m Tests  2 passed (2)\u001b[0m\r',
    '# tests 2\n# suites 0\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0',
  ]) {
    const result = repo.run(undefined, { TEST_OUTPUT: output, TEST_STDERR: '1' })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /checks passed/)
    assert.ok(result.stderr.includes(output), 'the raw runner summary remains visible')
  }
})

test('CLI leaves absent, unknown, zero, skipped and partial execution evidence incomplete', (t) => {
  const repo = fixture(t)
  for (const output of [
    '', 'all good', '2 passed', 'No tests found, exiting with code 0',
    '0 passed in 0.01s', '1 skipped in 0.01s', '1 passed, 1 skipped in 0.01s',
    '1 passed, 1 xfailed in 0.01s', '1 passed, 1 xpassed in 0.01s', '1 passed, 1 deselected in 0.01s',
    'Tests: 1 skipped, 1 passed, 2 total', 'Tests: 1 todo, 1 passed, 2 total',
    ' Tests  1 skipped (1)', ' Tests  1 passed (2)', ' Tests  1 passed | 1 passed (2)',
    '1 passed 1 passed in 0.01s',
    '# tests 1\n# pass 1\n# fail 0',
    '# tests 2\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0',
    '# tests 1\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 1',
    '1 passed in 0.01s\nNo tests found',
  ]) {
    const result = repo.run(undefined, { TEST_OUTPUT: output })
    assert.equal(result.status, 2, `${JSON.stringify(output)}\n${result.stdout}${result.stderr}`)
    assert.match(result.stdout, /checks incomplete/)
    assert.match(result.stdout, /test execution evidence is missing or incomplete/)
  }
})

test('CLI rejects runner-reported failures even when a wrapper exits zero', (t) => {
  const repo = fixture(t)
  for (const output of [
    '1 failed, 1 passed in 0.01s', '1 error in 0.01s',
    'Tests: 1 failed, 1 passed, 2 total', ' Tests  1 failed | 1 passed (2)',
    'Tests: 1 failed, 1 passed, 1 total', '1 failed, unknown result in 0.01s',
    '# tests 2\n# pass 1\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0',
    '# tests 1\n# pass 0\n# fail 0\n# cancelled 1\n# skipped 0\n# todo 0',
    '1 failed in 0.01s\n1 passed in 0.01s',
  ]) {
    const result = repo.run(undefined, { TEST_OUTPUT: output })
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.match(result.stdout, /checks failed/)
  }
  writeFileSync(join(repo.root, 'other.py'), '# unmapped\n')
  assert.equal(repo.run(['app/api.py', 'other.py'], { FAIL_TEST: '1' }).status, 1, 'failure takes precedence over incomplete coverage')
})

test('CLI accepts actual Node TAP output and detects a swallowed assertion failure', (t) => {
  const repo = fixture(t, { ...mapped, commands: { testOne: 'node node-wrapper.cjs {file}' } })
  writeFileSync(join(repo.root, 'node-wrapper.cjs'), `
    const { spawnSync } = require('node:child_process');
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'node-check.cjs'], { encoding: 'utf8', env });
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
  `)
  writeFileSync(join(repo.root, 'node-check.cjs'), `
    const { test } = require('node:test');
    const assert = require('node:assert/strict');
    test('observable result', { skip: Boolean(process.env.SKIP_TEST) }, () => assert.equal(process.env.BROKEN, undefined));
  `)
  const passed = repo.run()
  assert.equal(passed.status, 0, passed.stdout + passed.stderr)
  const result = repo.run(undefined, { BROKEN: '1' })
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stdout, /not ok 1 - observable result/)
  const skipped = repo.run(undefined, { SKIP_TEST: '1' })
  assert.equal(skipped.status, 2, skipped.stdout + skipped.stderr)
  assert.match(skipped.stdout, /# skipped 1/)
})

test('CLI requires execution evidence for both related JS runner selections', (t) => {
  const repo = fixture(t)
  const yarn = join(repo.root, 'bin/yarn')
  writeFileSync(yarn, `#!${process.execPath}\nif(process.argv[2] !== 'eslint') console.log(process.env.TEST_OUTPUT);\n`)
  chmodSync(yarn, 0o755)
  if (process.platform === 'win32') writeFileSync(`${yarn}.cmd`, `@"${process.execPath}" "${yarn}" %*\r\n`)
  writeFileSync(join(repo.root, 'app/main.ts'), 'export const value = 1\n')
  for (const [runner, summary] of [['jest', 'Tests: 1 passed, 1 total'], ['vitest', ' Tests 1 passed (1)']]) {
    writeFileSync(join(repo.root, 'package.json'), JSON.stringify({ packageManager: 'yarn@1.22.22', devDependencies: { eslint: '1', [runner]: '1' } }))
    const passed = repo.run(['app/main.ts'], { TEST_OUTPUT: summary })
    assert.equal(passed.status, 0, passed.stdout + passed.stderr)
    const incomplete = repo.run(['app/main.ts'], { TEST_OUTPUT: 'No tests found, exiting with code 0' })
    assert.equal(incomplete.status, 2, incomplete.stdout + incomplete.stderr)
  }
})

test('CLI applies suite, file, snapshot and error results before passing test counts', (t) => {
  const repo = fixture(t)
  for (const [output, expected] of [
    ['Test Suites: 1 failed, 1 passed, 2 total\nTests: 1 passed, 1 total', 1],
    [' Test Files 1 failed | 1 passed (2)\n Tests 1 passed (1)', 1],
    ['Test Suites: 1 skipped, 1 passed, 2 total\nTests: 1 passed, 1 total', 2],
    [' Tests 1 passed (1)\n Errors 1 error', 1],
    ['Snapshots: 1 failed, 1 total\nTests: 1 passed, 1 total', 1],
    ['Tests: 0 total\nTests: 1 passed, 1 total', 2],
    ['Tests: malformed summary\nTests: 1 passed, 1 total', 2],
    ['Tests:\nTests: 1 passed, 1 total', 2],
    [' Test Files\n Tests 1 passed (1)', 2],
    [' Tests 1 passed (1)\n Errors', 2],
    [' Tests 1 passed (1)\n Test Files 1 skipped | 1 passed (2)', 2],
    ['Tests: 1 passed, 1 total\nSnapshots: 1 skipped, 1 passed, 2 total', 2],
    ['# fail 1\nTests: 1 passed, 1 total', 1],
    ['Tests: malformed summary\nTests: 1 failed, 1 total', 1],
    [' Test Files 0 total\n Tests 1 passed (1)', 2],
    ['Test Suites: malformed summary\nTests: 1 passed, 1 total', 2],
    [' Tests 1 passed (1)\n Errors unknown', 2],
    ['Snapshots: malformed summary\nTests: 1 passed, 1 total', 2],
    ['Snapshots: 0 total\nTests: 1 passed, 1 total', 0],
    ['Test Suites: 1 passed, 1 total\nTests: 1 passed, 1 total', 0],
    [' Test Files 1 passed (1)\n Tests 1 passed (1)\n Errors 0 errors', 0],
    ['Test Suites: 1 passed, 1 total', 2],
    [' Test Files 1 passed (1)', 2],
    ['Snapshots: 1 passed, 1 total', 2],
    [' Errors 0 errors', 2],
  ]) {
    const result = repo.run(undefined, { TEST_OUTPUT: output })
    assert.equal(result.status, expected, `${JSON.stringify(output)}\n${result.stdout}${result.stderr}`)
  }
})
