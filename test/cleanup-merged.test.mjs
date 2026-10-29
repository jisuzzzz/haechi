import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { buildPlan, findRefSha, parseArgs, parseWorktreeList, sameDir } from '../core/tools/cleanup-merged.mjs'

const tool = join(import.meta.dirname, '..', 'core', 'tools', 'cleanup-merged.mjs')

// Isolate from the user's global git config (hooks, signing, default branch); symlinks on so a tracked link is real.
const scratch = mkdtempSync(join(tmpdir(), 'cleanup-merged-'))
const globalConfig = join(scratch, 'gitconfig')
writeFileSync(globalConfig, '[user]\n\tname = Test\n\temail = test@example.com\n[init]\n\tdefaultBranch = main\n[core]\n\tsymlinks = true\n')
after(() => rmSync(scratch, { recursive: true, force: true }))
const env = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' }

const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const run = (cwd, ...args) => spawnSync(process.execPath, [tool, ...args], { cwd, env, encoding: 'utf8' })

// A bare origin and a clone whose main has a tracked pkg/ folder and a tracked symlink CLAUDE.md -> AGENTS.md.
let repoCount = 0
const makeRepo = () => {
  const dir = join(scratch, `repo${repoCount++}`)
  mkdirSync(dir)
  const origin = join(dir, 'origin.git')
  const clone = join(dir, 'clone')
  git(dir, 'init', '--bare', '-b', 'main', origin)
  git(dir, 'clone', origin, clone)
  writeFileSync(join(clone, '.gitignore'), 'linked\nnode_modules\ncache/\n')
  writeFileSync(join(clone, 'AGENTS.md'), 'rules\n')
  symlinkSync('AGENTS.md', join(clone, 'CLAUDE.md'), 'file')
  mkdirSync(join(clone, 'pkg'))
  writeFileSync(join(clone, 'pkg', 'index.txt'), 'pkg\n')
  git(clone, 'add', '.')
  git(clone, 'commit', '-m', 'init')
  git(clone, 'push', 'origin', 'main')
  return { dir, clone }
}

// A branch with one commit in its own worktree, pushed to origin; merged into origin/main when asked.
const addBranch = ({ dir, clone }, branch, { merge, files = {} }) => {
  const worktree = join(dir, branch.replace('/', '-'))
  git(clone, 'worktree', 'add', worktree, '-b', branch)
  writeFileSync(join(worktree, `${branch.replace('/', '-')}.txt`), 'change\n')
  for (const [name, content] of Object.entries(files)) writeFileSync(join(worktree, name), content)
  git(worktree, 'add', '.')
  git(worktree, 'commit', '-m', branch)
  git(worktree, 'push', 'origin', branch)
  if (merge) {
    git(clone, 'merge', '--ff-only', branch)
    git(clone, 'push', 'origin', 'main')
  }
  return worktree
}

// A directory with a sentinel file, and a junction to it at <link>.
const linkToSentinel = (link, target) => {
  mkdirSync(target, { recursive: true })
  writeFileSync(join(target, 'sentinel.txt'), 'keep me\n')
  symlinkSync(target, link, 'junction')
  return join(target, 'sentinel.txt')
}

const branchExists = (clone, branch) => git(clone, 'for-each-ref', '--format=%(refname)', 'refs/heads/').split('\n').includes(`refs/heads/${branch}`)
const remoteSha = (clone, branch) => findRefSha(git(clone, 'ls-remote', 'origin'), `refs/heads/${branch}`)

test('merged branch: --yes removes worktree, local and remote branch without following any link', () => {
  const repo = makeRepo()
  const worktree = addBranch(repo, 'feat/done', { merge: true })
  const sentinels = [
    linkToSentinel(join(worktree, 'linked'), join(repo.dir, 'shared')),
    // nested under a tracked folder, pointing into the main checkout
    linkToSentinel(join(worktree, 'pkg', 'node_modules'), join(repo.clone, 'pkg', 'node_modules')),
  ]
  mkdirSync(join(worktree, 'cache', 'deep'), { recursive: true })
  sentinels.push(linkToSentinel(join(worktree, 'cache', 'deep', 'link'), join(repo.dir, 'cached')))

  const dry = run(repo.clone, 'feat/done', '--base', 'main')
  assert.equal(dry.status, 0, dry.stderr)
  assert.match(dry.stdout, /^To delete:/)
  assert.match(dry.stdout, /- worktree .*feat-done/)
  assert.match(dry.stdout, /- local branch feat\/done \(git branch -d\)/)
  assert.match(dry.stdout, /- remote branch origin\/feat\/done/)
  assert.ok(existsSync(worktree) && branchExists(repo.clone, 'feat/done'))

  const wet = run(repo.clone, 'feat/done', '--base', 'main', '--yes')
  assert.equal(wet.status, 0, wet.stdout + wet.stderr)
  assert.equal(wet.stdout.match(/Unlinked: /g).length, 3)
  assert.doesNotMatch(wet.stdout, /Unlinked: .*CLAUDE\.md/)
  assert.equal(existsSync(worktree), false)
  assert.equal(branchExists(repo.clone, 'feat/done'), false)
  assert.equal(remoteSha(repo.clone, 'feat/done'), null)
  for (const sentinel of sentinels) assert.ok(existsSync(sentinel), sentinel)
})

