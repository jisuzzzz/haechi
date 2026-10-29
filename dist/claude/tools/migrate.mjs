// Explicit repository migration workflow. The default verifier never invokes this tool.
// Usage: node migrate.mjs [plan|check|apply] [repo-root] [--execute]
// plan/check run the configured command. apply requires --execute and runs plan → apply → check.
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCommand } from './run-command.mjs'

const ACTIONS = ['plan', 'check', 'apply']
const COMMAND_TIMEOUT_MS = 5 * 60_000
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

export const parseMigrationArgs = (argv) => {
  const args = [...argv]
  const action = args.length ? args.shift() : 'plan'
  if (!ACTIONS.includes(action)) throw new Error('expected plan, check or apply')
  let root
  let execute = false
  for (const arg of args) {
    if (arg === '--execute' && !execute) execute = true
    else if (!arg.startsWith('-') && root === undefined) root = arg
    else throw new Error(`unknown or repeated argument: ${arg}`)
  }
  if (execute && action !== 'apply') throw new Error('--execute is only used with apply')
  return { action, root: resolve(root ?? process.cwd()), execute }
}

export const migrationSteps = (settings, action, execute = false) => {
  if (!object(settings)) throw new Error('.haechi.json must contain an object')
  if (!ACTIONS.includes(action)) throw new Error('expected plan, check or apply')
  const config = settings.migrations
  if (!object(config)) throw new Error('migrations must configure environment, plan, apply and check')
  if (!['local', 'test'].includes(config.environment)) throw new Error('migrations.environment must be local or test')
  for (const name of ['plan', 'apply', 'check']) {
    if (typeof config[name] !== 'string' || !config[name].trim() || config[name].includes('\0')) {
      throw new Error(`migrations.${name} must be a nonempty command without NUL characters`)
    }
  }
  if (action === 'apply' && !execute) throw new Error('apply requires --execute; review the plan and confirm the database target first')
  return (action === 'apply' ? ['plan', 'apply', 'check'] : [action]).map((name) => ({ name, command: config[name] }))
}

// Repository commands are trusted configuration. Keep the environment and wrappers intact;
// do not interpolate a database name, credentials or other CLI input into their shell text.
export const runMigrations = async ({ settings, action = 'plan', execute = false, root = process.cwd() }, {
  run = runCommand,
  print = console.log,
} = {}) => {
  const steps = migrationSteps(settings, action, execute)
  const completed = []
  print(`migrate: ${action}; declared environment ${settings.migrations.environment}`)
  for (const step of steps) {
    print(`migrate: running ${step.name}`)
    const result = await run(step.command, [], {
      cwd: root,
      env: process.env,
      shell: true,
      stdio: 'inherit',
      timeout: COMMAND_TIMEOUT_MS,
    })
    if (result.error || result.status !== 0) {
      const reason = result.error || (result.signal ? `terminated by ${result.signal}` : `exit ${result.status}`)
      print(`migrate: ${step.name} failed (${reason}); remaining steps were not run`)
      if (/timed out|timeout/i.test(result.error ?? '')) print('migrate: detached processes, container commands or database queries may still be running; confirm they stopped before any retry')
      if (step.name === 'apply') print('migrate: database changes may be partial; inspect migration state before any retry')
      return { code: 1, action, completed, failed: step.name }
    }
    completed.push(step.name)
  }
  print(`migrate: ${action} complete; ${completed.join(', ')} passed`)
  return { code: 0, action, completed }
}

const main = async () => {
  const args = parseMigrationArgs(process.argv.slice(2))
  let settings
  try { settings = JSON.parse(readFileSync(join(args.root, '.haechi.json'), 'utf8')) }
  catch { throw new Error('cannot read valid JSON from .haechi.json in the selected repository') }
  return runMigrations({ ...args, settings })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { process.exitCode = (await main()).code }
  catch (error) {
    console.error(`migrate: ${error.message}`)
    process.exitCode = 1
  }
}
