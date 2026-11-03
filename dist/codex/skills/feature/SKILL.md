---
name: feature
description: Feature playbook for new behavior and deliberate changes to existing behavior — scope, spec when needed, design source and external dependencies first, shared parts first, then build and check every acceptance criterion by behavior. Use for /haechi:feature, when the user asks to add behavior or change how something already works.
---

# Feature playbook (new and improve)

The main session owns this workflow. For a delegated step, follow /haechi:delegate for agent selection and complete packet delivery: objective, relevant evidence, ownership, constraints and required task skills. Keep later stage decisions and integration in the main session; do not give an agent the whole playbook to restart.

The main session runs these steps. Scope, delegation, authorization and completion requirements are in the session rules; this file adds only what is specific to features. Principle files are two levels above this skill's folder (`<this skill's folder>/../../principles/<name>.md`): **dry**, **yagni**, **kiss** and **boundary-validation** apply.

## Task focus

- **New:** establish who uses it, in what situation, and how far it goes. Example: "A signed-in user can export the visible invoice list as CSV; filters apply, pagination does not."
- **Improve:** identify what should change and what should stay as it is. Reuse the user's requirements and repository decisions; ask only when an unresolved behavior or scope choice would materially change the result.

## Steps

1. **Clarify the task.** Use the focus above and keep any summary proportional to the task; fixed labels and tables are optional.
2. **Acceptance criteria.** Use the requirements already established in the conversation and repository. Run /haechi:spec when the user asks for a spec or consequential behavior or scope choices remain unresolved. Settled requirements can stay as acceptance criteria in the conversation; no separate document or approval is needed.
   Keep expected results independent of the implementation. Revise the approach freely, but do not drop a requirement or weaken an expected result to obtain a pass. Resolve a consequential scope change with the user.
   Resolve consequential open questions before dependent work. Choose reversible implementation details yourself and continue independent work.
3. **Design reference.** When the user explicitly requests a UI preview or mockup, run /haechi:preview even when the requirements are otherwise settled; no saved spec is required. Use a supplied design or relevant existing screen when available. When the user asks you to design a screen, draft it using repository patterns and the stated requirements. Ask only about consequential ambiguity; optional variants can help when a choice is hard to describe.
   Keep the reference or stated design criteria available for checking the rendered screen.
4. **External dependencies.** Check that the backend API or other service supports every field and parameter the feature needs (for example, does `GET /api/orders` accept `status`?). For version-dependent decisions, check the installed version's official documentation or source. If support is missing, establish whether the authorized scope includes adding it. Ask before a workaround or scope change that alters the promised behavior; continue independent work.
5. **Plan.** Choose units, file ownership, shared contracts, and a check method paired with each acceptance criterion. Delegate when independent work or separate context makes it useful; keep tightly coupled work together. Build settled shared behavior before its consumers. Resolve reversible structural choices yourself; ask when unifying behavior would change an unresolved product policy.
   Ground the plan in the relevant entry points, reusable implementation, existing tests and contracts that must stay unchanged. Carry only the findings the work needs; no separate investigation document or agent is required. Summarize the plan when it helps explain the work. No approval needed.
6. **Shared contracts and shared parts.** Settle and verify the shared interfaces before dependent units start. Assign their files to one owner so parallel edits cannot conflict. Commit completed change units under the session rules.
7. **Build.** Main or a worker with /haechi:implement-work through /haechi:delegate.
8. **Attack.** Check sibling paths (`/haechi:sibling-path-map`). Use a worker with /haechi:attack-tests when an independent challenge is valuable for the behavior's risk or complexity. Do not invent consequential behavior in a test when the requirements leave it unresolved.
9. **Verify and review.** Repo verify, then /haechi:review-diff by the main session, or a separate worker with /haechi:verify-work through /haechi:delegate.
10. **Check outside behavior.** Inspect changed screens in a real render against the reference or stated design criteria, opening the captured images to compare their appearance as well as checking structure and measurements. Choose states and interactions relevant to the change; report gaps in that coverage. Use a worker with /haechi:screen-design for an independent comparison only when its supported reference is available: a design-tool URL, screenshot or variant URLs. For a draft with written criteria alone, the main agent checks those criteria in the real render and reports the evidence; no design source is required. For improvements, compare behavior that should stay the same with the previous version; use a worker with /haechi:screen-parity when it adds useful independent evidence. API-only changes: look at a real response.
11. **Match acceptance criteria.** Inspect the executed behavior check for each criterion, including its conditions, expected and observed result, and whether it applies to the final change. A test name alone is not evidence. Use the completion rules to distinguish passed, failed, unverified and needs decision. An unmet or unverified required criterion prevents success.
12. **Show the user.** If a visible screen changed, show it before any push.
13. **Finish.** Local commit, then report the changed behavior and its evidence. If a spec was saved, move its conclusions into the feature's canonical doc, preserving unchanged contracts and exception cases; remove a temporary dated spec after merge when cleanup is authorized.

## Extra DONE evidence

A passing behavior check for every required behavior: executed assertions, a real interaction or a real response that confirms the expected result on the final change. A render proves only the states and interactions actually checked. Reading a setting or a flag does not count.

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
      "For a supplied design, return MATCH or MISMATCH with actual rendered comparisons, or BLOCKED with missing evidence. For variant capture, use the preview/variants contract instead."
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
