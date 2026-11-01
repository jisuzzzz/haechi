# Core validation and retained local evidence

This release carries outcome-based completion guidance, minimal shared work records with native Codex/Claude session links, and situational A/B/C answers. It adds no fixed agent sequence or centralized graph executor. Completed tasks leave the default view; stale unfinished tasks are flagged without deletion or reassignment. Provider sessions retain the conversation history.

The original cumulative work is preserved locally on `codex/evidence-based-completion` at `e7994fe093cc9ab98d7383a0c454ec1e0341212b`. This branch is deliberately not published. Paths below resolve inside the local checkout of that revision. A local path/hash is a retention receipt, not public access to the underlying evidence. Do not claim the unpublished experiments were independently reproduced by this release.

## Behavioral checks

- `node --test test/verify-default.test.mjs` checks executed-test summaries, empty/skipped checks and failed assertions hidden by successful wrapper exits.
- `node --test test/work-graph.test.mjs` checks state transitions, relations, evidence requirements, session linking, archive views and stale-task flags.
- `node --test test/work-graph-hooks.test.mjs` checks both host packages and session context injection.
- `npm run check` checks generated packages against source. These checks are rerun on the publication branch; they do not establish host-agent behavior in every session.

## Answer comparison

The original A/B/C foundation was restored at the user's request, with a local editing check that keeps useful explanation and summaries. Eight synthetic cases produced 32 fresh Codex responses. Both variants passed the frozen content criteria; two blind model judges preferred baseline/candidate/tie in 5/4/7 and 5/3/8 pairs. The aggregate was **inconclusive**: better readability or reduced repetition was not established. Three additional installed Codex sessions read the exact candidate and retained the requested behavior. Human comprehension and Claude live behavior were not measured.

The earlier completion and work-graph runs are retained under the same local revision, in `evals/completion-evidence-2026-10-31`, `evals/codex-live-2026-10-31`, `evals/work-graph-*`, `evals/provider-session-coordination-2026-10-31` and `evals/automatic-native-links-2026-10-31`. They are bounded observations, not a general performance guarantee.

## Retention receipts

| Local source artifact | SHA-256 |
|---|---|
| `evals/answer-flow-2026-10-31/plan.json` | `426e781eff1e9170a14c4eb45265552edc903e3aefdab854bea9db05f183d44a` |
| `evals/answer-flow-2026-10-31/report.json` | `8bb0d560c0507e40407e1bf25e60a551e17f5605c9ea121eaced8c7411452250` |
| `evals/answer-flow-2026-10-31/readability-summary.json` | `b38de975c7e66bd92dc75f8e3235b010cc684a8369fada7b10146bde0e044236` |
| `evals/answer-flow-2026-10-31/package-manifest.json` | `df8a34e40abc6ea987dcfc449484aef3e5087dbe697323eefe61eafad26d7c42` |

## Publication boundary

Publish selected final source files from a branch rooted at the remote main, plus small summaries and reusable tests. Do not merge the cumulative local branch into a publication branch: deleting its output directories afterward still uploads their ancestor commits. Preserve the original branch and artifacts locally; no history rewrite or evidence deletion is needed. Raw output directories are ignored by default, with explicit exceptions for maintained evaluation code.

Publication-branch checks: Node 24, generated files 145 current; verify-default 28/28, work-graph 31/31, host hooks 1/1, build 11/11. Existing eval-report tests passed 14 cases; its Windows-only case was skipped on macOS and is not claimed as coverage.
