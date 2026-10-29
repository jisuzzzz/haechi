// Lists places that probably have to obey the same rule as a changed guard line, for the
// "fixed on one path, forgotten on its sibling" class of bugs. It points; the reader decides.
// Usage: node sibling-path-map.mjs [--base <rev>] [--json] [path...]
// Takes added lines (against --base, default HEAD, untracked files included) that guard, compare or normalize,
// pulls the identifiers out of them, and greps tracked files for the same identifiers outside the changed hunks.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HITS_PER_IDENTIFIER = 15
const CODE_FILE = /\.([cm]?[jt]sx?|vue|svelte|py)$/i

const GUARDS = {
  js: [
    /\bif\s*\(/,
    /\s\?\s.*\s:\s/,
    /===|!==|[^=!<>]==[^=]|!=[^=]/,
    /\s[<>]=?\s/,
    /\.(includes|filter|has|trim|toLowerCase|toUpperCase|startsWith|endsWith|some|every|find)\(/,
    /\bnew Set\(/,
    /\?\.|\?\?/,
  ],
  python: [/^\s*(if|elif|while)\s/, /\sif\s.*\selse\s/, /==|!=/, /\s[<>]=?\s/, /\s(not\s+)?in\s/, /\.(strip|lower|upper|startswith|endswith)\(/, /\bis\s+(not\s+)?None\b/],
}

const STOPLIST = new Set(
  `if else for while return const let var function class new this typeof instanceof void null undefined true false
  await async break continue switch case default try catch finally throw import export from of in do delete yield super
  extends static get set def elif not and or is None True False self cls lambda pass with as global raise except assert del
  print len str int float bool list dict tuple range isinstance type length includes filter map has trim toLowerCase
  toUpperCase some every find findIndex forEach reduce push pop shift slice splice concat join split replace replaceAll
  indexOf startsWith endsWith keys values entries test match exec then toString valueOf call apply bind Object Array String
  Number Boolean Set Map JSON Math Promise Date Error console log error warn strip lower upper items append format startswith
  endswith value data item key props state event args result`.split(/\s+/),
)

export const languageOf = (path) => (/\.py$/i.test(path) ? 'python' : 'js')

// Strings become "" and trailing comments go, so neither text nor commented code triggers a match
const codeOnly = (text, language) =>
  text
    .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""')
    .replace(language === 'python' ? /#.*$/ : /\/\/.*$/, '')
    .trim()

export const isGuardLine = (text, language = 'js') => {
  const code = codeOnly(text, language)
  if (!code || (language === 'js' && /^(\*|\/\*)/.test(code))) return false
  return GUARDS[language].some((pattern) => pattern.test(code))
}

const IDENT = '[A-Za-z_$][\\w$]*'
const COMPARE = '===|!==|==|!=|<=|>=|<|>'

export const extractIdentifiers = (text, language = 'js') => {
  const code = codeOnly(text, language)
  const found = []
  const add = (name) => {
    if (name && name.length >= 3 && !STOPLIST.has(name) && !found.includes(name)) found.push(name)
  }
  for (const match of code.matchAll(new RegExp(`(?:\\?\\.|\\.)\\s*(${IDENT})`, 'g'))) add(match[1])
  for (const match of code.matchAll(new RegExp(`(?<![\\w$.])(${IDENT})\\s*\\(`, 'g'))) add(match[1])
  for (const match of code.matchAll(new RegExp(`(${IDENT})\\s*(?:${COMPARE})`, 'g'))) add(match[1])
  for (const match of code.matchAll(new RegExp(`(?:${COMPARE})\\s*!?(${IDENT})`, 'g'))) add(match[1])
  for (const match of code.matchAll(new RegExp(`\\.(?:includes|has|indexOf|startsWith|endsWith)\\(\\s*(${IDENT})`, 'g'))) add(match[1])
  if (language === 'python') {
    for (const match of code.matchAll(/([A-Za-z_]\w*)\s+(?:not\s+)?in\s+([A-Za-z_]\w*)/g)) {
      add(match[1])
      add(match[2])
    }
  }
  return found
}

// git appends a tab to names with spaces and C-quotes names with special characters
const unquote = (raw) => {
  const path = raw.replace(/\t$/, '')
  if (!path.startsWith('"')) return path
  try {
    return JSON.parse(path)
  } catch {
    return path.slice(1, -1)
  }
}

// Map path → { ranges: [[start, end]] on the new side, added: [{ line, text }] } from `git diff -U0`
export const parseDiff = (diffText) => {
  const files = new Map()
  let file = null
  let current = 0
  let header = false
  for (const raw of diffText.replace(/\r\n/g, '\n').split('\n')) {
    if (raw.startsWith('diff --git ')) {
      header = true
      file = null
      continue
    }
    if (header && raw.startsWith('+++ ')) {
      const path = unquote(raw.slice(4))
      file = path === '/dev/null' ? null : { ranges: [], added: [] }
      if (file) files.set(path.replace(/^b\//, ''), file)
      continue
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (hunk) {
      header = false
      current = Number(hunk[1])
      const count = hunk[2] === undefined ? 1 : Number(hunk[2])
      // A pure deletion still touches the lines around the gap it leaves
      file?.ranges.push(count === 0 ? [current, current + 1] : [current, current + count - 1])
      continue
    }
    if (!header && file && raw.startsWith('+')) file.added.push({ line: current++, text: raw.slice(1) })
  }
  return files
}

export const inRanges = (ranges, line) => ranges.some(([start, end]) => line >= start && line <= end)

const git = (root, args, input) =>
  execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd: root,
    encoding: 'utf8',
    input,
    maxBuffer: 256 * 1024 * 1024,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  })

export const changedFiles = (root, base, paths) => {
  const files = parseDiff(git(root, ['diff', '-U0', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', base, '--', ...paths]))
  for (const path of git(root, ['ls-files', '-o', '--exclude-standard', '--', ...paths]).split('\n').filter(Boolean)) {
    if (!existsSync(join(root, path))) continue
    const text = readFileSync(join(root, path), 'utf8')
    if (text.includes('\0')) continue
    const lines = text.replace(/\r\n/g, '\n').split('\n')
    files.set(path, { ranges: [[1, lines.length]], added: lines.map((line, index) => ({ line: index + 1, text: line })) })
  }
  return files
}

// One `git grep` for every name; each hit is then assigned to the names it contains (git -w word rules)
export const grepWords = (root, names) => {
  const hits = new Map(names.map((name) => [name, []]))
  if (!names.length) return hits
  let out = ''
  try {
    out = git(root, ['grep', '-n', '-w', '-I', '-F', '--no-color', '-f', '-'], `${names.join('\n')}\n`)
  } catch (error) {
    // exit 1 means no match
    out = error.stdout ?? ''
  }
  const matchers = names.map((name) => [name, new RegExp(`(?<![A-Za-z0-9_])${name.replace(/\$/g, '\\$')}(?![A-Za-z0-9_])`)])
  for (const line of out.split('\n')) {
    const match = line.match(/^(.+?):(\d+):(.*)$/)
    if (!match) continue
    const hit = { path: match[1], line: Number(match[2]), text: match[3].replace(/\r$/, '').trim().slice(0, 200) }
    for (const [name, pattern] of matchers) if (pattern.test(match[3])) hits.get(name).push(hit)
  }
  return hits
}

export const siblingSites = (files, grep) => {
  const triggers = new Map()
  for (const [path, file] of files) {
    if (!CODE_FILE.test(path)) continue
    const language = languageOf(path)
    for (const added of file.added) {
      if (!isGuardLine(added.text, language)) continue
      for (const name of extractIdentifiers(added.text, language)) {
        if (!triggers.has(name)) triggers.set(name, { path, line: added.line, text: added.text.trim() })
      }
    }
  }
  const hits = grep([...triggers.keys()])
  const sites = []
  for (const [identifier, trigger] of triggers) {
    const outside = (hits.get(identifier) ?? []).filter((hit) => !(files.has(hit.path) && inRanges(files.get(hit.path).ranges, hit.line)))
    if (!outside.length) continue
    sites.push({ identifier, trigger, hits: outside.slice(0, HITS_PER_IDENTIFIER), more: Math.max(0, outside.length - HITS_PER_IDENTIFIER) })
  }
  return sites
}

const main = () => {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const baseIndex = args.indexOf('--base')
  const base = baseIndex === -1 ? 'HEAD' : args[baseIndex + 1]
  if (!base || base.startsWith('--')) {
    console.error('usage: node sibling-path-map.mjs [--base <rev>] [--json] [path...]')
    process.exit(2)
  }
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim()
  const paths = args
    .filter((arg, index) => arg !== '--json' && index !== baseIndex && index !== baseIndex + 1)
    .map((arg) => relative(root, resolve(arg)).replace(/\\/g, '/') || '.')
  const sites = siblingSites(changedFiles(root, base, paths), (names) => grepWords(root, names))
  if (json) {
    console.log(JSON.stringify({ sites }, null, 2))
    return
  }
  if (!sites.length) {
    console.log('sibling-path-map: no guard lines in the change have matches elsewhere')
    return
  }
  console.log(`sibling-path-map: ${sites.length} identifier(s) from changed guard lines also appear outside the change`)
  for (const site of sites) {
    console.log(`\n${site.identifier}  ← ${site.trigger.path}:${site.trigger.line}  ${site.trigger.text}`)
    for (const hit of site.hits) console.log(`  ${hit.path}:${hit.line}  ${hit.text}`)
    if (site.more) console.log(`  … ${site.more} more`)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
