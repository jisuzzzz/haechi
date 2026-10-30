import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { currentVersion, parseDependency, parseRejected, parseShortstat } from '../tools/rejected-staleness.mjs'

const tool = join(import.meta.dirname, '..', 'tools', 'rejected-staleness.mjs')

const run = (args, cwd, env = process.env) => spawnSync(process.execPath, [tool, ...args], { cwd, encoding: 'utf8', env })

test('parses entries; a missing required key is reported on that entry only', () => {
  const entries = parseRejected(
    [
      '# Rejected ideas',
      '',
      '## Virtualize the order list',
      'Base: abc1234',
      'Paths: src/orders, src/list ',
      'Dependencies: react-window@1.8.9, @scope/grid@2.0.0',
      'Revisit when: lists pass 5000 rows',
      'Tried: windowed rendering',
      '',
      '## Cache formatDate results',
      'Base: def5678',
      'Result: no gain',
    ].join('\r\n'),
  )
  assert.equal(entries.length, 2)
  const [first, second] = entries
  assert.equal(first.title, 'Virtualize the order list')
  assert.equal(first.line, 3)
  assert.deepEqual(first.missing, [])
  assert.deepEqual(first.paths, ['src/orders', 'src/list'])
  assert.deepEqual(first.dependencies, [
    { name: 'react-window', recorded: '1.8.9' },
    { name: '@scope/grid', recorded: '2.0.0' },
  ])
  assert.equal(first.revisitWhen, 'lists pass 5000 rows')
  assert.equal(first.fields.tried, 'windowed rendering')
  assert.deepEqual(second.missing, ['paths', 'revisit when'])
})

test('dependency and shortstat helpers', () => {
  assert.deepEqual(parseDependency('lodash'), { name: 'lodash', recorded: null })
  assert.equal(parseShortstat(' 2 files changed, 5 insertions(+), 1 deletion(-)'), 6)
  assert.equal(parseShortstat(' 1 file changed, 3 deletions(-)'), 3)
  assert.equal(parseShortstat(''), 0)
})

test('current versions come from package.json, requirements*.txt and pyproject.toml', () => {
  const dir = mkdtempSync(join(tmpdir(), 'haechi-staleness-pins-'))
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { vite: '^5.1.0' }, devDependencies: { vitest: '~1.2.0' } }))
    writeFileSync(join(dir, 'requirements-dev.txt'), 'pytest==8.0.1\n# comment\nNumPy==1.26.4\n')
    writeFileSync(join(dir, 'pyproject.toml'), '[project]\ndependencies = ["fast_api>=0.110", "httpx==0.27.0"]\n')
    assert.equal(currentVersion(dir, 'vite').version, '5.1.0')
    assert.equal(currentVersion(dir, 'vitest').version, '1.2.0')
    assert.equal(currentVersion(dir, 'numpy').version, '1.26.4')
    assert.equal(currentVersion(dir, 'fast-api').version, '0.110')
    assert.equal(currentVersion(dir, 'httpx').version, '0.27.0')
    assert.deepEqual(currentVersion(dir, 'test'), { version: null, note: null })
    assert.deepEqual(currentVersion(dir, 'missing'), { version: null, note: null })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a BOM before the first heading keeps the first entry', () => {
  const [entry] = parseRejected('\uFEFF## Cache totals\nBase: abc\nPaths: `src/a.js`, src/b.js\nDependencies: dayjs\nRevisit when: —\n')
  assert.equal(entry.title, 'Cache totals')
  assert.deepEqual(entry.paths, ['src/a.js', 'src/b.js'])
  assert.deepEqual(entry.problems, ['dependency without version: dayjs'])
})

