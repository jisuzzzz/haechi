import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { sha256, verifyEvaluation } from '../dist/claude/tools/document-quality-eval.mjs'

const tool = join(import.meta.dirname, '../dist/claude/tools/document-quality-eval.mjs')
const TYPES = ['fact', 'change', 'bug', 'retirement', 'performance', 'handoff']
const write = (dir, path, data) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`)
}
const read = (dir, path) => JSON.parse(readFileSync(join(dir, path), 'utf8'))

const fixture = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'haechi-document-eval-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const frozen = ['snapshot/instructions.md', 'rubric.json', 'sources.md']
  write(dir, frozen[0], 'Synthetic instruction snapshot for verifier tests, not an actual model run.\n')
  write(dir, 'rubric.json', { criticalCriteria: [{ id: 'F1', criterion: 'Keep observed facts separate from unknown causes.' }] })
  write(dir, 'sources.md', 'Synthetic evaluation fixture only.\n')
  const plan = { mode: 'baseline_diagnostic', types: TYPES, trialsPerType: 2, runs: [] }
  const results = { mode: 'baseline_diagnostic', planSha256: '', runs: [], humanValidation: { executed: false, participants: 0, outcome: 'not_run' } }
  for (const type of TYPES) {
    const questions = Array.from({ length: 6 }, (_, i) => ({ id: `Q${i + 1}`, text: `어떤 사실을 확인했나? ${i + 1}` }))
    const key = { caseId: type, type, criticalFacts: [{ id: 'F1', assertion: '화면 현상만 관측했다.', source: 'sources/context.md#관측' }], questions: questions.map(({ id }) => ({ id, expected: '현상 관측, 원인 미확인.', unacceptable: ['서버 원인 확정'], source: 'sources/context.md:3', critical: true })) }
    const files = { 'case.md': '# 가상 검증 사례\n\n원인은 모른다.\n', 'sources/context.md': '# 관측\n\n현상만 관측했다.\n', 'questions.json': questions, 'answer-key.json': key }
    for (const [file, data] of Object.entries(files)) { const path = `cases/${type}/${file}`; write(dir, path, data); frozen.push(path) }
    for (const trial of [1, 2]) {
      const id = `${type}-${trial}`
      plan.runs.push({ id, type, trial })
      const document = `runs/${id}/document.md`, reader = `runs/${id}/reader.json`, judgment = `runs/${id}/judgment.json`
      write(dir, document, '# 검증 문서\n\n## 0. 요약\n\n현상은 관측했지만 원인은 모른다.[^observation]\n\n## 1. 근거 주석\n\n[^observation]: [관측 기록](sources/context.md).\n')
      write(dir, `runs/${id}/sources/context.md`, files['sources/context.md'])
      write(dir, reader, { answers: questions.map(({ id }) => ({ id, answer: '현상 관측, 원인 미확인.', support: '문서 요약에서 원인은 모른다고 설명한다.', status: 'answered' })) })
      write(dir, judgment, { id, criticalChecks: [{ criterion: 'F1', outcome: 'pass', reason: '원인 단정 없음.', evidence: '요약의 원인은 모른다.' }], answers: questions.map(({ id }) => ({ id, outcome: 'pass', reason: '가상 정답과 일치.', evidence: '현상 관측, 원인 미확인.' })), findings: [], humanOnly: ['실제 독자 이해도는 검증하지 않았다.'] })
      results.runs.push({ id, type, trial, document, reader, judgment, aiOutcome: 'pass' })
    }
  }
  const savePlan = () => { write(dir, 'plan.json', plan); const hash = sha256(readFileSync(join(dir, 'plan.json'))); write(dir, 'plan.sha256', `${hash}\n`); results.planSha256 = hash }
  const saveResults = () => write(dir, 'results.json', results)
  const freeze = () => {
    write(dir, 'manifest.json', { files: frozen.map((path) => ({ path, sha256: sha256(readFileSync(join(dir, path))) })) })
    plan.manifestSha256 = sha256(readFileSync(join(dir, 'manifest.json')))
    savePlan(); saveResults()
  }
  freeze()
  return { dir, plan, results, freeze, savePlan, saveResults, verify: (preflight = false) => verifyEvaluation(dir, { preflight }) }
}

test('preflight validates all frozen cases while final validates twelve real artifact sets', (t) => {
  const f = fixture(t)
  assert.equal(f.verify(true).ok, true)
  const report = f.verify()
  assert.equal(report.ok, true, report.errors.join('\n'))
  assert.deepEqual(report.counts, { cases: 6, plannedRuns: 12, resultRuns: 12, documents: 12, readerAnswers: 72 })
  assert.match(report.limit, /not proof of human readability/)
  rmSync(join(f.dir, 'results.json'))
  const cli = spawnSync(process.execPath, [tool, '--preflight', '--root', f.dir], { encoding: 'utf8' })
  assert.equal(cli.status, 0, cli.stderr)
  assert.equal(JSON.parse(cli.stdout).stage, 'preflight')
  assert.equal(f.verify().ok, false, 'missing output cannot be reported as final verification')
})

test('every frozen critical criterion must be covered once, without silently dropping checks', (t) => {
  const f = fixture(t)
  write(f.dir, 'rubric.json', { criticalCriteria: [{ id: 'F1' }, { id: 'F2' }] })
  f.freeze()
  assert.ok(f.verify().errors.some((e) => e.includes('every frozen critical criterion')))
  const row = f.results.runs[0]
  const judgment = read(f.dir, row.judgment)
  judgment.criticalChecks.push({ ...judgment.criticalChecks[0] })
  write(f.dir, row.judgment, judgment)
  assert.ok(f.verify().errors.some((e) => e.includes('every frozen critical criterion')))
})

test('tampered snapshot bytes and an omitted frozen case file are detected', (t) => {
  const f = fixture(t)
  write(f.dir, 'snapshot/instructions.md', 'Changed instructions after dispatch.\n')
  assert.ok(f.verify(true).errors.some((e) => e.includes('frozen file changed: snapshot/instructions.md')))
  f.freeze()
  const manifest = read(f.dir, 'manifest.json')
  manifest.files = manifest.files.filter((e) => e.path !== 'cases/fact/answer-key.json')
  write(f.dir, 'manifest.json', manifest)
  assert.ok(f.verify(true).errors.some((e) => e.includes('input is not frozen: cases/fact/answer-key.json')))
})

test('changing plan bytes or substituting an unmatched results hash fails', (t) => {
  const f = fixture(t)
  write(f.dir, 'plan.json', { ...f.plan, afterSeeingOutputs: true })
  assert.ok(f.verify().errors.some((e) => e.includes('changed after freezing')))
  f.savePlan()
  f.results.planSha256 = '0'.repeat(64)
  f.saveResults()
  assert.ok(f.verify().errors.some((e) => e.includes('results mode/hash')))
})

test('rewriting an input hash in the manifest cannot reseal a changed snapshot', (t) => {
  const f = fixture(t)
  write(f.dir, 'snapshot/instructions.md', 'Changed after plan freeze.\n')
  const manifest = read(f.dir, 'manifest.json')
  manifest.files.find((file) => file.path === 'snapshot/instructions.md').sha256 = sha256(readFileSync(join(f.dir, 'snapshot/instructions.md')))
  write(f.dir, 'manifest.json', manifest)
  const result = f.verify(true)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => e.includes('hash bound into the frozen plan')))
})

test('missing or duplicated run identities and type/trial tuples cannot pass coverage', (t) => {
  const f = fixture(t)
  const last = f.results.runs.pop()
  f.saveResults()
  assert.ok(f.verify().errors.some((e) => e.includes('result missing run: handoff-2')))
  f.results.runs.push({ ...last, id: 'fact-1' })
  f.saveResults()
  assert.ok(f.verify().errors.some((e) => e.includes('unknown/duplicate result run: fact-1')))
  f.plan.runs[1] = { ...f.plan.runs[1], trial: 1 }
  f.savePlan()
  assert.ok(f.verify(true).errors.some((e) => e.includes('invalid/duplicate type/trial')))
})

test('reader missing/duplicated answers and unsupported answered claims are detected', (t) => {
  const f = fixture(t), path = f.results.runs[0].reader
  const reader = read(f.dir, path)
  reader.answers.pop(); write(f.dir, path, reader)
  assert.ok(f.verify().errors.some((e) => e.includes('reader must answer each question exactly once')))
  reader.answers.push({ ...reader.answers[0] }); write(f.dir, path, reader)
  assert.ok(f.verify().errors.some((e) => e.includes('reader must answer each question exactly once')))
  reader.answers.at(-1).id = 'Q6'
  reader.answers[0].support = ''; write(f.dir, path, reader)
  assert.ok(f.verify().errors.some((e) => e.includes('incomplete reader answer/status/support')))
})

test('broken attachments and actual endnotes fail while fenced examples are ignored', (t) => {
  const f = fixture(t), row = f.results.runs[0]
  const original = readFileSync(join(f.dir, row.document), 'utf8')
  write(f.dir, row.document, original.replace('sources/context.md', 'sources/missing.png'))
  assert.ok(f.verify().errors.some((e) => e.includes('link sources/missing.png')))
  write(f.dir, row.document, original.replace('[^observation]:', '[^other]:'))
  assert.ok(f.verify().errors.some((e) => e.includes('Unmatched endnotes')))
  write(f.dir, row.document, original.replace('## 1. 근거 주석', '````markdown\n![예시](missing.png)\n[^not-a-real-note]\n```\n````\n\n## 1. 근거 주석'))
  assert.equal(f.verify().ok, true)
})

