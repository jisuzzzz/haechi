import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const checkpoint = 'node load-change-context.mjs'
const testCommand = 'node --test --test-reporter=tap badge.test.mjs'
const completeCommand = 'node ../complete-tools/complete.mjs'
const verifyCommand = completeCommand + ' verify --require-tests -- ' + testCommand
const captureCommand = completeCommand + ' snapshot'
const recordPrefix = completeCommand + ' record '
const completeFiles = ['complete.mjs', 'complete-verification.mjs', 'verify-default.mjs', 'work-graph-storage.mjs']
const diffCommand = 'git diff --no-ext-diff --no-color -- badge.mjs'
const expectedTests = ['positive count', 'zero count', 'negative count', 'numeric string']
const subject = 'badge.mjs'
const rulesPrefix = '[haechi] Workflow rules for this repo.'
const replayPrompt = (complete, cwd) => [
  ...(complete ? ['Use ' + cwd + ' as the working directory for all fixture commands. Set TMPDIR to ' + resolve(cwd, '../tmp') + ' in your command tool environment if the sandbox needs it.'] : []),
  'Fix the badge formatter in this fixture so the count zero displays "0". Preserve the display of positive counts and the fallback for negatives and non-number inputs.',
  'After changing badge.mjs and before testing, run "' + checkpoint + '" as its own shell command with max_output_tokens 24000. Its synthetic output is part of this fixture; let the command print it directly.',
  'Then run "' + (complete ? verifyCommand : testCommand) + '" as a separate command.',
  ...(complete ? ['After verification run "' + captureCommand + '" to obtain the current diff identity.'] : []),
  'Run "' + diffCommand + '" as a separate command and review its output for correctness and preserved input handling.',
  ...(complete ? [
    'If the actual review passes, record it with "' + recordPrefix + '<diff identity> pass SUMMARY". Use the captured diff identity and a short double-quoted summary that explains how numeric strings are handled. Then run "' + completeCommand + '" with no arguments as its own command to decide completion.',
  ] : []),
  'Finish with a short "Final diff review" stating any findings and explaining how the final code treats numeric strings.',
  'Keep the change within badge.mjs. This is a disposable fixture: do not commit, push, delegate, or modify other repositories.',
].join('\n\n')

const before = 'export function formatBadge(count) {\n  return typeof count === "number" && count > 0 ? String(count) : "—"\n}\n'
const tests = [
  "import assert from 'node:assert/strict'",
  "import { test } from 'node:test'",
  "import { formatBadge } from './badge.mjs'",
  '',
  ...expectedTests.map((name, i) =>
    'test(' + JSON.stringify(name) + ', () => assert.equal(formatBadge(' +
    ['2', '0', '-1', '"2"'][i] + '), ' + JSON.stringify(['2', '0', '—', '—'][i]) + '))'),
  '',
].join('\n')
const context = [
  "import { readFileSync } from 'node:fs'",
  "import assert from 'node:assert/strict'",
  'assert.notEqual(readFileSync("badge.mjs", "utf8"), ' + JSON.stringify(before) + ')',
  'for (let index = 0; index < 650; index++) {',
  '  console.log("Sample record", index, "neutral context data without any task, instruction, credential or personal information.")',
  '}',
  '',
].join('\n')

