// Pure rule logic shared by the Claude Code mod and the Codex hook. No file or process access here:
// connectors read files and pass text in, so both tools render the same block from the same input.

export interface RepoSettings {
  commands?: { verify?: string; testOne?: string; typecheck?: string | null }
  forbidden?: string[]
  testDirs?: string[]
  sensitiveData?: string
  git?: {
    host?: string
    base?: string
    protected?: string[]
    branch?: string
    commit?: string
    mrTemplate?: string[]
  }
  riskPaths?: string[]
}

export interface UserSettings {
  answerFormats?: boolean
}

export interface LoadedSettings {
  settings?: RepoSettings
  error?: string
}

export interface InjectionState {
  shown: boolean
  compacted: boolean
}

type TemplateValue = string | boolean | undefined

// Setup is complete only when every one of these is present — they are the "required" grade of repo setup
const REQUIRED: [path: string, label: string][] = [
  ['commands.verify', 'verify command'],
  ['commands.testOne', 'single-test command'],
  ['forbidden', 'forbidden commands'],
  ['testDirs', 'test location'],
  ['sensitiveData', 'sensitive data rule'],
  ['git.host', 'git host'],
  ['git.base', 'base branch'],
  ['git.protected', 'protected branches'],
]

const valueAt = (source: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], source)

const isPresent = (value: unknown) =>
  value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)

export const parseSettings = (text: string | undefined): LoadedSettings => {
  if (text === undefined) return {}
  try {
    return { settings: JSON.parse(text) as RepoSettings }
  } catch {
    return { error: '.haechi.json is not valid JSON' }
  }
}

export const parseUserSettings = (text: string | undefined): UserSettings => {
  if (text === undefined) return {}
  try {
    return JSON.parse(text) as UserSettings
  } catch {
    return {}
  }
}

export const missingRequired = (loaded: LoadedSettings): string[] => {
  if (loaded.error) return [loaded.error]
  if (!loaded.settings) return ['.haechi.json']
  return REQUIRED.filter(([path]) => !isPresent(valueAt(loaded.settings, path))).map(([, label]) => label)
}

// Full block on the first prompt and on the first prompt after a compaction; a reminder otherwise
export const nextInjection = (state: InjectionState): { mode: 'full' | 'reminder'; state: InjectionState } =>
  !state.shown || state.compacted
    ? { mode: 'full', state: { shown: true, compacted: false } }
    : { mode: 'reminder', state }

// {{name}} inserts a value; {{#name}}…{{/name}} keeps its body only when the value is set
export const render = (template: string, values: Record<string, TemplateValue>): string =>
  template
    .replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, name: string, body: string) => (values[name] ? body : ''))
    .replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name] ?? ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const repoLine = (settings: RepoSettings | undefined) => {
  const commands = settings?.commands
  if (!commands?.verify && !commands?.testOne) return 'REPO: not set up'
  const parts = [
    commands.verify && `verify \`${commands.verify}\``,
    commands.testOne && `test one \`${commands.testOne}\``,
    settings?.git?.base && `base ${settings.git.base}`,
  ]
  return `REPO: ${parts.filter(Boolean).join(' · ')}`
}

const joined = (items: string[] | undefined) => (items?.length ? items.join(', ') : undefined)

export const fullBlock = (input: {
  template: string
  loaded: LoadedSettings
  user: UserSettings
  pluginRoot: string
}): string => {
  const missing = missingRequired(input.loaded)
  const rules = render(input.template, {
    pluginRoot: input.pluginRoot,
    repoLine: repoLine(input.loaded.settings),
    forbidden: joined(input.loaded.settings?.forbidden),
    setupMissing: missing.length ? missing.join(', ') : undefined,
    riskPaths: joined(input.loaded.settings?.riskPaths),
  })
  // Keep optional guidance out of the recovery document, which is read without user settings.
  if (input.user.answerFormats === false) return rules
  return `${rules}\n\nANSWER FORMATS: optional examples in ${input.pluginRoot}/formats/ cover choices, problems and scenarios. Use a table when comparison is clearer; use prose or a list when it reads better. Adapt labels and omit unneeded sections. These examples never require an approval or another workflow step.`
}

export const reminderBlock = (input: { loaded: LoadedSettings; pluginRoot: string }): string => {
  const missing = missingRequired(input.loaded)
  const setup = missing.length ? ' REPO SETUP INCOMPLETE — no code changes before /haechi:setup.' : ''
  return `[haechi] Continue within the agreed scope and authorization; keep verification evidence. Rules if needed: ${input.pluginRoot}/hooks/rules.md.${setup}`
}

// Subagents never see prompt-time context, so their task message carries the repo facts they act on
export const spawnAppendix = (loaded: LoadedSettings, pluginRoot: string): string => {
  const settings = loaded.settings
  const lines = ['[haechi] Repo facts for this task:', `- haechi tools: ${pluginRoot}/tools/`]
  if (settings?.commands?.verify) lines.push(`- verify: \`${settings.commands.verify}\``)
  if (settings?.commands?.testOne) lines.push(`- single test: \`${settings.commands.testOne}\``)
  if (settings?.forbidden?.length) lines.push(`- never run: ${settings.forbidden.join(', ')}`)
  if (settings?.testDirs?.length) lines.push(`- tests live in: ${settings.testDirs.join(', ')}`)
  if (lines.length === 2) lines.push('- repo setup is missing: ask the orchestrator for commands instead of guessing')
  lines.push('- report open questions to the orchestrator; do not ask the user')
  return lines.join('\n')
}
