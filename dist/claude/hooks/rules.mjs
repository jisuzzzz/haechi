// Pure rule logic shared by the Claude Code mod and the Codex hook. No file or process access here:
// connectors read files and pass text in, so both tools render the same block from the same input.





































// Setup is complete only when every one of these is present — they are the "required" grade of repo setup
const REQUIRED                                  = [
  ['commands.verify', 'verify command'],
  ['commands.testOne', 'single-test command'],
  ['forbidden', 'forbidden commands'],
  ['testDirs', 'test location'],
  ['sensitiveData', 'sensitive data rule'],
  ['git.host', 'git host'],
  ['git.base', 'base branch'],
  ['git.protected', 'protected branches'],
]

const valueAt = (source         , path        )          =>
  path.split('.').reduce         ((value, key) => (value                                       )?.[key], source)

const isPresent = (value         ) =>
  value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)

const FRAMEWORK_RULES = {
  'python-django': 'Django: review affected models and migrations; preserve test database isolation and verify ORM/API behavior with explicit test scope.',
  'python-fastapi': 'FastAPI: verify request/response contracts, dependency overrides, lifespan and sync/async database transactions; identify the migration tool from the repository.',
}

const settingsError = (settings         )                     => {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return '.haechi.json must contain a JSON object'
  const frameworks = (settings                ).frameworks
  if (frameworks !== undefined && (!Array.isArray(frameworks) || frameworks.some((name) =>
    typeof name !== 'string' || !Object.hasOwn(FRAMEWORK_RULES, name)))) {
    return '.haechi.json frameworks must be an array containing only python-django or python-fastapi'
  }
}

export const parseSettings = (text                    )                 => {
  if (text === undefined) return {}
  try {
    const settings = JSON.parse(text)
    const error = settingsError(settings)
    if (error) return { error }
    if (settings.frameworks) settings.frameworks = [...new Set(settings.frameworks)]
    return { settings }
  } catch {
    return { error: '.haechi.json is not valid JSON' }
  }
}

export const parseUserSettings = (text                    )               => {
  if (text === undefined) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

export const missingRequired = (loaded                )           => {
  if (loaded.error) return [loaded.error]
  if (loaded.settings === undefined) return ['.haechi.json']
  const error = settingsError(loaded.settings)
  if (error) return [error]
  return REQUIRED.filter(([path]) => !isPresent(valueAt(loaded.settings, path))).map(([, label]) => label)
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
  if (!commands?.verify && !commands?.testOne) return 'REPO: not set up'
  const parts = [
    commands.verify && `verify \`${commands.verify}\``,
    commands.testOne && `test one \`${commands.testOne}\``,
    settings?.git?.base && `base ${settings.git.base}`,
  ]
  return `REPO: ${parts.filter(Boolean).join(' · ')}`
}

const joined = (items                      ) => (items?.length ? items.join(', ') : undefined)

const frameworkNames = (loaded                )                                          =>
  loaded.error || loaded.settings === undefined || settingsError(loaded.settings)
    ? []
    : [...new Set(loaded.settings.frameworks ?? [])]

const frameworkReference = (names                                         , pluginRoot        )         =>
  `FRAMEWORKS: ${names.join(', ')}. Guidance: ${pluginRoot}/skills/python-backend/SKILL.md.`

export const fullBlock = (input




 )         => {
  const missing = missingRequired(input.loaded)
  const frameworks = frameworkNames(input.loaded)
  const rules = render(input.template, {
    pluginRoot: input.pluginRoot,
    repoLine: repoLine(input.loaded.settings),
    forbidden: joined(input.loaded.settings?.forbidden),
    setupMissing: missing.length ? missing.join(', ') : undefined,
    riskPaths: joined(input.loaded.settings?.riskPaths),
    frameworkRules: frameworks.length
      ? [frameworkReference(frameworks, input.pluginRoot), ...frameworks.map((name) => `- ${FRAMEWORK_RULES[name]}`)].join('\n')
      : undefined,
  })
  // Keep optional guidance out of the recovery document, which is read without user settings.
  if (input.user.answerFormats === false) return rules
  return `${rules}\n\nANSWER FORMATS: optional examples in ${input.pluginRoot}/formats/ cover choices, problems and scenarios. Use a table when comparison is clearer; use prose or a list when it reads better. Adapt labels and omit unneeded sections. These examples never require an approval or another workflow step.`
}

export const reminderBlock = (input                                                )         => {
  const missing = missingRequired(input.loaded)
  const setup = missing.length ? ' REPO SETUP INCOMPLETE — no code changes before /haechi:setup.' : ''
  const frameworks = frameworkNames(input.loaded)
  const framework = frameworks.length ? ` ${frameworkReference(frameworks, input.pluginRoot)}` : ''
  return `[haechi] Continue within the agreed scope and authorization; keep verification evidence. Rules if needed: ${input.pluginRoot}/hooks/rules.md.${setup}${framework}`
}

// Subagents never see prompt-time context, so their task message carries the repo facts they act on
export const spawnAppendix = (loaded                , pluginRoot        )         => {
  const settings = loaded.settings
  const lines = ['[haechi] Repo facts for this task:', `- haechi tools: ${pluginRoot}/tools/`]
  if (settings?.commands?.verify) lines.push(`- verify: \`${settings.commands.verify}\``)
  if (settings?.commands?.testOne) lines.push(`- single test: \`${settings.commands.testOne}\``)
  if (settings?.forbidden?.length) lines.push(`- never run: ${settings.forbidden.join(', ')}`)
  if (settings?.testDirs?.length) lines.push(`- tests live in: ${settings.testDirs.join(', ')}`)
  if (lines.length === 2) lines.push('- repo setup is missing: ask the orchestrator for commands instead of guessing')
  const error = loaded.error ?? (settings === undefined ? undefined : settingsError(settings))
  if (error) lines.push(`- REPO SETUP INCOMPLETE: ${error}; ask the orchestrator to repair settings before code changes`)
  const frameworks = frameworkNames(loaded)
  if (frameworks.length) {
    lines.push(`- ${frameworkReference(frameworks, pluginRoot)}`)
    lines.push(...frameworks.map((name) => `- ${FRAMEWORK_RULES[name]}`))
  }
  lines.push('- report open questions to the orchestrator; do not ask the user')
  return lines.join('\n')
}
