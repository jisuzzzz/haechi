import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const python = (process.env.HAECHI_EVAL_PYTHON ? [process.env.HAECHI_EVAL_PYTHON] : [
  'python3.14', 'python3.13', 'python3.12', 'python3', '/opt/homebrew/bin/python3.12',
]).find((candidate) => spawnSync(candidate, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3,12) else 1)']).status === 0)
assert.ok(python, 'Harbor contract tests need Python 3.12+; set HAECHI_EVAL_PYTHON to its executable')
const setup = `
import argparse, json, sys
from pathlib import Path
from evals.harbor.run import SUITES, digest, freeze, inventory, load, save, verify, trial_observation
from evals.harbor.report import aggregate, packets
workspace = Path(sys.argv[1])
out = workspace / 'comparison'
package = Path('dist/codex').resolve()
def package_hash(directory):
    return 'sha256:' + digest(json.dumps(inventory(directory), sort_keys=True).encode())
def synthetic_swebench_fixtures():
    # These exercise the freeze contract only; no public dataset, image,
    # official test patch, grading wheel or model execution is needed.
    fixtures = workspace / 'synthetic-swebench-fixtures'
    for index, fixture_id in enumerate(SUITES['swebench-real']):
        fixture = fixtures / fixture_id
        for name in ('environment', 'tests', 'solution'):
            (fixture / name).mkdir(parents=True)
        image = 'synthetic/contract-fixture@sha256:' + format(index + 1, '064x')
        (fixture / 'environment/Dockerfile').write_text('FROM ' + image + '\\nWORKDIR /workspace\\n')
        (fixture / 'tests/eval.sh').write_text('#!/bin/sh\\n# Synthetic contract input; never executed.\\nexit 0\\n')
        (fixture / 'solution/gold.patch').write_text('# Synthetic answer sentinel; must remain outside environment.\\n')
        case = {'id': fixture_id, 'fixtureId': fixture_id, 'stack': 'python' if index >= 4 else 'javascript-typescript',
                'kind': 'target', 'agentTimeoutSec': 600, 'verifierTimeoutSec': 900,
                'buildTimeoutSec': 1800, 'memoryMb': 4096,
                'task': 'Synthetic contract case: fix the fixture and report observed checks.',
                'criteria': ['The patch addresses the synthetic issue without weakening checks.',
                             'The response describes observed verification and its limits.'],
                'swebench': {'instanceId': 'synthetic-' + str(index), 'dataset': 'synthetic-contract',
                             'datasetRevision': '1' * 40, 'baseCommit': '2' * 40,
                             'image': image, 'graderVersion': '5.0.2'}}
        save(fixture / 'cases.json', [case])
    return fixtures
real_fixtures = synthetic_swebench_fixtures()
plan = freeze(argparse.Namespace(out=out, trials=2, model='openai/test-model', codex_version='0.153.4'))
def observation(row, reward='1', candidate_hook=True):
    trial = out / 'jobs' / row['id'] / 'trial'
    (trial / 'agent').mkdir(parents=True)
    (trial / 'verifier').mkdir()
    save(trial / 'result.json', {'exception_info': None})
    (trial / 'agent/image-id.txt').write_text('sha256:' + 'a' * 64 + '\\n')
    save(trial / 'agent/image-layers.json', ['sha256:' + 'b' * 64])
    (trial / 'agent/codex.txt').write_text(json.dumps({'type': 'turn.completed', 'usage': {'input_tokens': 2, 'output_tokens': 1}}) + '\\n')
    (trial / 'verifier/reward.txt').write_text(reward + '\\n')
    save(trial / 'verifier/checks.json', {'syntheticTestArtifact': True, 'passed': reward == '1'})
    if row['variant'] == 'candidate' and candidate_hook:
        (trial / 'agent/hook-audit.jsonl').write_text(json.dumps({'status': 0, 'output': '[haechi] Synthetic delivery for unit test', 'command': 'inject.mjs SessionStart'}) + '\\n')
    return trial_observation(out, row, trial)
def judge_all():
    packets(out)
    judgments = {'evaluator': 'synthetic unit-test evaluator, no model invoked', 'independent': True, 'runs': []}
    for identity in load(out / 'judge-identities.json'):
        rubric = load(out / 'judge-packets' / identity['sampleId'] / 'rubric.json')
        judgments['runs'].append({'sampleId': identity['sampleId'], 'reason': 'Synthetic unit-test judgment', 'criteria': [
            {'index': i, 'passed': True, 'reason': 'Synthetic unit-test criterion'} for i in range(len(rubric['criteria']))]})
    save(out / 'judgments.json', judgments)
    return out / 'judgments.json'
def synthetic_calibration():
    rows = []
    for fixture in plan['calibrationFixtures']:
        for name, expected in [('nop', 0), ('oracle', 1)]:
            job_id = 'calibrate-' + fixture['fixtureId'] + '-' + name
            trial = out / 'jobs' / job_id / 'trial'
            (trial / 'verifier').mkdir(parents=True)
            save(trial / 'result.json', {'exception_info': None, 'syntheticTestArtifact': True})
            (trial / 'verifier/reward.txt').write_text(str(expected))
            rows.append({'jobId':job_id, 'result': str(trial.relative_to(out)), 'evidenceManifest':inventory(trial), 'passed':True})
    save(out / 'calibration.json', rows)
`

