// Read host-owned tool records and bind a compact return to one packet/session.
// Integrity checks are not execution authentication or semantic acceptance.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, realpathSync, existsSync, writeFileSync } from 'node:fs'
import { resolve, relative, isAbsolute, sep, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderPacket } from './delegate-task.mjs'
import { run as workGraph } from './work-graph.mjs'

import type { Packet } from './delegate-task.mjs'
import type { Session, Task } from './work-graph.mjs'

interface TraceReference { path: string; format: 'codex-jsonl' | 'tool-records-v1' }
interface FileChange { path: string; kind: string }
type ToolRecord = { id: string; type: 'command_execution'; command: string; output: string; exitCode: number; changes?: never }
  | { id: string; type: 'file_change'; changes: FileChange[]; command?: never; output?: never; exitCode?: never }
interface RawEvent { type: string; item?: { id: string; type: string; command: string; aggregated_output: string; exit_code: number; changes: FileChange[] } }
interface ReturnRequest {
  repositoryRoot: string; packet: Packet; sessionId: string; taskId: string; mainTrace: TraceReference; workerTrace: TraceReference
  targets: { path: string; before: string | null; after: string | null }[]
}
interface Handoff {
  expectedVersion: number; session: Session; status: 'active' | 'waiting'; reason?: string; next: string
  observations: { criterion: string; outcome: 'passed' | 'failed' | 'unverified' | 'needs-decision'; observed: string; recordIds: string[] }[]
}
type ReturnBundle = ReturnType<typeof prepareReturn>

