// Default changed-files verifier for repos without one: lint the changed files and run the tests related to them.
// Usage: node verify-default.mjs [file ...]   (no files → changed and untracked files against HEAD)
// planChecks() is pure; main() finds the files and runs the plan.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const EXEC = { yarn: 'yarn', pnpm: 'pnpm exec', npm: 'npx', bun: 'bunx' }
const PY_PREFIX = { uv: 'uv run ', poetry: 'poetry run ', pip: '' }

const JS_FILE = /\.[cm]?[jt]sx?$/
const PY_FILE = /\.py$/
const PY_TEST = /(^|\/)(test_[^/]+|[^/]+_test)\.py$/

const quote = (path) => (/[\s"]/.test(path) ? `"${path.replaceAll('"', '\\"')}"` : path)
const list = (files) => files.map(quote).join(' ')

const testCommand = (template, file) => template.replace(/"(?:\\.|[^"\\])*"|'[^']*'|\{file\}/g, (part) => {
  if (part === '{file}') return quote(file)
  return part.replaceAll('{file}', (_, index) => {
    const before = part[index - 1]
    if (!['"', "'"].includes(before) || part[index + 6] !== before || part[index - 2] === '\\') {
      throw new Error('commands.testOne: quote {file} separately inside a quoted shell snippet')
    }
    // Keep both quote layers: sh -c "pytest '{file}'" must retain the inner single quotes.
    return file
  })
})

