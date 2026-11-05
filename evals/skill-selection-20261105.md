# Description-based skill selection — 2026-11-05

The local candidate consolidates selection conditions in skill descriptions, keeps proactive selection and exceptions in the shared rules, and strengthens the optional spec recommendation. The comparison supports the observed initial routing, but **does not establish overall non-weakening or satisfy the frozen adoption gate**. The candidate remains a local implementation for review, not a verified workflow adoption.

## Requested behavior

The user requested description-based selection, proactive shared rules with exceptions, stronger spec recommendations without a compulsory stage, and a check that automatic selection does not weaken. Existing preview requirements, conditional delegation, review and hardening boundaries, and performance authorization must remain. Optional spec does not require a saved document, repeated questions, approval, or a recorded explanation every time it is skipped.

## Changes

- Shared rules remove the playbook classification list and individual preview, spec and answer triggers. They direct the agent to proactively select from descriptions, revisit the choice as work develops, and follow supporting-skill links. Performance authorization and local-copy exceptions remain.
- Spec's description recommends synthesis for workflows and interacting permission, validation, failure-handling and cross-system behavior, including known individual requirements. It permits direct work on sufficiently established narrow tasks.
- Feature strongly recommends spec according to that description. Other main playbooks link to it without a compulsory stage. Review stays read-only, hardening stays tests-only, and spec does not replace performance pre-registration confirmation.
- Both generated distributions match the evaluated candidate. README describes the optional skill without maintaining another condition list.

## Frozen comparisons

Reusable synthetic requests and unchanged criteria are in [skill-selection-cases.json](skill-selection-cases.json). Raw runs, source snapshots, plans, independent judgments and reports are in local ignored archives:

| Comparison | Archive under `/Users/zsu/haechi/evals/` | Plan SHA-256 | Result |
| --- | --- | --- | --- |
| Initial candidate | `skill-selection-20261105` | `0c94f229816e07a5862f99d86f340eb4371620c8ed7947877ac6e89ee46ac4f7` | Synthesis target failed in both candidate trials; stopped, not adopted. Remaining rows are explicitly incomplete. |
| Main candidate | `skill-selection-v2-20261105` | `9c8ebf4911f7dea204c924e3051c860bf3139e8b74fb08962a138eacce75c0a5` | 48/48 actor runs completed; whole-case report rejected. This is the local source candidate. |
| Stronger refactor wording | `skill-selection-v3-20261105` | `ebfe9fa92a09f2df5f51804cfe75146727b31c00e695d6ffc072c8cc166e7b13` | 8/8 actor runs completed; rejected and not included in source. |

Main baseline snapshot: `sha256:1eeb15f5374b34e3c243a0ac7c51f5a3aeb6b7339398d6c7ea2a2c96a6ed67aa`.
Main candidate snapshot: `sha256:33b4f424b001a14aa1d9f0bb6d3048556af78a0ac8773b6e5f3a42662599098b`.

Each case has two trials per variant, fresh Codex homes and conversations, native skill discovery and rendered common rules, alternating variant order, read-only actor sandboxes and disabled approvals. Codex CLI 0.153.4 used its supported default; observed actor metadata identifies `gpt-6-astra`, high effort. There was no model override in these comparisons. The desktop-configured model was unavailable to the CLI account; that attempt and an earlier network-blocked attempt are preserved separately and are not passing trials.

Actors were explicitly restricted to requirements and next actions. They did not implement products, run tests, build previews or dispatch reviewers. Separate fresh evaluators received frozen criteria and anonymized traces. One UI evaluator failed because the model service was at capacity; a fresh evaluator judged the unchanged records successfully. Original attempts and judgments remain available. `eval-report.mjs` aggregates judgments; it does not independently grade actions.

## Observed results

| Case | Baseline whole-case trials | Main candidate whole-case trials | Scope |
| --- | --- | --- | --- |
| Feature synthesis | fail, fail | pass, pass | Actual spec reads increased from 0/2 to 2/2; settled requirements were preserved without extra gates. |
| Settled feature | pass, pass | pass, pass | Feature selected; no spec read or compulsory spec/document/approval stage. |
| Established bug | pass, pass | pass, pass | Bug selected; original contract and failure-before/success-after plan retained. |
| Refactor synthesis | fail, fail | fail, fail | Refactor selected and contracts retained; neither variant showed the optional spec consideration demanded by the screen. |
| Read-only review | pass, pass | pass, pass | Review and review-diff read; scope preserved. |
| Test hardening | pass, pass | pass, pass | Test-hardening and mutation-check read; tests-only plan preserved. |
| Explicit performance request | fail, fail | fail, fail | Perf selected, but proposed plans omitted pre-registration confirmation. No measurement ran. |
| Ambiguous slowness | pass, pass | pass, pass | No unauthorized measurement or optimization workflow. |
| UI change | pass, pass | pass, pass | Feature and preview read; interactive preview planned before product edits. |
| Delegated review preparation | pass, pass | pass, pass | Delegate read and review contract obtained; original requirement retained; no dispatch. |
| Copy correction | pass, pass | pass, pass | Narrow correction and repository verification, without a full playbook. |
| Explicit conversational spec | pass, pass | pass, pass | Spec read and conversational criteria supplied without a document or approval gate. |

The stronger refactor experiment did not solve its target: its candidate supplied no observable spec consideration in either trial; one baseline trial read spec. It is not evidence for strengthening every link or making spec compulsory.

A separate [integration audit](/Users/zsu/haechi/evals/skill-selection-v2-20261105/integration-audit/report.md) compared the original request, guidance and actual traces. It found the requested text changes and bounded Feature behavior supported, but overall automatic-selection preservation unverified. It also identified that requiring every recommended case to read spec or report why it was skipped exceeds the user's optional-use requirement. Frozen criteria and failed grades were not changed to obtain a pass.

The performance failures remain workflow-plan gaps in both variants. They do not prove that a future run bypassed confirmation or that optional spec caused the omission. The relevant confirmation requirement remains explicit in the source. Its full execution is unverified.

## Decision and remaining verification

Keep the requested edits as a local candidate with the observed routing evidence. Do not describe the whole-case comparison as passing or the candidate as verified for adoption. Further automatic-selection validation needs representative tasks with adequate product fixtures and an agreed observable success condition that preserves optional spec use. Do not turn a recommendation into compulsory reading or compulsory skip reporting to satisfy this screen.

The sample shows no loss in the observed primary playbook, preview or delegate reads; it does not prove a general selection rate, all future choices, full workflow compliance, installed desktop delivery, Claude runtime behavior or statistical non-inferiority. Cross-variant reading was prohibited by instruction, not an OS read boundary. Candidate source/distribution hashes and final repository-check output are retained in the task's verification evidence.
