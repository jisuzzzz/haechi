// Checks whether the tests notice small breakages in changed lines: flips one operator or literal at a time,
// runs the given tests, and reports which mutants survived (tests still pass) — those lines are untested in practice.
// Usage: node mutation-check.mjs --file <source> --test-cmd "<command containing {tests}>" --tests <test files...>
//          [--lines <a-b,…>] [--base <rev>] [--limit 20] [--timeout 120] [--json]
// Without --lines it mutates the lines of --file changed against --base (default HEAD); an untracked file uses every line.
// The source file is restored when the run ends or is interrupted with Ctrl+C; after a hard kill (taskkill /F, a shell
// timeout) the next run restores it first. Exit 0 with survivors (information), 2 on bad arguments or failing tests.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const JS_REGEX_BEFORE = /[(,=:[!&|?{};+\-*%<>~^]/
const JS_REGEX_KEYWORD = /\b(return|typeof|case|do|else|in|of|void|yield|await|delete|instanceof|new)$/

// Replaces every character inside strings and regex literals with \0 and inside comments with \x01 (newlines kept),
// so operator patterns only ever match real code. Template literals are masked whole, ${} included.
export const maskNonCode = (text, language) => {
  const out = text.split('')
  const hide = (from, to, mark) => {
    for (let i = from; i < to; i++) if (out[i] !== '\n') out[i] = mark
  }
  const python = language === 'python'
  let i = 0
  let lastCode = ''
  while (i < text.length) {
    const ch = text[i]
    const next = text[i + 1]
    let end = null
    let comment = false
    if (python ? ch === '#' : ch === '/' && next === '/') {
      end = text.indexOf('\n', i) === -1 ? text.length : text.indexOf('\n', i)
      comment = true
    } else if (!python && ch === '/' && next === '*') {
      end = text.indexOf('*/', i + 2)
      end = end === -1 ? text.length : end + 2
      comment = true
    } else if (python && (text.startsWith('"""', i) || text.startsWith("'''", i))) {
      end = text.indexOf(text.slice(i, i + 3), i + 3)
      end = end === -1 ? text.length : end + 3
    } else if (ch === '"' || ch === "'" || (!python && ch === '`')) {
      let j = i + 1
      while (j < text.length && text[j] !== ch && (ch === '`' || text[j] !== '\n')) j += text[j] === '\\' ? 2 : 1
      end = Math.min(j + 1, text.length)
    } else if (!python && ch === '/') {
      const before = text.slice(Math.max(0, i - 12), i).trimEnd()
      if (!lastCode || JS_REGEX_BEFORE.test(lastCode) || JS_REGEX_KEYWORD.test(before)) {
        let j = i + 1
        let inClass = false
        while (j < text.length && text[j] !== '\n' && (inClass || text[j] !== '/')) {
          if (text[j] === '\\') j += 1
          else if (text[j] === '[') inClass = true
          else if (text[j] === ']') inClass = false
          j += 1
        }
        if (text[j] === '/') end = j + 1
      }
    }
    if (end !== null) {
      hide(i, end, comment ? '\x01' : '\0')
      if (!comment) lastCode = '"'
      i = end
      continue
    }
    if (!/\s/.test(ch)) lastCode = ch
    i += 1
  }
  return out.join('')
}

const JS_CALL_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'super', 'typeof', 'import', 'with'])
const PY_CALL_KEYWORDS = new Set(['if', 'elif', 'while', 'for', 'return', 'assert', 'del', 'not', 'yield', 'raise', 'with', 'def', 'class', 'lambda', 'except', 'and', 'or', 'in', 'is'])

