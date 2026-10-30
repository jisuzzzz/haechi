import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { classifyHit, findTouchedSymbols, impactMap } from '../tools/impact-map.mjs'
import { changedFiles, grepWords } from '../tools/sibling-path-map.mjs'

const names = (symbols) => symbols.map(({ name, kind, line }) => `${name}:${kind}:${line}`)

test('JS: exported functions, declarations and export lists on changed lines are found', () => {
  const text = [
    'export async function load(id) {', // 1
    '  return id',
    '}',
    'export default function render(view) {}', // 4
    'export const LIMIT = 10', // 5
    'export class Store {}', // 6
    'export interface Options { a: number }', // 7
    'export type Mode = "a" | "b"', // 8
    'export enum Color { Red }', // 9
    'const local = 1', // 10
    'export { local as shared, other }', // 11
    'export function* walk() {}', // 12
  ].join('\n')
  assert.deepEqual(names(findTouchedSymbols(text, [[1, 12]])), [
    'load:function:1',
    'render:function:4',
    'LIMIT:const:5',
    'Store:class:6',
    'Options:interface:7',
    'Mode:type:8',
    'Color:enum:9',
    'shared:export:11',
    'other:export:11',
    'walk:function:12',
  ])
  assert.deepEqual(findTouchedSymbols(text, [[2, 3], [10, 10]]), [])
})

test('JS: a changed line inside a multi-line signature counts, a body line does not', () => {
  const text = [
    'export function formatPrice(',
    '  amount,',
    '  currency = pick(),',
    ') {',
    '  return amount',
    '}',
    'export const toLabel = async (',
    '  value,',
    ') => value',
  ].join('\n')
  assert.deepEqual(names(findTouchedSymbols(text, [[3, 3]])), ['formatPrice:function:1'])
  assert.deepEqual(findTouchedSymbols(text, [[5, 5]]), [])
  assert.deepEqual(names(findTouchedSymbols(text, [[8, 8]])), ['toLabel:function:7'])
})

test('JS: only the changed names of a multi-line export list are touched', () => {
  const text = ['export {', '  alpha,', '  beta as gamma,', '  type Delta,', '}'].join('\n')
  assert.deepEqual(names(findTouchedSymbols(text, [[3, 4]])), ['gamma:export:1', 'Delta:export:1'])
})

test('Python: top-level def and class on changed lines, methods ignored', () => {
  const text = ['def load(path,', '         strict=False):', '    pass', 'class Store:', '    def save(self):', '        pass', 'async def fetch(url):', '    pass'].join('\n')
  assert.deepEqual(names(findTouchedSymbols(text, [[2, 2], [4, 5], [7, 7]], 'python')), ['load:function:1', 'Store:class:4', 'fetch:function:7'])
})

test('hits are classified as import or use', () => {
  assert.equal(classifyHit("import { load } from './load'"), 'import')
  assert.equal(classifyHit("const { load } = require('./load')"), 'import')
  assert.equal(classifyHit("export { load } from './load'"), 'import')
  assert.equal(classifyHit('from app.store import load'), 'import')
  assert.equal(classifyHit('import app.store'), 'import')
  assert.equal(classifyHit('const data = await load(id)'), 'use')
})

test('git-backed: renaming a parameter of an exported function lists both importing files', () => {
  const root = mkdtempSync(join(tmpdir(), 'haechi-impact-'))
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'dev@example.com')
  git('config', 'user.name', 'Dev')
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'price.js'), 'export function formatPrice(amount) {\n  return `$${amount}`\n}\n')
  writeFileSync(join(root, 'src', 'cart.js'), "import { formatPrice } from './price.js'\n\nexport const cartTotal = (items) => formatPrice(items.length)\n")
  writeFileSync(join(root, 'src', 'invoice.js'), "import { formatPrice } from './price.js'\n")
  writeFileSync(join(root, 'notes.md'), 'formatPrice is documented here.\n')
  writeFileSync(join(root, 'tool.py'), 'formatPrice = None\n')
  git('add', '.')
  git('commit', '-q', '-m', 'init')
  writeFileSync(join(root, 'src', 'price.js'), 'export function formatPrice(cents) {\n  return `$${cents}`\n}\n')

  const files = changedFiles(root, 'HEAD', [])
  const result = impactMap(files, (path) => readFileSync(join(root, path), 'utf8'), (list) => grepWords(root, list))
  assert.deepEqual(result, [
    {
      name: 'formatPrice',
      file: 'src/price.js',
      kind: 'function',
      consumers: [
        { path: 'src/cart.js', line: 1, text: "import { formatPrice } from './price.js'", type: 'import' },
        { path: 'src/cart.js', line: 3, text: 'export const cartTotal = (items) => formatPrice(items.length)', type: 'use' },
        { path: 'src/invoice.js', line: 1, text: "import { formatPrice } from './price.js'", type: 'import' },
      ],
    },
  ])
})
