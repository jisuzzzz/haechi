---
name: review
description: Review playbook — judge a diff or an area of existing code without changing it, using review-diff for the evidence standard and independent reviewers when useful. Use for /haechi:review, when the user asks to review a merge request, a branch, uncommitted changes or an area of code.
---

# Review playbook

The main session owns this workflow. For a delegated step, use /haechi:delegate to pass its objective, relevant evidence, ownership, constraints and required task skills to a fresh `worker`. Keep later stage decisions and integration in the main session; do not give a worker the whole playbook to restart.

The main session runs these steps. Scope, delegation, authorization and completion requirements are in the session rules. How to judge — the order to look in, the three buckets, the evidence each needs, the report shape — is all in /haechi:review-diff, so that a main-session review, a verifier review and a user-requested review use the same bar. This file adds only what is specific to a review request. Principle files are two levels above this skill's folder (`<this skill's folder>/../../principles/<name>.md`): **evidence-levels** and **behavior-tests** apply.

## Task focus

Review without code edits. The easy mistake is fixing what you find during the review. Example: "Review `src/invoices` and report findings; the user decides what to fix."

## Steps

1. **Pick the mode.**
   - Diff review (default): a merge request, a branch against its base, or uncommitted changes.
   - Area review: existing code with no diff, for example "review `src/orders`". Inspect the target and relevant consumers for defects, risks and evidence-backed quality improvements. Separate improvement suggestions from proven defects; taste alone is not a finding.
2. **Establish scope.** Read the target and its intent from the request, merge request description or commit messages. Report findings with a scenario and evidence for each, without code edits. Ask only when unresolved intent would materially change the review; continue independent checks.
3. **Set the focus.** Default: logic defects, excess (code that does more than needed), sensitive data and safety. If the user names a focus, use that instead.
4. **Run.**
   - Diff review: use /haechi:review-diff. Use a separate worker with /haechi:verify-work through /haechi:delegate when risk or separate context makes independent review useful. File and line counts may help estimate scope but do not decide delegation.
   - Area review: use the [code quality rubric](references/code-quality.md) alongside logic review. A base or diff is not required; inspect the target, its dependencies, consumers and relevant tests. Use review-diff's evidence and reporting rules, but skip diff-specific commands and do not invent a change history. Review directly unless independent areas benefit from separate context; then use /haechi:sweep in read-only mode with the same area scope. Read-only units produce findings, never commits.
5. **Report.** Use the evidence and content requirements in /haechi:review-diff; choose the clearest presentation. State what was inspected and which checks could not be performed. "No defects found in the inspected scope" is valid; it does not certify unchecked behavior or turn missing verification into a pass.
6. **Follow-up.** Fix nothing during the review. The user decides what to fix; fixes run through /haechi:bug or /haechi:refactor. Posting merge request comments or filing issues is on the ask list.

## Optional: are the tests strong enough?

Only when the user asks. Copy the repo to a temporary folder outside the repository and run /haechi:mutation-check there with `--base <base>` so it mutates the reviewed change, never in the working tree. Report surviving mutants as open questions or test defects, per review-diff.

## Extra DONE evidence

Every defect has `file:line` and a scenario (input or state, then the wrong result). "No defects" is a conclusion too. The working tree is unchanged — `git status` shows nothing new from the review.

## Delegation contracts

These references are the authoritative requirements for delegated steps in this playbook, not a mandatory agent sequence. The main session fills the named context fields and task-specific acceptance criteria; detailed procedures and principle bodies stay in their referenced files. `read-only` means repository files remain unchanged; authorized temporary or report outputs must be named separately in `artifactPaths`.

```haechi-handoffs
{
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
