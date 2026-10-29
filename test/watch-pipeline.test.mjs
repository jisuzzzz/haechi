import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { cleanTrace, decide, isInfraFailure, parseArgs } from '../core/tools/watch-pipeline.mjs'

const tool = join(import.meta.dirname, '..', 'core', 'tools', 'watch-pipeline.mjs')
const INFRA_TRACE = 'Fetching changes...\nfatal: unable to access repo: Could not resolve host: git.example.com\n'
const ANSI_TRACE = [
  'section_start:1700000000:step_script\r\x1b[0K\x1b[32;1m$ npm test\x1b[0;m',
  'not ok 1 - formatDate \x1b[31mexpected 2024-01-02\x1b[0m',
  'section_end:1700000001:step_script\r\x1b[0K\x1b[31;1mERROR: Job failed: exit code 1\x1b[0;m',
].join('\n')

// Answers `glab api -X <method> <endpoint>` from scenario.json: each "<METHOD> <endpoint>" key lists responses in
// call order (the last repeats). A response is { json } or { text } or { fail } (stderr + exit 1). Calls go to calls.log.
const FAKE_GLAB = `
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const dir = import.meta.dirname
const [, , method, endpoint] = process.argv.slice(2)
const key = method + ' ' + endpoint
appendFileSync(join(dir, 'calls.log'), key + '\\n')
const countsFile = join(dir, 'counts.json')
const counts = existsSync(countsFile) ? JSON.parse(readFileSync(countsFile, 'utf8')) : {}
const n = counts[key] ?? 0
counts[key] = n + 1
writeFileSync(countsFile, JSON.stringify(counts))
const responses = JSON.parse(readFileSync(join(dir, 'scenario.json'), 'utf8'))[key]
if (!responses) { process.stderr.write('404 Not Found: ' + key); process.exit(1) }
const response = responses[Math.min(n, responses.length - 1)]
if (response.fail) { process.stderr.write(response.fail); process.exit(1) }
process.stdout.write(response.text ?? JSON.stringify(response.json))
`

const jobsRoute = (id, page = 1) => `GET projects/:id/pipelines/${id}/jobs?per_page=100&page=${page}`
const bridgesRoute = (id, page = 1) => `GET projects/:id/pipelines/${id}/bridges?per_page=100&page=${page}`

const runWatch = (scenario, args) => {
  const dir = mkdtempSync(join(tmpdir(), 'haechi-watch-'))
  writeFileSync(join(dir, 'fake-glab.mjs'), FAKE_GLAB)
  // Every watched pipeline has no trigger jobs unless the scenario says otherwise.
  const routes = { ...scenario }
  for (const key of Object.keys(scenario)) {
    const id = key.match(/^GET projects\/:id\/pipelines\/(\d+)$/)?.[1]
    if (id) routes[bridgesRoute(id)] ??= [{ json: [] }]
  }
  writeFileSync(join(dir, 'scenario.json'), JSON.stringify(routes))
  let glab
  if (process.platform === 'win32') {
    glab = join(dir, 'glab.cmd')
    writeFileSync(glab, `@"${process.execPath}" "${join(dir, 'fake-glab.mjs')}" %*\r\n`)
  } else {
    glab = join(dir, 'glab')
    writeFileSync(glab, `#!/bin/sh\nexec "${process.execPath}" "${join(dir, 'fake-glab.mjs')}" "$@"\n`)
    chmodSync(glab, 0o755)
  }
  const run = spawnSync(process.execPath, [tool, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, GLAB: glab, HAECHI_WATCH_POLL_MS: '1', HAECHI_WATCH_BACKOFF_MS: '1', HAECHI_WATCH_APPEAR_MS: '60000' },
  })
  const callsFile = join(dir, 'calls.log')
  const calls = existsSync(callsFile) ? readFileSync(callsFile, 'utf8').trim().split('\n') : []
  rmSync(dir, { recursive: true, force: true })
  return { code: run.status, lines: run.stdout.trim().split(/\r?\n/), stdout: run.stdout, stderr: run.stderr, calls }
}

const mrRoute = 'GET projects/:id/merge_requests/7'
const head = (id, sha) => ({ id, sha, web_url: `https://git.example.com/p/-/pipelines/${id}` })
const openMr = (pipeline) => ({ json: { state: 'opened', head_pipeline: pipeline } })
const job = (id, status, extra = {}) => ({ id, name: 'test', stage: 'test', status, allow_failure: false, web_url: `https://git.example.com/p/-/jobs/${id}`, ...extra })

