import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
function run(t, script) {
  const dir = mkdtempSync(join(tmpdir(), 'haechi-materialize-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const p = spawnSync(process.env.HAECHI_EVAL_PYTHON || 'python3', ['-B', '-c', String.raw`
import json,sys
from pathlib import Path
from unittest.mock import patch
from evals.harbor.swebench import prepare
r=Path(sys.argv[1]);source=r/'source';source.mkdir();output=r/'private-fixtures';wheels=r/'wheels';wheels.mkdir()
(source/'grade.py').write_text(prepare.HERE.joinpath('grade.py').read_text())
row={'instance_id':'example__project-1','base_commit':'a'*40,'image':'public/image:tag','_dataset':'synthetic/Verified','_revision':'immutable-dataset-revision','problem_statement':'Public synthetic issue','repo':'example/project','version':'1','FAIL_TO_PASS':['fix'],'PASS_TO_PASS':['stable'],'log_parser':'parse_log_pytest','eval_type':'pass_and_fail','eval_script':'echo synthetic','patch':'synthetic solution'}
(source/'selection.json').write_text(json.dumps({'instances':[{'instance_id':row['instance_id'],'base_commit':row['base_commit']}]}))
rows=r/'rows.json';rows.write_text(json.dumps([row]))
for name in ['swebench-5.0.2-py3-none-any.whl','unidiff-0.7.5-py2.py3-none-any.whl']:(wheels/name).write_text('synthetic dependency capsule, never executed')
def docker(args,**kwargs):
 if args[:3]==['docker','image','inspect']:
  return json.dumps([{'RepoDigests':['public/image@sha256:'+'c'*64],'Architecture':'amd64','Id':'sha256:'+'d'*64,'RootFS':{'Layers':['layer']}}]).encode()
 assert args[0:2]==['docker','run'];return b''
prepare.HERE=source
` + script, dir], { cwd: root, encoding: 'utf8', timeout: 10000 })
  assert.equal(p.status, 0, p.stderr || p.stdout || String(p.error))
}

test('real task materialization writes private payloads and metadata only to the requested output', t => run(t, String.raw`
with patch.object(prepare.subprocess,'check_output',docker):prepare.materialize(rows,wheels,output)
fixture=output/'swebench-example-project-1'
assert sorted(p.name for p in source.iterdir())==['grade.py','selection.json']
assert (output/'prepared-images.json').is_file()
assert (fixture/'solution/gold.patch').read_text()==row['patch']
assert len(list((fixture/'tests').glob('*.whl')))==2
assert {p.name for p in (fixture/'environment').iterdir()}=={'Dockerfile'}
case=json.loads((fixture/'cases.json').read_text())[0]
assert case['swebench']['baseCommit']==row['base_commit']
assert case['swebench']['image']=='public/image@sha256:'+'c'*64
assert row['patch'] not in case['task']
`))

test('materialization refuses changed selection fields and existing tasks without replacing bytes', t => run(t, String.raw`
original=rows.read_text();bad={**row,'base_commit':'b'*40};rows.write_text(json.dumps([bad]))
with patch.object(prepare.subprocess,'check_output',docker):
 try:prepare.materialize(rows,wheels,output)
 except ValueError as error:assert 'dataset fields changed' in str(error)
 else:raise AssertionError('changed source selection accepted')
assert not output.exists();rows.write_text(original)
fixture=output/'swebench-example-project-1';fixture.mkdir(parents=True);(fixture/'keep.txt').write_text('preserve existing evidence')
with patch.object(prepare.subprocess,'check_output',docker):
 try:prepare.materialize(rows,wheels,output)
 except ValueError as error:assert 'Refusing to replace' in str(error)
 else:raise AssertionError('existing task overwritten')
assert list(fixture.iterdir())==[fixture/'keep.txt'] and (fixture/'keep.txt').read_text()=='preserve existing evidence'
`))
