import assert from 'node:assert/strict'
import { test } from 'node:test'

import { planChecks } from '../core/tools/verify-default.mjs'

const jsTools = { pm: 'yarn', js: { eslint: true, vitest: true, jest: false }, py: { runner: 'pip', ruff: false, pytest: false } }
const pyTools = { pm: 'npm', js: { eslint: false, vitest: false, jest: false }, py: { runner: 'uv', ruff: true, pytest: true } }

test('JS/TS files get eslint and related vitest through the package manager', () => {
  const { plan, skipped } = planChecks(['src/a.tsx', 'src/tests/a.test.tsx', 'README.md'], jsTools)
  assert.deepEqual(plan.map((step) => step.command), [
    'yarn eslint src/a.tsx src/tests/a.test.tsx',
    'yarn vitest related --run src/a.tsx src/tests/a.test.tsx',
  ])
  assert.deepEqual(skipped, [])
})

test('jest is used when there is no vitest', () => {
  const { plan } = planChecks(['src/a.ts'], { ...jsTools, pm: 'npm', js: { eslint: false, vitest: false, jest: true } })
  assert.deepEqual(plan.map((step) => step.command), ['npx jest --findRelatedTests src/a.ts --passWithNoTests'])
})

test('Python runs ruff on changed files and pytest only on changed test files, and says so', () => {
  const { plan, skipped } = planChecks(['app/views.py', 'tests/test_views.py'], pyTools)
  assert.deepEqual(plan.map((step) => step.command), ['uv run ruff check app/views.py tests/test_views.py', 'uv run pytest tests/test_views.py'])
  assert.match(skipped.join(), /changed test files only/)
})

test('paths with spaces are quoted', () => {
  const { plan } = planChecks(['src/my file.ts'], jsTools)
  assert.equal(plan[0].command, 'yarn eslint "src/my file.ts"')
})

test('missing tools are reported instead of silently passing', () => {
  const { plan, skipped } = planChecks(['src/a.ts'], { ...jsTools, js: { eslint: false, vitest: false, jest: false } })
  assert.deepEqual(plan, [])
  assert.deepEqual(skipped, ['no eslint for JS/TS files', 'no vitest or jest for JS/TS files'])
})

test('docs-only changes plan nothing', () => {
  assert.deepEqual(planChecks(['README.md', 'docs/a.md'], jsTools), { plan: [], skipped: [] })
})
