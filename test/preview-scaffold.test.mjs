import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { buildHtml, parseArgs } from '../tools/preview-scaffold.mjs'

const tool = join(import.meta.dirname, '..', 'tools', 'preview-scaffold.mjs')
const run = (args) => spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' })
const scriptOf = (html) => html.match(/<script>([\s\S]*)<\/script>/)[1]

test('writes one HTML file with every variant and state in the edit section', () => {
  const dir = mkdtempSync(join(tmpdir(), 'preview-scaffold-'))
  const out = join(dir, 'nested', 'orders.html')
  const result = run(['--out', out, '--title', 'Orders list', '--variants', 'Cards, Table', '--states', 'Empty,Loaded'])
  assert.equal(result.status, 0, result.stderr)
  const html = readFileSync(out, 'utf8')
  assert.match(html, /<title>Preview · Orders list<\/title>/)
  for (const name of ['"Cards": {', '"Table": {', '"Empty": {},', '"Loaded": {},']) assert.ok(html.includes(name), name)
})

test('names that look like markup or code stay inert in the page and the script', () => {
  const html = buildHtml({ title: '<b>x</b>', variants: ['a`${1}</script>', 'b"\\'], states: ['s</script>'] })
  assert.ok(html.includes('<title>Preview · &lt;b&gt;x&lt;/b&gt;</title>'))
  assert.equal(html.match(/<\/script>/g).length, 1)
  assert.doesNotThrow(() => new Function(scriptOf(html)))
})

test('refuses to overwrite an existing file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'preview-scaffold-'))
  const out = join(dir, 'keep.html')
  writeFileSync(out, 'mine')
  const result = run(['--out', out, '--title', 'T'])
  assert.equal(result.status, 2)
  assert.match(result.stderr, /already exists/)
  assert.equal(readFileSync(out, 'utf8'), 'mine')
})

test('refuses a path inside a git work tree, including a folder that does not exist yet', () => {
  const repo = mkdtempSync(join(tmpdir(), 'preview-scaffold-repo-'))
  spawnSync('git', ['init', '-q', repo])
  const out = join(repo, 'src', 'new', 'p.html')
  const result = run(['--out', out, '--title', 'T'])
  assert.equal(result.status, 2)
  assert.match(result.stderr, /inside a git work tree/)
  assert.equal(existsSync(join(repo, 'src')), false)
})

test('lists every argument problem at once', () => {
  const { problems } = parseArgs(['--out', 'p.txt', '--variants', 'A,,A', '--bogus', 'x'])
  assert.deepEqual(problems, ['unknown argument --bogus', '--out must end with .html', '--title is required', '--variants has an empty name', '--variants has a duplicate name'])
})

test('defaults to one variant and one state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'preview-scaffold-'))
  mkdirSync(dir, { recursive: true })
  const out = join(dir, 'one.html')
  assert.equal(run(['--out', out, '--title', 'T']).status, 0)
  const html = readFileSync(out, 'utf8')
  assert.ok(html.includes('"A": {') && html.includes('"Default": {},'))
})
