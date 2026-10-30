// Advisory tool hook shared by Claude Code and Codex. Never denies a tool call.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const playbook = /(?:^|[/:])(feature|bug|refactor|perf|review|test-hardening)(?:\/SKILL\.md)?$/
export const transition = (state, event, input) => {
  const tool = input.tool_name ?? ''
  const args = input.tool_input ?? {}
  if (event === 'PostToolUse' && (
    (tool === 'Skill' && playbook.test(args.skill ?? '')) ||
    (tool === 'Read' && /(?:^|\/)skills\//.test(args.file_path ?? '') && playbook.test(args.file_path ?? ''))
  )) return { state: { ...state, used: true } }
  const path = args.file_path ?? args.path ?? ''
  const sourceEdit = ['Edit', 'Write'].includes(tool) && /(?:^|[/\\])src[/\\]/.test(path)
  if (event !== 'PreToolUse' || !sourceEdit || state.used || state.reminded) return { state }
  return {
    state: { ...state, reminded: true },
    context: 'Haechi reminder: no task playbook invocation has been observed in this session. Before changing source behavior, read the relevant playbook (feature for new or deliberately changed behavior, bug for a defect). If already read through another tool, continue using it. This is advisory; the edit is not blocked.',
  }
}

export const handle = (event, input, dataDir) => {
  // Without a session ID, do not share state across unrelated sessions.
  if (!input.session_id) return transition({}, event, input).context
  const key = createHash('sha256').update(JSON.stringify([input.session_id, input.cwd ?? ''])).digest('hex')
  const path = join(dataDir, 'playbook-reminders', `${key}.json`)
  let state = {}
  try { state = JSON.parse(readFileSync(path, 'utf8')) } catch {}
  const result = transition(state, event, input)
  mkdirSync(join(dataDir, 'playbook-reminders'), { recursive: true })
  writeFileSync(path, JSON.stringify(result.state))
  return result.context
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'))
    const event = process.argv[2]
    const context = handle(event, input, process.env.PLUGIN_DATA ?? join(tmpdir(), 'haechi'))
    if (context) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: context } }))
  } catch {
    // State or input failures must not prevent the user's edit.
    process.stderr.write('haechi: playbook reminder unavailable\n')
  }
}
