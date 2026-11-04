---
name: sweep
description: Coordinates independent units of work when separate context or parallel execution helps, with findings for read-only reviews and commits for completed changes. Use for /haechi:sweep when a task benefits from splitting into independent units.
---

# Sweep

The main session owns this workflow. For a delegated step, follow /haechi:delegate for agent selection and complete packet delivery: objective, relevant evidence, ownership, constraints and required task skills. Keep later stage decisions and integration in the main session; do not give an agent the whole playbook to restart.

The main session runs this, because agents cannot ask the user, start other agents or commit. The calling playbook decides what one unit's work is and in what order units go; this procedure handles the rest. Delegation and DONE rules are in the session rules.

## Steps

1. **Choose units and mode.** Delegate units when independence or separate context offers a clear benefit; keep tightly coupled work together. Different files or failures can share one cause; check that before splitting them. Editing units must not write the same files concurrently. Read-only units may inspect shared context but should have distinct review questions. Example for test hardening: `src/utils/formatDate.ts` plus `test/utils/formatDate.test.ts` is one unit.
2. **Order.** Use the priority the calling playbook gives — risky places first.
3. **Preview material cost.** Estimate effort when it affects the user's decision. For test hardening, use mutants per file and test run time. Ask before substantial extra work outside existing authorization; do not repeat an accepted cost decision.
4. **Run.** Parallelize independent units when useful within the available resources. Keep dependent work sequential. Preserve the original acceptance conditions, exact values and shared contracts when writing each job; a shorter brief must not narrow the request. Give the worker the relevant context and let it choose its method. Review each unit as it finishes.
5. **Record each unit.** Editing mode: one local commit per completed, reviewed unit, using the repo's convention and any relevant metric. Read-only mode: return findings and evidence in the conversation; make no edits or commits.
6. **Resume.** Reuse completed findings and checks from the conversation. For editing work, also read `git log` for completed units. Do not create a progress file unless the task needs one.

## Report

The calling playbook's report, plus units completed, units left and why. Compare actual effort with a cost preview when one was useful; no fixed report format is required.

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
      "acceptanceChecks",
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
  }
}
```
