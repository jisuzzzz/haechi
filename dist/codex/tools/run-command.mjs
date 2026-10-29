// Bounded command execution shared by migration and Docker preparation.
// Killing the local process tree cannot cancel detached services or server-side work already started.
import { execFile, spawn } from 'node:child_process'

const active = new Set()
let interruptSignal

const killTree = (child) => new Promise((done) => {
  if (!child.pid) return done()
  if (process.platform === 'win32') {
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { timeout: 5000, killSignal: 'SIGKILL' }, (error) => {
      if (error) child.kill('SIGKILL')
      done(error ? '; process-tree termination could not be confirmed' : undefined)
    })
    return
  }
  try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
  done()
})

const removeSignalHandlers = () => {
  process.removeListener('SIGINT', onInterrupt)
  process.removeListener('SIGTERM', onTerminate)
}
const interrupt = async (signal) => {
  if (interruptSignal) return
  interruptSignal = signal
  const running = [...active]
  // Block command completion callbacks so a caller cannot start its next step during cleanup.
  for (const command of running) command.cancel()
  await Promise.allSettled(running.map(({ child }) => killTree(child)))
  removeSignalHandlers()
  process.kill(process.pid, signal)
}
const onInterrupt = () => { void interrupt('SIGINT') }
const onTerminate = () => { void interrupt('SIGTERM') }

export const runCommand = (command, args, { timeout, stdio = ['ignore', 'pipe', 'pipe'], ...options }) => new Promise((done, reject) => {
  if (!Number.isFinite(timeout) || timeout <= 0) return reject(new Error('command timeout must be a positive number'))
  if (interruptSignal) return reject(new Error(`Command runner interrupted by ${interruptSignal}`))
  const child = spawn(command, args, { ...options, detached: process.platform !== 'win32', stdio })
  let stdout = ''
  let stderr = ''
  let finished = false
  let terminating = false
  const finish = (status, error) => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    child.stdout?.destroy()
    child.stderr?.destroy()
    active.delete(running)
    if (!active.size && !interruptSignal) removeSignalHandlers()
    if (!interruptSignal) done({ status, stdout, stderr, ...(error && { error }) })
  }
  const terminate = (message) => {
    if (finished || terminating) return
    terminating = true
    clearTimeout(timer)
    killTree(child).then((warning) => finish(null, message + (warning ?? '')))
  }
  const timer = setTimeout(() => terminate(`Command timed out after ${timeout} ms`), timeout)
  const running = { child, cancel: () => { terminating = true; clearTimeout(timer) } }
  if (!active.size) {
    process.on('SIGINT', onInterrupt)
    process.on('SIGTERM', onTerminate)
  }
  active.add(running)
  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (chunk) => {
    stdout += chunk
    if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 1024 * 1024) terminate('Command output exceeded 1 MiB')
  })
  child.stderr?.on('data', (chunk) => {
    stderr += chunk
    if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 1024 * 1024) terminate('Command output exceeded 1 MiB')
  })
  child.on('error', (error) => { if (!terminating) finish(null, error.message) })
  child.on('close', (status, signal) => { if (!terminating) finish(status, signal ? `Command terminated by ${signal}` : undefined) })
})
