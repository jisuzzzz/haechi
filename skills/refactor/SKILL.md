---
name: refactor
description: Refactor playbook — pin current behavior with tests, delete first, move mechanically, remove the old path in the same task, and prove external behavior is unchanged. Use for /haechi:refactor, when the structure changes but external behavior must stay the same, or as the first step inside a behavior playbook.
---

# Refactor playbook

The main session owns this workflow. For a delegated step, follow /haechi:delegate for agent selection and complete packet delivery: objective, relevant evidence, ownership, constraints and required task skills. Keep later stage decisions and integration in the main session; do not give an agent the whole playbook to restart.

The main session runs these steps. Scope, delegation, authorization and completion requirements are in the session rules; this file adds only what is specific to refactors. Principle files are two levels above this skill's folder (`<this skill's folder>/../../principles/<name>.md`): **dry**, **yagni**, **kiss** and **behavior-tests** apply.

## Task focus

Establish which external behavior stays unchanged and why the structure needs to change. Example: "Date formatting lives in 6 copies, and a fix to one missed the others."

## Steps

1. **Clarify the task.** Establish the structural problem, target structure, unchanged behavior and checks that will prove equivalence. Keep the summary proportional to the task; fixed labels and tables are optional.
2. **End state.** Write a list that says "done" in checkable terms. Example: zero imports of `utils/legacyDate`, zero callers of `formatDateOld`. Consider /haechi:spec using its description while establishing this end state; it is not a mandatory refactor stage. Settled requirements need no separate document or approval.
   Leave: the end-state list.
3. **Pin current behavior.** Check that existing tests cover the observable results of the code you will change. If they do not, add tests before refactoring. The strongest is an equivalence test: old and new give the same output for the same inputs. Where affected, include error behavior and timing, input mutation, side-effect order and partial writes on failure. Tie tests to observable results, not internals. When it is uncertain whether these tests catch a plausible behavior regression, use /haechi:mutation-check on the relevant code and tests; change size alone is not the trigger.
   Move on when the pinning tests pass.
4. **Delete first.** Remove dead code, unused exports and pointless checks. Commit that on its own.
5. **Move mechanically.** Move files with `git mv`. Rename with a type-aware rename or a codemod — never a global text replace. Move commits and fix commits are separate.
6. **Order the units.** Each unit ends in a verifiable state; tests pass, then commit. Many units: run /haechi:sweep.
7. **Delete the old path.** Once every in-scope caller is moved, delete the old code in the same task. Leave no compatibility layer or re-export. Callers outside the scope: ask.
8. **When a test breaks.**
   - The test was tied to internals: rewrite it against observable results and record why.
   - The observable result changed unintentionally: restore the expected behavior; do not adjust the test to accept a regression. If a behavior change is necessary, re-classify and ask only when it is outside the existing authorization.
9. **Review.** Use /haechi:review-diff, with a separate worker using /haechi:verify-work when risk or separate context makes independent review useful. Look for leftovers: unused exports, docs or comments pointing at the old path. Step 3 supplies the behavior tests; delegate additional test work only when it adds distinct evidence.
10. **Prove same behavior.** Existing tests and pinning tests pass. If screens are affected, compare the real rendered behavior with the previous version, excluding intended differences. Use a worker with /haechi:screen-parity when an independent comparison helps.
11. **Finish.** End-state list met, commits split as above. Report the developer-facing change and the evidence that user behavior is unchanged.

## Extra DONE evidence

Evidence that the required external behavior is unchanged on the final change: executed existing and pinning assertions, and parity results if external behavior could be affected. List any test you edited and why; changing expected behavior to match a regression cannot establish equivalence. Apply the common completion rules to missing or contradictory results.

## Delegation contracts

These references are the authoritative requirements for delegated steps in this playbook, not a mandatory agent sequence. The main session fills the named context fields and task-specific acceptance criteria; detailed procedures and principle bodies stay in their referenced files. `read-only` means repository files remain unchanged; authorized temporary or report outputs must be named separately in `artifactPaths`.

```haechi-handoffs
{
  "implement": {
    "skills": [
      "implement-work"
    ],
    "principles": [
      "dry",
      "yagni",
      "kiss",
      "boundary-validation",
      "root-cause",
      "failing-test-first",
      "behavior-tests"
    ],
    "checks": [],
    "writeScope": "scoped",
    "contextRequired": [
      "repository",
      "requirements",
      "pinningEvidence",
      "ownership"
    ],
    "completion": [
      "Run the supplied reproduction before and after a bug fix.",
      "Check each required outcome on the final change and report gaps."
    ]
  },
  "attack": {
    "skills": [
      "attack-tests",
      "sibling-path-map",
      "mutation-check"
    ],
    "principles": [
      "sibling-paths",
      "behavior-tests"
    ],
    "checks": [],
    "writeScope": "scoped",
    "contextRequired": [
      "repository",
      "requirements",
      "changedFiles",
      "ownership"
    ],
    "completion": [
      "Demonstrate that tests detect the targeted defects without weakening expected behavior."
    ]
  },
  "review": {
    "skills": [
      "verify-work",
      "review-diff",
      "impact-map"
    ],
    "principles": [
      "evidence-levels",
      "behavior-tests"
    ],
    "checks": [
      "agent-defects",
      "sibling-paths",
      "dry",
      "yagni",
      "kiss"
    ],
    "writeScope": "read-only",
    "contextRequired": [
      "repository",
      "requirements",
      "base",
      "changedFiles",
      "priorEvidence"
    ],
    "completion": [
      "Report concrete defects with expected and observed behavior and affected consumers.",
      "Distinguish passing checks, failures, missing proof and unresolved expectations."
    ]
  },
  "parity": {
    "skills": [
      "screen-parity"
    ],
    "principles": [
      "real-artifact"
    ],
    "checks": [],
    "writeScope": "read-only",
    "contextRequired": [
      "repository",
      "beforeUrl",
      "afterUrl",
      "states",
      "intendedDifferences",
      "artifactLocation",
      "loginContext"
    ],
    "completion": [
      "Return PASS or FAIL against real rendered comparisons and the noise baseline, or BLOCKED."
    ]
  }
}
```
