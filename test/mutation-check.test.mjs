import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { addedLines, applyMutant, generateMutants, parseArgs, parseLineRanges, recoverInterrupted, saveBackup } from '../tools/mutation-check.mjs'

const tool = join(import.meta.dirname, '..', 'tools', 'mutation-check.mjs')
const summarize = (mutants) => mutants.map(({ line, operator, before, after }) => `${line} ${operator} ${before}→${after}`)

test('JS operators: comparison, logical, boolean, negation, integer', () => {
  const text = 'if (a === b && !ready) return count >= 10 || true\n'
  assert.deepEqual(summarize(generateMutants(text, null, 'js')), [
    '1 comparison ===→!==',
    '1 logical &&→||',
    '1 negation !→',
    '1 comparison >=→>',
    '1 integer 10→11',
    '1 logical ||→&&',
    '1 boolean true→false',
  ])
  assert.deepEqual(summarize(generateMutants('x != y; x == y; x !== y; a < b; a <= b; a > b\n', null, 'js')), [
    '1 comparison !=→==',
    '1 comparison ==→!=',
    '1 comparison !==→===',
    '1 comparison <→<=',
    '1 comparison <=→<',
    '1 comparison >→>=',
  ])
})

test('JS: generics, arrows, decimals, identifiers with digits and assignments are left alone', () => {
  const text = 'const list: Array<string> = []\nconst f = (x) => x\nconst r = 1.5 + h1 + 0x10\nok ||= other\nv!.go()\n'
  assert.deepEqual(generateMutants(text, null, 'js'), [])
})

test('strings, template literals, comments and regex literals are skipped', () => {
  const text = [
    "const s = 'a === b && true 1'",
    'const t = `${a === 1} || 2`',
    '// if (x === 1) return true',
    '/* a && b',
    '   c === 3 */',
    'const re = /a>b|c==1/g',
    'const d = total / 2',
  ].join('\n')
  assert.deepEqual(summarize(generateMutants(text, null, 'js')), ['7 integer 2→3'])
})

test('drop-call removes a whole call statement but not a continued expression', () => {
  const text = ['save(item)', 'await store.flush();', 'const x =', '  load(item)', 'chain()', '  .then(done)', 'if (ok) run()'].join('\n')
  assert.deepEqual(summarize(generateMutants(text, null, 'js')), ['1 drop-call save(item)→// save(item)', '2 drop-call await store.flush();→// await store.flush();'])
})

test('Python operators, strings, comments and drop-call', () => {
  const text = ['if a == 1 and not b:  # x == 2', '    s = "a or b" + """c == d', '    True"""', '    run(x)', 'y = z if n < 3 else False', ''].join('\n')
  assert.deepEqual(summarize(generateMutants(text, null, 'python')), [
    '1 comparison ==→!=',
    '1 integer 1→2',
    '1 logical and→or',
    '1 negation not →',
    '4 drop-call run(x)→pass',
    '5 comparison <→<=',
    '5 integer 3→4',
    '5 boolean False→True',
  ])
})

test('only the requested lines are mutated and the limit is spread over lines', () => {
  const text = 'a && b && c && d\nx === 1\ny === 2\n'
  assert.deepEqual(summarize(generateMutants(text, [2], 'js')), ['2 comparison ===→!==', '2 integer 1→2'])
  assert.deepEqual(summarize(generateMutants(text, null, 'js', { limit: 3 })), ['1 logical &&→||', '2 comparison ===→!==', '3 comparison ===→!=='])
  assert.equal(generateMutants(text, null, 'js', { limit: 5 }).length, 5)
})

test('applyMutant changes one site and keeps CRLF line endings', () => {
  const text = 'a\r\nif (x === 1) go()\r\n'
  const [first] = generateMutants(text, [2], 'js')
  assert.equal(applyMutant(text, first), 'a\r\nif (x !== 1) go()\r\n')
})

test('line ranges, diff parsing and argument checks', () => {
  assert.deepEqual(parseLineRanges('3-5,9'), [3, 4, 5, 9])
  assert.throws(() => parseLineRanges('a-b'))
  const diff = ['diff --git a/x b/x', '--- a/x', '+++ b/x', '@@ -2,0 +3,2 @@', '+one', '+two', '@@ -10 +12 @@', '-old', '+new'].join('\n')
  assert.deepEqual(addedLines(diff), [3, 4, 12])
  assert.throws(() => parseArgs(['--file', tool, '--test-cmd', 'node --test', '--tests', 'a.mjs']), /\{tests\}/)
  assert.throws(() => parseArgs(['--file', tool, '--test-cmd', 'node --test {tests}']), /--tests/)
  const options = parseArgs(['--file', tool, '--test-cmd', 'node --test {tests}', '--tests', 'a.mjs', 'b.mjs', '--lines', '1-2', '--json'])
  assert.deepEqual([options.tests, options.lines, options.json, options.limit], [['a.mjs', 'b.mjs'], [1, 2], true, 20])
})

const runTool = (cwd, args) => {
  // node --test sets NODE_TEST_CONTEXT for its children; the inner test run must not inherit it
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, [tool, ...args], { cwd, env, encoding: 'utf8' })
}

