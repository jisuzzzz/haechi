import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { detect, snapshot } from '../dist/claude/tools/detect.mjs'

const snap = (overrides = {}) => ({
  files: [],
  packageJson: undefined,
  pyproject: undefined,
  requirements: undefined,
  requirementsDev: undefined,
  agentsMd: undefined,
  templateHeadings: [],
  templateSource: undefined,
  git: { remote: undefined, originHead: undefined, remoteBranches: [], subjects: [] },
  ...overrides,
})

const reactRepo = snap({
  files: ['yarn.lock', 'playwright.config.ts', '.husky/pre-commit', 'scripts/verify-changed.mjs', 'src/a.tsx', 'src/tests/a.test.tsx', 'src/tests/b.test.ts'],
  packageJson: JSON.stringify({
    dependencies: { react: '18' },
    devDependencies: { vitest: '3' },
    scripts: { dev: 'vite', test: 'vitest run', 'test:watch': 'vitest', lint: 'eslint .', typecheck: 'tsc --noEmit', build: 'vite build' },
  }),
  agentsMd: 'Fixtures use synthetic data only, never patient records.',
  git: {
    remote: 'https://github.com/acme/web.git',
    originHead: 'main',
    remoteBranches: ['main', 'feat/a', 'fix/b', 'chore/c', 'release'],
    subjects: ['feat(ui): add list', 'fix(api): handle null', 'refactor: split file', 'docs: readme'],
  },
})

test('a React web repo: stack, runner, single test, whole-repo scripts, mirror tests', () => {
  const draft = detect(reactRepo)
  assert.deepEqual(draft.stack.value, ['react-web'])
  assert.equal(draft.packageManager.value, 'yarn')
  assert.equal(draft.commands.testOne.value, 'yarn vitest run {file}')
  assert.equal(draft.commands.verify.value, 'node scripts/verify-changed.mjs')
  assert.equal(draft.commands.typecheck.value, 'yarn typecheck')
  assert.deepEqual(draft.forbidden.value, ['yarn test', 'yarn test:watch', 'yarn lint', 'yarn typecheck'])
  assert.deepEqual(draft.testDirs.value, ['src/tests'])
  assert.equal(draft.worktreeSetup.value, 'yarn install --frozen-lockfile')
  assert.equal(draft.screenCheck.value, 'playwright')
  assert.equal(draft.preCommit.value, true)
})

test('setup detects Git host and branches without inferring operation formats', () => {
  const { git } = detect(reactRepo)
  assert.equal(git.host.value, 'github')
  assert.equal(git.cli.value, 'gh')
  assert.equal(git.base.value, 'main')
  assert.deepEqual(git.protected.value, ['main'])
  assert.equal(git.branch, undefined)
  assert.equal(git.commit, undefined)
  assert.equal(git.mrTemplate, undefined)
})

test('sensitive data is never decided, only hinted from AGENTS.md', () => {
  const draft = detect(reactRepo)
  assert.equal(draft.sensitiveData.value, null)
  assert.match(draft.sensitiveData.source, /patient/)
})

test('several verify candidates leave the choice to the user', () => {
  const draft = detect({ ...reactRepo, files: [...reactRepo.files, 'scripts/test-changed.mjs'] })
  assert.equal(draft.commands.verify.value, null)
  assert.equal(draft.commands.verifyCandidates.length, 2)
})

test('no verifier at all points to the default verifier', () => {
  const draft = detect({ ...reactRepo, files: reactRepo.files.filter((file) => !file.startsWith('scripts/')) })
  assert.equal(draft.commands.verify.value, null)
  assert.match(draft.commands.verify.source, /default verifier/)
})

test('co-located tests are not mistaken for a mirror tree', () => {
  const draft = detect({ ...reactRepo, files: ['yarn.lock', 'src/a/x.test.ts', 'src/b/y.test.ts', 'lib/z.test.ts'] })
  assert.deepEqual(draft.testDirs.value, ['next to source'])
})

test('a Django repo with uv and a self-hosted GitLab in Korean', () => {
  const draft = detect(
    snap({
      files: ['manage.py', 'uv.lock', '.gitlab-ci.yml', 'tests/test_views.py', 'tests/test_models.py'],
      pyproject: '[project]\ndependencies = ["django>=5", "pytest"]\n[tool.mypy]\n',
      git: {
        remote: 'https://code.example.org/team/api.git',
        originHead: 'develop',
        remoteBranches: ['develop', 'master', 'feat/x', 'fix/y'],
        subjects: ['feat(api): 목록 정렬 추가', 'fix(auth): 토큰 만료 처리', 'chore: 의존성 정리'],
      },
      templateHeadings: ['## 개요', '## 주요 변경'],
      templateSource: '.gitlab/merge_request_templates/default.md',
    }),
  )
  assert.deepEqual(draft.stack.value, ['python-django'])
  assert.equal(draft.commands.testOne.value, 'uv run pytest {file}')
  assert.equal(draft.commands.typecheck.value, 'uv run mypy')
  assert.equal(draft.worktreeSetup.value, 'uv sync')
  assert.deepEqual(draft.testDirs.value, ['tests'])
  assert.equal(draft.git.host.value, 'gitlab')
  assert.equal(draft.git.host.source, '.gitlab-ci.yml')
  assert.deepEqual(draft.git.protected.value, ['develop', 'master'])
  assert.equal(draft.git.commit, undefined)
  assert.equal(draft.git.mrTemplate, undefined)
})

