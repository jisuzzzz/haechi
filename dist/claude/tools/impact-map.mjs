// Lists consumers outside the diff of the exports and signatures a change touched, so callers that
// must change along with it are not missed.
// Usage: node impact-map.mjs [--base <rev>] [--json] [path...]
// Compares --base (default HEAD) with the working tree, untracked files included; consumers come from `git grep -w`
// over tracked files of the same language, outside the defining file and outside the changed hunks.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { changedFiles, grepWords, inRanges } from './sibling-path-map.mjs'

const JS_FILE = /\.([cm]?[jt]sx?|vue|svelte)$/i
const PY_FILE = /\.py$/i

const JS_FUNCTION = /^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/
const JS_DECLARATION = /^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/
const JS_ARROW = /=\s*(?:async\s+)?(?:\(|function\b|[A-Za-z_$][\w$]*\s*=>)/
const PY_DEF = /^(?:async\s+)?def\s+([A-Za-z_]\w*)/
const PY_CLASS = /^class\s+([A-Za-z_]\w*)/

const touches = (ranges, from, to) => ranges.some(([start, end]) => start <= to && end >= from)

// Last line (0-based) of a signature whose parameter list opens on line `from`, or `from` when there is none
const signatureEnd = (lines, from, column) => {
  let depth = 0
  let opened = false
  for (let index = from; index < lines.length; index++) {
    for (const ch of index === from ? lines[index].slice(column) : lines[index]) {
      if (ch === '(') {
        depth += 1
        opened = true
      } else if (ch === ')') depth -= 1
      if (opened && depth === 0) return index
    }
    if (!opened && index > from) return from
  }
  return from
}

const exportListNames = (lines, from, ranges) => {
  const names = []
  for (let index = from; index < lines.length; index++) {
    const line = index === from ? lines[index].slice(lines[index].indexOf('{') + 1) : lines[index]
    const body = line.split('}')[0]
    if (touches(ranges, index + 1, index + 1)) {
      for (const spec of body.split(',')) {
        const match = spec.trim().match(/^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/)
        const name = match && (match[2] ?? match[1])
        if (name && name !== 'default') names.push(name)
      }
    }
    if (line.includes('}')) return { names, end: index }
  }
  return { names, end: lines.length - 1 }
}

// ranges: changed new-side line ranges [[start, end]] (1-based). Returns [{ name, kind, line }].
export const findTouchedSymbols = (text, ranges, language = 'js') => {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const symbols = []
  const add = (name, kind, index) => {
    if (!symbols.some((symbol) => symbol.name === name)) symbols.push({ name, kind, line: index + 1 })
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (language === 'python') {
      const def = line.match(PY_DEF)
      if (def && touches(ranges, index + 1, signatureEnd(lines, index, def[0].length) + 1)) add(def[1], 'function', index)
      const cls = line.match(PY_CLASS)
      if (cls && touches(ranges, index + 1, index + 1)) add(cls[1], 'class', index)
      continue
    }
    const fn = line.match(JS_FUNCTION)
    if (fn) {
      if (touches(ranges, index + 1, signatureEnd(lines, index, fn[0].length) + 1)) add(fn[1], 'function', index)
      continue
    }
    const declaration = line.match(JS_DECLARATION)
    if (declaration) {
      const [, keyword, name] = declaration
      const rest = line.slice(declaration[0].length)
      const arrow = (keyword === 'const' || keyword === 'let') && JS_ARROW.test(rest)
      const end = arrow ? signatureEnd(lines, index, declaration[0].length) : index
      if (touches(ranges, index + 1, end + 1)) add(name, arrow ? 'function' : keyword, index)
      continue
    }
    if (/^\s*export\s+(?:type\s+)?\{/.test(line)) {
      const { names, end } = exportListNames(lines, index, ranges)
      for (const name of names) add(name, 'export', index)
      index = end
    }
  }
  return symbols
}

export const classifyHit = (text) =>
  /^\s*import\b|\bimport\s*\(|\brequire\s*\(|^\s*from\s+[\w.]+\s+import\b|^\s*export\s.*\bfrom\s+['"]/.test(text) ? 'import' : 'use'

export const impactMap = (files, readText, grep) => {
  const symbols = []
  for (const [path, file] of files) {
    const language = PY_FILE.test(path) ? 'python' : JS_FILE.test(path) ? 'js' : null
    const text = language && readText(path)
    if (!text) continue
    for (const symbol of findTouchedSymbols(text, file.ranges, language)) symbols.push({ ...symbol, file: path, language })
  }
  const hits = grep([...new Set(symbols.map((symbol) => symbol.name))])
  return symbols.map(({ name, file, kind, language }) => ({
    name,
    file,
    kind,
    consumers: (hits.get(name) ?? [])
      .filter((hit) => hit.path !== file && (language === 'python' ? PY_FILE : JS_FILE).test(hit.path))
      .filter((hit) => !(files.has(hit.path) && inRanges(files.get(hit.path).ranges, hit.line)))
      .map((hit) => ({ ...hit, type: classifyHit(hit.text) })),
  }))
}

const main = () => {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const baseIndex = args.indexOf('--base')
  const base = baseIndex === -1 ? 'HEAD' : args[baseIndex + 1]
  if (!base || base.startsWith('--')) {
    console.error('usage: node impact-map.mjs [--base <rev>] [--json] [path...]')
    process.exit(2)
  }
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const paths = args
    .filter((arg, index) => arg !== '--json' && index !== baseIndex && index !== baseIndex + 1)
    .map((arg) => relative(root, resolve(arg)).replace(/\\/g, '/') || '.')
  const readText = (path) => (existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : '')
  const symbols = impactMap(changedFiles(root, base, paths), readText, (names) => grepWords(root, names))
  if (json) {
    console.log(JSON.stringify({ symbols }, null, 2))
    return
  }
  if (!symbols.length) {
    console.log('impact-map: the change touches no exported declaration or signature')
    return
  }
  console.log(`impact-map: ${symbols.length} touched symbol(s)`)
  for (const symbol of symbols) {
    console.log(`\n${symbol.name}  ${symbol.kind}  ${symbol.file}`)
    if (!symbol.consumers.length) console.log('  no consumers outside the change')
    for (const hit of symbol.consumers) console.log(`  ${hit.type.padEnd(6)} ${hit.path}:${hit.line}  ${hit.text}`)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
