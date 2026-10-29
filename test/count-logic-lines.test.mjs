import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { countChanges, countLogicLines, excludePathspecs, stripImports } from '../core/tools/count-logic-lines.mjs'

test('JS imports, multi-line imports and export-from statements are stripped', () => {
  const text = [
    "import a from 'a'",
    'import {',
    '  b,',
    '  c,',
    "} from './c'",
    "import './side-effect.css';",
    "export * from './all'",
    "export { d } from './d'",
    'const x = 1',
  ].join('\n')
  assert.deepEqual(stripImports(text), ['const x = 1'])
})

test('Python imports, including parenthesised ones, are stripped', () => {
  const text = ['import os', 'from pathlib import Path', 'from x.y import (', '    a,', '    b,', ')', '', 'def f():', '    return 1'].join('\r\n')
  assert.deepEqual(stripImports(text), ['def f():', '    return 1'])
})

test('import-only, blank-line and whitespace-only changes count zero', () => {
  const before = "import a from 'a'\nconst x = f(1)\n"
  assert.equal(countLogicLines(before, "import a from 'a'\nimport b from 'b'\nconst x = f(1)\n"), 0)
  assert.equal(countLogicLines(before, "import a from 'a'\n\n\nconst x  =  f( 1 )\n"), 0)
  assert.equal(countLogicLines('a\r\nb\r\n', 'a\nb\n'), 0)
})

test('logic changes count added plus deleted lines', () => {
  assert.equal(countLogicLines('a\nb\nc\n', 'a\nb\nc\nd\ne\n'), 2)
  assert.equal(countLogicLines('a\nb\nc\n', 'a\nB\nc\n'), 2)
  assert.equal(countLogicLines('a\nb\nc\n', ''), 3)
  assert.equal(countLogicLines('', 'x\ny\n'), 2)
  assert.equal(countLogicLines('a\nb\nc\nd\n', 'a\nc\nb\nd\n'), 2)
})

test('exclusions cover fixed globs, settings folders and test names for "next to source"', () => {
  assert.deepEqual(excludePathspecs(undefined), [':(exclude,glob)**/*.json', ':(exclude,glob)**/*.md', ':(exclude,glob)**/*.lock'])
  const specs = excludePathspecs({ testDirs: ['next to source', './spec/'], generated: ['src/gen'] })
  assert.ok(specs.includes(':(exclude,glob)**/*.test.*'))
  assert.ok(specs.includes(':(exclude,glob)**/test_*.py'))
  assert.ok(specs.includes(':(exclude)spec'))
  assert.ok(specs.includes(':(exclude)src/gen'))
  assert.ok(!specs.some((spec) => spec.includes('next to source')))
})

const gitRepo = () => {
  const root = mkdtempSync(join(tmpdir(), 'haechi-logic-'))
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'dev@example.com')
  git('config', 'user.name', 'Dev')
  git('config', 'core.autocrlf', 'false')
  return { root, git }
}

test('git-backed: rename and import-only changes count 0, a 2-line addition counts 2, excluded paths are skipped', () => {
  const { root, git } = gitRepo()
  mkdirSync(join(root, 'src'))
  mkdirSync(join(root, 'gen'))
  writeFileSync(join(root, 'src', 'moved.js'), 'export const moved = () => 1\n')
  writeFileSync(join(root, 'src', 'imports.js'), "import a from './a'\nexport const run = () => a()\n")
  writeFileSync(join(root, 'src', 'logic.js'), 'export const total = (items) => {\n  let sum = 0\n  return sum\n}\n')
  writeFileSync(join(root, 'gen', 'api.js'), 'export const api = 1\n')
  writeFileSync(join(root, '.haechi.json'), JSON.stringify({ testDirs: ['next to source'], generated: ['gen'] }))
  git('add', '.')
  git('commit', '-q', '-m', 'init')

  git('mv', 'src/moved.js', 'src/renamed.js')
  writeFileSync(join(root, 'src', 'imports.js'), "import a from './a'\nimport b from './b'\nexport const run = () => a()\n")
  writeFileSync(
    join(root, 'src', 'logic.js'),
    'export const total = (items) => {\n  let sum = 0\n  for (const item of items) sum += item.price\n  if (sum < 0) sum = 0\n  return sum\n}\n',
  )
  writeFileSync(join(root, 'gen', 'api.js'), 'export const api = 2\nexport const more = 3\n')
  writeFileSync(join(root, 'src', 'logic.test.js'), 'test(1)\ntest(2)\n')
  writeFileSync(join(root, 'notes.md'), '# notes\n')

  const result = countChanges({ root, paths: ['.'] })
  const byPath = Object.fromEntries(result.files.map((file) => [file.path, file.lines]))
  assert.deepEqual(byPath, { 'src/imports.js': 0, 'src/logic.js': 2, 'src/renamed.js': 0 })
  assert.equal(result.total, 2)
})
