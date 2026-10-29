---
name: sweep
description: Runs many independent units of the same kind of work — splits by non-overlapping files, previews the cost, runs agents in parallel, reviews and commits each unit as it finishes, and resumes from git log. Use for /haechi:sweep, when a playbook hands over many units (test hardening, a large refactor, a bulk migration, a codemod rollout, an area review).
---

# Sweep

The main session runs this, because agents cannot ask the user, start other agents or commit. The calling playbook decides what one unit's work is and in what order units go; this procedure handles the rest. Delegation and DONE rules are in the session rules.

## Steps

1. **Split into units.** No two units share a file. A unit is small enough for one agent to finish within its context. Example for test hardening: `src/utils/formatDate.ts` plus `test/utils/formatDate.test.ts` is one unit.
2. **Order.** Use the priority the calling playbook gives — risky places first.
3. **Preview the cost.** Units × expected time per unit. For test hardening: mutants per file × the test run time. Example: "14 units × about 6 min = about 1.5 h." If it is large, ask whether to narrow the scope before starting.
4. **Run in parallel.** Follow the delegation rules: units with no dependency and no shared file run at the same time, with no fixed cap on the count. Review each unit as soon as it finishes — do not wait for all of them.
5. **Commit per unit.** One local commit per reviewed unit. Put the unit's metric in the message, in the repo's commit convention. Example: `test(formatDate): surviving mutants 4 → 1 (1 equivalent) · 2 tests added, 1 changed`.
6. **Resume.** Keep no progress file. After an interruption, read `git log` for the units already committed and continue with the rest. Work committed before the break stays done.

## Report

The calling playbook's report, plus: units done, units left and why (skipped, failed, out of time), and the total time against the preview.
