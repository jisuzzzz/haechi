import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { linkTo, parseArgs } from '../core/tools/screen-report.mjs'

const tool = join(import.meta.dirname, '..', 'core', 'tools', 'screen-report.mjs')
// 1x1 transparent PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

const run = (args) => spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' })

const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'screen-report-'))
  mkdirSync(join(dir, 'results', 'shots'), { recursive: true })
  for (const name of ['figma.png', 'before.png', 'after.png', 'diff.png']) writeFileSync(join(dir, 'results', 'shots', name), PNG)
  return dir
}

const writeJson = (dir, name, value) => {
  const file = join(dir, 'results', name)
  writeFileSync(file, JSON.stringify(value))
  return file
}

const design = {
  kind: 'design',
  task: 'Orders list redesign',
  verdict: 'FAIL',
  states: [
    {
      name: 'Orders list · empty',
      verdict: 'FAIL',
      images: [
        { label: 'Figma', path: 'shots/figma.png' },
        { label: 'AFTER', path: 'shots/after.png' },
        { label: 'Diff', path: 'shots/diff.png' },
      ],
      items: [
        { class: 'MATCH', text: 'header height 48px' },
        { class: 'NOISE', text: 'clock in the top bar' },
        { class: 'MISMATCH', text: 'button radius expected 8, got 4' },
      ],
    },
  ],
  consoleErrors: ['TypeError: x is undefined'],
  noise: 'low',
  openQuestions: ['Should the empty state show an icon?'],
}

const parity = {
  kind: 'parity',
  task: 'Orders list redesign',
  verdict: 'PASS',
  states: [
    {
      name: 'Orders list · loaded',
      verdict: 'PASS',
      images: [
        { label: 'BEFORE', path: 'shots/before.png' },
        { label: 'AFTER', path: 'shots/after.png' },
      ],
      items: [{ class: 'EXPECTED', text: 'new filter chip row' }],
    },
  ],
}

test('design and parity results render as one report with two sections in order', () => {
  const dir = setup()
  const out = join(dir, 'results', 'report.html')
  const result = run(['--out', out, writeJson(dir, 'design.json', design), writeJson(dir, 'parity.json', parity)])
  assert.equal(result.status, 0, result.stderr)
  const html = readFileSync(out, 'utf8')
  assert.equal(html.match(/<section>/g).length, 2)
  assert.ok(html.indexOf('Design check') < html.indexOf('Parity check'))
  assert.match(html, /Overall <span class="badge v-FAIL">FAIL<\/span>/)
  assert.match(html, /<figcaption>Figma<\/figcaption><img src="shots\/figma.png"/)
  const mismatch = html.indexOf('<h4>MISMATCH (1)')
  const match = html.indexOf('<h4>MATCH (1)')
  const noise = html.indexOf('<details class="items c-NOISE"><summary>NOISE (1)')
  assert.ok(mismatch > 0 && mismatch < match && match < noise, 'problems first, NOISE last')
  assert.match(html, /class="items c-MISMATCH problem"/)
  assert.match(html, /<h4>Console errors<\/h4><ul><li>TypeError: x is undefined<\/li>/)
  assert.match(html, /<h4>Noise level<\/h4><p>low<\/p>/)
  assert.match(html, /<h4>Open questions<\/h4>/)
  assert.doesNotMatch(html, /https?:\/\//)
  assert.match(html, /prefers-color-scheme:dark/)
})

test('BLOCKED wins over PASS; variants alone have no overall verdict', () => {
  const dir = setup()
  const out = join(dir, 'report.html')
  run(['--out', out, writeJson(dir, 'p.json', parity), writeJson(dir, 'b.json', { ...parity, verdict: 'BLOCKED' })])
  assert.match(readFileSync(out, 'utf8'), /Overall <span class="badge v-BLOCKED">/)
  const variants = { kind: 'variants', task: 'Orders layout', states: [{ name: 'list', images: [{ label: 'Variant A', path: 'shots/after.png' }, { label: 'Variant B', path: 'shots/before.png' }] }] }
  const result = run(['--out', out, writeJson(dir, 'v.json', variants)])
  assert.equal(result.status, 0, result.stderr)
  const html = readFileSync(out, 'utf8')
  assert.match(html, /No overall verdict/)
  assert.match(html, /<figcaption>Variant B<\/figcaption>/)
})

test('item text and task are escaped', () => {
  const dir = setup()
  const out = join(dir, 'report.html')
  const hostile = structuredClone(design)
  hostile.task = '<b>bold</b>'
  hostile.states[0].items = [{ class: 'UNEXPECTED', text: '<script>alert("x")</script>' }]
  run(['--out', out, writeJson(dir, 'd.json', hostile)])
  const html = readFileSync(out, 'utf8')
  assert.equal(html.match(/<script>/g).length, 1, 'only the report script itself')
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/)
  assert.match(html, /&lt;b&gt;bold&lt;\/b&gt;/)
})

