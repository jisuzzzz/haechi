// Assemble a first draft from shared Parts. No prior request, source document or evidence is required.
// node document-template.mjs --list
// node document-template.mjs --type bug --out request.md --parts P15 --conditions C-EVIDENCE
// node document-template.mjs --format request.md
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface Heading { index: number; level: number; title: string }
type Placement = 'narrative' | 'records' | 'attachments' | 'endnotes'
interface PartDefinition { id: string; file: string; placement: Placement; [key: string]: unknown }
interface Part extends PartDefinition { body: string; notes: string }
interface Catalog { language: string; parts: PartDefinition[]; [key: string]: unknown }
interface Preset { id: string; title: string; phase: string; required: string[]; optional: string[]; narrative_order: string[]; headings: Record<string, string>; reading_flow: string }
interface KitConfig { part_order: string[]; common_required: string[]; presets: Preset[]; conditional_rules: { id: string; required: string[] }[] }
export interface DocumentKit { catalog: Catalog; config: KitConfig; parts: Map<string, Part> }
export interface ComposeOptions { parts?: string[]; conditions?: string[]; kit?: DocumentKit }
type ValueFlag = '--type' | '--out' | '--parts' | '--conditions' | '--format'
type CliOptions = Partial<Record<ValueFlag, string> & Record<'--list' | '--help', boolean>>

const ASSETS = fileURLToPath(new URL('../skills/document/assets/', import.meta.url))
const USAGE = 'Usage: node document-template.mjs --list | --type <fact|change|bug|retirement|performance|handoff> --out <file> [--parts P15,P03] [--conditions C-VISUAL,C-EVIDENCE] | --format <file>'
const bareTitle = (title: string) => title.replace(/^\d+(?:\.\d+)*\.?\s+/, '').trim()
const isSummary = (title: string) => /^(?:요약|summary)$/i.test(bareTitle(title))
const isContents = (title: string) => /^(?:목차|table of contents|contents)$/i.test(bareTitle(title))
const isEndnotes = (title: string) => /^(?:근거 주석|evidence notes|endnotes)$/i.test(bareTitle(title))

