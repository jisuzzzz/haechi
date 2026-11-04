# Skill guidance behavior evaluation — 2026-11-04

The paired screening supports the revised request routing. It also finds no candidate failure in the tested UI, writing and mutation decisions. This does not establish a general improvement in preview selection or writing quality: the baseline already passed those selection and writing cases.

## Comparison and evidence

- Baseline: `git:0db9c6bda048269e1ef10a1cf56d6c6d168007d8`.
- Candidate: `git:b52c1d08cb6db1f6dd6e6e0eaf1232fee4a8e9bd`.
- Frozen plan SHA-256: `2202d7fd2e2447214d1f102fd3112370d9dedacbc096208f19d638907f830c07`.
- Report verdict: `supported`; report SHA-256: `6bd6e941bdd7f70b253f0e92d57addbee690c996375f0cd0d54d688cd7a8ad5c`.
- Local ignored archive: `/Users/zsu/haechi/evals/skill-guidance-20261104`.
- Evidence inventory: `evidence-manifest.json`, SHA-256 `4772f4273fd3af16206279a526c8082ddd0ef36196561b89ce324a9def0697ab`.
- Retrieval checked: 32 archived trials, 40 completed actor turns, no actor timeout or nonzero final exit; both 121-file instruction manifests and the frozen plan remain unchanged.

The archive contains plan, fixtures, dispatch order, source snapshots, raw session records, compact execution traces, final artifacts, independent judgments, screenshots, functional replays, results and report. Paths below resolve inside that archive. Raw evidence is deliberately not tracked in Git.

## Method

Eight synthetic cases, two trials per variant and case, with alternating variant order. Every trial starts a fresh Codex home and conversation. Two cases have a follow-up in the same trial. Codex CLI 0.153.4 used its observed default `gpt-6-astra` with the existing `high` effort setting. Actual turn metadata confirms identical model, effort, workspace-write sandbox, disabled network for shell commands and `approval_policy=never` across all 40 actor turns.

Native `.agents` skill discovery uses the frozen variant; the common rules are rendered into each fixture's AGENTS.md. Separate evaluator contexts receive the original criteria and anonymized traces/artifacts, with variant mapping withheld. Evaluators use the same model/effort with read-only sandbox and approvals disabled. The main session inspected per-criterion evidence and replayed UI interactions and relevant tests. `eval-report.mjs` aggregates these judgments; it does not independently grade behavior.

## Per-case outcomes

| Case | Baseline trials 1, 2 | Candidate trials 1, 2 |
| --- | --- | --- |
| ui-row | fail, pass | pass, pass |
| ui-tooltip | pass, pass | pass, pass |
| writing-chat | pass, pass | pass, pass |
| writing-doc | pass, pass | pass, pass |
| request-fact | fail, fail | pass, pass |
| request-bug-reply | fail, fail | pass, pass |
| mutation-weak | pass, pass | pass, pass |
| mutation-simple | pass, pass | pass, pass |

These are whole-case judgments: a routing failure need not imply a bad document.

- **Preview selection:** all four candidate UI trials read preview before product edits; all four baseline UI trials also did. The sample does not reproduce the user's earlier selection failure or establish its cause.
- **Connected UI:** candidate row previews support hover, pointer transfer, rename, saved row result and Escape; tooltip previews support hover, focus, pointer transfer and Escape. Scope remains within the requested component and necessary surroundings. Host Playwright replays pass all four candidate UI trials. Baseline R01's preview fails Escape after hover without focus, although its product HTML passes; the second baseline row trial passes. One failure is not repeatable evidence of a general improvement. See `runs/R01/host-ui.json` and candidate R02, R03, R05, R08.
- **Writing:** all four candidate and four baseline trials preserve facts, conditions, units, quoted literals and uncertainty in Korean chat and README text. Candidate follow-up summaries do not reread unchanged writing guidance. This supports retaining behavior after removing plain, not improved readability in every setting or a measured token/latency saving.
- **Requests:** both baseline fact-question trials and both baseline bug-report trials omit the request skill, while still producing factually compliant documents through other guidance. Candidate trials select request in all four cases. Reply updates stay in the same file, attribute the committed transaction to the backend report, preserve nondeployment and do not claim independent DB inspection or send anything.
- **Mutation decisions:** both variants execute six meaningful defects before and after strengthening weak tests; initially surviving boundary and verification defects become assertion failures. Independent host replays confirm unchanged product source, passing original code, and failures for `>= 18` changed to `> 18` and removal of verification. Both variants add exactly one requested simple test without mutation execution or UI preview. Reading test-hardening guidance is not counted as running mutation-check.

## Evidence repairs and limits

The runner completed every actor execution, but its archive step used a copy option unavailable under system Python 3.7. A separate Python 3.12 collector archived the preserved outputs without rerunning actors. The error remains in `execution.jsonl`.

The first bug-reply judgment marked candidate R24 blocked because compact CLI events omitted the initial document body. Its original session tool input and successful write record remained available. Original tool calls were supplied uniformly for all four bug-reply subjects to a fresh evaluator, without the first verdict or variant mapping. The initial judgment remains in `judgments/initial/`; the supplementary records are `runs/R21` through `runs/R24/raw-tool-calls.jsonl`. No actor, task, criterion or final artifact was changed. One rejudge launch could not reach the model from the outer sandbox; its logs remain in `judgments/network-failed-recheck/`. The successful rejudge retained the read-only evaluator sandbox.

Actor browser launch was unavailable under macOS sandboxing. A broad automatic-approval attempt was rejected; actor permissions were not widened. Separately approved, fixed host Playwright probes opened only local artifacts and blocked external requests. They establish the generated UI's behavior, **not** that actors rendered it before implementation. That full preview workflow remains unverified. Desktop installed-plugin delivery is also unverified: this comparison tests CLI discovery with injected common rules.

Fresh homes and conversations isolate context, but cross-snapshot reads are prohibited by instruction rather than an OS read boundary. No comparative instruction leakage was identified in inspected commands. Two repetitions per case are a screening floor, not statistical reliability. Korean chat and README samples do not cover all languages, output types, animations, UI frameworks or every feature/spec/MR route. Fixture `npm run check` checks structure only; it is not behavior evidence. There was no human readability study.

## Decision and maintenance cost

Retain the already authorized local candidate at the evaluated revision. Repeated evidence supports request routing; UI, writing and mutation results support only the tested behaviors and preservation of behavior. No further active-guidance change was made during evaluation. Revisit preview reliability with a captured real missed-selection request and a host that supports the complete pre-implementation browser workflow; revisit writing claims with broader tasks and human feedback.

The common rules add one UI trigger and expand the writing paragraph. The detailed clear-writing principle replaces the plain skill; existing skill links point to it as needed. This avoids adding another per-response workflow. Both candidate chat follow-ups reused their context, but overall loading cost was not benchmarked.

The implementation's prior repository checks passed: generated-file check and 34 targeted tests. This evaluation adds a decision record only; its final `npm run check` is recorded in the task evidence. No installation, push or publication was performed.
