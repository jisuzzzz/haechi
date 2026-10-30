# Workflow observations

These seed records distinguish reports and regression tests from actual host-agent replay. They are evaluation inputs, not rules injected into future sessions. Add only task-relevant observations; preserve raw evidence and alternate explanations before proposing a lesson.

## F001 — Screen judgment relied on measurements

- Source: the user reported that screen checking judged numbers without directly comparing the images.
- Expected: open the original reference and app images for each checked state and judge visible defects alongside measurements.
- Evidence: source changes in `e06cd0121243ed1cc62c3c1ecc18cec9d9a9cd5e`, `agents/screen-design-checker.md` and `agents/screen-parity-checker.md`; `test/screen-report.test.mjs` covers blocked state reporting.
- Strength: user report and instruction/schema inspection. No original failing host transcript or paired live replay is saved here. The schema test does not prove the agent viewed an image.
- Suspected cause: prior guidance emphasized numeric comparison without a concrete direct-view requirement. Tool availability and missing input images are alternative explanations for a particular run.
- Decision: earlier instruction/schema changes are already merged; behavioral effectiveness remains unverified. Use the screen cases for a future paired comparison before claiming improvement.

## F002 — Exit-zero verification could imply tests ran

- Source: the earlier verifier printed completion after successful commands, including commands that could collect no tests.
- Expected: distinguish command execution from executed assertions and tested behavior.
- Evidence: `test/verify-default.test.mjs` contains the exit-zero/no-tests regression; the tool/output correction is in `e06cd0121243ed1cc62c3c1ecc18cec9d9a9cd5e`.
- Strength: deterministic command-output regression, not a model-behavior evaluation.
- Suspected cause: completion wording can encourage an unsupported conclusion; whether a model actually draws it needs a trace.
- Decision: the tool correction is already merged. Pair zero-tests with a real passing-assertion case when evaluating reporting guidance. Do not infer that all successful commands are untrustworthy.

## F003 — Path aliases inflated evidence coverage

- Source: independent review while implementing `eval-report.mjs` reproduced one physical trace being counted as several trials through Windows filename case aliases.
- Expected: one physical evidence artifact cannot stand in for separate executions.
- Evidence: `test/eval-report.test.mjs`, hardlink and Windows case-alias cases. Both returned `supported` before the fix and `inconclusive` after it in this session. All 15 scoped tests then passed. The sandbox itself prohibited creating a hardlink; the red/green checks used ordinary host permissions in temporary folders.
- Confirmed cause: deduplication used resolved path strings rather than filesystem device/inode identity.
- Decision: corrected the comparison tool and kept the regressions. This is a deterministic local bug fix, not evidence for a new general instruction or a model-behavior improvement. See [the pilot decision](pilot/decision.md) for the separate prompt-only comparison.
