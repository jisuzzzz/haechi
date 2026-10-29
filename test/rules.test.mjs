import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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

test('the built Codex hook prints the same block the shared rules render', async () => {
  const out = mkdtempSync(join(tmpdir(), 'haechi-dist-'))
  for (const [path, text] of buildFiles(loadCore(coreDir))) {
    mkdirSync(join(out, path, '..'), { recursive: true })
    writeFileSync(join(out, path), text)
  }
  const repo = mkdtempSync(join(tmpdir(), 'haechi-repo-'))
  mkdirSync(join(repo, 'src'))
  writeFileSync(join(repo, '.haechi.json'), JSON.stringify(complete))
  const home = mkdtempSync(join(tmpdir(), 'haechi-home-'))
  const env = { home, dataDir: mkdtempSync(join(tmpdir(), 'haechi-data-')) }
  const { handle } = await import(pathToFileURL(join(out, 'codex', 'hooks', 'inject.mjs')).href)

  const input = { session_id: 's1', cwd: join(repo, 'src') }
  const first = handle('SessionStart', input, env)
  const expected = fullBlock({ template, loaded: { settings: complete }, user: {}, pluginRoot: join(out, 'codex') })
  assert.equal(first, expected)
  assert.match(handle('UserPromptSubmit', input, env), /^\[haechi\] Code-change request\?/)
  assert.equal(handle('PostCompact', input, env), undefined)
  assert.equal(handle('UserPromptSubmit', input, env), expected)
  assert.equal(handle('SubagentStart', input, env), spawnAppendix({ settings: complete }, join(out, 'codex')))
})
