---
name: perf
description: Performance playbook — baseline and bottleneck first, user-picked candidates, a pre-registered measurement run by experiment-runner and checked by experiment-auditor, then adoption through the normal playbooks or a recorded rejection. Use for /haechi:perf, only when the user explicitly asks to measure or speed up something.
---

# Performance playbook

The main session runs these steps. Scope, delegation, authorization and completion requirements are in the session rules; this file adds only what is specific to performance. Principle files are two levels above this skill's folder (`<this skill's folder>/../../principles/<name>.md`): read **explain-the-number** before step 3 and **benchmark-checklist** before step 5. The haechi tools folder is two levels above this skill's folder (`<this skill's folder>/../../tools/`); run tools with `node`.

Start only on an explicit request to measure or speed something up. "It feels slow" alone: ask whether to run this playbook or start with bug reproduction.

## Task focus

Define the number and the rule that decides success. Example: "p50 time from opening `/orders` to the first row drawn drops below 300 ms on the 5,000-order fixture." The easy mistake is not knowing what is being measured; "faster" alone does not define success.

## Settings and storage

Read `perf` from `.haechi.json` and `notesDir` from `~/.haechi/user.json`. If either is missing, ask on first use and offer to write it.

| What | Where |
|---|---|
| Measurement record: pre-registration, then problem, method, result, interpretation, next; environment, verdict table, excluded rows, raw-data path, variant hashes | `perf.recordsDir` — committed |
| One-line conclusion and baseline numbers | the area's main doc — committed |
| Rejected idea / open issue | `perf.rejected` / `perf.openIssues` — committed |
| Raw data and harness | `<notesDir>/perf-runs/<topic>` — never the scratchpad or a worktree that will be deleted |

## Steps

1. **Clarify the task.** Establish the metric and conditions, the success rule, behavior and other metrics that must not worsen, and the evidence needed for experiment-auditor to rate the result "supported" under the pre-registered rules. Fixed labels and tables are optional.
2. **Purpose line.** One line on what this measurement decides: whether to adopt a change, or a before/after reference for a change already decided. If adoption is already decided, do not use the result as the reason to adopt.
3. **Baseline and bottleneck.** Measure the baseline and find what is actually slow with a profiler, separately from the reporting run. No hypothesis about what to change until the bottleneck is known.
   Leave: the baseline number and the bottleneck, with how you found it.
4. **Check past rejections.** Read `perf.rejected` and run `node <tools>/rejected-staleness.mjs <perf.rejected> [--json]`. An idea marked `unchanged` is not proposed again. An idea marked `changed` may come back, with what changed. If the user asks directly for a re-measurement, run it regardless.
5. **Candidates.** Compare candidates based on the bottleneck, including their cost and expected effect. The user picks what to try.
6. **Pre-register.** Write down: the decision metric and how sides are compared, rounds and order shuffling, how noise is measured, the decision rule, conditions for dropping a row, the marker that proves each variant ran, and the expected duration. Get the user's confirmation before running. Never change it after seeing data.
   Leave: the pre-registration, as the first section of the measurement record.
7. **Build the variant.** In an `exp/<topic>` worktree. Plant a fixed marker string (for example `PERF-MARKER:orders-virtual`) so each row can prove the variant ran.
8. **Run.** experiment-runner with the pre-registration and the raw-data folder: noise, main run, aggregation, no interpretation. One measurement at a time — if another is running, wait until it ends.
   Leave: raw data in `<notesDir>/perf-runs/<topic>`.
9. **Audit.** experiment-auditor with the pre-registration, raw data and the conclusion you want to draw. It re-aggregates and rates each claim supported, weak or invalid.
10. **Adopt.** The experiment code is reference only. Start again at classification and run /haechi:feature or /haechi:refactor from the restatement. The implementer may read the experiment diff for direction; never cherry-pick or merge it. Include a short confirmation measurement on the real code in the evidence. A marker string left in the final diff means not done.
11. **Or reject.** Add an entry to `perf.rejected` in the format below.
12. **Record and correct.** Freeze the measurement record. Put the one-line conclusion and the baseline numbers in the area's main doc. Find docs this result contradicts and fix them.

## Rejected-idea entry format

`rejected-staleness.mjs` parses exactly this. Each entry starts with a `## ` heading and has no other `## ` line inside it. Each key is one line, written `Key: value` — no bullets, no bold. Required keys: `Base` (a commit in the current branch's history), `Paths` (comma-separated, each must exist at Base or now), `Revisit when`. Optional: `Dependencies` (comma-separated `name@version`, version required), plus free-text keys such as `Tried`, `Result`, `Data`. An entry that breaks these rules is reported `invalid` with the reason — fix the entry.

```markdown
## Virtualize the order list
Base: 3f2a91c
Paths: src/orders/OrderList.tsx, src/orders/useOrders.ts
Dependencies: react-window@1.8.9
Tried: windowed rendering of rows
Result: p50 first row 410 → 395 ms, inside noise (±30 ms)
Data: 5,000-order fixture
Revisit when: the list passes 20,000 rows or react-window 2 ships
```

## No measurement tool in the repo

First use what is already available: the browser profiler, `node --cpu-prof`, `py-spy`, installed test tools. If nothing fits, search the web for tools for this stack and compare install cost, accuracy and whether they run in CI; a table is optional. Widely used packages only, version pinned. Build it only after the user picks; adding a dependency is on the ask list.

## Extra DONE evidence

The auditor's "supported" verdict, plus the numbers, round count, scope (which conditions were measured) and the limiting factor. On adoption, the confirmation measurement on the real code and no marker strings in the diff.
