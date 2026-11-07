import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { select, handle } from '../dist/claude/tools/skill-context.mjs'

test('only explicit leading primary commands change the user selection', () => {
  const selected = select(null, '/haechi:feature change animation')
  assert.deepEqual(selected, { skill: 'feature', task: 'change animation', source: 'user' })
  for (const prompt of ['change animation', 'show a UI preview', 'Please use /haechi:bug', '`/haechi:bug`', '/haechi:spec define behavior', '/haechi:unknown', undefined]) assert.deepEqual(select(selected, prompt), selected)
  assert.deepEqual(select(selected, '/haechi:preview show variants'), selected)
  assert.equal(select(selected, '/haechi:bug fix crash').skill, 'bug')
  assert.equal(select(selected, '/haechi:context clear'), null)
})
for (const platform of ['claude', 'codex']) {
  test(`${platform}: preview works as a supporting skill without replacing the task context`, async (t) => {
    const { handle } = await import(`../dist/${platform}/tools/skill-context.mjs`)
    const dir = mkdtempSync(join(tmpdir(), 'haechi-preview-context-'))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    const input = { session_id: 'preview-session', cwd: '/repo' }
    const selectionOf = text => JSON.parse(text.split('\n')[0].slice(text.indexOf('{')))
    const initial = handle('UserPromptSubmit', { ...input, prompt: '/haechi:preview sketch menu' }, dir)
    assert.equal(initial, undefined)
    assert.equal(handle('SessionStart', input, dir), undefined)
    const feature = handle('UserPromptSubmit', { ...input, prompt: '/haechi:feature build menu' }, dir)
    assert.deepEqual(selectionOf(feature), { skill: 'feature', task: 'build menu', source: 'user' })
    const preview = handle('UserPromptSubmit', { ...input, prompt: '/haechi:preview compare menu states' }, dir)
    assert.equal(preview, feature)
    for (const prompt of ['continue', '/haechi:spec define menu behavior', 'Please use /haechi:feature', '`/haechi:feature`']) {
      assert.equal(handle('UserPromptSubmit', { ...input, prompt }, dir), preview)
    }
    assert.equal(handle('PostToolUse', { ...input, prompt: '/haechi:feature implement menu' }, dir), preview)
    assert.equal(handle('SessionStart', { ...input, source: 'compact' }, dir), preview)
    assert.equal(handle('SessionStart', { ...input, session_id: 'other-session' }, dir), undefined)
    assert.equal(handle('SessionStart', { ...input, cwd: '/other' }, dir), undefined)
    const next = handle('UserPromptSubmit', { ...input, prompt: '/haechi:feature implement selected menu' }, dir)
    assert.deepEqual(selectionOf(next), { skill: 'feature', task: 'implement selected menu', source: 'user' })
    handle('UserPromptSubmit', { ...input, prompt: '/haechi:preview check menu' }, dir)
    assert.equal(handle('UserPromptSubmit', { ...input, prompt: '/haechi:context clear' }, dir), undefined)
    assert.equal(handle('SessionStart', input, dir), undefined)
  })
}
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
