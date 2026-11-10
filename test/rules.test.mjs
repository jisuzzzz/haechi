import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

import { buildFiles, loadSource } from '../build/build.mjs'
import {
  fullBlock,
  missingRequired,
  nextInjection,
  parseSettings,
  reminderBlock,
  render,
  spawnAppendix,
} from '../hooks/rules.mts'

const sourceDir = join(import.meta.dirname, '..')
const template = readFileSync(join(sourceDir, 'hooks', 'rules.md'), 'utf8')

const complete = {
  commands: { verify: 'npm run verify -- {files}', testOne: 'npx vitest run {file}', typecheck: null },
  forbidden: ['npm test', 'npm run lint'],
  testDirs: ['src/tests'],
  sensitiveData: 'none',
  git: { host: 'github', base: 'main', protected: ['main'], branch: '{type}/{slug}', commit: 'en: type(scope): text', mrTemplate: ['## Summary'] },
  riskPaths: ['src/payments'],
}


const executionSettings = { ...complete, git: { host: 'github', base: 'main', protected: ['main'] } }

test('Git settings are resolved at operation time and do not block local work', () => {
  for (const git of [undefined, {}, { host: 'github' }, { base: '', protected: [] }, complete.git]) {
    const loaded = parseSettings(JSON.stringify({ ...executionSettings, git }))
    assert.deepEqual(missingRequired(loaded), [])
    assert.doesNotMatch(fullBlock({ template, loaded, pluginRoot: '/p' }), /REPO SETUP INCOMPLETE/)
    assert.doesNotMatch(reminderBlock({ loaded, pluginRoot: '/p' }), /REPO SETUP INCOMPLETE/)
    if (git === complete.git) assert.deepEqual(loaded.settings.git, complete.git)
  }
})

test('missing execution requirements still block setup without Git settings', () => {
  const required = [
    ['commands', 'verify', 'verify command'],
    ['commands', 'testOne', 'single-test command'],
    [null, 'forbidden', 'forbidden commands'],
    [null, 'testDirs', 'test location'],
    [null, 'sensitiveData', 'sensitive data rule'],
  ]
  for (const [parent, key, label] of required) {
    const settings = { ...structuredClone(executionSettings), git: undefined }
    delete (parent ? settings[parent] : settings)[key]
    const loaded = { settings }
    assert.deepEqual(missingRequired(loaded), [label])
    assert.match(fullBlock({ template, loaded, pluginRoot: '/p' }), /REPO SETUP INCOMPLETE/)
    assert.match(reminderBlock({ loaded, pluginRoot: '/p' }), /REPO SETUP INCOMPLETE/)
  }
})

test('missing settings file, broken JSON and partial settings are all reported', () => {
  assert.deepEqual(missingRequired(parseSettings(undefined)), ['.haechi.json'])
  assert.deepEqual(missingRequired(parseSettings('{oops')), ['.haechi.json is not valid JSON'])
  assert.deepEqual(missingRequired({ settings: { ...complete, forbidden: [], git: undefined } }), [])
  assert.deepEqual(missingRequired({ settings: { ...complete, testDirs: [] } }), ['test location'])
  assert.deepEqual(missingRequired({ settings: { ...complete, forbidden: 'npm test' } }), ['forbidden commands'])
  assert.deepEqual(missingRequired({ settings: complete }), [])
})

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

test('render keeps sections only when their value is set', () => {
  assert.equal(render('a{{#x}} X={{x}}{{/x}}{{#y}} Y{{/y}}.', { x: '1', y: undefined }), 'a X=1.')
})

