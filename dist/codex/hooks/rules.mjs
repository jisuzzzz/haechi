// Pure rule logic shared by the Claude Code mod and the Codex hook. No file or process access here:
// connectors read files and pass text in, so both tools render the same block from the same input.






// Full block on the first prompt and on the first prompt after a compaction; a reminder otherwise
export const nextInjection = (state                )                                                       =>
  !state.shown || state.compacted
    ? { mode: 'full', state: { shown: true, compacted: false } }
    : { mode: 'reminder', state }

export const fullBlock = ({ template, pluginRoot }                                          )         =>
  template.replaceAll('{{pluginRoot}}', pluginRoot).trim()

export const reminderBlock = (pluginRoot        )         =>
  `[haechi] Before the next action, check which skills and shared guidance apply to the current request and findings, including evidence needed before acting. Reuse guidance already read when it still applies. Preserve scope and authorization. Before claiming completion, reconcile the original requirements and actual work with applicable implementation, verification and review evidence; report missing evidence. Rules if needed: ${pluginRoot}/hooks/rules.md.`

// Prompt-time context does not reach subagents. The task packet carries repository rules and commands.
export const spawnAppendix = (pluginRoot        )         => [
  '[haechi] Repo facts for this task:',
  `- haechi tools: ${pluginRoot}/tools/`,
  '- use the repository instructions and execution details supplied in the task packet',
  '- resolve missing details from repository instructions and project configuration, then ask the orchestrator if needed',
  '- report open questions to the orchestrator',
].join('\n')