const hash = (x: import('node:crypto').BinaryLike) => createHash('sha256').update(x).digest('hex')
const canonical = (x: unknown) => JSON.stringify(x, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)
const required = (x: unknown, key: string) => { if (typeof x !== 'string' || !x.trim()) throw new Error(`Missing ${key}`); return x }
const inside = (root: string, path: string, missing = false) => {
  if (isAbsolute(path) || path.split(/[\\/]/).some(p => !p || p === '.' || p === '..')) throw new Error(`Invalid target: ${path}`)
  const full = resolve(root, path)
  let parent = full
  if (missing) while (!existsSync(parent)) parent = dirname(parent)
  const real = missing ? resolve(realpathSync(parent), relative(parent, full)) : realpathSync(full), rel = relative(root, real)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Outside root: ${path}`)
  return real
}
const source = (path: string) => {
  required(path, 'trace path')
  const full = realpathSync(path), bytes = readFileSync(full)
  if (!bytes.length || bytes.length > 16 * 1024 * 1024) throw new Error('Missing or oversized trace')
  return { path: full, sha256: hash(bytes), text: bytes.toString('utf8') }
}
function records(ref: TraceReference) {
  const s = source(ref.path)
  let rows: ToolRecord[]
  if (ref.format === 'codex-jsonl') {
    const events: RawEvent[] = s.text.trim().split('\n').map(line => JSON.parse(line))
    if (!events.some(e => e.type === 'turn.completed')) throw new Error('Incomplete execution trace')
    rows = events.filter(e => e.type === 'item.completed' && ['command_execution','file_change'].includes(e.item?.type!)).map(({ item: i }) => ({ id: i!.id, type: i!.type, ...(i!.type === 'command_execution' ? { command: i!.command, output: i!.aggregated_output, exitCode: i!.exit_code } : { changes: i!.changes }) })) as ToolRecord[]
  } else if (ref.format === 'tool-records-v1') {
    const data = JSON.parse(s.text)
    if (data.complete !== true || !Array.isArray(data.records)) throw new Error('Incomplete normalized host records')
    rows = data.records
  } else throw new Error('Unsupported trace format; use a host adapter, not a worker summary')
  const ids = new Set()
  for (const r of rows) {
    required(r.id, 'record id')
    if (ids.has(r.id)) throw new Error('Duplicate record id')
    ids.add(r.id)
    if (r.type === 'command_execution') {
      required(r.command, 'executed command')
      if (typeof r.output !== 'string' || !Number.isInteger(r.exitCode)) throw new Error('Missing command output or exit status')
    } else if (r.type !== 'file_change' || !Array.isArray(r.changes)) throw new Error('Invalid observed tool record')
  }
  return { source: { path: s.path, sha256: s.sha256 }, rows }
}
const excerpt = (text: string, max = 1800) => text.length <= max ? { text, truncated: false } : { text: text.slice(0, max / 2) + '\n[excerpt; use record reference for complete output]\n' + text.slice(-max / 2), truncated: true }

export function prepareReturn(pluginRoot: string, request: ReturnRequest) {
  // This input must be constructed by the trusted caller from observed records,
  // not accepted as a worker-created proof manifest.
  const root = realpathSync(pluginRoot), repository = realpathSync(request.repositoryRoot)
  renderPacket(root, request.packet)
  const binding = { sessionId: required(request.sessionId, 'main session id'), taskId: required(request.taskId, 'task id'), repository, packetSha256: request.packet.packetSha256 }
  const main = records(request.mainTrace), worker = records(request.workerTrace)
  if (!worker.rows.length) throw new Error('Missing worker execution evidence')
  const targets = request.targets
  if (!Array.isArray(targets) || !targets.length) throw new Error('Missing observed target versions')
  const seen = new Set()
  for (const t of targets) {
    if (seen.has(t.path)) throw new Error('Duplicate target')
    seen.add(t.path)
    for (const key of ['before','after'] as const) if (t[key] !== null && !/^[a-f0-9]{64}$/.test(t[key] ?? '')) throw new Error(`Missing target ${key} hash`)
    if (t.before === null && t.after === null) throw new Error('Target never existed')
    const path = inside(repository, t.path, t.after === null)
    const actual = existsSync(path) ? hash(readFileSync(path)) : null
    if (actual !== t.after) throw new Error(`Target changed after execution: ${t.path}`)
  }
  const paths = [...new Set(['skills/delegate/SKILL.md', request.packet.playbookSource.path, ...request.packet.assets.map(a => a.path)])]
  const guidance = []
  for (const path of paths) {
    const text = readFileSync(inside(root, path), 'utf8')
    const read = main.rows.find(r => r.type === 'command_execution' && r.exitCode === 0 && r.output.replaceAll('\r\n','\n').includes(text.replaceAll('\r\n','\n').trim()))
    if (read) guidance.push({ path, sha256: hash(text), recordId: read.id })
  }
  const result = {
    version: 1, binding, sources: { main: main.source, worker: worker.source }, targets,
    guidanceReuse: { status: guidance.length ? 'same-session-source-match' : 'no-complete-read-observed', files: guidance,
      rule: 'Reuse only if these previously read bodies remain in this same main task context. Changed scope, source, session or lost/compacted context requires reading the affected guidance. This receipt proves neither comprehension nor compliance.' },
    evidence: worker.rows.map(r => r.type === 'command_execution' ? { id: r.id, command: excerpt(r.command, 1200), exitCode: r.exitCode, output: excerpt(r.output), outputSha256: hash(r.output), reference: { source: 'worker', recordId: r.id } } : { id: r.id, type: r.type, changes: r.changes, reference: { source: 'worker', recordId: r.id } }),
    acceptance: 'Integrity only; not a behavior pass. Verify assertions, required outcomes, final target versions and ownership. Record ordering includes edits: a before-change failure is not final proof. No-tests, missing/truncated proof, failed commands or mismatches remain gaps until checked. Open a referenced record only when its excerpt is insufficient; do not search unrelated folders for logs.'
  }
  const bundle = { ...result, returnSha256: hash(canonical(result)) }
  if (Buffer.byteLength(JSON.stringify(bundle)) > 64 * 1024) throw new Error('Return exceeds 64 KiB; narrow the handoff without silently dropping evidence')
  return bundle
}

export function checkReturn(pluginRoot: string, request: ReturnRequest, bundle: ReturnBundle) {
  const expected = prepareReturn(pluginRoot, request)
  if (canonical(expected) !== canonical(bundle)) throw new Error('Stale or mismatched return, guidance, scope, session or evidence')
  return { status: 'integrity-checked-not-semantic-pass', returnSha256: bundle.returnSha256, packetSha256: bundle.binding.packetSha256, guidanceReuse: bundle.guidanceReuse }
}

// Optional publication for an existing shared task. Claims remain pending main review.
// No new task, stage, dispatcher, hook, completion decision or transcript copy is created.
export function recordReturn(pluginRoot: string, request: ReturnRequest, bundlePath: string, handoff: Handoff) {
  const saved = source(bundlePath), bundle = JSON.parse(saved.text) as ReturnBundle
  checkReturn(pluginRoot, request, bundle)
  if (!handoff || typeof handoff !== 'object' || Array.isArray(handoff)) throw new Error('Missing handoff')
  for (const key of Object.keys(handoff)) if (!['expectedVersion','session','status','reason','next','observations'].includes(key)) throw new Error(`Unknown handoff field: ${key}`)
  if (!handoff.session || handoff.session.sessionId !== bundle.binding.sessionId || !['codex','claude'].includes(handoff.session.provider)) throw new Error('Handoff requires the original main native session')
  if (!['active','waiting'].includes(handoff.status)) throw new Error('A returned task must remain active or waiting until main review')
  required(handoff.next, 'next action')
  if (handoff.status === 'waiting') required(handoff.reason, 'blocker')
  const current = workGraph(bundle.binding.repository, 'show', bundle.binding.taskId) as { version: number; task: Task }
  if (handoff.expectedVersion !== current.version) throw new Error('Version conflict: read the current work graph before recording the handoff')
  const task = current.task
  if (['completed','cancelled'].includes(task.status)) throw new Error('Do not reopen a terminal task through a worker return')
  if (!Array.isArray(handoff.observations) || !handoff.observations.length) throw new Error('Missing criterion observations')
  const seen = new Set(), revision = `sha256:${saved.sha256}`
  const updates = handoff.observations.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(k => !['criterion','outcome','observed','recordIds'].includes(k))) throw new Error('Invalid criterion observation')
    if (!task.acceptance.includes(item.criterion) || seen.has(item.criterion)) throw new Error('Observation must identify one existing acceptance criterion exactly once')
    seen.add(item.criterion)
    if (!['passed','failed','unverified','needs-decision'].includes(item.outcome)) throw new Error('Unknown reported outcome')
    required(item.observed, 'observed result')
    if (item.observed.length > 1200) throw new Error('Keep observed results compact; retain detail in the referenced evidence')
    if (!Array.isArray(item.recordIds) || new Set(item.recordIds).size !== item.recordIds.length || item.recordIds.some(id => !bundle.evidence.some(e => e.id === id))) throw new Error('Unknown or duplicate observed record reference')
    if (['passed','failed'].includes(item.outcome) && !item.recordIds.length) throw new Error('Reported pass/failure requires observed record references')
    return { criterion: item.criterion, observed: `Reported ${item.outcome}; pending main review. ${item.observed}\nRecords: ${item.recordIds.join(', ') || '(none; evidence gap)'}`, revision, artifact: saved.path }
  })
  const evidence = [...task.evidence.filter(e => !seen.has(e.criterion)), ...updates]
  const artifacts = [...(task.artifacts ?? []).filter(a => a.path !== saved.path), { path: saved.path, revision }]
  const patch = { status: handoff.status, reason: handoff.reason ?? '', next: handoff.next, evidence, artifacts }
  const selectedIds = new Set(handoff.observations.flatMap(item => item.recordIds))
  const selectedRecords = bundle.evidence.filter(e => selectedIds.has(e.id) || (Number.isInteger(e.exitCode) && e.exitCode !== 0))
  const compact = (version: number, sessionConnection: unknown, changed: boolean) => ({
    status: 'recorded-pending-main-review', changed, version, sessionConnection,
    task: { id: task.id, title: task.title, goal: task.goal, acceptance: task.acceptance, status: patch.status, ...(patch.reason ? { reason: patch.reason } : {}), next: patch.next },
    evidence: evidence.map(({ criterion, observed, revision, artifact }) => ({ criterion, observed: excerpt(observed, 1200), revision, ...(artifact ? { artifact } : {}) })),
    missingEvidence: task.acceptance.filter(c => !evidence.some(e => e.criterion === c)),
    returnReference: { path: saved.path, revision, returnSha256: bundle.returnSha256 },
    checks: selectedRecords.map(e => e.type === 'file_change' ? { recordId: e.id, type: e.type, changes: e.changes } : {
      recordId: e.id, command: excerpt(e.command.text, 240), exitCode: e.exitCode, output: excerpt(e.output.text, 480),
      sourceExcerpted: e.command.truncated || e.output.truncated,
    }),
    execution: { recordCount: bundle.evidence.length, nonzeroExits: bundle.evidence.filter(e => Number.isInteger(e.exitCode) && e.exitCode !== 0).map(e => ({ recordId: e.id, exitCode: e.exitCode })), excerptedRecords: bundle.evidence.filter(e => e.command?.truncated || e.output?.truncated).map(e => e.id) },
    acceptance: 'Recorded claims, not semantic verification. Check relevant evidence and final versions before main completion. Nonzero exits may be before-change reproductions; do not hide or automatically accept them.'
  })
  // Bound the coordinator view before any mutation; never truncate the task contract.
  if (Buffer.byteLength(JSON.stringify(compact(current.version, undefined, false))) > 64 * 1024) throw new Error('Handoff summary exceeds 64 KiB; narrow the task')
  const sameSession = (task.sessions ?? []).some(s => canonical(s) === canonical(handoff.session))
  if (sameSession && Object.entries(patch).every(([key, value]) => canonical(task[key as keyof Task] ?? (key === 'reason' ? '' : undefined)) === canonical(value))) {
    return compact(current.version, { state: 'connected', session: handoff.session }, false)
  }
  const result = workGraph(bundle.binding.repository, 'update', task.id, { expectedVersion: handoff.expectedVersion, session: handoff.session, ...patch })
  return compact(result.version, (result as { sessionConnection?: unknown }).sessionConnection, true)
}

// One host call: inspect raw records, assemble proof, save it, update the existing
// graph and return only decision inputs. No intermediate full bundle is printed.
export function publishReturn(pluginRoot: string, request: ReturnRequest, handoff: Handoff, outputDirectory: string) {
  required(outputDirectory, 'new evidence directory')
  const bundle = prepareReturn(pluginRoot, request)
  const directory = resolve(outputDirectory), path = resolve(directory, 'return.json')
  mkdirSync(directory)
  writeFileSync(path, JSON.stringify(bundle, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  try { return recordReturn(pluginRoot, request, path, handoff) }
  catch (error) { throw new Error(`${(error as Error).message}; prepared evidence retained at ${path}. No automatic retry.`) }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, root, input, saved, handoff, ...extra] = process.argv.slice(2)
    if (!['prepare','check','record','publish'].includes(mode) || !root || !input || extra.length || (mode !== 'prepare') !== Boolean(saved) || ['record','publish'].includes(mode) !== Boolean(handoff)) throw new Error('Usage: delegate-return.mjs prepare ROOT HOST_REQUEST_JSON | check ROOT HOST_REQUEST_JSON RETURN_JSON | record ROOT HOST_REQUEST_JSON RETURN_JSON HANDOFF_JSON | publish ROOT HOST_REQUEST_JSON HANDOFF_JSON NEW_EVIDENCE_DIR')
    const request = JSON.parse(readFileSync(input, 'utf8'))
    const result = mode === 'prepare' ? prepareReturn(root, request)
      : mode === 'publish' ? publishReturn(root, request, JSON.parse(readFileSync(saved!, 'utf8')), handoff!)
      : mode === 'record' ? recordReturn(root, request, saved!, JSON.parse(readFileSync(handoff!, 'utf8')))
      : checkReturn(root, request, JSON.parse(readFileSync(saved!, 'utf8')))
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } catch (error) { process.stderr.write(`${(error as Error).message}\n`); process.exitCode = 1 }
}
