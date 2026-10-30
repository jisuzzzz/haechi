// Aggregates supplied behavior judgments; never runs a model, edits guidance or adopts a change.
// Exit 0: supported; 2: rejected/inconclusive; 1: invalid input.
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const requireThat = (condition, message) => { if (!condition) throw new Error(message) }
const text = (value) => typeof value === 'string' && value.trim().length > 0
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const variants = ['baseline', 'candidate']
const key = (caseId, trial, variant) => JSON.stringify([caseId, trial, variant])
const label = (run) => `${run.caseId} trial ${run.trial} ${run.variant}`

const validatePlan = (plan) => {
  requireThat(object(plan), 'plan must be an object')
  for (const name of ['hypothesis', 'conditions']) requireThat(text(plan[name]), `plan needs ${name}`)
  for (const name of variants) {
    requireThat(typeof plan[name] === 'string' && /^(git:[a-f0-9]{40}|sha256:[a-f0-9]{64})$/i.test(plan[name]), `${name} must identify an immutable git commit or sha256 snapshot`)
  }
  requireThat(plan.baseline.toLowerCase() !== plan.candidate.toLowerCase(), 'baseline and candidate must differ')
  requireThat(Number.isSafeInteger(plan.trials) && plan.trials >= 2, 'plan needs at least two trials per side and case')
  requireThat(Array.isArray(plan.cases) && plan.cases.length > 0, 'plan needs cases')
  const ids = new Set()
  for (const item of plan.cases) {
    requireThat(object(item) && text(item.id), 'each case needs an id')
    requireThat(!ids.has(item.id), `duplicate case ${item.id}`)
    ids.add(item.id)
    requireThat(['target', 'regression'].includes(item.kind), `${item.id}: kind must be target or regression`)
    requireThat(text(item.task), `${item.id}: task is required`)
    requireThat(Array.isArray(item.criteria) && item.criteria.length > 0 && item.criteria.every(text), `${item.id}: criteria are required`)
  }
  for (const kind of ['target', 'regression']) requireThat(plan.cases.some((item) => item.kind === kind), `plan needs a ${kind} case`)
}

const compare = (plan, results, planSha256, evidenceDir) => {
  requireThat(object(results) && Array.isArray(results.runs), 'results need a runs array')
  requireThat(results.planSha256 === planSha256, 'plan hash differs from the one recorded before execution')
  const ids = new Set(plan.cases.map((item) => item.id))
  const rows = new Map()
  for (const run of results.runs) {
    requireThat(object(run) && ids.has(run.caseId), 'run names an unknown case')
    requireThat(Number.isSafeInteger(run.trial) && run.trial >= 1 && run.trial <= plan.trials, `${run.caseId}: trial is outside the plan`)
    requireThat(variants.includes(run.variant), `${run.caseId}: unknown variant`)
    requireThat(['pass', 'fail', 'blocked', 'not-run'].includes(run.outcome), `${run.caseId}: unknown outcome`)
    requireThat(text(run.reason), `${label(run)}: judgment reason is required`)
    const id = key(run.caseId, run.trial, run.variant)
    requireThat(!rows.has(id), `duplicate run ${label(run)}`)
    rows.set(id, run)
  }
  const gaps = []
  const completed = new Map()
  const artifacts = new Map()
  for (const item of plan.cases) {
    for (let trial = 1; trial <= plan.trials; trial++) {
      for (const variant of variants) {
        const id = key(item.id, trial, variant)
        const run = rows.get(id)
        const name = `${item.id} trial ${trial} ${variant}`
        if (!run) { gaps.push(`${name}: missing`); continue }
        if (['blocked', 'not-run'].includes(run.outcome)) { gaps.push(`${name}: ${run.outcome} (${run.reason})`); continue }
        if (!text(run.evidence)) { gaps.push(`${name}: missing evidence path`); continue }
        const path = resolve(evidenceDir, run.evidence)
        let bytes, identity
        try {
          bytes = readFileSync(path)
          requireThat(bytes.toString('utf8').trim().length > 0, 'empty artifact')
          const stat = statSync(path, { bigint: true })
          identity = `${stat.dev}:${stat.ino}`
        } catch (error) {
          gaps.push(`${name}: unreadable or empty evidence (${error.message})`)
          continue
        }
        const previous = artifacts.get(identity)
        if (previous) {
          gaps.push(`${name}: evidence reused from ${label(previous)}`)
          completed.delete(key(previous.caseId, previous.trial, previous.variant))
          continue
        }
        artifacts.set(identity, run)
        completed.set(id, { ...run, evidenceSha256: digest(bytes) })
      }
    }
  }
  const improvedCases = plan.cases.filter((item) => item.kind === 'target' &&
    Array.from({ length: plan.trials }, (_, i) => i + 1).every((trial) =>
      completed.get(key(item.id, trial, 'baseline'))?.outcome === 'fail' && completed.get(key(item.id, trial, 'candidate'))?.outcome === 'pass',
    ),
  ).map((item) => item.id)
  const failures = [...completed.values()].filter((run) => run.variant === 'candidate' && run.outcome === 'fail')
  const verdict = gaps.length ? 'inconclusive' : failures.length ? 'rejected' : improvedCases.length ? 'supported' : 'inconclusive'
  return {
    verdict, planSha256, baseline: plan.baseline, candidate: plan.candidate,
    expectedRuns: plan.cases.length * plan.trials * 2, completedRuns: completed.size,
    improvedCases, failures, gaps, runs: [...completed.values()],
    limit: 'Aggregates supplied judgments and readable artifacts; does not prove a model ran, validate the judgments, or authorize adoption. Repeated cases do not establish a general improvement.',
  }
}

const main = () => {
  try {
    const args = process.argv.slice(2)
    if (args.length === 2 && args[0] === '--hash') {
      const bytes = readFileSync(args[1])
      validatePlan(JSON.parse(bytes.toString('utf8')))
      console.log(digest(bytes))
      return
    }
    const json = args.includes('--json')
    const files = args.filter((arg) => arg !== '--json')
    requireThat(files.length === 2 && files.every((arg) => !arg.startsWith('--')) && args.length === (json ? 3 : 2), 'expected a plan and results file')
    const bytes = readFileSync(files[0])
    const plan = JSON.parse(bytes.toString('utf8'))
    validatePlan(plan)
    const results = JSON.parse(readFileSync(files[1], 'utf8'))
    const report = compare(plan, results, digest(bytes), dirname(resolve(files[1])))
    if (json) console.log(JSON.stringify(report, null, 2))
    else {
      console.log(`eval-report: ${report.verdict} (${report.completedRuns}/${report.expectedRuns} evidence-backed judgments)`)
      console.log(`Repeated target improvements: ${report.improvedCases.join(', ') || 'none'}`)
      for (const run of report.failures) console.log(`Failed: ${label(run)} — ${run.reason}`)
      for (const gap of report.gaps) console.log(`Gap: ${gap}`)
      console.log(report.limit)
    }
    process.exitCode = report.verdict === 'supported' ? 0 : 2
  } catch (error) {
    console.error(`eval-report: ${error.message}`)
    console.error('usage: node eval-report.mjs <plan.json> <results.json> [--json] | --hash <plan.json>')
    process.exitCode = 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
