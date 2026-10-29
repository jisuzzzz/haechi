import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

import { buildFiles, loadCore } from '../build/build.mjs'
import {
  fullBlock,
  missingRequired,
  nextInjection,
  parseSettings,
  reminderBlock,
  render,
  spawnAppendix,
} from '../core/hooks/rules.ts'

const coreDir = join(import.meta.dirname, '..', 'core')
const template = readFileSync(join(coreDir, 'hooks', 'rules.md'), 'utf8')

const complete = {
  commands: { verify: 'npm run verify -- {files}', testOne: 'npx vitest run {file}', typecheck: null },
  forbidden: ['npm test', 'npm run lint'],
  testDirs: ['src/tests'],
  sensitiveData: 'none',
  git: { host: 'github', base: 'main', protected: ['main'], branch: '{type}/{slug}', commit: 'en: type(scope): text', mrTemplate: ['## Summary'] },
  riskPaths: ['src/payments'],
}


const executionSettings = { ...complete, git: { host: 'github', base: 'main', protected: ['main'] } }

test('optional Git formats do not block setup, full prompts or reminders', () => {
  for (const optional of [{}, { branch: '', commit: null, mrTemplate: [] }, complete.git]) {
    const loaded = parseSettings(JSON.stringify({ ...executionSettings, git: { ...executionSettings.git, ...optional } }))
    assert.deepEqual(missingRequired(loaded), [])
    assert.doesNotMatch(fullBlock({ template, loaded, user: {}, pluginRoot: '/p' }), /REPO SETUP INCOMPLETE/)
    assert.doesNotMatch(reminderBlock({ loaded, pluginRoot: '/p' }), /REPO SETUP INCOMPLETE/)
    if (optional === complete.git) assert.deepEqual(loaded.settings.git, complete.git)
  }
})

test('execution requirements still block setup when Git formats are absent', () => {
  const required = [
    ['commands', 'verify', 'verify command'],
    ['commands', 'testOne', 'single-test command'],
    [null, 'forbidden', 'forbidden commands'],
    [null, 'testDirs', 'test location'],
    [null, 'sensitiveData', 'sensitive data rule'],
    ['git', 'host', 'git host'],
    ['git', 'base', 'base branch'],
    ['git', 'protected', 'protected branches'],
  ]
  for (const [parent, key, label] of required) {
    const settings = structuredClone(executionSettings)
    delete (parent ? settings[parent] : settings)[key]
    const loaded = { settings }
    assert.deepEqual(missingRequired(loaded), [label])
    assert.match(fullBlock({ template, loaded, user: {}, pluginRoot: '/p' }), /REPO SETUP INCOMPLETE/)
    assert.match(reminderBlock({ loaded, pluginRoot: '/p' }), /REPO SETUP INCOMPLETE/)
  }
})

