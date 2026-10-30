// Counts "logic lines" in a change: added + deleted lines, leaving out import/export-from statements,
// blank lines, whitespace-only edits and pure renames. Used to size a change before delegating or reviewing it.
// Usage: node count-logic-lines.mjs [--base <rev>] [--head <rev>] [--json] <path...>
// Default compares HEAD with the working tree (staged included) plus untracked files; pass --base <rev> after committing.
// A rename that spreads to call sites still counts there — the reader decides whether to discount it.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ALWAYS_EXCLUDED = ['*.json', '*.md', '*.lock']
// "next to source" means tests sit beside the code, so they are recognised by file name instead of folder
const TEST_FILE_GLOBS = ['*.test.*', '*.spec.*', 'test_*.py', '*_test.py']

const IMPORT_PATTERNS = [
  /^\s*import\s+[^'"]*?from\s+['"][^'"]+['"];?[ \t]*$/gms,
  /^\s*import\s+['"][^'"]+['"];?[ \t]*$/gm,
  /^\s*export\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+['"][^'"]+['"];?[ \t]*$/gms,
  /^\s*from\s+[\w.]+\s+import\s+\([^)]*\)[ \t]*$/gms,
  /^\s*(?:from\s+[\w.]+\s+)?import\s+[^\n(]+$/gm,
]

// Blank lines go too: git's --ignore-blank-lines still counts blank lines that share a hunk with a real change
export const stripImports = (text) =>
  IMPORT_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, ''), text.replace(/\r\n/g, '\n'))
    .split('\n')
    .filter((line) => line.trim())

// Myers' O(ND) diff; D is exactly the number of added + deleted lines in a minimal diff
const editDistance = (a, b) => {
  const n = a.length
  const m = b.length
  const offset = n + m + 1
  const v = new Int32Array(2 * offset + 1)
  for (let d = 0; d <= n + m; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x += 1
        y += 1
      }
      v[offset + k] = x
      if (x >= n && y >= m) return d
    }
  }
  return n + m
}

// Whitespace is removed inside lines as well, like `git diff -w`
export const countLogicLines = (before, after) => {
  const a = stripImports(before).map((line) => line.replace(/\s+/g, ''))
  const b = stripImports(after).map((line) => line.replace(/\s+/g, ''))
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1
    endB -= 1
  }
  return editDistance(a.slice(start, endA), b.slice(start, endB))
}

const cleanEntry = (entry) => entry.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')

export const excludePathspecs = (settings) => {
  const globs = [...ALWAYS_EXCLUDED]
  const dirs = []
  for (const entry of [...(settings?.testDirs ?? []), ...(settings?.generated ?? [])]) {
    if (typeof entry !== 'string' || !entry.trim()) continue
    if (entry === 'next to source') globs.push(...TEST_FILE_GLOBS)
    else dirs.push(cleanEntry(entry))
  }
  return [...new Set(globs)].map((glob) => `:(exclude,glob)**/${glob}`).concat([...new Set(dirs)].map((dir) => `:(exclude)${dir}`))
}

const git = (root, args) =>
  execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-c', 'core.quotePath=false', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

const revContent = (root, rev, path) => {
  try {
    return git(root, ['show', `${rev}:${path}`])
  } catch {
    return ''
  }
}

const readSettings = (root) => {
  const file = join(root, '.haechi.json')
  if (!existsSync(file)) return undefined
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

// paths are repo-root relative; returns { files: [{ path, label, lines }], total }
export const countChanges = ({ root, base = 'HEAD', head, paths }) => {
  const pathspec = [...paths, ...excludePathspecs(readSettings(root))]
  const afterContent = (path) => {
    if (head) return revContent(root, head, path)
    return existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : ''
  }
  const pairs = git(root, ['diff', '-M', '--name-status', base, ...(head ? [head] : []), '--', ...pathspec])
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, first, second] = line.split('\t')
      if (status.startsWith('R')) return { path: second, label: `${first} → ${second}`, before: first, after: second }
      if (status === 'A') return { path: first, label: first, before: null, after: first }
      if (status === 'D') return { path: first, label: first, before: first, after: null }
      return { path: first, label: first, before: first, after: first }
    })
  const untracked = head
    ? []
    : git(root, ['ls-files', '-o', '--exclude-standard', '--', ...pathspec])
        .split('\n')
        .filter(Boolean)
        .map((path) => ({ path, label: `${path} (untracked)`, before: null, after: path }))
  const files = [...pairs, ...untracked].map((pair) => ({
    path: pair.path,
    label: pair.label,
    lines: countLogicLines(pair.before ? revContent(root, base, pair.before) : '', pair.after ? afterContent(pair.after) : ''),
  }))
  return { files, total: files.reduce((sum, file) => sum + file.lines, 0) }
}

const main = () => {
  const args = process.argv.slice(2)
  const takeOption = (name) => {
    const index = args.indexOf(name)
    return index === -1 ? undefined : args.splice(index, 2)[1]
  }
  const takeFlag = (name) => {
    const index = args.indexOf(name)
    if (index !== -1) args.splice(index, 1)
    return index !== -1
  }
  const base = takeOption('--base') ?? 'HEAD'
  const head = takeOption('--head')
  const json = takeFlag('--json')
  if (args.length === 0) {
    console.error('usage: node count-logic-lines.mjs [--base <rev>] [--head <rev>] [--json] <path...>')
    process.exit(2)
  }
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim()
  // Pathspecs like ':!x' pass through untouched; plain paths become repo-root relative
  const paths = args.map((arg) => (arg.startsWith(':') ? arg : relative(root, resolve(arg)).replace(/\\/g, '/') || '.'))
  const result = countChanges({ root, base, head, paths })
  if (json) {
    console.log(JSON.stringify({ files: result.files.map(({ path, lines }) => ({ path, lines })), total: result.total }, null, 2))
    return
  }
  for (const file of result.files) if (file.lines > 0) console.log(`${String(file.lines).padStart(6)}  ${file.label}`)
  console.log(`logic lines: ${result.total}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
