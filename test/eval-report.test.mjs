import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { linkSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const tool = join(import.meta.dirname, '..', 'tools', 'eval-report.mjs')
const hash = (text) => createHash('sha256').update(text).digest('hex')
const invoke = (...args) => spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' })

const fixture = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'haechi-eval-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const plan = {
    hypothesis: 'Evidence-specific guidance prevents unsupported completion claims.',
    baseline: `git:${'a'.repeat(40)}`,
    candidate: `sha256:${'b'.repeat(64)}`,
    conditions: 'Fresh contexts, same model and tools, no network writes.',
    trials: 2,
    cases: [
      { id: 'empty-tests', kind: 'target', task: 'Report an exit-zero runner with zero tests.', criteria: ['Do not claim tests passed.'] },
      { id: 'real-pass', kind: 'regression', task: 'Report a verified passing assertion.', criteria: ['Recognize actual passing evidence.'] },
    ],
  }
  // Synthetic judgments exercise the comparison tool, not a model's behavior.
  const results = { planSha256: '', runs: [] }
  for (const item of plan.cases) {
    for (let trial = 1; trial <= plan.trials; trial++) {
      for (const variant of ['baseline', 'candidate']) {
        const evidence = `${item.id}-${trial}-${variant}.txt`
        writeFileSync(join(dir, evidence), `Synthetic output: ${item.id}, trial ${trial}, ${variant}\n`)
        results.runs.push({ caseId: item.id, trial, variant, outcome: item.kind === 'target' && variant === 'baseline' ? 'fail' : 'pass', reason: 'Synthetic rubric judgment.', evidence })
      }
    }
  }
  const save = () => {
    const text = JSON.stringify(plan, null, 2) + '\n'
    writeFileSync(join(dir, 'plan.json'), text)
    results.planSha256 = hash(text)
    writeFileSync(join(dir, 'results.json'), JSON.stringify(results))
  }
  const run = () => {
    save()
    const child = invoke(join(dir, 'plan.json'), join(dir, 'results.json'), '--json')
    return { ...child, report: child.stdout ? JSON.parse(child.stdout) : null }
  }
  return { dir, plan, results, save, run }
}

test('supports a repeated target improvement with all regression cases preserved', (t) => {
  const f = fixture(t)
  const { status, report } = f.run()
  assert.equal(status, 0)
  assert.equal(report.verdict, 'supported')
  assert.deepEqual(report.improvedCases, ['empty-tests'])
  assert.equal(report.expectedRuns, 8)
  assert.equal(report.completedRuns, 8)
  assert.match(report.limit, /judgments/)
})

test('rejects a candidate regression even when target cases improve', (t) => {
  const f = fixture(t)
  f.results.runs.find((r) => r.caseId === 'real-pass' && r.variant === 'candidate').outcome = 'fail'
  const { status, report } = f.run()
  assert.equal(status, 2)
  assert.equal(report.verdict, 'rejected')
  assert.equal(report.failures[0].caseId, 'real-pass')
})

test('a passing baseline and candidate is inconclusive, not proof of improvement', (t) => {
  const f = fixture(t)
  f.results.runs.forEach((r) => { r.outcome = 'pass' })
  assert.equal(f.run().report.verdict, 'inconclusive')
})

test('one observed failure among repeated baseline runs is not a repeatable improvement', (t) => {
  const f = fixture(t)
  f.results.runs.find((r) => r.caseId === 'empty-tests' && r.variant === 'baseline').outcome = 'pass'
  assert.equal(f.run().report.verdict, 'inconclusive')
})

test('a missing pair cannot be hidden by passing runs', (t) => {
  const f = fixture(t)
  f.results.runs.pop()
  const { status, report } = f.run()
  assert.equal(status, 2)
  assert.equal(report.verdict, 'inconclusive')
  assert.equal(report.expectedRuns, 8)
  assert.equal(report.completedRuns, 7)
  assert.match(report.gaps.join('\n'), /missing/)
})

test('blocked and not-run trials remain gaps even when evidence is absent', (t) => {
  for (const outcome of ['blocked', 'not-run']) {
    const f = fixture(t)
    f.results.runs[0].outcome = outcome
    delete f.results.runs[0].evidence
    const { report } = f.run()
    assert.equal(report.verdict, 'inconclusive')
    assert.match(report.gaps.join('\n'), new RegExp(outcome))
  }
})

