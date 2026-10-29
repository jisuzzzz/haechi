// Default changed-files verifier for repos without one: lint the changed files and run the tests related to them.
// Usage: node verify-default.mjs [file ...]   (no files → changed and untracked files against HEAD)
// planChecks() is pure; main() finds the files and runs the plan.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const EXEC = { yarn: 'yarn', pnpm: 'pnpm exec', npm: 'npx', bun: 'bunx' }
const PY_PREFIX = { uv: 'uv run ', poetry: 'poetry run ', pip: '' }

const JS_FILE = /\.[cm]?[jt]sx?$/
const PY_FILE = /\.py$/
const PY_TEST = /(^|\/)(test_[^/]+|[^/]+_test)\.py$/

const quote = (path) => (/[\s"]/.test(path) ? `"${path.replaceAll('"', '\\"')}"` : path)
const list = (files) => files.map(quote).join(' ')

// tools: { pm, js: { eslint, vitest, jest }, py: { runner, ruff, pytest } }
export const planChecks = (files, tools) => {
  const plan = []
  const js = files.filter((file) => JS_FILE.test(file))
  const py = files.filter((file) => PY_FILE.test(file))
  const exec = EXEC[tools.pm] ?? 'npx'
  if (js.length && tools.js.eslint) plan.push({ name: 'eslint', command: `${exec} eslint ${list(js)}` })
  if (js.length && tools.js.vitest) plan.push({ name: 'vitest related', command: `${exec} vitest related --run ${list(js)}` })
  else if (js.length && tools.js.jest) plan.push({ name: 'jest related', command: `${exec} jest --findRelatedTests ${list(js)} --passWithNoTests` })
  const prefix = PY_PREFIX[tools.py.runner] ?? ''
  if (py.length && tools.py.ruff) plan.push({ name: 'ruff', command: `${prefix}ruff check ${list(py)}` })
  // pytest has no "related tests" mode, so only changed test files run; say so instead of guessing
  const pyTests = py.filter((file) => PY_TEST.test(file))
  if (pyTests.length && tools.py.pytest) plan.push({ name: 'pytest', command: `${prefix}pytest ${list(pyTests)}` })
  const skipped = []
  if (js.length && !tools.js.eslint) skipped.push('no eslint for JS/TS files')
  if (js.length && !tools.js.vitest && !tools.js.jest) skipped.push('no vitest or jest for JS/TS files')
  if (py.length && !tools.py.ruff) skipped.push('no ruff for Python files')
  if (py.length > pyTests.length && tools.py.pytest) skipped.push('pytest runs changed test files only; changed sources have no related-test lookup')
  return { plan, skipped }
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
  const run = (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).split('\n').filter(Boolean)
  const files = new Set([...run(['diff', '--name-only', '--diff-filter=d', 'HEAD']), ...run(['ls-files', '-o', '--exclude-standard'])])
  return [...files].filter((file) => existsSync(join(root, file)))
}

const main = () => {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const files = process.argv.slice(2).length ? process.argv.slice(2) : changedFiles(root)
  if (!files.length) {
    console.log('verify-default: no changed files')
    return
  }
  const { plan, skipped } = planChecks(files, detectTools(root))
  for (const reason of skipped) console.log(`verify-default: skipped — ${reason}`)
  let failed = 0
  for (const step of plan) {
    console.log(`\nverify-default: ${step.name}\n$ ${step.command}`)
    // shell: package-manager shims are .cmd files on Windows
    const { status } = spawnSync(step.command, { cwd: root, stdio: 'inherit', shell: true })
    if (status !== 0) failed += 1
    console.log(`verify-default: ${step.name} ${status === 0 ? '✔' : '✖'}`)
  }
  console.log(`\nverify-default: ${plan.length - failed}/${plan.length} checks passed for ${files.length} file(s)`)
  if (failed) process.exit(1)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