function run(t, script) {
  const dir = mkdtempSync(join(tmpdir(), 'haechi-harbor-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const child = spawnSync(python, ['-c', setup + '\n' + script, dir], {
    cwd: root, encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  })
  assert.equal(child.status, 0, child.stderr || child.stdout)
}

test('real issue rollup preserves frozen target labels and counts regressions within official grades', (t) => run(t, `
from evals.harbor.report import real_comparison
real_plan = {**plan, 'suite':'swebench-real', 'cases':[{**c, 'kind':'target'} for c in plan['cases']]}
runs = []
for row in plan['schedule']:
    observed = observation(row)
    runs.append({**{k:row[k] for k in ['caseId','trial','variant']}, 'outcome':'pass', 'reason':'Synthetic complete official+rubric result', 'evidence':observed['trialDir']+'/agent/codex.txt'})
results = {'planSha256':(out/'plan.sha256').read_text().strip(),'runs':runs}
assert real_comparison(real_plan, results, out)['verdict'] == 'inconclusive'
assert real_comparison(real_plan, results, out)['completedRuns'] == len(runs)
candidate = next(r for r in runs if r['variant']=='candidate')
candidate['outcome']='fail'
assert real_comparison(real_plan, results, out)['verdict'] == 'rejected'
candidate['outcome']='blocked'
assert real_comparison(real_plan, results, out)['verdict'] == 'inconclusive'
candidate['outcome']='pass'
for row in runs:
    if row['variant']=='baseline' and row['caseId']==plan['cases'][0]['id']:
        row['outcome']='fail'
report = real_comparison(real_plan, results, out)
assert report['verdict']=='supported' and report['improvedCases']==[plan['cases'][0]['id']]
assert all(c['kind']=='target' for c in real_plan['cases'])
`))

test('real benchmark selection stays paired, hides answers, and preserves the evaluated package', (t) => run(t, `
from evals.harbor.run import SUITES
real = out.parent / 'real'
real_plan = freeze(argparse.Namespace(out=real, trials=2, model='openai/test-model', codex_version='0.153.4', suite='swebench-real', jobs=2, package_dir=package, fixtures_dir=real_fixtures))
assert len(real_plan['cases']) == 6 and len(real_plan['schedule']) == 24
assert plan['setupProfile'] == real_plan['setupProfile'] == 'unconfigured'
assert real_plan['trials'] == 2 and real_plan['model'] == 'openai/test-model'
assert 'unattended first-use' in real_plan['hypothesis']
assert real_plan['swebenchProtocol']['setup'].startswith('Unattended first-use:')
assert real_plan['candidate'] == plan['candidate'] == package_hash(package)
assert real_plan['snapshotManifest'] == inventory(package) == inventory(real / 'snapshot')
for case in real_plan['cases']:
    task = real / 'tasks' / case['id']
    assert case['agentTimeoutSec'] == 600 and len(case['criteria']) == 2
    assert case == load(real_fixtures / case['fixtureId'] / 'cases.json')[0]
    assert inventory(task / 'environment') == inventory(real_fixtures / case['fixtureId'] / 'environment')
    assert 'timeout_sec = 900.0' in (task / 'task.toml').read_text()
    assert {p.name for p in (task / 'environment').iterdir()} <= {'Dockerfile', 'official-setup.patch'}
    assert '@sha256:' in (task / 'environment/Dockerfile').read_text()
    assert (task / 'solution/gold.patch').is_file()
    assert (task / 'tests/eval.sh').is_file()
verify(real)
`))