test('a package.json with a BOM is read; a malformed one gives unknown with a note instead of a crash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'haechi-staleness-badjson-'))
  try {
    writeFileSync(join(dir, 'package.json'), '\uFEFF' + JSON.stringify({ dependencies: { vite: '5.1.0' } }))
    assert.deepEqual(currentVersion(dir, 'vite'), { version: '5.1.0', note: null })
    writeFileSync(join(dir, 'package.json'), '{ "dependencies": { "vite": "5.1.0", } ')
    writeFileSync(join(dir, 'requirements.txt'), 'httpx==0.27.0\n')
    assert.deepEqual(currentVersion(dir, 'vite'), { version: null, note: 'package.json is not valid JSON' })
    assert.deepEqual(currentVersion(dir, 'httpx'), { version: '0.27.0', note: 'package.json is not valid JSON' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('end to end: changed, unchanged, unknown-base and invalid against a real git repo', () => {
  const repo = mkdtempSync(join(tmpdir(), 'haechi-staleness-repo-'))
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  try {
    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'Test')
    git('config', 'commit.gpgsign', 'false')
    mkdirSync(join(repo, 'src', 'orders'), { recursive: true })
    mkdirSync(join(repo, 'src', 'invoices'), { recursive: true })
    writeFileSync(join(repo, 'src', 'orders', 'list.js'), 'export const list = []\n')
    writeFileSync(join(repo, 'src', 'invoices', 'total.js'), 'export const total = 0\n')
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ dependencies: { 'react-window': '1.8.9', dayjs: '1.11.0' } }))
    git('add', '.')
    git('commit', '-q', '-m', 'base')
    const base = git('rev-parse', 'HEAD')
    git('checkout', '-q', '-b', 'side')
    writeFileSync(join(repo, 'src', 'invoices', 'total.js'), 'export const total = 1\n')
    git('commit', '-q', '-am', 'side work')
    const sideCommit = git('rev-parse', 'HEAD')
    git('checkout', '-q', '-')

    writeFileSync(join(repo, 'src', 'orders', 'list.js'), 'export const list = []\nexport const size = 0\n')
    git('commit', '-q', '-am', 'change orders')
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ dependencies: { 'react-window': '1.8.9', dayjs: '1.11.10' } }))
    git('commit', '-q', '-am', 'bump dayjs')

    const entry = (title, keys) => [`## ${title}`, ...keys, ''].join('\n')
    writeFileSync(
      join(repo, 'rejected.md'),
      '\uFEFF' +
      [
        entry('Orders path changed', [`Base: ${base}`, 'Paths: src/orders', 'Revisit when: list code is rewritten']),
        entry('Invoices untouched', [`Base: ${base}`, 'Paths: src/invoices', 'Dependencies: react-window@1.8.9', 'Revisit when: never']),
        entry('Dependency bumped', [`Base: ${base}`, 'Paths: src/invoices', 'Dependencies: dayjs@1.11.0, left-pad@1.0.0', 'Revisit when: dayjs changes']),
        entry('Base from another repo', ['Base: 0123456789abcdef0123456789abcdef01234567', 'Paths: src/orders', 'Revisit when: —']),
        entry('Half written', [`Base: ${base}`]),
        entry('Base on a side branch', [`Base: ${sideCommit}`, 'Paths: src/invoices', 'Revisit when: —']),
        entry('Path typo', [`Base: ${base}`, 'Paths: src/orders, src/order', 'Revisit when: —']),
        entry('Backticked path', [`Base: ${base}`, 'Paths: `src/invoices`', 'Dependencies: `react-window@1.8.9`', 'Revisit when: —']),
        entry('Dependency without version', [`Base: ${base}`, 'Paths: src/invoices', 'Dependencies: dayjs', 'Revisit when: —']),
        entry('Pathspec git refuses', [`Base: \`${base}\``, 'Paths: :(glob)src/**/*.js, ../elsewhere', 'Revisit when: —']),
      ].join('\n'),
    )

    const result = run(['rejected.md', '--json'], repo)
    assert.equal(result.status, 0, result.stderr)
    const byTitle = Object.fromEntries(JSON.parse(result.stdout).entries.map((item) => [item.title, item]))
    assert.equal(byTitle['Orders path changed'].status, 'changed')
    assert.equal(byTitle['Orders path changed'].commits, 1)
    assert.equal(byTitle['Orders path changed'].changedLines, 1)
    assert.equal(byTitle['Invoices untouched'].status, 'unchanged')
    assert.equal(byTitle['Invoices untouched'].commits, 0)
    assert.deepEqual(byTitle['Invoices untouched'].dependencies, [{ name: 'react-window', recorded: '1.8.9', current: '1.8.9', state: 'same' }])
    assert.equal(byTitle['Dependency bumped'].status, 'changed')
    assert.deepEqual(byTitle['Dependency bumped'].dependencies, [
      { name: 'dayjs', recorded: '1.11.0', current: '1.11.10', state: 'differs' },
      { name: 'left-pad', recorded: '1.0.0', current: 'unknown', state: 'unknown' },
    ])
    assert.equal(byTitle['Base from another repo'].status, 'unknown-base')
    assert.equal(byTitle['Half written'].status, 'invalid')
    assert.deepEqual(byTitle['Half written'].problems, ['missing key: paths', 'missing key: revisit when'])
    assert.equal(byTitle['Base on a side branch'].status, 'unknown-base')
    assert.equal(byTitle['Path typo'].status, 'invalid')
    assert.deepEqual(byTitle['Path typo'].problems, ['path not found: src/order'])
    assert.equal(byTitle['Backticked path'].status, 'unchanged')
    assert.deepEqual(byTitle['Backticked path'].paths, ['src/invoices'])
    assert.equal(byTitle['Backticked path'].dependencies[0].state, 'same')
    assert.equal(byTitle['Dependency without version'].status, 'invalid')
    assert.deepEqual(byTitle['Dependency without version'].problems, ['dependency without version: dayjs'])
    assert.equal(byTitle['Pathspec git refuses'].status, 'invalid')
    assert.deepEqual(byTitle['Pathspec git refuses'].problems, ['path not found: :(glob)src/**/*.js', 'path not found: ../elsewhere'])

    // Where git has translations installed, a localized shortstat would otherwise parse as 0 changed lines
    const localized = run(['rejected.md', '--json'], repo, { ...process.env, LC_ALL: 'de_DE.UTF-8', LANG: 'de_DE.UTF-8', LANGUAGE: 'de' })
    const localizedOrders = JSON.parse(localized.stdout).entries.find((item) => item.title === 'Orders path changed')
    assert.equal(localizedOrders.changedLines, 1)

    const human = run(['rejected.md', '--repo', repo], tmpdir())
    assert.equal(human.status, 0, human.stderr)
    assert.match(human.stdout, /## Orders path changed[\s\S]*status: changed[\s\S]*1 commit\(s\), 1 line\(s\) changed/)
    assert.match(human.stdout, /dayjs: recorded 1\.11\.0, now 1\.11\.10 \(differs\)/)
    assert.match(human.stdout, /## Path typo[\s\S]*?status: invalid\n {2}path not found: src\/order/)

    assert.equal(git('status', '--porcelain'), '?? rejected.md')
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('exit 2 on bad arguments, a missing file or a directory outside git', () => {
  assert.equal(run([], tmpdir()).status, 2)
  assert.equal(run(['a.md', '--bogus'], tmpdir()).status, 2)
  const repo = mkdtempSync(join(tmpdir(), 'haechi-staleness-args-'))
  try {
    execFileSync('git', ['init', '-q'], { cwd: repo })
    assert.equal(run(['missing.md'], repo).status, 2)
    const outside = mkdtempSync(join(tmpdir(), 'haechi-staleness-nogit-'))
    writeFileSync(join(outside, 'rejected.md'), '## x\n')
    // A temp dir may sit inside some git work tree on a dev machine; only assert when it does not
    const insideGit = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: outside }).status === 0
    if (!insideGit) assert.equal(run(['rejected.md'], outside).status, 2)
    rmSync(outside, { recursive: true, force: true })
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})