test('missing settings file, broken JSON and partial settings are all reported', () => {
  assert.deepEqual(missingRequired(parseSettings(undefined)), ['.haechi.json'])
  assert.deepEqual(missingRequired(parseSettings('{oops')), ['.haechi.json is not valid JSON'])
  assert.deepEqual(missingRequired({ settings: { ...complete, forbidden: [], git: { ...complete.git, base: '' } } }), [
    'forbidden commands',
    'base branch',
  ])
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
  const text = fullBlock({ template, loaded: { settings: complete }, user: {}, pluginRoot: '/p' })
  assert.match(text, /^\[haechi\] Workflow rules/)
  assert.match(text, /REPO: verify `npm run verify -- \{files\}` · test one `npx vitest run \{file\}` · base main/)
  assert.match(text, /NEVER RUN: npm test, npm run lint/)
  assert.match(text, /or these paths: src\/payments/)
  assert.match(text, /ANSWER FORMATS/)
  assert.doesNotMatch(text, /REPO SETUP INCOMPLETE/)
  assert.doesNotMatch(text, /\{\{[#/]?\w+\}\}/)
})

test('full block without setup names what is missing and drops answer formats when turned off', () => {
  const text = fullBlock({ template, loaded: {}, user: { answerFormats: false }, pluginRoot: '/p' })
  assert.match(text, /REPO: not set up/)
  assert.match(text, /REPO SETUP INCOMPLETE \(missing: \.haechi\.json\)/)
  assert.doesNotMatch(text, /ANSWER FORMATS|NEVER RUN/)
})

test('turning off answer formats removes layout instructions but keeps repo safeguards', () => {
  const text = fullBlock({ template, loaded: { settings: complete }, user: { answerFormats: false }, pluginRoot: '/p' })
  assert.doesNotMatch(text, /ANSWER FORMATS|FIRST REPLY|OUTPUT LAYOUT|\| Current \||Current\/Target\/Keep\/Proof/)
  assert.match(text, /verify `npm run verify -- \{files\}`/)
  assert.match(text, /test one `npx vitest run \{file\}`/)
  assert.match(text, /NEVER RUN: npm test, npm run lint/)
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

test('the built Codex hook prints the same block the shared rules render', async (t) => {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'haechi-rules-')))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const out = join(scratch, 'dist')
  for (const [path, text] of buildFiles(loadCore(coreDir))) {
    mkdirSync(join(out, path, '..'), { recursive: true })
    writeFileSync(join(out, path), text)
  }
  const repo = join(scratch, 'repo')
  mkdirSync(join(repo, 'src'), { recursive: true })
  writeFileSync(join(repo, '.haechi.json'), JSON.stringify(executionSettings))
  const home = join(scratch, 'home')
  const env = { home, dataDir: join(scratch, 'data') }
  const { handle } = await import(pathToFileURL(join(out, 'codex', 'hooks', 'inject.mjs')).href)

  const input = { session_id: 's1', cwd: join(repo, 'src') }
  const first = handle('SessionStart', input, env)
  const expected = fullBlock({ template, loaded: { settings: executionSettings }, user: {}, pluginRoot: join(out, 'codex') })
  assert.equal(first, expected)
  assert.equal(handle('UserPromptSubmit', input, env), reminderBlock({ loaded: { settings: executionSettings }, pluginRoot: join(out, 'codex') }))
  assert.equal(handle('PostCompact', input, env), undefined)
  assert.equal(handle('UserPromptSubmit', input, env), expected)
  assert.equal(handle('SubagentStart', input, env), spawnAppendix({ settings: executionSettings }, join(out, 'codex')))

  mkdirSync(join(home, '.haechi'), { recursive: true })
  writeFileSync(join(home, '.haechi', 'user.json'), JSON.stringify({ answerFormats: false }))
  const disabledInput = { ...input, session_id: 'formats-off' }
  const disabledFirst = handle('SessionStart', disabledInput, env)
  assert.doesNotMatch(disabledFirst, /ANSWER FORMATS|FIRST REPLY|OUTPUT LAYOUT|\| Current \|/)
  assert.match(disabledFirst, /NEVER RUN: npm test, npm run lint/)
  const disabledReminder = handle('UserPromptSubmit', disabledInput, env)
  assert.doesNotMatch(disabledReminder, /First reply|Current\/Target\/Keep\/Proof|Verdict line/)
  const recoveryPath = disabledReminder.match(/Rules if needed: (.+?\/hooks\/rules\.md)\./)?.[1]
  assert.ok(recoveryPath, 'the reminder identifies its recovery document')
  for (const rulesPath of [recoveryPath, join(out, 'claude', 'hooks', 'rules.md')]) {
    const recoveryRules = readFileSync(rulesPath, 'utf8')
    assert.doesNotMatch(recoveryRules, /ANSWER FORMATS|\/formats\//)
    assert.match(recoveryRules, /AUTHORIZATION/)
    assert.match(recoveryRules, /COMPLETION/)
  }
  handle('PostCompact', disabledInput, env)
  assert.equal(handle('UserPromptSubmit', disabledInput, env), disabledFirst)
})
