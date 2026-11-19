import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { testEvidence } from './verify-default.mjs'
import { hasCode, isDigest, publishFile, readLocalFile } from './work-graph-storage.mjs'




const latestPath = (directory        ) => join(directory, 'implementation-verification.json')
const resultPath = (directory        , id        ) => join(directory, 'verification-results', id + '.json')

function readJson(path        ) {
  try { return JSON.parse(readLocalFile(path).toString())            } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined
    throw new Error('Cannot read the saved verification record')
  }
}

function readLatest(directory        ) {
  const data = readJson(latestPath(directory))
  if (data === undefined) return
  const value = data
  if (!value || value.version !== 1 || !isDigest(value.diff) ||
    typeof value.id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value.id)) {
    throw new Error('The saved verification attempt is invalid')
  }
  return value
}

export function verificationHold(directory        , diff        ) {
  const attempt = readLatest(directory)
  if (!attempt) return 'missing-verification'
  if (attempt.diff !== diff) return 'stale-verification'
  const data = readJson(resultPath(directory, attempt.id))
  if (data === undefined || readLatest(directory)?.id !== attempt.id) return 'verification-incomplete'
  const value = data
  if (!value || value.version !== 1 || value.diff !== diff || !['pass', 'failed', 'incomplete'].includes(value.outcome ?? '') ||
    (value.outcome === 'pass' && value.exitCode !== 0)) {
    throw new Error('The saved verification result is invalid')
  }
  if (value.outcome === 'failed') return 'verification-failed'
  if (value.outcome === 'incomplete') return 'verification-incomplete'
}

export function verifyCurrentDiff(directory        , diff        , cwd        , argv          , requireTests         , currentDiff              ) {
  const attempt          = { version: 1, id: randomUUID(), diff }
  // Publish a pending attempt before execution. Each runner writes its own result so an older
  // runner cannot replace the selection after a restart or a concurrent verification.
  publishFile(latestPath(directory), JSON.stringify(attempt) + '\n', true)
  const run = spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (run.stdout) process.stderr.write(run.stdout)
  if (run.stderr) process.stderr.write(run.stderr)
  if (run.error) console.error(run.error.message)
  const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`
  const tests = testEvidence(output)
  const noChecks = /^verify-default: (?:no changed files|checks \w+; 0\/0 commands)/m.test(output)
  const outcome                    = run.error || run.status !== 0 || tests === 'failed' ? 'failed'
    : tests === 'unverified' || noChecks || (requireTests && tests !== 'passed') ? 'incomplete' : 'pass'

  if (currentDiff() !== diff) return 'diff-changed'
  publishFile(resultPath(directory, attempt.id), JSON.stringify({
    version: 1, diff, outcome, exitCode: run.status, command: argv, tests: tests ?? 'not-reported',
  }) + '\n', false)
  if (readLatest(directory)?.id !== attempt.id) return 'verification-superseded'
  return verificationHold(directory, diff)
}
