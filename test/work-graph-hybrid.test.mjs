import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { graphPath } from '../dist/codex/tools/work-graph.mjs'

const tool = fileURLToPath(new URL('../dist/codex/tools/work-graph.mjs', import.meta.url))
const session = { provider: 'codex', hostId: 'host-one', sessionId: 'session-one' }
const create = { expectedVersion: 0, requestId: 'create-one', id: 'one', title: 'Check recovery', goal: 'Keep the confirmed write', acceptance: ['Result verified'], session }
const proof = { criterion: 'Result verified', command: 'read checked result', expected: 'Result present', observed: 'Result present', revision: 'fixture' }
const cli = (cwd, args, payload, flags = []) => spawnSync(process.execPath, [...flags, tool, ...args], {
  cwd, input: payload === undefined ? undefined : JSON.stringify(payload), encoding: 'utf8',
})
const success = result => { assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout) }
const rejected = (result, pattern) => { assert.equal(result.status, 2); assert.match(result.stderr, pattern) }
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { stdio: 'pipe' })
const fixture = t => {
  const root = mkdtempSync(join(tmpdir(), 'haechi-hybrid-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const cwd = join(root, 'repo')
  mkdirSync(cwd)
  git(cwd, 'init', '-q')
  return { root, cwd, store: graphPath(cwd) }
}

// Stop the real packaged CLI immediately after the selected filesystem operation.
// The child never runs finally blocks or emits its normal response.
const interrupt = ({ root, cwd }, args, payload, point) => {
  const preloader = join(root, 'interrupt.mjs')
  writeFileSync(preloader, `
    import fs from 'node:fs'
    import { syncBuiltinESMExports } from 'node:module'
    const point = ${JSON.stringify(point)}
    const method = point === 'staged' ? 'linkSync' : 'renameSync'
    const operation = fs[method]
    fs[method] = (from, to) => {
      operation(from, to)
      if (point === 'staged' && to.includes('/requests/') ||
          point === 'prepared' && to.includes('/requests/') ||
          point === 'committed' && to.endsWith('/work-graph.json')) {
        process.kill(process.pid, 'SIGKILL')
      }
    }
    syncBuiltinESMExports()
  `)
  const result = cli(cwd, args, payload, ['--import', preloader])
  assert.equal(result.signal, 'SIGKILL', result.stderr)
  assert.equal(result.stdout, '')
  return result.pid
}

test('a staged create survives a real process kill and replays once across worktrees', t => {
  const f = fixture(t)
  git(f.cwd, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture')
  const worktree = join(f.root, 'other')
  git(f.cwd, 'worktree', 'add', '--detach', '-q', worktree)
  interrupt(f, ['create'], create, 'staged')
  assert.equal(existsSync(f.store), false)
  const requests = success(cli(worktree, ['requests'])).requests
  assert.deepEqual(requests, [{ requestId: 'create-one', command: 'create', taskId: 'one', session, expectedVersion: 0, state: 'pending' }])
  rejected(cli(worktree, ['recover', 'create-one'], { session: { ...session, hostId: 'host-two' } }), /different session scope/)
  const applied = success(cli(worktree, ['recover', 'create-one'], { session }))
  assert.deepEqual(applied.task.sessions, [session])
  assert.equal(applied.version, 1)
  assert.deepEqual(success(cli(f.cwd, ['create'], { ...create, session: { hostId: session.hostId, sessionId: session.sessionId, provider: session.provider } })), applied)
  rejected(cli(f.cwd, ['create'], { ...create, goal: 'Different request' }), /different payload/)
  rejected(cli(f.cwd, ['create'], { ...create, session: { ...session, hostId: 'host-two' } }), /different payload or session scope/)
  success(cli(f.cwd, ['update', 'one'], { expectedVersion: 1, next: 'Newer state' }))
  assert.deepEqual(success(cli(worktree, ['recover', 'create-one'], { session })), applied)
  const view = success(cli(f.cwd, ['list']))
  assert.equal(view.totalTasks, 1)
  assert.equal(view.version, 2)
  assert.equal(view.tasks[0].next, 'Newer state')
})

test('recovering a pending completion preserves a newer cancellation', t => {
  const f = fixture(t)
  success(cli(f.cwd, ['create'], create))
  interrupt(f, ['update', 'one'], {
    expectedVersion: 1, requestId: 'finish-one', session, status: 'completed', evidence: [proof],
  }, 'staged')
  const cancel = success(cli(f.cwd, ['update', 'one'], {
    expectedVersion: 1, status: 'cancelled', reason: 'Cancelled by user', session: { ...session, sessionId: 'another-session' },
  }))
  rejected(cli(f.cwd, ['recover', 'finish-one'], { session }), /Version conflict: expected 1, current 2/)
  const actual = success(cli(f.cwd, ['show', 'one']))
  assert.equal(actual.task.status, 'cancelled')
  assert.equal(actual.version, cancel.version)
  assert.deepEqual(actual.task.evidence, [])
  assert.equal(success(cli(f.cwd, ['requests'])).requests.find(r => r.requestId === 'finish-one').state, 'pending')
})

for (const point of ['prepared', 'committed']) {
  test(`recovery after the graph write is ${point} records exactly one successful update`, t => {
    const f = fixture(t)
    success(cli(f.cwd, ['create'], create))
    const payload = { expectedVersion: 1, requestId: 'finish-one', session, status: 'completed', evidence: [proof] }
    const pid = interrupt(f, ['update', 'one'], payload, point)
    assert.equal(success(cli(f.cwd, ['show', 'one'])).version, point === 'committed' ? 2 : 1)
    rejected(cli(f.cwd, ['recover', 'finish-one'], { session }), /locked/)
    // The existing lock contract requires a confirmed dead writer before removal.
    const lock = f.store + '.lock'
    assert.equal(JSON.parse(readFileSync(lock, 'utf8')).pid, pid)
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
    unlinkSync(lock)
    const applied = success(cli(f.cwd, ['recover', 'finish-one'], { session }))
    assert.equal(applied.version, 2)
    assert.equal(applied.task.status, 'completed')
    assert.deepEqual(success(cli(f.cwd, ['update', 'one'], payload)), applied)
    assert.equal(success(cli(f.cwd, ['show', 'one'])).version, 2)
  })
}

test('a copied request cannot be recovered in another Git repository', t => {
  const f = fixture(t)
  interrupt(f, ['create'], create, 'staged')
  const other = join(f.root, 'unrelated')
  mkdirSync(other)
  git(other, 'init', '-q')
  const source = join(dirname(f.store), 'requests', 'create-one.json')
  const destination = join(dirname(graphPath(other)), 'requests', 'create-one.json')
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(source, destination)
  rejected(cli(other, ['recover', 'create-one'], { session }), /different repository/)
  assert.equal(success(cli(other, ['list'])).totalTasks, 0)
})

test('a captured result survives source removal and check detects modified or missing snapshots', t => {
  const f = fixture(t)
  const source = join(f.root, 'proof.txt')
  const checked = 'Two assertions passed'
  const sha256 = createHash('sha256').update(checked).digest('hex')
  writeFileSync(source, 'Unreviewed result')
  rejected(cli(f.cwd, ['snapshot'], { path: source, sha256 }), /changed since review/)
  writeFileSync(source, checked)
  rejected(cli(f.cwd, ['create'], { ...create, requestId: 'uncaptured-proof', evidence: [{ ...proof, artifact: source }] }), /SNAPSHOT_REQUIRED/)
  assert.equal(existsSync(f.store), false)
  const capture = success(cli(f.cwd, ['snapshot'], { path: source, sha256 }))
  assert.deepEqual(success(cli(f.cwd, ['snapshot'], { path: source, sha256 })), capture)
  assert.equal(readFileSync(capture.artifact, 'utf8'), checked)
  unlinkSync(source)
  success(cli(f.cwd, ['create'], { ...create, evidence: [{ ...proof, artifact: capture.artifact }] }))
  assert.equal(success(cli(f.cwd, ['check'])).ok, true)
  writeFileSync(capture.artifact, 'Altered result')
  let result = cli(f.cwd, ['check'])
  assert.equal(result.status, 1)
  assert.deepEqual(JSON.parse(result.stdout).issues, [{
    taskId: 'one', field: 'evidence[0].artifact', path: capture.artifact, code: 'HASH_MISMATCH',
  }])
  rejected(cli(f.cwd, ['update', 'one'], { expectedVersion: 1, requestId: 'finish-one', session, status: 'completed' }), /HASH_MISMATCH/)
  assert.equal(success(cli(f.cwd, ['show', 'one'])).task.status, 'planned')
  unlinkSync(capture.artifact)
  result = cli(f.cwd, ['check'])
  assert.equal(result.status, 1)
  assert.equal(JSON.parse(result.stdout).issues[0].code, 'ENOENT')
  assert.equal(success(cli(f.cwd, ['show', 'one'])).version, 1)
})