test('setup-complete coding stages only approved inputs and preserves tasks, treatment and paired schedule', (t) => run(t, `
from evals.harbor.run import HERE, SUITES
kinds = dict(zip((
    'swebench-babel-babel-16130', 'swebench-immutable-js-immutable-js-2006',
    'swebench-preactjs-preact-4152', 'swebench-axios-axios-5316',
    'swebench-sphinx-doc-sphinx-8056', 'swebench-django-django-17087',
), ('babel', 'immutable', 'preact', 'axios', 'sphinx', 'django')))
assert tuple(kinds) == SUITES['swebench-real']
options = dict(trials=2, model='openai/test-model', codex_version='0.153.4', suite='swebench-real', jobs=2, package_dir=package, fixtures_dir=real_fixtures)
plain = out.parent / 'first-use'
ready = out.parent / 'setup-complete'
first_use = freeze(argparse.Namespace(out=plain, **options))
configured = freeze(argparse.Namespace(out=ready, setup_profile='configured', **options))
assert configured['setupProfile'] == 'configured'
assert 'setup-complete coding' in configured['hypothesis']
assert configured['swebenchProtocol']['setup'].startswith('Setup-complete coding: both variants receive identical')
for key in ('cases', 'schedule', 'calibrationFixtures', 'model', 'trials', 'jobs', 'conditions', 'baseline', 'candidate', 'snapshotManifest'):
    assert configured[key] == first_use[key], key
assert configured['candidate'] == package_hash(package)
assert configured['snapshotManifest'] == inventory(package)
common = {'babel-scope-build.cjs', 'scoped-check.sh', 'scoped-check.py', 'install-data-fact.py', 'data-fact.md', 'user.json'}
profiles = {'.haechi.json', 'repo-profile.json'}
for case in configured['cases']:
    task = ready / 'tasks' / case['id']
    original = plain / 'tasks' / case['id']
    assert (task / 'instruction.md').read_bytes() == (original / 'instruction.md').read_bytes()
    assert (task / 'task.toml').read_bytes() == (original / 'task.toml').read_bytes()
    for name in ('tests', 'solution'):
        assert inventory(task / name) == inventory(original / name)
    environment = task / 'environment'
    assert {p.name for p in environment.iterdir()} == {p.name for p in (original / 'environment').iterdir()} | {'benchmark-setup'}
    payload = environment / 'benchmark-setup'
    assert {p.name for p in payload.iterdir()} == common | profiles
    for name in common:
        assert (payload / name).read_bytes() == (HERE / 'swebench/configured/common' / name).read_bytes()
    for name in profiles:
        assert (payload / name).read_bytes() == (HERE / 'swebench/configured/profiles' / kinds[case['fixtureId']] / name).read_bytes()
    assert (environment / 'Dockerfile').read_bytes() == (original / 'environment/Dockerfile').read_bytes() + b'\\n' + (HERE / 'swebench/configured/Dockerfile.additions').read_bytes()
    assert not any(p.name in {'gold.patch', 'test.patch', 'proof-scope.json', 'tests', 'solution', 'snapshot', 'package', 'plugin.json'} for p in environment.rglob('*'))
    for trial in (1, 2):
        pair = [r for r in configured['schedule'] if r['caseId'] == case['id'] and r['trial'] == trial]
        assert {r['variant'] for r in pair} == {'baseline', 'candidate'}
verify(plain)
verify(ready)
`))

test('setup profile CLI defaults remain compatible and invalid or missing profiles fail before writing', (t) => run(t, `
from unittest.mock import patch
import evals.harbor.run as runner
with patch.object(runner, 'freeze') as called:
    for flags, expected in [([], 'unconfigured'), (['--suite', 'swebench-real', '--setup-profile', 'configured'], 'configured')]:
        with patch.object(sys, 'argv', ['run', 'freeze', *flags]):
            runner.main()
        assert called.call_args.args[0].setup_profile == expected
options = dict(trials=2, model='openai/test-model', codex_version='0.153.4')
def rejected(name, expected, **extra):
    destination = out.parent / name
    try:
        freeze(argparse.Namespace(out=destination, **options, **extra))
        raise AssertionError('invalid setup accepted')
    except ValueError as error:
        assert expected in str(error), str(error)
    assert not destination.exists()
for suite in ('smoke', 'expanded'):
    rejected(suite, 'only for suite swebench-real', suite=suite, setup_profile='configured')
rejected('unknown-profile', 'Unknown setup profile', suite='swebench-real', setup_profile='unknown')
with patch.dict(runner.SUITES, {'swebench-real': ('swebench-unknown',)}):
    rejected('unknown-fixture', 'No configured setup profile', suite='swebench-real', setup_profile='configured')
with patch.dict(runner.CONFIGURED_KINDS, {'swebench-babel-babel-16130': 'missing'}):
    rejected('missing-files', 'Configured setup file is missing', suite='swebench-real', setup_profile='configured')
`))

