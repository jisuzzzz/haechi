// Writes a throwaway UI prototype as one self-contained HTML file with an adaptable comparison shell: variant and
// state switchers and a side-by-side toggle, then an edit section with fake data per state and one render
// function per variant. Adapt the shell to the brief while keeping its controls functional.
// The caller fills the edit section and opens the file in a browser; no server is needed.
// Usage: node preview-scaffold.mjs --out <file.html> --title "<title>" [--variants "A,B"] [--states "Empty,Loaded"]
// It refuses to overwrite a file or to write inside a git work tree, so prototypes never mix with application code.
// Exit 0 on success (prints the file path), 2 on bad arguments.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'




const previewFont = readFileSync(new URL('../skills/preview/assets/PretendardVariable.woff2', import.meta.url)).toString('base64')

const USAGE = 'Usage: node preview-scaffold.mjs --out <file.html> --title "<title>" [--variants "A,B"] [--states "Empty,Loaded"]'

const splitNames = (value        , flag        , problems          )           => {
  const names = value.split(',').map((name) => name.trim())
  if (names.some((name) => !name)) problems.push(`${flag} has an empty name`)
  if (new Set(names).size !== names.length) problems.push(`${flag} has a duplicate name`)
  return names
}

export const parseArgs = (argv          )              => {
  const values                                                                     = { variants: 'A', states: 'Default' }
  const problems           = []
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]
    const key = ({ '--out': 'out', '--title': 'title', '--variants': 'variants', '--states': 'states' }                                                           )[flag]
    if (!key) problems.push(`unknown argument ${flag}`)
    else if (argv[i + 1] === undefined) problems.push(`${flag} needs a value`)
    else values[key] = argv[i + 1]
  }
  if (!values.out) problems.push('--out is required')
  else if (!values.out.endsWith('.html')) problems.push('--out must end with .html')
  if (!values.title?.trim()) problems.push('--title is required')
  const variants = splitNames(values.variants, '--variants', problems)
  const states = splitNames(values.states, '--states', problems)
  return { out: values.out, title: values.title?.trim(), variants, states, problems }
}

const escapeHtml = (text        )         => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }                          )[c])
// JSON inside <script> must not close the tag early.
const jsString = (text        )         => JSON.stringify(text).replaceAll('</', '<\\/')

export const buildHtml = ({ title, variants, states }                )         => {
  const stateLines = states.map((name) => `  ${jsString(name)}: {},`).join('\n')
  const variantLines = variants
    .map((name) => `  ${jsString(name)}: {\n    note: '',\n    render(data, root) {\n      root.innerHTML = \`<p>${escapeHtml(name).replace(/[`$\\]/g, '\\$&')}</p>\`\n    },\n  },`)
    .join('\n')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Preview · ${escapeHtml(title)}</title>