test('gold sources must exist and any declared source lines or headings must resolve', (t) => {
  const f = fixture(t), path = 'cases/fact/answer-key.json'
  const key = read(f.dir, path)
  key.criticalFacts[0].source = 'sources/context.md#없는-절'
  key.questions[0].source = 'sources/context.md:400'
  key.questions[1].source = 'sources/missing.md'
  write(f.dir, path, key); f.freeze()
  const errors = f.verify(true).errors
  assert.ok(errors.some((e) => e.includes('missing source heading')))
  assert.ok(errors.some((e) => e.includes('source lines outside')))
  assert.ok(errors.some((e) => e.includes('sources/missing.md')))
})

test('AI outcomes cannot hide failed or unverified checks and legitimate failures remain valid results', (t) => {
  const f = fixture(t), row = f.results.runs[0]
  const judgment = read(f.dir, row.judgment)
  judgment.criticalChecks[0].outcome = 'unverified'
  write(f.dir, row.judgment, judgment)
  assert.ok(f.verify().errors.some((e) => e.includes('cannot count as pass')))
  judgment.criticalChecks[0].outcome = 'fail'; write(f.dir, row.judgment, judgment)
  row.aiOutcome = 'fail'; f.saveResults()
  assert.equal(f.verify().ok, true, 'a completed baseline diagnostic may correctly find defects')
  judgment.answers.pop(); write(f.dir, row.judgment, judgment)
  assert.ok(f.verify().errors.some((e) => e.includes('judge must grade each reader question once')))
})

test('the aggregate cannot manufacture human validation or reuse one artifact for two runs', (t) => {
  const f = fixture(t)
  f.results.humanValidation = { executed: true, participants: 0, outcome: 'passed' }; f.saveResults()
  assert.ok(f.verify().errors.some((e) => e.includes('must not claim otherwise')))
  f.results.humanValidation = { executed: false, participants: 0 }
  f.results.runs[1].reader = f.results.runs[0].reader; f.saveResults()
  assert.ok(f.verify().errors.some((e) => e.includes('reused reader artifact')))
})