test('parseArgs: iid with or without !, --sha, and bad input', () => {
  assert.deepEqual(parseArgs(['!42']), { iid: '42', sha: undefined })
  assert.deepEqual(parseArgs(['42', '--sha', 'abc1234def']), { iid: '42', sha: 'abc1234def' })
  assert.match(parseArgs([]).error, /missing/)
  assert.match(parseArgs(['42', '--sha']).error, /--sha/)
  assert.match(parseArgs(['42', '--sha', 'HEAD']).error, /--sha/)
  assert.match(parseArgs(['42', '--verbose']).error, /unknown argument/)
})

test('cleanTrace strips ANSI, section markers, carriage-return overwrites and timestamps, keeping the tail', () => {
  assert.equal(cleanTrace(ANSI_TRACE), '$ npm test\nnot ok 1 - formatDate expected 2024-01-02\nERROR: Job failed: exit code 1')
  assert.equal(cleanTrace('progress 10%\rprogress 100%\n2026-01-01T00:00:00.123456Z 01O done'), 'progress 100%\ndone')
  assert.equal(cleanTrace('a\nb\nc\nd', 2), 'c\nd')
})

test('isInfraFailure matches network and image pull failures only', () => {
  assert.equal(isInfraFailure(INFRA_TRACE), true)
  assert.equal(isInfraFailure('ERROR: Failed to pull image "node:20"'), true)
  assert.equal(isInfraFailure('There appears to be trouble with your network connection. Retrying...'), true)
  assert.equal(isInfraFailure('AssertionError: expected 1 to equal 2'), false)
})

test('decide: real failure first, then exhausted infra, then retry, then pipeline status', () => {
  const pipeline = { id: 1, status: 'running' }
  const infraJob = job(1, 'failed', { name: 'build' })
  const realJob = job(2, 'failed', { name: 'lint' })
  const traces = { 1: INFRA_TRACE, 2: 'eslint: 3 problems' }

  const failed = decide({ pipeline, jobs: [infraJob, realJob], traces, retries: {} })
  assert.equal(failed.action, 'failed')
  assert.equal(failed.job, realJob)
  assert.deepEqual(failed.others, [infraJob])

  assert.deepEqual(decide({ pipeline, jobs: [infraJob], traces, retries: { build: 2 } }), { action: 'retry', jobs: [infraJob] })
  const exhausted = decide({ pipeline, jobs: [infraJob], traces, retries: { build: 3 } })
  assert.equal(exhausted.action, 'give_up')
  assert.match(exhausted.reason, /build infrastructure failure repeated after 3 retries/)

  const allowed = job(3, 'failed', { allow_failure: true })
  assert.deepEqual(decide({ pipeline, jobs: [allowed], traces: {}, retries: {} }), { action: 'wait' })
  assert.deepEqual(decide({ pipeline: { id: 1, status: 'success' }, jobs: [allowed], traces: {}, retries: {} }), { action: 'green' })
  for (const status of ['canceled', 'skipped', 'failed']) {
    assert.equal(decide({ pipeline: { id: 1, status }, jobs: [], traces: {}, retries: {} }).action, 'give_up')
  }
})

test('decide: a failed trigger job is a failure, a manual pipeline gives up naming the blocking job, a scheduled one waits', () => {
  const bridge = job(5, 'failed', { name: 'deploy-docs', downstream_pipeline: { web_url: 'https://git.example.com/docs/-/pipelines/3' } })
  const failed = decide({ pipeline: { id: 1, status: 'failed' }, jobs: [job(1, 'success')], bridges: [bridge], traces: {}, retries: {} })
  assert.deepEqual(failed, { action: 'failed', job: bridge, bridge: true, others: [] })
  const allowedBridge = job(6, 'failed', { allow_failure: true })
  assert.deepEqual(decide({ pipeline: { id: 1, status: 'running' }, jobs: [], bridges: [allowedBridge], traces: {}, retries: {} }), { action: 'wait' })

  const manual = decide({ pipeline: { id: 1, status: 'manual' }, jobs: [job(1, 'success'), job(2, 'manual', { name: 'release' })], traces: {}, retries: {} })
  assert.deepEqual(manual, { action: 'give_up', reason: 'pipeline 1 is manual: waiting for manual job release' })
  // A delayed job (when: delayed) starts by itself once its timer runs out
  const scheduled = decide({ pipeline: { id: 1, status: 'scheduled' }, jobs: [job(3, 'scheduled', { name: 'nightly' })], traces: {}, retries: {} })
  assert.deepEqual(scheduled, { action: 'wait' })
})

