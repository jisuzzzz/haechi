---
name: feature
description: Feature playbook for new behavior and deliberate changes to existing behavior — scope, spec when needed, design source and external dependencies first, shared parts first, then build and check every acceptance criterion by behavior. Use for /haechi:feature, when the user asks to add behavior or change how something already works.
---

# Feature playbook (new and improve)

The main session runs these steps. Scope, delegation, authorization and completion requirements are in the session rules; this file adds only what is specific to features. Principle files are two levels above this skill's folder (`<this skill's folder>/../../principles/<name>.md`): **dry**, **yagni**, **kiss** and **boundary-validation** apply.

## Task focus

- **New:** establish who uses it, in what situation, and how far it goes. Example: "A signed-in user can export the visible invoice list as CSV; filters apply, pagination does not."
- **Improve:** identify what should change and what should stay as it is. Reuse the user's requirements and repository decisions; ask only when an unresolved behavior or scope choice would materially change the result.

## Steps

1. **Clarify the task.** Use the focus above and keep any summary proportional to the task; fixed labels and tables are optional.
2. **Acceptance criteria.** Use the requirements already established in the conversation and repository. Run /haechi:spec when the user asks for a spec or consequential behavior or scope choices remain unresolved. Settled requirements can stay as acceptance criteria in the conversation; no separate document or approval is needed.
   Resolve consequential open questions before dependent work. Choose reversible implementation details yourself and continue independent work.
3. **Design reference.** Use a supplied design or relevant existing screen when available. When the user asks you to design a screen, draft it using repository patterns and the stated requirements. Ask only about consequential ambiguity; optional variants can help when a choice is hard to describe.
   Keep the reference or stated design criteria available for checking the rendered screen.
4. **External dependencies.** Check that the backend API or other service supports every field and parameter the feature needs (for example, does `GET /api/orders` accept `status`?). If support is missing, establish whether the authorized scope includes adding it. Ask before a workaround or scope change that alters the promised behavior; continue independent work.
5. **Plan.** Choose units, file ownership, shared contracts, and a check method paired with each acceptance criterion. Delegate when independent work or separate context makes it useful; keep tightly coupled work together. Build settled shared behavior before its consumers. Resolve reversible structural choices yourself; ask when unifying behavior would change an unresolved product policy.
   Summarize the plan when it helps explain the work. No approval needed.
6. **Shared contracts and shared parts.** Settle and verify the shared interfaces before dependent units start. Assign their files to one owner so parallel edits cannot conflict. Commit completed change units under the session rules.
7. **Build.** Main or implementers by the delegation rules.
8. **Attack.** Check sibling paths (`/haechi:sibling-path-map`). Use adversarial-tester when an independent challenge is valuable for the behavior's risk or complexity. Do not invent consequential behavior in a test when the requirements leave it unresolved.
9. **Verify and review.** Repo verify, then /haechi:review-diff by the main session, or verifier when the session rules call for it.
10. **Check outside behavior.** Inspect changed screens in a real render against the reference or stated design criteria. Use screen-design-checker for an independent comparison only when its supported reference is available: a design-tool URL, screenshot or variant URLs. For a draft with written criteria alone, the main agent checks those criteria in the real render and reports the evidence; no design source is required. For improvements, compare behavior that should stay the same with the previous version; use screen-parity-checker when it adds useful independent evidence. API-only changes: look at a real response.
11. **Match acceptance criteria.** For each criterion, the evidence: a test name or a screen-check result. A missing criterion is "not done" with a reason.
12. **Show the user.** If a visible screen changed, show it before any push.
13. **Finish.** Local commit, then report the changed behavior and its evidence. If a spec was saved, move its conclusions into the feature's canonical doc; remove a temporary dated spec after merge when cleanup is authorized.

## Extra DONE evidence

A behavior check for every required behavior — a test or a real render that exercises it. Reading a setting or a flag does not count.
