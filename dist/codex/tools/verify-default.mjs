// Default changed-files verifier for repos without one: lint the changed files and run the tests related to them.
// Usage: node verify-default.mjs [--python-test-map <json>] [--test-one <command>] [--] [file ...]
// planChecks() is pure; main() finds the files and runs the plan.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'







const EXEC                         = { yarn: 'yarn', pnpm: 'pnpm exec', npm: 'npx', bun: 'bunx' }
const PY_PREFIX                         = { uv: 'uv run ', poetry: 'poetry run ', pip: '' }

const JS_FILE = /\.[cm]?[jt]sx?$/
const PY_FILE = /\.py$/
const PY_TEST = /(^|\/)(test_[^/]+|[^/]+_test)\.py$/

const quote = (path        ) => (/[\s"]/.test(path) ? `"${path.replaceAll('"', '\\"')}"` : path)
const list = (files          ) => files.map(quote).join(' ')

const testCommand = (template        , file        ) => template.replace(/"(?:\\.|[^"\\])*"|'[^']*'|\{file\}/g, (part) => {
  if (part === '{file}') return quote(file)
  return part.replaceAll('{file}', (_        , index        ) => {
    const before = part[index - 1]
    if (!['"', "'"].includes(before) || part[index + 6] !== before || part[index - 2] === '\\') {
      throw new Error('commands.testOne: quote {file} separately inside a quoted shell snippet')
    }
    // Keep both quote layers: sh -c "pytest '{file}'" must retain the inner single quotes.
    return file
  })
})

// Callers supply trusted commands. Interpolated paths must stay literal on POSIX and Windows shells.
const checkPath                                                                                = (path, label, directory = false) => {
  const parts = typeof path === 'string' ? (directory ? path.replace(/\/$/, '') : path).split('/') : []
  if (!parts.length || !/^[\p{L}\p{N}_. /@+-]+$/u.test(path          ) || /^[-@]/.test(path          ) ||
      parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${label}: expected a relative path using letters, numbers, spaces, ., _, /, @, + or -`)
  }
}

const object = (value         )                                   => value !== null && typeof value === 'object' && !Array.isArray(value)
const checkSettings = (settings         )                      => {
  if (!object(settings)) throw new Error('settings must be a JSON object')
  if (settings.commands !== undefined && !object(settings.commands)) throw new Error('settings.commands must be an object')
  const command = (settings.commands                                       )?.testOne
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
export const planChecks = (files          , tools       , settings           = {}) => {
  const map = checkSettings(settings)
  const plan              = []
  const skipped = []
  const js = files.filter((file) => JS_FILE.test(file))
  const py = files.filter((file) => PY_FILE.test(file))
  for (const file of py) checkPath(file, 'changed file path')
  const exec = EXEC[tools.pm] ?? 'npx'
  if (js.length && tools.js.eslint) plan.push({ name: 'eslint', command: `${exec} eslint ${list(js)}` })
  if (js.length && tools.js.vitest) plan.push({ name: 'vitest related', test: true, command: `${exec} vitest related --run ${list(js)}` })
  else if (js.length && tools.js.jest) plan.push({ name: 'jest related', test: true, command: `${exec} jest --findRelatedTests ${list(js)} --passWithNoTests` })
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
      plan.push({ name: `Python test: ${file}`, test: true, command })
    }
  } else if (pythonTests.length && tools.py.pytest) plan.push({ name: 'pytest', test: true, command: `${prefix}pytest ${list(pythonTests)}` })
  if (js.length && !tools.js.eslint) skipped.push('no eslint for JS/TS files')
  if (js.length && !tools.js.vitest && !tools.js.jest) skipped.push('no vitest or jest for JS/TS files')
  if (py.length && !tools.py.ruff) skipped.push('no ruff for Python files')
  if (py.length && !tools.py.pytest && !settings.commands?.testOne) skipped.push('no pytest or commands.testOne for Python files')
  return { plan, skipped, pythonTests }
}

export const detectTools = (root        ) => {
  const read = (path        ) => (existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : '')
  const pkg = (read('package.json') ? JSON.parse(read('package.json')) : {})
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

const changedFiles = (root        ) => {
  const run = (args          ) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).split('\0').filter(Boolean)
  const files = new Set([...run(['diff', '--name-only', '-z', '--diff-filter=d', 'HEAD']), ...run(['ls-files', '-z', '-o', '--exclude-standard'])])
  return [...files].filter((file) => existsSync(join(root, file)))
}

// Recognize runner summaries, not arbitrary "passed" text. Unknown output stays unverified.
// These counts attest execution only; the caller still checks behavior coverage and final-change validity.
const testEvidence = (output        )             => {
  const text = output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replaceAll('\r', '')
  const summaries               = []
  let executed = false
  const record = (status            , testCases = false) => {
    summaries.push(status)
    if (testCases && status === 'passed') executed = true
  }
  const counts = (body        , total         )             => {
    const values = { passed: 0, failed: 0, skipped: 0 }
    const seen = new Set        ()
    let valid = true
    for (const token of body.split(/\s*[,|]\s*/)) {
      const match = token.trim().match(/^(\d+)\s+(passed|failed|skipped|todo|xfailed|xpassed|deselected|errors?|warnings?)$/)
      if (!match) { valid = false; continue }
      const [, count, kind] = match
      if (seen.has(kind)) valid = false
      seen.add(kind)
      const value = Number(count)
      if (kind === 'passed') values.passed += value
      else if (kind === 'failed' || /^errors?$/.test(kind)) values.failed += value
      else if (!/^warnings?$/.test(kind)) values.skipped += value
    }
    if (values.failed) return 'failed'
    if (!valid || (total !== undefined && values.passed + values.failed + values.skipped !== total)) return 'unverified'
    return values.skipped || !values.passed ? 'unverified' : 'passed'
  }
  for (const line of text.split('\n')) {
    const jest = line.match(/^\s*(Tests|Test Suites|Snapshots):\s*(.*)$/)
    if (jest) {
      const [, kind, body] = jest
      const summary = body.match(/^(?:(.+),\s+)?(\d+) total\s*$/)
      const status = !summary ? counts(body) === 'failed' ? 'failed' : 'unverified'
        : kind === 'Snapshots' && summary[2] === '0' && !summary[1] ? 'passed'
        : counts(summary[1] ?? '', Number(summary[2]))
      record(status, kind === 'Tests')
      continue
    }
    const vitest = line.match(/^\s*(Tests|Test Files)(?:\s+(.*))?\s*$/)
    if (vitest) {
      const [, kind, body] = vitest
      const summary = (body ?? '').match(/^(.+?)\s+\((\d+)\)\s*$/)
      record(summary ? counts(summary[1], Number(summary[2])) : 'unverified', kind === 'Tests')
      continue
    }
    const errors = line.match(/^\s*Errors(?:\s+(.*))?\s*$/)
    if (errors) {
      const summary = (errors[1] ?? '').match(/^(\d+) errors?\s*$/)
      record(!summary ? 'unverified' : Number(summary[1]) > 0 ? 'failed' : 'passed')
      continue
    }
    // pytest's default and quiet terminal summaries; extra unknown statuses cannot imply a pass.
    const pytest = line.replace(/^=+\s*|\s*=+$/g, '').match(/^(.+?) in \d+(?:\.\d+)?s(?: \([^)]*\))?$/)
    if (pytest) record(counts(pytest[1]), true)
  }
  if (/^# (?:tests|pass|fail|cancelled|skipped|todo) /m.test(text)) {
    const keys = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']
    let failed = false
    const tap = Object.fromEntries(keys.map((key) => {
      const matches = [...text.matchAll(new RegExp(`^# ${key} (\\d+)$`, 'gm'))]
      if (['fail', 'cancelled'].includes(key) && matches.some((match) => Number(match[1]) > 0)) failed = true
      return [key, matches.length === 1 ? Number(matches[0][1]) : undefined]
    }))
    if (failed) record('failed')
    else if (keys.some((key) => tap[key] === undefined) || tap.tests !== tap.pass  + tap.fail  + tap.cancelled  + tap.skipped  + tap.todo ) record('unverified')
    else record(tap.pass  > 0 && tap.skipped === 0 && tap.todo === 0 ? 'passed' : 'unverified', true)
  }
  if (summaries.includes('failed')) return 'failed'
  if (/no tests (?:found|collected)|collected 0 items/i.test(text)) return 'unverified'
  return executed && summaries.every((status) => status === 'passed') ? 'passed' : 'unverified'
}