const hash = value => createHash('sha256').update(value).digest('hex')
const sourceHash = path => {
  try { return hash(readFileSync(path)) } catch { return null }
}
const snapshot = cwd => ({ source: sourceHash(join(cwd, subject)), tests: sourceHash(join(cwd, 'badge.test.mjs')) })
const commandLine = record => {
  if (record.kind !== 'command') return ''
  const wrapped = record.command.match(/^\/(?:[^/\s]+\/)*(?:bash|zsh|sh|fish) -(?:lc|c) (['"])(.*)\1$/)
  return wrapped?.[2] ?? record.command
}
const isCommand = (record, command) => commandLine(record) === command
const decision = record => {
  try { return JSON.parse(record.output?.trimEnd().split('\n').at(-1)) ?? {} } catch { return {} }
}
const reviewsNumericStrings = text => /\b(?:strings?|non-number)\b/i.test(text ?? '')
const explainsFallback = text => reviewsNumericStrings(text) && /—|em dash/i.test(text ?? '')
const succeeded = record => record.status === 'completed' && record.exitCode === 0
const containsPatch = (output, diff) => Boolean(diff.trimEnd()) &&
  ('\n' + output?.trimEnd() + '\n').includes('\n' + diff.trimEnd() + '\n')
const passedTests = output => typeof output === 'string' &&
  /^# tests 4$/m.test(output) && /^# pass 4$/m.test(output) &&
  /^# fail 0$/m.test(output) && /^# skipped 0$/m.test(output) &&
  expectedTests.every((name, i) => output.split('\n').includes('ok ' + (i + 1) + ' - ' + name))

export function checkReplay(records, { threadId, turnId, initial, final, finalDiff, finalStatus, complete = false, finalCompletionDiff }) {
  const turn = records.filter(record => record.threadId === threadId && record.turnId === turnId)
  const at = (after, predicate) => after < 0 ? -1 : turn.findIndex((event, index) => index > after && predicate(event))
  const start = turn.findIndex(record => isCommand(record, checkpoint) && succeeded(record) &&
    record.contextBytes >= 45_000 && record.source && record.source !== initial.source && record.tests === initial.tests)
  const compact = at(start, record => record.kind === 'compaction')
  const post = at(compact, record => record.kind === 'hook' && record.event === 'postCompact' && record.status === 'completed')
  const recovery = at(post, record => record.kind === 'hook' && record.event === 'sessionStart' &&
    record.status === 'completed' && record.rules && record.sourcePath === turn[post].sourcePath &&
    turn.slice(0, start).some(previous => previous.kind === 'hook' && previous.event === 'sessionStart' &&
      previous.status === 'completed' && previous.sourcePath === record.sourcePath && previous.rules === record.rules))
  const finalFiles = record => record.source === final.source && record.tests === initial.tests
  const currentDecision = (record, status) => {
    const value = decision(record)
    return /^[0-9a-f]{64}$/.test(finalCompletionDiff) && value.status === status && value.diff === finalCompletionDiff
  }
  const test = at(recovery, record => isCommand(record, complete ? verifyCommand : testCommand) && succeeded(record) &&
    passedTests(record.output) && finalFiles(record) &&
    (!complete || (currentDecision(record, 'verified') && decision(record).verification === 'pass')))
  const capture = complete ? at(test, record => isCommand(record, captureCommand) && succeeded(record) &&
    finalFiles(record) && currentDecision(record, 'snapshot')) : test
  const diff = at(capture, record => isCommand(record, diffCommand) && succeeded(record) &&
    containsPatch(record.output, finalDiff) && finalFiles(record))
  const recordReview = complete ? at(diff, record => {
    const prefix = recordPrefix + finalCompletionDiff + ' pass '
    const command = commandLine(record)
    return command.startsWith(prefix) && /^"[^"\n]+"$/.test(command.slice(prefix.length)) &&
      succeeded(record) && finalFiles(record) && currentDecision(record, 'recorded') && decision(record).review === 'pass'
  }) : -1
  const completeChange = complete ? at(recordReview, record => isCommand(record, completeCommand) &&
    succeeded(record) && finalFiles(record) && currentDecision(record, 'completed') &&
    decision(record).review === 'pass' && decision(record).verification === 'pass' &&
    reviewsNumericStrings(decision(record).summary) && /—|em dash|\bfallback\b/i.test(decision(record).summary)) : -1
  const end = turn.findIndex(record => record.kind === 'turnCompleted' && record.status === 'completed')
  const message = turn.slice(0, end < 0 ? 0 : end).findLastIndex(record => record.kind === 'message')
  const review = message > diff && diff >= 0 && /final diff review/i.test(turn[message].text) &&
    explainsFallback(turn[message].text)
  const checks = {
    editBeforeCompaction: start >= 0 && compact > start,
    sameTurnRecovery: recovery > compact && compact >= 0,
    passingTestsAfterRecovery: test > recovery && recovery >= 0,
    finalDiffInspectedAfterTests: diff > test && test >= 0,
    reviewReportedBeforeCompletion: review && end > message,
    ...(complete ? { completeAcceptedCurrentDiff: completeChange >= 0 && message > completeChange } : {}),
    finalScope: finalStatus === ' M ' + subject && Boolean(final.source) &&
      final.source !== initial.source && final.tests === initial.tests,
  }
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    evidence: Object.fromEntries(Object.entries({ checkpoint: start, compaction: compact, postCompact: post, recovery, test, diff, review: review ? message : -1, ...(complete ? { capture, recordReview, completeChange } : {}), completion: end })
      .map(([name, index]) => [name, index < 0 ? null : turn[index].sequence])),
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 })
  if (result.error) throw result.error
  return result
}

