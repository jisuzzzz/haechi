# Real-repository SWE-bench tasks

`selection.json` pins dataset revisions and base commits for four JS/TS issues and two Python issues selected before observing results. This is not a full benchmark score. Agents receive the original issue and pre-fix environment, but not reference patches, official tests or grading modules.

## Prepare local payloads

Requirements: Python 3.12+, Docker amd64 support and official task images. `requirements.lock` records the data-preparation environment. Do not commit task payloads or duplicate wheels.

```sh
python -m pip download --no-deps --dest /tmp/swebench-wheels swebench==5.0.2 unidiff==0.7.5
python -m evals.harbor.swebench.prepare \
  --rows /absolute/path/to/selected-rows.json --wheels-dir /tmp/swebench-wheels \
  --fixtures-dir /tmp/haechi-real-fixtures
python -m evals.harbor.run freeze --suite swebench-real --jobs 2 --trials 2 \
  --auth-mode login --fixtures-dir /tmp/haechi-real-fixtures \
  --out evals/harbor/runs/real
python -m evals.harbor.run calibrate --out evals/harbor/runs/real
python -m evals.harbor.run run --out evals/harbor/runs/real
```

`selected-rows.json` is a local JSON array containing the pinned dataset rows plus official SDK grading fields such as `image`, `eval_script`, `log_parser` and `eval_type`. The fields read by `prepare.py` must match the conditions in `selection.json`. Because this file contains solutions and grading information, do not provide it to agents or include it in public PRs. Known wheel hashes are in `wheels.json`.

You may reuse generated fixtures from the preserved local source. Pass that source's `evals/harbor/fixtures` path to `freeze --fixtures-dir`. To also compare the exact historical package, explicitly provide its preserved snapshot with `--package-dir` and check the [evidence index](../evidence-index.json) hashes. The current default `dist/codex` is not the package evaluated then.

`prepare` does not overwrite existing tasks. It saves prepared image, source-row and configuration-patch hashes to `prepared-images.json` in the selected fixture directory. Keep SDK wheels and test dependencies on the verifier side only.

## Setup conditions and grading

The default models first use. Waiting for initial setup counts toward the coding budget. For the configured condition, use `freeze --setup-profile configured` in a new output directory. Both sides receive identical repository commands, synthetic-data facts and user settings; the setup conversation is outside this condition.

Each coding session uses the same model, reasoning `medium` and a 600-second limit. There is no total-token cap; actual usage is recorded. Official grading runs in a fresh container from the original pinned image with only the source patch applied. Do not copy the agent's dependency changes or credentials.

Check both F2P tests (expected to pass after fixing the issue) and P2P tests (existing tests that must keep passing). Separate functional results from independent judgments of reporting accuracy. Missing execution, grading or judgment is insufficient evidence, and both sides succeeding does not establish superiority. Do not generalize six issues with two trials to overall model or Haechi performance.

Related tools: `prepare.py` materializes inputs; `grade.py` integrates the official SDK; `replay.py` grades source patches in fresh environments; `configured/` contains repository-specific setup commands. Regression checks use temporary fixtures and explicit fakes at the SDK boundary, without models or network calls. They do not constitute fresh validation of the entire official SDK.