test('green pipeline: WATCHING first, GREEN last, exit 0, a transient API error is retried', () => {
  const run = runWatch(
    {
      [mrRoute]: [{ fail: '401 Unauthenticated' }, openMr(head(10, 'abc1234def'))],
      'GET projects/:id/pipelines/10': [{ json: { id: 10, status: 'running' } }, { json: { id: 10, status: 'success', web_url: 'https://git.example.com/p/-/pipelines/10' } }],
      [jobsRoute(10)]: [{ json: [job(1, 'running')] }, { json: [job(1, 'success')] }],
    },
    ['7'],
  )
  assert.equal(run.code, 0, run.stdout + run.stderr)
  assert.match(run.lines[0], /^WATCHING MR !7 pipeline 10 \(abc1234de\)/)
  assert.match(run.lines.at(-1), /^GREEN MR !7 pipeline 10/)
})

test('failed job: exit 1 with FAILED line and a clean trace tail', () => {
  const run = runWatch(
    {
      [mrRoute]: [openMr(head(10, 'abc1234def'))],
      'GET projects/:id/pipelines/10': [{ json: { id: 10, status: 'running', sha: 'abc1234def' } }],
      [jobsRoute(10)]: [{ json: [job(1, 'failed', { failure_reason: 'script_failure' })] }],
      'GET projects/:id/jobs/1/trace': [{ text: ANSI_TRACE }],
    },
    ['7'],
  )
  assert.equal(run.code, 1, run.stdout + run.stderr)
  assert.match(run.lines[0], /^WATCHING/)
  assert.ok(run.lines.includes('FAILED test (job 1, stage test, script_failure)'), run.stdout)
  assert.ok(run.lines.includes('not ok 1 - formatDate expected 2024-01-02'), run.stdout)
  assert.doesNotMatch(run.stdout, /\x1b|section_start/)
})

test('infrastructure failure is retried through the API, then the pipeline goes green', () => {
  const run = runWatch(
    {
      [mrRoute]: [openMr(head(10, 'abc1234def'))],
      'GET projects/:id/pipelines/10': [{ json: { id: 10, status: 'running' } }, { json: { id: 10, status: 'running' } }, { json: { id: 10, status: 'success' } }],
      [jobsRoute(10)]: [{ json: [job(1, 'failed')] }, { json: [job(2, 'pending')] }, { json: [job(2, 'success')] }],
      'GET projects/:id/jobs/1/trace': [{ text: INFRA_TRACE }],
      'POST projects/:id/jobs/1/retry': [{ json: { id: 2 } }],
    },
    ['7'],
  )
  assert.equal(run.code, 0, run.stdout + run.stderr)
  assert.deepEqual(run.calls.filter((call) => call.startsWith('POST')), ['POST projects/:id/jobs/1/retry'])
  assert.ok(run.lines.includes('RETRY test infrastructure failure, retry 1/3'), run.stdout)
  assert.match(run.lines.at(-1), /^GREEN/)
})

test('infrastructure failure after 3 retries gives up with exit 2', () => {
  const run = runWatch(
    {
      [mrRoute]: [openMr(head(10, 'abc1234def'))],
      'GET projects/:id/pipelines/10': [{ json: { id: 10, status: 'running' } }],
      [jobsRoute(10)]: [{ json: [job(1, 'failed')] }],
      'GET projects/:id/jobs/1/trace': [{ text: INFRA_TRACE }],
      'POST projects/:id/jobs/1/retry': [{ json: { id: 1 } }],
    },
    ['7'],
  )
  assert.equal(run.code, 2, run.stdout + run.stderr)
  assert.equal(run.calls.filter((call) => call.startsWith('POST')).length, 3)
  assert.ok(run.lines.includes('GIVE_UP test infrastructure failure repeated after 3 retries'), run.stdout)
})