test('--discard removes an unmerged worktree and branch, never the remote branch', () => {
  const repo = makeRepo()
  const worktree = addBranch(repo, 'draft/a', { merge: false })
  const sentinel = linkToSentinel(join(worktree, 'pkg', 'node_modules'), join(repo.clone, 'pkg', 'node_modules'))
  const pushed = remoteSha(repo.clone, 'draft/a')

  const result = run(repo.clone, 'draft/a', '--base', 'main', '--discard', '--yes')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /- local branch draft\/a \(git branch -D\)/)
  assert.match(result.stdout, /Skipped: --discard never deletes remote branches/)
  assert.equal(existsSync(worktree), false)
  assert.equal(branchExists(repo.clone, 'draft/a'), false)
  assert.equal(remoteSha(repo.clone, 'draft/a'), pushed)
  assert.ok(existsSync(sentinel))
})

test('--discard keeps a worktree with untracked changes and its branch', () => {
  const repo = makeRepo()
  const worktree = addBranch(repo, 'draft/b', { merge: false })
  writeFileSync(join(worktree, 'notes.txt'), 'draft\n')
  const result = run(repo.clone, 'draft/b', '--base', 'main', '--discard', '--yes')
  assert.equal(result.status, 0)
  assert.match(result.stdout, /Skipped: worktree .* has uncommitted or untracked changes/)
  assert.ok(existsSync(worktree) && branchExists(repo.clone, 'draft/b'))
})

test('worktreeTeardown runs in the worktree; a failing one keeps it, the legacy value is ignored', () => {
  const repo = makeRepo()
  const worktree = addBranch(repo, 'feat/td', { merge: true })
  writeFileSync(join(repo.clone, '.haechi.json'), JSON.stringify({ git: { base: 'main' }, worktreeTeardown: 'node -e "process.exit(3)"' }))
  const failed = run(repo.clone, 'feat/td', '--yes')
  assert.equal(failed.status, 1)
  assert.match(failed.stdout, /Failed: worktreeTeardown/)
  assert.ok(existsSync(worktree) && branchExists(repo.clone, 'feat/td'))

  writeFileSync(join(repo.clone, '.haechi.json'), JSON.stringify({ git: { base: 'main' }, worktreeTeardown: 'unlink-reparse-points' }))
  const done = run(repo.clone, 'feat/td', '--yes')
  assert.equal(done.status, 0, done.stdout + done.stderr)
  assert.equal(existsSync(worktree), false)
})

test('settings come from the main worktree, not from the checkout the command runs in', () => {
  const repo = makeRepo()
  writeFileSync(join(repo.clone, '.haechi.json'), JSON.stringify({ git: { base: 'main' } }))
  const worktree = addBranch(repo, 'feat/m', { merge: true })
  const other = addBranch(repo, 'feat/other', {
    merge: false,
    files: { '.haechi.json': JSON.stringify({ git: { base: 'nope' }, worktreeTeardown: 'node -e "process.exit(3)"' }) },
  })
  const result = run(other, 'feat/m', '--yes')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(existsSync(worktree), false)
  assert.equal(branchExists(repo.clone, 'feat/m'), false)
})

test('unmerged branch is skipped and nothing is deleted', () => {
  const repo = makeRepo()
  const worktree = addBranch(repo, 'feat/open', { merge: false })
  const result = run(repo.clone, 'feat/open', '--base', 'main', '--yes')
  assert.equal(result.status, 0)
  assert.match(result.stdout, /Nothing to delete\./)
  assert.match(result.stdout, /Skipped: feat\/open is not in origin\/main/)
  assert.match(result.stdout, /Skipped: remote branch origin\/feat\/open at \w+ is not in origin\/main/)
  assert.ok(existsSync(worktree) && branchExists(repo.clone, 'feat/open') && remoteSha(repo.clone, 'feat/open'))
})