test('full block fills repo facts and leaves no template markers', () => {
  const text = fullBlock({ template, loaded: { settings: complete }, pluginRoot: '/p' })
  assert.match(text, /^\[haechi\] Workflow rules/)
  assert.match(text, /REPO: verify `npm run verify -- \{files\}` · test one `npx vitest run \{file\}` · base main/)
  assert.match(text, /NEVER RUN: npm test, npm run lint/)
  assert.match(text, /REPOSITORY RISK PATHS: src\/payments/)
  assert.doesNotMatch(text, /ANSWER FORMATS|\/formats\//)
  assert.doesNotMatch(text, /REPO SETUP INCOMPLETE/)
  assert.doesNotMatch(text, /\{\{[#/]?\w+\}\}/)
})

test('full block without setup names missing execution settings', () => {
  const text = fullBlock({ template, loaded: {}, pluginRoot: '/p' })
  assert.match(text, /REPO: not set up/)
  assert.match(text, /REPO SETUP INCOMPLETE \(missing: \.haechi\.json\)/)
  assert.doesNotMatch(text, /ANSWER FORMATS|NEVER RUN/)
})

test('reminders do not reintroduce first-reply formats', () => {
  for (const loaded of [{}, { settings: complete }]) {
    const text = reminderBlock({ loaded, pluginRoot: '/p' })
    assert.doesNotMatch(text, /First reply|Current\/Target\/Keep\/Proof|Verdict line/)
    assert.match(text, /\/p\/hooks\/rules\.md/)
  }
})

test('later requests reassess applicable guidance and reconcile completion evidence', () => {
  assert.equal(reminderBlock({ loaded: { settings: complete }, pluginRoot: '/p' }),
    '[haechi] Before the next action, check which skills and shared guidance apply to the current request and findings, including evidence needed before acting. Reuse guidance already read when it still applies. Preserve scope and authorization. Before claiming completion, reconcile the original requirements and actual work with applicable implementation, verification and review evidence; report missing evidence. Rules if needed: /p/hooks/rules.md.')
})

test('reminder warns about setup only when it is incomplete', () => {
  assert.doesNotMatch(reminderBlock({ loaded: { settings: complete }, pluginRoot: '/p' }), /INCOMPLETE/)
  assert.match(reminderBlock({ loaded: {}, pluginRoot: '/p' }), /REPO SETUP INCOMPLETE/)
})

test('subagent appendix carries the tools folder and commands, or says setup is missing', () => {
  const withSettings = spawnAppendix({ settings: complete }, '/p')
  assert.match(withSettings, /haechi tools: \/p\/tools\//)
  assert.match(withSettings, /single test: `npx vitest run \{file\}`/)
  assert.match(withSettings, /never run: npm test, npm run lint/)
  assert.match(spawnAppendix({}, '/p'), /repo setup is missing/)
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
  writeFileSync(join(repo, '.haechi.json'), JSON.stringify(complete))
  const env = { dataDir: join(scratch, 'data') }
  const pluginRoot = join(out, 'codex')
  const { handle } = await import(pathToFileURL(join(pluginRoot, 'hooks/inject.mjs')).href)
  const full = fullBlock({ template, loaded: { settings: complete }, pluginRoot })
  return { scratch, out, repo, env, handle, full }
}

test('Codex state is isolated by exact session identity and resolved repository', async (t) => {
  const { scratch, repo, env, handle, full } = await builtFixture(t)
  const other = join(scratch, 'other')
  mkdirSync(other)
  writeFileSync(join(other, '.haechi.json'), JSON.stringify(complete))
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
  const full = fullBlock({ template, loaded: { settings: complete }, pluginRoot })
  const reminder = reminderBlock({ loaded: { settings: complete }, pluginRoot })
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
  writeFileSync(join(other, '.haechi.json'), JSON.stringify(complete))
  assert.deepEqual((await submit(first, other)).context, [full])
  await first.get('session.compact')(engine(repo), {}, next)
  assert.deepEqual((await submit(first, other)).context, [reminder])
  assert.deepEqual((await submit(first)).context, [full])
  await first.get('session.end')(engine(repo), { reason: 'clear' }, next)
  assert.deepEqual((await submit(first)).context, [full])
})

test('built hooks and setup checkers accept execution settings without Git or presentation preferences', async (t) => {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'haechi-rules-')))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const out = join(scratch, 'dist')
  for (const [path, text] of buildFiles(loadSource(sourceDir))) {
    mkdirSync(join(out, path, '..'), { recursive: true })
    writeFileSync(join(out, path), text)
  }
  const repo = join(scratch, 'repo')
  mkdirSync(join(repo, 'src'), { recursive: true })
  writeFileSync(join(repo, '.haechi.json'), JSON.stringify({ ...executionSettings, git: undefined }))
  const home = join(scratch, 'home')
  const env = { home, dataDir: join(scratch, 'data') }
  const { handle } = await import(pathToFileURL(join(out, 'codex', 'hooks', 'inject.mjs')).href)

  const input = { session_id: 's1', cwd: join(repo, 'src') }
  const first = handle('SessionStart', input, env)
  const loaded = { settings: { ...executionSettings, git: undefined } }
  const expected = fullBlock({ template, loaded, pluginRoot: join(out, 'codex') })
  assert.equal(first, expected)
  assert.equal(handle('UserPromptSubmit', input, env), undefined)
  assert.equal(handle('PostCompact', input, env), undefined)
  assert.equal(handle('UserPromptSubmit', input, env), expected)
  assert.equal(handle('SubagentStart', input, env), spawnAppendix(loaded, join(out, 'codex')))

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

  for (const platform of ['claude', 'codex']) {
    const checked = spawnSync(process.execPath, [join(out, platform, 'tools/check-settings.mjs'), repo], { encoding: 'utf8' })
    assert.equal(checked.status, 0, checked.stderr + checked.stdout)
    assert.equal(JSON.parse(checked.stdout).complete, true)
  }

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
  const claudeFull = fullBlock({ template, loaded, pluginRoot })
  const originalContext = ['existing context']
  assert.deepEqual((await submit({ context: originalContext })).context, [...originalContext, claudeFull])
  assert.deepEqual((await submit()).context, [reminderBlock({ loaded, pluginRoot })])
  await handlers.get('session.compact')(engine, {}, next)
  assert.deepEqual((await submit()).context, [claudeFull])
  const spawned = await handlers.get('agent.spawn')(engine, { prompt: 'review' }, next)
  assert.equal(spawned.prompt, `review\n\n${spawnAppendix(loaded, pluginRoot)}`)
  assert.deepEqual(await submit({ command: 'help' }), { command: 'help' })

  writeFileSync(join(repo, '.haechi.json'), JSON.stringify({ ...loaded.settings, forbidden: [] }))
  await handlers.get('session.end')(engine, { reason: 'clear' }, next)
  const noForbiddenCommands = (await submit()).context[0]
  assert.doesNotMatch(noForbiddenCommands, /REPO SETUP INCOMPLETE|NEVER RUN/)
  assert.match(noForbiddenCommands, /verify `npm run verify/)
})