test('FastAPI discovers dev-only pytest with the existing Python runner prefixes', () => {
  for (const [lock, prefix] of [[undefined, ''], ['uv.lock', 'uv run '], ['poetry.lock', 'poetry run ']]) {
    const draft = detect(snap({
      files: ['requirements.txt', 'requirements-dev.txt', 'tests/test_api.py', ...(lock ? [lock] : [])],
      requirements: 'fastapi==0.115.0\n',
      requirementsDev: 'pytest==8.3.0\nruff==0.7.0\n',
    }))
    assert.deepEqual(draft.stack.value, ['python-fastapi'])
    assert.equal(draft.commands.testOne.value, `${prefix}pytest {file}`)
    assert.deepEqual(draft.testDirs.value, ['tests'])
  }
})

test('a dev requirements file identifies Python without inventing pytest when absent', () => {
  const draft = detect(snap({ requirementsDev: 'pytest==8.3.0\nruff==0.7.0\n' }))
  assert.equal(draft.commands.testOne.value, 'pytest {file}')
  assert.equal(detect(snap({ requirementsDev: 'ruff==0.7.0\n' })).commands.testOne.value, null)
})

test('pip worktree setup includes both runtime and dev requirements when present', () => {
  const draft = detect(snap({ requirements: 'fastapi==0.115.0\n', requirementsDev: 'pytest==8.3.0\n' }))
  assert.equal(draft.worktreeSetup.value, 'python -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt')
})

test('pip worktree setup with only dev requirements does not invent a runtime file', () => {
  const draft = detect(snap({ requirementsDev: 'pytest==8.3.0\n' }))
  assert.equal(draft.worktreeSetup.value, 'python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt')
  const runtimeOnly = detect(snap({ requirements: 'fastapi==0.115.0\n' }))
  assert.equal(runtimeOnly.worktreeSetup.value, 'python -m venv .venv && .venv/bin/pip install -r requirements.txt')
})

test('Python dev dependencies keep existing JS command priority', () => {
  const draft = detect({ ...reactRepo, requirementsDev: 'pytest==8.3.0\n' })
  assert.equal(draft.commands.testOne.value, 'yarn vitest run {file}')
})

test('an empty folder gives unknowns, not guesses', () => {
  const draft = detect(snap())
  assert.equal(draft.stack.value, null)
  assert.equal(draft.commands.testOne.value, null)
  assert.equal(draft.git.host.value, null)
  assert.equal(draft.git.commit, undefined)
})


test('snapshot reads dev requirements so FastAPI setup discovers pytest from disk', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'haechi-detect-python-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const requirements = 'fastapi==0.115.0\n'
  const requirementsDev = 'pytest==8.3.0\nruff==0.7.0\n'
  writeFileSync(join(root, 'requirements.txt'), requirements)
  writeFileSync(join(root, 'requirements-dev.txt'), requirementsDev)
  const facts = snapshot(root)
  assert.equal(facts.requirements, requirements)
  assert.equal(facts.requirementsDev, requirementsDev)
  assert.deepEqual(detect(facts).stack.value, ['python-fastapi'])
  assert.equal(detect(facts).commands.testOne.value, 'pytest {file}')
})

test('diagnostic CLI finds repository commands without creating settings', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'haechi-detect-read-only-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { verify: 'node verify.mjs' } }))
  for (const platform of ['claude', 'codex']) {
    const tool = join(import.meta.dirname, '..', 'dist', platform, 'tools', 'detect.mjs')
    const draft = JSON.parse(execFileSync(process.execPath, [tool, root], { encoding: 'utf8' }))
    assert.equal(draft.commands.verify.value, 'npm run verify')
    assert.throws(() => readFileSync(join(root, '.haechi.json')), { code: 'ENOENT' })
  }
})

test('diagnostics ignore a retired settings file and leave it untouched', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'haechi-detect-legacy-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, '.haechi.json')
  writeFileSync(path, '{invalid')
  const draft = detect(snapshot(root))
  assert.equal('existingSettings' in draft, false)
  assert.equal(readFileSync(path, 'utf8'), '{invalid')
})
