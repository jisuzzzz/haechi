// Cleans up after a merged branch: its worktree, the local branch (git branch -d) and a remote branch left over.
// Without --yes it only prints what it would delete; with --yes it deletes. Run it from the main checkout.
// Usage: node cleanup-merged.mjs <branch> [--base <branch>] [--discard] [--yes]
// --base defaults to .haechi.json git.base in the main worktree. --discard is for throwaway branches that are never
// merged: no merged check, git branch -D, remote branch never deleted; every other safety rule stays.
// Exit 0 list printed or all deletions done, 1 a deletion failed, 2 bad arguments / not a git repo / no base.
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readFileSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LEGACY_TEARDOWN = 'unlink-reparse-points'

export const parseArgs = (argv) => {
  const options = { branch: null, base: null, yes: false, discard: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--yes') options.yes = true
    else if (arg === '--discard') options.discard = true
    else if (arg === '--base') {
      options.base = argv[++i]
      if (!options.base) return { error: '--base needs a branch name' }
    } else if (arg.startsWith('--')) return { error: `unknown option ${arg}` }
    else if (options.branch) return { error: `unexpected argument ${arg}` }
    else options.branch = arg
  }
  if (!options.branch) return { error: 'pass the branch to clean up' }
  return options
}

export const parseWorktreeList = (porcelain) =>
  porcelain
    .split(/\r?\n\r?\n/)
    .filter((block) => block.trim() !== '')
    .map((block, index) => ({
      path: block.match(/^worktree (.+)$/m)?.[1],
      branch: block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? null,
      // git always lists the main worktree first
      isMain: index === 0,
    }))

// Lines of "<sha> <refname>" (for-each-ref) or "<sha>\t<refname>" (ls-remote). Exact, case-sensitive match:
// a loose revision would also resolve a tag of the same name, and Windows refs match case-insensitively.
export const findRefSha = (output, ref) =>
  output
    .split(/\r?\n/)
    .map((line) => line.split(/\s+/))
    .find(([, name]) => name === ref)?.[0] ?? null

export const sameDir = (a, b, platform = process.platform) => {
  const left = resolve(a)
  const right = resolve(b)
  return platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

// facts: { branch, base, discard, currentBranch, local: null | { merged }, remote: null | { sha, merged },
//          worktree: null | { path, isMain, isCurrent, status } }
export const buildPlan = ({ branch, base, discard, currentBranch, local, remote, worktree }) => {
  const plan = []
  const skipped = []
  // A pushed branch may hold work someone else relies on, so --discard only drops branches that never left this machine
  const deletable = Boolean(local) && (discard ? !local.hasUpstream : local.merged)
  if (!local) skipped.push(`no local branch named exactly ${branch}`)
  else if (discard && local.hasUpstream) skipped.push(`${branch} has an upstream (it was pushed) — --discard keeps it`)
  else if (!deletable) {
    skipped.push(`${branch} is not in origin/${base} — not merged yet, or squash-merged (that leaves the branch unmerged). It is kept`)
  }
  let worktreeStays = false
  if (worktree) {
    worktreeStays = worktree.isCurrent || worktree.isMain || worktree.status !== ''
    if (worktree.isCurrent) skipped.push(`worktree ${worktree.path} is where this command runs — run the cleanup from another checkout`)
    else if (worktree.isMain) skipped.push(`worktree ${worktree.path} is the main checkout`)
    else if (worktree.status !== '') skipped.push(`worktree ${worktree.path} has uncommitted or untracked changes:\n${worktree.status}`)
    else if (deletable) plan.push({ kind: 'worktree', path: worktree.path })
  }
  if (local) {
    if (currentBranch === branch) skipped.push(`local branch ${branch} is the currently checked-out branch — switch to another branch first`)
    else if (worktreeStays) skipped.push(`local branch ${branch} — its worktree stays, and git branch -d refuses a checked-out branch`)
    else if (deletable) plan.push({ kind: 'branch', force: discard })
  }
  if (remote) {
    if (discard) skipped.push('--discard never deletes remote branches')
    else if (remote.merged) plan.push({ kind: 'remote', sha: remote.sha })
    else skipped.push(`remote branch origin/${branch} at ${remote.sha.slice(0, 12)} is not in origin/${base} — it may have newer commits. It is kept`)
  }
  return { plan, skipped }
}

export const describeItem = (item, branch) =>
  ({
    worktree: `worktree ${item.path}`,
    branch: `local branch ${branch} (git branch ${item.force ? '-D' : '-d'})`,
    remote: `remote branch origin/${branch}`,
  })[item.kind]

const git = (args, options = {}) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim()
const tryGit = (args, options) => {
  try {
    return { ok: true, out: git(args, options) }
  } catch (error) {
    return { ok: false, out: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim() }
  }
}

const fail = (message) => {
  console.error(message)
  process.exit(2)
}

// git worktree remove follows symlinks and junctions anywhere in the worktree and deletes their targets (for example
// pkg/node_modules -> the main checkout's), so every link is unlinked first, without following it. Tracked content
// cannot be a junction and a tracked symlink is a file git restores, so only untracked and ignored entries are walked.
const unlinkLinks = (worktree) => {
  const listed = (args) => git(['-C', worktree, 'ls-files', '-z', '-o', '--directory', '--exclude-standard', ...args]).split('\0')
  const unlink = (path) => {
    unlinkSync(path)
    console.log(`Unlinked: ${path}`)
  }
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      const path = join(dir, entry.name)
      // lstat, not the dirent type: a junction must never be taken for a real directory and walked into
      if (lstatSync(path).isSymbolicLink()) unlink(path)
      else walk(path)
    }
  }
  for (const entry of new Set([...listed(['-i']), ...listed([])])) {
    if (!entry) continue
    // git may list a path through a link (link/file), so the first link on the way down is the one to unlink
    let path = worktree
    let linked = false
    for (const part of entry.replace(/\/$/, '').split('/')) {
      path = join(path, part)
      const stat = lstatSync(path, { throwIfNoEntry: false })
      if (!stat) break
      if (stat.isSymbolicLink()) {
        unlink(path)
        linked = true
        break
      }
    }
    if (!linked && lstatSync(path, { throwIfNoEntry: false })?.isDirectory()) walk(path)
  }
}

