import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { select, handle } from '../tools/skill-context.mjs'

test('only explicit leading primary commands change the user selection', () => {
  const selected = select(null, '/haechi:feature change animation')
  assert.deepEqual(selected, { skill: 'feature', task: 'change animation', source: 'user' })
  for (const prompt of ['change animation', 'Please use /haechi:bug', '`/haechi:bug`', '/haechi:preview show variants', '/haechi:unknown', undefined]) assert.deepEqual(select(selected, prompt), selected)
  assert.equal(select(selected, '/haechi:bug fix crash').skill, 'bug')
  assert.equal(select(selected, '/haechi:context clear'), null)
})
test('context survives independent hook calls and compaction; clear and isolation work', () => {
  const dir = mkdtempSync(join(tmpdir(), 'haechi-context-'))
  const input = { session_id: 'one', cwd: '/repo', prompt: '/haechi:feature animation' }
  assert.match(handle('UserPromptSubmit', input, dir), /animation/)
  assert.match(handle('UserPromptSubmit', { ...input, prompt: 'continue' }, dir), /animation/)
  assert.match(handle('SessionStart', { ...input, source: 'compact' }, dir), /animation/)
  assert.equal(handle('SessionStart', { ...input, session_id: 'two' }, dir), undefined)
  assert.equal(handle('SessionStart', { ...input, cwd: '/other' }, dir), undefined)
  assert.equal(handle('UserPromptSubmit', { ...input, prompt: '/haechi:context clear' }, dir), undefined)
  assert.equal(handle('SessionStart', input, dir), undefined)
  handle('UserPromptSubmit', input, dir)
  assert.equal(handle('SessionStart', { ...input, source: 'clear' }, dir), undefined)
})
test('missing session IDs never share state and tool events cannot select a skill', () => {
  const dir = mkdtempSync(join(tmpdir(), 'haechi-context-'))
  assert.match(handle('UserPromptSubmit', { prompt: '/haechi:feature demo' }, dir), /demo/)
  assert.equal(handle('UserPromptSubmit', { prompt: 'continue' }, dir), undefined)
  assert.equal(handle('PostToolUse', { session_id: 'one', tool_name: 'Skill', tool_input: { skill: 'haechi:feature' } }, dir), undefined)
})
test('both distributions register user context hooks without editing gates', () => {
  for (const platform of ['codex', 'claude']) {
    const config = JSON.parse(readFileSync(new URL(`../dist/${platform}/hooks/hooks.json`, import.meta.url)))
    assert.equal(config.hooks.PreToolUse, undefined)
    assert.equal(config.hooks.PostToolUse, undefined)
    for (const event of ['SessionStart', 'UserPromptSubmit']) assert.ok(config.hooks[event].some(group => group.hooks.some(hook => hook.command.includes(`skill-context.mjs ${event}`))))
  }
})
