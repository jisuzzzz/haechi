import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { migrationSteps, parseMigrationArgs, runMigrations } from '../core/tools/migrate.mjs'
import { runCommand } from '../core/tools/run-command.mjs'

const tool = fileURLToPath(new URL('../core/tools/migrate.mjs', import.meta.url))
const configured = { migrations: { environment: 'test', plan: 'plan-db', apply: 'apply-db', check: 'check-db' } }

const fixture = (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'haechi-migrate-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(join(root, 'step.mjs'), `
import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
const step = process.argv[2]
appendFileSync('events.jsonl', JSON.stringify({ step, cwd: process.cwd(), token: process.env.MIGRATION_TEST_TOKEN }) + '\\n')
if (process.env.FAIL_STEP === step) process.exit(7)
if (step === 'apply') writeFileSync('applied', 'yes')
if (step === 'check' && process.env.REQUIRE_APPLIED === '1' && !existsSync('applied')) process.exit(9)
`)
  const command = (step) => `"${process.execPath}" step.mjs ${step}`
  writeFileSync(join(root, '.haechi.json'), JSON.stringify({ migrations: { environment: 'test', ...Object.fromEntries(['plan', 'apply', 'check'].map((step) => [step, command(step)])) } }))
  return {
    root,
    run: (args = [], env = {}) => spawnSync(process.execPath, [tool, ...args], { cwd: root, env: { ...process.env, MIGRATION_TEST_TOKEN: 'synthetic-value', ...env }, encoding: 'utf8', timeout: 10_000 }),
    events: () => existsSync(join(root, 'events.jsonl')) ? readFileSync(join(root, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse) : [],
  }
}

test('argument parsing defaults to plan and rejects ambiguous execution flags', () => {
  assert.deepEqual(parseMigrationArgs([]), { action: 'plan', root: process.cwd(), execute: false })
  assert.deepEqual(parseMigrationArgs(['apply', '.', '--execute']), { action: 'apply', root: resolve('.'), execute: true })
  for (const args of [['reset'], ['plan', '--execute'], ['apply', '--execute', '--execute'], ['check', 'a', 'b'], ['apply', '--force']]) {
    assert.throws(() => parseMigrationArgs(args))
  }
})

test('invalid migration settings fail before any command runs', async () => {
  const invalid = [null, [], {}, { migrations: null }, { migrations: [] },
    { migrations: { ...configured.migrations, environment: 'production' } },
    ...['plan', 'apply', 'check'].flatMap((name) => [undefined, null, '', '  ', 3, 'bad\0command'].map((value) => ({ migrations: { ...configured.migrations, [name]: value } }))),
  ]
  for (const settings of invalid) {
    let called = false
    await assert.rejects(() => runMigrations({ settings, action: 'apply', execute: true }, { run: () => { called = true }, print: () => {} }))
    assert.equal(called, false)
  }
  assert.deepEqual(migrationSteps({ migrations: { ...configured.migrations, environment: 'local' } }, 'plan'), [{ name: 'plan', command: 'plan-db' }])
})

test('default CLI action plans without applying', (t) => {
  const f = fixture(t)
  const result = f.run()
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(f.events().map(({ step }) => step), ['plan'])
  assert.equal(existsSync(join(f.root, 'applied')), false)
})

test('apply requires explicit execution intent before running even the plan', (t) => {
  const f = fixture(t)
  const result = f.run(['apply'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /requires --execute/)
  assert.deepEqual(f.events(), [])
})

test('apply runs plan, apply and check in the selected root with inherited environment', (t) => {
  const f = fixture(t)
  const result = f.run(['apply', f.root, '--execute'], { REQUIRE_APPLIED: '1' })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(f.events(), ['plan', 'apply', 'check'].map((step) => ({ step, cwd: f.root, token: 'synthetic-value' })))
  assert.match(result.stdout, /plan, apply, check passed/)
})

test('check runs only the completion check and propagates its failure', (t) => {
  const f = fixture(t)
  const result = f.run(['check'], { REQUIRE_APPLIED: '1' })
  assert.equal(result.status, 1)
  assert.deepEqual(f.events().map(({ step }) => step), ['check'])
  assert.equal(existsSync(join(f.root, 'applied')), false)
})

for (const [failed, expected] of [['plan', ['plan']], ['apply', ['plan', 'apply']], ['check', ['plan', 'apply', 'check']]]) {
  test(`failed ${failed} stops the workflow and cannot report success`, (t) => {
    const f = fixture(t)
    const result = f.run(['apply', '--execute'], { FAIL_STEP: failed })
    assert.equal(result.status, 1)
    assert.deepEqual(f.events().map(({ step }) => step), expected)
    assert.match(result.stdout, new RegExp(`${failed} failed \\(exit 7\\)`))
    assert.doesNotMatch(result.stdout, /apply complete/)
  })
}

test('timeouts, spawn errors and termination fail without retrying or running later steps', async () => {
  for (const result of [{ status: null, error: 'command timed out' }, { status: null, error: 'spawn failed: ENOENT' }, { status: null, signal: 'SIGTERM' }]) {
    const calls = []
    const outcome = await runMigrations({ settings: configured, action: 'apply', execute: true, root: '/repo' }, {
      run: async (command, args, options) => { calls.push({ command, args, options }); return result },
      print: () => {},
    })
    assert.deepEqual(outcome, { code: 1, action: 'apply', completed: [], failed: 'plan' })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].options.timeout, 300_000)
    assert.deepEqual(calls[0].args, [])
    assert.equal(calls[0].options.cwd, '/repo')
  }
})

test('a real timed-out shell command fails and warns that remote cancellation is not proven', { skip: process.platform === 'win32' }, async (t) => {
  const f = fixture(t)
  writeFileSync(join(f.root, 'hang.mjs'), 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)\n')
  const settings = { migrations: { ...configured.migrations, plan: `exec "${process.execPath}" hang.mjs` } }
  const calls = []
  const output = []
  const result = await runMigrations({ settings, action: 'apply', execute: true, root: f.root }, {
    run: (command, args, options) => {
      calls.push(command)
      return runCommand(command, args, { ...options, timeout: 100 })
    },
    print: (line) => output.push(line),
  })
  assert.deepEqual(result, { code: 1, action: 'apply', completed: [], failed: 'plan' })
  assert.deepEqual(calls, [settings.migrations.plan])
  assert.match(output.join('\n'), /timed out/)
  assert.match(output.join('\n'), /may still be running/)
})

test('timing out a shell kills its database-client child before a delayed write', { skip: process.platform === 'win32' }, async (t) => {
  const f = fixture(t)
  writeFileSync(join(f.root, 'late.mjs'), 'import { writeFileSync } from "node:fs"; writeFileSync("started", "yes"); setTimeout(() => writeFileSync("late-write", "bad"), 900)\n')
  const settings = { migrations: { ...configured.migrations, apply: `"${process.execPath}" late.mjs & wait` } }
  const calls = []
  const result = await runMigrations({ settings, action: 'apply', execute: true, root: f.root }, {
    run: async (command, args, options) => {
      calls.push(command)
      if (command === settings.migrations.plan) return { status: 0 }
      return runCommand(command, args, { ...options, timeout: 500 })
    },
    print: () => {},
  })
  assert.deepEqual(result, { code: 1, action: 'apply', completed: ['plan'], failed: 'apply' })
  assert.deepEqual(calls, [settings.migrations.plan, settings.migrations.apply])
  assert.equal(existsSync(join(f.root, 'started')), true, 'the child was running before the timeout')
  await new Promise((resolve) => setTimeout(resolve, 1000))
  assert.equal(existsSync(join(f.root, 'late-write')), false, 'a timed-out apply must not keep writing from its shell child')
})

test('invalid JSON and invalid CLI arguments execute no migration commands', (t) => {
  const f = fixture(t)
  writeFileSync(join(f.root, '.haechi.json'), '{bad JSON')
  assert.equal(f.run(['apply', '--execute']).status, 1)
  assert.equal(f.run(['drop']).status, 1)
  assert.deepEqual(f.events(), [])
})