test('end to end: one mutant killed, others survive, source restored byte for byte', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'haechi-mutation-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const source = 'export const isPositive = (n) => n > 0\r\nexport const double = (n) => n * 2\r\n'
  writeFileSync(join(dir, 'math.mjs'), source)
  writeFileSync(
    join(dir, 'math.test.mjs'),
    [
      "import assert from 'node:assert/strict'",
      "import { test } from 'node:test'",
      "import { double, isPositive } from './math.mjs'",
      "test('math', () => {",
      '  assert.equal(isPositive(5), true)',
      '  assert.equal(isPositive(-5), false)',
      '  assert.equal(double(2), 4)',
      '})',
      '',
    ].join('\n'),
  )
  const result = runTool(dir, ['--file', 'math.mjs', '--test-cmd', 'node --test {tests}', '--tests', 'math.test.mjs', '--lines', '1-2', '--json'])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.baseline, 'pass')
  const statuses = Object.fromEntries(report.mutants.map((mutant) => [`${mutant.line} ${mutant.before}→${mutant.after}`, mutant.status]))
  assert.deepEqual(statuses, { '1 >→>=': 'survived', '1 0→1': 'survived', '2 2→3': 'killed' })
  assert.deepEqual(report.summary, { killed: 1, survived: 2, timeout: 0 })
  const killed = report.mutants.find((mutant) => mutant.status === 'killed')
  assert.equal(killed.exitCode, 1)
  assert.equal(killed.signal, null)
  assert.equal(killed.spawnError, null)
  assert.match(killed.output, /ERR_ASSERTION/)
  assert.equal(readFileSync(join(dir, 'math.mjs'), 'utf8'), source)
})

test('end to end: an import failure keeps its diagnostic without proving an assertion caught the mutant', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'haechi-mutation-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const source = 'export const enabled = false\n'
  writeFileSync(join(dir, 'flag.mjs'), source)
  writeFileSync(join(dir, 'flag.test.mjs'), "import { enabled } from './flag.mjs'\nif (enabled) await import('./missing.mjs')\n")
  const args = ['--file', 'flag.mjs', '--test-cmd', 'node --test {tests}', '--tests', 'flag.test.mjs', '--lines', '1']
  const result = runTool(dir, [...args, '--json'])
  assert.equal(result.status, 0, result.stderr)
  const [mutant] = JSON.parse(result.stdout).mutants
  assert.equal(mutant.status, 'killed')
  assert.equal(mutant.exitCode, 1)
  assert.equal(mutant.signal, null)
  assert.equal(mutant.spawnError, null)
  assert.match(mutant.output, /ERR_MODULE_NOT_FOUND/)
  assert.equal(readFileSync(join(dir, 'flag.mjs'), 'utf8'), source)
  const human = runTool(dir, args)
  assert.equal(human.status, 0, human.stderr)
  assert.match(human.stdout, /ERR_MODULE_NOT_FOUND/)
  assert.match(human.stdout, /exit code: 1/)
  assert.match(human.stdout, /killed = the command failed/)
  assert.match(human.stdout, /does not prove an assertion caught the change/)
})

test('end to end: a failing baseline is refused with exit 2 and nothing is mutated', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'haechi-mutation-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const source = 'export const one = () => 1\n'
  writeFileSync(join(dir, 'one.mjs'), source)
  writeFileSync(join(dir, 'one.test.mjs'), "import { test } from 'node:test'\ntest('broken', () => { throw new Error('no') })\n")
  const result = runTool(dir, ['--file', 'one.mjs', '--test-cmd', 'node --test {tests}', '--tests', 'one.test.mjs', '--lines', '1', '--json'])
  assert.equal(result.status, 2)
  assert.equal(JSON.parse(result.stdout).baseline, 'fail')
  assert.equal(readFileSync(join(dir, 'one.mjs'), 'utf8'), source)
})

test('a source left mutated by a killed run is restored by the next run, a live run is left alone', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'haechi-mutation-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const backups = join(dir, 'backups')
  const killed = join(dir, 'killed.mjs')
  const live = join(dir, 'live.mjs')
  writeFileSync(killed, 'export const a = 1\n')
  writeFileSync(live, 'export const b = 1\n')
  saveBackup(killed, readFileSync(killed), backups)
  saveBackup(live, readFileSync(live), backups)
  writeFileSync(killed, 'export const a = 2\n')
  writeFileSync(live, 'export const b = 2\n')
  const deadPid = spawnSync(process.execPath, ['-e', '']).pid
  for (const name of readdirSync(backups)) {
    const backup = JSON.parse(readFileSync(join(backups, name), 'utf8'))
    if (backup.path === killed) writeFileSync(join(backups, name), JSON.stringify({ ...backup, pid: deadPid }))
  }
  assert.deepEqual(recoverInterrupted(backups), [killed])
  assert.equal(readFileSync(killed, 'utf8'), 'export const a = 1\n')
  assert.equal(readFileSync(live, 'utf8'), 'export const b = 2\n')
  assert.equal(readdirSync(backups).length, 1)
})