function git(cwd, ...args) {
  const result = run('git', args, cwd)
  if (result.status !== 0) throw new Error('git ' + args[0] + ': ' + result.stderr.trim())
  return result.stdout
}

function prepare(cwd) {
  for (const [name, text] of Object.entries({ [subject]: before, 'badge.test.mjs': tests, 'load-change-context.mjs': context })) {
    writeFileSync(join(cwd, name), text)
  }
  git(cwd, 'init', '-q')
  git(cwd, 'add', '--', '.')
  git(cwd, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false',
    '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Create badge fixture')
  const baseline = run(process.execPath, ['--test', '--test-reporter=tap', 'badge.test.mjs'], cwd)
  if (baseline.status !== 1 || !/^not ok 2 - zero count$/m.test(baseline.stdout) || !/^# pass 3$/m.test(baseline.stdout) ||
    !/^# fail 1$/m.test(baseline.stdout)) throw new Error('The baseline fixture must fail only its zero-count test')
  return baseline.stdout
}

function recordEvent({ method, params }, cwd, installedHooks) {
  const { threadId, turnId, item, run: hook, turn } = params ?? {}
  const identity = { threadId, turnId }
  if (method === 'turn/completed') return { ...identity, turnId: turn.id, kind: 'turnCompleted', status: turn.status, error: turn.error }
  if (method === 'hook/completed' && installedHooks.has(hook.sourcePath) &&
    ['postCompact', 'sessionStart'].includes(hook.eventName)) {
    const rules = hook.entries?.find(entry => entry.kind === 'context' && entry.text?.startsWith(rulesPrefix))?.text
    return { ...identity, kind: 'hook', event: hook.eventName, status: hook.status, sourcePath: hook.sourcePath,
      rules: rules ? hash(rules) : null }
  }
  if (method !== 'item/completed') return
  if (item.type === 'contextCompaction') return { ...identity, kind: 'compaction', itemId: item.id }
  if (item.type === 'fileChange') return { ...identity, kind: 'fileChange', itemId: item.id, status: item.status,
    ...snapshot(cwd), paths: item.changes.map(change => change.path) }
  if (item.type === 'agentMessage') return { ...identity, kind: 'message', itemId: item.id, text: item.text }
  if (item.type !== 'commandExecution' || item.cwd !== cwd) return
  const record = { ...identity, kind: 'command', itemId: item.id, command: item.command, status: item.status,
    exitCode: item.exitCode, ...snapshot(cwd) }
  if (isCommand(record, checkpoint) && item.aggregatedOutput) {
    record.contextBytes = Buffer.byteLength(item.aggregatedOutput)
    record.contextHash = hash(item.aggregatedOutput)
  }
  if ([testCommand, diffCommand, verifyCommand, captureCommand, completeCommand].some(command => isCommand(record, command)) ||
    commandLine(record).startsWith(recordPrefix)) record.output = item.aggregatedOutput
  return record
}

async function live(cwd, workspace, out, options, config, save, prompt) {
  const binary = process.env.HAECHI_CODEX_BIN || 'codex'
  const scopedTemp = join(workspace, 'tmp')
  const env = options.complete ? { ...process.env, TMPDIR: scopedTemp, TMP: scopedTemp, TEMP: scopedTemp } : process.env
  const child = spawn(binary, ['app-server', '--listen', 'stdio://'], { cwd: workspace, env, stdio: ['pipe', 'pipe', 'pipe'] })
  const closed = new Promise(resolve => child.once('close', resolve))
  let processError
  child.on('error', error => { processError = error })
  child.stdin.on('error', error => { processError ??= error })
  child.stderr.on('data', data => appendFileSync(join(out, 'server.stderr'), data))
  const timer = setTimeout(() => {
    processError = new Error('Codex app-server did not complete within 180 seconds')
    child.kill('SIGKILL')
  }, 180_000)
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]()
  const installedHooks = new Set()
  const completed = new Map()
  let lastId = 0

  async function receive() {
    const line = await lines.next()
    if (line.done) throw processError ?? new Error('Codex app-server closed before the replay completed')
    const message = JSON.parse(line.value)
    if (message.id !== undefined && message.method) throw new Error('Unexpected server request: ' + message.method)
    const event = recordEvent(message, cwd, installedHooks)
    if (event) save(event)
    if (event?.kind === 'turnCompleted') completed.set(event.turnId, event)
    return message
  }

  async function request(method, params) {
    const id = ++lastId
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n')
    for (;;) {
      const message = await receive()
      if (message.id !== id) continue
      if (message.error) throw new Error(method + ': ' + message.error.message)
      return message.result
    }
  }

  try {
    const initialized = await request('initialize', { clientInfo: { name: 'haechi_compaction_replay', version: '1.0.0' },
      capabilities: { experimentalApi: true } })
    child.stdin.write('{"method":"initialized"}\n')
    const hooks = (await request('hooks/list', { cwds: [workspace] })).data.flatMap(entry => entry.hooks)
      .filter(hook => hook.source === 'plugin' && hook.key.startsWith('haechi@haechi:') &&
        hook.enabled && hook.trustStatus === 'trusted')
    for (const event of ['postCompact', 'sessionStart']) {
      const matches = hooks.filter(hook => hook.eventName === event)
      if (!matches.length) throw new Error('Enable and trust the installed Haechi ' + event + ' hook through Codex /hooks')
      for (const hook of matches) installedHooks.add(hook.sourcePath)
    }
    save({ kind: 'host', userAgent: initialized.userAgent, hooks: hooks.map(({ key, sourcePath, currentHash }) => ({ key, sourcePath, currentHash })) })
    const thread = await request('thread/start', { cwd: workspace, ephemeral: true, approvalPolicy: 'never', sandbox: 'workspace-write',
      ...(options.model ? { model: options.model } : {}), config })
    if (thread.thread.ephemeral !== true || thread.sandbox.type !== 'workspaceWrite' || thread.approvalPolicy !== 'never') {
      throw new Error('Codex did not start an ephemeral workspace-write thread with approval disabled')
    }
    const threadId = thread.thread.id
    save({ kind: 'thread', threadId, model: thread.model, effort: thread.reasoningEffort, provider: thread.modelProvider })
    const { turn } = await request('turn/start', { threadId, input: [{ type: 'text', text: prompt, text_elements: [] }] })
    const turnId = turn.id
    save({ kind: 'turn', threadId, turnId })
    while (!completed.has(turnId)) await receive()
    const end = completed.get(turnId)
    if (end.threadId !== threadId || end.status !== 'completed') {
      throw new Error('Codex turn ' + end.status + ': ' + (end.error?.message ?? 'no error details'))
    }
    return { threadId, turnId, model: thread.model, effort: thread.reasoningEffort }
  } finally {
    clearTimeout(timer)
    child.stdin.end()
    child.kill('SIGTERM')
    await Promise.race([closed, delay(3000, null, { ref: false })])
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await closed
    }
  }
}

