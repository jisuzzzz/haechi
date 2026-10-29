import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { detect, snapshot } from '../core/tools/detect.mjs'

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

test('Python dev dependencies keep existing JS command priority and custom settings', () => {
  const settings = {
    commands: { verify: 'custom-check {files}', testOne: 'docker compose run api pytest {file}' },
    pythonTestMap: [{ source: 'app/', tests: ['tests/test_api.py'] }],
  }
  const draft = detect({ ...reactRepo, requirementsDev: 'pytest==8.3.0\n', settingsJson: JSON.stringify(settings) })
  assert.equal(draft.commands.testOne.value, 'yarn vitest run {file}')
  assert.deepEqual(draft.existingSettings.value, settings)
})

test('an empty folder gives unknowns, not guesses', () => {
  const draft = detect(snap())
  assert.equal(draft.stack.value, null)
  assert.equal(draft.commands.testOne.value, null)
  assert.equal(draft.git.host.value, null)
  assert.equal(draft.git.commit, undefined)
  assert.equal(draft.frameworks.value, null)
  assert.equal(draft.migrations.value, null)
  assert.equal(draft.docker.value, null)
})

test('framework candidates include both Python frameworks without changing JS detection', () => {
  const draft = detect({ ...reactRepo, requirements: 'django>=5\nfastapi>=0.115\n' })
  assert.deepEqual(draft.stack.value, ['react-web', 'python-django', 'python-fastapi'])
  assert.deepEqual(draft.frameworks.value, ['python-django', 'python-fastapi'])
  assert.equal(draft.commands.testOne.value, 'yarn vitest run {file}')
  assert.equal(draft.migrations.value, null)
})

test('Django migration candidates retain the Python runner without inventing a database target', () => {
  for (const [lock, prefix] of [[undefined, ''], ['uv.lock', 'uv run '], ['poetry.lock', 'poetry run ']]) {
    const draft = detect(snap({ files: ['manage.py', ...(lock ? [lock] : [])], requirements: 'django\n' }))
    assert.deepEqual(draft.migrations.value, {
      plan: `${prefix}python manage.py migrate --plan`,
      apply: `${prefix}python manage.py migrate --noinput`,
      check: `${prefix}python manage.py migrate --check`,
    })
    assert.equal(draft.migrations.value.environment, undefined)
  }
})

test('Alembic needs its own configuration and competing tools remain unresolved', () => {
  assert.equal(detect(snap({ requirements: 'fastapi\nalembic\n' })).migrations.value, null)
  const draft = detect(snap({ files: ['alembic.ini', 'uv.lock'], requirements: 'fastapi\nalembic\n' }))
  assert.equal(draft.migrations.value.apply, 'uv run alembic upgrade head')
  assert.equal(draft.migrations.value.check, 'uv run alembic current --check-heads')
  assert.match(draft.migrations.source, /1\.17\.1/)
  const mixed = detect(snap({ files: ['manage.py', 'alembic.ini'] }))
  assert.equal(mixed.migrations.value, null)
  assert.equal(mixed.migrationCandidates.length, 2)
})

test('Docker files provide a hint without guessing a machine provider or overwriting settings', () => {
  const settings = { frameworks: [], migrations: { apply: 'custom migration' }, docker: { context: 'team-local', start: 'custom start' } }
  for (const file of ['Dockerfile', 'docker/Dockerfile.dev', 'compose.yml', 'docker-compose.test.yaml']) {
    const draft = detect(snap({ files: [file], settingsJson: JSON.stringify(settings) }))
    assert.equal(draft.docker.value, null)
    assert.match(draft.docker.source, /Docker files found/)
    assert.deepEqual(draft.existingSettings.value, settings)
  }
})


test('setup preserves declared Git formats and custom settings beside fresh candidates', () => {
  const settings = {
    git: { base: 'release', branch: 'team/{slug}', commit: 'ko: concise subject', mrTemplate: ['## Purpose'] },
    commands: { verify: 'custom-check {files}' },
    team: { owner: 'synthetic-team' },
  }
  const draft = detect({ ...reactRepo, settingsJson: JSON.stringify(settings) })
  assert.deepEqual(draft.existingSettings, { value: settings, source: '.haechi.json' })
  assert.equal(draft.git.base.value, 'main')
  assert.equal(draft.commands.verify.value, 'node scripts/verify-changed.mjs')
  assert.deepEqual(detect(snap()).existingSettings, { value: null, source: 'no .haechi.json' })
})

test('invalid existing settings are reported for repair, not treated as absent', () => {
  for (const settingsJson of ['', '{oops', 'null', '[]', '"text"']) {
    const draft = detect(snap({ settingsJson }))
    assert.equal(draft.existingSettings.value, null)
    assert.equal(draft.existingSettings.source, '.haechi.json')
    assert.match(draft.existingSettings.error, /valid JSON object.*repair/)
  }
})

test('snapshot returns existing settings without reading PR templates', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'haechi-detect-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const settings = '{"git":{"mrTemplate":["## Keep"]},"custom":true}'
  writeFileSync(join(root, '.haechi.json'), settings)
  // A directory at the template path would fail if setup tried to read it as a file.
  mkdirSync(join(root, '.github', 'pull_request_template.md'), { recursive: true })
  const facts = snapshot(root)
  assert.equal(facts.settingsJson, settings)
  assert.equal(facts.git.subjects, undefined)
  assert.equal(facts.templateHeadings, undefined)
  assert.deepEqual(detect(facts).existingSettings.value, JSON.parse(settings))
  assert.equal(readFileSync(join(root, '.haechi.json'), 'utf8'), settings)
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
