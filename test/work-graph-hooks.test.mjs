import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildFiles, loadSource } from '../build/build.mjs'

test('both packaged hosts discover shared work without claiming it or changing existing hooks', (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'haechi-graph-hooks-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const repo = join(root, 'repo')
  assert.equal(spawnSync('git', ['init', '-q', repo]).status, 0)
  const dist = join(root, 'dist')
  for (const [path, text] of buildFiles(loadSource(join(import.meta.dirname, '..')))) {
    mkdirSync(join(dist, path, '..'), { recursive: true })
    writeFileSync(join(dist, path), text)
  }
  const invoke = (host, event) => {
    const plugin = join(dist, host)
    const config = JSON.parse(readFileSync(join(plugin, 'hooks/hooks.json'), 'utf8'))
    const commands = config.hooks[event].flatMap((group) => group.hooks)
    assert.ok(commands.some((hook) => hook.command.includes('skill-context.mjs')))
    const hooks = commands.filter((hook) => hook.command.includes('work-graph-context.mjs'))
    assert.equal(hooks.length, 1)
    const command = hooks[0].command.replace(/\$\{(?:CLAUDE_)?PLUGIN_ROOT\}/g, plugin)
    const [node, ...args] = command.split(' ')
    assert.equal(node, 'node')
    const result = spawnSync(process.execPath, args, {
      cwd: repo, input: JSON.stringify({ cwd: repo, session_id: 'new-session' }), encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout ? JSON.parse(result.stdout).hookSpecificOutput : undefined
  }
  for (const host of ['codex', 'claude']) {
    for (const event of ['SessionStart', 'UserPromptSubmit']) {
      const output = invoke(host, event)
      assert.ok(output?.additionalContext, 'A new Git repository needs a recording decision hint')
      const snapshot = JSON.parse(output.additionalContext.split('\n')[1])
      assert.equal(snapshot.totalTasks, 0)
      assert.equal(snapshot.version, 0)
      assert.deepEqual(snapshot.currentSession, { provider: host, sessionId: 'new-session' })
      assert.deepEqual(snapshot.tasks, [])
    }
  }
  assert.equal(existsSync(join(repo, '.git/haechi')), false, 'discovery does not initialize storage')
  const created = spawnSync(process.execPath, [join(dist, 'codex/tools/work-graph.mjs'), 'create'], {
    cwd: repo, encoding: 'utf8', input: JSON.stringify({ expectedVersion: 0, id: 'resume-me', title: 'Continue formatting', goal: 'Preserve template fields', acceptance: ['Fields preserved'], next: 'Read template artifact before editing' }),
  })
  assert.equal(created.status, 0, created.stderr)
  const completed = spawnSync(process.execPath, [join(dist, 'codex/tools/work-graph.mjs'), 'create'], {
    cwd: repo, encoding: 'utf8', input: JSON.stringify({ expectedVersion: 1, id: 'old-result', title: 'Verified contract', goal: 'Share result', acceptance: ['Contract checked'], status: 'completed', evidence: [{ criterion: 'Contract checked', command: 'fixture check', expected: 'matches', observed: 'matches', revision: 'v1' }] }),
  })
  assert.equal(completed.status, 0, completed.stderr)
  const path = join(repo, '.git/haechi/work-graph.json')
  const graph = JSON.parse(readFileSync(path, 'utf8'))
  graph.tasks.find(task => task.id === 'resume-me').updatedAt = '2000-01-01T00:00:00Z'
  writeFileSync(path, JSON.stringify(graph))
  const before = readFileSync(path, 'utf8')
  for (const host of ['codex', 'claude']) {
    for (const event of ['SessionStart', 'UserPromptSubmit']) {
      const output = invoke(host, event)
      assert.equal(output.hookEventName, event)
      assert.match(output.additionalContext, /resume-me/)
      const snapshot = JSON.parse(output.additionalContext.split('\n')[1])
      assert.deepEqual(snapshot.tasks.map(task => [task.id, task.needsAttention]), [['resume-me', true]])
      assert.equal(snapshot.archivedTasks, 1)
      assert.equal(snapshot.attentionTasks, 1)
      assert.ok(output.additionalContext.includes(join(dist, host, 'tools/work-graph.mjs')))
      assert.equal(readFileSync(path, 'utf8'), before, 'hooks never change or claim a record')
    }
    const shown = spawnSync(process.execPath, [join(dist, host, 'tools/work-graph.mjs'), 'show', 'old-result'], { cwd: repo, encoding: 'utf8' })
    assert.equal(shown.status, 0, shown.stderr)
    assert.equal(JSON.parse(shown.stdout).task.archived, true)
    assert.deepEqual(JSON.parse(shown.stdout).task.evidence, graph.tasks.find(task => task.id === 'old-result').evidence)
  }
  for (const host of ['codex', 'claude']) {
    const snapshot = JSON.parse(invoke(host, 'UserPromptSubmit').additionalContext.split('\n')[1])
    const input = { expectedVersion: JSON.parse(readFileSync(path)).version, id: `identity-${host}`, title: 'Identity', goal: 'Link current session', acceptance: ['Linked'], session: snapshot.currentSession }
    const result = spawnSync(process.execPath, [join(dist, host, 'tools/work-graph.mjs'), 'create'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CODEX_THREAD_ID: 'inherited-wrong-session' }, input: JSON.stringify(input) })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout).task.sessions, [snapshot.currentSession])
    assert.equal(JSON.parse(result.stdout).sessionConnection.state, 'connected')
  }
  const missingClaude = spawnSync(process.execPath, [join(dist, 'claude/tools/work-graph.mjs'), 'update', 'identity-claude'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CODEX_THREAD_ID: 'inherited-wrong-session' }, input: JSON.stringify({ expectedVersion: JSON.parse(readFileSync(path)).version, next: 'No hook identity supplied' }) })
  assert.equal(missingClaude.status, 0, missingClaude.stderr)
  assert.equal(JSON.parse(missingClaude.stdout).sessionConnection.state, 'unavailable')
  assert.deepEqual(JSON.parse(missingClaude.stdout).task.sessions, [{ provider: 'claude', sessionId: 'new-session' }])
  writeFileSync(path, '{broken')
  for (const host of ['codex', 'claude']) {
    const output = invoke(host, 'UserPromptSubmit')
    assert.match(output.additionalContext, /unavailable/i)
    assert.equal(readFileSync(path, 'utf8'), '{broken', 'corruption is not replaced with empty data')
  }
})
