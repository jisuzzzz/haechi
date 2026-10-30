// Fills a fixed document template (a spec or a request to another team) from a JSON file of fields.
// The model writes the content; this tool owns the headings, labels and table layout so every document looks the same.
// Usage: node render-doc.mjs <spec|request> <fields.json> [--out <file.md>]
// Without --out it prints the document. Labels are fixed English; content is passed through in any language.
// Every missing or invalid field is listed at once, then it exits 2 (also on bad arguments).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REQUEST_STATUSES = ['Pending', 'Accepted', 'Accepted with changes', 'Rejected', 'On hold']
export const DOCUMENT_STATUSES = ['Pending', 'In progress', 'Done']

const isText = (value) => typeof value === 'string' && value.trim() !== ''
const hasNewline = (value) => /[\r\n]/.test(value)

// A round trip through Date.UTC rejects dates the pattern lets through, such as 2026-02-31
export const isCalendarDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

// line: the value lands in a heading, the header line or a table key, where a newline would start new Markdown
const checkText = (errors, path, value, { optional = false, date = false, line = false } = {}) => {
  if (value === undefined || value === null || value === '') {
    if (!optional) errors.push(`${path}: required text is missing`)
  } else if (!isText(value)) errors.push(`${path}: must be non-empty text`)
  else if (date && !isCalendarDate(value)) errors.push(`${path}: must be a real date like 2026-01-31`)
  else if (line && hasNewline(value)) errors.push(`${path}: must be a single line`)
}

const checkOneOf = (errors, path, value, allowed) => {
  checkText(errors, path, value, { line: true })
  if (isText(value) && !hasNewline(value) && !allowed.includes(value)) errors.push(`${path}: must be one of ${allowed.join(' | ')} (got "${value}")`)
}

// Each list must be present as an array, even when empty, so a forgotten field is caught instead of rendering "—"
const checkList = (errors, path, value, checkItem) => {
  if (!Array.isArray(value)) {
    errors.push(`${path}: must be a list (use [] when empty)`)
    return
  }
  value.forEach((item, index) => checkItem(`${path}[${index}]`, item))
}

const textItem = (errors) => (path, item) => checkText(errors, path, item)

const objectItem = (errors, check) => (path, item) => {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) errors.push(`${path}: must be an object`)
  else check(path, item)
}

const checkQuestions = (errors, fields) =>
  checkList(
    errors,
    'openQuestions',
    fields.openQuestions,
    objectItem(errors, (path, item) => {
      checkText(errors, `${path}.question`, item.question)
      checkText(errors, `${path}.answer`, item.answer, { optional: true })
    }),
  )

const checkDecisions = (errors, fields) =>
  checkList(
    errors,
    'decisions',
    fields.decisions,
    objectItem(errors, (path, item) => {
      checkText(errors, `${path}.date`, item.date, { date: true })
      checkText(errors, `${path}.item`, item.item, { line: true })
      checkText(errors, `${path}.decision`, item.decision)
      checkText(errors, `${path}.note`, item.note, { optional: true })
    }),
  )

export const validateFields = (type, fields) => {
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) return ['fields: must be a JSON object']
  const errors = []
  if (type === 'spec') {
    checkText(errors, 'title', fields.title, { line: true })
    checkText(errors, 'date', fields.date, { date: true })
    checkText(errors, 'status', fields.status, { line: true })
    checkText(errors, 'problem', fields.problem)
    checkText(errors, 'goal', fields.goal)
    for (const key of ['inScope', 'outOfScope', 'behavior', 'acceptance', 'constraints']) checkList(errors, key, fields[key], textItem(errors))
    checkList(
      errors,
      'edgeCases',
      fields.edgeCases,
      objectItem(errors, (path, item) => {
        checkText(errors, `${path}.case`, item.case)
        checkText(errors, `${path}.decision`, item.decision)
      }),
    )
  } else {
    for (const key of ['title', 'from', 'to']) checkText(errors, key, fields[key], { line: true })
    checkText(errors, 'date', fields.date, { date: true })
    checkOneOf(errors, 'status', fields.status, DOCUMENT_STATUSES)
    checkText(errors, 'related', fields.related, { optional: true, line: true })
    checkList(
      errors,
      'requests',
      fields.requests,
      objectItem(errors, (path, item) => {
        for (const key of ['id', 'priority']) checkText(errors, `${path}.${key}`, item[key], { line: true })
        for (const key of ['request', 'why', 'contract', 'proof']) checkText(errors, `${path}.${key}`, item[key])
        checkText(errors, `${path}.due`, item.due, { optional: true, line: true })
        for (const key of ['alternatives', 'rollout']) checkText(errors, `${path}.${key}`, item[key], { optional: true })
        checkOneOf(errors, `${path}.status`, item.status, REQUEST_STATUSES)
      }),
    )
    if (Array.isArray(fields.requests) && fields.requests.length === 0) errors.push('requests: needs at least one request')
  }
  checkQuestions(errors, fields)
  checkDecisions(errors, fields)
  return errors
}

