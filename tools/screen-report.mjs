// Turns screen-checker result files into one self-contained HTML report: one section per file, per state its images
// side by side and its items grouped by class. It never opens a browser; the caller decides how to show the file.
// Usage: node screen-report.mjs --out <report.html> [--embed] <result.json>...
// --embed inlines images as base64 data URIs (for sharing); otherwise image links are relative to the report's folder.
// Exit 0 on success, 2 on bad arguments or invalid result files (every problem is listed with its file name).
//
// Result file (one per checker run):
// { "kind": "design" | "parity" | "variants", "task": "short title", "verdict": "PASS" | "FAIL" | "BLOCKED",
//   "states": [ { "name": "Orders list · empty", "verdict": "PASS" | "FAIL" | "BLOCKED",
//       "images": [ { "label": "Figma" | "BEFORE" | "AFTER" | "Diff" | "<variant name>", "path": "shot.png" } ],
//       "items": [ { "class": "MATCH" | "MISMATCH" | "EXPECTED" | "UNEXPECTED" | "NOISE" | "MISSING", "text": "…" } ] } ],
//   "consoleErrors": ["…"], "noise": "…", "openQuestions": ["…"] }
// design compares Figma | AFTER | Diff, parity compares BEFORE | AFTER | Diff (EXPECTED = an intended difference).
// variants puts several versions of one screen side by side (one image per variant); verdicts and items may be absent.
// A relative image path is relative to the result file it appears in.
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const KINDS = ['design', 'parity', 'variants']
const VERDICTS = ['PASS', 'FAIL', 'BLOCKED']
const STATE_VERDICTS = ['PASS', 'FAIL', 'BLOCKED']
// Problems first, then what was checked, NOISE last (rendered collapsed).
const CLASS_ORDER = ['UNEXPECTED', 'MISMATCH', 'MISSING', 'EXPECTED', 'MATCH', 'NOISE']
const PROBLEM_CLASSES = new Set(['UNEXPECTED', 'MISMATCH', 'MISSING'])
const KIND_TITLES = { design: 'Design check (Figma | AFTER | Diff)', parity: 'Parity check (BEFORE | AFTER | Diff)', variants: 'Variants comparison' }
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' }

export const parseArgs = (argv) => {
  const options = { out: null, embed: false, inputs: [] }
  const errors = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--out') {
      // A following option (`--out --embed`) is a forgotten path, not a file named "--embed".
      if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) errors.push('--out needs a file path')
      else options.out = argv[++i]
    } else if (arg === '--embed') options.embed = true
    else if (arg.startsWith('--')) errors.push(`unknown option ${arg}`)
    else options.inputs.push(arg)
  }
  if (!options.out && !errors.includes('--out needs a file path')) errors.push('--out <report.html> is required')
  if (!options.inputs.length) errors.push('at least one result.json is required')
  return { options, errors }
}

const isStringArray = (value) => Array.isArray(value) && value.every((entry) => typeof entry === 'string')
const isText = (value) => typeof value === 'string' && value.trim() !== ''

export const validateResult = (result) => {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return ['top level must be an object']
  const problems = []
  const variants = result.kind === 'variants'
  if (!KINDS.includes(result.kind)) problems.push(`kind must be one of ${KINDS.join(', ')}`)
  if (!isText(result.task)) problems.push('task must be a non-empty string')
  if (!(variants && result.verdict === undefined) && !VERDICTS.includes(result.verdict)) problems.push(`verdict must be one of ${VERDICTS.join(', ')}`)
  if (!Array.isArray(result.states) || !result.states.length) problems.push('states must be a non-empty array')
  else {
    result.states.forEach((state, index) => {
      const at = `states[${index}]`
      if (!state || typeof state !== 'object') return problems.push(`${at} must be an object`)
      if (!isText(state.name)) problems.push(`${at}.name must be a non-empty string`)
      if (!(variants && state.verdict === undefined) && !STATE_VERDICTS.includes(state.verdict)) problems.push(`${at}.verdict must be one of ${STATE_VERDICTS.join(', ')}`)
      if (!Array.isArray(state.images)) problems.push(`${at}.images must be an array`)
      else
        state.images.forEach((image, i) => {
          if (!isText(image?.label)) problems.push(`${at}.images[${i}].label must be a non-empty string`)
          if (!isText(image?.path)) problems.push(`${at}.images[${i}].path must be a non-empty string`)
        })
      if (variants && state.items === undefined) return
      if (!Array.isArray(state.items)) return problems.push(`${at}.items must be an array`)
      state.items.forEach((item, i) => {
        if (!CLASS_ORDER.includes(item?.class)) problems.push(`${at}.items[${i}].class must be one of ${CLASS_ORDER.join(', ')}`)
        if (!isText(item?.text)) problems.push(`${at}.items[${i}].text must be a non-empty string`)
      })
    })
  }
  if (result.consoleErrors !== undefined && !isStringArray(result.consoleErrors)) problems.push('consoleErrors must be an array of strings')
  if (result.openQuestions !== undefined && !isStringArray(result.openQuestions)) problems.push('openQuestions must be an array of strings')
  if (result.noise !== undefined && typeof result.noise !== 'string') problems.push('noise must be a string')
  return problems
}

