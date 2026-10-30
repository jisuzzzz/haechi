// Builds dist/claude and dist/codex from the root source folders. Run with --check to detect stale distributions.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const TARGETS = {
  claude: { pluginRoot: '${CLAUDE_PLUGIN_ROOT}', manifest: '.claude-plugin/plugin.json' },
  codex: { pluginRoot: '${PLUGIN_ROOT}', manifest: '.codex-plugin/plugin.json' },
}

// Only one-line `key: value` and `key: [a, b]` — multi-line YAML would not survive the TOML conversion
export const parseFrontmatter = (text, file) => {
  const match = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) throw new Error(`${file}: missing frontmatter (---)`)
  const fields = {}
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue
    const pair = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/)
    if (!pair) throw new Error(`${file}: unsupported frontmatter line "${line}"`)
    const [, key, raw] = pair
    if (/^[>|]/.test(raw)) throw new Error(`${file}: ${key} must be a one-line value`)
    fields[key] = raw.startsWith('[')
      ? raw.replace(/^\[|\]$/g, '').split(',').map((item) => item.trim()).filter(Boolean)
      : raw.replace(/^(['"])(.*)\1$/, '$2')
  }
  return { fields, body: match[2].trim() }
}

const section = (body, heading, file) => {
  const match = body.match(new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'))
  if (!match) throw new Error(`${file}: missing "## ${heading}" section`)
  return match[1].trim()
}

const listDir = (dir) => (existsSync(dir) ? readdirSync(dir).sort() : [])

export const loadSource = (sourceDir) => {
  const plugin = JSON.parse(readFileSync(join(sourceDir, 'plugin.json'), 'utf8'))
  const principles = new Map()
  for (const name of listDir(join(sourceDir, 'principles')).filter((file) => file.endsWith('.md'))) {
    const file = join(sourceDir, 'principles', name)
    const { body } = parseFrontmatter(readFileSync(file, 'utf8'), file)
    principles.set(name.replace(/\.md$/, ''), { do: section(body, 'Do', file), check: section(body, 'Check', file) })
  }
  const skills = new Map()
  const skillReferences = new Map()
  for (const name of listDir(join(sourceDir, 'skills'))) {
    const file = join(sourceDir, 'skills', name, 'SKILL.md')
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
    skills.set(name, { text, ...parseFrontmatter(text, file) })
    const references = join(sourceDir, 'skills', name, 'references')
    for (const reference of listDir(references).filter((file) => file.endsWith('.md'))) {
      skillReferences.set(`${name}/references/${reference}`, readFileSync(join(references, reference), 'utf8').replace(/\r\n/g, '\n'))
    }
  }
  const agents = []
  for (const name of listDir(join(sourceDir, 'agents')).filter((file) => file.endsWith('.md'))) {
    const file = join(sourceDir, 'agents', name)
    agents.push({ file, ...parseFrontmatter(readFileSync(file, 'utf8'), file) })
  }
  const readOptional = (path) => (existsSync(join(sourceDir, path)) ? readFileSync(join(sourceDir, path), 'utf8').replace(/\r\n/g, '\n') : undefined)
  const tools = new Map(listDir(join(sourceDir, 'tools')).filter((file) => file.endsWith('.mjs')).map((file) => [file, readOptional(`tools/${file}`)]))
  const hooks = {
    rulesTemplate: readOptional('hooks/rules.md'),
    rulesSource: readOptional('hooks/rules.ts'),
    claude: { 'register.ts': readOptional('hooks/claude/register.ts'), 'hooks.json': readOptional('hooks/claude/hooks.json') },
    codex: { 'inject.mjs': readOptional('hooks/codex/inject.mjs'), 'hooks.json': readOptional('hooks/codex/hooks.json') },
  }
  return { plugin, principles, skills, skillReferences, agents, hooks, tools }
}

const lookup = (map, names = [], kind, file) =>
  names.map((name) => {
    if (!map.has(name)) throw new Error(`${file}: unknown ${kind} "${name}"`)
    return [name, map.get(name)]
  })

// A skill body nests under "### <name>" inside an agent: drop its own title and push its headings below that level
export const demoteHeadings = (body) =>
  body
    .replace(/^# [^\n]*\n+/, '')
    .replace(/^(#{1,4}) /gm, (_, hashes) => `${'#'.repeat(hashes.length + 2)} `)

// The agent's own body, then the principles, checks and procedures named in its frontmatter
export const agentBody = (agent, core, target) => {
  const parts = [agent.body]
  const principles = lookup(core.principles, agent.fields.principles, 'principle', agent.file)
  const checks = lookup(core.principles, agent.fields.checks, 'principle', agent.file)
  const skills = lookup(core.skills, agent.fields.skills, 'skill', agent.file)
  if (principles.length) parts.push('## Principles', ...principles.map(([name, p]) => `### ${name}\n${p.do}`))
  if (checks.length) parts.push('## Checks', ...checks.map(([name, p]) => `### ${name}\n${p.check}`))
  if (skills.length) parts.push('## Procedures', ...skills.map(([name, s]) => `### ${name}\n${demoteHeadings(s.body)}`))
  return parts.join('\n\n').replaceAll('{{PLUGIN_ROOT}}', TARGETS[target].pluginRoot)
}

const CLAUDE_AGENT_KEYS = ['name', 'description', 'tools', 'model', 'effort']

export const claudeAgent = (agent, core) => {
  const head = CLAUDE_AGENT_KEYS.filter((key) => agent.fields[key] !== undefined).map((key) => {
    const value = agent.fields[key]
    return `${key}: ${Array.isArray(value) ? value.join(', ') : value}`
  })
  return `---\n${head.join('\n')}\n---\n\n${agentBody(agent, core, 'claude')}\n`
}

// JSON string escaping is valid for TOML basic strings
export const codexAgent = (agent, core) => {
  const body = agentBody(agent, core, 'codex')
  if (body.includes("'''")) throw new Error(`${agent.file}: body contains ''' which a TOML literal string cannot hold`)
  return [
    `name = ${JSON.stringify(agent.fields.name)}`,
    `description = ${JSON.stringify(agent.fields.description)}`,
    ...(agent.fields.effort ? [`model_reasoning_effort = ${JSON.stringify(agent.fields.effort)}`] : []),
    "developer_instructions = '''",
    body,
    "'''",
    '',
  ].join('\n')
}

const manifest = (plugin, target) => {
  const base = { name: plugin.name, version: plugin.version, description: plugin.description }
  return target === 'claude'
    ? { ...base, author: plugin.author, license: plugin.license, homepage: plugin.homepage, repository: plugin.repository }
    : { ...base, skills: './skills/' }
}

export const buildFiles = (core) => {
  const files = new Map()
  for (const target of Object.keys(TARGETS)) {
    files.set(`${target}/${TARGETS[target].manifest}`, `${JSON.stringify(manifest(core.plugin, target), null, 2)}\n`)
    // The hook's principle index points the main session at these files
    for (const [name, principle] of core.principles) {
      files.set(`${target}/principles/${name}.md`, `# ${name}\n\n## Do\n${principle.do}\n\n## Check\n${principle.check}\n`)
    }
    for (const [name, skill] of core.skills) {
      files.set(`${target}/skills/${name}/SKILL.md`, skill.text.replaceAll('{{PLUGIN_ROOT}}', TARGETS[target].pluginRoot))
    }
    for (const [path, text] of core.skillReferences ?? []) {
      files.set(`${target}/skills/${path}`, text.replaceAll('{{PLUGIN_ROOT}}', TARGETS[target].pluginRoot))
    }
  }
  for (const agent of core.agents) {
    files.set(`claude/agents/${agent.fields.name}.md`, claudeAgent(agent, core))
    // Codex plugins cannot carry agents, so setup installs these TOML files (P0 finding)
    files.set(`codex/agents/${agent.fields.name}.toml`, codexAgent(agent, core))
  }
  const { hooks } = core
  if (hooks?.rulesSource) {
    files.set('claude/hooks/rules.md', hooks.rulesTemplate)
    files.set('codex/hooks/rules.md', hooks.rulesTemplate)
    // The Claude mod imports the TypeScript as is; the Codex hook runs on plain node, so it gets the types stripped
    files.set('claude/hooks/rules.ts', hooks.rulesSource)
    // Plain-node tools (check-settings) import rules.mjs in both targets
    const rulesJs = stripTypeScriptTypes(hooks.rulesSource, { mode: 'strip' }).replace(/[ \t]+$/gm, '')
    files.set('claude/hooks/rules.mjs', rulesJs)
    files.set('codex/hooks/rules.mjs', rulesJs)
    for (const target of ['claude', 'codex']) {
      for (const [name, text] of Object.entries(hooks[target])) files.set(`${target}/hooks/${name}`, text)
    }
  }
  for (const [name, text] of core.tools ?? []) {
    for (const target of Object.keys(TARGETS)) files.set(`${target}/tools/${name}`, text)
  }
  return files
}

const readTree = (dir, base = dir, out = new Map()) => {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) readTree(path, base, out)
    else out.set(relative(base, path).replaceAll('\\', '/'), readFileSync(path, 'utf8').replace(/\r\n/g, '\n'))
  }
  return out
}

export const diffTree = (expected, actual) => {
  const problems = []
  for (const [path, content] of expected) {
    if (!actual.has(path)) problems.push(`missing: dist/${path}`)
    else if (actual.get(path) !== content) problems.push(`stale: dist/${path}`)
  }
  for (const path of actual.keys()) if (!expected.has(path)) problems.push(`extra: dist/${path}`)
  return problems
}

const main = () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const distDir = join(root, 'dist')
  const files = buildFiles(loadSource(root))
  if (process.argv.includes('--check')) {
    const problems = diffTree(files, readTree(distDir))
    if (problems.length) {
      console.error(`dist is out of date — run npm run build\n${problems.join('\n')}`)
      process.exit(1)
    }
    console.log(`dist is up to date (${files.size} files)`)
    return
  }
  rmSync(distDir, { recursive: true, force: true })
  for (const [path, content] of files) {
    mkdirSync(dirname(join(distDir, path)), { recursive: true })
    writeFileSync(join(distDir, path), content)
  }
  console.log(`built ${files.size} files into dist/`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
