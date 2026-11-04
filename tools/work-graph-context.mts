// Read-only discovery for both hosts' command hooks. Does not register or claim work.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { graphContext, toolProvider } from './work-graph.mjs'

export const handle = (event: string, input: { cwd?: string; session_id?: string }, provider = toolProvider()) => {
  if (!['SessionStart', 'UserPromptSubmit'].includes(event)) return undefined
  const toolPath = join(dirname(fileURLToPath(import.meta.url)), 'work-graph.mjs')
  return graphContext(input.cwd ?? process.cwd(), input.session_id, toolPath, provider)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const event = process.argv[2]
    const context = handle(event, JSON.parse(readFileSync(0, 'utf8')))
    if (context) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: context } }))
  } catch {
    process.stderr.write('haechi: shared work context unavailable; do not infer an empty graph\n')
  }
}
