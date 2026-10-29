---
name: spec
description: Clarifies consequential behavior or scope choices and records acceptance criteria, with an optional saved spec. Use for /haechi:spec, when the user asks for a spec, or when unresolved requirements need a decision before implementation.
---

# Write a spec

Only the main session runs this skill. Subagents cannot ask the user anything, so they never write a spec; they report open questions to you.

A spec answers **what and why**: problem, goal, scope, expected behavior, edge-case decisions, acceptance criteria, constraints. Requirements already established in the conversation or repository can serve as the spec; they need no repeated approval. A plan answers **how and in what order**: files, type sketches, units, delegation, checks, risks. Choose the implementation plan yourself.

**When.** Use this skill when the user requests a spec or consequential behavior or scope choices remain unresolved after reading the available context. A new screen, changed export or multiple units does not by itself require a document or approval. Decide reversible implementation details yourself. A bug with an established expected behavior needs no separate spec.

The haechi tools folder is two levels above this skill's folder (`<this skill's folder>/../../tools/`). Run tools with `node`.

## Steps

1. **Establish the requirements.** Identify the intended outcome, scope, behavior that must stay unchanged and acceptance criteria. A brief conversation summary is enough unless a saved spec is requested or useful. Fixed labels and tables are optional.
2. **Resolve consequential decisions.** Read the code, docs and prior conversation first. Batch the questions that remain and explain meaningful alternatives. Reuse accepted decisions without asking again. Continue work that does not depend on an unanswered question.
3. **Optional visual variants.** Use a supplied reference when available. If the user asks you to design, create a draft using repository patterns and the stated requirements. Offer variants when they would resolve a consequential layout or interaction choice; multiple agents and worktrees are optional and should have a clear benefit. Ask before substantial extra work not covered by the request.
   - If variants need separate worktrees, run their configured setup, use free dev-server ports and avoid `devServer.forbiddenPorts`.
   - For a comparison report, screen-design-checker can write `kind: "variants"` results, and `node <tools>/screen-report.mjs --out <notesDir>/screen-reports/<task>/variants.html <result.json>...` renders them (`notesDir` from `~/.haechi/user.json`). Give the user the actual variant URLs and report path. Open the report only when `openReports` is on.
   - Stop servers when finished. For a disposable variant worktree, first run `node <tools>/cleanup-merged.mjs <variant branch> --discard` to list what would be removed. Delete only when the user's authorization covers it; otherwise show the list and ask before rerunning with `--yes`. Preserve skipped work and report it. Never use `git worktree remove --force` by hand. Record the selected behavior.
4. **Optional saved spec.** Use the repository's document convention. The renderer is available when its structured format helps: write fields JSON in the system temp folder, then run `node <tools>/render-doc.mjs spec <fields.json> --out <file.md>`. Fields: `title`, `date`, `status`, `problem`, `goal`, `inScope[]`, `outOfScope[]`, `behavior[]`, `edgeCases[] {case, decision}`, `acceptance[]`, `constraints[]`, `openQuestions[] {question, answer?}`, `decisions[] {date, item, decision, note?}`. When using the renderer, every list is required; pass `[]` when empty. Exit 2 lists bad fields to fix together. Remove temporary inputs when finished.
   - Each acceptance criterion must be checkable: a test name, a screen state or an observable response.
   - Use `Draft` for proposed decisions and `Approved` only when the conversation establishes the user's acceptance. Do not require another approval for an accurate record of already accepted requirements.
5. **Review the wording.** For a saved draft, use /haechi:plain before showing it. If using fields JSON, put edits there and render again so both copies agree.
6. **Proceed on existing authorization.** Ask only about consequential unresolved decisions or actions outside the user's authorization. Do not add a formal approval round merely because a document was written. When the user explicitly requests a review before implementation, wait for that review.
7. **Plan.** Choose the implementation order and delegation. Summarize it when useful; it needs no separate approval.

## Where it lives

- When saving a spec, honor an explicit path, the repository convention or `specDir` from `.haechi.json`; fill placeholders such as `{feature}` from the task. Missing `specDir` does not block work or require setup. Choose a reversible location inside the repository when needed.
- After implementation, keep final behavior and decisions in the feature's canonical doc. A temporary dated spec may be removed after merge when cleanup is authorized; the history stays in the commits.
