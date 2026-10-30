---
name: eval
description: Evaluates proposed skill, agent or workflow changes against recorded failures and unchanged behavior before adoption. Use when asked to evaluate agent behavior, collect failure causes or improve haechi from evidence; not for ordinary application tests or performance measurements.
---

# Evaluate workflow improvements

The main agent chooses the cases, jobs and candidate changes. Workers choose their methods within those jobs. This skill runs when relevant to the requested task; it adds no background observer, automatic memory injection or required stage to other playbooks.

The tools folder is two levels above this skill's folder (`<this skill's folder>/../../tools/`). Read [the protocol](references/protocol.md) for the plan and result formats. [Case examples](references/cases.md) supply starting points, not a mandatory suite.

## Collect observations before lessons

Record a failure as an observation: the request, expected behavior, actual action, version and conditions, raw trace or artifact, and the first wrong decision if the evidence shows it. Separate the observed fact from a suspected cause. An unavailable tool, contradictory requirement or missing permission may explain the result without a prompt defect.

Keep observations in a durable evaluation folder named in the task or chosen inside the current repository. Store sanitized cases and decision records there; keep sensitive raw traces out of tracked files. Deduplicate repeated reports of the same run. A remembered incident is evidence to investigate, not an instruction for later agents. Read only the relevant records when this task needs them.

## Evaluate, then change

1. **Define the behavior.** Turn the failure into a realistic task with observable pass/fail criteria. Include a normal or neighboring case that a tempting fix could break. Use actual traces when available; label invented scenarios and missing evidence. Freeze a case not used to write the candidate as a regression check.
2. **Freeze the comparison.** Save `plan.json` before running either side: hypothesis, immutable baseline and candidate identifiers, conditions, at least two trials per side and case, tasks and criteria. Snapshot the relevant instructions, tools and fixtures. Compute the plan hash with `node <tools>/eval-report.mjs --hash <plan.json>` and record it before dispatch. If the candidate is a not-yet-written proposal, collect baseline runs first, then freeze a new complete plan before comparing; do not relabel exploratory runs as that comparison.
3. **Run fresh contexts.** Give each trial only its variant, task, relevant fixtures, scope and allowed tools. Do not supply the expected answer or another trial's output. Match model, harness, tool access, budget and fixture state across sides; alternate their order. Subagents or separate host sessions can run trials. If the host cannot isolate them, record the limitation and leave the comparison inconclusive. Never claim a simulation is a real tool or visual run.
4. **Judge observed actions.** Use deterministic checks when they measure the actual outcome. For semantic behavior, give an independent evaluator the frozen criteria and raw traces with variant identities hidden. A pass requires all criteria; a missing capability is blocked, and an unexecuted trial is not-run. Save a separate trace artifact for each trial and a reason for every judgment. Without independent semantic judgment, record the gap and do not adopt from that comparison.
5. **Compare.** Run `node <tools>/eval-report.mjs <plan.json> <results.json> --json`. The tool checks completeness, evidence availability and paired judgments. It does not grade model behavior or prove that a trial ran. Inspect the traces and the judgment reasons before accepting its summary.
6. **Form one candidate.** When baseline failures reproduce, group them by a cause supported by evidence, not just similar wording. Try a narrow fixture, tool, job-context or skill correction before proposing a general rule. Keep the candidate small and evaluate it using steps 2–5. Do not tune the criteria or remove a failing regression after seeing results; a changed plan starts a new comparison and keeps the old result.
7. **Decide and record.** A supported report is necessary evidence, not automatic permission. Check that the improvement justifies its added context and maintenance cost and that the independent evaluation supports the claim. Within an authorized improvement task, apply the supported change locally, run the relevant playbook checks on the final files, and commit it. Confirm that final files match the evaluated candidate; reevaluate changed behavior. Rejected or inconclusive candidates remain observations with the result and a condition for revisiting them, without edits to active guidance.

## What persists, and when

Save an observation when the failure is found. Save a candidate and evaluation decision after the comparison. Active guidance changes only after supported reevaluation and final-file verification, within the existing authorization. Prefer the affected skill, reference or tool; this workflow does not authorize increasing the always-on rules, pushing, opening a PR, merging or deployment.

There is no scheduled self-rewrite and no learning of model weights. Later evaluation jobs may read relevant failure records and decision history. A single failure never silently becomes a permanent rule. Two repeatable trials are a conservative screening floor, not statistical proof; widen cases or repetitions when the intended claim needs it.

## Report

State the observed failures and cause evidence, compared snapshots and plan hash, actual run counts, per-case results, blocked or unrun coverage, independent judgment and adoption decision. Name what changed locally and what remains a hypothesis. A missing behavioral evaluation is `implemented · unverified`, not evidence that a prompt improves outcomes.
