# Bootstrap diagnostic — 2026-10-30

Decision: **inconclusive**. Both instruction bundles passed all four assigned trials. No repeated target failure was observed in the baseline, so the comparison supplies no evidence that attaching evaluation guidance improves these outcomes.

| Constructed case | Baseline | Candidate |
|---|---|---|
| Retaining one unavailable-tool incident | 2/2 pass | 2/2 pass |
| Keeping an ordinary parser fix scoped | 2/2 pass | 2/2 pass |

## What ran

- Eight fresh subagents, one prompt-only decision per context. The same inherited model/settings and permitted snapshot-read operation applied to each side. No application code or host integration was exercised.
- Baseline: saved feature guidance, 5,663 bytes. Candidate: the same guidance plus the new optional eval skill, 11,630 bytes. This tested adding instructions to a decision context, not the installed plugin's end-to-end execution.
- The tasks and criteria in `plan.json` were frozen before dispatch. Snapshot hashes still match `baseline.md` and `candidate.md`. Plan SHA-256: `d5aed99034b123b4a12b95fddb65cb736a8f269ab177e03d606e2787333e9138`.
- A separate fresh evaluator (`/root/pilot_judge`) received the frozen criteria and responses without the snapshot identities or mapping. Every sample passed. `results.json` retains the reasons; `dispatch.json` reveals the executor mapping after judgment. Final responses are in `traces/`; `report.json` contains the comparison output and artifact hashes.
- The candidate was not tuned after these outputs. The parser task was constructed after the instruction snapshots and was not used to write them.

## Limits and consequence

These are constructed scenarios and saved final responses, not full host transcripts or live failures. The exact inherited model identifier was unavailable. The requested 180-word response limit was advisory: s01/s05 used 184 words and s02 used 183, as recorded in the dispatch log. No claim about runtime, token cost, long-term memory or general behavioral improvement follows.

Do not add a learned permanent rule or attach eval guidance to the feature workflow from this result. The user-requested on-demand evaluation infrastructure is implemented as a separate capability; that implementation is not evidence of its effectiveness. Keep the failure observations and use a real, reproducible failure plus neighboring cases for the next improvement proposal. No automatic guidance adoption occurred.