export const escapeCell = (value) => (isText(value) ? value.trim().replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>') : '—')

const table = (headers, rows) => {
  if (!rows.length) return '—'
  const line = (cells) => `| ${cells.map(escapeCell).join(' | ')} |`
  return [line(headers), `|${headers.map(() => '---').join('|')}|`, ...rows.map(line)].join('\n')
}

// Continuation lines are indented so a multi-line item stays inside its bullet
const bullets = (items) => (items.length ? items.map((item) => `- ${item.trim().replace(/\r?\n/g, '\n  ')}`).join('\n') : '—')

const questions = (items) => bullets(items.map((item, index) => `Q${index + 1}. ${item.question.trim()} → Answer: ${isText(item.answer) ? item.answer.trim() : '—'}`))

const decisionLog = (items) => table(['Date', 'Item', 'Decision', 'Note'], items.map((item) => [item.date, item.item, item.decision, item.note]))

const section = (heading, body) => `## ${heading}\n\n${body}`

const renderSpec = (fields) =>
  [
    `# ${fields.title.trim()}`,
    `Date: ${fields.date} · Status: ${fields.status.trim()}`,
    section('Problem', fields.problem.trim()),
    section('Goal', fields.goal.trim()),
    section('In scope', bullets(fields.inScope)),
    section('Out of scope', bullets(fields.outOfScope)),
    section('Expected behavior', bullets(fields.behavior)),
    section('Edge cases', table(['Case', 'Decision'], fields.edgeCases.map((item) => [item.case, item.decision]))),
    section('Acceptance criteria', bullets(fields.acceptance)),
    section('Constraints', bullets(fields.constraints)),
    section('Open questions', questions(fields.openQuestions)),
    section('Decision log', decisionLog(fields.decisions)),
  ]

const requestDetail = (item) => {
  const lines = [item.contract.trim()]
  if (isText(item.alternatives)) lines.push(`Alternatives: ${item.alternatives.trim()}`)
  if (isText(item.rollout)) lines.push(`Rollout: ${item.rollout.trim()}`)
  lines.push(`Proof: ${item.proof.trim()}`)
  return section(item.id.trim(), lines.join('\n\n'))
}

const renderRequest = (fields) => {
  const header = [`From: ${fields.from.trim()} → To: ${fields.to.trim()}`, `Date: ${fields.date}`, `Status: ${fields.status}`]
  if (isText(fields.related)) header.push(`Related: ${fields.related.trim()}`)
  const rows = fields.requests.map((item) => [item.id, item.request, item.priority, item.why, item.due, item.status])
  return [
    `# ${fields.title.trim()}`,
    header.join(' · '),
    section('Requests', table(['ID', 'Request', 'Priority', 'Why', 'Due', 'Status'], rows)),
    ...fields.requests.map(requestDetail),
    section('Open questions', questions(fields.openQuestions)),
    section('Decision log', decisionLog(fields.decisions)),
  ]
}

// Call validateFields first; this assumes the fields are valid
export const renderDoc = (type, fields) => `${(type === 'spec' ? renderSpec(fields) : renderRequest(fields)).join('\n\n')}\n`

export const parseArgs = (argv) => {
  const positional = []
  let out
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && i + 1 < argv.length) out = argv[++i]
    else if (argv[i].startsWith('--')) throw new Error(`unknown or incomplete argument "${argv[i]}"`)
    else positional.push(argv[i])
  }
  const [type, fieldsFile] = positional
  if (positional.length !== 2) throw new Error('expected a document type and a fields file')
  if (type !== 'spec' && type !== 'request') throw new Error(`document type must be spec or request (got "${type}")`)
  return { type, fieldsFile, out }
}

const main = () => {
  const fail = (lines) => {
    for (const line of lines) console.error(`render-doc: ${line}`)
    process.exit(2)
  }
  let options
  let fields
  try {
    options = parseArgs(process.argv.slice(2))
    fields = JSON.parse(readFileSync(options.fieldsFile, 'utf8').replace(/^﻿/, ''))
  } catch (error) {
    fail([error.message, 'usage: node render-doc.mjs <spec|request> <fields.json> [--out <file.md>]'])
  }
  const errors = validateFields(options.type, fields)
  if (errors.length) fail([`${errors.length} problem(s) in ${options.fieldsFile}:`, ...errors.map((error) => `  ${error}`)])
  const text = renderDoc(options.type, fields)
  if (!options.out) {
    process.stdout.write(text)
    return
  }
  mkdirSync(dirname(options.out), { recursive: true })
  writeFileSync(options.out, text)
  console.log(`render-doc: wrote ${options.out}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
