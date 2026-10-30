import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { escapeCell, renderDoc, validateFields } from '../tools/render-doc.mjs'

const tool = join(import.meta.dirname, '..', 'tools', 'render-doc.mjs')
const run = (args) => spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' })
const writeFields = (fields) => {
  const file = join(mkdtempSync(join(tmpdir(), 'render-doc-')), 'fields.json')
  writeFileSync(file, JSON.stringify(fields))
  return file
}

const spec = () => ({
  title: 'Bulk archive for todo lists',
  date: '2026-01-15',
  status: 'Draft',
  problem: 'Users archive finished todos one at a time.',
  goal: 'Archive every finished todo in a list with one action.',
  inScope: ['Archive button in the list header'],
  outOfScope: ['Undo after 30 days'],
  behavior: ['The button archives only finished todos', 'A toast shows the count'],
  edgeCases: [{ case: 'No finished todos', decision: 'Button is disabled' }],
  acceptance: ['Archiving 3 of 5 todos leaves 2 in the list'],
  constraints: [],
  openQuestions: [{ question: 'Should shared lists allow it?', answer: 'Owner only' }, { question: 'Confirm dialog?' }],
  decisions: [{ date: '2026-01-16', item: 'Shared lists', decision: 'Owner only' }],
})

const request = () => ({
  title: 'Order export fields',
  from: 'Web team',
  to: 'Orders API team',
  date: '2026-02-01',
  status: 'Pending',
  requests: [
    {
      id: 'REQ-1',
      request: 'Add currency to GET /api/orders',
      priority: 'P0',
      why: 'Totals are ambiguous without it',
      status: 'Pending',
      contract: '`currency`: ISO 4217 code, never null.',
      proof: 'Response for order 42 includes "currency": "EUR"',
    },
    {
      id: 'REQ-2',
      request: 'Rename `amt` to `amount`',
      priority: 'P1',
      why: 'Clarity',
      due: '2026-03-01',
      status: 'Accepted with changes',
      contract: 'Both names during the transition.',
      alternatives: 'Keep `amt` and document it',
      rollout: 'Add `amount` first, remove `amt` one release later',
      proof: 'Contract test passes with `amount` only',
    },
  ],
  openQuestions: [],
  decisions: [],
})

