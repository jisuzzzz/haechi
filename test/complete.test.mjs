import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const dist = host => fileURLToPath(new URL(`../dist/${host}/tools/complete.mjs`, import.meta.url))

function fixture(t, { commit = true } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'haechi-complete-test-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Fixture')
  git('config', 'user.email', 'fixture@example.test')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'core.autocrlf', 'false')
  const write = (file, value) => writeFileSync(join(cwd, file), value)
  if (commit) {
    write('panel.txt', 'All tasks\n')
    write('.gitignore', 'scratch.txt\n')
    git('add', '.')
    git('commit', '-qm', 'Base')
    git('checkout', '-qb', 'task')
  }
  const invoke = (host, args) => {
    const result = spawnSync(process.execPath, [dist(host), ...args], { cwd, encoding: 'utf8' })
    assert.ifError(result.error)
    return { code: result.status, ...JSON.parse(result.stdout || result.stderr) }
  }
  return { cwd, git, write, run: (...args) => invoke('codex', args), claude: (...args) => invoke('claude', args) }
}

test('holds a missing review and accepts the same reviewed diff after staging and committing', t => {
  const { cwd, write, git, run, claude } = fixture(t)
  write('panel.txt', 'Filtered tasks\n')
  write('new.txt', 'No tasks match\n')
  write('scratch.txt', 'Ignored\n')
  const index = readFileSync(join(cwd, '.git', 'index'))
  const snapshot = run('snapshot', '--patch')
  assert.equal(snapshot.code, 0)
  assert.equal(snapshot.base, git('rev-parse', 'main'))
  assert.match(snapshot.patch, /\+Filtered tasks/)
  assert.match(snapshot.patch, /\+No tasks match/)
  assert.doesNotMatch(snapshot.patch, /scratch\.txt/)
  assert.deepEqual(readFileSync(join(cwd, '.git', 'index')), index)
  assert.match(git('status', '--porcelain'), /\?\? new\.txt/)
  assert.deepEqual(run(), {
    code: 1, status: 'held', base: snapshot.base, diff: snapshot.diff,
    stagedAlternatives: false, reason: 'missing-review',
  })
  assert.equal(claude('record', snapshot.diff, 'pass', 'Verified the empty state and reviewed the filter.').status, 'recorded')
  assert.equal(run().status, 'completed')
  git('add', '.')
  assert.equal(run().diff, snapshot.diff)
  git('commit', '-qm', 'Change filter')
  assert.equal(claude().status, 'completed')
  assert.equal(claude().diff, snapshot.diff)
  assert.equal(git('status', '--porcelain'), '')
})

test('holds a changed current diff and rejects recording an earlier review against it', t => {
  const { write, run } = fixture(t)
  write('panel.txt', 'Filtered tasks\n')
  const { diff } = run('snapshot')
  assert.equal(run('record', diff, 'pass', 'Reviewed the filter.').code, 0)
  write('panel.txt', 'Unexpected new text\n')
  assert.equal(run('record', diff, 'pass', 'Earlier review.').reason, 'diff-changed')
  assert.equal(run().reason, 'stale-review')
  write('panel.txt', 'Filtered tasks\n')
  assert.equal(run().status, 'completed')
})

test('holds unresolved findings and rejects a malformed record or empty change', t => {
  const { cwd, write, run } = fixture(t)
  assert.equal(run().reason, 'no-changes')
  write('panel.txt', 'Filtered tasks\n')
  const { diff } = run('snapshot')
  assert.equal(run('record', diff, 'pass', ' ').code, 2)
  assert.equal(run('record', diff, 'pass', 'Reviewed the filter.').code, 0)
  assert.equal(run('record', diff, 'changes-required', 'Wrong count when the list is empty.').code, 0)
  assert.equal(run().reason, 'changes-required')
  writeFileSync(join(cwd, '.git', 'haechi', 'implementation-review.json'), '{"version":1,"result":"pass"}')
  assert.equal(run().code, 2)
  assert.equal(run().status, 'held')
})

