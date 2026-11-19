import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkReplay } from '../evals/codex-compaction-replay.mjs'

const tap = [
  'ok 1 - positive count',
  'ok 2 - zero count',
  'ok 3 - negative count',
  'ok 4 - numeric string',
  '# tests 4',
  '# pass 4',
  '# fail 0',
  '# skipped 0',
].join('\n')
const finalDiff = 'diff --git a/badge.mjs b/badge.mjs\n-  return count > 0\n+  return count >= 0\n'
const initial = { source: 'before-source', tests: 'fixture-tests' }
const final = { source: 'after-source', tests: 'fixture-tests' }
const result = { threadId: 'thread', turnId: 'turn', initial, final, finalDiff, finalStatus: ' M badge.mjs' }
const hook = { kind: 'hook', sourcePath: '/plugin/hooks/hooks.json', status: 'completed' }
const command = { kind: 'command', status: 'completed', exitCode: 0, ...final }

function trace() {
  return [
    { ...hook, event: 'sessionStart', rules: 'rules-hash' },
    { ...command, command: "/bin/zsh -lc 'node load-change-context.mjs'", contextBytes: 60_000 },
    { kind: 'compaction' },
    { ...hook, event: 'postCompact' },
    { ...hook, event: 'sessionStart', rules: 'rules-hash' },
    { ...command, command: 'node --test --test-reporter=tap badge.test.mjs', output: tap },
    { ...command, command: 'git diff --no-ext-diff --no-color -- badge.mjs', output: 'A Git environment warning\n' + finalDiff },
    { kind: 'message', text: 'Final diff review: Numeric strings still return an em dash.' },
    { kind: 'turnCompleted', status: 'completed' },
  ].map((event, i) => ({ sequence: i + 1, threadId: result.threadId, turnId: result.turnId, ...event }))
}

test('requires an edited fixture, real recovery, executed tests, and the final diff in one turn', () => {
  const verdict = checkReplay(trace(), result)
  assert.equal(verdict.ok, true)
  assert.deepEqual(verdict.evidence, {
    checkpoint: 2, compaction: 3, postCompact: 4, recovery: 5, test: 6, diff: 7, review: 8, completion: 9,
  })
})

test('does not count compaction before the edit or a recovery in another turn', () => {
  const records = trace()
  assert.equal(checkReplay([records[2], ...records.filter((_, i) => i !== 2)], result).checks.editBeforeCompaction, false)
  records[4].turnId = 'next-turn'
  assert.equal(checkReplay(records, result).checks.sameTurnRecovery, false)
})

test('does not count a recovery that lacks the original installed workflow rules', () => {
  const records = trace()
  records[4].rules = 'different-rules'
  assert.equal(checkReplay(records, result).checks.sameTurnRecovery, false)
})

test('rejects zero tests and evidence from a different source revision', () => {
  const records = trace()
  records[5].output = '# tests 0\n# pass 0\n# fail 0\n# skipped 0'
  assert.equal(checkReplay(records, result).checks.passingTestsAfterRecovery, false)
  records[5].output = tap
  records[5].source = 'stale-source'
  assert.equal(checkReplay(records, result).checks.passingTestsAfterRecovery, false)
})

test('rejects output from a command that only mentions the test command', () => {
  const records = trace()
  records[5].command = "echo 'node --test --test-reporter=tap badge.test.mjs'"
  assert.equal(checkReplay(records, result).checks.passingTestsAfterRecovery, false)
})

test('rejects a stale diff and a review summary with no reviewed diff', () => {
  const records = trace()
  records[6].output = finalDiff.replace('>=', '>')
  const verdict = checkReplay(records, result)
  assert.equal(verdict.checks.finalDiffInspectedAfterTests, false)
  assert.equal(verdict.checks.reviewReportedBeforeCompletion, false)
})

test('rejects out-of-scope and post-review source changes', () => {
  assert.equal(checkReplay(trace(), { ...result, finalStatus: ' M badge.mjs\n M badge.test.mjs' }).checks.finalScope, false)
  const verdict = checkReplay(trace(), { ...result, final: { ...final, source: 'edited-again' } })
  assert.equal(verdict.ok, false)
  assert.equal(verdict.checks.passingTestsAfterRecovery, false)
})