test('fresh grader preparation pins the stopped exact image without host platform overrides', (t) => run(t, `
import os, subprocess
from unittest.mock import patch
from evals.harbor.swebench import replay
trial = out.parent / 'prepared'
trial.mkdir()
image, container = 'sha256:' + 'a' * 64, 'b' * 64
calls = []
def fake_run(args, **kwargs):
    calls.append(args)
    assert '--platform' not in args and 'DOCKER_DEFAULT_PLATFORM' not in kwargs['env']
    output = ''
    if args[1] == 'create':
        assert image in args
        output = container
    elif args[1] == 'inspect':
        output = json.dumps([{'Id': container, 'Image': image, 'State': {'Status': 'created'}}])
    elif args[1:3] == ['image', 'inspect']:
        output = json.dumps([{'Architecture': 'arm64', 'Os': 'linux', 'RootFS': {'Layers': ['layer']}}])
    return subprocess.CompletedProcess(args, 0, output, '')
with patch.object(replay.subprocess, 'run', side_effect=fake_run), patch.dict(os.environ, {'DOCKER_DEFAULT_PLATFORM': 'linux/amd64'}):
    replay.prepare_grader(trial, image)
record = load(trial / 'fresh-grader.json')
assert record['imageId'] == image and record['containerId'] == container
assert record['imageLayers'] == ['layer'] and record['platformOverride'] is None
assert record['createdBeforeActorCleanup']
assert not any(args[1] == 'start' for args in calls)
assert not (trial / 'agent/fresh-grader.json').exists()
`))

test('fresh grader preparation failure removes its container and retains dispatch evidence', (t) => run(t, `
import subprocess
from unittest.mock import patch
from evals.harbor.swebench import replay
trial = out.parent / 'prepare-failure'
trial.mkdir()
calls = []
def fake_docker(*args, **kwargs):
    calls.append(args)
    if args[0] == 'inspect':
        raise RuntimeError('injected Docker inspection failure')
    return subprocess.CompletedProcess(args, 0, 'b' * 64, '')
with patch.object(replay, 'docker', side_effect=fake_docker):
    try:
        replay.prepare_grader(trial, 'sha256:' + 'a' * 64)
        raise AssertionError('inspection failure accepted')
    except RuntimeError as error:
        assert 'injected' in str(error)
assert calls[-1][:2] == ('rm', '-f')
assert (trial / 'fresh-grader-prepare-dispatch.json').is_file()
`))

test('fresh grader cleanup rejects a container owned by another trial', (t) => run(t, `
import subprocess
from unittest.mock import patch
from evals.harbor.swebench import replay
trial = out.parent / 'unrelated'
trial.mkdir()
save(trial / 'fresh-grader.json', {'containerId': 'b' * 64, 'containerName': 'owned'})
unrelated = {'Name': '/owned', 'Config': {'Labels': {replay.LABEL: 'another-trial'}}}
with patch.object(replay, 'docker', return_value=subprocess.CompletedProcess([], 0, json.dumps([unrelated]), '')) as mocked:
    try:
        replay.cleanup_grader(trial)
        raise AssertionError('unrelated container accepted')
    except ValueError as error:
        assert 'ownership' in str(error)
assert mocked.call_count == 1
`))

test('fresh grader cleanup tolerates concurrent removal by its other finally block', (t) => run(t, `
import subprocess
from unittest.mock import patch
from evals.harbor.swebench import replay
trial = out.parent / 'concurrent-removal'
trial.mkdir()
container = 'b' * 64
save(trial / 'fresh-grader.json', {'containerId': container, 'containerName': 'owned'})
with patch.object(replay, 'owned_container', side_effect=[{'Id': container}, None]), patch.object(replay, 'docker', return_value=subprocess.CompletedProcess([], 1, '', 'already removed')) as mocked:
    replay.cleanup_grader(trial)
assert mocked.call_args.args == ('rm', '-f', container)
`))

test('official grading infrastructure faults and inconsistent rewards cannot count as model outcomes', (t) => run(t, `
row = plan['schedule'][0]
record = observation(row)
trial = out / record['trialDir']
save(trial / 'verifier/swebench-report.json', {'instance': {'resolved': True, 'infra_failure': True}})
assert not trial_observation(out, row, trial)['validExecution']
save(trial / 'verifier/swebench-report.json', {'instance': {'resolved': False, 'infra_failure': False}})
assert not trial_observation(out, row, trial)['validExecution']
(trial / 'verifier/reward.txt').write_text('0')
assert trial_observation(out, row, trial)['validExecution']
`))

