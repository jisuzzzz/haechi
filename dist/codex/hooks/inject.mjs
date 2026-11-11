// Codex command hook: reads the hook input on stdin and prints additionalContext from the shared rules.
// Usage (from hooks.json): node ${PLUGIN_ROOT}/hooks/inject.mjs <SessionStart|UserPromptSubmit|PostCompact|SubagentStart>
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fullBlock, spawnAppendix } from './rules.mjs'
import { deliverCodexContext, findRepoRoot, markCodexCompaction } from '../tools/codex-context-delivery.mjs'

export { findRepoRoot }

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

export const handle = (event, input, env) => {
  if (event === 'PostCompact') {
    markCodexCompaction(input, env.dataDir)
    return undefined
  }
  if (event === 'SubagentStart') return spawnAppendix(pluginRoot)
  const render = () => fullBlock({ template: readFileSync(join(pluginRoot, 'hooks', 'rules.md'), 'utf8'), pluginRoot })
  return deliverCodexContext('rules', event, input, env.dataDir, render)
}

const main = () => {
  const event = process.argv[2]
  const raw = readFileSync(0, 'utf8')
  const input = raw.trim() ? JSON.parse(raw) : {}
  const context = handle(event, input, { dataDir: process.env.PLUGIN_DATA ?? join(tmpdir(), 'haechi') })
  if (context) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: context } }))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
