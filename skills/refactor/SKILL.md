---
name: refactor
description: Refactor playbook — pin current behavior with tests, delete first, move mechanically, remove the old path in the same task, and prove external behavior is unchanged. Use for /haechi:refactor, when the structure changes but external behavior must stay the same, or as the first step inside a behavior playbook.
---

# Refactor playbook

The main session runs these steps. Scope, delegation, authorization and completion requirements are in the session rules; this file adds only what is specific to refactors. Principle files are two levels above this skill's folder (`<this skill's folder>/../../principles/<name>.md`): **dry**, **yagni**, **kiss** and **behavior-tests** apply.

## Task focus

Establish which external behavior stays unchanged and why the structure needs to change. Example: "Date formatting lives in 6 copies, and a fix to one missed the others."

## Steps

1. **Clarify the task.** Establish the structural problem, target structure, unchanged behavior and checks that will prove equivalence. Keep the summary proportional to the task; fixed labels and tables are optional.
2. **End state.** Write a list that says "done" in checkable terms. Example: zero imports of `utils/legacyDate`, zero callers of `formatDateOld`. Use /haechi:spec only when the user requests a spec or consequential behavior or scope choices remain unresolved. Settled requirements need no separate document or approval.
   Leave: the end-state list.
3. **Pin current behavior.** Check that existing tests cover the observable results of the code you will change. If they do not, add tests before refactoring. The strongest is an equivalence test: old and new give the same output for the same inputs. Tie tests to observable results, not internals. For a big refactor, run /haechi:mutation-check to confirm these tests catch breakage.
   Move on when the pinning tests pass.
4. **Delete first.** Remove dead code, unused exports and pointless checks. Commit that on its own.
5. **Move mechanically.** Move files with `git mv`. Rename with a type-aware rename or a codemod — never a global text replace. Move commits and fix commits are separate.
6. **Order the units.** Each unit ends in a verifiable state; tests pass, then commit. Many units: run /haechi:sweep.
7. **Delete the old path.** Once every in-scope caller is moved, delete the old code in the same task. Leave no compatibility layer or re-export. Callers outside the scope: ask.
8. **When a test breaks.**
   - The test was tied to internals: rewrite it against observable results and record why.
   - The observable result changed unintentionally: restore the expected behavior; do not adjust the test to accept a regression. If a behavior change is necessary, re-classify and ask only when it is outside the existing authorization.
9. **Review.** Use /haechi:review-diff, with a verifier when risk or separate context makes independent review useful. Look for leftovers: unused exports, docs or comments pointing at the old path. Step 3 supplies the behavior tests; delegate additional test work only when it adds distinct evidence.
10. **Prove same behavior.** Existing tests and pinning tests pass. If screens are affected, compare the real rendered behavior with the previous version, excluding intended differences. Use screen-parity-checker when an independent comparison helps.
11. **Finish.** End-state list met, commits split as above. Report the developer-facing change and the evidence that user behavior is unchanged.

## Extra DONE evidence

Evidence that behavior is unchanged: existing and pinning test output, and parity results if external behavior could be affected. Any test you edited, with the reason.
