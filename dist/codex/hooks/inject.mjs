// Codex command hook: reads the hook input on stdin and prints additionalContext from the shared rules.
// Usage (from hooks.json): node ${PLUGIN_ROOT}/hooks/inject.mjs <SessionStart|UserPromptSubmit|PostCompact|SubagentStart>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fullBlock, nextInjection, parseSettings, reminderBlock, spawnAppendix } from './rules.mjs'

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const readText = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined)

// Codex may start in a subfolder; settings live at the repo root
export const findRepoRoot = (start) => {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.haechi.json')) || existsSync(join(dir, '.git'))) return dir
    if (dirname(dir) === dir) return start
  }
}

const statePath = (dataDir, sessionId) => join(dataDir, 'sessions', `${String(sessionId).replace(/[^\w-]/g, '_')}.json`)

const readState = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return { shown: false, compacted: false }
  }
}

const writeState = (path, state) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(state))
}

export const handle = (event, input, env) => {
  const root = findRepoRoot(input.cwd ?? process.cwd())
  const loaded = parseSettings(readText(join(root, '.haechi.json')))
  const path = statePath(env.dataDir, input.session_id ?? 'default')
  const template = () => readFileSync(join(pluginRoot, 'hooks', 'rules.md'), 'utf8')

  if (event === 'PostCompact') {
    writeState(path, { ...readState(path), compacted: true })
    return undefined
  }
  if (event === 'SubagentStart') return spawnAppendix(loaded, pluginRoot)

  const step = nextInjection(readState(path))
  writeState(path, step.state)
  return step.mode === 'full'
    ? fullBlock({ template: template(), loaded, pluginRoot })
    : reminderBlock({ loaded, pluginRoot })
}

const main = () => {
  const event = process.argv[2]
  const raw = readFileSync(0, 'utf8')
  const input = raw.trim() ? JSON.parse(raw) : {}
  const context = handle(event, input, { dataDir: process.env.PLUGIN_DATA ?? join(tmpdir(), 'haechi') })
  if (context) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: context } }))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
