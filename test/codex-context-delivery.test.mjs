import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const plugin = join(import.meta.dirname, '../dist/codex')
const config = JSON.parse(readFileSync(join(plugin, 'hooks/hooks.json'), 'utf8')).hooks
const settings = { commands: { verify: 'npm run verify', testOne: 'node --test {file}' }, forbidden: ['npm test'], testDirs: ['test'], sensitiveData: 'none' }
const tool = join(plugin, 'tools/work-graph.mjs')

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'haechi-codex-delivery-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const data = join(root, 'data')
  const makeRepo = name => {
    const cwd = join(root, name)
    execFileSync('git', ['init', '-q', cwd])
    writeFileSync(join(cwd, '.haechi.json'), JSON.stringify(settings))
    return cwd
  }
  const repo = makeRepo('repo')
  const input = { cwd: repo, session_id: 'first' }
  const invoke = (event, overrides = {}, ordered = false) => {
    const payload = { ...input, ...overrides }
    const commands = config[event].flatMap(group => group.hooks)
    const run = ({ command }) => new Promise((resolve, reject) => {
      const [, ...args] = command.replace('${PLUGIN_ROOT}', plugin).split(' ')
      const child = spawn(process.execPath, args, { cwd: payload.cwd, env: { ...process.env, PLUGIN_DATA: data } })
      let stdout = '', stderr = ''
      child.stdout.on('data', chunk => { stdout += chunk })
      child.stderr.on('data', chunk => { stderr += chunk })
      child.on('error', reject)
      child.on('close', code => {
        try {
          assert.equal(code, 0, stderr)
          resolve(stdout ? JSON.parse(stdout).hookSpecificOutput.additionalContext : undefined)
        } catch (error) { reject(error) }
      })
      child.stdin.end(JSON.stringify(payload))
    })
    if (!ordered) return Promise.all(commands.map(run))
    // The frozen prototype lost both records when its rules command finished last.
    return Promise.all(commands.slice(1).map(run)).then(async rest => [await run(commands[0]), ...rest])
  }
  return { repo, data, makeRepo, invoke }
}

test('Codex delivers changed context and restores all components after compaction or resume', async t => {
  const { repo, makeRepo, invoke } = fixture(t)
  assert.equal(Object.values(config).flatMap(groups => groups.flatMap(group => group.hooks)).length, 8)
  const start = await invoke('UserPromptSubmit', { prompt: '/haechi:feature Keep the output' })
  assert.match(start[0], /Workflow rules/)
  assert.match(start[1], /Keep the output/)
  assert.equal(JSON.parse(start[2].split('\n')[1]).version, 0)
  const silent = [undefined, undefined, undefined]
  assert.deepEqual(await invoke('UserPromptSubmit'), silent)
  assert.deepEqual(await invoke('SessionStart', { source: 'resume' }, true), start)
  assert.deepEqual(await invoke('UserPromptSubmit'), silent)
  assert.deepEqual(await invoke('PostCompact'), [undefined])
  assert.deepEqual(await invoke('UserPromptSubmit'), start)
  assert.deepEqual(await invoke('UserPromptSubmit'), silent)

  const change = await invoke('UserPromptSubmit', { prompt: '/haechi:review Check the output' })
  assert.equal(change[0], undefined)
  assert.match(change[1], /Check the output/)
  assert.equal(change[2], undefined)
  execFileSync(process.execPath, [tool, 'create'], { cwd: repo, input: JSON.stringify({
    expectedVersion: 0, id: 'new-work', title: 'Review shared output', goal: 'Check delivery', acceptance: ['Output preserved'],
  }) })
  const work = await invoke('UserPromptSubmit')
  assert.deepEqual(work.slice(0, 2), [undefined, undefined])
  assert.match(work[2], /new-work/)
  const subagent = await invoke('SubagentStart')
  assert.match(subagent[0], /npm run verify/)
  assert.match(subagent[0], /npm test/)
  assert.deepEqual(await invoke('UserPromptSubmit'), silent)

  const other = makeRepo('other')
  const switched = await invoke('UserPromptSubmit', { cwd: other })
  assert.match(switched[0], /Workflow rules/)
  assert.equal(switched[1], undefined)
  assert.doesNotMatch(switched[2], /new-work/)
  const returned = await invoke('UserPromptSubmit')
  assert.match(returned[0], /Workflow rules/)
  assert.match(returned[1], /Check the output/)
  assert.match(returned[2], /new-work/)
  const fresh = await invoke('UserPromptSubmit', { session_id: 'second' })
  assert.match(fresh[0], /Workflow rules/)
  assert.equal(fresh[1], undefined)
  assert.match(fresh[2], /new-work/)
  assert.deepEqual(await invoke('UserPromptSubmit', { prompt: '/haechi:context clear' }), silent)
  assert.equal((await invoke('SessionStart'))[1], undefined)
})

test('Codex repeats setup warnings and falls back to delivery when the cache is unusable', async t => {
  const { data, repo, invoke } = fixture(t)
  writeFileSync(join(repo, '.haechi.json'), '{}')
  assert.match((await invoke('SessionStart'))[0], /REPO SETUP INCOMPLETE/)
  assert.match((await invoke('UserPromptSubmit'))[0], /REPO SETUP INCOMPLETE/)
  writeFileSync(join(repo, '.haechi.json'), JSON.stringify(settings))
  assert.doesNotMatch((await invoke('UserPromptSubmit'))[0], /REPO SETUP INCOMPLETE/)
  assert.equal((await invoke('UserPromptSubmit'))[0], undefined)

  const delivery = join(data, 'codex-delivery')
  rmSync(delivery, { recursive: true })
  mkdirSync(data, { recursive: true })
  writeFileSync(delivery, 'File instead of cache directory')
  const choice = await invoke('UserPromptSubmit', { prompt: '/haechi:feature Check recovery' })
  assert.ok(choice.every(Boolean))
  assert.deepEqual(await invoke('UserPromptSubmit'), choice)
})
