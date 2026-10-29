// Inspect or manage one explicitly configured local Docker daemon. No global context changes.
// Usage: node docker-daemon.mjs [status|start|stop] [repo-root] [--execute]
// Exit 0 ready/action completed, 1 invalid configuration or failed action, 2 unreachable status.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCommand } from './run-command.mjs'

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const actions = ['status', 'start', 'stop']

export const validateDockerSettings = (settings) => {
  if (!object(settings) || !object(settings.docker)) throw new Error('docker must be an object in .haechi.json')
  const config = settings.docker
  if (typeof config.context !== 'string' || !config.context.trim() || /^-|[\u0000-\u001f\u007f]/.test(config.context)) {
    throw new Error('docker.context must be a nonempty context name without control characters or a leading -')
  }
  for (const action of ['start', 'stop']) {
    if (config[action] !== undefined && (typeof config[action] !== 'string' || !config[action].trim() || config[action].includes('\0'))) {
      throw new Error(`docker.${action} must be a nonempty command when configured`)
    }
  }
  return config
}

export const parseArgs = (argv) => {
  const options = { action: 'status', root: process.cwd(), execute: false }
  const positional = []
  for (const arg of argv) {
    if (arg === '--execute' && !options.execute) options.execute = true
    else if (arg.startsWith('--')) throw new Error(`unknown or repeated option: ${arg}`)
    else positional.push(arg)
  }
  if (positional.length) {
    options.action = positional.shift()
    if (!actions.includes(options.action)) throw new Error(`unknown Docker action: ${options.action}`)
  }
  if (positional.length > 1) throw new Error('Usage: docker-daemon.mjs [status|start|stop] [repo-root] [--execute]')
  if (positional.length) options.root = resolve(positional[0])
  if (options.action === 'status' && options.execute) throw new Error('--execute applies only to start or stop')
  return options
}

const pause = (ms) => new Promise((done) => setTimeout(done, ms))
const detail = (result) => (result.error || result.stderr || 'Docker did not answer successfully').trim()
const localEndpoint = (endpoint) =>
  /^unix:\/\/\/[^\0\r\n?#]+$/.test(endpoint) || /^npipe:\/\/\/\/\.\/pipe\/[^/\\\0\r\n?#]+$/.test(endpoint)

// The injected executor and clock make ordering, failures and timeouts testable without a live daemon.
export const manageDocker = async (action, settings, {
  root = process.cwd(), execute = false, run = runCommand, sleep = pause, now = Date.now,
  commandTimeoutMs = 60000, probeTimeoutMs = 5000, readinessTimeoutMs = 45000, pollIntervalMs = 1000,
} = {}) => {
  const config = validateDockerSettings(settings)
  if (!actions.includes(action)) throw new Error(`unknown Docker action: ${action}`)
  if (action === 'status' && execute) throw new Error('--execute applies only to start or stop')
  if (action !== 'status') {
    if (!execute) throw new Error(`${action} requires --execute; inspect status first and reuse the session's authorization`)
    if (!config[action]) throw new Error(`docker.${action} is not configured`)
  }
  for (const [name, value] of Object.entries({ commandTimeoutMs, probeTimeoutMs, readinessTimeoutMs, pollIntervalMs })) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`)
  }
  const env = { ...process.env, DOCKER_CONTEXT: config.context }
  const docker = (args, timeout = probeTimeoutMs) => run('docker', ['--context', config.context, ...args], { cwd: root, env, timeout })
  const inspected = await docker(['context', 'inspect', config.context])
  if (inspected.status !== 0) throw new Error(`Cannot inspect Docker context ${config.context}: ${detail(inspected)}`)
  let contexts
  try { contexts = JSON.parse(inspected.stdout) }
  catch { throw new Error('docker context inspect returned invalid JSON') }
  const context = Array.isArray(contexts) && contexts.length === 1 ? contexts[0] : undefined
  const endpoint = context?.Endpoints?.docker?.Host
  if (context?.Name !== config.context || typeof endpoint !== 'string' || !endpoint) {
    throw new Error('docker context inspect did not return the configured context and endpoint')
  }
  if (action !== 'status' && !localEndpoint(endpoint)) {
    throw new Error('start/stop require a local unix:/// socket or npipe:////./pipe/ endpoint; remote daemons are not managed')
  }
  const info = (timeout) => docker(['info'], timeout)
  const initial = await info()
  const ready = initial.status === 0
  const result = { action, context: config.context, endpoint, state: ready ? 'ready' : 'unreachable', changed: false }
  if (action === 'status') {
    return { ...result, exitCode: ready ? 0 : 2, ...(!ready && { message: `Daemon unreachable; this does not prove it is stopped. ${detail(initial)}` }) }
  }
  if (action === 'start' && ready) return { ...result, exitCode: 0, message: 'Daemon already ready; start command was not run.' }
  if (action === 'stop') {
    if (!ready) throw new Error(`Daemon unreachable; cannot verify running containers, so no stop command was run. ${detail(initial)}`)
    const containers = await docker(['container', 'ls', '--quiet'])
    if (containers.status !== 0) throw new Error(`Cannot check running containers; no stop command was run. ${detail(containers)}`)
    if (containers.stdout.trim()) throw new Error('Running containers exist; no stop command was run. Stop only task-owned containers separately if authorized.')
  }
  const command = await run(config[action], [], { cwd: root, env, timeout: commandTimeoutMs, shell: true })
  if (command.status !== 0) throw new Error(`Configured Docker ${action} command failed: ${detail(command)}`)
  const deadline = now() + readinessTimeoutMs
  let observed
  do {
    observed = await info(Math.min(probeTimeoutMs, Math.max(1, deadline - now())))
    if (action === 'start' ? observed.status === 0 : observed.status !== 0) {
      return {
        ...result, state: action === 'start' ? 'ready' : 'unreachable', changed: true, exitCode: 0,
        message: action === 'start' ? 'Daemon is ready after the start command.'
          : 'Stop command completed and daemon is unreachable; the service stopped state is not independently confirmed.',
      }
    }
    const remaining = deadline - now()
    if (remaining <= 0) break
    await sleep(Math.min(pollIntervalMs, remaining))
  } while (now() < deadline)
  throw new Error(action === 'start'
    ? `Timed out waiting for Docker readiness after start. ${detail(observed)}`
    : 'Timed out after stop: Docker still answers successfully.')
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  const settings = JSON.parse(readFileSync(resolve(options.root, '.haechi.json'), 'utf8'))
  const result = await manageDocker(options.action, settings, options)
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.exitCode
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`docker-daemon: ${error.message}`)
    process.exitCode = 1
  })
}
