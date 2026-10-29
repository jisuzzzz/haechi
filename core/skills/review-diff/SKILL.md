---
name: review-diff
description: Reviews a diff for defects with evidence — logic defects first, then quality, with three verdict buckets. Use for /haechi:review-diff, when the main session reviews its own or a subagent's change, or when the verifier runs.
---

# Review a diff

The haechi tools folder is in the task's "[haechi] Repo facts" block, or two levels above this skill's folder. Run tools with `node`.

## Order

1. **Mechanical results first.** Use the repo's verify output the orchestrator gave you; run the verify command once yourself only if none was given. Every failure it prints is a finding — quote it. Do not redo by hand what lint or the verifier already checks.
2. **Consumers outside the diff.** Run `node <tools>/impact-map.mjs --base <base>` and read the consumers of every changed export or signature.
3. **Logic defects (the main job).** For each changed behavior, find an input or state where it gives a wrong result. Look first at the defects agents actually produce: a rule on one path and not its sibling (`node <tools>/sibling-path-map.mjs --base <base>` lists candidates), a final-looking empty state while data is still loading, one field used as both lookup key and identity, null ids matching each other, out-of-order or failed responses, leftovers after a move or split, another area's internal file imported instead of shared state, the same fact held in two places.
4. **Where grep stops.** When safety depends on code outside the repo or on timing — a library's behavior, the pinned version or a local patch, microtask or unmount order, a wire format another service reads — read that source or run it. Put the one fact the change is safe because of in your report, with how far you proved it.
5. **Quality defects you can cite.** Duplication inside the diff (quote both copies), a local copy of something the repo already has (open it to confirm), single-use files, wrappers or layers, error handling for states that cannot occur, memoization without a measured or referential need.

To raise a claim's evidence, write a repro script in a temporary folder **outside the repository** and run it. Never edit, create or delete files in the repository.

## Three buckets

- **Defect** — needs one of: a failing path traced step by step to a wrong result; a rule present on one path and missing on its sibling, both locations quoted; a contract and the code disagreeing, both sides quoted; execution output. Give `file:line` and the scenario (input or state → wrong result).
- **Open question** — suspicious but without that evidence, or behavior the spec does not define.
- **Report only** — taste, lines this change did not touch, anything out of scope.

"No defects" is a valid result.

## Discipline

- Verify before claiming: "unused" means you searched the consumers; "duplicate" means you quote both; "already exists" means you opened it.
- Report each defect once, under the most specific heading. The same defect in several places: give the count and every location.
- Before suggesting to move state or code, read its tests; if a test pins the current design, say so instead.

## Report

Verdict line first (`PASS` or `FAIL`), then defects most severe first, each as: example (input or state) → wrong result → other places with the same problem → `file:line`. Then open questions, report-only items, and the safety fact with its proof level. A verifier ends with one log line: `verifier log · <task> · <logic lines> lines · contract: yes/no · defects: N · <tag: short description per defect, or "none">`, tags `logic` · `structure` · `excess` · `quality`.
