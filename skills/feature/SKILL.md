---
name: feature
description: Develop requirements, dependencies and an implementation approach for new or deliberately changed behavior. Use for /haechi:feature or when those methods help an authorized product change.
---

# Develop a change

Apply the [common work contract](../../principles/work-contract.md) within the authorized scope. It owns required implementation, verification, review and completion obligations; this skill supplies methods. Use /haechi:delegate for a bounded worker task when independent execution helps. Existing step names below are compatible delegation entry points, not an exclusive workflow state.

## Methods

1. **Establish the intended behavior.** Identify who uses it, the trigger, expected result, relevant exceptions and behavior to preserve. Reuse accepted requirements. Use /haechi:spec when synthesis of interacting requirements helps; an existing sufficiently complete account needs no new document or approval.
2. **Establish the design reference.** For visible UI or interaction changes, use an accepted and checked reference that covers the need. Use /haechi:preview for missing states or design choices before dependent implementation. Retain the selected reference and checked interactions for the real application comparison.
3. **Check external contracts.** Verify that the backend/API/dependency supports required fields, parameters and states. Use the installed version's source or authoritative documentation. Identify missing support and resolve any consequential change of scope before relying on a workaround.
4. **Choose units and interfaces.** Inspect entry points, existing components, tokens, consumers and tests. Prefer reuse or a compatible extension when it fits. Settle shared interfaces before dependent work; separate file ownership when delegation helps. A file count alone does not justify parallel work.
5. **Implement the authorized change.** Work directly or assign bounded implementation through /haechi:delegate. Use another task method when a finding changes the next action; do not restart completed requirements or design work merely to enter that method.

Use the common contract's Check section and relevant review/screen methods to decide completion. New behavior and preservation evidence must both cover the final relevant change.

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
      "acceptanceChecks",
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
  "design": {
    "skills": [
      "screen-design"
    ],
    "principles": [
      "real-artifact"
    ],
    "checks": [],
    "writeScope": "read-only",
    "contextRequired": [
      "repository",
      "designSource",
      "urls",
      "states",
      "artifactLocation",
      "loginContext"
    ],
    "completion": [
      "For a supplied design, return MATCH or MISMATCH with actual rendered comparisons, or BLOCKED with missing evidence."
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