test('includes different staged content and a working-tree replacement in review scope', t => {
  const { write, git, run } = fixture(t)
  write('panel.txt', 'Version to commit\n')
  git('add', 'panel.txt')
  write('panel.txt', 'All tasks\n')
  const snap = run('snapshot', '--patch')
  assert.equal(snap.stagedAlternatives, true)
  assert.equal(snap.patch, '')
  assert.match(snap.stagedPatch, /\+Version to commit/)
  assert.equal(run('record', snap.diff, 'pass', 'Reviewed both variants.').code, 0)
  assert.equal(run().status, 'completed')
  write('panel.txt', 'Different staged version\n')
  git('add', 'panel.txt')
  write('panel.txt', 'All tasks\n')
  assert.equal(run().reason, 'stale-review')
})

test('uses the remote default branch or a call-specific base and keeps records worktree-local', t => {
  const { cwd, write, git, run } = fixture(t)
  const baseline = git('rev-parse', 'main')
  write('panel.txt', 'First change\n')
  git('commit', '-qam', 'First change')
  git('update-ref', 'refs/remotes/origin/integration', 'HEAD')
  git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/integration')
  write('panel.txt', 'Second change\n')
  const automatic = run('snapshot')
  const explicit = run('snapshot', '--base', 'main')
  assert.equal(automatic.base, git('rev-parse', 'HEAD'))
  assert.equal(explicit.base, baseline)
  assert.equal(run('record', explicit.diff, 'pass', 'Reviewed both changes.', '--base', 'main').code, 0)
  assert.equal(run('--base', 'main').status, 'completed')
  assert.equal(run().reason, 'stale-review')
  const sibling = join(cwd, 'scratch')
  git('worktree', 'add', '--detach', sibling, 'HEAD')
  write('scratch/panel.txt', 'Second change\n')
  const result = spawnSync(process.execPath, [dist('codex'), '--base', 'main'], { cwd: sibling, encoding: 'utf8' })
  assert.equal(result.status, 1, result.stderr)
  assert.equal(JSON.parse(result.stdout).reason, 'missing-review')
})

test('includes an untracked binary in a repository without a commit and holds changed bytes', t => {
  const { cwd, write, run } = fixture(t, { commit: false })
  mkdirSync(join(cwd, 'assets'))
  write('assets/payload.bin', Buffer.from([0, 255, 17]))
  const snap = run('snapshot', '--patch')
  assert.equal(snap.base, null)
  assert.match(snap.patch, /GIT binary patch/)
  assert.equal(run('record', snap.diff, 'pass', 'Reviewed the fixture bytes.').code, 0)
  assert.equal(run().code, 0)
  write('assets/payload.bin', Buffer.from([0, 255, 18]))
  assert.equal(run().reason, 'stale-review')
})

test('holds a checkout with hidden index entries instead of issuing a passing identity', t => {
  const { write, git, run } = fixture(t)
  git('update-index', '--assume-unchanged', 'panel.txt')
  write('panel.txt', 'Changed beneath the flag\n')
  const result = run('snapshot')
  assert.equal(result.status, 'held')
  assert.match(result.reason, /assume-unchanged/)
})

test('checks a missing review when the packaged tool is invoked through a linked directory', t => {
  const { cwd, write } = fixture(t)
  write('panel.txt', 'Filtered tasks\n')
  const linkedTools = mkdtempSync(join(tmpdir(), 'haechi-complete-link-'))
  t.after(() => rmSync(linkedTools, { recursive: true, force: true }))
  const alias = join(linkedTools, 'tools')
  symlinkSync(dirname(dist('codex')), alias, 'junction')
  const result = spawnSync(process.execPath, [join(alias, 'complete.mjs')], { cwd, encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.equal(JSON.parse(result.stdout).reason, 'missing-review')
})

test('captures a changed submodule commit despite diff settings and holds its dirty checkout', t => {
  const source = fixture(t)
  const { cwd, write, git, run } = fixture(t)
  git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', source.cwd, 'dependency')
  git('commit', '-qm', 'Add fixture dependency')
  git('config', 'diff.ignoreSubmodules', 'all')

  const child = join(cwd, 'dependency')
  write('dependency/panel.txt', 'Committed update\n')
  git('-C', child, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
    '-c', 'commit.gpgsign=false', 'commit', '-qam', 'Update fixture dependency')
  const snapshot = run('snapshot', '--base', 'HEAD', '--patch')
  assert.equal(snapshot.status, 'snapshot')
  assert.match(snapshot.patch, /\+Subproject commit/)

  write('dependency/panel.txt', 'Uncommitted update\n')
  const result = run('snapshot', '--base', 'HEAD')
  assert.equal(result.status, 'held')
  assert.match(result.reason, /uncommitted submodule edits/)
})
