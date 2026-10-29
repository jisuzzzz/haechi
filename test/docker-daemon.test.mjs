import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { manageDocker, parseArgs, validateDockerSettings } from '../core/tools/docker-daemon.mjs'

const settings = { docker: { context: 'local-test', start: 'provider start', stop: 'provider stop' } }
const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' })
const fail = (stderr = 'cannot connect') => ({ status: 1, stdout: '', stderr })
const inspection = (endpoint = 'unix:///var/run/docker.sock', name = 'local-test') => ok(JSON.stringify([
  { Name: name, Endpoints: { docker: { Host: endpoint } } },
]))

const harness = ({ endpoint, context = 'local-test', responses = [], fallback = fail() } = {}) => {
  const calls = []
  let elapsed = 0
  const queue = [inspection(endpoint, context), ...responses]
  return {
    calls,
    options: {
      root: '/test repo', execute: true, commandTimeoutMs: 100, probeTimeoutMs: 10,
      readinessTimeoutMs: 30, pollIntervalMs: 10,
      now: () => elapsed,
      sleep: async (ms) => { elapsed += ms },
      run: async (command, args, options) => {
        calls.push({ command, args, options })
        return queue.length ? queue.shift() : fallback
      },
    },
  }
}

test('CLI defaults to status and rejects unknown actions, repeated flags and extra paths', () => {
  assert.equal(parseArgs([]).action, 'status')
  assert.deepEqual(parseArgs(['start', 'example', '--execute']), { action: 'start', root: resolve('example'), execute: true })
  for (const args of [['restart'], ['status', 'one', 'two'], ['--execute', '--execute'], ['--unknown'], ['status', '--execute']]) {
    assert.throws(() => parseArgs(args), /unknown|Usage|only to start or stop/)
  }
})

test('invalid settings and missing action commands fail before any external command', async () => {
  const invalid = [null, [], {}, { docker: null }, { docker: [] }, { docker: {} },
    { docker: { context: '--host' } }, { docker: { context: 'line\nbreak' } },
    { docker: { context: 'local', start: '' } }, { docker: { context: 'local', stop: null } }]
  for (const config of invalid) {
    assert.throws(() => validateDockerSettings(config), /docker/)
    const runner = harness()
    await assert.rejects(manageDocker('start', config, runner.options), /docker/)
    assert.deepEqual(runner.calls, [])
  }
  for (const action of ['start', 'stop']) {
    const runner = harness()
    await assert.rejects(manageDocker(action, { docker: { context: 'local' } }, runner.options), /not configured/)
    assert.deepEqual(runner.calls, [])
  }
})

test('start and stop without --execute run zero commands', async () => {
  for (const action of ['start', 'stop']) {
    const runner = harness()
    await assert.rejects(manageDocker(action, settings, { ...runner.options, execute: false }), /requires --execute/)
    assert.deepEqual(runner.calls, [])
  }
})

test('status distinguishes ready from unreachable and does not claim a stopped daemon', async () => {
  for (const [probe, state, exitCode] of [[ok(), 'ready', 0], [fail(), 'unreachable', 2]]) {
    const runner = harness({ responses: [probe] })
    const result = await manageDocker('status', { docker: { context: 'local-test' } }, { ...runner.options, execute: false })
    assert.equal(result.state, state)
    assert.equal(result.exitCode, exitCode)
    assert.equal(result.changed, false)
    assert.equal(runner.calls.length, 2)
    if (exitCode === 2) assert.match(result.message, /does not prove it is stopped/)
  }
})

test('valid context punctuation is passed as a literal argument for Docker to validate', async () => {
  const runner = harness({ context: 'local+aks', responses: [ok()] })
  const result = await manageDocker('status', { docker: { context: 'local+aks' } }, { ...runner.options, execute: false })
  assert.equal(result.context, 'local+aks')
  for (const call of runner.calls) assert.deepEqual(call.args.slice(0, 2), ['--context', 'local+aks'])
})

test('context inspection failures and wrong or malformed contexts stop before probing', async () => {
  for (const response of [fail('context missing'), ok('{bad'), ok('{}'), inspection(undefined, 'different'), ok('[{"Name":"local-test"}]')]) {
    const calls = []
    await assert.rejects(manageDocker('start', settings, {
      execute: true, run: async (...args) => { calls.push(args); return response },
    }), /context|JSON/)
    assert.equal(calls.length, 1)
  }
})