// Reads and validates every input; returns the parsed results or every problem prefixed with its file name.
export const loadResults = (inputs) => {
  const results = []
  const problems = []
  for (const file of inputs) {
    let result
    try {
      // Windows editors and PowerShell's Out-File write a BOM that JSON.parse rejects.
      result = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''))
    } catch (error) {
      problems.push(`${file}: ${error.code === 'ENOENT' ? 'file not found' : `not valid JSON (${error.message})`}`)
      continue
    }
    const found = validateResult(result)
    problems.push(...found.map((problem) => `${file}: ${problem}`))
    if (!found.length) results.push({ file, result })
  }
  return { results, problems }
}

export const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])

export const overallVerdict = (results) => {
  const verdicts = results.map(({ result }) => result.verdict).filter(Boolean)
  if (verdicts.includes('FAIL')) return 'FAIL'
  if (verdicts.includes('BLOCKED')) return 'BLOCKED'
  return verdicts.length ? 'PASS' : null
}

// On Windows a file on another drive has no relative path (relative() returns it absolute), so it gets a file: URL.
export const linkTo = (absolute, fromDir) => {
  const path = relative(fromDir, absolute)
  return isAbsolute(path) ? pathToFileURL(absolute).href : path.split(/[\\/]/).map(encodeURIComponent).join('/')
}

// Returns the src to write into the HTML, or null when the path is not a readable file (absent, a folder, no access).
export const imageSource = (imagePath, resultFile, outFile, embed) => {
  const absolute = isAbsolute(imagePath) ? imagePath : resolve(dirname(resultFile), imagePath)
  try {
    if (!statSync(absolute).isFile()) return null
    if (!embed) return linkTo(absolute, dirname(resolve(outFile)))
    return `data:${MIME[extname(absolute).toLowerCase()] ?? 'application/octet-stream'};base64,${readFileSync(absolute).toString('base64')}`
  } catch {
    return null
  }
}

const badge = (verdict) => (verdict ? `<span class="badge v-${verdict}">${escapeHtml(verdict)}</span>` : '')

const renderImages = (images, resultFile, options) => {
  const figures = images.map(({ label, path }) => {
    const src = imageSource(path, resultFile, options.out, options.embed)
    const body = src
      ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(label)}" loading="lazy">`
      : `<div class="missing">missing: ${escapeHtml(path)}</div>`
    return `<figure><figcaption>${escapeHtml(label)}</figcaption>${body}</figure>`
  })
  return figures.length ? `<div class="images">${figures.join('')}</div>` : ''
}

const renderItems = (items = []) =>
  CLASS_ORDER.map((itemClass) => {
    const matching = items.filter((item) => item.class === itemClass)
    if (!matching.length) return ''
    const list = `<ul>${matching.map((item) => `<li>${escapeHtml(item.text)}</li>`).join('')}</ul>`
    const heading = `${itemClass} (${matching.length})`
    if (itemClass === 'NOISE') return `<details class="items c-NOISE"><summary>${heading}</summary>${list}</details>`
    return `<div class="items c-${itemClass}${PROBLEM_CLASSES.has(itemClass) ? ' problem' : ''}"><h4>${heading}</h4>${list}</div>`
  }).join('')

const renderList = (title, entries) =>
  entries?.length ? `<div class="extra"><h4>${title}</h4><ul>${entries.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul></div>` : ''

