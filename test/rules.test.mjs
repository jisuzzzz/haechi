import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

import { buildFiles, loadSource } from '../build/build.mjs'
import {
  fullBlock,
  nextInjection,
  reminderBlock,
  spawnAppendix,
} from '../hooks/rules.mts'

const sourceDir = join(import.meta.dirname, '..')
const template = readFileSync(join(sourceDir, 'hooks', 'rules.md'), 'utf8')

test('full block on first prompt and after compaction, reminder otherwise', () => {
  let state = { shown: false, compacted: false }
  const modes = []
  for (const compactBefore of [false, false, true, false]) {
    if (compactBefore) state = { ...state, compacted: true }
    const step = nextInjection(state)
    modes.push(step.mode)
    state = step.state
  }
  assert.deepEqual(modes, ['full', 'reminder', 'full', 'reminder'])
})

test('full rules identify their source and direct the agent to repository instructions', () => {
  const text = fullBlock({ template, pluginRoot: '/p' })
  assert.match(text, /^\[haechi\] Workflow rules/)
  assert.match(text, /\/p\/hooks\/rules\.md/)
  assert.match(text, /repository instructions such as `AGENTS.md` and project configuration/)
  assert.match(text, /Respect repository prohibitions/)
  assert.doesNotMatch(text, /ANSWER FORMATS|NEVER RUN|REPO SETUP INCOMPLETE|\/haechi:setup|\{\{[#/]?\w+\}\}/)
})

test('reminders reassess applicable guidance and reconcile completion evidence', () => {
  const text = reminderBlock('/p')
  assert.match(text, /check which skills and shared guidance apply/)
  assert.match(text, /reconcile the original requirements and actual work/)
  assert.match(text, /\/p\/hooks\/rules\.md/)
  assert.doesNotMatch(text, /First reply|Current\/Target\/Keep\/Proof|Verdict line|REPO SETUP INCOMPLETE|\/haechi:setup/)
})

test('subagent appendix carries the tools folder and points to the task packet', () => {
  const appendix = spawnAppendix('/p')
  assert.match(appendix, /haechi tools: \/p\/tools\//)
  assert.match(appendix, /repository instructions and execution details supplied in the task packet/)
  assert.match(appendix, /ask the orchestrator if needed/)
  assert.doesNotMatch(appendix, /setup is missing|\/haechi:setup/)
})

const builtFixture = async (t) => {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'haechi-injection-')))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const out = join(scratch, 'dist')
  const read = (path) => readFileSync(join(sourceDir, path), 'utf8')
  const source = {
    plugin: JSON.parse(read('plugin.json')), tools: loadSource(sourceDir).tools, principles: new Map(), skills: new Map(), agents: [],
    hooks: {
      rulesTemplate: template, rulesSource: read('hooks/rules.mts'),
      codex: { 'inject.mjs': read('hooks/codex/inject.mjs') },
      claude: { 'register.ts': read('hooks/claude/register.ts') },
    },
  }
  for (const [path, content] of buildFiles(source)) {
    mkdirSync(join(out, path, '..'), { recursive: true })
    writeFileSync(join(out, path), content)
  }
  const repo = join(scratch, 'repo')
  mkdirSync(join(repo, 'src'), { recursive: true })
  mkdirSync(join(repo, '.git'))
  const env = { dataDir: join(scratch, 'data') }
  const pluginRoot = join(out, 'codex')
  const { handle } = await import(pathToFileURL(join(pluginRoot, 'hooks/inject.mjs')).href)
  const full = fullBlock({ template, pluginRoot })
  return { scratch, out, repo, env, handle, full }
}

test('Codex state is isolated by exact session identity and resolved repository', async (t) => {
  const { scratch, repo, env, handle, full } = await builtFixture(t)
  const other = join(scratch, 'other')
  mkdirSync(other)
  mkdirSync(join(other, '.git'))
  writeFileSync(join(repo, 'src', '.haechi.json'), '{ignored')
  for (const session_id of ['session/a', 'session_a', 'second']) {
    const input = { cwd: repo, session_id }
    assert.equal(handle('SessionStart', input, env), full)
    assert.equal(handle('UserPromptSubmit', input, env), undefined)
    assert.equal(handle('UserPromptSubmit', { ...input, cwd: other }, env), full)
    assert.equal(handle('UserPromptSubmit', { ...input, cwd: join(repo, 'src') }, env), full)
  }
  const alias = join(scratch, 'alias')
  symlinkSync(repo, alias, 'dir')
  assert.equal(handle('UserPromptSubmit', { cwd: alias, session_id: 'second' }, env), undefined)
  handle('PostCompact', { cwd: repo, session_id: 'second' }, env)
  assert.equal(handle('UserPromptSubmit', { cwd: other, session_id: 'second' }, env), full)
  assert.equal(handle('UserPromptSubmit', { cwd: repo, session_id: 'session/a' }, env), undefined)
  assert.equal(handle('UserPromptSubmit', { cwd: repo, session_id: 'second' }, env), full)
})

test('Codex missing or unusable session identity never shares shown state', async (t) => {
  const { repo, env, handle, full } = await builtFixture(t)
  for (const session_id of [undefined, null, '', '  ', 0, 42, {}, []]) {
    const input = { cwd: repo, session_id }
    assert.equal(handle('SessionStart', input, env), full)
    assert.equal(handle('UserPromptSubmit', input, env), full)
    assert.equal(handle('PostCompact', input, env), undefined)
    assert.equal(handle('UserPromptSubmit', input, env), full)
  }
  assert.equal(handle('SessionStart', { cwd: repo, session_id: 'default' }, env), full)
})

test('Codex clear and compact starts restore full guidance without a PostCompact event', async (t) => {
  const { repo, env, handle, full } = await builtFixture(t)
  const input = { cwd: repo, session_id: 'source-recovery' }
  assert.equal(handle('SessionStart', input, env), full)
  for (const source of ['clear', 'compact']) {
    assert.equal(handle('UserPromptSubmit', input, env), undefined)
    assert.equal(handle('SessionStart', { ...input, source }, env), full, source)
    assert.equal(handle('UserPromptSubmit', input, env), undefined)
    assert.equal(handle('SessionStart', { ...input, source: 'resume' }, env), full)
    assert.equal(handle('UserPromptSubmit', { ...input, source }, env), undefined)
  }
})

test('Codex missing, corrupt and invalid serialized state recovers a full block', async (t) => {
  const { repo, env, handle, full } = await builtFixture(t)
  const input = { cwd: repo, session_id: 'state-recovery' }
  assert.equal(handle('SessionStart', input, env), full)
  const files = readdirSync(join(env.dataDir, 'codex-delivery'), { recursive: true }).filter((path) => path.endsWith('/rules'))
  assert.equal(files.length, 1)
  const state = join(env.dataDir, 'codex-delivery', files[0])
  for (const invalid of ['{broken', 'null', '[]', 'true', '1', '"shown"', '{}', '{"shown":true}', '{"shown":true,"compacted":0}', '{"shown":"true","compacted":false}']) {
    writeFileSync(state, invalid)
    assert.equal(handle('UserPromptSubmit', input, env), full, invalid)
    assert.equal(handle('UserPromptSubmit', input, env), undefined, invalid)
  }
  rmSync(state)
  assert.equal(handle('UserPromptSubmit', input, env), full)
})

test('Claude registration and repository state are isolated and control commands pass through unchanged', async (t) => {
  const { out, repo, scratch } = await builtFixture(t)
  const pluginRoot = join(out, 'claude')
  const { register } = await import(pathToFileURL(join(pluginRoot, 'hooks/register.ts')).href)
  const handlers = () => {
    const registered = new Map()
    register((name, handler) => registered.set(name, handler))
    return registered
  }
  const first = handlers()
  const second = handlers()
  const engine = (root) => ({ session: { root: async () => root }, fs: { read: async (path) => readFileSync(path) }, plugin: { root: pluginRoot } })
  const next = async (event) => event
  const full = fullBlock({ template, pluginRoot })
  const reminder = reminderBlock(pluginRoot)
  const submit = (handlers, root = repo, event = {}) => handlers.get('prompt.submit')(engine(root), event, next)
  for (const command of ['help', 'clear', 'compact']) {
    const event = { command, context: ['original'], prompt: 'unchanged' }
    assert.strictEqual(await submit(first, repo, event), event)
  }
  assert.deepEqual((await submit(first)).context, [full])
  assert.deepEqual((await submit(first)).context, [reminder])
  assert.deepEqual((await submit(second)).context, [full])
  const other = join(scratch, 'other')
  mkdirSync(other)
  mkdirSync(join(other, '.git'))
  assert.deepEqual((await submit(first, other)).context, [full])
  await first.get('session.compact')(engine(repo), {}, next)
  assert.deepEqual((await submit(first, other)).context, [reminder])
  assert.deepEqual((await submit(first)).context, [full])
  await first.get('session.end')(engine(repo), { reason: 'clear' }, next)
  assert.deepEqual((await submit(first)).context, [full])
})

test('built hooks preserve compaction recovery and ignore retired settings', async (t) => {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'haechi-rules-')))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const out = join(scratch, 'dist')
  for (const [path, text] of buildFiles(loadSource(sourceDir))) {
    mkdirSync(join(out, path, '..'), { recursive: true })
    writeFileSync(join(out, path), text)
  }
  const repo = join(scratch, 'repo')
  mkdirSync(join(repo, 'src'), { recursive: true })
  mkdirSync(join(repo, '.git'))
  const retired = join(repo, '.haechi.json')
  const retiredContents = JSON.stringify({ commands: { verify: 'old-verify-marker' }, forbidden: ['old-forbidden-marker'] })
  writeFileSync(retired, retiredContents)
  const home = join(scratch, 'home')
  const env = { home, dataDir: join(scratch, 'data') }
  const { handle } = await import(pathToFileURL(join(out, 'codex', 'hooks', 'inject.mjs')).href)

  const input = { session_id: 's1', cwd: join(repo, 'src') }
  const first = handle('SessionStart', input, env)
  const expected = fullBlock({ template, pluginRoot: join(out, 'codex') })
  assert.equal(first, expected)
  assert.doesNotMatch(first, /old-verify-marker|old-forbidden-marker/)
  assert.equal(handle('UserPromptSubmit', input, env), undefined)
  assert.equal(handle('PostCompact', input, env), undefined)
  assert.equal(handle('UserPromptSubmit', input, env), expected)
  assert.equal(handle('SubagentStart', input, env), spawnAppendix(join(out, 'codex')))

  mkdirSync(join(home, '.haechi'), { recursive: true })
  writeFileSync(join(home, '.haechi', 'user.json'), JSON.stringify({ answerFormats: true, budget: 'large' }))
  const legacyInput = { ...input, session_id: 'legacy-settings' }
  assert.equal(handle('SessionStart', legacyInput, env), expected)
  assert.equal(handle('UserPromptSubmit', legacyInput, env), undefined)
  const recoveryPath = join(out, 'codex', 'hooks', 'rules.md')
  assert.ok(expected.includes(recoveryPath), 'the full block identifies its recovery document')
  for (const rulesPath of [recoveryPath, join(out, 'claude', 'hooks', 'rules.md')]) {
    const recoveryRules = readFileSync(rulesPath, 'utf8')
    assert.doesNotMatch(recoveryRules, /ANSWER FORMATS|\/formats\//)
    assert.match(recoveryRules, /AUTHORIZATION/)
    assert.match(recoveryRules, /COMPLETION/)
  }
  handle('PostCompact', legacyInput, env)
  assert.equal(handle('UserPromptSubmit', legacyInput, env), expected)

  const pluginRoot = join(out, 'claude')
  const { register } = await import(pathToFileURL(join(pluginRoot, 'hooks/register.ts')).href)
  const handlers = new Map()
  register((name, handler) => handlers.set(name, handler))
  const engine = {
    session: { root: async () => repo },
    fs: { read: async (path) => readFileSync(path) },
    plugin: { root: pluginRoot },
  }
  const next = async (event) => event
  const submit = (event = {}) => handlers.get('prompt.submit')(engine, event, next)
  const claudeFull = fullBlock({ template, pluginRoot })
  const originalContext = ['existing context']
  assert.deepEqual((await submit({ context: originalContext })).context, [...originalContext, claudeFull])
  assert.deepEqual((await submit()).context, [reminderBlock(pluginRoot)])
  await handlers.get('session.compact')(engine, {}, next)
  assert.deepEqual((await submit()).context, [claudeFull])
  const spawned = await handlers.get('agent.spawn')(engine, { prompt: 'review' }, next)
  assert.equal(spawned.prompt, `review\n\n${spawnAppendix(pluginRoot)}`)
  assert.deepEqual(await submit({ command: 'help' }), { command: 'help' })

  assert.doesNotMatch(claudeFull, /old-verify-marker|old-forbidden-marker/)
  assert.equal(readFileSync(retired, 'utf8'), retiredContents)
})

