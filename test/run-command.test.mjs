import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { runCommand } from '../core/tools/run-command.mjs'

test('captures stdout, stderr and the actual failure status', async () => {
  const result = await runCommand(process.execPath, ['-e', 'process.stdout.write("out");process.stderr.write("err");process.exit(3)'], { timeout: 1000 })
  assert.equal(result.status, 3)
  assert.equal(result.stdout, 'out')
  assert.equal(result.stderr, 'err')
})

test('concurrent commands remove their signal handlers after normal completion', async () => {
  const signals = ['SIGINT', 'SIGTERM']
  const before = signals.map((signal) => process.listenerCount(signal))
  const results = await Promise.all([0, 1, 2].map(() => runCommand(process.execPath, ['-e', 'setTimeout(()=>{},20)'], { timeout: 1000 })))
  assert.deepEqual(results.map(({ status }) => status), [0, 0, 0])
  assert.deepEqual(signals.map((signal) => process.listenerCount(signal)), before)
})

test('inherited streams work without capture and missing executables fail visibly', async () => {
  const inherited = await runCommand(process.execPath, ['-e', 'process.exit(0)'], { timeout: 1000, stdio: 'inherit' })
  assert.equal(inherited.status, 0)
  assert.equal(inherited.stdout, '')
  assert.equal(inherited.stderr, '')
  const missing = await runCommand('haechi-nonexistent-executable', [], { timeout: 1000 })
  assert.equal(missing.status, null)
  assert.match(missing.error, /ENOENT|not found/i)
  await assert.rejects(runCommand(process.execPath, [], { timeout: 0 }), /timeout/)
})

test('captured output is bounded and excessive output fails instead of hanging', async () => {
  const result = await runCommand(process.execPath, ['-e', 'setInterval(()=>process.stdout.write("a".repeat(65536)),1)'], { timeout: 1000 })
  assert.equal(result.status, null)
  assert.match(result.error, /output exceeded/)
})

test('timeout terminates shell descendants before they can perform a delayed write', { skip: process.platform === 'win32' }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'haechi-command-timeout-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const child = join(root, 'child.cjs')
  const parent = join(root, 'parent.cjs')
  const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`
  writeFileSync(child, `require('node:fs').writeFileSync('child.pid',String(process.pid));setTimeout(()=>require('node:fs').writeFileSync('escaped','yes'),600);setInterval(()=>{},100);`)
  writeFileSync(parent, `require('node:child_process').spawn(process.execPath,[${JSON.stringify(child)}],{stdio:'inherit'});setInterval(()=>{},100);`)
  const result = await runCommand(`${shellQuote(process.execPath)} ${shellQuote(parent)}`, [], { cwd: root, shell: true, timeout: 300 })
  assert.equal(result.status, null)
  assert.match(result.error, /timed out/)
  assert.ok(existsSync(join(root, 'child.pid')), 'the grandchild actually ran before timeout')
  await new Promise((done) => setTimeout(done, 650))
  assert.equal(existsSync(join(root, 'escaped')), false, 'the grandchild must not continue after its shell times out')
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`${signal} on the caller kills every active command tree and preserves its signal exit`, { skip: process.platform === 'win32', timeout: 5000 }, async (t) => {
    const root = mkdtempSync(join(tmpdir(), 'haechi-command-signal-'))
    const child = join(root, 'child.cjs')
    const parent = join(root, 'parent.cjs')
    const wrapper = join(root, 'wrapper.mjs')
    const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`
    writeFileSync(child, `const fs=require('node:fs');const name=process.argv[2];fs.writeFileSync(name+'.ready',String(process.pid));setTimeout(()=>fs.writeFileSync(name+'.escaped','yes'),600);`)
    writeFileSync(parent, `require('node:child_process').spawn(process.execPath,[${JSON.stringify(child)},process.argv[2]],{stdio:'inherit'});`)
    const helper = new URL('../core/tools/run-command.mjs', import.meta.url).href
    const command = `${shellQuote(process.execPath)} ${shellQuote(parent)}`
    writeFileSync(wrapper, `import {runCommand} from ${JSON.stringify(helper)};await Promise.all(['one','two'].map(name=>runCommand(${JSON.stringify(command)}+' '+name,[],{shell:true,timeout:5000})));`)
    const caller = spawn(process.execPath, [wrapper], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    t.after(() => {
      if (caller.exitCode === null && caller.signalCode === null) caller.kill('SIGKILL')
      for (const name of ['one', 'two']) {
        if (existsSync(join(root, `${name}.ready`))) {
          try { process.kill(Number(readFileSync(join(root, `${name}.ready`), 'utf8')), 'SIGKILL') } catch {}
        }
      }
      rmSync(root, { recursive: true, force: true })
    })
    const exited = new Promise((done, reject) => {
      caller.once('error', reject)
      caller.once('exit', (code, exitSignal) => done({ code, signal: exitSignal }))
    })
    const deadline = Date.now() + 3000
    while (!['one', 'two'].every((name) => existsSync(join(root, `${name}.ready`))) && Date.now() < deadline) {
      await new Promise((done) => setTimeout(done, 10))
    }
    assert.ok(['one', 'two'].every((name) => existsSync(join(root, `${name}.ready`))), 'both command descendants started')
    caller.kill(signal)
    assert.deepEqual(await exited, { code: null, signal })
    await new Promise((done) => setTimeout(done, 650))
    for (const name of ['one', 'two']) {
      assert.equal(existsSync(join(root, `${name}.escaped`)), false, `${name} must stop when the calling process receives ${signal}`)
    }
  })
}