test('a live actor pass cannot override a failed clean source-patch replay', (t) => run(t, `
row = {**plan['schedule'][0], 'caseId':'swebench-synthetic'}
record = observation(row)
assert not record['validExecution']
trial = out / record['trialDir']
fresh = trial / 'fresh-verifier'
fresh.mkdir()
save(fresh / 'swebench-report.json', {'instance': {'resolved': False, 'infra_failure': False}})
(fresh / 'reward.txt').write_text('0')
save(fresh / 'runtime.json', {'imageId':'sha256:' + 'a' * 64, 'credentialsCopied':False})
record = trial_observation(out, row, trial)
assert record['validExecution'] and record['functionalReward'] == '0'
assert record['actorStateFunctionalReward'] == '1'
(fresh / 'execution-error.txt').write_text('Docker infrastructure unavailable')
assert not trial_observation(out, row, trial)['validExecution']
`))

test('grading adapter preserves raw bytes and requires both resolved and parsed results from its SDK boundary', (t) => run(t, `
import types
from unittest.mock import patch
from evals.harbor.swebench import grade as adapter
directory = out.parent / 'adapter-input'
directory.mkdir()
row = {'instance_id':'synthetic', 'image':'synthetic', 'repo':'synthetic', 'version':'1', 'FAIL_TO_PASS':['fix'], 'PASS_TO_PASS':['stable'], 'log_parser':'synthetic_parser', 'eval_type':'pass_and_fail'}
save(directory / 'instance.json', row)
logs = directory / 'verifier'
logs.mkdir()
agent = directory / 'agent'
agent.mkdir()
(agent / 'final.diff').write_text('synthetic source patch')
# Small explicit fakes test adapter wiring and gating, not official SDK parsing
# semantics. The SDK and its wheel loader are outside this unit boundary.
modules = {name: types.ModuleType(name) for name in ('swebench', 'swebench.harness', 'swebench.harness.grading', 'swebench.types')}
modules['swebench.types'].TestSpec = types.SimpleNamespace
calls = []
def report(spec, prediction, path, include_tests_status):
    assert vars(spec) == {**row, 'eval_script_list': []}
    assert prediction == {'instance_id':'synthetic', 'model_patch':'synthetic source patch'}
    assert Path(path).read_text() == raw.decode('utf-8', errors='replace')
    assert include_tests_status is True
    calls.append('report')
    return {'synthetic': {'resolved': resolved}}
def parsed_logs(spec, path):
    calls.append('logs')
    return {'fix':'synthetic-sdk-status'}, parsed
modules['swebench.harness.grading'].get_eval_report = report
modules['swebench.harness.grading'].get_logs_eval = parsed_logs
with patch.dict(sys.modules, modules), patch.object(adapter, 'official_modules'):
    for resolved, parsed in [(True, True), (False, True), (True, False), (False, False)]:
        raw = b'non-UTF8 fixture: \\xff\\nSDK-owned parser input\\n'
        (logs / 'test-output.raw').write_bytes(raw)
        adapter.grade(directory, logs)
        assert (logs / 'reward.txt').read_text().strip() == ('1' if resolved and parsed else '0')
        assert (logs / 'test-output.raw').read_bytes() == raw
        assert '\\ufffd' in (logs / 'test-output.txt').read_text()
        assert load(logs / 'swebench-report.json') == {'synthetic': {'resolved': resolved}}
        assert load(logs / 'test-statuses.json') == {'parsed': parsed, 'statuses': {'fix':'synthetic-sdk-status'}}
assert calls == ['report', 'logs'] * 4
`))

test('freezes paired, alternating runs with identical task inputs and detects source drift', (t) => run(t, `
assert len(plan['schedule']) == 16
for case in plan['cases']:
    rows = [r for r in plan['schedule'] if r['caseId'] == case['id']]
    assert [r['variant'] for r in rows[:2]] == list(reversed([r['variant'] for r in rows[2:]]))
verify(out)
source = next((out / 'tasks').rglob('App.tsx'))
source.write_text(source.read_text() + '\\n// drift')
try:
    verify(out)
    raise AssertionError('changed task accepted')
except ValueError as error:
    assert 'Frozen inputs changed' in str(error)
`))

test('an unexecuted comparison stays inconclusive with every trial missing', (t) => run(t, `
report = aggregate(out)
assert report['comparison']['verdict'] == 'inconclusive'
assert all(r['outcome'] == 'not-run' for r in load(out / 'results.json')['runs'])
`))

test('a candidate without a real hook event cannot be credited for passing code', (t) => run(t, `
row = next(r for r in plan['schedule'] if r['variant'] == 'candidate')
record = observation(row, candidate_hook=False)
assert not record['validExecution']
save(out / 'observations.json', [record])
aggregate(out)
assert next(r for r in load(out / 'results.json')['runs'] if r['variant'] == 'candidate')['outcome'] == 'blocked'
`))

