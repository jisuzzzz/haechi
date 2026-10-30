#!/usr/bin/env node
// Watches a GitLab merge request's pipeline until it has a result, then exits. Run it in the background so its exit
// wakes the session. Run inside the repo: glab resolves host and project from the git remote (the `:id` placeholder).
// Usage: node watch-pipeline.mjs <mr-iid> [--sha <commit>]
// With --sha it waits for that commit's pipeline (right after a push the MR still points at the old one).
// Output lines start with WATCHING (pipeline found), then one of GREEN · FAILED <job> (+ trace tail) · GIVE_UP <reason>.
// Exit 0 green · 1 first failed job that is not allow_failure · 2 gave up or bad arguments.
// Env: GLAB (binary, default glab); HAECHI_WATCH_POLL_MS, HAECHI_WATCH_APPEAR_MS, HAECHI_WATCH_TIMEOUT_MS,
// HAECHI_WATCH_BACKOFF_MS override the poll interval, the wait for the pipeline, the overall limit and the API backoff.
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const INFRA_RETRY_MAX = 3
const API_ATTEMPTS = 4
const TRACE_TAIL_LINES = 80
const USAGE = 'Usage: node watch-pipeline.mjs <mr-iid> [--sha <commit>]'
// GitLab's own job retry rules miss these: a DNS failure while fetching sources is recorded as script_failure.
const INFRA_PATTERNS = [
  /Could not resolve host/,
  /Timeout while contacting DNS/,
  /There appears to be trouble with your network connection/,
  /failed to pull image/i,
]
const STOPPED_STATUSES = ['canceled', 'skipped', 'failed']
// `scheduled` is not here: a delayed job starts by itself when its timer runs out
const BLOCKED_STATUSES = ['manual']
const PAGE_SIZE = 100

class GiveUp extends Error {
  constructor(lines) {
    super(lines[0])
    this.lines = lines
  }
}

export const parseArgs = (argv) => {
  let iid
  let sha
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--sha') {
      sha = argv[++i]
      if (!/^[0-9a-f]{7,40}$/i.test(sha ?? '')) return { error: '--sha needs a commit hash' }
    } else if (!iid && /^!?\d+$/.test(arg)) iid = arg.replace('!', '')
    else return { error: `unknown argument: ${arg}` }
  }
  return iid ? { iid, sha } : { error: 'missing <mr-iid>' }
}

// Strips ANSI colors, GitLab section markers, carriage-return overwrites and timestamp prefixes; keeps the last lines.
export const cleanTrace = (trace, lines = TRACE_TAIL_LINES) =>
  trace
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/section_(start|end):\d+:[^\r\n]*?\r/g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^.*\r/, '').replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z \S+ ?/, ''))
    .slice(-lines)
    .join('\n')

export const isInfraFailure = (trace) => INFRA_PATTERNS.some((pattern) => pattern.test(trace))

const isBlockingFailure = (job) => job.status === 'failed' && !job.allow_failure

