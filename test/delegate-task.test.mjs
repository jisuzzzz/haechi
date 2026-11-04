import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { assembleTask, describeStep, preparePacket, renderPacket } from '../dist/claude/tools/delegate-task.mjs'
const write=(root,path,text)=>{mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),text)}
const brief=()=>({playbook:'review',step:'check',objective:'Check change',context:{repository:'Commands and boundaries',base:'HEAD'},writeScope:'read-only',ownedPaths:[],artifactPaths:[],constraints:['No repository edits'],completion:['Concrete evidence']})
const fixture=t=>{
 const root=mkdtempSync(join(tmpdir(),'haechi-delegate-'));t.after(()=>rmSync(root,{recursive:true,force:true}))
 const c={skills:['check'],principles:['proof'],checks:['proof'],writeScope:'read-only',contextRequired:['repository','base'],completion:['Report gaps']}
 write(root,'skills/review/SKILL.md','# Review\n```haechi-handoffs\n'+JSON.stringify({check:c})+'\n```\n')
 write(root,'skills/check/SKILL.md','# Check\nRead {{PLUGIN_ROOT}}/tools/check.mjs and check consumer.\n')
 write(root,'principles/proof.md','# Proof\n## Do\nObserve results.\n## Check\nFind gaps.\n')
 return root
}
test('CLI prepares and renders complete guidance and preserves input',t=>{
 const root=fixture(t),input=join(root,'brief.json'),packet=join(root,'packet.json'),tool=new URL('../dist/claude/tools/delegate-task.mjs',import.meta.url).pathname
 writeFileSync(input,JSON.stringify(brief()))
 const p=spawnSync(process.execPath,[tool,'prepare',root,input],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);writeFileSync(packet,p.stdout)
 const r=spawnSync(process.execPath,[tool,'render',root,packet],{encoding:'utf8'});assert.equal(r.status,0,r.stderr)
 for(const text of ['check consumer.','Observe results.','Find gaps.',`${root}/tools/check.mjs`])assert.ok(r.stdout.includes(text))
 assert.deepEqual(JSON.parse(readFileSync(input)),brief())
})
test('missing context, contradictory scope, unknown steps and invalid paths are rejected',t=>{
 const root=fixture(t)
 for(const key of Object.keys(brief())){const b=brief();delete b[key];assert.throws(()=>preparePacket(root,b),undefined,key)}
 assert.throws(()=>preparePacket(root,{...brief(),context:{repository:'Only this'}}),/Missing playbook context: base/)
 assert.throws(()=>preparePacket(root,{...brief(),step:'absent'}),/Unknown playbook step/)
 assert.throws(()=>preparePacket(root,{...brief(),writeScope:'scoped',ownedPaths:['src/a']}),/contradicts/)
 for(const path of ['/tmp/a','../a','src/../a','src/*','a\\b','./a'])assert.throws(()=>preparePacket(root,{...brief(),writeScope:'scoped',ownedPaths:[path]}),/Invalid owned/)
 for(const path of ['relative','/','/tmp/../a','/tmp/*'])assert.throws(()=>preparePacket(root,{...brief(),artifactPaths:[path]}),/Invalid artifact/)
 assert.throws(()=>preparePacket(root,{...brief(),model:'hidden'}),/unknown field/)
 const p=preparePacket(root,{...brief(),artifactPaths:['/tmp/authorized-repro/']});assert.match(renderPacket(root,p),/\/tmp\/authorized-repro\//)
})
test('CLI invoked through an aliased directory still executes and rejects empty input',t=>{
 const root=fixture(t),dir=join(root,'actual-tools'),alias=join(root,'aliased-tools'),input=join(root,'brief.json')
 mkdirSync(dir);writeFileSync(join(dir,'delegate-task.mjs'),readFileSync(new URL('../dist/claude/tools/delegate-task.mjs',import.meta.url)))
 symlinkSync(dir,alias);writeFileSync(input,JSON.stringify(brief()))
 const p=spawnSync(process.execPath,[join(alias,'delegate-task.mjs'),'prepare',root,input],{encoding:'utf8'})
 assert.equal(p.status,0,p.stderr);assert.equal(JSON.parse(p.stdout).brief.step,'check')
 writeFileSync(input,'');const invalid=spawnSync(process.execPath,[join(alias,'delegate-task.mjs'),'prepare',root,input],{encoding:'utf8'})
 assert.equal(invalid.status,1);assert.equal(invalid.stdout,'')
})
test('missing files, symlink escapes and malformed or ambiguous contracts fail closed',t=>{
 const root=fixture(t);rmSync(join(root,'skills/check/SKILL.md'))
 assert.throws(()=>preparePacket(root,brief()),/ENOENT/)
 symlinkSync('/etc/hosts',join(root,'skills/check/SKILL.md'));assert.throws(()=>preparePacket(root,brief()),/Outside plugin root/)
 write(root,'skills/review/SKILL.md','```haechi-handoffs\n{}\n```\n```haechi-handoffs\n{}\n```\n');assert.throws(()=>preparePacket(root,brief()),/expected one/)
})
test('tampering and changed sources including playbook policy are rejected',t=>{
 const root=fixture(t),original=preparePacket(root,brief())
 for(const change of [p=>p.assets.pop(),p=>p.assets[0].text+='Changed',p=>p.brief.constraints.push('Edit'),p=>p.packetSha256='fake']){const p=structuredClone(original);change(p);assert.throws(()=>renderPacket(root,p),/does not match/)}
 write(root,'skills/check/SKILL.md','# Changed');assert.throws(()=>renderPacket(root,original),/does not match/)
 const p=preparePacket(root,brief());writeFileSync(join(root,'skills/review/SKILL.md'),readFileSync(join(root,'skills/review/SKILL.md'),'utf8')+'Changed workflow\n');assert.throws(()=>renderPacket(root,p),/does not match/)
})
test('large packets reject explicitly and all accepted rendered messages remain within the byte limit',t=>{
 const root=fixture(t)
 for(const size of [128000,130000,131000,132000]){
  write(root,'skills/check/SKILL.md','x'.repeat(size))
  try{const p=preparePacket(root,brief());const text=renderPacket(root,p);assert.ok(Buffer.byteLength(text)<=128*1024)}catch(e){assert.match(e.message,/128 KiB/)}
 }
 write(root,'skills/check/SKILL.md','x'.repeat(128*1024));assert.throws(()=>preparePacket(root,brief()),/128 KiB/)
})

test('coordinator form and assembly receipt omit procedure bodies while worker gets complete validated guidance',t=>{
 const root=fixture(t),form=describeStep(root,'review','check')
 assert.deepEqual(Object.keys(form.input.context),['repository','base'])
 assert.equal(form.input.writeScope,'read-only');assert.deepEqual(form.requiredCompletion,['Report gaps'])
 const input={...form.input,...brief(),playbookSha256:form.input.playbookSha256}
 const result=assembleTask(root,input,join(root,'task'))
 assert.equal(result.status,'prepared-not-dispatched')
 assert.deepEqual(result.task.completion,['Report gaps','Concrete evidence'])
 assert.equal(result.guidance.length,3)
 const packet=JSON.parse(readFileSync(result.files.packet)),message=readFileSync(result.files.message,'utf8')
 assert.equal(message,renderPacket(root,packet))
 for(const text of ['check consumer.','Observe results.','Find gaps.']){
  assert.ok(message.includes(text));assert.ok(!JSON.stringify(form).includes(text));assert.ok(!JSON.stringify(result).includes(text))
 }
 assert.equal(result.packetSha256,packet.packetSha256)
 assert.equal(result.messageBytes,Buffer.byteLength(message))
})

test('stale forms, incomplete tasks and missing guidance cannot leave dispatch artifacts',t=>{
 const root=fixture(t),form=describeStep(root,'review','check'),output=join(root,'task')
 const input={...brief(),playbookSha256:form.input.playbookSha256}
 assert.throws(()=>assembleTask(root,form.input,output),/objective/);assert.ok(!existsSync(output))
 assert.throws(()=>assembleTask(root,{...input,writeScope:'scoped',ownedPaths:['src/a']},output),/contradicts/)
 writeFileSync(join(root,'skills/review/SKILL.md'),readFileSync(join(root,'skills/review/SKILL.md'),'utf8')+'Changed policy\n')
 assert.throws(()=>assembleTask(root,input,output),/Playbook changed/);assert.ok(!existsSync(output))
 const updated={...input,playbookSha256:describeStep(root,'review','check').input.playbookSha256}
 rmSync(join(root,'skills/check/SKILL.md'))
 assert.throws(()=>assembleTask(root,updated,output),/ENOENT/);assert.ok(!existsSync(output))
})

test('assemble CLI saves full artifacts once, emits only receipt and never overwrites earlier work',t=>{
 const root=fixture(t),tool=new URL('../dist/claude/tools/delegate-task.mjs',import.meta.url).pathname
 const form=spawnSync(process.execPath,[tool,'describe',root,'review','check'],{encoding:'utf8'})
 assert.equal(form.status,0,form.stderr)
 const input=join(root,'brief.json'),output=join(root,'task')
 writeFileSync(input,JSON.stringify({...JSON.parse(form.stdout).input,...brief()}))
 const args=[tool,'assemble',root,input,output]
 const result=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(result.status,0,result.stderr)
 const receipt=JSON.parse(result.stdout),original=readFileSync(receipt.files.packet,'utf8')
 assert.doesNotMatch(result.stdout,/Observe results|check consumer|Find gaps/)
 assert.match(readFileSync(receipt.files.message,'utf8'),/Observe results/)
 const again=spawnSync(process.execPath,args,{encoding:'utf8'})
 assert.equal(again.status,1);assert.equal(again.stdout,'');assert.equal(readFileSync(receipt.files.packet,'utf8'),original)
 const packet=JSON.parse(original);packet.assets[0].text='tampered'
 assert.throws(()=>renderPacket(root,packet),/does not match/)
 write(root,'principles/proof.md','# Proof\n## Do\nChanged requirement\n## Check\nFind gaps.\n')
 assert.throws(()=>renderPacket(root,JSON.parse(original)),/does not match/)
})
