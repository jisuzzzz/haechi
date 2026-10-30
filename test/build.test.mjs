import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildFiles, codexAgent, demoteHeadings, diffTree, loadSource, parseFrontmatter } from '../build/build.mjs'

const write = (root, path, text) => {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), text)
}

const makeCore = () => {
  const root = mkdtempSync(join(tmpdir(), 'haechi-core-'))
  write(root, 'plugin.json', JSON.stringify({ name: 'demo', version: '1.2.3', description: 'Demo plugin', author: { name: 'x' } }))
  write(root, 'principles/kiss.md', '---\nname: kiss\n---\n## Do\nKeep the diff small.\n\n## Check\nFlag single-use layers.\n')
  write(root, 'principles/dry.md', '---\nname: dry\n---\n## Do\nExtract repeats.\n## Check\nQuote both copies.\n')
  write(root, 'skills/review/SKILL.md', '---\nname: review\ndescription: Review steps\n---\nRun {{PLUGIN_ROOT}}/tools/impact.mjs first.\n')
  write(
    root,
    'agents/checker.md',
    '---\nname: checker\ndescription: "Reviews diffs"\ntools: [Read, Grep]\nmodel: opus\neffort: medium\nprinciples: [kiss]\nchecks: [dry]\nskills: [review]\n---\nYou review.\n',
  )
  return root
}

test('parses one-line frontmatter values and lists', () => {
  const { fields, body } = parseFrontmatter('---\nname: a\ndescription: "quoted: value"\ntools: [Read, Grep]\n---\nBody\n', 'f')
  assert.deepEqual(fields, { name: 'a', description: 'quoted: value', tools: ['Read', 'Grep'] })
  assert.equal(body, 'Body')
})

test('rejects multi-line YAML values', () => {
  assert.throws(() => parseFrontmatter('---\ndescription: >\n  long\n---\n', 'f'), /one-line value/)
})

test('agents get the Do part of principles and the Check part of checks', () => {
  const files = buildFiles(loadSource(makeCore()))
  const claude = files.get('claude/agents/checker.md')
  assert.match(claude, /^---\nname: checker\ndescription: Reviews diffs\ntools: Read, Grep\nmodel: opus\neffort: medium\n---/)
  assert.match(claude, /## Principles\n\n### kiss\nKeep the diff small\./)
  assert.match(claude, /## Checks\n\n### dry\nQuote both copies\./)
  assert.doesNotMatch(claude, /Extract repeats|Flag single-use/)
  assert.doesNotMatch(claude, /principles:|checks:|skills:/)
})

test('plugin root token resolves per tool', () => {
  const files = buildFiles(loadSource(makeCore()))
  assert.match(files.get('claude/agents/checker.md'), /\$\{CLAUDE_PLUGIN_ROOT\}\/tools\/impact\.mjs/)
  assert.match(files.get('codex/agents/checker.toml'), /\$\{PLUGIN_ROOT\}\/tools\/impact\.mjs/)
  assert.match(files.get('codex/skills/review/SKILL.md'), /\$\{PLUGIN_ROOT\}/)
  assert.doesNotMatch([...files.values()].join('\n'), /\{\{PLUGIN_ROOT\}\}/)
})

test('codex agents are TOML with escaped strings and effort', () => {
  const toml = buildFiles(loadSource(makeCore())).get('codex/agents/checker.toml')
  assert.match(toml, /^name = "checker"\ndescription = "Reviews diffs"\nmodel_reasoning_effort = "medium"\ndeveloper_instructions = '''\nYou review\./)
})

test("refuses a body that would break the TOML literal string", () => {
  const agent = { file: 'a.md', fields: { name: 'a', description: 'd' }, body: "x ''' y" }
  assert.throws(() => codexAgent(agent, { principles: new Map(), skills: new Map() }), /TOML literal/)
})

test('unknown principle names fail the build', () => {
  const root = makeCore()
  write(root, 'agents/bad.md', '---\nname: bad\ndescription: d\nprinciples: [nope]\n---\nx\n')
  assert.throws(() => buildFiles(loadSource(root)), /unknown principle "nope"/)
})

test('manifests carry the version for both tools', () => {
  const files = buildFiles(loadSource(makeCore()))
  assert.equal(JSON.parse(files.get('claude/.claude-plugin/plugin.json')).version, '1.2.3')
  assert.equal(JSON.parse(files.get('codex/.codex-plugin/plugin.json')).skills, './skills/')
})

test('inlined procedures sit below their ### heading', () => {
  assert.equal(demoteHeadings('# Review\n\nIntro\n\n## Order\n1. a\n### Detail\nb'), 'Intro\n\n#### Order\n1. a\n##### Detail\nb')
})

test('check reports missing, stale and extra files', () => {
  const expected = new Map([['a', '1'], ['b', '2']])
  const actual = new Map([['b', 'old'], ['c', '3']])
  assert.deepEqual(diffTree(expected, actual), ['missing: dist/a', 'stale: dist/b', 'extra: dist/c'])
})
