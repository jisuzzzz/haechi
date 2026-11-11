// Pure rule logic shared by the Claude Code mod and the Codex hook. No file or process access here:
// connectors read files and pass text in, so both tools render the same block from the same input.






























export const parseSettings = (text                    )                 => {
  if (text === undefined) return {}
  try {
    const settings          = JSON.parse(text)
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
      return { settings: settings                 }
    }
  } catch {
    // The same diagnostic covers malformed JSON and non-object values.
  }
  return { error: '.haechi.json must contain a valid JSON object' }
}

// Full block on the first prompt and on the first prompt after a compaction; a reminder otherwise
export const nextInjection = (state                )                                                       =>
  !state.shown || state.compacted
    ? { mode: 'full', state: { shown: true, compacted: false } }
    : { mode: 'reminder', state }

// {{name}} inserts a value; {{#name}}…{{/name}} keeps its body only when the value is set
export const render = (template        , values                               )         =>
  template
    .replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, name        , body        ) => (values[name] ? body : ''))
    .replace(/\{\{(\w+)\}\}/g, (_, name        ) => String(values[name] ?? ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const repoLine = (settings                          ) => {
  const commands = settings?.commands
  const parts = [
    commands?.verify && `verify \`${commands.verify}\``,
    commands?.testOne && `test one \`${commands.testOne}\``,
    settings?.git?.base && `base ${settings.git.base}`,
  ]
  const summary = parts.filter(Boolean).join(' · ')
  return summary ? `REPO: ${summary}` : undefined
}

const joined = (items                      ) => (Array.isArray(items) && items.length ? items.join(', ') : undefined)

export const fullBlock = (input



 )         => {
  return render(input.template, {
    pluginRoot: input.pluginRoot,
    repoLine: repoLine(input.loaded.settings),
    forbidden: joined(input.loaded.settings?.forbidden),
    settingsError: input.loaded.error,
    riskPaths: joined(input.loaded.settings?.riskPaths),
  })
}

export const reminderBlock = (pluginRoot        )         =>
  `[haechi] Before the next action, check which skills and shared guidance apply to the current request and findings, including evidence needed before acting. Reuse guidance already read when it still applies. Preserve scope and authorization. Before claiming completion, reconcile the original requirements and actual work with applicable implementation, verification and review evidence; report missing evidence. Rules if needed: ${pluginRoot}/hooks/rules.md.`

// Subagents never see prompt-time context, so their task message carries the repo facts they act on
export const spawnAppendix = (loaded                , pluginRoot        )         => {
  const settings = loaded.settings
  const lines = ['[haechi] Repo facts for this task:', `- haechi tools: ${pluginRoot}/tools/`]
  if (settings?.commands?.verify) lines.push(`- verify: \`${settings.commands.verify}\``)
  if (settings?.commands?.testOne) lines.push(`- single test: \`${settings.commands.testOne}\``)
  const forbidden = joined(settings?.forbidden)
  if (forbidden) lines.push(`- never run: ${forbidden}`)
  const testDirs = joined(settings?.testDirs)
  if (testDirs) lines.push(`- tests live in: ${testDirs}`)
  lines.push('- for missing execution details, use repository instructions and project configuration, then ask the orchestrator if needed')
  lines.push('- report open questions to the orchestrator; do not ask the user')
  return lines.join('\n')
}
