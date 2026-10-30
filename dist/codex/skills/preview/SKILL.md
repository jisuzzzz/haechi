---
name: preview
description: Shows UI ideas fast as throwaway running prototypes with fake data, so the user can compare screens, animation and interaction before the real build; uses an illustrative widget or the real app only when that fits better. Use when the user asks for a UI preview, mockup, visual alternatives, or to compare designs, including animation and interaction changes.
---

# UI preview

Run this skill directly for preview requests; feature and spec are not prerequisites. A preview does not require a saved spec or a new approval of settled requirements.

The goal is speed: the user sees and touches the idea before anyone writes product code. Preview code is disposable.

## Steps

1. **Identify the behavior.** Read the user's request, supplied references and the relevant screen in the application. Identify the screens, states and interactions the preview must show, and what the variants differ in.
2. **Pick the medium.** Name the medium in one line and proceed; ask only when the user's words point both ways.
   - **Throwaway prototype (default).** A small app that runs on its own, outside the application's source tree, with fake data. Use it for layout, animation and interaction choices.
   - **Illustrative widget.** A static or lightly interactive picture rendered inline. Use it when the user asks for one or a still image answers the question. Do not pick it to save effort when motion or interaction is the point.
   - **Running application.** Use it only when the user asks, or when the choice depends on real data, state or integration that fake data cannot stand in for. Say which dependency made you switch.
3. **Build it fast.** For a throwaway prototype:
   - Write it in the session's scratch or temp directory, never in the repository. Use `<notesDir>/previews/<task>/` instead only when the user wants to keep it.
   - Spend no time on architecture, tests, types beyond what runs, error handling or repository conventions. Copy markup, styles or tokens from the application when that gets closer to the real look faster.
   - Replace the backend with inline fake data, just enough to show the states. Use synthetic values only.
   - Put the variants in one prototype behind a switcher or side by side, so the user compares them on one URL with the same data.
   - Start it, open it in a browser and check that every variant renders and its interactions run. Give the user the URL or file only after that check.

   For a running-application preview, start its development server, check the requested state in a real render, and provide only URLs whose content you checked. Separate variants there may need separate worktrees: run configured setup, use free ports and avoid `devServer.forbiddenPorts`.

   If execution, browser access or URL exposure is unavailable, report the limitation and the alternatives; never present a prototype or widget as the real app.
4. **Compare.** One variant is fine unless the user asked for several. For several variants, say what each one changes against the stated criteria. For running-application variants, `screen-design-checker` can capture them with `kind: "variants"`, and `node <tools>/screen-report.mjs --out <notesDir>/screen-reports/<task>/variants.html <result.json>...` renders one report. The tools folder is two levels above this skill; resolve `notesDir` from `~/.haechi/user.json`. Open reports only when `openReports` is on.
5. **Carry over the direction, not the code.** Record which variant was chosen and what about it matters (layout, timing, interaction). The real implementation follows the normal playbook and repository conventions. Copying prototype code into the application is a separate decision; state it when you make it.
6. **Clean up.** Keep preview servers up while the user reviews, then stop the servers you started and delete the prototype folder unless the user wants to keep it. Before removing variant worktrees, run `node <tools>/cleanup-merged.mjs <variant branch> --discard` to show the removal list, and run it with `--yes` only when deletion is authorized. Never use `git worktree remove --force` by hand.

## Evidence

Report the medium, where the preview lives, the states and interactions you checked in a browser, and checks you could not run. A running process or open port alone does not prove the preview works.