test('a tag with the branch name does not make an unmerged branch look merged', () => {
  const repo = makeRepo()
  const worktree = addBranch(repo, 'feat/t', { merge: false })
  git(repo.clone, 'tag', 'feat/t', 'main')
  const result = run(repo.clone, 'feat/t', '--base', 'main', '--yes')
  assert.equal(result.status, 0)
  assert.match(result.stdout, /Nothing to delete\./)
  assert.ok(existsSync(worktree) && branchExists(repo.clone, 'feat/t') && remoteSha(repo.clone, 'feat/t'))
})

test('the branch name must match exactly: other case and suffixes are not touched', () => {
  const repo = makeRepo()
  const worktree = addBranch(repo, 'feat/c', { merge: true })
  writeFileSync(join(worktree, 'notes.txt'), 'draft\n')
  const cased = run(repo.clone, 'Feat/C', '--base', 'main', '--yes')
  assert.equal(cased.status, 0)
  assert.match(cased.stdout, /Nothing to delete\./)
  assert.ok(branchExists(repo.clone, 'feat/c') && remoteSha(repo.clone, 'feat/c'))

  addBranch(repo, 'user/fix', { merge: true })
  const suffix = run(repo.clone, 'fix', '--base', 'main', '--yes')
  assert.equal(suffix.status, 0)
  assert.match(suffix.stdout, /Nothing to delete\./)
  assert.ok(branchExists(repo.clone, 'user/fix') && remoteSha(repo.clone, 'user/fix'))
})

test('a remote branch with commits pushed after the merge is kept', () => {
  const repo = makeRepo()
  const worktree = addBranch(repo, 'feat/r', { merge: true })
  const second = join(repo.dir, 'second')
  git(repo.dir, 'clone', join(repo.dir, 'origin.git'), second)
  git(second, 'switch', 'feat/r')
  writeFileSync(join(second, 'late.txt'), 'late\n')
  git(second, 'add', '.')
  git(second, 'commit', '-m', 'late')
  git(second, 'push', 'origin', 'feat/r')
  const late = git(second, 'rev-parse', 'HEAD')

  const result = run(repo.clone, 'feat/r', '--base', 'main', '--yes')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /Skipped: remote branch origin\/feat\/r at \w+ is not in origin\/main/)
  assert.equal(existsSync(worktree), false)
  assert.equal(branchExists(repo.clone, 'feat/r'), false)
  assert.equal(remoteSha(repo.clone, 'feat/r'), late)
})

test('worktree with an untracked file is skipped and its branch kept', () => {
  const repo = makeRepo()
  const worktree = addBranch(repo, 'feat/dirty', { merge: true })
  writeFileSync(join(worktree, 'notes.txt'), 'draft\n')
  const result = run(repo.clone, 'feat/dirty', '--base', 'main', '--yes')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /Skipped: worktree .* has uncommitted or untracked changes:\n\?\? notes\.txt/)
  assert.match(result.stdout, /Skipped: local branch feat\/dirty — its worktree stays/)
  assert.ok(existsSync(join(worktree, 'notes.txt')) && branchExists(repo.clone, 'feat/dirty'))
  // the merged remote branch is still cleaned up
  assert.equal(remoteSha(repo.clone, 'feat/dirty'), null)
})

test('currently checked-out branch is skipped', () => {
  const repo = makeRepo()
  git(repo.clone, 'switch', '-c', 'feat/here')
  const result = run(repo.clone, 'feat/here', '--base', 'main', '--yes')
  assert.equal(result.status, 0)
  assert.match(result.stdout, /Skipped: local branch feat\/here is the currently checked-out branch/)
  assert.equal(git(repo.clone, 'branch', '--show-current'), 'feat/here')
})

test('--base comes from .haechi.json git.base; no base at all exits 2', () => {
  const repo = makeRepo()
  addBranch(repo, 'feat/cfg', { merge: true })
  const missing = run(repo.clone, 'feat/cfg')
  assert.equal(missing.status, 2)
  assert.match(missing.stderr, /No base branch/)

  writeFileSync(join(repo.clone, '.haechi.json'), JSON.stringify({ git: { base: 'main' } }))
  const result = run(repo.clone, 'feat/cfg')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /- local branch feat\/cfg/)
})

