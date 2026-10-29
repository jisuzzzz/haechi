---
name: refactor
description: Refactor playbook — pin current behavior with tests, delete first, move mechanically, remove the old path in the same task, and prove external behavior is unchanged. Use for /haechi:refactor, when the structure changes but external behavior must stay the same, or as the first step inside a behavior playbook.
---

# Refactor playbook

The main session runs these steps. Classification, delegation, the ask list and the DONE rules are in the session rules; this file adds only what is specific to refactors. Principle files are two levels above this skill's folder (`<this skill's folder>/../../principles/<name>.md`): **dry**, **yagni**, **kiss** and **behavior-tests** apply.

## Restatement focus

The key line is **Keep**: all external behavior, plus a list of any intended differences. The easy mistake is leaving out *why* — without a reason in Current, the refactor has no end. Example: "Current: date formatting lives in 6 copies, and a fix to one missed the others."

## Steps

1. **Restate.** Current = what about the structure hurts, and why. Target = the target structure. Keep = all external behavior and the intended differences. Proof = existing tests pass, the equivalence check passes, and parity if screens are affected.
2. **End state.** Write a list that says "done" in checkable terms. Example: zero imports of `utils/legacyDate`, zero callers of `formatDateOld`. Run /haechi:spec first under the same conditions as a feature: 2+ decisions to make, an external contract change, or 2+ units.
   Leave: the end-state list.
3. **Pin current behavior.** Check that existing tests cover the observable results of the code you will change. If they do not, add tests before refactoring. The strongest is an equivalence test: old and new give the same output for the same inputs. Tie tests to observable results, not internals. For a big refactor, run /haechi:mutation-check to confirm these tests catch breakage.
   Move on when the pinning tests pass.
4. **Delete first.** Remove dead code, unused exports and pointless checks. Commit that on its own.
5. **Move mechanically.** Move files with `git mv`. Rename with a type-aware rename or a codemod — never a global text replace. Move commits and fix commits are separate.
6. **Order the units.** Each unit ends in a verifiable state; tests pass, then commit. Many units: run /haechi:sweep.
7. **Delete the old path.** Once every in-scope caller is moved, delete the old code in the same task. Leave no compatibility layer or re-export. Callers outside the scope: ask.
8. **When a test breaks.**
   - The test was tied to internals: rewrite it against observable results and record why.
   - The observable result changed: this is not a refactor. Do not adjust the test. Stop, re-classify, and ask.
9. **Review.** /haechi:review-diff by the main session, or verifier at 400+ logic lines (moves excluded). Look for leftovers: unused exports, docs or comments pointing at the old path. No adversarial-tester — step 3 does that job.
10. **Prove same behavior.** Existing tests and pinning tests pass. If screens are affected, run screen-parity-checker, excluding the intended differences.
11. **Finish.** End-state list met, commits split as above. Report in format C (scenario): "unchanged for users", plus the developer-facing scenario.

## Extra DONE evidence

Evidence that behavior is unchanged: existing and pinning test output, and parity results if external behavior could be affected. Any test you edited, with the reason.
