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
      const requestWrite = to.includes('/requests/')
      if ((point === 'staged' || point === 'prepared') && requestWrite ||
          point === 'committed' && to.endsWith('/work-graph.json') ||
          point === 'applied' && requestWrite && JSON.parse(fs.readFileSync(to, 'utf8')).checkpoint.applied) {
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

const completion = { expectedVersion: 1, requestId: 'finish-one', session, status: 'completed', evidence: [proof] }
const retries = {
  recover: cwd => cli(cwd, ['recover', completion.requestId], { session }),
  resend: cwd => cli(cwd, ['update', 'one'], completion),
}
const cancellationReason = 'Cancelled by user'
const cancel = (cwd, expectedVersion) => cli(cwd, ['update', 'one'], {
  expectedVersion, status: 'cancelled', reason: cancellationReason, session: { ...session, sessionId: 'another-session' },
})
const show = cwd => success(cli(cwd, ['show', 'one']))
const completionState = cwd => success(cli(cwd, ['requests'])).requests.find(
  request => request.requestId === completion.requestId,
).state

test('cancelling before recovery rejects both ways of retrying a staged completion', t => {
  const f = fixture(t)
  success(cli(f.cwd, ['create'], create))
  interrupt(f, ['update', 'one'], completion, 'staged')
  assert.equal(success(cancel(f.cwd, 1)).version, 2)
  const cancelled = show(f.cwd)
  assert.equal(cancelled.task.status, 'cancelled')
  assert.equal(cancelled.task.reason, cancellationReason)
  assert.deepEqual(cancelled.task.evidence, [])
  for (const retry of Object.values(retries)) {
    rejected(retry(f.cwd), /Version conflict: expected 1, current 2/)
    assert.deepEqual(show(f.cwd), cancelled)
  }
  assert.equal(completionState(f.cwd), 'pending')
})

for (const [point, versionAtCrash, stateAtCrash] of [
  ['staged', 1, 'pending'],
  ['prepared', 1, 'prepared'],
  ['committed', 2, 'prepared'],
  ['applied', 2, 'applied'],
]) {
  for (const [method, retry] of Object.entries(retries)) {
    test(`completion interrupted at ${point}, replayed by ${method}, and then cancelled applies only once`, t => {
      const f = fixture(t)
      success(cli(f.cwd, ['create'], create))
      const pid = interrupt(f, ['update', 'one'], completion, point)
      assert.equal(show(f.cwd).version, versionAtCrash)
      assert.equal(completionState(f.cwd), stateAtCrash)
      if (point !== 'staged') {
        rejected(retry(f.cwd), /locked/)
        rejected(cancel(f.cwd, versionAtCrash), /locked/)
        // The existing lock contract requires a confirmed dead writer before removal.
        const lock = f.store + '.lock'
        assert.equal(JSON.parse(readFileSync(lock, 'utf8')).pid, pid)
        assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
        unlinkSync(lock)
      }

      const receipt = success(retry(f.cwd))
      assert.equal(receipt.version, 2)
      assert.equal(receipt.task.status, 'completed')
      assert.deepEqual(receipt.task.evidence, [proof])
      assert.equal(show(f.cwd).version, 2)
      assert.equal(completionState(f.cwd), 'applied')

      assert.equal(success(cancel(f.cwd, 2)).version, 3)
      const cancelled = show(f.cwd)
      assert.equal(cancelled.task.status, 'cancelled')
      assert.equal(cancelled.task.reason, cancellationReason)
      assert.deepEqual(cancelled.task.evidence, [proof])
      for (const repeat of Object.values(retries)) {
        assert.deepEqual(success(repeat(f.cwd)), receipt)
        assert.deepEqual(show(f.cwd), cancelled)
      }
    })
  }
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
