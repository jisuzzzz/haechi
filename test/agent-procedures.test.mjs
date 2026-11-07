import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildFiles, loadSource, parseFrontmatter } from '../build/build.mjs'
import { describeStep, preparePacket, renderPacket } from '../dist/claude/tools/delegate-task.mjs'
const root = join(import.meta.dirname, '..'), core = loadSource(root), files = buildFiles(core)
const commonPrinciples = ['work-contract','dry','yagni','kiss','boundary-validation','root-cause','failing-test-first','behavior-tests','real-artifact']
const commonCompletion = 'Apply principles/work-contract.md#Check to the assigned scope and report the required evidence and gaps.'
const unique = values => [...new Set(values)]

test('both distributions have one worker with no preset model, effort or tools', () => {
  assert.deepEqual(core.agents.map(a => a.fields.name), ['worker'])
  const a = core.agents[0], claude = parseFrontmatter(files.get('claude/agents/worker.md'), 'worker')
  assert.deepEqual(Object.keys(a.fields).sort(), ['description','name'])
  assert.deepEqual(claude.fields, a.fields)
  assert.equal(claude.body, a.body)
  assert.doesNotMatch(files.get('codex/agents/worker.toml'), /^(model|model_reasoning_effort|tools|sandbox_mode)\s*=/m)
  assert.equal([...files.keys()].filter(p => p.includes('/agents/')).length, 2)
})

for (const playbook of ['bug','feature','refactor','review','test-hardening','perf','sweep']) {
  test(`${playbook} explicitly defines and delivers each step's complete guidance on both platforms`, async () => {
    const source = core.skills.get(playbook).text
    const contracts = JSON.parse(source.match(/```haechi-handoffs\n([\s\S]*?)\n```/)[1])
    for (const [step, c] of Object.entries(contracts)) {
      const form = describeStep(root, playbook, step)
      assert.deepEqual(Object.keys(form.input.context), c.contextRequired)
      assert.deepEqual(form.requiredCompletion, unique([...c.completion, commonCompletion]))
      assert.equal(form.input.writeScope, c.writeScope)
      const brief = { ...form.input, objective:'Assigned task', context:Object.fromEntries(Object.keys(form.input.context).map(n=>[n,'Provided evidence'])), ownedPaths:form.input.writeScope==='scoped'?['src/a']:[], constraints:['Respect scope'], completion:['Report evidence'] }
      const packet = preparePacket(root, brief)
      assert.deepEqual(packet.contract, {...c, principles:unique([...commonPrinciples,...c.principles]), checks:unique([...commonPrinciples,...c.checks]), completion:unique([...c.completion,commonCompletion])})
      for (const name of c.skills) assert.equal(packet.assets.filter(a=>a.path===`skills/${name}/SKILL.md`).length,1)
      for (const [names, section, prop] of [[c.principles,'Do','do'],[c.checks,'Check','check']]) for (const name of names) assert.equal(packet.assets.find(a=>a.path===`principles/${name}.md`&&a.section===section).text,core.principles.get(name)[prop].replaceAll('{{PLUGIN_ROOT}}',root))
      for (const name of commonPrinciples) for (const [section, prop] of [['Do','do'],['Check','check']]) {
        const path=`principles/${name}.md`,assets=packet.assets.filter(a=>a.path===path&&a.section===section)
        assert.equal(assets.length,1,`${playbook}/${step}: ${path}#${section}`)
        assert.equal(assets[0].text,core.principles.get(name)[prop].replaceAll('{{PLUGIN_ROOT}}',root))
        assert.equal(assets[0].sourceSha256,createHash('sha256').update(readFileSync(join(root,path))).digest('hex'))
      }
      const message=renderPacket(root,packet)
      for (const asset of packet.assets) assert.ok(message.includes(asset.text))
      for (const target of ['claude','codex']) {
        assert.ok(files.get(`${target}/skills/${playbook}/SKILL.md`).includes('```haechi-handoffs'))
        const targetRoot=join(root,'dist',target),tool=await import(`../dist/${target}/tools/delegate-task.mjs`)
        const targetPacket=tool.preparePacket(targetRoot,{...brief,playbookSha256:tool.describeStep(targetRoot,playbook,step).playbookSource.sha256})
        const targetMessage=tool.renderPacket(targetRoot,targetPacket)
        assert.deepEqual(targetPacket.contract,packet.contract)
        for (const asset of targetPacket.assets) {
          assert.ok(targetMessage.includes(asset.text))
          assert.equal(asset.sourceSha256,createHash('sha256').update(readFileSync(join(targetRoot,asset.path))).digest('hex'))
        }
        for (const name of commonPrinciples) for (const [section,prop] of [['Do','do'],['Check','check']]) {
          const assets=targetPacket.assets.filter(a=>a.path===`principles/${name}.md`&&a.section===section)
          assert.equal(assets.length,1)
          assert.equal(assets[0].text,core.principles.get(name)[prop].replaceAll('{{PLUGIN_ROOT}}',targetRoot))
        }
      }
    }
  })
}

test('preview capture cannot be delegated through either distribution', async () => {
  for (const target of ['claude', 'codex']) {
    const { describeStep } = await import(`../dist/${target}/tools/delegate-task.mjs`)
    assert.throws(() => describeStep(join(root, 'dist', target), 'preview', 'variants'), /expected one haechi-handoffs block/)
  }
})

test('common implementation principles reach every scoped step and method-specific dependencies remain', () => {
 const read = n => JSON.parse(core.skills.get(n).text.match(/```haechi-handoffs\n([\s\S]*?)\n```/)[1])
 for (const playbook of ['bug','feature','refactor','review','test-hardening','perf','sweep']) for (const [step,contract] of Object.entries(read(playbook))) if (contract.writeScope==='scoped') {
  const form=describeStep(root,playbook,step)
  for (const name of commonPrinciples) assert.ok(form.requiredGuidance.principles.includes(name),`${playbook}/${step}: ${name}`)
 }
 assert.deepEqual(read('review').review.skills,['verify-work','review-diff','impact-map'])
 assert.deepEqual(read('perf').audit.checks,['benchmark-checklist'])
})
