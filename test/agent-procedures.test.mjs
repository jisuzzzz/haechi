import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildFiles, loadSource, parseFrontmatter } from '../build/build.mjs'
import { describeStep, preparePacket, renderPacket } from '../dist/claude/tools/delegate-task.mjs'
const root = join(import.meta.dirname, '..'), core = loadSource(root), files = buildFiles(core)

test('both distributions have one worker with no preset model, effort or tools', () => {
  assert.deepEqual(core.agents.map(a => a.fields.name), ['worker'])
  const a = core.agents[0], claude = parseFrontmatter(files.get('claude/agents/worker.md'), 'worker')
  assert.deepEqual(Object.keys(a.fields).sort(), ['description','name'])
  assert.deepEqual(claude.fields, a.fields)
  assert.equal(claude.body, a.body)
  assert.doesNotMatch(files.get('codex/agents/worker.toml'), /^(model|model_reasoning_effort|tools|sandbox_mode)\s*=/m)
  assert.equal([...files.keys()].filter(p => p.includes('/agents/')).length, 2)
})

for (const playbook of ['bug','feature','refactor','review','test-hardening','perf','sweep','preview']) {
  test(`${playbook} explicitly defines and delivers each step's complete guidance on both platforms`, () => {
    const source = core.skills.get(playbook).text
    const contracts = JSON.parse(source.match(/```haechi-handoffs\n([\s\S]*?)\n```/)[1])
    for (const [step, c] of Object.entries(contracts)) {
      const form = describeStep(root, playbook, step)
      assert.deepEqual(Object.keys(form.input.context), c.contextRequired)
      assert.deepEqual(form.requiredCompletion, c.completion)
      assert.equal(form.input.writeScope, c.writeScope)
      const brief = { ...form.input, objective:'Assigned task', context:Object.fromEntries(Object.keys(form.input.context).map(n=>[n,'Provided evidence'])), ownedPaths:form.input.writeScope==='scoped'?['src/a']:[], constraints:['Respect scope'], completion:['Report evidence'] }
      const packet = preparePacket(root, brief)
      assert.deepEqual(packet.contract, c)
      for (const name of c.skills) assert.equal(packet.assets.filter(a=>a.path===`skills/${name}/SKILL.md`).length,1)
      for (const [names, section, prop] of [[c.principles,'Do','do'],[c.checks,'Check','check']]) for (const name of names) assert.equal(packet.assets.find(a=>a.path===`principles/${name}.md`&&a.section===section).text,core.principles.get(name)[prop].replaceAll('{{PLUGIN_ROOT}}',root))
      const message=renderPacket(root,packet)
      for (const asset of packet.assets) assert.ok(message.includes(asset.text))
      for (const target of ['claude','codex']) assert.ok(files.get(`${target}/skills/${playbook}/SKILL.md`).includes('```haechi-handoffs'))
    }
  })
}

test('implementation retains all seven principle references and review retains its dependencies', () => {
 const read = n => JSON.parse(core.skills.get(n).text.match(/```haechi-handoffs\n([\s\S]*?)\n```/)[1])
 assert.deepEqual(read('bug').implement.principles,['dry','yagni','kiss','boundary-validation','root-cause','failing-test-first','behavior-tests'])
 assert.deepEqual(read('review').review.skills,['verify-work','review-diff','impact-map'])
 assert.deepEqual(read('perf').audit.checks,['benchmark-checklist'])
})