test('spec: renders every section with fixed English labels', () => {
  assert.deepEqual(validateFields('spec', spec()), [])
  const text = renderDoc('spec', spec())
  const lines = text.split('\n')
  assert.equal(lines[0], '# Bulk archive for todo lists')
  assert.ok(lines.includes('Date: 2026-01-15 · Status: Draft'))
  const headings = lines.filter((line) => line.startsWith('## '))
  assert.deepEqual(headings, [
    '## Problem',
    '## Goal',
    '## In scope',
    '## Out of scope',
    '## Expected behavior',
    '## Edge cases',
    '## Acceptance criteria',
    '## Constraints',
    '## Open questions',
    '## Decision log',
  ])
  assert.ok(lines.includes('- A toast shows the count'))
  assert.ok(lines.includes('| No finished todos | Button is disabled |'))
  assert.match(text, /## Constraints\n\n—\n/)
  assert.ok(lines.includes('- Q1. Should shared lists allow it? → Answer: Owner only'))
  assert.ok(lines.includes('- Q2. Confirm dialog? → Answer: —'))
  assert.ok(lines.includes('| 2026-01-16 | Shared lists | Owner only | — |'))
})

test('request: header, requests table, per-request sections and empty lists', () => {
  assert.deepEqual(validateFields('request', request()), [])
  const text = renderDoc('request', request())
  const lines = text.split('\n')
  assert.equal(lines[0], '# Order export fields')
  assert.ok(lines.includes('From: Web team → To: Orders API team · Date: 2026-02-01 · Status: Pending'))
  assert.ok(lines.includes('| ID | Request | Priority | Why | Due | Status |'))
  assert.ok(lines.includes('| REQ-1 | Add currency to GET /api/orders | P0 | Totals are ambiguous without it | — | Pending |'))
  assert.ok(lines.includes('| REQ-2 | Rename `amt` to `amount` | P1 | Clarity | 2026-03-01 | Accepted with changes |'))
  assert.ok(lines.includes('Alternatives: Keep `amt` and document it'))
  assert.ok(lines.includes('Rollout: Add `amount` first, remove `amt` one release later'))
  assert.ok(lines.includes('Proof: Contract test passes with `amount` only'))
  assert.match(text, /## Open questions\n\n—\n\n## Decision log\n\n—\n$/)
})

test('optional sections and fields are left out when not given', () => {
  const text = renderDoc('request', request())
  const first = text.slice(text.indexOf('## REQ-1'), text.indexOf('## REQ-2'))
  assert.doesNotMatch(first, /Alternatives:|Rollout:/)
  assert.match(first, /Proof: Response for order 42/)
  assert.doesNotMatch(text, /Related:/)
  const related = renderDoc('request', { ...request(), related: 'https://example.com/design' })
  assert.match(related, /Status: Pending · Related: https:\/\/example\.com\/design\n/)
})

test('validation lists every problem at once', () => {
  const errors = validateFields('request', {
    title: 'x',
    to: '',
    date: '2026/02/01',
    status: 'Open',
    requests: [{ id: 'REQ-1', request: 'r', why: 'w', status: 'Maybe', contract: 'c', proof: 'p', due: 5 }],
    decisions: [{ date: '2026-02-02', item: 'i' }],
  })
  for (const expected of [
    /^from: required/,
    /^to: required/,
    /^date: must be a real date/,
    /^status: must be one of Pending \| In progress \| Done/,
    /^requests\[0\]\.priority: required/,
    /^requests\[0\]\.due: must be non-empty text/,
    /^requests\[0\]\.status: must be one of Pending \| Accepted \| Accepted with changes \| Rejected \| On hold/,
    /^openQuestions: must be a list/,
    /^decisions\[0\]\.decision: required/,
  ]) {
    assert.ok(errors.some((error) => expected.test(error)), `missing ${expected} in\n${errors.join('\n')}`)
  }
  assert.ok(validateFields('spec', { ...spec(), behavior: undefined, edgeCases: [{ case: 'c' }] }).length >= 2)
  assert.deepEqual(validateFields('request', { ...request(), requests: [] }), ['requests: needs at least one request'])
})

test('single-line fields reject newlines, listed together', () => {
  const fields = request()
  fields.title = 'T\n## Injected'
  fields.from = 'Web\r\nteam'
  fields.related = 'a\nb'
  fields.requests[0].id = 'REQ-1\n## Extra'
  fields.requests[0].priority = 'P0\n'
  fields.requests[1].due = '2026-03-01\nlater'
  fields.decisions = [{ date: '2026-02-02', item: 'x\ny', decision: 'Multi\nline is fine here' }]
  const errors = validateFields('request', fields)
  for (const path of ['title', 'from', 'related', 'requests[0].id', 'requests[0].priority', 'requests[1].due', 'decisions[0].item']) {
    assert.ok(errors.includes(`${path}: must be a single line`), `missing ${path} in\n${errors.join('\n')}`)
  }
  assert.equal(errors.length, 7)
  assert.deepEqual(validateFields('request', { ...request(), status: 'Pending\nDone' }), ['status: must be a single line'])
  assert.deepEqual(validateFields('spec', { ...spec(), status: 'Draft\n## X' }), ['status: must be a single line'])
  assert.deepEqual(validateFields('spec', { ...spec(), problem: 'Line one.\nLine two.' }), [])
})

test('dates must exist on the calendar', () => {
  for (const date of ['2026-02-31', '2026-13-01', '2026-00-10', '2026-04-31', '2025-02-29']) {
    assert.deepEqual(validateFields('spec', { ...spec(), date }), ['date: must be a real date like 2026-01-31'], date)
  }
  assert.deepEqual(validateFields('spec', { ...spec(), date: '2028-02-29' }), [])
  const decisions = [{ date: '2026-06-31', item: 'i', decision: 'd' }]
  assert.deepEqual(validateFields('spec', { ...spec(), decisions }), ['decisions[0].date: must be a real date like 2026-01-31'])
})

test('table cells escape pipes and newlines', () => {
  assert.equal(escapeCell('a | b\nc\r\nd'), 'a \\| b<br>c<br>d')
  assert.equal(escapeCell(undefined), '—')
  const fields = spec()
  fields.edgeCases = [{ case: 'Title has | in it', decision: 'Show it\nas typed' }]
  assert.ok(renderDoc('spec', fields).split('\n').includes('| Title has \\| in it | Show it<br>as typed |'))
})

test('CLI: prints to stdout, writes --out, exits 2 on invalid fields or arguments', () => {
  const file = writeFields(spec())
  const printed = run(['spec', file])
  assert.equal(printed.status, 0, printed.stderr)
  assert.match(printed.stdout, /^# Bulk archive for todo lists\n/)

  const out = join(mkdtempSync(join(tmpdir(), 'render-doc-out-')), 'requests', '2026-02-01-order-export.md')
  const written = run(['request', writeFields(request()), '--out', out])
  assert.equal(written.status, 0, written.stderr)
  assert.equal(readFileSync(out, 'utf8'), renderDoc('request', request()))

  const invalid = run(['spec', writeFields({ title: 'only a title' })])
  assert.equal(invalid.status, 2)
  assert.match(invalid.stderr, /problem\(s\)/)
  assert.match(invalid.stderr, /goal: required/)
  assert.match(invalid.stderr, /acceptance: must be a list/)
  assert.equal(invalid.stdout, '')

  const bomFile = writeFields(spec())
  writeFileSync(bomFile, `﻿${readFileSync(bomFile, 'utf8')}`)
  const bom = run(['spec', bomFile])
  assert.equal(bom.status, 0, bom.stderr)
  assert.equal(bom.stdout, printed.stdout)

  assert.equal(run(['memo', file]).status, 2)
  assert.equal(run(['spec']).status, 2)
})
