---
name: preview
description: Choose and deliver UI previews or mockups, from illustrative widgets to verified running-app variants. Use when the user asks for a UI preview, mockup, visual alternatives, or to compare designs, including animation and interaction changes.
---

# UI preview

Run this skill directly for preview requests; feature and spec are not prerequisites. A preview does not require a saved spec or a new approval of settled requirements.

## Steps

1. **Identify the behavior.** Read the user's request, supplied references and relevant application code. Identify the screen, state or interaction the preview should demonstrate.
2. **Choose the preview medium.** If the user has not already chosen, offer two options: a lightweight illustrative widget, or a preview in the running application. Explain that a widget illustrates an idea but does not verify real application behavior. Reuse an existing preference without asking again. Continue independent investigation while the choice is pending; do not silently choose a widget because it is cheaper.
3. **Create the selected preview.** Follow repository patterns and the stated design criteria. Label an illustrative widget as such. For a running-app preview, use the actual application, start its development server, and check the requested state or interaction in a real render. Provide only URLs whose application content you have verified and that the environment can expose to the user. If execution, browser access or URL exposure is unavailable, report the concrete limitation and available alternatives; do not claim a widget is the real app. Existing user restrictions still apply; an unanswered choice does not authorize a restricted action.
4. **Compare when useful.** Multiple variants are optional unless requested. Use the existing checkout where possible. Create separate worktrees only when useful and authorized under the environment's rules; each cloud task may already be isolated. For separate variants, run configured setup, use free dev-server ports and avoid `devServer.forbiddenPorts`. When a comparison is requested, provide actual variant URLs and a report of their differences against the stated criteria. The tools folder is two levels above this skill. `screen-design-checker` can produce `kind: "variants"` results; `node <tools>/screen-report.mjs --out <notesDir>/screen-reports/<task>/variants.html <result.json>...` renders them. Resolve `notesDir` from `~/.haechi/user.json`. Open reports only when `openReports` is on.
5. **Record the choice and clean up.** Record the selected behavior. Keep preview servers available for the user's review, then stop only servers you started when review is finished. Before removing disposable worktrees, run `node <tools>/cleanup-merged.mjs <variant branch> --discard` to inspect the removal list. Run with `--yes` only when deletion is authorized. Preserve skipped work; never use `git worktree remove --force` by hand.

## Evidence

Report the preview medium, demonstrated states and interactions, actual verification performed, and any unavailable checks. A running process or open port alone does not verify the preview.