const OPERATORS = {
  js: [
    { operator: 'comparison', pattern: /(?<![=!<>])(===|!==|==|!=)(?!=)/g, swap: { '===': '!==', '!==': '===', '==': '!=', '!=': '==' } },
    { operator: 'comparison', pattern: /(?<=\s)(<=|>=|<|>)(?=\s)/g, swap: { '<': '<=', '<=': '<', '>': '>=', '>=': '>' } },
    { operator: 'logical', pattern: /(&&|\|\|)(?!=)/g, swap: { '&&': '||', '||': '&&' } },
    { operator: 'boolean', pattern: /(?<![\w$.])(true|false)(?![\w$])/g, swap: { true: 'false', false: 'true' } },
    { operator: 'negation', pattern: /(?<![\w$!)\]])!(?=[A-Za-z_$(])/g, swap: { '!': '' } },
    { operator: 'integer', pattern: /(?<![\w$.])\d+(?![\w$.])/g, swap: (token) => String(Number(token) + 1) },
  ],
  python: [
    { operator: 'comparison', pattern: /(?<![=!<>])(==|!=)(?!=)/g, swap: { '==': '!=', '!=': '==' } },
    { operator: 'comparison', pattern: /(?<=\s)(<=|>=|<|>)(?=\s)/g, swap: { '<': '<=', '<=': '<', '>': '>=', '>=': '>' } },
    { operator: 'logical', pattern: /\b(and|or)\b/g, swap: { and: 'or', or: 'and' } },
    { operator: 'boolean', pattern: /(?<![\w.])(True|False)(?!\w)/g, swap: { True: 'False', False: 'True' } },
    { operator: 'negation', pattern: /\bnot\s+/g, swap: () => '' },
    { operator: 'integer', pattern: /(?<![\w.])\d+(?![\w.])/g, swap: (token) => String(Number(token) + 1) },
  ],
}

const balanced = (code) => {
  let depth = 0
  for (const ch of code) {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (depth < 0) return false
  }
  return depth === 0
}

// Comments vanish; a string stays as one value token
const codeOf = (masked) => masked.replace(/\x01/g, '').replace(/\0+/g, '0').trim()

// A line that is a whole call statement; its neighbours must not continue it, or commenting it out breaks the syntax
const dropCallSite = (lineText, maskedLines, index, python) => {
  const masked = maskedLines[index]
  const indent = masked.match(/^\s*/)[0].length
  if (masked[indent] === undefined || /[\0\x01]/.test(masked[indent])) return null
  const code = masked.slice(indent).replace(/[\s\x01]+$/, '')
  const call = python
    ? code.match(/^(?:await\s+)?([A-Za-z_]\w*)(?:\.[A-Za-z_]\w*)*\s*\(.*\)$/)
    : code.match(/^(?:await\s+)?([A-Za-z_$][\w$]*)(?:\??\.[A-Za-z_$][\w$]*)*\s*\(.*\);?$/)
  if (!call || (python ? PY_CALL_KEYWORDS : JS_CALL_KEYWORDS).has(call[1]) || !balanced(code)) return null
  let prev = index - 1
  while (prev >= 0 && !codeOf(maskedLines[prev])) prev -= 1
  const prevCode = prev >= 0 ? codeOf(maskedLines[prev]) : ''
  if (python ? /[\\([{,=+\-*/%&|<>]$/.test(prevCode) : /[=+\-*/%,([?:&|.<>!^~]$/.test(prevCode)) return null
  let next = index + 1
  while (next < maskedLines.length && !codeOf(maskedLines[next])) next += 1
  const nextCode = next < maskedLines.length ? codeOf(maskedLines[next]) : ''
  if (/^[.?&|+\-*/%=,)\]]/.test(nextCode)) return null
  const before = lineText.slice(indent).trimEnd()
  return { line: index + 1, column: indent, operator: 'drop-call', before, after: python ? 'pass' : `// ${before}` }
}

const sitesOnLine = (lineText, maskedLines, index, language) => {
  const masked = maskedLines[index]
  const sites = []
  for (const { operator, pattern, swap } of OPERATORS[language]) {
    for (const match of masked.matchAll(pattern)) {
      const before = match[0]
      const after = typeof swap === 'function' ? swap(before) : swap[before]
      if (after === undefined || after === before) continue
      sites.push({ line: index + 1, column: match.index, operator, before, after })
    }
  }
  const drop = dropCallSite(lineText, maskedLines, index, language === 'python')
  if (drop) sites.push(drop)
  return sites.sort((a, b) => a.column - b.column)
}

export const languageOf = (file) => (/\.py$/i.test(file) ? 'python' : 'js')

// lines: 1-based line numbers, or null for every line. The limit is spread round-robin over lines,
// so a long first line cannot use up the whole budget.
export const generateMutants = (text, lines, language, { limit = Infinity } = {}) => {
  const lineTexts = text.split('\n').map((line) => line.replace(/\r$/, ''))
  const maskedLines = maskNonCode(text, language).split('\n')
  const wanted = lines ? [...new Set(lines)].filter((line) => line >= 1 && line <= lineTexts.length).sort((a, b) => a - b) : lineTexts.map((_, i) => i + 1)
  const perLine = wanted.map((line) => sitesOnLine(lineTexts[line - 1], maskedLines, line - 1, language)).filter((sites) => sites.length)
  const picked = []
  for (let round = 0; picked.length < limit && perLine.some((sites) => sites.length > round); round++) {
    for (const sites of perLine) if (sites[round] && picked.length < limit) picked.push(sites[round])
  }
  return picked
    .sort((a, b) => a.line - b.line || a.column - b.column)
    .map((site) => {
      const lineText = lineTexts[site.line - 1]
      const mutated = lineText.slice(0, site.column) + site.after + lineText.slice(site.column + site.before.length)
      return { ...site, original: lineText.trim(), mutated: mutated.trim() }
    })
}

// Keeps the file's own line endings
export const applyMutant = (text, mutant) => {
  const lines = text.split('\n')
  const raw = lines[mutant.line - 1]
  const cr = raw.endsWith('\r') ? '\r' : ''
  const line = cr ? raw.slice(0, -1) : raw
  lines[mutant.line - 1] = line.slice(0, mutant.column) + mutant.after + line.slice(mutant.column + mutant.before.length) + cr
  return lines.join('\n')
}

export const parseLineRanges = (spec) => {
  const lines = []
  for (const part of spec.split(',').map((item) => item.trim()).filter(Boolean)) {
    const match = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!match) throw new Error(`bad line range "${part}"`)
    const from = Number(match[1])
    const to = Number(match[2] ?? match[1])
    for (let line = Math.min(from, to); line <= Math.max(from, to); line++) lines.push(line)
  }
  return lines
}

// New-side numbers of the added lines in a `git diff -U0` output
export const addedLines = (diffText) => {
  const lines = []
  let current = 0
  for (const line of diffText.replace(/\r\n/g, '\n').split('\n')) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) current = Number(hunk[1])
    else if (line.startsWith('+') && !line.startsWith('+++')) lines.push(current++)
  }
  return lines
}

