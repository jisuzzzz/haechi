---
name: feature
description: Feature playbook for new behavior and deliberate changes to existing behavior — scope, spec when needed, design source and external dependencies first, shared parts first, then build and check every acceptance criterion by behavior. Use for /haechi:feature, when the user asks to add behavior or change how something already works.
---

# Feature playbook (new and improve)

The main session runs these steps. Scope, delegation, authorization and completion requirements are in the session rules; this file adds only what is specific to features. Principle files are two levels above this skill's folder (`<this skill's folder>/../../principles/<name>.md`): **dry**, **yagni**, **kiss** and **boundary-validation** apply.

## Task focus

- **New:** establish who uses it, in what situation, and how far it goes. Example: "A signed-in user can export the visible invoice list as CSV; filters apply, pagination does not."
- **Improve:** identify what should change and what should stay as it is. Reuse the user's requirements and repository decisions; ask only when an unresolved behavior or scope choice would materially change the result.

## Steps

1. **Clarify the task.** Use the focus above and keep any summary proportional to the task; fixed labels and tables are optional.
2. **Acceptance criteria.** Use the requirements already established in the conversation and repository. Run /haechi:spec when the user asks for a spec or consequential behavior or scope choices remain unresolved. Settled requirements can stay as acceptance criteria in the conversation; no separate document or approval is needed.
   Resolve consequential open questions before dependent work. Choose reversible implementation details yourself and continue independent work.
3. **Design reference.** When the user explicitly requests a UI preview or mockup, run /haechi:preview even when the requirements are otherwise settled; no saved spec is required. Use a supplied design or relevant existing screen when available. When the user asks you to design a screen, draft it using repository patterns and the stated requirements. Ask only about consequential ambiguity; optional variants can help when a choice is hard to describe.
   Keep the reference or stated design criteria available for checking the rendered screen.
4. **External dependencies.** Check that the backend API or other service supports every field and parameter the feature needs (for example, does `GET /api/orders` accept `status`?). For version-dependent decisions, check the installed version's official documentation or source. If support is missing, establish whether the authorized scope includes adding it. Ask before a workaround or scope change that alters the promised behavior; continue independent work.
5. **Plan.** Choose units, file ownership, shared contracts, and a check method paired with each acceptance criterion. Delegate when independent work or separate context makes it useful; keep tightly coupled work together. Build settled shared behavior before its consumers. Resolve reversible structural choices yourself; ask when unifying behavior would change an unresolved product policy.
   Ground the plan in the relevant entry points, reusable implementation, existing tests and contracts that must stay unchanged. Carry only the findings the work needs; no separate investigation document or agent is required. Summarize the plan when it helps explain the work. No approval needed.
6. **Shared contracts and shared parts.** Settle and verify the shared interfaces before dependent units start. Assign their files to one owner so parallel edits cannot conflict. Commit completed change units under the session rules.
7. **Build.** Main or implementers by the delegation rules.
8. **Attack.** Check sibling paths (`/haechi:sibling-path-map`). Use adversarial-tester when an independent challenge is valuable for the behavior's risk or complexity. Do not invent consequential behavior in a test when the requirements leave it unresolved.
9. **Verify and review.** Repo verify, then /haechi:review-diff by the main session, or verifier when the session rules call for it.
10. **Check outside behavior.** Inspect changed screens in a real render against the reference or stated design criteria, opening the captured images to compare their appearance as well as checking structure and measurements. Choose states and interactions relevant to the change; report gaps in that coverage. Use screen-design-checker for an independent comparison only when its supported reference is available: a design-tool URL, screenshot or variant URLs. For a draft with written criteria alone, the main agent checks those criteria in the real render and reports the evidence; no design source is required. For improvements, compare behavior that should stay the same with the previous version; use screen-parity-checker when it adds useful independent evidence. API-only changes: look at a real response.
11. **Match acceptance criteria.** For each criterion, the evidence: a test name or a screen-check result. A missing criterion is "not done" with a reason.
12. **Show the user.** If a visible screen changed, show it before any push.
13. **Finish.** Local commit, then report the changed behavior and its evidence. If a spec was saved, move its conclusions into the feature's canonical doc, preserving unchanged contracts and exception cases; remove a temporary dated spec after merge when cleanup is authorized.

## Extra DONE evidence

A behavior check for every required behavior — a test or a real render that exercises it. Reading a setting or a flag does not count.


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
