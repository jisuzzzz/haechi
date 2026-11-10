// Read-only discovery for both hosts' command hooks. Does not register or claim work.
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { graphContext, toolProvider } from './work-graph.mjs'
import { deliverCodexContext } from './codex-context-delivery.mjs'

export const handle = (event        , input                                       , provider = toolProvider()) => {
  if (!['SessionStart', 'UserPromptSubmit'].includes(event)) return undefined
  const toolPath = join(dirname(fileURLToPath(import.meta.url)), 'work-graph.mjs')
  return graphContext(input.cwd ?? process.cwd(), input.session_id, toolPath, provider)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const event = process.argv[2]
    const input = JSON.parse(readFileSync(0, 'utf8'))
    const provider = toolProvider()
    const render = () => handle(event, input, provider)
    const context = provider === 'codex'
      ? deliverCodexContext('graph', event, input, process.env.PLUGIN_DATA ?? join(tmpdir(), 'haechi'), render, text =>
        text?.startsWith('[haechi] Shared work records are unavailable or invalid') || text?.includes('"referenceIssueCount":') ? text : undefined)
      : render()
    if (context) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: context } }))
  } catch {
    process.stderr.write('haechi: shared work context unavailable; do not infer an empty graph\n')
  }
}