test('the base and protected branches are refused in both modes', () => {
  const repo = makeRepo()
  addBranch(repo, 'release', { merge: true })
  writeFileSync(join(repo.clone, '.haechi.json'), JSON.stringify({ git: { base: 'main', protected: ['main', 'release'] } }))
  for (const args of [['main', '--yes'], ['release', '--yes'], ['release', '--discard', '--yes']]) {
    const result = run(repo.clone, ...args)
    assert.equal(result.status, 2)
    assert.match(result.stderr, /base or a protected branch/)
  }
  assert.match(execFileSync('git', ['-C', repo.clone, 'branch', '--list', 'release'], { encoding: 'utf8' }), /release/)
})

test('bad arguments and outside a git repo exit 2', () => {
  assert.equal(run(scratch).status, 2)
  assert.equal(run(scratch, 'a', 'b').status, 2)
  assert.equal(run(scratch, 'a', '--base').status, 2)
  const outside = run(scratch, 'feat/x', '--base', 'main')
  assert.equal(outside.status, 2)
  assert.match(outside.stderr, /Not inside a git repository/)
})

test('parseArgs', () => {
  assert.deepEqual(parseArgs(['feat/x', '--yes', '--base', 'main']), { branch: 'feat/x', base: 'main', yes: true, discard: false })
  assert.equal(parseArgs(['x', '--discard']).discard, true)
  assert.match(parseArgs(['--force', 'x']).error, /unknown option/)
})

test('parseWorktreeList marks the main worktree and detached entries', () => {
  const porcelain = [
    'worktree C:/repo',
    'HEAD abc',
    'branch refs/heads/main',
    '',
    'worktree C:/repo-feat',
    'HEAD def',
    'branch refs/heads/feat/a',
    '',
    'worktree C:/repo-detached',
    'HEAD 123',
    'detached',
    '',
  ].join('\n')
  assert.deepEqual(parseWorktreeList(porcelain), [
    { path: 'C:/repo', branch: 'main', isMain: true },
    { path: 'C:/repo-feat', branch: 'feat/a', isMain: false },
    { path: 'C:/repo-detached', branch: null, isMain: false },
  ])
})

test('findRefSha matches the whole ref name, case-sensitively', () => {
  const output = 'aaa\trefs/heads/user/fix\nbbb\trefs/heads/feat/c\nccc refs/heads/fix'
  assert.equal(findRefSha(output, 'refs/heads/fix'), 'ccc')
  assert.equal(findRefSha(output, 'refs/heads/Feat/C'), null)
  assert.equal(findRefSha('', 'refs/heads/x'), null)
})

test('sameDir ignores case on Windows only', () => {
  assert.equal(sameDir('/Repo/A', '/repo/a', 'win32'), true)
  assert.equal(sameDir('/Repo/A', '/repo/a', 'linux'), false)
})

test('buildPlan', () => {
  const facts = {
    branch: 'b',
    base: 'main',
    discard: false,
    currentBranch: 'main',
    local: { merged: true },
    remote: { sha: 'abc', merged: true },
    worktree: null,
  }
  const kinds = (result) => result.plan.map((item) => item.kind)
  const wt = { path: '/w', isMain: false, isCurrent: false, status: '' }

  assert.deepEqual(kinds(buildPlan(facts)), ['branch', 'remote'])
  assert.deepEqual(kinds(buildPlan({ ...facts, worktree: wt })), ['worktree', 'branch', 'remote'])
  assert.deepEqual(kinds(buildPlan({ ...facts, local: { merged: false }, remote: { sha: 'abc', merged: false }, worktree: wt })), [])
  assert.deepEqual(kinds(buildPlan({ ...facts, remote: null })), ['branch'])
  assert.deepEqual(kinds(buildPlan({ ...facts, local: null })), ['remote'])
  assert.deepEqual(kinds(buildPlan({ ...facts, remote: { sha: 'abc', merged: false } })), ['branch'])

  const discarded = buildPlan({ ...facts, discard: true, local: { merged: false }, remote: { sha: 'abc', merged: false }, worktree: wt })
  assert.deepEqual(kinds(discarded), ['worktree', 'branch'])
  assert.equal(discarded.plan[1].force, true)
  const pushed = buildPlan({ ...facts, discard: true, local: { merged: false, hasUpstream: true }, remote: null, worktree: wt })
  assert.deepEqual(kinds(pushed), [])
  assert.match(pushed.skipped[0], /has an upstream/)

  const current = buildPlan({ ...facts, currentBranch: 'b', worktree: { ...wt, isCurrent: true } })
  assert.deepEqual(kinds(current), ['remote'])
  assert.equal(current.skipped.length, 2)

  const main = buildPlan({ ...facts, worktree: { ...wt, isMain: true } })
  assert.deepEqual(kinds(main), ['remote'])
  assert.match(main.skipped[0], /main checkout/)
})