const changedLines = (file, base) => {
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })
  try {
    if (!git(['ls-files', '--', file]).trim()) return null
    return addedLines(git(['diff', '-U0', '--no-color', '--no-ext-diff', base, '--', file]))
  } catch {
    // Outside a git repo there is nothing to diff against, so every line is fair game
    return null
  }
}

// A hard kill skips every exit and signal handler, so the original also waits on disk until it is put back
const BACKUP_DIR = join(tmpdir(), 'haechi-mutation-check')

const isAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

// Written to a temp name and renamed, so a kill during the write never leaves a half backup behind
export const saveBackup = (file, original, dir = BACKUP_DIR) => {
  mkdirSync(dir, { recursive: true })
  const path = resolve(file)
  const backup = join(dir, `${createHash('sha1').update(path).digest('hex')}.json`)
  writeFileSync(`${backup}.tmp`, JSON.stringify({ pid: process.pid, path, content: original.toString('base64') }))
  renameSync(`${backup}.tmp`, backup)
  return backup
}

// Puts back the sources of runs that died before restoring them; a backup whose run is still alive is left alone
export const recoverInterrupted = (dir = BACKUP_DIR) => {
  const restored = []
  for (const name of existsSync(dir) ? readdirSync(dir).filter((entry) => entry.endsWith('.json')) : []) {
    const backup = join(dir, name)
    const { pid, path, content } = JSON.parse(readFileSync(backup, 'utf8'))
    if (isAlive(pid)) continue
    writeFileSync(path, Buffer.from(content, 'base64'))
    rmSync(backup)
    restored.push(path)
  }
  return restored
}

const killTree = (child) => {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}

let running = null

const runCommand = (command, timeoutMs) =>
  new Promise((resolve) => {
    // detached on POSIX makes the shell a process-group leader, so a timeout can kill the test runner under it too
    const child = spawn(command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' })
    running = child
    let tail = ''
    const keep = (chunk) => {
      tail = (tail + chunk.toString()).slice(-4000)
    }
    child.stdout.on('data', keep)
    child.stderr.on('data', keep)
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child)
    }, timeoutMs)
    const finish = (code) => {
      clearTimeout(timer)
      running = null
      resolve({ status: timedOut ? 'timeout' : code === 0 ? 'pass' : 'fail', output: tail })
    }
    child.on('error', () => finish(1))
    child.on('close', finish)
  })

const STATUS = { pass: 'survived', fail: 'killed', timeout: 'timeout' }