// Keep fences intact: code headings and example footnotes are never document structure.
const scan = (lines: string[]) => {
  const headings: Heading[] = []
  const code = new Set<number>()
  let fence: { mark: string; length: number } | undefined
  lines.forEach((line, index) => {
    const block = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (block) {
      code.add(index)
      if (!fence) fence = { mark: block[1][0], length: block[1].length }
      else if (block[1][0] === fence.mark && block[1].length >= fence.length && !block[2].trim()) fence = undefined
      return
    }
    if (fence) return void code.add(index)
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (heading) headings.push({ index, level: heading[1].length, title: heading[2].replace(/\s+#+\s*$/, '') })
  })
  return { headings, code }
}

export const headingAnchor = (title: string) => title
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/<[^>]+>/g, '')
  .normalize('NFC').toLowerCase()
  .replace(/[^\p{L}\p{N}_\s-]/gu, '').replace(/\s/g, '-')

export const formatDocument = (text: string): string => {
  let lines = text.replace(/\r\n/g, '\n').split('\n')
  const { code } = scan(lines)
  lines = lines.filter((line, i) => code.has(i) || !/^\s*<!-- part:P\d+ -->\s*$/.test(line))
  let existingContents: string | undefined
  // Drop only the old generated contents section; quoted/fenced headings remain untouched.
  for (;;) {
    const headings = scan(lines).headings
    const toc = headings.find((h) => h.level === 2 && isContents(h.title))
    if (!toc) break
    existingContents ??= bareTitle(toc.title)
    const end = headings.find((h) => h.index > toc.index && h.level <= 2)?.index ?? lines.length
    lines.splice(toc.index, end - toc.index)
  }
  const sections = scan(lines).headings.filter((h) => h.level >= 2)
  if (!sections.length || sections[0].level !== 2 || !isSummary(sections[0].title)) {
    throw new Error('A document must open with a level-two 요약 or Summary section')
  }
  const english = /^summary$/i.test(bareTitle(sections[0].title))
  const contentsTitle = english
    ? (/^(?:table of contents|contents)$/i.test(existingContents ?? '') ? existingContents : 'Table of contents')
    : '목차'
  const counters = Array(7).fill(0)
  const entries: string[] = []
  let top = -1
  let previousLevel = 1
  for (const heading of sections) {
    const { index, level } = heading
    if (level > previousLevel + 1) throw new Error('Section numbering cannot skip a parent heading')
    if (level === 2) counters[2] = ++top
    else counters[level]++
    for (let deeper = level + 1; deeper <= 6; deeper++) counters[deeper] = 0
    previousLevel = level
    const label = counters.slice(2, level + 1).join('.')
    const title = `${label}${level === 2 ? '.' : ''} ${bareTitle(heading.title)}`
    lines[index] = `${'#'.repeat(level)} ${title}`
    if (level <= 3) {
      const display = title.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\[/g, '\\[').replace(/\]/g, '\\]')
      entries.push(`${'  '.repeat(level - 2)}- [${display}](#${headingAnchor(title)})`)
    }
  }
  const topSections = scan(lines).headings.filter((h) => h.level === 2)
  const at = topSections[1]?.index ?? lines.length
  if (at > 0 && lines[at - 1] !== '') lines.splice(at, 0, '')
  const insertAt = scan(lines).headings.filter((h) => h.level === 2)[1]?.index ?? lines.length
  lines.splice(insertAt, 0, `## ${contentsTitle}`, '', ...entries, '')
  const formatted = `${lines.join('\n').trimEnd()}\n`
  validateNotes(formatted)
  return formatted
}

export const validateNotes = (text: string): void => {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const { headings, code } = scan(lines)
  const definitions = new Map<string, number>()
  const calls = new Set<string>()
  lines.forEach((line, index) => {
    if (code.has(index)) return
    const readable = line.replace(/(`+).*?\1/g, '')
    const definition = readable.match(/^\[\^([^\]]+)\]:/)
    if (definition) {
      if (definitions.has(definition[1])) throw new Error(`Duplicate endnote: ${definition[1]}`)
      definitions.set(definition[1], index)
    }
    for (const match of readable.matchAll(/(?<!\\)\[\^([^\]]+)\](?!:)/g)) calls.add(match[1])
  })
  const missing = [...calls].filter((id) => !definitions.has(id))
  const unused = [...definitions.keys()].filter((id) => !calls.has(id))
  if (missing.length || unused.length) throw new Error(`Unmatched endnotes; missing: ${missing.join(', ') || 'none'}; unused: ${unused.join(', ') || 'none'}`)
  const evidence = headings.find((h) => h.level === 2 && isEndnotes(h.title))
  if (!evidence && !calls.size && !definitions.size) return
  if (!evidence) throw new Error('Endnotes require a final 근거 주석, Evidence notes or Endnotes section')
  if (headings.some((h) => h.index > evidence.index)) throw new Error('No document section may follow endnotes')
  if ([...definitions.values()].some((index) => index <= evidence.index)) throw new Error('Endnote definitions must be in the final 근거 주석 section')
}

export const loadKit = (assets = ASSETS): DocumentKit => {
  const catalog = JSON.parse(readFileSync(join(assets, 'catalog.json'), 'utf8')) as Catalog
  const config = JSON.parse(readFileSync(join(assets, 'presets.json'), 'utf8')) as KitConfig
  const parts = new Map<string, Part>()
  for (const part of catalog.parts) {
    if (parts.has(part.id)) throw new Error(`Duplicate Part: ${part.id}`)
    const raw = readFileSync(join(assets, part.file), 'utf8').replace(/\r\n/g, '\n')
    const body = raw.match(/<!-- body:start -->\n([\s\S]*?)\n<!-- body:end -->/)?.[1]
    const notes = raw.match(/<!-- notes:start -->\n([\s\S]*?)\n<!-- notes:end -->/)?.[1] ?? ''
    if (!body?.startsWith('## ')) throw new Error(`Missing complete body for ${part.id}`)
    parts.set(part.id, { ...part, body: body.trim(), notes: notes.trim() })
  }
  const rank = { narrative: 0, records: 1, attachments: 2, endnotes: 3 }
  for (const order of [config.part_order, ...config.presets.map((p) => p.narrative_order)]) {
    if (order.length !== parts.size || new Set(order).size !== parts.size || order.some((id) => !parts.has(id)) || order.at(-1) !== 'P03') {
      throw new Error('Every reading order must contain each Part once, with endnotes last')
    }
    if (order.some((id, i) => i && rank[parts.get(id)!.placement] < rank[parts.get(order[i - 1])!.placement])) throw new Error('Invalid Part placement order')
  }
  for (const preset of config.presets) {
    if (config.common_required.some((id) => !preset.required.includes(id))) throw new Error(`Missing common Part in ${preset.id}`)
    if ([...preset.required, ...preset.optional].some((id) => !parts.has(id))) throw new Error(`Unknown Part in ${preset.id}`)
  }
  for (const condition of config.conditional_rules) {
    if (condition.required.some((id) => !parts.has(id))) throw new Error(`Unknown Part in ${condition.id}`)
  }
  return { catalog, config, parts }
}

export const composeDocument = (type: string, { parts: extra = [], conditions = [], kit = loadKit() }: ComposeOptions = {}): string => {
  const preset = kit.config.presets.find((p) => p.id === type)
  if (!preset) throw new Error(`Unknown document type: ${type}`)
  const selected = new Set(preset.required)
  for (const id of extra) {
    if (!kit.parts.has(id)) throw new Error(`Unknown Part: ${id}`)
    selected.add(id)
  }
  for (const id of conditions) {
    const rule = kit.config.conditional_rules.find((rule) => rule.id === id)
    if (!rule) throw new Error(`Unknown condition: ${id}`)
    rule.required.forEach((part) => selected.add(part))
  }
  const ordered = preset.narrative_order.filter((id) => selected.has(id))
  const chunks = [`# ${preset.title}\n`]
  let records = false
  const endnotes: string[] = []
  for (const id of ordered) {
    const part = kit.parts.get(id)!
    let body = part.body
    if (id === 'P03') {
      endnotes.unshift(body)
      continue
    }
    if (id === 'P02') body = body.replace('Phase: [Phase].', `Phase: ${preset.phase}.`).replace('단계: [단계].', `단계: ${preset.phase}.`)
    if (preset.headings[id]) body = body.replace(/^## [^\n]+/, `## ${preset.headings[id]}`)
    if (part.placement === 'records') {
      if (!records) chunks.push(kit.catalog.language === 'en' ? '## Document and review records\n' : '## 문서와 검토 기록\n')
      records = true
      body = body.replace(/^## /, '### ')
    }
    chunks.push(`${body}\n`)
    if (part.notes) endnotes.push(part.notes)
  }
  if (endnotes.length) {
    if (!endnotes[0].startsWith('## ')) endnotes.unshift(kit.catalog.language === 'en' ? '## Evidence notes' : '## 근거 주석')
    chunks.push(`${endnotes.join('\n\n')}\n`)
  }
  return formatDocument(chunks.join('\n').trim())
}

const main = () => {
  const args = process.argv.slice(2)
  const options: CliOptions = {}
  const flags: Set<string> = new Set(['--type', '--out', '--parts', '--conditions', '--format'])
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--list' || arg === '--help') {
      if (options[arg]) throw new Error(`Duplicate option: ${arg}`)
      options[arg] = true
    } else if (flags.has(arg)) {
      if (options[arg as ValueFlag] !== undefined) throw new Error(`Duplicate option: ${arg}`)
      const value = args[++i]
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`)
      options[arg as ValueFlag] = value
    } else throw new Error(`Unknown option: ${arg}`)
  }
  if (options['--help'] && Object.keys(options).length === 1) return void console.log(USAGE)
  if (options['--list'] && Object.keys(options).length === 1) {
    const { catalog, config } = loadKit()
    return void console.log(JSON.stringify({ types: config.presets.map(({ id, title, required, reading_flow }) => ({ id, title, required, reading_flow })), parts: catalog.parts, conditions: config.conditional_rules }, null, 2))
  }
  if (options['--format'] && Object.keys(options).length === 1) {
    const file = resolve(options['--format'])
    const text = formatDocument(readFileSync(file, 'utf8'))
    writeFileSync(file, text)
    return void console.log(file)
  }
  if (options['--type'] && options['--out'] && !options['--format'] && !options['--list'] && !options['--help']) {
    const csv = (key: ValueFlag) => options[key] ? options[key]!.split(',').map((x) => x.trim()).filter(Boolean) : []
    const text = composeDocument(options['--type'], { parts: csv('--parts'), conditions: csv('--conditions') })
    const file = resolve(options['--out'])
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text, { flag: 'wx' })
    return void console.log(file)
  }
  throw new Error(USAGE)
}

if (process.argv[1] && existsSync(process.argv[1]) && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  try { main() } catch (error) { console.error((error as Error).message); process.exitCode = 2 }
}