const removeWorktree = (path, teardown) => {
  unlinkLinks(path)
  if (teardown) {
    try {
      execSync(teardown, { cwd: path, stdio: 'inherit' })
    } catch {
      console.log(`Failed: worktreeTeardown "${teardown}" in ${path} — the worktree is kept`)
      return false
    }
  }
  const result = tryGit(['worktree', 'remove', path])
  console.log(result.ok ? `Deleted: worktree ${path}` : `Failed: worktree ${path}\n${result.out}`)
  if (result.ok) tryGit(['worktree', 'prune'])
  return result.ok
}

const isInBase = (sha, base) => tryGit(['merge-base', '--is-ancestor', sha, `refs/remotes/origin/${base}`]).ok

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.error) fail(`${options.error}\nUsage: node cleanup-merged.mjs <branch> [--base <branch>] [--discard] [--yes]`)
  const root = tryGit(['rev-parse', '--show-toplevel'])
  if (!root.ok) fail('Not inside a git repository')
  const worktrees = parseWorktreeList(git(['worktree', 'list', '--porcelain']))

  // Settings come from the main worktree, so a branch's own .haechi.json cannot supply the teardown command
  let settings = {}
  const settingsFile = join(worktrees[0].path, '.haechi.json')
  if (existsSync(settingsFile)) {
    try {
      settings = JSON.parse(readFileSync(settingsFile, 'utf8'))
    } catch (error) {
      fail(`Cannot read ${settingsFile}: ${error.message}`)
    }
  }
  const base = options.base ?? settings.git?.base
  if (!base) fail('No base branch: pass --base <branch> or set git.base in .haechi.json')
  const teardown =
    typeof settings.worktreeTeardown === 'string' && settings.worktreeTeardown !== LEGACY_TEARDOWN ? settings.worktreeTeardown : null
  const { branch, discard } = options
  if (branch === base || (settings.git?.protected ?? []).includes(branch)) fail(`${branch} is the base or a protected branch — it is never deleted`)
  const ref = `refs/heads/${branch}`

  const fetched = tryGit(['fetch', 'origin', base, '--prune'])
  if (!fetched.ok) console.log(`Fetch failed: git fetch origin ${base} — judging against the local origin/${base}\n${fetched.out}`)
  const localSha = findRefSha(git(['for-each-ref', '--format=%(objectname) %(refname)', 'refs/heads/']), ref)
  const entry = localSha && worktrees.find((item) => item.branch === branch)
  const worktree = entry && {
    ...entry,
    isCurrent: sameDir(entry.path, root.out),
    status: tryGit(['-C', entry.path, 'status', '--porcelain']).out,
  }
  const remoteList = tryGit(['ls-remote', 'origin', ref])
  const remoteSha = remoteList.ok ? findRefSha(remoteList.out, ref) : null
  if (remoteSha && !discard && !tryGit(['cat-file', '-e', `${remoteSha}^{commit}`]).ok) tryGit(['fetch', 'origin', ref])
  const { plan, skipped } = buildPlan({
    branch,
    base,
    discard,
    currentBranch: tryGit(['branch', '--show-current']).out,
    local: localSha && { merged: isInBase(localSha, base), hasUpstream: tryGit(['rev-parse', '--verify', '--quiet', `${ref}@{upstream}`]).ok },
    remote: remoteSha && { sha: remoteSha, merged: !discard && isInBase(remoteSha, base) },
    worktree,
  })

  console.log(plan.length ? 'To delete:' : 'Nothing to delete.')
  for (const item of plan) console.log(`  - ${describeItem(item, branch)}`)
  for (const reason of skipped) console.log(`Skipped: ${reason}`)
  if (!options.yes || plan.length === 0) process.exit(0)

  let failed = false
  for (const item of plan) {
    if (item.kind === 'worktree') {
      // branch -d would refuse while the worktree still has the branch checked out
      if (!removeWorktree(item.path, teardown)) process.exit(1)
      continue
    }
    // The lease makes the push fail if someone pushed to the branch after its tip was checked
    const args =
      item.kind === 'branch'
        ? ['branch', item.force ? '-D' : '-d', branch]
        : ['push', `--force-with-lease=${ref}:${item.sha}`, 'origin', `:${ref}`]
    const result = tryGit(args)
    const label = describeItem(item, branch)
    console.log(result.ok ? `Deleted: ${label}` : `Failed: ${label}\n${result.out}`)
    failed ||= !result.ok
  }
  process.exit(failed ? 1 : 0)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
