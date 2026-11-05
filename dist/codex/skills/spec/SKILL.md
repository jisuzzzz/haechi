---
name: spec
description: Establish the problem, scope, expected behavior and acceptance criteria, with an optional saved spec. Use when the user requests a spec. Strongly recommended for new or changed workflows and interacting behavior such as permissions, validation, failure handling or cross-system contracts, to bring scope, edge cases and checkable completion criteria together before implementation, even when individual requirements are known. Also recommended in other playbooks when expected behavior, preserved contracts, scope or success criteria need clarification. Requirements can be known but still need synthesis. A narrow task with sufficiently established requirements and completion criteria can proceed directly without this skill; it does not require a document, repeated questions or approval.
---

# Write a spec

Only the main session runs this skill. Subagents cannot ask the user anything, so they never write a spec; they report open questions to you.

A spec answers **what and why**: problem, goal, scope, expected behavior, edge-case decisions, acceptance criteria, constraints. Requirements already established in the conversation or repository can serve as the spec; they need no repeated approval. A plan answers **how and in what order**: files, type sketches, units, delegation, checks, risks. Choose the implementation plan yourself.

**Selection.** Use the conditions in this skill's description. This is a recommendation, not a mandatory stage in every feature or other playbook. Do not equate known individual requirements with a sufficiently established overall scope and acceptance criteria. Conversely, reuse a complete existing account of the requirements and proceed directly when further synthesis adds no value. File counts, code size, a new screen or a changed export alone do not decide selection. Selecting this skill does not require a saved document, repeated questions or approval. Resolve consequential open decisions before dependent work even when this skill is not selected; decide reversible implementation details yourself.

## Steps

1. **Establish the requirements.** Identify the intended outcome, scope, behavior that must stay unchanged and acceptance criteria. A brief conversation summary is enough unless a saved spec is requested or useful. Fixed labels and tables are optional.
2. **Resolve consequential decisions.** Read the code, docs and prior conversation first. Batch the questions that remain and explain meaningful alternatives. Reuse accepted decisions without asking again. Continue work that does not depend on an unanswered question.
3. **Visual previews.** For new or changed visible UI or user interactions, run /haechi:preview before implementation, even without an explicit preview request. Also use it for requested mockups or visual variants that clarify a consequential choice. Reuse the user's existing preference; a preview does not require a saved spec.
4. **Optional saved spec.** Write Markdown directly using the repository's document convention. Include the problem, goal, scope, expected behavior and acceptance criteria; add edge cases, constraints, open questions and decisions when relevant. Keep one editable document and omit empty sections.
   - Each acceptance criterion must be checkable: a test name, a screen state or an observable response.
   - Use `Draft` for proposed decisions and `Approved` only when the conversation establishes the user's acceptance. Do not require another approval for an accurate record of already accepted requirements.
5. **Review the wording.** For a saved draft, apply the common writing rules before showing it; consult the [clear-writing principle](../../principles/clear-writing.md) as needed. Apply edits directly to the Markdown document.
6. **Proceed on existing authorization.** Ask only about consequential unresolved decisions or actions outside the user's authorization. Do not add a formal approval round merely because a document was written. When the user explicitly requests a review before implementation, wait for that review.
7. **Plan.** Choose the implementation order and delegation. Summarize it when useful; it needs no separate approval.

## Where it lives

- When saving a spec, honor an explicit path, the repository convention or `specDir` from `.haechi.json`; fill placeholders such as `{feature}` from the task. Missing `specDir` does not block work or require setup. Choose a reversible location inside the repository when needed.
- After implementation, update the feature's canonical doc with the changed behavior and decisions, preserving unchanged contracts and exception cases. A temporary dated spec may be removed after merge when cleanup is authorized; the history stays in the commits.
