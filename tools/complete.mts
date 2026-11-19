import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digest, hasCode, isDigest, publishFile, readLocalFile } from './work-graph-storage.mjs'

type GitOptions = { allowFailure?: boolean; env?: NodeJS.ProcessEnv }
type ReviewResult = 'pass' | 'changes-required'
type Review = { version: 1; diff: string; result: ReviewResult; summary: string }

const reviewResults = ['pass', 'changes-required']
const summaryLimit = 4096
const usage = [
  'Usage: node complete.mjs [check] [--base REF]',
  '       node complete.mjs snapshot [--base REF] [--patch]',
  '       node complete.mjs record DIFF pass|changes-required SUMMARY [--base REF]',
].join('\n')

function git(cwd: string, args: string[], options: GitOptions = {}) {
  try {
    return execFileSync('git', args, {
      cwd, env: options.env, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
    })
  } catch (error) {
    const failure = error as { status?: number; stderr?: Buffer }
    if (options.allowFailure && failure.status === 1) return undefined
    const detail = failure.stderr?.toString().trim()
    throw new Error(detail || `git ${args[0]} failed`)
  }
}

function gitText(cwd: string, args: string[], options?: GitOptions) {
  return git(cwd, args, options)?.toString().replace(/\r?\n$/, '')
}