test('hook contamination in the control invalidates execution', (t) => run(t, `
row = next(r for r in plan['schedule'] if r['variant'] == 'baseline')
record = observation(row)
trial = out / record['trialDir']
(trial / 'agent/hook-audit.jsonl').write_text(json.dumps({'status': 0, 'output': '[haechi]', 'command': 'inject.mjs SessionStart'}) + '\\n')
assert not trial_observation(out, row, trial)['validExecution']
`))

test('functional passes alone do not become workflow evidence', (t) => run(t, `
save(out / 'observations.json', [observation(r) for r in plan['schedule']])
report = aggregate(out)
assert report['functionalMetrics']['candidate']['functionalPasses'] == 8
assert report['comparison']['verdict'] == 'inconclusive'
assert all(r['outcome'] == 'blocked' for r in load(out / 'results.json')['runs'])
`))

test('both sides passing every independently judged criterion is not an improvement', (t) => run(t, `
save(out / 'observations.json', [observation(r) for r in plan['schedule']])
report = aggregate(out, judge_all())
assert report['comparison']['verdict'] == 'inconclusive'
assert report['comparison']['completedRuns'] == 16
`))

test('a real grader failure overrides favorable semantic judgments', (t) => run(t, `
save(out / 'observations.json', [observation(r, reward='0' if r['variant'] == 'candidate' else '1') for r in plan['schedule']])
report = aggregate(out, judge_all())
assert report['comparison']['verdict'] == 'rejected'
`))

test('changed raw evidence and relabeled trials are rejected before aggregation', (t) => run(t, `
record = observation(plan['schedule'][0])
save(out / 'observations.json', [record])
record['variant'] = 'candidate' if record['variant'] == 'baseline' else 'baseline'
save(out / 'observations.json', [record])
try:
    aggregate(out)
    raise AssertionError('relabeled trial accepted')
except ValueError as error:
    assert 'relabeled' in str(error)
record['variant'] = plan['schedule'][0]['variant']
save(out / 'observations.json', [record])
(out / record['trialDir'] / 'agent/codex.txt').write_text('replaced evidence')
try:
    aggregate(out)
    raise AssertionError('changed evidence accepted')
except ValueError as error:
    assert 'evidence changed' in str(error)
`))

test('incomplete criterion judgments cannot turn into a passing comparison', (t) => run(t, `
save(out / 'observations.json', [observation(r) for r in plan['schedule']])
path = judge_all()
judgments = load(path)
judgments['runs'][0]['criteria'].pop()
save(path, judgments)
try:
    aggregate(out, path)
    raise AssertionError('missing criterion accepted')
except ValueError as error:
    assert 'Every criterion' in str(error)
`))

test('a final message without a completed model turn is not a valid execution', (t) => run(t, `
row = plan['schedule'][0]
record = observation(row)
trial = out / record['trialDir']
(trial / 'agent/codex.txt').write_text(json.dumps({'type': 'item.completed', 'item': {'type': 'agent_message', 'text': 'All verified'}}) + '\\n')
assert not trial_observation(out, row, trial)['validExecution']
`))

test('image metadata can vary but filesystem drift invalidates a comparison', (t) => run(t, `
rows = [observation(r) for r in plan['schedule'][:2]]
trial = out / rows[1]['trialDir']
(trial / 'agent/image-id.txt').write_text('sha256:' + 'c' * 64 + '\\n')
rows[1] = trial_observation(out, plan['schedule'][1], trial)
save(out / 'observations.json', rows)
aggregate(out)
save(trial / 'agent/image-layers.json', ['sha256:' + 'd' * 64])
rows[1] = trial_observation(out, plan['schedule'][1], trial)
save(out / 'observations.json', rows)
try:
    aggregate(out)
    raise AssertionError('different fixture layers accepted')
except ValueError as error:
    assert 'Fixture image changed' in str(error)
`))

test('judge packets preserve new regression files absent from git diff', (t) => run(t, `
row = plan['schedule'][0]
record = observation(row)
trial = out / record['trialDir']
source = trial / 'agent/final-files/tests/new-regression.tsx'
source.parent.mkdir(parents=True)
source.write_text('// Independently inspectable new regression assertion\\n')
record = trial_observation(out, row, trial)
save(out / 'observations.json', [record])
packets(out)
sample = load(out / 'judge-identities.json')[0]['sampleId']
assert (out / 'judge-packets' / sample / 'final-files/tests/new-regression.tsx').read_bytes() == source.read_bytes()
`))

