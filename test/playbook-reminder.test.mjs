import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { transition, handle } from '../core/tools/playbook-reminder.mjs'
const edit = { tool_name: 'Edit', tool_input: { file_path: '/repo/src/app.ts' } }
test('source edits remind once without denying execution', () => {
  const first = transition({}, 'PreToolUse', edit)
  assert.match(first.context, /not blocked/)
  assert.equal(transition(first.state, 'PreToolUse', edit).context, undefined)
  assert.equal(transition({}, 'PreToolUse', { ...edit, tool_input: { file_path: '/repo/docs/a.md' } }).context, undefined)
})
test('only observed successful playbook tools suppress reminders', () => {
  for (const input of [
    { tool_name: 'Skill', tool_input: { skill: 'haechi:feature' } },
    { tool_name: 'Read', tool_input: { file_path: '/plugin/skills/bug/SKILL.md' } },
  ]) {
    assert.equal(transition(transition({}, 'PostToolUse', input).state, 'PreToolUse', edit).context, undefined)
    assert.ok(transition(transition({}, 'PreToolUse', input).state, 'PreToolUse', edit).context)
  }
  assert.ok(transition(transition({}, 'PostToolUse', { tool_name: 'Skill', tool_input: { skill: 'haechi:preview' } }).state, 'PreToolUse', edit).context)
})
test('state persists and is isolated by session and repository', () => {
  const dir = mkdtempSync(join(tmpdir(), 'haechi-reminder-'))
  const input = { ...edit, session_id: 'a', cwd: '/repo' }
  assert.ok(handle('PreToolUse', input, dir))
  assert.equal(handle('PreToolUse', input, dir), undefined)
  assert.ok(handle('PreToolUse', { ...input, session_id: 'b' }, dir))
  assert.ok(handle('PreToolUse', { ...input, cwd: '/other' }, dir))
})