const renderSection = ({ file, result }, options) => {
  const states = result.states
    .map(
      (state) =>
        `<article class="state"><h3>${escapeHtml(state.name)} ${badge(state.verdict)}</h3>${renderImages(state.images, file, options)}${renderItems(state.items)}</article>`,
    )
    .join('')
  const noise = result.noise ? `<div class="extra"><h4>Noise level</h4><p>${escapeHtml(result.noise)}</p></div>` : ''
  return `<section><h2>${escapeHtml(KIND_TITLES[result.kind])}: ${escapeHtml(result.task)} ${badge(result.verdict)}</h2>${states}${renderList('Console errors', result.consoleErrors)}${noise}${renderList('Open questions', result.openQuestions)}</section>`
}

const STYLE = `
:root{color-scheme:light dark;--bg:#fff;--fg:#1d1f23;--muted:#5f6670;--line:#d9dce1;--card:#f6f7f9;--pass:#1a7f37;--fail:#c62828;--blocked:#9a6700;--problem-bg:#fdecec}
@media (prefers-color-scheme:dark){:root{--bg:#16181c;--fg:#e6e8eb;--muted:#9aa1ab;--line:#353a42;--card:#1f2228;--pass:#4ac26b;--fail:#ff6b6b;--blocked:#e3b341;--problem-bg:#3a1f22}}
*{box-sizing:border-box}body{margin:0;padding:16px 24px;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}
header{border-bottom:1px solid var(--line);margin-bottom:16px}h1{font-size:20px;margin:0 0 8px}h2{font-size:17px;margin:24px 0 8px}h3{font-size:15px;margin:0 0 8px}h4{font-size:13px;margin:8px 0 4px}
section{border-top:2px solid var(--line);padding-top:8px}.state{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;margin:12px 0}
.badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:600;color:#fff;vertical-align:middle}.v-PASS{background:var(--pass)}.v-FAIL{background:var(--fail)}.v-BLOCKED{background:var(--blocked)}
.images{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px}figure{margin:0;flex:0 0 auto}figcaption{font-weight:600;color:var(--muted);margin-bottom:4px}
figure img{display:block;max-height:420px;max-width:600px;border:1px solid var(--line);cursor:zoom-in}
.missing{width:240px;height:120px;display:flex;align-items:center;justify-content:center;padding:8px;border:2px dashed var(--fail);color:var(--fail);word-break:break-all}
.items ul,.extra ul{margin:0;padding-left:20px}.problem{background:var(--problem-bg);border-left:4px solid var(--fail);padding:4px 8px;border-radius:4px}.problem h4{color:var(--fail)}
details.c-NOISE{color:var(--muted);margin-top:8px}
dialog{max-width:96vw;max-height:96vh;padding:0;border:0;background:transparent}dialog img{max-width:96vw;max-height:94vh;display:block;cursor:zoom-out}dialog::backdrop{background:rgba(0,0,0,.8)}
`

// Inline only: the report must work offline and from file://. A data: URI cannot be opened as a new tab, hence the dialog.
const SCRIPT = `document.addEventListener('click',function(e){var t=e.target;var d=document.getElementById('full');if(t.tagName==='IMG'&&t.closest('figure')){d.querySelector('img').src=t.src;d.showModal()}else if(d.open&&d.contains(t)){d.close()}})`

export const renderReport = (results, options) => {
  const verdict = overallVerdict(results)
  const tasks = [...new Set(results.map(({ result }) => result.task))]
  const title = `Screen report: ${tasks.join(' / ')}`
  const summary = verdict ? `Overall ${badge(verdict)}` : 'No overall verdict (variants comparison)'
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
<body><header><h1>${escapeHtml(title)}</h1><p class="overall">${summary}</p></header>
${results.map((entry) => renderSection(entry, options)).join('\n')}
<dialog id="full"><img alt="full size"></dialog><script>${SCRIPT}</script></body></html>
`
}

const main = () => {
  const { options, errors } = parseArgs(process.argv.slice(2))
  if (errors.length) {
    console.error(`${errors.join('\n')}\nUsage: node screen-report.mjs --out <report.html> [--embed] <result.json>...`)
    process.exit(2)
  }
  const { results, problems } = loadResults(options.inputs)
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exit(2)
  }
  mkdirSync(dirname(resolve(options.out)), { recursive: true })
  writeFileSync(options.out, renderReport(results, options))
  console.log(resolve(options.out))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
