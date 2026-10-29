---
name: spec
description: Writes a spec (what and why, approved by the user) before a feature, a large refactor or an ambiguous request, with all decisions asked at once and throwaway screen variants when words are not enough. Use for /haechi:spec, when a playbook says to write a spec, or when the user asks for one.
---

# Write a spec

Only the main session runs this skill. Subagents cannot ask the user anything, so they never write a spec; they report open questions to you.

A spec answers **what and why**: problem, goal, scope, expected behavior, edge-case decisions, acceptance criteria, constraints. The user approves it, and it outlives the code change — tests, reviews and the done check are judged against it. A plan answers **how and in what order**: files, type sketches, units, delegation, checks, risks. The plan is yours and is not approved.

**When.** The feature playbook asks for a spec when there are two or more decisions, a new screen, an external contract change or two or more units. Large refactors and requests that can be read in two ways also get one. Skip it for a small-fix. A bug gets no spec, only one question that confirms the expected behavior.

The haechi tools folder is two levels above this skill's folder (`<this skill's folder>/../../tools/`). Run tools with `node`.

## Steps

1. **Restatement.** Start from the Current / Target / Keep / Proof lines of the session rules. For a new feature Target (who, in what situation, what scope) carries the most weight; for an improvement it is Keep.
2. **Collect every decision, then ask once.** Read the code and the docs first, so you ask only what they cannot answer. Put each decision in format A (choice) and send them all in one message. A decision already recorded in the repo is quoted, not asked again.
3. **Variants for what words cannot settle.** For layout or interaction decisions, offer 2–3 throwaway variants. Building them is costly work, so this is an ask item; once the user agrees:
   - Give each variant to its own `implementer` in its own worktree, in parallel. Run `worktreeSetup` from `.haechi.json` in each.
   - Start one dev server per variant with `devServer.command`, each on its own free port. Never use a port in `devServer.forbiddenPorts` or one already in use.
   - Run `screen-design-checker` in variants mode with every variant's URL and the states to capture; it writes `kind: "variants"` result files. Build one comparison report from them: `node <tools>/screen-report.mjs --out <notesDir>/screen-reports/<task>/variants.html <result.json>...` (`notesDir` from `~/.haechi/user.json`).
   - Give the user each variant's real URL and the report path. Open the report only when `openReports` is on.
   - After the user picks: stop every server, then from the main checkout run `node <tools>/cleanup-merged.mjs <variant branch> --discard` for each variant. It only lists. Show all the to-delete and skipped lines and ask once — picking a variant is not a yes to deleting the others. On yes, rerun each with `--yes`. A variant skipped for uncommitted changes or an upstream stays; tell the user. The tool unlinks links inside the worktree first (a linked dependency folder would otherwise lead the deletion into the main checkout) and runs `worktreeTeardown`. Never `git worktree remove --force` by hand. Only the decision survives, as a Decision log row.
4. **Write the spec.** Write the fields as JSON to a file in the system temp folder (tool input only; delete it once the spec is approved), then run `node <tools>/render-doc.mjs spec <fields.json> --out <file.md>`. Fields: `title`, `date`, `status`, `problem`, `goal`, `inScope[]`, `outOfScope[]`, `behavior[]`, `edgeCases[] {case, decision}`, `acceptance[]`, `constraints[]`, `openQuestions[] {question, answer?}`, `decisions[] {date, item, decision, note?}`. Every list is required; pass `[]` when empty. Exit 2 lists every bad field at once — fix them all and run it again.
   - Each acceptance criterion must be checkable: a test name, a screen state or a response someone can look at.
   - Use status `Draft` until the user approves, then `Approved`.
5. **Run /haechi:plain on the draft** before you show it. Put its edits into the fields JSON and render again, so the file and the JSON stay the same.
6. **Approval.** Show the spec. Ask for approval only when every open question has an answer. Otherwise ask the open questions first, put each answer and its Decision log row into the fields JSON, and render again.
7. **Plan.** Write the plan yourself and summarize it in the Verdict notice of the session rules. It needs no approval.

## Where it lives

- Save the spec as `<specDir>/YYYY-MM-DD-<slug>.md`, with `specDir` from `.haechi.json`. Fill any placeholder in it, such as `{feature}`, from the task.
- `specDir` missing: ask once where specs go, then suggest adding it with /haechi:setup.
- After the change is implemented, move only the conclusion (the final behavior and the decisions) into the feature's canonical doc. Delete the dated spec once the change is merged; the history stays in the commits.
