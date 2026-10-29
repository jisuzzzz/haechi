---
name: review
description: Review playbook — judge a diff or an area of existing code without changing it, using review-diff for the judging and a verifier for large diffs. Use for /haechi:review, when the user asks to review a merge request, a branch, uncommitted changes or an area of code.
---

# Review playbook

The main session runs these steps. Classification, delegation, the ask list and the DONE rules are in the session rules. How to judge — the order to look in, the three buckets, the evidence each needs, the report shape — is all in /haechi:review-diff, so that a main-session review, a verifier review and a user-requested review use the same bar. This file adds only what is specific to a review request. Principle files are two levels above this skill's folder (`<this skill's folder>/../../principles/<name>.md`): **evidence-levels** and **behavior-tests** apply.

## Restatement focus

The key line is **Keep: no code edits**. The easy mistake is fixing what you find during the review. Example: "Keep: no edits to `src/invoices` — findings only; the user decides what to fix."

## Steps

1. **Pick the mode.**
   - Diff review (default): a merge request, a branch against its base, or uncommitted changes.
   - Area review: existing code with no diff, for example "review `src/orders`". Defects and risks only, no style. Raise a structural problem only with a concrete case where it made a change hard or caused a bug.
2. **Restate.** Current = the target and the intent of the change (merge request description, commit messages). Target = the defect list and a verdict. Keep = no code edits. Proof = a scenario and evidence for every finding. If you cannot tell the intent, ask.
3. **Set the focus.** Default: logic defects, excess (code that does more than needed), sensitive data and safety. If the user names a focus, use that instead.
4. **Run.**
   - Diff review: count with `node <tools>/count-logic-lines.mjs --base <base> .` (the haechi tools folder is two levels above this skill's folder, `<this skill's folder>/../../tools/`). Under 400 logic lines, the main session runs /haechi:review-diff. At 400 or more, one verifier. Note the size and the number of defects found; if a large diff yields oddly few defects, consider splitting it then.
   - Area review: split the area with /haechi:sweep, then /haechi:review-diff per unit.
5. **Report.** In the shape /haechi:review-diff defines. "No defects" is a valid verdict.
6. **Follow-up.** Fix nothing during the review. The user decides what to fix; fixes run through /haechi:bug or /haechi:refactor. Posting merge request comments or filing issues is on the ask list.

## Optional: are the tests strong enough?

Only when the user asks. Copy the repo to a temporary folder outside the repository and run /haechi:mutation-check there with `--base <base>` so it mutates the reviewed change, never in the working tree. Report surviving mutants as open questions or test defects, per review-diff.

## Extra DONE evidence

Every defect has `file:line` and a scenario (input or state, then the wrong result). "No defects" is a conclusion too. The working tree is unchanged — `git status` shows nothing new from the review.
