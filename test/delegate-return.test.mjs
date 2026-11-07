import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { preparePacket } from '../dist/claude/tools/delegate-task.mjs'
import { prepareReturn, checkReturn } from '../dist/claude/tools/delegate-return.mjs'
const sha = x => createHash('sha256').update(x).digest('hex')
const write = (root, p, text) => { mkdirSync(join(root,p,'..'),{recursive:true});writeFileSync(join(root,p),text) }
const fixture = t => {
  const root=mkdtempSync(join(tmpdir(),'haechi-return-'));t.after(()=>rmSync(root,{recursive:true,force:true}))
  const contract={skills:['check'],principles:[],checks:[],writeScope:'read-only',contextRequired:['repository'],completion:['Check assertions']}
  write(root,'skills/review/SKILL.md','Review\n```haechi-handoffs\n'+JSON.stringify({check:contract})+'\n```\n')
  write(root,'skills/check/SKILL.md','Check actual assertions, not just the exit status.\n')
  write(root,'skills/delegate/SKILL.md','Keep evidence and reuse only matching current task guidance.\n')
  write(root,'repo/src/a','final content\n')
  write(root, 'principles/work-contract.md', '## Do\nRespect the assigned scope.\n\n## Check\nCheck required outcomes against actual evidence.\n')
  const packet=preparePacket(root,{playbook:'review',step:'check',objective:'Review current behavior',context:{repository:'Read only'},writeScope:'read-only',ownedPaths:[],artifactPaths:[],constraints:['No edits'],completion:['Check results']})
  const main={complete:true,records:[{id:'read1',type:'command_execution',command:'cat skills/delegate/SKILL.md',output:readFileSync(join(root,'skills/delegate/SKILL.md'),'utf8'),exitCode:0}]}
  const worker={complete:true,records:[{id:'check1',type:'command_execution',command:'node --test test/a.test.mjs',output:'tests 2\npass 1\nfail 1\n',exitCode:1}]}
  write(root,'main.json',JSON.stringify(main));write(root,'worker.json',JSON.stringify(worker))
  const request={packet,repositoryRoot:join(root,'repo'),sessionId:'main-1',taskId:'task-1',mainTrace:{path:join(root,'main.json'),format:'tool-records-v1'},workerTrace:{path:join(root,'worker.json'),format:'tool-records-v1'},targets:[{path:'src/a',before:sha('old'),after:sha('final content\n')}]}
  return {root,request,main,worker}
}
test('returns observed failure with exact record reference, target hashes and scoped guidance receipt',t=>{
  const {root,request}=fixture(t),b=prepareReturn(root,request)
  assert.equal(b.evidence[0].exitCode,1);assert.match(b.evidence[0].output.text,/fail 1/)
  assert.equal(b.evidence[0].reference.recordId,'check1');assert.equal(b.sources.worker.sha256,sha(readFileSync(request.workerTrace.path)))
  assert.deepEqual(b.guidanceReuse.files.map(f=>f.path),['skills/delegate/SKILL.md'])
  assert.equal(checkReturn(root,request,b).status,'integrity-checked-not-semantic-pass')
  assert.match(b.acceptance,/not a behavior pass/)
})
test('missing logs, incomplete turns, missing exit/output and empty execution evidence fail closed',t=>{
  const {root,request,worker}=fixture(t)
  for(const data of [{complete:false,records:worker.records},{complete:true,records:[]},{complete:true,records:[{...worker.records[0],exitCode:null}]},{complete:true,records:[{...worker.records[0],output:undefined}]}]){
    write(root,'worker.json',JSON.stringify(data));assert.throws(()=>prepareReturn(root,request))
  }
  rmSync(request.workerTrace.path);assert.throws(()=>prepareReturn(root,request),/ENOENT/)
})
test('changed guidance, task, session, scope or output invalidate a saved return',t=>{
  const {root,request}=fixture(t),b=prepareReturn(root,request)
  for(const key of ['taskId','sessionId'])assert.throws(()=>checkReturn(root,{...request,[key]:'different'},b),/mismatched/)
  const packet=preparePacket(root,{...request.packet.brief,objective:'Different outcome'})
  assert.throws(()=>checkReturn(root,{...request,packet},b),/mismatched/)
  const tampered=structuredClone(b);tampered.evidence[0].exitCode=0;assert.throws(()=>checkReturn(root,request,tampered),/mismatched/)
  write(root,'skills/delegate/SKILL.md','Changed coordinator guidance');assert.throws(()=>checkReturn(root,request,b),/mismatched/)
})
test('changed target versions and escaping target paths are rejected',t=>{
  const {root,request}=fixture(t),b=prepareReturn(root,request)
  write(root,'repo/src/a','later change');assert.throws(()=>checkReturn(root,request,b),/Target changed/)
  for(const path of ['../outside','/tmp/outside'])assert.throws(()=>prepareReturn(root,{...request,targets:[{...request.targets[0],path}]}),/Invalid target/)
  symlinkSync(root,join(root,'repo/escape'));assert.throws(()=>prepareReturn(root,{...request,targets:[{path:'escape/nonexistent',before:sha('old'),after:null}]}),/Outside root/)
})
test('changed raw evidence cannot validate a previously prepared return',t=>{
  const {root,request,worker}=fixture(t),b=prepareReturn(root,request)
  worker.records[0].output='tests 2\npass 2\nfail 0\n';worker.records[0].exitCode=0
  write(root,'worker.json',JSON.stringify(worker))
  assert.throws(()=>checkReturn(root,request,b),/mismatched/)
})
test('catalog mentions, failed or partial guidance reads never grant reuse',t=>{
  const {root,request,main}=fixture(t)
  for(const r of [{...main.records[0],output:'skills/delegate/SKILL.md'},{...main.records[0],exitCode:1},{...main.records[0],output:'Keep evidence'}]){
    write(root,'main.json',JSON.stringify({complete:true,records:[r]}));assert.equal(prepareReturn(root,request).guidanceReuse.status,'no-complete-read-observed')
  }
})
test('native ordered traces retain zero-test output and mark excerpts without inventing a pass',t=>{
  const {root,request}=fixture(t)
  const events=[{type:'item.completed',item:{id:'a',type:'command_execution',command:'node verify.mjs',aggregated_output:'No tests found. '+'.'.repeat(4000),exit_code:0}},{type:'item.completed',item:{id:'b',type:'file_change',changes:[{path:'src/a',kind:'update'}]}},{type:'turn.completed'}]
  write(root,'worker.json',events.map(e=>JSON.stringify(e)).join('\n'));request.workerTrace.format='codex-jsonl'
  const b=prepareReturn(root,request);assert.equal(b.evidence[0].exitCode,0);assert.match(b.evidence[0].output.text,/No tests found/);assert.equal(b.evidence[0].output.truncated,true);assert.equal(b.evidence[1].type,'file_change')
  events.pop();write(root,'worker.json',events.map(e=>JSON.stringify(e)).join('\n'));assert.throws(()=>prepareReturn(root,request),/Incomplete/)
})
test('CLI prepares and checks the host return without modifying its inputs',t=>{
  const {root,request}=fixture(t),tool=new URL('../dist/claude/tools/delegate-return.mjs',import.meta.url).pathname
  write(root,'request.json',JSON.stringify(request));const p=spawnSync(process.execPath,[tool,'prepare',root,join(root,'request.json')],{encoding:'utf8'});assert.equal(p.status,0,p.stderr)
  write(root,'return.json',p.stdout);const c=spawnSync(process.execPath,[tool,'check',root,join(root,'request.json'),join(root,'return.json')],{encoding:'utf8'});assert.equal(c.status,0,c.stderr)
  assert.deepEqual(JSON.parse(readFileSync(join(root,'request.json'))),request)
})
