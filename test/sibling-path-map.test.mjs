import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { changedFiles, extractIdentifiers, grepWords, inRanges, isGuardLine, parseDiff, siblingSites } from '../tools/sibling-path-map.mjs'

test('guard, comparison and normalization lines are recognised; plain statements, strings and comments are not', () => {
  for (const line of [
    'if (order.status) {',
    'const label = done ? doneText : pending',
    'return user.role === ADMIN',
    'if (count >= limit) return',
    'const tags = input.tags.filter(Boolean)',
    'const email = raw.email.trim().toLowerCase()',
    'const seen = new Set(ids)',
    'const city = address?.city ?? fallback',
  ]) {
    assert.equal(isGuardLine(line), true, line)
  }
  for (const line of ['const total = sum(items)', "log('if (x === 1)')", '// if (a === b)', ' * x === y', 'items.push(next)', 'const fn = (a) => a']) {
    assert.equal(isGuardLine(line), false, line)
  }
  assert.equal(isGuardLine('if user.email.strip().lower() in blocked:', 'python'), true)
  assert.equal(isGuardLine('x = total(items)', 'python'), false)
  assert.equal(isGuardLine('# if a == b', 'python'), false)
})

test('identifiers: properties, called functions and compared variables, minus keywords and short names', () => {
  assert.deepEqual(extractIdentifiers('if (account.status === RETIRED && isTrial(account)) {'), ['status', 'isTrial', 'RETIRED'])
  assert.deepEqual(extractIdentifiers('const email = raw.email.trim().toLowerCase()'), ['email'])
  assert.deepEqual(extractIdentifiers("if (allowedRoles.includes(member.role)) return 'x.y'"), ['role', 'member'])
  assert.deepEqual(extractIdentifiers('if (ab.cd === ef) return'), [])
  assert.deepEqual(extractIdentifiers('if code not in allowed_codes:', 'python'), ['code', 'allowed_codes'])
})

test('diff parsing keeps new-side ranges and added lines, deletions mark the gap', () => {
  const diff = [
    'diff --git a/src/a.js b/src/a.js',
    '--- a/src/a.js',
    '+++ b/src/a.js',
    '@@ -3 +3 @@',
    '-old',
    '+new',
    '@@ -10,2 +9,0 @@',
    '--- removed line that looks like a header',
    '-gone',
    'diff --git a/b c.js b/b c.js',
    '--- a/b c.js\t',
    '+++ b/b c.js\t',
    '@@ -0,0 +1,2 @@',
    '+one',
    '++two',
  ].join('\n')
  const files = parseDiff(diff)
  assert.deepEqual(files.get('src/a.js'), { ranges: [[3, 3], [9, 10]], added: [{ line: 3, text: 'new' }] })
  assert.deepEqual(files.get('b c.js').added, [{ line: 1, text: 'one' }, { line: 2, text: '+two' }])
  assert.equal(inRanges([[3, 3], [9, 10]], 10), true)
  assert.equal(inRanges([[3, 3], [9, 10]], 4), false)
})

test('git-backed: a fix in one function lists the other function using the same field', () => {
  const root = mkdtempSync(join(tmpdir(), 'haechi-sibling-'))
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  git('init', '-q', '-b', 'trunk')
  git('config', 'user.email', 'dev@example.com')
  git('config', 'user.name', 'Dev')
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'users.js'), "export const isAdmin = (user) => user.role === 'admin'\n")
  writeFileSync(join(root, 'src', 'billing.js'), "export const canRefund = (account) => {\n  return account.role === 'admin'\n}\n")
  writeFileSync(join(root, 'README.md'), 'Roles are compared as text.\n')
  git('add', '.')
  git('commit', '-q', '-m', 'init')
  writeFileSync(join(root, 'src', 'users.js'), "export const isAdmin = (user) => user.role.toLowerCase() === 'admin'\n")

  const files = changedFiles(root, 'HEAD', [])
  const sites = siblingSites(files, (names) => grepWords(root, names))
  assert.deepEqual(sites, [
    {
      identifier: 'role',
      trigger: { path: 'src/users.js', line: 1, text: "export const isAdmin = (user) => user.role.toLowerCase() === 'admin'" },
      hits: [{ path: 'src/billing.js', line: 2, text: "return account.role === 'admin'" }],
      more: 0,
    },
  ])
})

test('hits are capped per identifier with a "more" count', () => {
  const files = new Map([['src/a.js', { ranges: [[1, 1]], added: [{ line: 1, text: 'if (cfg.mode === next) {' }] }]])
  const many = Array.from({ length: 20 }, (_, index) => ({ path: 'src/b.js', line: index + 1, text: 'cfg.mode' }))
  const [site] = siblingSites(files, (names) => new Map(names.map((name) => [name, name === 'mode' ? [{ path: 'src/a.js', line: 1, text: 'x' }, ...many] : []])))
  assert.equal(site.identifier, 'mode')
  assert.equal(site.hits.length, 15)
  assert.equal(site.more, 5)
})
