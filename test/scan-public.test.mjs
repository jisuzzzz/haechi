import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findHits, parsePatterns } from '../scripts/scan-public.mjs'

test('patterns come one per line or comma separated, comments skipped', () => {
  assert.deepEqual(parsePatterns('alpha\n# note\n beta , gamma\n\n'), ['alpha', 'beta', 'gamma'])
})

test('hits are case-insensitive and report only path and line', () => {
  const files = [['a.md', 'ok\nSee Secret-Corp docs\nok'], ['b.md', 'nothing here']]
  const hits = findHits(files, ['secret-corp'])
  assert.deepEqual(hits, ['a.md:2'])
  assert.doesNotMatch(hits.join(), /secret/i)
})

test('clean files give no hits', () => {
  assert.deepEqual(findHits([['a.md', 'public text']], ['internal']), [])
})
