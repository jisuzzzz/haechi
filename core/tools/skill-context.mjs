// Remember only explicit user selections, never infer workflow progress.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const primary = new Set(['feature', 'bug', 'refactor', 'perf', 'review', 'test-hardening'])
export const select = (previous, prompt) => {
  if (typeof prompt !== 'string') return previous
  const match = prompt.trim().match(/^\/haechi:([a-z-]+)(?:\s+([\s\S]*))?$/)
  if (!match) return previous
  const [, skill, task = ''] = match
  if (skill === 'context' && task.trim() === 'clear') return null
  if (!primary.has(skill)) return previous
  return { skill, task: task.trim().slice(0, 2000), source: 'user' }
}
export const context = (selection) => selection
  ? `[haechi] User-selected task context (not proof that a skill was read): ${JSON.stringify(selection)}\nRefer to the selected playbook for this task; choose or omit steps according to the task. This records a user preference, not an execution gate. Supporting skills do not replace it. If the conversation clearly moves to another task, do not apply this old context; clear it with /haechi:context clear.`
  : undefined

export const handle = (event, input, dataDir) => {
  // A missing ID cannot safely identify a session; avoid a shared fallback.
  if (!input.session_id) return event === 'UserPromptSubmit' ? context(select(null, input.prompt)) : undefined
  const key = createHash('sha256').update(JSON.stringify([input.session_id, input.cwd ?? ''])).digest('hex')
  const path = join(dataDir, 'skill-context', `${key}.json`)
  let previous = null
  try { previous = JSON.parse(readFileSync(path, 'utf8')) } catch {}
  if (event === 'SessionStart' && input.source === 'clear') previous = null
  const selection = event === 'UserPromptSubmit' ? select(previous, input.prompt) : previous
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(selection), { mode: 0o600 })
  return context(selection)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const event = process.argv[2]
    const text = handle(event, JSON.parse(readFileSync(0, 'utf8')), process.env.PLUGIN_DATA ?? join(tmpdir(), 'haechi'))
    if (text) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }))
  } catch { process.stderr.write('haechi: saved skill context unavailable\n') }
}