test('start and stop refuse remote endpoints including Windows network pipes', async () => {
  for (const endpoint of ['ssh://remote', 'tcp://127.0.0.1:2375', 'npipe:////remote/pipe/docker_engine', 'unix://remote/socket', 'unix:///']) {
    for (const action of ['start', 'stop']) {
      const runner = harness({ endpoint })
      await assert.rejects(manageDocker(action, settings, runner.options), /local.*endpoint/)
      assert.equal(runner.calls.length, 1)
    }
  }
  const status = harness({ endpoint: 'ssh://remote', responses: [ok()] })
  assert.equal((await manageDocker('status', settings, { ...status.options, execute: false })).state, 'ready')
})

test('every Docker call pins context and provider commands receive its environment and cwd', async () => {
  const runner = harness({ responses: [fail(), ok(), fail(), ok()] })
  const result = await manageDocker('start', settings, runner.options)
  assert.equal(result.state, 'ready')
  assert.equal(result.changed, true)
  assert.deepEqual(runner.calls.map(({ command }) => command), ['docker', 'docker', 'provider start', 'docker', 'docker'])
  for (const call of runner.calls) {
    assert.equal(call.options.cwd, '/test repo')
    assert.equal(call.options.env.DOCKER_CONTEXT, 'local-test')
    if (call.command === 'docker') {
      assert.deepEqual(call.args.slice(0, 2), ['--context', 'local-test'])
      assert.ok(call.options.timeout <= 10)
      assert.notEqual(call.options.shell, true)
    } else {
      assert.equal(call.options.timeout, 100)
      assert.equal(call.options.shell, true)
    }
  }
})

test('ready daemon starts idempotently and local Windows named pipes are supported', async () => {
  for (const endpoint of ['unix:///var/run/docker.sock', 'npipe:////./pipe/docker_engine']) {
    const runner = harness({ endpoint, responses: [ok()] })
    const result = await manageDocker('start', settings, runner.options)
    assert.equal(result.state, 'ready')
    assert.equal(result.changed, false)
    assert.equal(runner.calls.length, 2)
  }
})

test('failed or timed-out start commands are not retried and do not poll readiness', async () => {
  for (const response of [fail('start failed'), { status: null, stdout: '', stderr: '', error: 'Command timed out' }]) {
    const runner = harness({ responses: [fail(), response] })
    await assert.rejects(manageDocker('start', settings, runner.options), /start command failed/)
    assert.equal(runner.calls.length, 3)
    assert.equal(runner.calls.filter(({ command }) => command === 'provider start').length, 1)
  }
})

test('start polls only within its readiness limit and reports an unavailable daemon as failure', async () => {
  const runner = harness({ responses: [fail(), ok()] })
  await assert.rejects(manageDocker('start', settings, runner.options), /Timed out waiting for Docker readiness/)
  assert.equal(runner.calls.length, 6)
  assert.equal(runner.calls.filter(({ command }) => command === 'provider start').length, 1)
})

test('stop refuses running containers and cannot bypass a failed container query', async () => {
  for (const response of [ok('abc123\ndef456\n'), fail('access denied')]) {
    const runner = harness({ responses: [ok(), response] })
    await assert.rejects(manageDocker('stop', settings, runner.options), /no stop command was run/)
    assert.equal(runner.calls.length, 3)
    assert.deepEqual(runner.calls.at(-1).args.slice(2), ['container', 'ls', '--quiet'])
  }
  const unreachable = harness({ responses: [fail()] })
  await assert.rejects(manageDocker('stop', settings, unreachable.options), /cannot verify running containers/)
  assert.equal(unreachable.calls.length, 2)
})

test('successful stop reports its evidence as unreachable without claiming the service stopped', async () => {
  const runner = harness({ responses: [ok(), ok(), ok(), ok(), fail()] })
  const result = await manageDocker('stop', settings, runner.options)
  assert.equal(result.state, 'unreachable')
  assert.equal(result.exitCode, 0)
  assert.equal(result.changed, true)
  assert.match(result.message, /stopped state is not independently confirmed/)
  assert.equal(runner.calls.filter(({ command }) => command === 'provider stop').length, 1)
})