<style>
  @font-face { font-family: Pretendard; src: url(data:font/woff2;base64,${previewFont}) format('woff2'); font-weight: 100 900; font-display: swap; }
  html { font-family: Pretendard, sans-serif; }
  button, input, select, textarea { font-family: inherit; }
  /* Comparison shell only. Adapt to the brief; style product content separately. */
  body { margin: 0; }
  .pv-bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 12px 16px; border-bottom: 1px solid #ddd; background: #fff; color: #222; font: 13px/1.5 Pretendard, sans-serif; }
  .pv-badge, .pv-group > span { color: #666; font-size: 12px; }
  .pv-group { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .pv-group > span { margin-right: 4px; }
  .pv-bar button { padding: 4px 12px; border: 0; border-radius: 999px; background: #f2f2f2; color: #333; font: inherit; cursor: pointer; }
  .pv-bar button[aria-pressed="true"] { background: #171717; color: #fff; font-weight: 600; }
  .pv-bar button:hover { background: #e5e5e5; }
  .pv-bar button[aria-pressed="true"]:hover { background: #333; }
  .pv-bar button:focus-visible { outline: 2px solid #171717; outline-offset: 3px; }
  .pv-stage { display: grid; gap: 24px; padding: 16px; }
  .pv-stage.pv-side { grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr)); }
  .pv-frame { min-width: 0; }
  .pv-frame > [data-variant] { width: fit-content; max-width: 100%; }
  .pv-frame > h2 { margin: 0 0 8px; color: #444; font: 600 12px/1.5 Pretendard, sans-serif; }
  .pv-frame > h2 small { font-weight: 400; margin-left: 8px; }
  .pv-error { margin: 12px; padding: 8px; color: #b91c1c; background: #fef2f2; white-space: pre-wrap; }
</style>
<style>
  /* Component roots keep intrinsic width. For whole screens, set the variant root width to 100%.
     Product UI styles: choose typography, colors and layout from the brief. Scope each variant with [data-variant="<name>"]. */
</style>
</head>
<body>
<header class="pv-bar">
  <strong>${escapeHtml(title)}</strong>
  <span class="pv-badge">Sample data</span>
  <div class="pv-group" id="pv-variants"></div>
  <div class="pv-group" id="pv-states"></div>
  <button type="button" id="pv-side" aria-pressed="false">Side by side</button>
</header>
<main class="pv-stage" id="pv-stage"></main>
<script>
// ---- Edit here: fake data per state, and one render function per variant. ----
// render(data, root) draws into root; it may return a cleanup function (timers, listeners).
const STATES = {
${stateLines}
}

const VARIANTS = {
${variantLines}
}
// ---- End of the edit section. The code below runs the switchers. ----

const pv = { variant: Object.keys(VARIANTS)[0], state: Object.keys(STATES)[0], side: Object.keys(VARIANTS).length > 1, cleanups: [] }
const readHash = () => {
  const params = new URLSearchParams(location.hash.slice(1))
  if (Object.hasOwn(VARIANTS, params.get('v') ?? '')) pv.variant = params.get('v')
  if (Object.hasOwn(STATES, params.get('s') ?? '')) pv.state = params.get('s')
  if (params.has('side')) pv.side = params.get('side') === '1'
}
const writeHash = () => history.replaceState(null, '', '#' + new URLSearchParams({ v: pv.variant, s: pv.state, side: pv.side ? '1' : '0' }))

const buttons = (groupId, names, key) => {
  const group = document.getElementById(groupId)
  for (const name of names) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = name
    button.dataset.name = name
    button.addEventListener('click', () => { pv[key] = name; if (key === 'variant') pv.side = false; render() })
    group.append(button)
  }
}

const render = () => {
  writeHash()
  for (const cleanup of pv.cleanups.splice(0)) cleanup()
  for (const button of document.querySelectorAll('#pv-variants button')) button.setAttribute('aria-pressed', String(!pv.side && button.dataset.name === pv.variant))
  for (const button of document.querySelectorAll('#pv-states button')) button.setAttribute('aria-pressed', String(button.dataset.name === pv.state))
  document.getElementById('pv-side').setAttribute('aria-pressed', String(pv.side))
  const stage = document.getElementById('pv-stage')
  stage.classList.toggle('pv-side', pv.side)
  stage.replaceChildren()
  for (const name of pv.side ? Object.keys(VARIANTS) : [pv.variant]) {
    const frame = document.createElement('section')
    frame.className = 'pv-frame'
    const heading = document.createElement('h2')
    heading.textContent = name
    if (VARIANTS[name].note) heading.append(Object.assign(document.createElement('small'), { textContent: VARIANTS[name].note }))
    const root = document.createElement('div')
    root.dataset.variant = name
    frame.append(heading, root)
    stage.append(frame)
    try {
      const cleanup = VARIANTS[name].render(structuredClone(STATES[pv.state]), root)
      if (typeof cleanup === 'function') pv.cleanups.push(cleanup)
    } catch (error) {
      console.error(error)
      root.replaceChildren(Object.assign(document.createElement('pre'), { className: 'pv-error', textContent: \`\${name} failed to render: \${error.stack ?? error}\` }))
    }
  }
}

buttons('pv-variants', Object.keys(VARIANTS), 'variant')
buttons('pv-states', Object.keys(STATES), 'state')
document.getElementById('pv-side').addEventListener('click', () => { pv.side = !pv.side; render() })
document.addEventListener('keydown', (event) => {
  if (event.target.closest('input, textarea, select, [contenteditable]')) return
  const name = Object.keys(VARIANTS)[Number(event.key) - 1]
  if (name) { pv.variant = name; pv.side = false; render() }
})
readHash()
render()
</script>
</body>
</html>
`
}

const nearestExisting = (path        )         => (existsSync(path) ? path : nearestExisting(dirname(path)))
const insideGitWorkTree = (dir        )          => spawnSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' }).stdout.trim() === 'true'

export const main = (argv          )         => {
  const { problems, ...args } = parseArgs(argv)
  const out = args.out && resolve(args.out)
  if (out && existsSync(out)) problems.push(`${out} already exists`)
  else if (out && insideGitWorkTree(nearestExisting(dirname(out)))) problems.push(`${out} is inside a git work tree; write prototypes outside the repository`)
  if (problems.length) {
    console.error([...problems, USAGE].join('\n'))
    return 2
  }
  mkdirSync(dirname(out ), { recursive: true })
  writeFileSync(out , buildHtml(args                  ))
  console.log(out)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2))