test('Claude continues through repeated prompts and compaction without a settings file', async (t) => {
  const { out, repo } = await builtFixture(t)
  const pluginRoot = join(out, 'claude')
  const { register } = await import(pathToFileURL(join(pluginRoot, 'hooks/register.ts')).href)
  const handlers = new Map()
  register((name, handler) => handlers.set(name, handler))
  const engine = {
    session: { root: async () => repo },
    fs: { read: async (path) => {
      assert.equal(path, join(pluginRoot, 'hooks/rules.md'))
      return readFileSync(path)
    } },
    plugin: { root: pluginRoot },
  }
  const next = async (event) => event
  const submit = async () => (await handlers.get('prompt.submit')(engine, {}, next)).context[0]

  const full = await submit()
  assert.match(full, /repository instructions such as `AGENTS.md`/)
  assert.doesNotMatch(full, /REPO SETUP INCOMPLETE|\/haechi:setup/)
  assert.equal(await submit(), reminderBlock(pluginRoot))
  await handlers.get('session.compact')(engine, {}, next)
  assert.equal(await submit(), full)
  const spawned = await handlers.get('agent.spawn')(engine, { prompt: 'review' }, next)
  assert.equal(spawned.prompt, `review\n\n${spawnAppendix(pluginRoot)}`)
  assert.throws(() => readFileSync(join(repo, '.haechi.json')), { code: 'ENOENT' })
})
