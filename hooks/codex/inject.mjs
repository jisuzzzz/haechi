// Codex command hook: reads the hook input on stdin and prints additionalContext from the shared rules.
// Usage (from hooks.json): node ${PLUGIN_ROOT}/hooks/inject.mjs <SessionStart|UserPromptSubmit|PostCompact|SubagentStart>
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fullBlock, nextInjection, parseSettings, reminderBlock, spawnAppendix } from './rules.mjs'

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const readText = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined)

// Codex may start in a subfolder; settings live at the repo root
export const findRepoRoot = (start) => {
  const resolved = realpathSync(start)
  for (let dir = resolved; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.haechi.json')) || existsSync(join(dir, '.git'))) return dir
    if (dirname(dir) === dir) return resolved
  }
}

const statePath = (dataDir, sessionId, root) => {
  if (typeof sessionId !== 'string' || !sessionId.trim()) return undefined
  const key = createHash('sha256').update(JSON.stringify([sessionId, root])).digest('hex')
  return join(dataDir, 'sessions', `${key}.json`)
}

const readState = (path) => {
  const fresh = { shown: false, compacted: false }
  if (!path) return fresh
  try {
    const state = JSON.parse(readFileSync(path, 'utf8'))
    return state && typeof state.shown === 'boolean' && typeof state.compacted === 'boolean'
      ? { shown: state.shown, compacted: state.compacted }
      : fresh
  } catch {
    return fresh
  }
}

const writeState = (path, state) => {
  if (!path) return
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(state))
}

export const handle = (event, input, env) => {
  const root = findRepoRoot(input.cwd ?? process.cwd())
  const loaded = parseSettings(readText(join(root, '.haechi.json')))
  const path = statePath(env.dataDir, input.session_id, root)
  const template = () => readFileSync(join(pluginRoot, 'hooks', 'rules.md'), 'utf8')

  if (event === 'PostCompact') {
    writeState(path, { ...readState(path), compacted: true })
    return undefined
  }
  if (event === 'SubagentStart') return spawnAppendix(loaded, pluginRoot)

  const recovery = event === 'SessionStart' && (input.source === 'clear' || input.source === 'compact')
  const step = nextInjection(recovery ? { shown: false, compacted: false } : readState(path))
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
