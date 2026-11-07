---
name: refactor
description: Change structure while preserving external behavior — characterize the contract, delete unnecessary code, transform mechanically and migrate consumers. Use for /haechi:refactor or an authorized behavior-preserving change within other work.
---

# Restructure without changing behavior

Apply the [common work contract](../../principles/work-contract.md) within the authorized scope. It owns required implementation, verification, review and completion obligations; this skill supplies methods. Use /haechi:delegate for a bounded worker task when independent execution helps. Existing step names below are compatible delegation entry points, not an exclusive workflow state.

## Methods

1. **Name the structural problem and preserved contract.** Define the intended end state in checkable terms, such as no remaining imports of a retired internal module. Use /haechi:spec when the boundaries need synthesis; settled requirements need no new approval.
2. **Characterize current behavior.** Reuse tests covering observable results or add missing characterization before changing structure. Where affected, cover errors and timing, input mutation, side-effect order and partial writes. An old/new equivalence check on the same inputs can be useful. Use /haechi:mutation-check when a concrete concern suggests the characterization could miss a regression.
3. **Delete before adding structure.** Remove dead code, unused exports and unnecessary checks when in scope. Keep independently verifiable cleanup and mechanical transformations in coherent units under the repo's commit rules.
4. **Transform mechanically.** Use a type-aware rename or codemod for symbol moves, rather than an indiscriminate text replacement. Move files with the repository's appropriate tools. Do not combine an intentional behavior change with a claimed behavior-preserving transformation.
5. **Migrate consumers and retire obsolete paths.** Remove old internal paths once their in-scope consumers are migrated. Do not invent a compatibility layer merely to avoid completing the migration; retain public compatibility explicitly required by the task. Resolve consumers outside the authorized scope before deleting their dependency.
6. **Investigate a broken check.** If it asserts internals, replace it with a behavior assertion and explain why. If observable behavior changed unintentionally, restore it rather than changing the expected result. A necessary intentional behavior change follows the user's authorization and common obligations; choosing another method is not a new approval by itself.

Inspect remaining consumers, unused exports and stale documentation. The common contract governs preservation evidence and any affected rendered behavior, including use of /haechi:screen-parity when an independent comparison adds evidence.

## Delegation contracts

These compatible entries identify delegated methods, not an exclusive workflow or a mandatory agent sequence. Packet assembly also supplies the canonical common work contract. The main session fills the named context fields and task-specific acceptance criteria; detailed procedures and principle bodies stay in their referenced files. `read-only` means repository files remain unchanged; authorized temporary or report outputs must be named separately in `artifactPaths`.

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
      "Report the assigned implement work, its observed results and any remaining scope limitations."
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