test('stop command failure and a still-responsive daemon are failures without mutation retries', async () => {
  const failed = harness({ responses: [ok(), ok(), fail('stop failed')] })
  await assert.rejects(manageDocker('stop', settings, failed.options), /stop command failed/)
  assert.equal(failed.calls.length, 4)
  const responsive = harness({ responses: [ok(), ok(), ok()], fallback: ok() })
  await assert.rejects(manageDocker('stop', settings, responsive.options), /Timed out after stop/)
  assert.equal(responsive.calls.filter(({ command }) => command === 'provider stop').length, 1)
})

const cli = fileURLToPath(new URL('../core/tools/docker-daemon.mjs', import.meta.url))
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`

test('CLI executes provider then readiness checks in the selected repo without changing the global context', { skip: process.platform === 'win32' }, (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'haechi-docker-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const root = join(scratch, 'repo with spaces')
  const bin = join(scratch, 'bin')
  mkdirSync(root)
  mkdirSync(bin)
  writeFileSync(join(root, 'state.json'), JSON.stringify({ ready: false }))
  writeFileSync(join(root, 'calls.jsonl'), '')
  const record = `const fs=require('node:fs');const args=process.argv.slice(2);const state=JSON.parse(fs.readFileSync('state.json','utf8'));fs.appendFileSync('calls.jsonl',JSON.stringify({args,cwd:process.cwd(),context:process.env.DOCKER_CONTEXT,host:process.env.DOCKER_HOST})+'\\n');`
  writeFileSync(join(bin, 'docker'), `#!${process.execPath}\n${record}if(args[0]!=='--context'||args[1]!=='local-test')process.exit(4);if(args[2]==='context')console.log(JSON.stringify([{Name:'local-test',Endpoints:{docker:{Host:'unix:///fake/docker.sock'}}}]));else if(args[2]==='info')process.exit(state.ready?0:1);else if(args[2]!=='container')process.exit(5);\n`)
  chmodSync(join(bin, 'docker'), 0o755)
  const provider = join(root, 'provider.cjs')
  writeFileSync(provider, `${record}state.ready=args[0]==='start';fs.writeFileSync('state.json',JSON.stringify(state));\n`)
  writeFileSync(join(root, '.haechi.json'), JSON.stringify({ docker: {
    context: 'local-test', start: `${shellQuote(process.execPath)} ${shellQuote(provider)} start`,
    stop: `${shellQuote(process.execPath)} ${shellQuote(provider)} stop`,
  } }))
  const env = { ...process.env, PATH: [bin, process.env.PATH].join(delimiter), DOCKER_CONTEXT: 'unrelated-context', DOCKER_HOST: 'tcp://unrelated:2375' }
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: scratch, env, encoding: 'utf8' })
  const denied = run('start', root)
  assert.equal(denied.status, 1)
  assert.equal(readFileSync(join(root, 'calls.jsonl'), 'utf8'), '')
  const started = run('start', root, '--execute')
  assert.equal(started.status, 0, started.stdout + started.stderr)
  assert.equal(JSON.parse(started.stdout).state, 'ready')
  const again = run('start', root, '--execute')
  assert.equal(again.status, 0, again.stderr)
  assert.equal(JSON.parse(again.stdout).changed, false)
  const stopped = run('stop', root, '--execute')
  assert.equal(stopped.status, 0, stopped.stderr)
  assert.equal(JSON.parse(stopped.stdout).state, 'unreachable')
  assert.equal(run('status', root).status, 2)
  const calls = readFileSync(join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  assert.deepEqual(calls.map(({ args }) => args[0] === '--context' ? args[2] : args[0]), [
    'context', 'info', 'start', 'info', 'context', 'info', 'context', 'info', 'container', 'stop', 'info', 'context', 'info',
  ])
  for (const call of calls) {
    assert.equal(call.cwd, realpathSync(root))
    assert.equal(call.context, 'local-test')
    assert.equal(call.host, 'tcp://unrelated:2375')
  }
  assert.equal(env.DOCKER_CONTEXT, 'unrelated-context')
})
