import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { preparePacket } from '../dist/claude/tools/delegate-task.mjs'
import { prepareReturn, publishReturn, recordReturn } from '../dist/claude/tools/delegate-return.mjs'
import { graphPath, readGraph, run } from '../dist/claude/tools/work-graph.mjs'

const sha = text => createHash('sha256').update(text).digest('hex')
const write = (root, path, text) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text) }
const fixture = t => {
  const root = mkdtempSync(join(tmpdir(), 'haechi-graph-return-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const repo = join(root, 'repo'); mkdirSync(repo)
  execFileSync('git', ['init', '-q', repo])
  const contract = { skills: ['check'], principles: [], checks: [], writeScope: 'read-only', contextRequired: ['repository'], completion: ['Check behavior'] }
  write(root, 'skills/review/SKILL.md', '```haechi-handoffs\n' + JSON.stringify({ review: contract }) + '\n```\n')
  write(root, 'skills/check/SKILL.md', 'Inspect executed assertions.\n'); write(root, 'skills/delegate/SKILL.md', 'Return actual evidence.\n')
  write(root, 'repo/src/a', 'final\n')
  write(root, 'principles/work-contract.md', '## Do\nRespect the assigned scope.\n\n## Check\nCheck required outcomes against actual evidence.\n')
  const packet = preparePacket(root, { playbook: 'review', step: 'review', objective: 'Check behavior', context: { repository: repo }, writeScope: 'read-only', ownedPaths: [], artifactPaths: [], constraints: ['No edits'], completion: ['Behavior is correct'] })
  const records = [
    { id: 'read', type: 'command_execution', command: 'cat large-input', output: 'UNNEEDED_FULL_OUTPUT'.repeat(1000), exitCode: 0 },
    { id: 'before', type: 'command_execution', command: 'node repro.mjs', output: 'Expected false; observed true', exitCode: 1 },
    { id: 'after', type: 'command_execution', command: 'node --test test/a.mjs', output: 'tests 5\npass 5\nfail 0', exitCode: 0 },
  ]
  write(root, 'main.json', JSON.stringify({ complete: true, records: [] }))
  write(root, 'worker.json', JSON.stringify({ complete: true, records }))
  const request = { packet, repositoryRoot: repo, sessionId: 'main-1', taskId: 'work', mainTrace: { path: join(root, 'main.json'), format: 'tool-records-v1' }, workerTrace: { path: join(root, 'worker.json'), format: 'tool-records-v1' }, targets: [{ path: 'src/a', before: sha('old\n'), after: sha('final\n') }] }
  const session = { provider: 'codex', sessionId: 'main-1' }
  run(repo, 'create', undefined, { expectedVersion: 0, id: 'work', title: 'Boundary check', goal: 'Check the requested behavior', acceptance: ['Behavior is correct', 'Other consumer is unchanged'], status: 'active', session })
  const handoff = { expectedVersion: 1, session, status: 'active', next: 'Main reviews evidence and scope', observations: [{ criterion: 'Behavior is correct', outcome: 'passed', observed: 'Five assertions passed after the change.', recordIds: ['after'] }] }
  const bundlePath = join(root, 'return.json'); writeFileSync(bundlePath, JSON.stringify(prepareReturn(root, request)))
  return { root, repo, request, handoff, bundlePath, records }
}

test('one publish command validates, stores evidence, updates graph and returns only decision inputs', t => {
  const { root, repo, request, handoff } = fixture(t)
  write(root, 'request.json', JSON.stringify(request)); write(root, 'handoff.json', JSON.stringify(handoff))
  const output = join(root, 'published')
  const p = spawnSync(process.execPath, [new URL('../dist/claude/tools/delegate-return.mjs', import.meta.url).pathname, 'publish', root, join(root, 'request.json'), join(root, 'handoff.json'), output], { encoding: 'utf8' })
  assert.equal(p.status, 0, p.stderr)
  const result = JSON.parse(p.stdout), task = readGraph(repo).tasks[0]
  assert.equal(result.status, 'recorded-pending-main-review'); assert.equal(task.status, 'active')
  assert.equal(result.sessionConnection.state, 'connected')
  assert.deepEqual(result.missingEvidence, ['Other consumer is unchanged'])
  assert.deepEqual(result.checks.map(x => x.recordId), ['before', 'after'])
  assert.match(result.checks[0].output.text, /Expected false/)
  assert.deepEqual(result.execution.nonzeroExits, [{ recordId: 'before', exitCode: 1 }])
  assert.ok(result.execution.excerptedRecords.includes('read'))
  assert.doesNotMatch(p.stdout, /UNNEEDED_FULL_OUTPUT/)
  assert.equal(task.evidence[0].artifact, result.returnReference.path)
  assert.equal(task.evidence[0].revision, `sha256:${sha(readFileSync(result.returnReference.path))}`)
  assert.match(task.evidence[0].observed, /pending main review/)
  assert.equal(readGraph(repo).version, 2)
  assert.equal(readFileSync(join(repo, 'src/a'), 'utf8'), 'final\n')
})

test('recording preserves prior criteria, decisions and artifacts; identical repeat does not advance the graph', t => {
  const { root, repo, request, handoff, bundlePath } = fixture(t)
  const priorPath = join(root, 'previous-proof'); writeFileSync(priorPath, 'Previously verified consumer result\n')
  const old = { criterion: 'Other consumer is unchanged', observed: 'Previously inspected', revision: `sha256:${sha(readFileSync(priorPath))}`, artifact: priorPath }
  run(repo, 'update', 'work', { expectedVersion: 1, decisions: ['Preserve public behavior'], evidence: [old], artifacts: [{ path: priorPath, revision: old.revision }] })
  handoff.expectedVersion = 2
  const a = recordReturn(root, request, bundlePath, handoff), before = readFileSync(graphPath(repo), 'utf8')
  const b = recordReturn(root, request, bundlePath, { ...handoff, expectedVersion: a.version })
  assert.equal(b.changed, false); assert.equal(b.version, a.version)
  assert.equal(readFileSync(graphPath(repo), 'utf8'), before)
  const task = readGraph(repo).tasks[0]
  assert.deepEqual(task.evidence[0], old); assert.deepEqual(task.decisions, ['Preserve public behavior'])
  assert.equal(task.artifacts.length, 2); assert.equal(task.goal, 'Check the requested behavior')
})

test('unknown criteria, missing record references, session mismatch and automatic completion leave graph untouched', t => {
  const { root, repo, request, handoff, bundlePath } = fixture(t), before = readFileSync(graphPath(repo), 'utf8')
  const bad = [
    { ...handoff, status: 'completed' }, { ...handoff, status: 'waiting' },
    { ...handoff, session: { provider: 'codex', sessionId: 'other' } },
    { ...handoff, observations: [{ ...handoff.observations[0], criterion: 'New goal' }] },
    { ...handoff, observations: [{ ...handoff.observations[0], recordIds: ['invented'] }] },
    { ...handoff, observations: [{ ...handoff.observations[0], recordIds: [] }] },
  ]
  for (const value of bad) { assert.throws(() => recordReturn(root, request, bundlePath, value)); assert.equal(readFileSync(graphPath(repo), 'utf8'), before) }
  const gap = { ...handoff, status: 'waiting', reason: 'Missing consumer proof', observations: [{ criterion: 'Behavior is correct', outcome: 'unverified', observed: 'No adequate evidence', recordIds: [] }] }
  assert.equal(recordReturn(root, request, bundlePath, gap).task.status, 'waiting')
})

test('changed targets and raw logs cannot publish stale proof or overwrite graph evidence', t => {
  const { root, repo, request, handoff, bundlePath, records } = fixture(t), before = readFileSync(graphPath(repo), 'utf8')
  write(root, 'repo/src/a', 'changed again'); assert.throws(() => recordReturn(root, request, bundlePath, handoff), /Target changed/)
  write(root, 'repo/src/a', 'final\n'); records[2].output = 'different output'
  write(root, 'worker.json', JSON.stringify({ complete: true, records }))
  assert.throws(() => recordReturn(root, request, bundlePath, handoff), /mismatched/)
  assert.equal(readFileSync(graphPath(repo), 'utf8'), before)
})

test('version conflicts preserve new evidence without retrying or changing a newer graph', t => {
  const { root, repo, request, handoff } = fixture(t)
  run(repo, 'update', 'work', { expectedVersion: 1, next: 'Another update' })
  const before = readFileSync(graphPath(repo), 'utf8'), output = join(root, 'published')
  assert.throws(() => publishReturn(root, request, handoff, output), /Version conflict.*retained/)
  assert.ok(existsSync(join(output, 'return.json')))
  assert.equal(readFileSync(graphPath(repo), 'utf8'), before)
  const original = readFileSync(join(output, 'return.json'), 'utf8')
  assert.throws(() => publishReturn(root, request, { ...handoff, expectedVersion: 2 }, output), /EEXIST/)
  assert.equal(readFileSync(join(output, 'return.json'), 'utf8'), original)
})

test('missing or terminal graph tasks are not created or reopened by a worker return', t => {
  const { root, repo, request, handoff, bundlePath } = fixture(t)
  run(repo, 'update', 'work', { expectedVersion: 1, status: 'cancelled', reason: 'Cancelled by main' })
  assert.throws(() => recordReturn(root, request, bundlePath, { ...handoff, expectedVersion: 2 }), /terminal/)
  const missing = { ...request, taskId: 'absent' }, path = join(root, 'missing.json')
  writeFileSync(path, JSON.stringify(prepareReturn(root, missing)))
  assert.throws(() => recordReturn(root, missing, path, { ...handoff, expectedVersion: 2 }), /Unknown task/)
  assert.equal(readGraph(repo).tasks.length, 1)
})


test('publication retains the release protection against missing earlier evidence', t => {
  const { root, repo, request, handoff } = fixture(t)
  const previous = join(root, 'prior-evidence')
  writeFileSync(previous, 'Original proof\n')
  run(repo, 'update', 'work', { expectedVersion: 1, artifacts: [{ path: previous, revision: `sha256:${sha(readFileSync(previous))}` }] })
  const before = readFileSync(graphPath(repo), 'utf8')
  rmSync(previous)
  assert.throws(() => publishReturn(root, request, { ...handoff, expectedVersion: 2 }, join(root, 'new-proof')), /Unreadable local reference/)
  assert.equal(readFileSync(graphPath(repo), 'utf8'), before)
  assert.ok(existsSync(join(root, 'new-proof/return.json')))
})
