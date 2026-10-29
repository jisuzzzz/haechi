import assert from 'node:assert/strict'
import { test } from 'node:test'

import { detect } from '../core/tools/detect.mjs'

const snap = (overrides = {}) => ({
  files: [],
  packageJson: undefined,
  pyproject: undefined,
  requirements: undefined,
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

test('git conventions come from the remote and recent history', () => {
  const { git } = detect(reactRepo)
  assert.equal(git.host.value, 'github')
  assert.equal(git.cli.value, 'gh')
  assert.equal(git.base.value, 'main')
  assert.deepEqual(git.protected.value, ['main'])
  assert.equal(git.branch.value, '{type}/{slug}')
  assert.equal(git.commit.value, 'en: type(scope): summary')
  assert.equal(git.mrTemplate.value, null)
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
  assert.equal(draft.git.commit.value, 'ko: type(scope): summary')
  assert.deepEqual(draft.git.mrTemplate.value, ['## 개요', '## 주요 변경'])
})

test('an empty folder gives unknowns, not guesses', () => {
  const draft = detect(snap())
  assert.equal(draft.stack.value, null)
  assert.equal(draft.commands.testOne.value, null)
  assert.equal(draft.git.host.value, null)
  assert.equal(draft.git.commit.value, null)
})
