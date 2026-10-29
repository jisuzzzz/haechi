// Repo setup, step 1: guess every setting from the repo and say where each guess came from.
// Usage: node detect.mjs [repo-root]  → prints a JSON draft. Nothing is written.
// detect() is pure (it takes a snapshot); snapshot() does the reading.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const guess = (value, source, extra = {}) => ({ value, source, ...extra })
const unknown = (source = 'not found') => ({ value: null, source })

const RUNNERS = {
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

const HANGUL = /[가-힣]/
const CONVENTIONAL = /^(feat|fix|chore|refactor|docs|test|style|perf|build|ci)(\([^)]*\))?!?: /
const BRANCH_TYPE = /^(feat|fix|chore|refactor|docs|test|style|perf|hotfix|release)\//

const deps = (pkg) => ({ ...pkg?.dependencies, ...pkg?.devDependencies })

const detectStack = (snap, pkg) => {
  const found = []
  const all = deps(pkg)
  if (all['react-native'] || all.expo) found.push(['react-native', 'react-native/expo dependency'])
  else if (all.react) found.push(['react-web', 'react dependency'])
  const py = `${snap.pyproject ?? ''}\n${snap.requirements ?? ''}`.toLowerCase()
  if (snap.files.includes('manage.py') || /\bdjango\b/.test(py)) found.push(['python-django', 'manage.py or django dependency'])
  else if (/\bfastapi\b/.test(py)) found.push(['python-fastapi', 'fastapi dependency'])
  return found.length ? guess(found.map(([name]) => name), found.map(([, why]) => why).join('; ')) : unknown()
}

const detectPackageManager = (snap, pkg) => {
  const declared = pkg?.packageManager?.split('@')[0]
  if (declared && RUNNERS[declared]) return guess(declared, 'package.json packageManager')
  const lock = [['yarn.lock', 'yarn'], ['pnpm-lock.yaml', 'pnpm'], ['bun.lockb', 'bun'], ['package-lock.json', 'npm']].find(([file]) =>
    snap.files.includes(file),
  )
  return lock ? guess(lock[1], lock[0]) : pkg ? guess('npm', 'package.json without lockfile') : unknown()
}

const detectPythonRunner = (snap) => {
  if (snap.files.includes('uv.lock')) return 'uv'
  if (snap.files.includes('poetry.lock')) return 'poetry'
  return snap.pyproject || snap.requirements ? 'pip' : null
}

