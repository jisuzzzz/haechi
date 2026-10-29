// User setup: report what is installed, logged in and trusted on this machine. Nothing is changed.
// Usage: node check-user.mjs  → prints JSON
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CODEX_HOOK_EVENTS = ['session_start', 'user_prompt_submit', 'post_compact', 'subagent_start']

// Codex keeps one table per trusted hook: [hooks.state."<plugin>@<market>:hooks/hooks.json:<event>:<i>:<j>"] trusted_hash = "..."
export const parseCodexTrust = (configText, plugin = 'haechi') => {
  const trusted = new Set()
  const table = /^\[hooks\.state\."([^"]+)"\]\s*\n((?:(?!\[)[^\n]*\n?)*)/gm
  for (const [, key, body] of configText.matchAll(table)) {
    const match = key.match(/^([^@]+)@[^:]+:hooks\/hooks\.json:([a-z_]+):/)
    if (match && match[1] === plugin && /^\s*trusted_hash\s*=/m.test(body)) trusted.add(match[2])
  }
  return {
    trusted: CODEX_HOOK_EVENTS.filter((event) => trusted.has(event)),
    missing: CODEX_HOOK_EVENTS.filter((event) => !trusted.has(event)),
  }
}

// Every host a CLI reports as logged in; `auth status` exits non-zero when any one host fails, so its exit code is not the answer
export const loggedInHosts = (statusText) => [...statusText.matchAll(/Logged in to (\S+)/g)].map((match) => match[1])

// Arguments here are fixed literals; on Windows the CLIs may be .cmd shims that need a shell
const run = (command, args) => {
  const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  try {
    const out = process.platform === 'win32' ? execSync([command, ...args].join(' '), options) : execFileSync(command, args, options)
    return { ok: true, out: out.trim() }
  } catch (error) {
    return { ok: false, out: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim() }
  }
}

const version = (command) => {
  const result = run(command, ['--version'])
  return result.ok ? result.out.split('\n')[0] : null
}

const main = () => {
  const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex')
  const codexConfig = join(codexHome, 'config.toml')
  const userSettings = join(homedir(), '.haechi', 'user.json')
  const claude = version('claude')
  const codex = version('codex')
  const report = {
    tools: {
      git: version('git'),
      node: version('node'),
      python: version('python') ?? version('python3'),
      claude,
      codex,
      glab: version('glab'),
      gh: version('gh'),
    },
    login: {
      glab: loggedInHosts(run('glab', ['auth', 'status']).out),
      gh: loggedInHosts(run('gh', ['auth', 'status']).out),
    },
    plugin: {
      claude: claude ? /\bhaechi@/.test(run('claude', ['plugin', 'list']).out) : null,
      codex: codex ? /\bhaechi@\S+\s+installed/.test(run('codex', ['plugin', 'list']).out) : null,
    },
    codexHooks: existsSync(codexConfig) ? parseCodexTrust(readFileSync(codexConfig, 'utf8')) : null,
    userSettings: existsSync(userSettings) ? JSON.parse(readFileSync(userSettings, 'utf8')) : null,
    userSettingsPath: userSettings,
  }
  console.log(JSON.stringify(report, null, 2))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
