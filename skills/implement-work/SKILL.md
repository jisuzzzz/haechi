---
name: implement-work
description: Implement an assigned change and report behavior evidence. Use for delegated implementation with a task brief and explicit file ownership.
---

# Implement assigned work

Apply the [common work contract](../../principles/work-contract.md), including its implementation, evidence reuse, verification, review and completion requirements. Reuse its current delivered body; this method adds worker-specific duties below.

- Follow assigned file ownership exactly. Report needed changes elsewhere; other agents may be editing concurrently. The main owns Git: never commit, stash, checkout, reset or switch branches.
- Follow AGENTS.md and surrounding conventions. Match local style; do not reformat untouched lines. For UI changes, inspect the selected reference, existing components, tokens, extension points and consumers. Prefer reuse or compatible extension; explain a new component when existing options do not fit.
- Own the tests the authorized change needs. Update tests broken by an intended change and test new observable behavior. Fix a supplied bug reproduction at the cause; never weaken it to pass. Do not wait for a later adversarial tester to supply required coverage.
- Use the supplied repo verify/single-test commands within ownership, respect forbidden commands and address their failures. Apply the common contract's evidence-validity rules rather than rerunning every suite after every edit. Report behavior tests separately from rendered design/interaction checks; missing browser/reference access leaves affected visual claims unverified.
- Resolve routine choices from the brief, accepted requirements and repo conventions. Make reversible in-scope choices. Report consequential missing information or conflicts to the main, including effects on other contracts/jobs; continue independent authorized work.
- Return the packet identifier, changed files, what changed and why, actual commands/results, applicable reused evidence, open questions and deliberate omissions. Link required behavior to assertions/interactions on the final relevant state. Missing proof is unverified; unresolved expectations need a decision. Existing tool outputs suffice; a new report file or recorder is not required unless the assignment requests one.