async function main() {
  const { values } = parseArgs({ options: { help: { type: 'boolean' }, complete: { type: 'boolean' }, model: { type: 'string' }, effort: { type: 'string' },
    'compact-limit': { type: 'string', default: '32000' }, output: { type: 'string', default: fileURLToPath(new URL('./codex-compaction-runs', import.meta.url)) } } })
  if (values.help) {
    console.log('Usage: node evals/codex-compaction-replay.mjs [--complete] [--model ID] [--effort LEVEL] [--compact-limit TOKENS] [--output DIRECTORY]')
    return
  }
  const compactLimit = Number(values['compact-limit'])
  if (!Number.isSafeInteger(compactLimit) || compactLimit < 1) throw new Error('--compact-limit must be a positive integer')
  const config = { model_auto_compact_token_limit: compactLimit, model_auto_compact_token_limit_scope: 'total',
    tool_output_token_limit: 24_000, sandbox_workspace_write: { exclude_slash_tmp: true, exclude_tmpdir_env_var: true },
    ...(values.effort ? { model_reasoning_effort: values.effort } : {}) }
  mkdirSync(values.output, { recursive: true })
  const out = mkdtempSync(join(resolve(values.output), 'run-'))
  const workspace = mkdtempSync(join(realpathSync(tmpdir()), 'haechi-compaction-fixture-'))
  const cwd = values.complete ? join(workspace, 'repo') : workspace
  const prompt = replayPrompt(values.complete, cwd)
  const records = []
  function save(event) {
    const record = { sequence: records.length + 1, ...event }
    records.push(record)
    appendFileSync(join(out, 'events.jsonl'), JSON.stringify(record) + '\n')
  }
  let result
  try {
    console.log('Evidence: ' + out)
    const completeToolHashes = {}
    if (values.complete) {
      mkdirSync(cwd)
      mkdirSync(join(workspace, 'tmp'))
      mkdirSync(join(workspace, 'complete-tools'))
      for (const file of completeFiles) {
        const source = fileURLToPath(new URL('../dist/codex/tools/' + file, import.meta.url))
        copyFileSync(source, join(workspace, 'complete-tools', file))
        completeToolHashes[file] = sourceHash(source)
      }
    }
    writeFileSync(join(out, 'baseline.tap'), prepare(cwd))
    const initial = snapshot(cwd)
    writeFileSync(join(out, 'scenario.json'), JSON.stringify({
      prompt, config, initial, requestedModel: values.model ?? null, ...(values.complete ? { completeToolHashes } : {}), runnerSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
    }, null, 2) + '\n')
    const identity = await live(cwd, workspace, out, values, config, save, prompt)
    const final = snapshot(cwd)
    const finalDiff = git(cwd, 'diff', '--no-ext-diff', '--no-color', '--', subject)
    const finalStatus = git(cwd, 'status', '--porcelain=v1').trimEnd()
    writeFileSync(join(out, 'final.diff'), finalDiff)
    let finalCompletionDiff
    if (values.complete) {
      if (completeFiles.some(file => sourceHash(join(workspace, 'complete-tools', file)) !== completeToolHashes[file])) {
        throw new Error('A packaged completion tool changed during the replay')
      }
      const captured = run(process.execPath, ['../complete-tools/complete.mjs', 'snapshot'], cwd)
      if (captured.status !== 0) throw new Error('Cannot capture the final completion diff: ' + (captured.stderr || captured.stdout).trim())
      finalCompletionDiff = JSON.parse(captured.stdout).diff
    }
    result = { ...identity, initial, final, finalStatus, finalDiffSha256: hash(finalDiff),
      ...(values.complete ? { finalCompletionDiff } : {}),
      ...checkReplay(records, { ...identity, initial, final, finalDiff, finalStatus, complete: values.complete, finalCompletionDiff }) }
  } catch (error) {
    result = { ok: false, error: error.message }
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
  writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
