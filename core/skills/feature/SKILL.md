---
name: feature
description: Feature playbook for new behavior and deliberate changes to existing behavior — scope, spec when needed, design source and external dependencies first, shared parts first, then build and check every acceptance criterion by behavior. Use for /haechi:feature, when the user asks to add behavior or change how something already works.
---

# Feature playbook (new and improve)

The main session runs these steps. Classification, delegation, the ask list and the DONE rules are in the session rules; this file adds only what is specific to features. Principle files are two levels above this skill's folder (`<this skill's folder>/../../principles/<name>.md`): **dry**, **yagni**, **kiss** and **boundary-validation** apply.

## Restatement focus

- **New:** the key line is **Target** — who uses it, in what situation, and how far it goes. Example: "Target: a signed-in user can export the visible invoice list as CSV; filters apply, pagination does not." The easy mistake is scope.
- **Improve:** the key line is **Keep** — the list of things that must stay as they are. The easy mistake is changing something on that list along with the target. Almost always ask the user to confirm Keep.

## Steps

1. **Restate.** Use the focus above.
2. **Spec.** Run /haechi:spec if any of these holds: 2+ decisions to make, a new screen, an external contract change (exports, API, routes, schema), or 2+ units. Otherwise the restatement is the spec.
   Move on when there are acceptance criteria and no open questions.
3. **Design source.** If a screen is involved, get the design source (a design-tool URL or a screenshot) before drawing any UI. If there is none, offer drafts through /haechi:spec or ask. Never draw without a source.
   Leave: the reference screen-design-checker will compare against.
4. **External dependencies.** Check that the backend API or other service supports every field and parameter the feature needs (for example, does `GET /api/orders` accept `status`?). If it does not, stop and ask. Do not fill the gap with a client-side workaround.
5. **Plan.** Units, file ownership, shared contracts, and a check method paired with each acceptance criterion. When the same behavior is already settled in 2+ places, build the shared part first. When the policy is not settled, keep a local copy on each screen and ask whether to unify.
   Leave: a plan summary in the delegation verdict line. No approval needed.
6. **Shared contracts and shared parts.** The main session, or one implementer, builds them and commits first. Parallel units start after that commit.
7. **Build.** Main or implementers by the delegation rules.
8. **Attack.** At direct size the main session checks sibling paths (`/haechi:sibling-path-map`); at implementer size run adversarial-tester. Behavior the spec does not define is an open question, not a test to write.
9. **Verify and review.** Repo verify, then /haechi:review-diff by the main session, or verifier when the session rules call for it.
10. **Check outside behavior.** Changed screens: screen-design-checker against the design source. Improve: run screen-parity-checker on the Keep list screens against the previous version, excluding the intended changes. API-only changes: look at a real response.
11. **Match acceptance criteria.** For each criterion, the evidence: a test name or a screen-check result. A missing criterion is "not done" with a reason.
12. **Show the user.** If a visible screen changed, show it before any push.
13. **Finish.** Local commit, report in format C (scenario). Move the spec's conclusions into the feature's canonical doc; a dated plan doc is deleted after merge.

## Extra DONE evidence

A behavior check for every required behavior — a test or a real render that exercises it. Reading a setting or a flag does not count.