const resolveCommit = (root: string, ref: string) =>
  gitText(root, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`], { allowFailure: true })

function baseCommit(root: string, head: string | undefined, requested?: string) {
  if (requested !== undefined) {
    const base = resolveCommit(root, requested)
    if (!base) throw new Error(`Cannot resolve review base: ${requested}`)
    return base
  }
  if (!head) return undefined
  const originHead = gitText(root, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], { allowFailure: true })
  for (const ref of [originHead, 'refs/remotes/origin/main', 'refs/remotes/origin/master', 'refs/heads/main', 'refs/heads/master']) {
    if (!ref) continue
    const primary = resolveCommit(root, ref)
    if (!primary) continue
    const base = gitText(root, ['merge-base', head, primary], { allowFailure: true })
    if (!base) throw new Error(`No shared history with ${ref}. Specify the intended review base with --base.`)
    return base
  }
  return head
}

function optionalFile(path: string) {
  try { return readFileSync(path) } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined
    throw error
  }
}

function pathsBetween(root: string, before: string, after: string, env: NodeJS.ProcessEnv) {
  return git(root, ['diff', '--name-only', '--no-renames', '--ignore-submodules=none', '-z', before, after, '--'], { env })!
    .toString('latin1').split('\0').slice(0, -1)
}

function snapshot(cwd: string, requestedBase: string | undefined, includePatch: boolean) {
  const root = gitText(cwd, ['rev-parse', '--show-toplevel'])!
  const gitDir = gitText(root, ['rev-parse', '--absolute-git-dir'])!
  const indexPath = gitText(root, ['rev-parse', '--path-format=absolute', '--git-path', 'index'])!
  const sourceObjects = gitText(root, ['rev-parse', '--path-format=absolute', '--git-path', 'objects'])!
  const head = resolveCommit(root, 'HEAD')
  const base = baseCommit(root, head, requestedBase)
  const index = optionalFile(indexPath)
  const scratch = mkdtempSync(join(tmpdir(), 'haechi-complete-'))
  try {
    const objects = join(scratch, 'objects')
    mkdirSync(join(objects, 'info'), { recursive: true })
    writeFileSync(join(objects, 'info', 'alternates'), `${sourceObjects}\n`)
    const env = { ...process.env, GIT_INDEX_FILE: join(scratch, 'index'), GIT_OBJECT_DIRECTORY: objects }
    if (index) writeFileSync(env.GIT_INDEX_FILE, index)
    const run = (args: string[]) => gitText(root, ['-c', 'core.fsmonitor=false', '-c', 'core.splitIndex=false', ...args], { env })!
    const flagged = run(['ls-files', '-v', '-z']).split('\0').some(entry => /^[a-zS] /.test(entry))
    if (flagged) throw new Error('Review needs a full checkout with no paths marked assume-unchanged or skip-worktree')

    const empty = run(['hash-object', '-w', '-t', 'tree', '--stdin'])
    const before = base || empty
    const staged = run(['write-tree'])
    run(['add', '--all', '--', '.'])
    const current = run(['write-tree'])
    const clean = git(root, ['-c', 'core.fsmonitor=false', 'diff', '--quiet', '--ignore-submodules=none', '--'], {
      env, allowFailure: true,
    })
    const afterIndex = optionalFile(indexPath)
    if (!clean || resolveCommit(root, 'HEAD') !== head || baseCommit(root, head, requestedBase) !== base ||
      (index ? !afterIndex?.equals(index) : afterIndex !== undefined)) {
      throw new Error('The checkout changed during capture or contains uncommitted submodule edits. Capture a stable diff and retry.')
    }

    const stagedChanges = new Set(pathsBetween(root, head || empty, staged, env))
    const stagedAlternatives = pathsBetween(root, staged, current, env).some(path => stagedChanges.has(path))
    const baseTree = run(['rev-parse', `${before}^{tree}`])
    const diff = digest(JSON.stringify([base ?? null, current, stagedAlternatives ? [head ?? null, staged] : null]))
    const patch = (from: string, to: string) => run([
      'diff', '--binary', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames',
      '--ignore-submodules=none', '--submodule=short', from, to, '--',
    ])
    return {
      reviewPath: join(gitDir, 'haechi', 'implementation-review.json'),
      base: base ?? null,
      diff,
      empty: baseTree === current && !stagedAlternatives,
      stagedAlternatives,
      ...(includePatch ? { patch: patch(before, current) } : {}),
      ...(includePatch && stagedAlternatives ? { stagedPatch: patch(head || empty, staged) } : {}),
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

function readReview(path: string): Review | undefined {
  let raw: unknown
  try { raw = JSON.parse(readLocalFile(path).toString()) } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined
    throw new Error('Cannot read the saved review record')
  }
  const value = raw as Partial<Review> | null
  if (!value || value.version !== 1 || !isDigest(value.diff) || !reviewResults.includes(value.result ?? '') ||
    typeof value.summary !== 'string' || !value.summary.trim() || value.summary.length > summaryLimit) {
    throw new Error('The saved review record is invalid')
  }
  return value as Review
}

function main(argv: string[]) {
  if (argv.length === 1 && argv[0] === '--help') return console.log(usage)
  const options = { base: undefined as string | undefined, patch: false }
  // Positional arguments precede flags so a review summary can contain arbitrary text.
  const command = argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'check'
  if (!['check', 'snapshot', 'record'].includes(command ?? '')) throw new Error(usage)
  const [id, result, summary] = command === 'record' ? argv.splice(0, 3) : []
  while (argv.length) {
    const option = argv.shift()
    if (option === '--base' && options.base === undefined && argv[0] && !argv[0].startsWith('-')) {
      options.base = argv.shift()
    } else if (option === '--patch' && command === 'snapshot' && !options.patch) {
      options.patch = true
    } else throw new Error(usage)
  }
  if (command === 'record' && (!isDigest(id) || !reviewResults.includes(result) || !summary?.trim() || summary.length > summaryLimit)) {
    throw new Error(`Supply a snapshot diff, a review result and a nonempty summary of up to ${summaryLimit} characters.\n${usage}`)
  }

  const { reviewPath, empty, ...change } = snapshot(process.cwd(), options.base, options.patch)
  const report = (status: string, fields = {}) => console.log(JSON.stringify({ status, ...change, ...fields }))
  const hold = (reason: string) => {
    report('held', { reason })
    process.exitCode = 1
  }
  if (empty) return hold('no-changes')
  if (command === 'snapshot') return report('snapshot')
  if (command === 'record') {
    if (id !== change.diff) return hold('diff-changed')
    const review: Review = { version: 1, diff: id, result: result as ReviewResult, summary }
    publishFile(reviewPath, JSON.stringify(review) + '\n', true)
    return report('recorded', { review: review.result })
  }

  const review = readReview(reviewPath)
  if (!review) return hold('missing-review')
  if (review.diff !== change.diff) return hold('stale-review')
  if (review.result !== 'pass') return hold('changes-required')
  report('completed', { review: review.result, summary: review.summary })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  try { main(process.argv.slice(2)) } catch (error) {
    console.error(JSON.stringify({ status: 'held', reason: error instanceof Error ? error.message : String(error) }))
    process.exitCode = 2
  }
}