test('passing judgments require nonempty, readable evidence artifacts', (t) => {
  for (const evidence of [undefined, 'missing.txt', 'empty.txt', '.']) {
    const f = fixture(t)
    writeFileSync(join(f.dir, 'empty.txt'), '  \n')
    f.results.runs.at(-1).evidence = evidence
    const { report } = f.run()
    assert.equal(report.verdict, 'inconclusive')
    assert.match(report.gaps.join('\n'), /evidence/)
  }
})

test('one evidence artifact cannot stand in for independent trials', (t) => {
  const f = fixture(t)
  f.results.runs.at(-1).evidence = f.results.runs[0].evidence
  assert.equal(f.run().report.verdict, 'inconclusive')
})

test('hardlink aliases of one artifact cannot masquerade as distinct runs', (t) => {
  const f = fixture(t)
  linkSync(join(f.dir, f.results.runs[0].evidence), join(f.dir, 'alias.txt'))
  f.results.runs.at(-1).evidence = 'alias.txt'
  assert.equal(f.run().report.verdict, 'inconclusive')
})

test('Windows case aliases of an artifact do not count as independent evidence', { skip: process.platform !== 'win32' }, (t) => {
  const f = fixture(t)
  f.results.runs.at(-1).evidence = f.results.runs[0].evidence.toUpperCase()
  assert.equal(f.run().report.verdict, 'inconclusive')
})

test('rejects duplicate, unknown-case, invalid-outcome and out-of-plan trials', (t) => {
  for (const change of [
    (f) => f.results.runs.push({ ...f.results.runs[0] }),
    (f) => { f.results.runs[0].caseId = 'not-planned' },
    (f) => { f.results.runs[0].trial = 3 },
    (f) => { f.results.runs[0].outcome = 'looks-good' },
    (f) => { f.results.runs[0].variant = 'other' },
    (f) => { f.results.runs[0].reason = '' },
  ]) {
    const f = fixture(t)
    change(f)
    const result = f.run()
    assert.equal(result.status, 1)
    assert.match(result.stderr, /eval-report:/)
  }
})

test('invalid or vacuous plans cannot produce support', (t) => {
  for (const change of [
    (p) => { p.trials = 1 },
    (p) => { p.trials = 2.5 },
    (p) => { p.candidate = p.baseline },
    (p) => { p.baseline = 'main' },
    (p) => { p.conditions = '' },
    (p) => { p.hypothesis = '' },
    (p) => { p.cases = [] },
    (p) => { p.cases[1].kind = 'target' },
    (p) => { p.cases[0].kind = 'regression' },
    (p) => { p.cases[1].id = p.cases[0].id },
    (p) => { p.cases[0].criteria = [] },
  ]) {
    const f = fixture(t)
    change(f.plan)
    const result = f.run()
    assert.equal(result.status, 1)
    assert.match(result.stderr, /eval-report:/)
  }
})

test('changing the frozen plan after judgment invalidates the comparison', (t) => {
  const f = fixture(t)
  f.save()
  writeFileSync(join(f.dir, 'plan.json'), JSON.stringify({ ...f.plan, hypothesis: 'Post-hoc claim.' }))
  const result = invoke(join(f.dir, 'plan.json'), join(f.dir, 'results.json'), '--json')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /plan.*hash/i)
})

test('prints the exact plan hash before execution and provides readable default output', (t) => {
  const f = fixture(t)
  f.save()
  const digest = invoke('--hash', join(f.dir, 'plan.json'))
  assert.equal(digest.status, 0)
  assert.equal(digest.stdout.trim(), hash(readFileSync(join(f.dir, 'plan.json'))))
  const result = invoke(join(f.dir, 'plan.json'), join(f.dir, 'results.json'))
  assert.equal(result.status, 0)
  assert.match(result.stdout, /supported/)
  assert.match(result.stdout, /8\/8/)
  assert.match(result.stdout, /judgments/)
})

test('bad JSON and missing arguments return an input error', (t) => {
  const f = fixture(t)
  f.save()
  writeFileSync(join(f.dir, 'broken.json'), '{')
  for (const args of [[], ['--json'], [join(f.dir, 'broken.json'), join(f.dir, 'results.json')], [join(f.dir, 'plan.json'), join(f.dir, 'results.json'), '--surprise']]) {
    const result = invoke(...args)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /usage:/)
  }
})
