---
name: spec
description: Clarifies consequential behavior or scope choices and records acceptance criteria, with an optional saved spec. Use for /haechi:spec, when the user asks for a spec, or when unresolved requirements need a decision before implementation.
---

# Write a spec

Only the main session runs this skill. Subagents cannot ask the user anything, so they never write a spec; they report open questions to you.

A spec answers **what and why**: problem, goal, scope, expected behavior, edge-case decisions, acceptance criteria, constraints. Requirements already established in the conversation or repository can serve as the spec; they need no repeated approval. A plan answers **how and in what order**: files, type sketches, units, delegation, checks, risks. Choose the implementation plan yourself.

**When.** Use this skill when the user requests a spec or consequential behavior or scope choices remain unresolved after reading the available context. A new screen, changed export or multiple units does not by itself require a document or approval. Decide reversible implementation details yourself. A bug with an established expected behavior needs no separate spec.

## Steps

1. **Establish the requirements.** Identify the intended outcome, scope, behavior that must stay unchanged and acceptance criteria. A brief conversation summary is enough unless a saved spec is requested or useful. Fixed labels and tables are optional.
2. **Resolve consequential decisions.** Read the code, docs and prior conversation first. Batch the questions that remain and explain meaningful alternatives. Reuse accepted decisions without asking again. Continue work that does not depend on an unanswered question.
3. **Visual previews.** When the user explicitly asks for a UI preview or mockup, run /haechi:preview. Also use it when visual variants would resolve a consequential layout or interaction choice. Reuse the user's existing preference; a preview does not require a saved spec.
4. **Optional saved spec.** Write Markdown directly using the repository's document convention. Include the problem, goal, scope, expected behavior and acceptance criteria; add edge cases, constraints, open questions and decisions when relevant. Keep one editable document and omit empty sections.
   - Each acceptance criterion must be checkable: a test name, a screen state or an observable response.
   - Use `Draft` for proposed decisions and `Approved` only when the conversation establishes the user's acceptance. Do not require another approval for an accurate record of already accepted requirements.
5. **Review the wording.** For a saved draft, use /haechi:plain before showing it. Apply edits directly to the Markdown document.
6. **Proceed on existing authorization.** Ask only about consequential unresolved decisions or actions outside the user's authorization. Do not add a formal approval round merely because a document was written. When the user explicitly requests a review before implementation, wait for that review.
7. **Plan.** Choose the implementation order and delegation. Summarize it when useful; it needs no separate approval.

## Where it lives

- When saving a spec, honor an explicit path, the repository convention or `specDir` from `.haechi.json`; fill placeholders such as `{feature}` from the task. Missing `specDir` does not block work or require setup. Choose a reversible location inside the repository when needed.
- After implementation, keep final behavior and decisions in the feature's canonical doc. A temporary dated spec may be removed after merge when cleanup is authorized; the history stays in the commits.
