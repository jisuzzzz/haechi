import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
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
} from '../hooks/rules.ts'

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
  assert.match(text, /or these paths: src\/payments/)
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
  assert.equal(handle('UserPromptSubmit', input, env), reminderBlock({ loaded, pluginRoot: join(out, 'codex') }))
  assert.equal(handle('PostCompact', input, env), undefined)
  assert.equal(handle('UserPromptSubmit', input, env), expected)
  assert.equal(handle('SubagentStart', input, env), spawnAppendix(loaded, join(out, 'codex')))

  mkdirSync(join(home, '.haechi'), { recursive: true })
  writeFileSync(join(home, '.haechi', 'user.json'), JSON.stringify({ answerFormats: true, budget: 'large' }))
  const legacyInput = { ...input, session_id: 'legacy-settings' }
  assert.equal(handle('SessionStart', legacyInput, env), expected)
  const reminder = handle('UserPromptSubmit', legacyInput, env)
  const recoveryPath = reminder.match(/Rules if needed: (.+?\/hooks\/rules\.md)\./)?.[1]
  assert.ok(recoveryPath, 'the reminder identifies its recovery document')
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