test('relative image paths are rewritten against the output folder', () => {
  const dir = setup()
  const out = join(dir, 'reports', 'nested', 'report.html')
  const result = run(['--out', out, writeJson(dir, 'd.json', design)])
  assert.equal(result.status, 0, result.stderr)
  assert.match(readFileSync(out, 'utf8'), /<img src="\.\.\/\.\.\/results\/shots\/after.png"/)
})

test('--embed writes images as data URIs', () => {
  const dir = setup()
  const out = join(dir, 'report.html')
  run(['--out', out, '--embed', writeJson(dir, 'd.json', design)])
  const html = readFileSync(out, 'utf8')
  assert.match(html, new RegExp(`<img src="data:image/png;base64,${PNG.toString('base64').replace(/[+/]/g, '\\$&')}"`))
  assert.doesNotMatch(html, /src="shots\//)
})

test('a missing image shows a placeholder instead of failing', () => {
  const dir = setup()
  const out = join(dir, 'report.html')
  const broken = structuredClone(design)
  broken.states[0].images.push({ label: 'Extra', path: 'shots/gone.png' })
  const result = run(['--out', out, '--embed', writeJson(dir, 'd.json', broken)])
  assert.equal(result.status, 0, result.stderr)
  assert.match(readFileSync(out, 'utf8'), /<div class="missing">missing: shots\/gone.png<\/div>/)
})

test('invalid input lists every problem with its file name and exits 2', () => {
  const dir = setup()
  const bad = writeJson(dir, 'bad.json', {
    kind: 'look',
    task: '',
    verdict: 'OK',
    states: [{ name: 'a', verdict: 'PASS', images: [{ label: 'AFTER' }], items: [{ class: 'WRONG', text: 'x' }] }],
    consoleErrors: 'none',
  })
  const notJson = join(dir, 'results', 'broken.json')
  writeFileSync(notJson, '{')
  const out = join(dir, 'report.html')
  const result = run(['--out', out, bad, notJson, join(dir, 'absent.json')])
  assert.equal(result.status, 2)
  for (const problem of ['kind must be one of', 'task must be', 'verdict must be one of', 'states[0].images[0].path', 'states[0].items[0].class', 'consoleErrors must be']) {
    assert.match(result.stderr, new RegExp(`bad\\.json: ${problem.replace(/[[\]().]/g, '\\$&')}`))
  }
  assert.match(result.stderr, /broken\.json: not valid JSON/)
  assert.match(result.stderr, /absent\.json: file not found/)
  assert.equal(run([writeJson(dir, 'ok.json', design)]).status, 2, '--out is required')
})

test('an option right after --out is reported, not taken as the output path', () => {
  const dir = setup()
  const result = run(['--out', '--embed', writeJson(dir, 'd.json', design)])
  assert.equal(result.status, 2)
  assert.match(result.stderr, /--out needs a file path/)
  assert.equal(existsSync(join(process.cwd(), '--embed')), false)
  assert.deepEqual(parseArgs(['--out', '--embed', 'r.json']).options, { out: null, embed: true, inputs: ['r.json'] })
})

test('an image path that is a folder becomes a placeholder, with and without --embed', () => {
  const dir = setup()
  const out = join(dir, 'report.html')
  const folder = structuredClone(design)
  folder.states[0].images = [{ label: 'AFTER', path: 'shots' }]
  for (const args of [['--embed'], []]) {
    const result = run(['--out', out, ...args, writeJson(dir, 'd.json', folder)])
    assert.equal(result.status, 0, result.stderr)
    assert.match(readFileSync(out, 'utf8'), /<div class="missing">missing: shots<\/div>/)
  }
})

test('a result file with a UTF-8 BOM is read', () => {
  const dir = setup()
  const file = join(dir, 'results', 'bom.json')
  writeFileSync(file, `\uFEFF${JSON.stringify(parity)}`)
  const out = join(dir, 'report.html')
  const result = run(['--out', out, file])
  assert.equal(result.status, 0, result.stderr)
  assert.match(readFileSync(out, 'utf8'), /Parity check/)
})

test('an image on another Windows drive is linked with a file: URL', { skip: process.platform !== 'win32' }, () => {
  assert.equal(linkTo('D:\\shots\\after page.png', 'C:\\reports'), 'file:///D:/shots/after%20page.png')
  assert.equal(linkTo('C:\\shots\\after.png', 'C:\\reports'), '../shots/after.png')
})
