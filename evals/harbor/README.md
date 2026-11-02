# Shared Harbor evaluation runner

Run the same React/FastAPI fixtures and real SWE-bench JS/TS/Python issues with and without Haechi under matched conditions. Requirements: Python 3.12+, Docker Engine/Compose and Node.js 24. Harbor is pinned to 0.25.0; the default Codex CLI version is 0.153.4.

This public directory contains reusable code and six custom tasks only. Generate execution logs, package copies, evaluator packets, and real-repository solution/grading payloads locally. Historical conclusions and original evidence locations/hashes are in the [evaluation results](../../docs/evaluation-results.md) and [evidence index](evidence-index.json). No new model evaluation was run as part of that distribution cleanup.

## Install and run

```sh
python3.12 -m venv /tmp/haechi-harbor
/tmp/haechi-harbor/bin/pip install -r evals/harbor/requirements.lock
/tmp/haechi-harbor/bin/python -m evals.harbor.run preflight
/tmp/haechi-harbor/bin/python -m evals.harbor.run freeze \
  --out evals/harbor/runs/local --model openai/gpt-6-astra --trials 2
/tmp/haechi-harbor/bin/python -m evals.harbor.run calibrate --out evals/harbor/runs/local
/tmp/haechi-harbor/bin/python -m evals.harbor.run run --out evals/harbor/runs/local
```

`run` consumes model usage. Prepare Codex login or an API key, and pin authentication with `freeze --auth-mode login|api-key` when needed. Preflight does not print credentials or prove successful model access.

- `smoke`: four tasks, two conditions and two trials per condition: 16 model sessions, each limited to 300 seconds.
- `expanded`: adds request ordering, CSV pagination, tenant caching and atomic reservations: eight tasks and 32 sessions. Added tasks have a 600-second limit.
- `swebench-real`: six real-repository issues. Follow the [separate preparation procedure](swebench/README.md) to create local fixtures first.

Use `freeze --suite expanded --jobs 2` for the expanded suite. Limit concurrency to one or two runs and alternate the starting condition between trials. To retain an earlier package, provide `--package-dir /absolute/path/to/saved-package`. The default is the current `dist/codex`, not necessarily the package used in a historical evaluation.

## Freeze and calibrate first

Before any model run, `freeze` saves the tasks, criteria, model, budgets, condition order, and package/harness file hashes. Each execution starts in a fresh container. The baseline has no Haechi; the Haechi condition receives real hooks/skills for the same task. Host configuration and plugins are not loaded. Actual SessionStart delivery is audited separately.

`calibrate` does not call a model. It verifies that the original buggy source fails and the supplied fix passes for every selected fixture. Missing calibration or changed input/reward files block execution. Code changes require a new plan; do not revise criteria after seeing results.

Keep one shared lockfile per React/FastAPI environment in `fixtures/shared/`. Freeze materializes source-fixture relative symlinks as regular files for the Docker build context. Use this preparation instead of building Docker images directly from the source fixture directories.

## Separate execution and judgment

```sh
/tmp/haechi-harbor/bin/python -m evals.harbor.report packets --out evals/harbor/runs/local
/tmp/haechi-harbor/bin/python -m evals.harbor.report report \
  --out evals/harbor/runs/local --judgments /absolute/path/to/judgments.json
```

Give the independent evaluator only `judge-packets/`, not the run mapping or `judge-identities.json`. Command traces may reveal Haechi usage, so do not claim complete blinding. Checks run later by the harness do not prove that the agent performed its own verification.

Judgment files must cover every criterion exactly once.

```json
{"evaluator":"Independent evaluator and method","independent":true,"runs":[{"sampleId":"sample-...","reason":"Observed evidence","criteria":[{"index":0,"passed":true,"reason":"Trace location and supporting evidence"}]}]}
```

A favorable textual judgment cannot reverse a functional failure. Missing execution, judgment or hook delivery leaves the evaluation incomplete. Both conditions passing is insufficient evidence of improvement. Exceeding the budget after an agent actually starts is a failure, distinct from infrastructure errors that prevent startup. Two trials do not establish general reliability or statistical significance.

For real repositories, official F2P/P2P checks run in a fresh container from the same initial image with only the source patch applied, separately from results in the agent-modified environment. Record image IDs, layers, elapsed time and token usage separately from outcomes. Cost is not always available. Do not automatically adopt Haechi rules based on results.

## Preserve evidence

Write outputs to ignored `runs/` directories or outside the repository. Do not include snapshots, jobs, traces, judge packets, generated SWE-bench fixtures or wheels in public commits. Select only concise conclusions, reproduction conditions and evidence identifiers. Preserve original evidence separately in local storage.

Do not automatically rerun an interrupted Harbor job that lacks collected results. Verify inputs with `verify`, inspect the preserved actual results, then resume. Reports check frozen harness and file hashes; current code changes must not be retroactively attributed to historical measurements.
