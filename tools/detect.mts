// Find candidate execution commands and report where they came from.
// Usage: node detect.mjs [repo-root]  → prints JSON. Nothing is written.
// detect() is pure (it takes a snapshot); snapshot() does the reading.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

type Guess<T> = { value: T; source: string }
type PackageSnapshot = { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown>; scripts?: Record<string, string>; packageManager?: string }
export type RepositorySnapshot = { files: string[]; packageJson?: string; pyproject?: string; requirements?: string; requirementsDev?: string; agentsMd?: string; git: { remote?: string; originHead?: string; remoteBranches: string[] } }
type JsRunner = { run: (script: string) => string; exec: (bin: string) => string; install: string }
type PythonRunner = 'uv' | 'poetry' | 'pip'

const guess = <T, Extra extends object = object>(value: T, source: string, extra: Extra = {} as Extra) => ({ value, source, ...extra })
const unknown = (source = 'not found') => ({ value: null, source })

const RUNNERS: Record<string, JsRunner> = {
  yarn: { run: (script) => `yarn ${script}`, exec: (bin) => `yarn ${bin}`, install: 'yarn install --frozen-lockfile' },
  pnpm: { run: (script) => `pnpm ${script}`, exec: (bin) => `pnpm exec ${bin}`, install: 'pnpm install --frozen-lockfile' },
  npm: { run: (script) => `npm run ${script}`, exec: (bin) => `npx ${bin}`, install: 'npm ci' },
  bun: { run: (script) => `bun run ${script}`, exec: (bin) => `bunx ${bin}`, install: 'bun install --frozen-lockfile' },
}

const PYTHON_RUNNERS = {
  uv: { prefix: 'uv run ', install: 'uv sync' },
  poetry: { prefix: 'poetry run ', install: 'poetry install' },
  pip: { prefix: '', install: 'python -m venv .venv && .venv/bin/pip install -r requirements.txt' },
}

// Scripts that sweep the whole repo, rewrite files, or never exit; agents run single files instead
const WHOLE_REPO_SCRIPT = /^(test|lint|typecheck|format|coverage|e2e)(:|$)|:(watch|ui|full)$/

const deps = (pkg?: PackageSnapshot) => ({ ...pkg?.dependencies, ...pkg?.devDependencies })
const pythonDependencies = (snap: RepositorySnapshot) => [snap.pyproject, snap.requirements, snap.requirementsDev].filter(Boolean).join('\n').toLowerCase()

const detectStack = (snap: RepositorySnapshot, pkg?: PackageSnapshot) => {
  const found = []
  const all = deps(pkg)
  if (all['react-native'] || all.expo) found.push(['react-native', 'react-native/expo dependency'])
  else if (all.react) found.push(['react-web', 'react dependency'])
  const py = pythonDependencies(snap)
  if (snap.files.includes('manage.py') || /\bdjango\b/.test(py)) found.push(['python-django', 'manage.py or django dependency'])
  else if (/\bfastapi\b/.test(py)) found.push(['python-fastapi', 'fastapi dependency'])
  return found.length ? guess(found.map(([name]) => name), found.map(([, why]) => why).join('; ')) : unknown()
}

const detectPackageManager = (snap: RepositorySnapshot, pkg?: PackageSnapshot) => {
  const declared = pkg?.packageManager?.split('@')[0]
  if (declared && RUNNERS[declared]) return guess(declared, 'package.json packageManager')
  const lock = [['yarn.lock', 'yarn'], ['pnpm-lock.yaml', 'pnpm'], ['bun.lockb', 'bun'], ['package-lock.json', 'npm']].find(([file]) =>
    snap.files.includes(file),
  )
  return lock ? guess(lock[1], lock[0]) : pkg ? guess('npm', 'package.json without lockfile') : unknown()
}

const detectPythonRunner = (snap: RepositorySnapshot) => {
  if (snap.files.includes('uv.lock')) return 'uv'
  if (snap.files.includes('poetry.lock')) return 'poetry'
  return snap.pyproject || snap.requirements || snap.requirementsDev ? 'pip' : null
}