// One poll step. bridges are trigger jobs (downstream pipelines); traces holds the trace of every failed job;
// retries counts infra retries per job name. A real failure wins over infra failures: the session can fix it.
export const decide = ({ pipeline, jobs, bridges = [], traces, retries }) => {
  const failed = jobs.filter(isBlockingFailure)
  const failedBridges = bridges.filter(isBlockingFailure)
  const infra = failed.filter((job) => isInfraFailure(traces[job.id] ?? ''))
  const real = failed.find((job) => !infra.includes(job))
  const allFailed = [...failed, ...failedBridges]
  if (real) return { action: 'failed', job: real, others: allFailed.filter((job) => job !== real) }
  if (failedBridges.length > 0) {
    const bridge = failedBridges[0]
    return { action: 'failed', job: bridge, bridge: true, others: allFailed.filter((job) => job !== bridge) }
  }
  const exhausted = infra.find((job) => (retries[job.name] ?? 0) >= INFRA_RETRY_MAX)
  if (exhausted) {
    return { action: 'give_up', job: exhausted, reason: `${exhausted.name} infrastructure failure repeated after ${INFRA_RETRY_MAX} retries` }
  }
  if (infra.length > 0) return { action: 'retry', jobs: infra }
  // A pipeline blocked on a manual job never finishes by itself.
  if (BLOCKED_STATUSES.includes(pipeline.status)) {
    const blocker = [...jobs, ...bridges].find((job) => job.status === pipeline.status)
    return { action: 'give_up', reason: `pipeline ${pipeline.id} is ${pipeline.status}: waiting for ${pipeline.status} job ${blocker?.name ?? '(not found)'}` }
  }
  if (pipeline.status === 'success') return { action: 'green' }
  // Interruptible pipelines are canceled when a newer push arrives on the same MR.
  if (STOPPED_STATUSES.includes(pipeline.status)) {
    return { action: 'give_up', reason: `pipeline ${pipeline.id} ${pipeline.status} without a failed job; after a newer push, watch that sha` }
  }
  return { action: 'wait' }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const envMs = (name, fallback) => Number(process.env[name]) || fallback
const runFile = promisify(execFile)

const readConfig = () => ({
  glab: process.env.GLAB || 'glab',
  pollMs: envMs('HAECHI_WATCH_POLL_MS', 20_000),
  appearMs: envMs('HAECHI_WATCH_APPEAR_MS', 10 * 60_000),
  timeoutMs: envMs('HAECHI_WATCH_TIMEOUT_MS', 60 * 60_000),
  backoffMs: envMs('HAECHI_WATCH_BACKOFF_MS', 3_000),
})

// glab api sometimes answers Unauthenticated or a network error once and succeeds right after.
const glabApi = async (config, endpoint, { method = 'GET', raw = false } = {}) => {
  // Node refuses to spawn .cmd/.bat files on Windows without a shell.
  const shell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(config.glab)
  // Through cmd.exe an unquoted & in a query string would split the command.
  const quote = (value) => (shell ? `"${value}"` : value)
  let lastError
  for (let attempt = 1; attempt <= API_ATTEMPTS; attempt++) {
    try {
      const { stdout } = await runFile(quote(config.glab), ['api', '-X', method, quote(endpoint)], { maxBuffer: 64 * 1024 * 1024, shell })
      return raw ? stdout : JSON.parse(stdout)
    } catch (error) {
      lastError = error
      if (attempt < API_ATTEMPTS) await sleep(attempt * config.backoffMs)
    }
  }
  const detail = String(lastError?.stderr || lastError?.message || lastError).trim().split('\n')[0]
  throw new GiveUp([
    `GIVE_UP glab api ${endpoint} failed ${API_ATTEMPTS} times: ${detail}`,
    'If it keeps saying 401 or Unauthenticated, the token expired: run glab auth login.',
  ])
}

const fetchAllPages = async (config, endpoint) => {
  const items = []
  for (let page = 1; ; page++) {
    const batch = await glabApi(config, `${endpoint}?per_page=${PAGE_SIZE}&page=${page}`)
    items.push(...batch)
    if (batch.length < PAGE_SIZE) return items
  }
}

// MR sha is the source branch head; head_pipeline.sha can instead be a temporary merged-results commit.
const sourceHead = (mr, iid) => {
  const sha = mr.sha || mr.diff_refs?.head_sha
  if (!sha) throw new GiveUp([`GIVE_UP MR !${iid} source head is unavailable; cannot verify pipeline freshness`])
  return sha
}

const staleHead = (iid, expected, current) => new GiveUp([
  `GIVE_UP stale MR !${iid} source head changed from ${expected} to ${current}; restart watching the latest head`,
])

const checkSourceHead = async (config, iid, expected) => {
  const mr = await glabApi(config, `projects/:id/merge_requests/${iid}`)
  const current = sourceHead(mr, iid)
  if (current !== expected) throw staleHead(iid, expected, current)
}

const findPipeline = async (config, iid, sha, startedAt) => {
  for (;;) {
    const mr = await glabApi(config, `projects/:id/merge_requests/${iid}`)
    const head = mr.head_pipeline
    const mergedResults = head?.ref === `refs/merge-requests/${iid}/merge`
    if (head && (!sha || head.sha.startsWith(sha) || mergedResults)) {
      const sourceSha = sourceHead(mr, iid)
      if (sha && !sourceSha.startsWith(sha)) {
        if (head.sha.startsWith(sha)) throw staleHead(iid, sha, sourceSha)
      } else if (head.sha === sourceSha) return { head, sourceSha }
      else if (mergedResults) {
        // The merge ref alone can still point at the previous source head's temporary commit.
        const commit = await glabApi(config, `projects/:id/repository/commits/${head.sha}`)
        if (!Array.isArray(commit.parent_ids)) {
          throw new GiveUp([`GIVE_UP unverified MR !${iid} pipeline ${head.id}: merge commit parents are unavailable`])
        }
        if (commit.parent_ids.includes(sourceSha)) return { head, sourceSha }
      }
    }
    if (mr.state !== 'opened') throw new GiveUp([`GIVE_UP MR !${iid} is ${mr.state}`])
    if (Date.now() - startedAt > config.appearMs) {
      throw new GiveUp([`GIVE_UP no pipeline for ${sha ?? 'the MR head'} on MR !${iid} within ${Math.round(config.appearMs / 60_000)} min; check that it was pushed`])
    }
    await sleep(config.pollMs)
  }
}

export const watch = async ({ iid, sha }, config = readConfig(), print = console.log) => {
  const startedAt = Date.now()
  const { head, sourceSha } = await findPipeline(config, iid, sha, startedAt)
  const pipelineId = head.id
  print(`WATCHING MR !${iid} pipeline ${pipelineId} (${head.sha.slice(0, 9)}) ${head.web_url ?? ''}`.trimEnd())
  const retries = {}
  for (;;) {
    if (Date.now() - startedAt > config.timeoutMs) {
      return { code: 2, lines: [`GIVE_UP pipeline ${pipelineId} still running after ${Math.round(config.timeoutMs / 60_000)} min`] }
    }
    const pipeline = await glabApi(config, `projects/:id/pipelines/${pipelineId}`)
    // Without include_retried GitLab lists only the latest attempt per job name, so a retried old failure drops out.
    const jobs = await fetchAllPages(config, `projects/:id/pipelines/${pipelineId}/jobs`)
    // Trigger jobs are not in the jobs list; their failure is in the downstream pipeline, which has its own jobs.
    const bridges = await fetchAllPages(config, `projects/:id/pipelines/${pipelineId}/bridges`)
    const traces = {}
    for (const job of jobs.filter(isBlockingFailure)) {
      traces[job.id] = await glabApi(config, `projects/:id/jobs/${job.id}/trace`, { raw: true })
    }
    // A push can supersede this pipeline while the poll's API reads are in flight.
    await checkSourceHead(config, iid, sourceSha)
    const step = decide({ pipeline, jobs, bridges, traces, retries })
    if (step.action === 'green') return { code: 0, lines: [`GREEN MR !${iid} pipeline ${pipelineId} ${pipeline.web_url ?? ''}`.trimEnd()] }
    if (step.action === 'failed') {
      const { job, others } = step
      const lines = [
        `FAILED ${job.name} (${step.bridge ? 'trigger job' : 'job'} ${job.id}, stage ${job.stage}, ${job.failure_reason ?? 'unknown reason'})`,
        `pipeline ${pipelineId} sha ${pipeline.sha}`,
        `other failed jobs: ${others.map((other) => other.name).join(', ') || 'none'}`,
        job.web_url ?? '',
      ]
      if (step.bridge) lines.push(`downstream pipeline ${job.downstream_pipeline?.web_url ?? '(not created)'}`)
      else lines.push(`--- last ${TRACE_TAIL_LINES} trace lines ---`, cleanTrace(traces[job.id]))
      return { code: 1, lines }
    }
    if (step.action === 'give_up') {
      const lines = [`GIVE_UP ${step.reason}`]
      if (step.job) lines.push(step.job.web_url ?? '', '', cleanTrace(traces[step.job.id]))
      return { code: 2, lines }
    }
    if (step.action === 'retry') {
      for (const job of step.jobs) {
        await checkSourceHead(config, iid, sourceSha)
        retries[job.name] = (retries[job.name] ?? 0) + 1
        print(`RETRY ${job.name} infrastructure failure, retry ${retries[job.name]}/${INFRA_RETRY_MAX}`)
        await glabApi(config, `projects/:id/jobs/${job.id}/retry`, { method: 'POST' })
      }
    }
    await sleep(config.pollMs)
  }
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  if (args.error) {
    console.error(`${args.error}\n${USAGE}`)
    process.exitCode = 2
    return
  }
  let result
  try {
    result = await watch(args)
  } catch (error) {
    // Exit 1 means a failed job, so any other error must exit 2.
    result = error instanceof GiveUp ? { code: 2, lines: error.lines } : { code: 2, lines: [`GIVE_UP unexpected error: ${error?.message ?? error}`] }
  }
  for (const line of result.lines) console.log(line)
  process.exitCode = result.code
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
