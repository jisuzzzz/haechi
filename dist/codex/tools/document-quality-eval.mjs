// Checks the integrity and coverage of a baseline-only document evaluation.
// It does not judge writing, case truth, model independence or human comprehension.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { headingAnchor, validateNotes } from './document-template.mjs'


















const TYPES = ['fact', 'change', 'bug', 'retirement', 'performance', 'handoff']
const HASH = /^(?:sha256:)?([a-f0-9]{64})$/i
const LIMIT = 'Integrity/coverage checks only. AI judgments are recorded claims, not proof of human readability or causal template improvement.'
export const sha256 = (bytes        )         => createHash('sha256').update(bytes).digest('hex')
const present = (value         )          => typeof value === 'string' ? Boolean(value.trim()) : Array.isArray(value) ? value.length > 0 : value !== null && typeof value === 'object' && Object.keys(value).length > 0
const exactIds =                             (rows                 , ids           )              => Array.isArray(rows) && rows.length === ids.length && new Set(rows.map((r) => r?.id)).size === ids.length && ids.every((id) => rows.some((row) => row?.id === id))

const readableLines = (text        )           => {
  let fence
  return text.replace(/\r\n/g, '\n').split('\n').map((line) => {
    const block = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (block) {
      if (!fence) fence = { char: block[1][0], length: block[1].length }
      else if (block[1][0] === fence.char && block[1].length >= fence.length && !block[2].trim()) fence = undefined
      return ''
    }
    return fence ? '' : line.replace(/(`+).*?\1/g, '')
  })
}

export const verifyEvaluation = (directory = dirname(fileURLToPath(import.meta.url)), { preflight = false }                          = {}) => {
  const root = resolve(directory)
  const errors           = []
  const add = (message        ) => errors.push(message)
  const local = (path         , from = root)         => {
    if (typeof path !== 'string' || !path.trim() || isAbsolute(path) || /^[a-z][a-z\d+.-]*:/i.test(path)) throw new Error('expected a relative evaluation path')
    const full = resolve(from, path)
    const rel = relative(root, full)
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('path leaves the evaluation directory')
    // Prevent a portable-looking path from depending on a file outside the saved evaluation.
    if (existsSync(full)) {
      const actual = relative(realpathSync(root), realpathSync(full))
      if (actual === '..' || actual.startsWith(`..${sep}`) || isAbsolute(actual)) throw new Error('symlink leaves the evaluation directory')
    }
    return full
  }
  const bytes = (path        )         => {
    const full = local(path)
    if (!statSync(full).isFile()) throw new Error(`${path}: not a file`)
    const data = readFileSync(full)
    if (!data.length) throw new Error(`${path}: empty file`)
    return data
  }
  const json =     (path        )    => JSON.parse(bytes(path).toString('utf8').replace(/^\uFEFF/, ''))
  const attempt =     (label        , fn         )                => {
    try { return fn() } catch (error) { add(`${label}: ${(error         ).message}`); return undefined }
  }
  const walk = (dir        )           => existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(resolve(dir, e.name)) : [relative(root, resolve(dir, e.name)).split(sep).join('/')]) : []
  const validateSource = (reference         , caseDir        , label        )       => {
    if (Array.isArray(reference)) {
      if (!reference.length) add(`${label}: source list is empty`)
      reference.forEach((item) => validateSource(item, caseDir, label))
      return
    }
    attempt(label, () => {
      if (typeof reference !== 'string' || !reference.trim()) throw new Error('source must name a file')
      const [rawPath, fragment] = reference.split('#')
      const lineMatch = rawPath.match(/:(\d+)(?:-(\d+))?$/)
      const path = lineMatch ? rawPath.slice(0, lineMatch.index) : rawPath
      const from = path.startsWith('cases/') ? root : caseDir
      const full = local(path, from)
      if (!statSync(full).isFile() || !statSync(full).size) throw new Error(`missing/empty source ${reference}`)
      const text = readFileSync(full, 'utf8')
      if (lineMatch && (+lineMatch[1] < 1 || +(lineMatch[2] ?? lineMatch[1]) < +lineMatch[1] || +(lineMatch[2] ?? lineMatch[1]) > text.split('\n').length)) throw new Error(`source lines outside ${path}`)
      if (fragment && /\.md$/i.test(path)) {
        const anchors = readableLines(text).filter((line) => /^#{1,6} /.test(line)).map((line) => headingAnchor(line.replace(/^#{1,6} /, '')))
        if (!anchors.includes(decodeURIComponent(fragment))) throw new Error(`missing source heading ${reference}`)
      }
    })
  }
  const planBytes = attempt('plan.json', () => bytes('plan.json'))
  const plan = attempt('plan.json', () => json                ('plan.json'))
  const expectedHash = attempt('plan.sha256', () => {
    const match = bytes('plan.sha256').toString('utf8').trim().match(HASH)
    if (!match) throw new Error('expected one SHA-256 digest')
    return match[1].toLowerCase()
  })
  const planHash = planBytes && sha256(planBytes)
  if (expectedHash && planHash !== expectedHash) add('plan.json changed after freezing')
  const manifest = attempt('manifest.json', () => json          ('manifest.json'))
  const manifestBytes = attempt('manifest.json', () => bytes('manifest.json'))
  if (!plan?.manifestSha256 || (manifestBytes && plan.manifestSha256 !== sha256(manifestBytes))) add('manifest.json does not match the hash bound into the frozen plan')
  const frozen = new Set        ()
  if (!Array.isArray(manifest?.files) || !manifest.files.length) add('manifest.files must be a nonempty list')
  else for (const entry of manifest.files) {
    attempt('manifest entry', () => {
      if (!entry || typeof entry.path !== 'string' || !HASH.test(entry.sha256 ?? '')) throw new Error('each entry needs path and SHA-256')
      if (frozen.has(entry.path)) throw new Error(`duplicate frozen file ${entry.path}`)
      frozen.add(entry.path)
      const expected = entry.sha256.replace(/^sha256:/i, '').toLowerCase()
      if (sha256(bytes(entry.path)) !== expected) throw new Error(`frozen file changed: ${entry.path}`)
    })
  }
  if (![...frozen].some((path) => /^snapshots?\//.test(path))) add('manifest must identify the current instruction/tool snapshot')
  for (const path of [...walk(resolve(root, 'cases')), ...walk(resolve(root, 'snapshot')), ...walk(resolve(root, 'snapshots'))]) {
    if (!frozen.has(path)) add(`input is not frozen: ${path}`)
  }
  for (const path of ['rubric.json', 'sources.md']) if (existsSync(resolve(root, path)) && !frozen.has(path)) add(`input is not frozen: ${path}`)
  const rubric = attempt('rubric.json', () => json        ('rubric.json'))
  const criteria = rubric?.criticalCriteria?.map((c) => c?.id)
  if (!Array.isArray(criteria) || !criteria.length || criteria.some((id) => !present(id)) || new Set(criteria).size !== criteria.length) add('rubric must declare unique criticalCriteria ids')

  const caseQuestions = new Map                  ()
  for (const type of TYPES) {
    const caseDir = resolve(root, 'cases', type)
    attempt(`${type}/case.md`, () => bytes(`cases/${type}/case.md`))
    const questions = attempt(`${type}/questions.json`, () => json            (`cases/${type}/questions.json`))
    const key = attempt(`${type}/answer-key.json`, () => json           (`cases/${type}/answer-key.json`))
    const ids = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6']
    if (!exactIds(questions, ids) || questions.some((q) => !present(q.text))) add(`${type}: questions must contain Q1..Q6 once with text`)
    else caseQuestions.set(type, ids)
    if (key?.caseId !== type || key?.type !== type) add(`${type}: answer-key case/type mismatch`)
    if (!exactIds(key?.questions, ids)) add(`${type}: answer key must answer Q1..Q6 once`)
    else for (const q of key.questions) {
      if (!present(q.expected) || !Array.isArray(q.unacceptable) || typeof q.critical !== 'boolean') add(`${type}/${q.id}: expected, unacceptable list and critical boolean required`)
      validateSource(q.source, caseDir, `${type}/${q.id}`)
    }
    if (!Array.isArray(key?.criticalFacts) || !key.criticalFacts.length || new Set(key.criticalFacts.map((f) => f?.id)).size !== key.criticalFacts.length) add(`${type}: unique criticalFacts required`)
    else for (const fact of key.criticalFacts) {
      if (!present(fact?.id) || !present(fact?.assertion)) add(`${type}: critical fact lacks id/assertion`)
      validateSource(fact?.source, caseDir, `${type}/${fact?.id}`)
    }
  }

  if (plan?.mode !== 'baseline_diagnostic') add('plan.mode must be baseline_diagnostic')
  if (!Array.isArray(plan?.types) || plan.types.length !== TYPES.length || new Set(plan.types).size !== TYPES.length || TYPES.some((type) => !plan.types.includes(type))) add('plan must declare exactly the six document types')
  if (plan?.trialsPerType !== 2) add('plan.trialsPerType must be 2')
  const planned = new Map                    (), tuples = new Set        ()
  if (!Array.isArray(plan?.runs) || plan.runs.length !== 12) add('plan must contain exactly 12 runs')
  else for (const run of plan.runs) {
    if (!run || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(run.id ?? '') || planned.has(run.id)) add('plan has an invalid/duplicate run id')
    else planned.set(run.id, run)
    const tuple = `${run?.type}:${run?.trial}`
    if (!TYPES.includes(run?.type) || ![1, 2].includes(run?.trial) || tuples.has(tuple)) add(`plan has an invalid/duplicate type/trial: ${tuple}`)
    tuples.add(tuple)
  }

  const counts = { cases: caseQuestions.size, plannedRuns: planned.size, resultRuns: 0, documents: 0, readerAnswers: 0 }
  if (!preflight) {
    const results = attempt('results.json', () => json                   ('results.json'))
    if (results?.mode !== 'baseline_diagnostic' || results?.planSha256 !== planHash) add('results mode/hash do not match the frozen plan')
    const human = results?.humanValidation
    if (human?.executed !== false || human?.participants !== 0 || results?.humanValidated === true || /^(?:pass|passed|validated|approved|completed)$/i.test(human?.outcome ?? '')) add('human validation was not executed; aggregate must not claim otherwise')
    const rows = results?.runs
    if (!Array.isArray(rows) || rows.length !== planned.size) add('results must cover every planned run')
    const seen = new Set        (), artifacts = new Set         ()
    for (const row of Array.isArray(rows) ? rows : []) {
      const run = planned.get(row?.id)
      if (!run || seen.has(row.id)) { add(`unknown/duplicate result run: ${row?.id}`); continue }
      seen.add(row.id); counts.resultRuns++
      if (row.type !== run.type || row.trial !== run.trial) add(`${row.id}: result type/trial differs from plan`)
      if (!['pass', 'fail', 'inconclusive'].includes(row.aiOutcome)) add(`${row.id}: invalid AI outcome`)
      for (const name of ['document', 'reader', 'judgment']) {
        if (typeof row[name] !== 'string' || artifacts.has(row[name])) add(`${row.id}: missing or reused ${name} artifact`)
        else artifacts.add(row[name])
      }
      const text = attempt(`${row.id}/document`, () => bytes(row.document).toString('utf8'))
      if (text !== undefined) {
        counts.documents++
        attempt(`${row.id}/endnotes`, () => validateNotes(text))
        for (const match of readableLines(text).join('\n').matchAll(/!?\[[^\]\n]*\]\((?:<([^>]+)>|([^)]+))\)/g)) {
          const target = (match[1] ?? match[2]).replace(/\s+["'][\s\S]*$/, '').trim()
          if (!target || target.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(target)) continue
          attempt(`${row.id}/link ${target}`, () => {
            const path = decodeURIComponent(target.split('#')[0])
            const full = local(path, dirname(local(row.document)))
            if (!statSync(full).isFile() || !statSync(full).size) throw new Error('attachment/source file missing or empty')
          })
        }
      }
      const reader = attempt(`${row.id}/reader`, () => json        (row.reader))
      const ids = caseQuestions.get(run.type) ?? []
      if (!exactIds(reader?.answers, ids)) add(`${row.id}: reader must answer each question exactly once`)
      else for (const answer of reader.answers) {
        counts.readerAnswers++
        if (!present(answer.answer) || !['answered', 'not_stated', 'ambiguous'].includes(answer.status) || (answer.status === 'answered' && !present(answer.support))) add(`${row.id}/${answer.id}: incomplete reader answer/status/support`)
      }
      const judgment = attempt(`${row.id}/judgment`, () => json          (row.judgment))
      if (judgment?.id !== row.id) add(`${row.id}: judgment id mismatch`)
      if (!Array.isArray(judgment?.criticalChecks) || !judgment.criticalChecks.length) add(`${row.id}: critical checks missing`)
      else if (judgment.criticalChecks.some((check) => !present(check?.criterion))) add(`${row.id}: critical checks must identify their criterion`)
      else if (Array.isArray(criteria) && !exactIds(judgment.criticalChecks.map((c) => ({ id: c.criterion })), criteria)) add(`${row.id}: judge must cover every frozen critical criterion exactly once`)
      if (!exactIds(judgment?.answers, ids)) add(`${row.id}: judge must grade each reader question once`)
      if (!Array.isArray(judgment?.findings) || !Array.isArray(judgment?.humanOnly)) add(`${row.id}: findings and humanOnly must be arrays`)
      const checks = [...(Array.isArray(judgment?.criticalChecks) ? judgment.criticalChecks : []), ...(Array.isArray(judgment?.answers) ? judgment.answers : [])]
      for (const check of checks) if (!['pass', 'fail', 'unverified'].includes(check?.outcome) || !present(check?.reason) || !present(check?.evidence)) add(`${row.id}: judgment needs valid outcome, reason and evidence`)
      if (row.aiOutcome === 'pass' && (!checks.length || checks.some((check) => check.outcome !== 'pass'))) add(`${row.id}: missing, failed or unverified checks cannot count as pass`)
    }
    for (const id of planned.keys()) if (!seen.has(id)) add(`result missing run: ${id}`)
  }
  return { ok: errors.length === 0, stage: preflight ? 'preflight' : 'final', mode: 'baseline_diagnostic', counts, errors, limit: LIMIT }
}

const main = () => {
  let root = dirname(fileURLToPath(import.meta.url)), preflight = false
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--preflight') preflight = true
    else if (process.argv[i] === '--root' && process.argv[i + 1]) root = resolve(process.argv[++i])
    else throw new Error('Usage: node document-quality-eval.mjs [--preflight] [--root <evaluation directory>]')
  }
  const report = verifyEvaluation(root, { preflight })
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 2
}
if (process.argv[1] && existsSync(process.argv[1]) && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  try { main() } catch (error) { console.error((error         ).message); process.exitCode = 2 }
}