const detectCommands = (snap: RepositorySnapshot, pkg: PackageSnapshot | undefined, pm: string | null, py: PythonRunner | null) => {
  const scripts = pkg?.scripts ?? {}
  const runner = RUNNERS[pm!]
  const all = deps(pkg)
  const verifyFiles = snap.files.filter((file) => /^scripts\/[^/]*(verify|changed)[^/]*\.(m?js|ts|py|sh)$/i.test(file))
  const verifyScripts = Object.keys(scripts).filter((name) => /verify|changed/i.test(name))
  const verify = [
    ...verifyFiles.map((file) => guess(`${file.endsWith('.py') ? 'python' : 'node'} ${file}`, file)),
    ...verifyScripts.map((name) => guess(runner.run(name), `package.json scripts.${name}`)),
  ]

  let testOne: Guess<string | null> = unknown()
  if (all.vitest) testOne = guess(runner.exec('vitest run {file}'), 'vitest in devDependencies')
  else if (all.jest) testOne = guess(runner.exec('jest {file}'), 'jest in devDependencies')
  else if (py && /\bpytest\b/.test(pythonDependencies(snap))) {
    testOne = guess(`${PYTHON_RUNNERS[py].prefix}pytest {file}`, 'pytest dependency')
  }

  const typecheck = Object.keys(scripts)
    .filter((name) => /typecheck|type-check|tsc/i.test(name) && !/update/i.test(name))
    .map((name) => guess(runner.run(name), `package.json scripts.${name}`))
  if (py && /\bmypy\b/i.test(snap.pyproject ?? '')) typecheck.push(guess(`${PYTHON_RUNNERS[py].prefix}mypy`, 'mypy config'))

  return {
    verify: verify.length > 1 ? unknown('several candidates') : (verify[0] ?? unknown('no changed-files verifier — use the default verifier')),
    verifyCandidates: verify,
    testOne,
    typecheck: typecheck.length === 1 ? typecheck[0] : unknown(typecheck.length ? 'several candidates' : 'not found'),
    typecheckCandidates: typecheck,
  }
}

const detectForbidden = (pkg: PackageSnapshot, pm: string | null) => {
  const names = Object.keys(pkg?.scripts ?? {}).filter((name) => WHOLE_REPO_SCRIPT.test(name))
  return names.length
    ? guess(names.map((name) => RUNNERS[pm!].run(name)), `package.json scripts: ${names.join(', ')}`)
    : unknown('no whole-repo scripts found')
}

const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$)|(^|\/)(test_[^/]+|[^/]+_test)\.py$/

const detectTestDirs = (snap: RepositorySnapshot) => {
  const tests = snap.files.filter((file) => TEST_FILE.test(file))
  if (!tests.length) return unknown('no test files')
  const counts = new Map<string, number>()
  for (const file of tests) {
    const parts = file.split('/')
    const top = parts.length > 2 ? parts.slice(0, 2).join('/') : parts.length > 1 ? parts[0] : '.'
    counts.set(top, (counts.get(top) ?? 0) + 1)
  }
  const [top, count] = [...counts].sort((a, b) => b[1] - a[1])[0]
  // Most tests in one folder means a mirror tree; otherwise tests sit next to their source
  return count / tests.length >= 0.8 && /(^|\/)(tests?|__tests__)$/.test(top)
    ? guess([top], `${count} of ${tests.length} test files under ${top}`)
    : guess(['next to source'], `test files spread over ${counts.size} folders`)
}