const main = () => {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { 'python-test-map': { type: 'string' }, 'test-one': { type: 'string' } },
  })
  const files = positionals.length ? positionals : changedFiles(root)
  if (!files.length) {
    console.log('verify-default: no changed files')
    return
  }
  let pythonTestMap
  try {
    pythonTestMap = values['python-test-map'] === undefined ? undefined : JSON.parse(values['python-test-map'])
  } catch {
    throw new Error('--python-test-map must contain a valid JSON array')
  }
  const settings = { pythonTestMap, commands: { testOne: values['test-one'] } }
  const { plan, skipped, pythonTests } = planChecks(files, detectTools(root), settings)
  for (const file of pythonTests) {
    const path = join(root, file)
    if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`selected test file does not exist: ${file}`)
    const resolved = relative(realpathSync(root), realpathSync(path))
    if (resolved === '..' || resolved.startsWith(`..${sep}`) || isAbsolute(resolved)) throw new Error(`selected test file is outside the repository: ${file}`)
  }
  for (const reason of skipped) console.log(`verify-default: unverified — ${reason}`)
  let failed = 0
  let exitedSuccessfully = 0
  let unverified = skipped.length
  for (const step of plan) {
    console.log(`\nverify-default: ${step.name}\n$ ${step.command}`)
    // shell: package-manager shims are .cmd files on Windows. Preserve both streams for inspection.
    const result = spawnSync(step.command, { cwd: root, encoding: 'utf8', shell: true, maxBuffer: 16 * 1024 * 1024 })
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    if (result.error) console.error(`verify-default: ${result.error.message}`)
    if (result.status === 0 && !result.error) exitedSuccessfully += 1
    const status = result.status !== 0 || result.error ? 'failed'
      : step.test ? testEvidence(`${result.stdout}\n${result.stderr}`) : 'passed'
    if (status === 'failed') failed += 1
    if (status === 'unverified') unverified += 1
    console.log(`verify-default: ${step.name} ${status}${status === 'unverified' ? ' — test execution evidence is missing or incomplete' : ''}`)
  }
  const status = failed ? 'failed' : unverified ? 'incomplete' : 'passed'
  console.log(`\nverify-default: checks ${status}; ${exitedSuccessfully}/${plan.length} commands exited successfully for ${files.length} file(s)`)
  if (!plan.some((step) => step.test)) console.log('verify-default: no behavior tests ran; check which evidence this change requires.')
  console.log('verify-default: runner summaries do not prove acceptance coverage or task completion; review the evidence against the final change.')
  process.exitCode = failed ? 1 : unverified ? 2 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main() }
  catch (error) {
    console.error(`verify-default: ${(error         ).message}`)
    process.exitCode = 1
  }
}