test('subscription login is selected explicitly when there is no API key', (t) => run(t, `
from unittest.mock import patch
from evals.harbor.run import auth_mode
with patch.dict('os.environ', {}, clear=True):
    assert auth_mode() == 'login'
with patch.dict('os.environ', {'OPENAI_API_KEY': 'synthetic-unit-test-placeholder'}, clear=True):
    assert auth_mode() == 'api-key'
with patch.dict('os.environ', {'OPENAI_API_KEY': 'synthetic-unit-test-placeholder', 'CODEX_FORCE_AUTH_JSON': '1'}, clear=True):
    assert auth_mode() == 'login'
assert auth_mode('api-key') == 'api-key'
`))

test('explicit API-key mode masks an ambient Codex login file during dispatch', (t) => run(t, `
import asyncio
from unittest.mock import patch
import evals.harbor.run as runner
out = out.parent / 'api-key-comparison'
plan = freeze(argparse.Namespace(out=out, trials=2, model='openai/test-model', codex_version='0.153.4', auth_mode='api-key'))
synthetic_calibration()
async def fake_job(folder, frozen, job_id, case_id, agent):
    # Harbor resolves an explicit auth-file path before its force-login flag.
    # No credentials or model are used in this dispatch-boundary test.
    env = dict(runner.os.environ) | agent['env']
    assert env.get('CODEX_AUTH_JSON_PATH') == '', 'explicit API-key mode still selects ambient login file'
    record = observation(next(r for r in plan['schedule'] if r['id'] == job_id))
    return out / record['trialDir']
with patch.dict('os.environ', {'CODEX_AUTH_JSON_PATH': '/synthetic/login.json'}), patch.object(runner, 'runtime_check', return_value={}), patch.object(runner, 'job', side_effect=fake_job):
    asyncio.run(runner.execute(out))
assert len(load(out / 'observations.json')) == 16
`))

test('historical reports validate frozen harness bytes after the active checkout changes', (t) => run(t, `
from unittest.mock import patch
import evals.harbor.run as runner
if not (out / 'harness-source').exists():
    runner.shutil.copytree(runner.HERE, out / 'harness-source', ignore=runner.shutil.ignore_patterns(*runner.IGNORE))
changed_checkout = out.parent / 'changed-harness'
changed_checkout.mkdir()
(changed_checkout / 'run.py').write_text('# New harness version\\n')
with patch.object(runner, 'HERE', changed_checkout):
    try:
        verify(out)
        raise AssertionError('execution allowed changed active harness')
    except ValueError:
        pass
    assert aggregate(out)['comparison']['verdict'] == 'inconclusive'
source = out / 'harness-source/agent.py'
source.write_text(source.read_text() + '\\n# changed frozen source')
try:
    aggregate(out)
    raise AssertionError('changed archived harness accepted')
except ValueError as error:
    assert 'Frozen inputs changed' in str(error)
`))

test('output inside harness source is rejected before it can copy itself recursively', (t) => run(t, `
from unittest.mock import patch
import evals.harbor.run as runner
folder = (out.parent / 'isolated-harness').resolve()
folder.mkdir()
with patch.object(runner, 'HERE', folder):
    for target in [folder, folder / 'nested-output']:
        try:
            freeze(argparse.Namespace(out=target, trials=2, model='openai/test-model', codex_version='0.153.4'))
            raise AssertionError('unsafe output location accepted')
        except ValueError as error:
            assert 'outside the harness' in str(error)
assert not (folder / 'nested-output').exists()
`))

test('expanded suite preserves the current package and calibrates target-only fixtures', (t) => run(t, `
out = out.parent / 'expanded'
plan = freeze(argparse.Namespace(out=out, trials=2, model='openai/test-model', codex_version='0.153.4', suite='expanded', jobs=2, package_dir=package))
assert len(plan['cases']) == 8 and len(plan['schedule']) == 32
assert len(plan['calibrationFixtures']) == 6
assert plan['candidate'] == package_hash(package)
assert plan['snapshotManifest'] == inventory(package) == inventory(out / 'snapshot')
assert sum(c['agentTimeoutSec'] == 600 for c in plan['cases']) == 4
synthetic_calibration()
from evals.harbor.run import validate_calibration
validate_calibration(out, plan)
rows = load(out / 'calibration.json')
save(out / 'calibration.json', rows[:-2])
try:
    validate_calibration(out, plan)
    raise AssertionError('uncalibrated target-only fixture accepted')
except ValueError as error:
    assert 'Every selected fixture' in str(error)
`))