export const parseArgs = (argv) => {
  const options = { tests: [], base: 'HEAD', limit: 20, timeout: 120, json: false }
  const single = { '--file': 'file', '--test-cmd': 'testCmd', '--lines': 'lines', '--base': 'base', '--limit': 'limit', '--timeout': 'timeout' }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--json') options.json = true
    else if (arg === '--tests') {
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) options.tests.push(argv[++i])
    } else if (single[arg] && i + 1 < argv.length) options[single[arg]] = argv[++i]
    else throw new Error(`unknown or incomplete argument "${arg}"`)
  }
  if (!options.file) throw new Error('--file is required')
  if (!existsSync(options.file)) throw new Error(`--file ${options.file} does not exist`)
  if (!options.testCmd?.includes('{tests}')) throw new Error('--test-cmd must contain {tests}')
  if (!options.tests.length) throw new Error('--tests needs at least one test file')
  options.limit = Number(options.limit)
  options.timeout = Number(options.timeout)
  if (!(options.limit > 0) || !(options.timeout > 0)) throw new Error('--limit and --timeout must be positive numbers')
  if (options.lines !== undefined) options.lines = parseLineRanges(options.lines)
  return options
}

const report = (result, json) => {
  if (json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }
  if (result.baseline === 'fail') {
    console.log(`mutation-check: the tests already fail without any mutation — fix them first.\n${result.output}`)
    return
  }
  console.log(`mutation-check: ${result.file} — ${result.mutants.length} mutant(s)`)
  for (const mutant of result.mutants) {
    const change = `${mutant.before.trim() || '∅'} → ${mutant.after.trim() || '∅'}`
    console.log(`  L${String(mutant.line).padEnd(5)} ${mutant.status.padEnd(9)} ${mutant.operator.padEnd(11)} ${change}\n         ${mutant.mutated}`)
  }
  const { killed, survived, timeout } = result.summary
  console.log(`killed ${killed} · survived ${survived} · timeout ${timeout}`)
  if (survived) console.log('survived = the tests still pass with that change; add a case that tells the two apart, or say why it does not matter.')
}

const main = async () => {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`mutation-check: ${error.message}`)
    console.error('usage: node mutation-check.mjs --file <source> --test-cmd "<cmd with {tests}>" --tests <files...> [--lines a-b,…] [--base <rev>] [--limit 20] [--timeout 120] [--json]')
    process.exit(2)
  }
  const command = options.testCmd.replaceAll('{tests}', options.tests.map((test) => `"${test.replaceAll('"', '\\"')}"`).join(' '))
  const timeoutMs = options.timeout * 1000
  for (const path of recoverInterrupted()) console.error(`mutation-check: restored ${path}, left mutated by an interrupted run`)
  const original = readFileSync(options.file)
  const text = original.toString('utf8')
  const lines = options.lines ?? changedLines(options.file, options.base)
  const mutants = generateMutants(text, lines, languageOf(options.file), { limit: options.limit })
  const summary = { killed: 0, survived: 0, timeout: 0 }
  const baseline = await runCommand(command, timeoutMs)
  if (baseline.status !== 'pass') {
    report({ file: options.file, baseline: 'fail', mutants: [], summary, output: baseline.output }, options.json)
    process.exit(2)
  }
  if (!mutants.length) {
    if (options.json) report({ file: options.file, baseline: 'pass', mutants: [], summary }, true)
    else console.log(`mutation-check: no mutable sites in the selected lines of ${options.file}`)
    return
  }

  const backup = saveBackup(options.file, original)
  let dirty = false
  const restore = () => {
    if (dirty) writeFileSync(options.file, original)
    dirty = false
    rmSync(backup, { force: true })
  }
  const abort = () => {
    if (running) killTree(running)
    restore()
    process.exit(130)
  }
  process.on('exit', restore)
  process.on('SIGINT', abort)
  process.on('SIGTERM', abort)
  const results = []
  try {
    for (const mutant of mutants) {
      dirty = true
      writeFileSync(options.file, applyMutant(text, mutant))
      const run = await runCommand(command, timeoutMs)
      const status = STATUS[run.status]
      summary[status] += 1
      results.push({ line: mutant.line, operator: mutant.operator, before: mutant.before, after: mutant.after, mutated: mutant.mutated, status })
    }
  } finally {
    restore()
  }
  report({ file: options.file, baseline: 'pass', mutants: results, summary }, options.json)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
