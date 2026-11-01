// Evaluation-only adapter; hook source and output are retained for delivery checks.
import { appendFileSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const input = readFileSync(0, 'utf8')
const result = spawnSync(process.argv[2], {
  shell: true,
  input,
  encoding: 'utf8',
  env: { ...process.env, PLUGIN_ROOT: '/opt/haechi', PLUGIN_DATA: '/tmp/haechi-state' },
})
appendFileSync('/logs/agent/hook-audit.jsonl', JSON.stringify({
  command: process.argv[2], input: JSON.parse(input || '{}'),
  status: result.status, output: result.stdout, error: result.stderr,
}) + '\n')
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
process.exitCode = result.status ?? 1