const detectGit = (snap: RepositorySnapshot) => {
  const remote = snap.git.remote ?? ''
  const host = /github\.com/i.test(remote)
    ? guess('github', 'origin remote')
    : /gitlab/i.test(remote) || snap.files.includes('.gitlab-ci.yml')
      ? guess('gitlab', /gitlab/i.test(remote) ? 'origin remote' : '.gitlab-ci.yml')
      : unknown(remote ? 'unrecognized remote host' : 'no origin remote')
  const base = snap.git.originHead ? guess(snap.git.originHead, 'origin/HEAD') : unknown()
  const protectedBranches = base.value
    ? guess([...new Set([base.value, ...['main', 'master'].filter((name) => snap.git.remoteBranches.includes(name))])], 'base + main/master on origin')
    : unknown()

  return {
    host,
    cli: host.value === 'github' ? guess('gh', 'host') : host.value === 'gitlab' ? guess('glab', 'host') : unknown(),
    base,
    protected: protectedBranches,
  }
}

export const detect = (snap: RepositorySnapshot) => {
  const pkg = (snap.packageJson ? JSON.parse(snap.packageJson) : undefined) as PackageSnapshot | undefined
  const pm = detectPackageManager(snap, pkg)
  const py = detectPythonRunner(snap)
  const commands = pkg ? detectCommands(snap, pkg, pm.value, py) : detectCommands(snap, { scripts: {} }, 'npm', py)
  const pythonInstall = py === 'pip' && snap.requirementsDev !== undefined
    ? `python -m venv .venv && .venv/bin/pip install ${snap.requirements === undefined ? '' : '-r requirements.txt '}-r requirements-dev.txt`
    : PYTHON_RUNNERS[py!]?.install
  const sensitiveWords = snap.agentsMd?.match(/\b(PHI|PII|patient|personal data|payment)\b|환자|개인정보|결제/gi) ?? []
  return {
    stack: detectStack(snap, pkg),
    packageManager: pm,
    commands,
    forbidden: pkg ? detectForbidden(pkg, pm.value) : unknown(),
    testDirs: detectTestDirs(snap),
    worktreeSetup: pm.value ? guess(RUNNERS[pm.value].install, pm.source) : py ? guess(pythonInstall, py) : unknown(),
    devServer: pkg?.scripts?.dev ? guess(RUNNERS[pm.value!].run('dev'), 'package.json scripts.dev') : unknown(),
    screenCheck: snap.files.some((file) => /^playwright\.config\./.test(file))
      ? guess('playwright', 'playwright config')
      : unknown('no browser test setup'),
    preCommit: snap.files.some((file) => /^\.husky\/pre-commit$|^lefthook\.ya?ml$|^\.pre-commit-config\.yaml$/.test(file))
      ? guess(true, 'pre-commit hook config')
      : guess(false, 'no pre-commit hook config'),
    sensitiveData: sensitiveWords.length
      ? unknown(`AGENTS.md mentions: ${[...new Set(sensitiveWords.map((word) => word.toLowerCase()))].join(', ')}`)
      : unknown('no repository data rule detected'),
    agentsMd: guess(Boolean(snap.agentsMd), snap.agentsMd ? 'AGENTS.md' : 'no AGENTS.md'),
    git: detectGit(snap),
  }
}

const git = (root: string, args: string[]) => {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

const readIf = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined)

export const snapshot = (root: string): RepositorySnapshot => {
  const originHead = git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).replace(/^origin\//, '') || undefined
  return {
    files: git(root, ['ls-files']).split('\n').filter(Boolean),
    packageJson: readIf(join(root, 'package.json')),
    pyproject: readIf(join(root, 'pyproject.toml')),
    requirements: readIf(join(root, 'requirements.txt')),
    requirementsDev: readIf(join(root, 'requirements-dev.txt')),
    agentsMd: readIf(join(root, 'AGENTS.md')),
    git: {
      remote: git(root, ['remote', 'get-url', 'origin']).replace(/\/\/[^@/]*@/, '//') || undefined,
      originHead,
      remoteBranches: git(root, ['branch', '-r', '--sort=-committerdate', '--format=%(refname:short)'])
        .split('\n')
        .map((name) => name.replace(/^origin\//, ''))
        .filter((name) => name && name !== 'origin' && name !== 'HEAD')
        .slice(0, 40),
    },
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(detect(snapshot(process.argv[2] ?? process.cwd())), null, 2))
}