// Commands are repository settings, but interpolated paths must stay literal on POSIX and Windows shells.
const checkPath = (path, label, directory = false) => {
  const parts = typeof path === 'string' ? (directory ? path.replace(/\/$/, '') : path).split('/') : []
  if (!parts.length || !/^[\p{L}\p{N}_. /@+-]+$/u.test(path) || /^[-@]/.test(path) ||
      parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${label}: expected a relative path using letters, numbers, spaces, ., _, /, @, + or -`)
  }
}

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const checkSettings = (settings) => {
  if (!object(settings)) throw new Error('settings must be a JSON object')
  if (settings.commands !== undefined && !object(settings.commands)) throw new Error('settings.commands must be an object')
  const command = settings.commands?.testOne
  if (command !== undefined && (typeof command !== 'string' || !command.includes('{file}'))) {
    throw new Error('commands.testOne must be a command containing {file}')
  }
  const map = settings.pythonTestMap ?? []
  if (settings.pythonTestMap === null || !Array.isArray(map)) throw new Error('pythonTestMap must be an array')
  for (const [index, entry] of map.entries()) {
    const label = `pythonTestMap[${index}]`
    if (!object(entry) || !Array.isArray(entry.tests) || !entry.tests.length) throw new Error(`${label} needs source and a nonempty tests array`)
    checkPath(entry.source, `${label}.source`, true)
    for (const file of entry.tests) {
      checkPath(file, `${label}.tests path`)
      if (!PY_FILE.test(file)) throw new Error(`${label}.tests path must be a Python file`)
    }
  }
  return map
}

// tools: { pm, js: { eslint, vitest, jest }, py: { runner, ruff, pytest } }
export const planChecks = (files, tools, settings = {}) => {
  const map = checkSettings(settings)
  const plan = []
  const skipped = []
  const js = files.filter((file) => JS_FILE.test(file))
  const py = files.filter((file) => PY_FILE.test(file))
  for (const file of py) checkPath(file, 'changed file path')
  const exec = EXEC[tools.pm] ?? 'npx'
  if (js.length && tools.js.eslint) plan.push({ name: 'eslint', command: `${exec} eslint ${list(js)}` })
  if (js.length && tools.js.vitest) plan.push({ name: 'vitest related', command: `${exec} vitest related --run ${list(js)}` })
  else if (js.length && tools.js.jest) plan.push({ name: 'jest related', command: `${exec} jest --findRelatedTests ${list(js)} --passWithNoTests` })
  const prefix = PY_PREFIX[tools.py.runner] ?? ''
  if (py.length && tools.py.ruff) plan.push({ name: 'ruff', command: `${prefix}ruff check ${list(py)}` })
  const selected = new Set(py.filter((file) => PY_TEST.test(file)))
  for (const file of py) {
    const matches = map.filter(({ source }) => source.endsWith('/') ? file.startsWith(source) : file === source)
    for (const entry of matches) for (const test of entry.tests) selected.add(test)
    if (!PY_TEST.test(file) && !matches.length) skipped.push(`unmapped Python source: ${file}`)
  }
  const pythonTests = [...selected]
  if (pythonTests.length && settings.commands?.testOne) {
    for (const file of pythonTests) {
      const command = testCommand(settings.commands.testOne, file)
      plan.push({ name: `Python test: ${file}`, command })
    }
  } else if (pythonTests.length && tools.py.pytest) plan.push({ name: 'pytest', command: `${prefix}pytest ${list(pythonTests)}` })
  if (js.length && !tools.js.eslint) skipped.push('no eslint for JS/TS files')
  if (js.length && !tools.js.vitest && !tools.js.jest) skipped.push('no vitest or jest for JS/TS files')
  if (py.length && !tools.py.ruff) skipped.push('no ruff for Python files')
  if (py.length && !tools.py.pytest && !settings.commands?.testOne) skipped.push('no pytest or commands.testOne for Python files')
  return { plan, skipped, pythonTests }
}

export const detectTools = (root) => {
  const read = (path) => (existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : '')
  const pkg = read('package.json') ? JSON.parse(read('package.json')) : {}
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  const lock = [['yarn.lock', 'yarn'], ['pnpm-lock.yaml', 'pnpm'], ['bun.lockb', 'bun']].find(([file]) => existsSync(join(root, file)))
  const python = `${read('pyproject.toml')}\n${read('requirements.txt')}\n${read('requirements-dev.txt')}`.toLowerCase()
  return {
    pm: pkg.packageManager?.split('@')[0] ?? lock?.[1] ?? 'npm',
    js: { eslint: Boolean(deps.eslint), vitest: Boolean(deps.vitest), jest: Boolean(deps.jest) },
    py: {
      runner: existsSync(join(root, 'uv.lock')) ? 'uv' : existsSync(join(root, 'poetry.lock')) ? 'poetry' : 'pip',
      ruff: /\bruff\b/.test(python),
      pytest: /\bpytest\b/.test(python),
    },
  }
}

const changedFiles = (root) => {
  const run = (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).split('\0').filter(Boolean)
  const files = new Set([...run(['diff', '--name-only', '-z', '--diff-filter=d', 'HEAD']), ...run(['ls-files', '-z', '-o', '--exclude-standard'])])
  return [...files].filter((file) => existsSync(join(root, file)))
}

const main = () => {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const files = process.argv.slice(2).length ? process.argv.slice(2) : changedFiles(root)
  if (!files.length) {
    console.log('verify-default: no changed files')
    return
  }
  const settingsPath = join(root, '.haechi.json')
  let settings = {}
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')) }
    catch { throw new Error('.haechi.json must contain valid JSON settings') }
  }
  const { plan, skipped, pythonTests } = planChecks(files, detectTools(root), settings)
  for (const file of pythonTests) {
    const path = join(root, file)
    if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`selected test file does not exist: ${file}`)
    const resolved = relative(realpathSync(root), realpathSync(path))
    if (resolved === '..' || resolved.startsWith(`..${sep}`) || isAbsolute(resolved)) throw new Error(`selected test file is outside the repository: ${file}`)
  }
  for (const reason of skipped) console.log(`verify-default: unverified — ${reason}`)
  let failed = 0
  for (const step of plan) {
    console.log(`\nverify-default: ${step.name}\n$ ${step.command}`)
    // shell: package-manager shims are .cmd files on Windows
    const { status } = spawnSync(step.command, { cwd: root, stdio: 'inherit', shell: true })
    if (status !== 0) failed += 1
    console.log(`verify-default: ${step.name} ${status === 0 ? '✔' : '✖'}`)
  }
  const status = failed ? 'failed' : skipped.length ? 'incomplete' : 'complete'
  console.log(`\nverify-default: commands ${status}; ${plan.length - failed}/${plan.length} commands exited successfully for ${files.length} file(s)`)
  console.log('verify-default: successful commands do not prove tests were collected or executed; review the command output.')
  process.exitCode = failed ? 1 : skipped.length ? 2 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main() }
  catch (error) {
    console.error(`verify-default: ${error.message}`)
    process.exitCode = 1
  }
}
