import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const configPath = `${root}tsconfig.json`
const config = ts.readConfigFile(configPath, ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
const consumer = `${root}type-contract.mts`

const diagnostics = (text) => {
  const host = ts.createCompilerHost(parsed.options)
  const load = host.getSourceFile.bind(host)
  host.getSourceFile = (path, language, ...args) => path === consumer
    ? ts.createSourceFile(path, text, language, true)
    : load(path, language, ...args)
  const program = ts.createProgram([...parsed.fileNames, consumer], parsed.options, host)
  return ts.getPreEmitDiagnostics(program)
}

const imports = `
import { select } from './tools/skill-context.mjs'
import { run } from './tools/work-graph.mjs'
import type { Brief } from './tools/delegate-task.mjs'
`

test('TypeScript resolves emitted module names and checks tool data contracts', () => {
  assert.equal(config.error, undefined)
  assert.deepEqual(parsed.errors, [])
  const valid = diagnostics(`${imports}
select({ skill: 'review', task: 'Check imports', source: 'user' }, '/haechi:review')
run('/repo', 'create', undefined, { expectedVersion: 0, acceptance: ['Checked'] })
const scope: Brief['writeScope'] = 'read-only'
`)
  assert.deepEqual(valid.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), [])

  const invalid = diagnostics(`${imports}
select({ skill: 42, task: 'Check imports', source: 'user' }, '/haechi:review')
run('/repo', 'create', undefined, { expectedVersion: 0, acceptance: [42] })
const scope: Brief['writeScope'] = 'global'
`)
  const consumerErrors = invalid.filter(d => d.file?.fileName === consumer)
  assert.equal(consumerErrors.length, 3, ts.formatDiagnosticsWithColorAndContext(invalid, {
    getCanonicalFileName: p => p, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }))
  assert.deepEqual(consumerErrors.map(d => d.code), [2322, 2322, 2322])
})