const detectCommands = (snap, pkg, pm, py) => {
  const scripts = pkg?.scripts ?? {}
  const runner = RUNNERS[pm]
  const all = deps(pkg)
  const verifyFiles = snap.files.filter((file) => /^scripts\/[^/]*(verify|changed)[^/]*\.(m?js|ts|py|sh)$/i.test(file))
  const verifyScripts = Object.keys(scripts).filter((name) => /verify|changed/i.test(name))
  const verify = [
    ...verifyFiles.map((file) => guess(`${file.endsWith('.py') ? 'python' : 'node'} ${file}`, file)),
    ...verifyScripts.map((name) => guess(runner.run(name), `package.json scripts.${name}`)),
  ]

  let testOne = unknown()
  if (all.vitest) testOne = guess(runner.exec('vitest run {file}'), 'vitest in devDependencies')
  else if (all.jest) testOne = guess(runner.exec('jest {file}'), 'jest in devDependencies')
  else if (py && /\bpytest\b/i.test(`${snap.pyproject ?? ''}${snap.requirements ?? ''}`)) {
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

const detectForbidden = (pkg, pm) => {
  const names = Object.keys(pkg?.scripts ?? {}).filter((name) => WHOLE_REPO_SCRIPT.test(name))
  return names.length
    ? guess(names.map((name) => RUNNERS[pm].run(name)), `package.json scripts: ${names.join(', ')}`)
    : unknown('no whole-repo scripts found')
}

const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$)|(^|\/)(test_[^/]+|[^/]+_test)\.py$/

const detectTestDirs = (snap) => {
  const tests = snap.files.filter((file) => TEST_FILE.test(file))
  if (!tests.length) return unknown('no test files')
  const counts = new Map()
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

const detectGit = (snap) => {
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

  const typed = snap.git.remoteBranches.filter((name) => BRANCH_TYPE.test(name))
  const branch =
    snap.git.remoteBranches.length && typed.length / snap.git.remoteBranches.length >= 0.5
      ? guess('{type}/{slug}', `${typed.length} of ${snap.git.remoteBranches.length} recent branches`)
      : unknown('no clear branch pattern')

  const subjects = snap.git.subjects
  const conventional = subjects.filter((subject) => CONVENTIONAL.test(subject)).length
  const korean = subjects.filter((subject) => HANGUL.test(subject)).length
  const commit =
    subjects.length && conventional / subjects.length >= 0.6
      ? guess(`${korean / subjects.length >= 0.5 ? 'ko' : 'en'}: type(scope): summary`, `${conventional} of ${subjects.length} recent commits`)
      : unknown('no clear commit pattern')

  const mrTemplate = snap.templateHeadings.length
    ? guess(snap.templateHeadings, snap.templateSource)
    : unknown('no MR/PR template file — read recent merge requests')

  return {
    host,
    cli: host.value === 'github' ? guess('gh', 'host') : host.value === 'gitlab' ? guess('glab', 'host') : unknown(),
    base,
    protected: protectedBranches,
    branch,
    commit,
    mrTemplate,
  }
}

export const detect = (snap) => {
  const pkg = snap.packageJson ? JSON.parse(snap.packageJson) : undefined
  const pm = detectPackageManager(snap, pkg)
  const py = detectPythonRunner(snap)
  const commands = pkg ? detectCommands(snap, pkg, pm.value, py) : detectCommands(snap, { scripts: {} }, 'npm', py)
  const sensitiveWords = snap.agentsMd?.match(/\b(PHI|PII|patient|personal data|payment)\b|환자|개인정보|결제/gi) ?? []
  return {
    stack: detectStack(snap, pkg),
    packageManager: pm,
    commands,
    forbidden: pkg ? detectForbidden(pkg, pm.value) : unknown(),
    testDirs: detectTestDirs(snap),
    worktreeSetup: pm.value ? guess(RUNNERS[pm.value].install, pm.source) : py ? guess(PYTHON_RUNNERS[py].install, py) : unknown(),
    devServer: pkg?.scripts?.dev ? guess(RUNNERS[pm.value].run('dev'), 'package.json scripts.dev') : unknown(),
    screenCheck: snap.files.some((file) => /^playwright\.config\./.test(file))
      ? guess('playwright', 'playwright config')
      : unknown('no browser test setup'),
    preCommit: snap.files.some((file) => /^\.husky\/pre-commit$|^lefthook\.ya?ml$|^\.pre-commit-config\.yaml$/.test(file))
      ? guess(true, 'pre-commit hook config')
      : guess(false, 'no pre-commit hook config'),
    sensitiveData: sensitiveWords.length
      ? unknown(`AGENTS.md mentions: ${[...new Set(sensitiveWords.map((word) => word.toLowerCase()))].join(', ')} — confirm with the user`)
      : unknown('always ask the user'),
    agentsMd: guess(Boolean(snap.agentsMd), snap.agentsMd ? 'AGENTS.md' : 'no AGENTS.md'),
    git: detectGit(snap),
  }
}

const git = (root, args) => {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

const readIf = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined)

const templateHeadings = (root) => {
  const candidates = [
    '.github/pull_request_template.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
    ...(existsSync(join(root, '.gitlab/merge_request_templates'))
      ? readdirSync(join(root, '.gitlab/merge_request_templates')).map((name) => `.gitlab/merge_request_templates/${name}`)
      : []),
  ]
  const found = candidates.find((path) => existsSync(join(root, path)))
  return {
    templateSource: found,
    templateHeadings: found ? readFileSync(join(root, found), 'utf8').split(/\r?\n/).filter((line) => /^#{1,3} /.test(line)) : [],
  }
}

export const snapshot = (root) => {
  const originHead = git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).replace(/^origin\//, '') || undefined
  return {
    files: git(root, ['ls-files']).split('\n').filter(Boolean),
    packageJson: readIf(join(root, 'package.json')),
    pyproject: readIf(join(root, 'pyproject.toml')),
    requirements: readIf(join(root, 'requirements.txt')),
    agentsMd: readIf(join(root, 'AGENTS.md')),
    ...templateHeadings(root),
    git: {
      remote: git(root, ['remote', 'get-url', 'origin']).replace(/\/\/[^@/]*@/, '//') || undefined,
      originHead,
      remoteBranches: git(root, ['branch', '-r', '--sort=-committerdate', '--format=%(refname:short)'])
        .split('\n')
        .map((name) => name.replace(/^origin\//, ''))
        .filter((name) => name && name !== 'origin' && name !== 'HEAD')
        .slice(0, 40),
      subjects: originHead ? git(root, ['log', `origin/${originHead}`, '-50', '--no-merges', '--format=%s']).split('\n').filter(Boolean) : [],
    },
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(detect(snapshot(process.argv[2] ?? process.cwd())), null, 2))
}
