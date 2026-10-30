---
name: test-hardening
description: Test-hardening playbook — strengthen an area's existing tests unit by unit with mutation checks before and after, changing tests only, and recording any real bug found instead of fixing it. Use for /haechi:test-hardening, when the user asks to strengthen or harden the tests of a folder or feature.
---

# Test-hardening playbook

The main session runs these steps. Scope, delegation, authorization and completion requirements are in the session rules. Use /haechi:mutation-check for each unit and adversarial-tester when separate context or independent challenge helps. Use /haechi:sweep for useful independent units. This file adds only what is specific to hardening an area. Principle files are two levels above this skill's folder (`<this skill's folder>/../../principles/<name>.md`): **behavior-tests** and **sibling-paths** apply.

## Task focus

Establish the area's mutation results, or say "not measured" if unknown. The easy mistake is scope: "harden the tests" with no folder can mean the whole repo. Example: "`src/invoices` not measured; `formatDate.ts` has no test file."

## Steps

1. **Clarify the task.** Establish the area's current mutation results and the intended improvement. Only tests change; source code stays unchanged. Show mutation results before and after per unit and passing tests. Fixed labels and tables are optional.
2. **Choose units.** Work directly for a tightly coupled area, or use /haechi:sweep when independent units benefit from separate context. A unit can be a source file plus its tests. Order:
   1. files under `riskPaths` in `.haechi.json`;
   2. files with many recent bug fixes (`git log --oneline --grep=fix -- <file>`, or the repo's commit convention for fixes);
   3. files without tests;
   4. the rest.
   For the cost preview, estimate mutants per file (the mutation-check limit, default 20) times the unit's test run time.
3. **Harden each unit.** Work directly or give an adversarial-tester this brief when independent challenge is useful:
   - Run mutation-check before changing anything, with a per-file limit and `--lines 1-<last line of the file>`. Without `--lines` it mutates only lines changed against HEAD, which on a committed file is nothing.
   - Judge each surviving mutant: a real gap gets a stronger assertion or a new case; an equivalent mutant (behavior cannot change) gets a one-line reason and is excluded.
   - Touch existing tests in exactly two cases: a mutant survived, or a test is tied to internals and gets rewritten against observable results. Each new test catches a different mutant or path. A file with no tests gets new behavior-based tests.
   - A real bug found: do not fix the source. Record it the repo's way (AGENTS.md; otherwise a skipped test named `BUG: <expected behavior>`). The user decides what happens to it.
   - Run mutation-check again after, with the same `--lines` as before.
4. **Review each unit as it finishes.** Check:
   - tests assert behavior a caller observes, not internal calls;
   - no mocks of the unit's own internals, no render snapshots;
   - time and randomness are fixed;
   - fixtures are synthetic.
   Then commit the completed unit.
5. **Report.** Give the before/after results, equivalent mutants, test changes and bugs found for each unit. An optional table:

   | Unit | Survived before → after | Equivalent | Tests added / changed | Bugs found |
   |---|---|---|---|---|
   | `src/utils/formatDate.ts` | 4 → 1 | 1 | 2 / 1 | — |

## Extra DONE evidence

Mutation results before and after for every unit, the equivalent mutants with their reasons, and the test run passing. No source file in the diff.