test('all canonical React and FastAPI fixtures freeze shared lock symlinks as ordinary files', (t) => run(t, `
from evals.harbor.run import HERE
expanded = out.parent / 'shared-locks'
frozen = freeze(argparse.Namespace(out=expanded, trials=2, model='openai/test-model', codex_version='0.153.4', suite='expanded'))
seen = set()
for case in frozen['cases']:
    fixture_id = case['fixtureId']
    stack = 'react' if fixture_id.startswith('react') else 'fastapi'
    name = 'package-lock.json' if stack == 'react' else 'requirements.lock'
    source = HERE / 'fixtures' / fixture_id / 'environment/workspace' / name
    shared = HERE / 'fixtures/shared' / stack / name
    assert source.is_symlink(), source
    assert str(source.readlink()) == '../../../shared/' + stack + '/' + name
    assert source.resolve() == shared.resolve()
    target = expanded / 'tasks' / case['id'] / 'environment/workspace' / name
    assert target.is_file() and not target.is_symlink(), target
    assert target.read_bytes() == shared.read_bytes() == source.read_bytes()
    seen.add(fixture_id)
assert seen == set(SUITES['expanded']) and len(seen) == 6
verify(expanded)
`))

test('calibration cannot be accepted after actual reward evidence changes', (t) => run(t, `
from evals.harbor.run import validate_calibration
synthetic_calibration()
row = load(out / 'calibration.json')[0]
(out / row['result'] / 'verifier/reward.txt').write_text('1')
try:
    validate_calibration(out, plan)
    raise AssertionError('stale calibration accepted')
except ValueError as error:
    assert 'Calibration evidence' in str(error)
`))

test('parallel dispatch is bounded and retains distinct paired observations', (t) => run(t, `
import asyncio
from unittest.mock import patch
import evals.harbor.run as runner
out = out.parent / 'parallel'
plan = freeze(argparse.Namespace(out=out, trials=2, model='openai/test-model', codex_version='0.153.4', jobs=2))
synthetic_calibration()
active = peak = 0
async def fake_job(folder, frozen, job_id, case_id, agent):
    global active, peak
    active += 1; peak = max(peak, active)
    await asyncio.sleep(0)
    record = observation(next(r for r in plan['schedule'] if r['id'] == job_id))
    active -= 1
    return out / record['trialDir']
with patch.object(runner, 'runtime_check', return_value={}), patch.object(runner, 'job', side_effect=fake_job):
    asyncio.run(runner.execute(out))
rows = load(out / 'observations.json')
assert peak == 2 and len(rows) == 16
assert len({r['trialDir'] for r in rows}) == 16
assert all(r['validExecution'] for r in rows)
`))

test('a started trial exceeding its frozen agent budget is a failure, not missing coverage', (t) => run(t, `
row = plan['schedule'][0]
record = observation(row, reward='0')
trial = out / record['trialDir']
save(trial / 'result.json', {'exception_info': {'exception_type': 'AgentTimeoutError'}})
(trial / 'agent/codex.txt').write_text(json.dumps({'type':'turn.started'}) + '\\n')
record = trial_observation(out, row, trial)
assert record['validExecution'] and record['budgetExceeded'] and not record['turnCompleted']
save(out / 'observations.json', [record])
aggregate(out)
result = next(r for r in load(out / 'results.json')['runs'] if r['caseId'] == row['caseId'] and r['trial'] == row['trial'] and r['variant'] == row['variant'])
assert result['outcome'] == 'fail' and 'budget' in result['reason']
`))

test('malformed evidence preserves a completed sibling regardless of pair order', (t) => run(t, `
import asyncio
from unittest.mock import patch
import evals.harbor.run as runner
for bad_index in [0, 1]:
    out = out.parent / ('bad-evidence-' + str(bad_index))
    plan = freeze(argparse.Namespace(out=out, trials=2, model='openai/test-model', codex_version='0.153.4', jobs=2))
    synthetic_calibration()
    bad_id = plan['schedule'][bad_index]['id']
    async def fake_job(folder, frozen, job_id, case_id, agent):
        record = observation(next(r for r in plan['schedule'] if r['id'] == job_id))
        trial = out / record['trialDir']
        if job_id == bad_id:
            (trial / 'agent/hook-audit.jsonl').write_text('{truncated')
        return trial
    with patch.object(runner, 'runtime_check', return_value={}), patch.object(runner, 'job', side_effect=fake_job):
        try:
            asyncio.run(runner.execute(out))
            raise AssertionError('malformed evidence accepted')
        except ValueError as error:
            assert 'evidence parsing' in str(error)
    records = load(out / 'observations.json')
    assert len(records) == 1 and records[0]['id'] != bad_id and records[0]['validExecution']
`))