test('--sha waits past the old head pipeline and never watches it', () => {
  const run = runWatch(
    {
      [mrRoute]: [openMr(head(9, 'a1d0000aaa')), openMr(head(9, 'a1d0000aaa')), openMr(head(11, 'bee1111bbb'))],
      'GET projects/:id/pipelines/11': [{ json: { id: 11, status: 'success' } }],
      [jobsRoute(11)]: [{ json: [] }],
    },
    ['!7', '--sha', 'bee1111bbb'],
  )
  assert.equal(run.code, 0, run.stdout + run.stderr)
  assert.match(run.lines[0], /^WATCHING MR !7 pipeline 11 /)
  assert.equal(run.calls.filter((call) => call === `${mrRoute}`).length, 3)
  assert.ok(!run.calls.some((call) => call.includes('pipelines/9')), run.calls.join('\n'))
})

test('MR no longer open while waiting gives up with exit 2', () => {
  const run = runWatch({ [mrRoute]: [{ json: { state: 'closed', head_pipeline: head(9, 'a1d0000aaa') } }] }, ['7', '--sha', 'bee1111bbb'])
  assert.equal(run.code, 2, run.stdout + run.stderr)
  assert.deepEqual(run.lines, ['GIVE_UP MR !7 is closed'])
})

test('a failure on the second page of jobs is found', () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => job(100 + index, 'success', { name: `unit-${index}` }))
  const run = runWatch(
    {
      [mrRoute]: [openMr(head(10, 'abc1234def'))],
      'GET projects/:id/pipelines/10': [{ json: { id: 10, status: 'failed', sha: 'abc1234def' } }],
      [jobsRoute(10)]: [{ json: firstPage }],
      [jobsRoute(10, 2)]: [{ json: [job(1, 'failed', { name: 'e2e' })] }],
      'GET projects/:id/jobs/1/trace': [{ text: 'not ok 1 - checkout total' }],
    },
    ['7'],
  )
  assert.equal(run.code, 1, run.stdout + run.stderr)
  assert.match(run.stdout, /^FAILED e2e \(job 1,/m)
})

test('a failed trigger job is FAILED with its downstream pipeline and no trace', () => {
  const run = runWatch(
    {
      [mrRoute]: [openMr(head(10, 'abc1234def'))],
      'GET projects/:id/pipelines/10': [{ json: { id: 10, status: 'failed', sha: 'abc1234def' } }],
      [jobsRoute(10)]: [{ json: [job(1, 'success')] }],
      [bridgesRoute(10)]: [{ json: [job(5, 'failed', { name: 'deploy-docs', downstream_pipeline: { web_url: 'https://git.example.com/docs/-/pipelines/3' } })] }],
    },
    ['7'],
  )
  assert.equal(run.code, 1, run.stdout + run.stderr)
  assert.match(run.stdout, /^FAILED deploy-docs \(trigger job 5,/m)
  assert.ok(run.lines.includes('downstream pipeline https://git.example.com/docs/-/pipelines/3'), run.stdout)
  assert.ok(!run.calls.some((call) => call.includes('/trace')), run.calls.join('\n'))
})

test('a pipeline blocked on a manual job gives up at once', () => {
  const run = runWatch(
    {
      [mrRoute]: [openMr(head(10, 'abc1234def'))],
      'GET projects/:id/pipelines/10': [{ json: { id: 10, status: 'manual' } }],
      [jobsRoute(10)]: [{ json: [job(1, 'success'), job(2, 'manual', { name: 'release' })] }],
    },
    ['7'],
  )
  assert.equal(run.code, 2, run.stdout + run.stderr)
  assert.match(run.lines.at(-1), /^GIVE_UP pipeline 10 is manual: waiting for manual job release$/)
})

test('an unexpected error exits 2 with GIVE_UP, never 1', () => {
  const run = runWatch({ [mrRoute]: [{ json: { state: 'opened', head_pipeline: { id: 10 } } }] }, ['7', '--sha', 'abc1234def'])
  assert.equal(run.code, 2, run.stdout + run.stderr)
  assert.match(run.lines.at(-1), /^GIVE_UP unexpected error: /)
})

test('bad arguments exit 2 with usage', () => {
  const run = spawnSync(process.execPath, [tool], { encoding: 'utf8' })
  assert.equal(run.status, 2)
  assert.match(run.stderr, /Usage: node watch-pipeline\.mjs/)
})
