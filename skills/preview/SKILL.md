---
name: preview
description: Shows UI ideas fast as a throwaway one-file HTML prototype with adaptable presentation and fake data, so the user can compare screens, animation and interaction before the real build; uses an illustrative widget or the real app only when that fits better. Use for UI design or appearance changes, feedback on generated screens, mockups, visual alternatives, and animation or interaction changes, even when the user does not name this skill.
---

# UI preview

Run this skill for requests to design or change visible UI, including the preview shell or generator itself, even without an explicit preview command. Show a rendered, interactive proposal before treating an appearance change as complete; a code diff or prose description alone is insufficient. Feature and spec are not prerequisites. A preview does not require a saved spec or a new approval of settled requirements.

The goal is speed: the user sees and touches the idea before anyone writes product code. Preview code is disposable.

## Steps

1. **Identify the behavior.** Read the user's request, supplied references and the relevant screen in the application. Identify the screens, states and interactions the preview must show, and what the variants differ in. Decide whether the subject is a whole screen or a component before choosing its dimensions.
2. **Pick the medium.** Name the medium in one line and proceed; ask only when the user's words point both ways.
   - **Throwaway prototype (default).** One self-contained HTML file with a lightweight comparison shell, outside the repository, with fake data. It opens in a browser without a server. Use it for layout, animation and interaction choices.
   - **Illustrative widget.** A static or lightly interactive picture rendered inline. Use it when the user asks for one or a still image answers the question. Do not pick it to save effort when motion or interaction is the point.
   - **Running application.** Use it only when the user asks, or when the choice depends on real data, state or integration that fake data cannot stand in for. Say which dependency made you switch.
3. **Build it fast.** For a throwaway prototype:
   - Create the file with `node <tools>/preview-scaffold.mjs --out <dir>/<task>.html --title "<title>" --variants "A,B" --states "Empty,Loaded"`. Use the session's scratch or temp directory; use `<notesDir>/previews/` only when the user wants to keep it. The tool refuses paths inside a git work tree. The tools folder is two levels above this skill; resolve `notesDir` from `~/.haechi/user.json`.
   - The file has a top bar with variant and state switchers, a side-by-side toggle and a short "Sample data" disclosure. Start with fake data per state in `STATES`, one `render(data, root)` per variant in `VARIANTS`, and the prototype style block. The shell is a starting point, not a visual standard: adapt its markup, styles and layout to the request. Preserve working variant/state selection, comparison, and the fake-data disclosure when changing the shell; update selectors and handlers together if its structure changes.
   - For a few variant/state controls and a comparison toggle, use a compact header and leave the canvas available to the subject. Use a sidebar only when the controls need enough hierarchy or space to justify it, or when requested.
   - Use one set of controls: when moving navigation into a sidebar or another layout, remove the original controls instead of duplicating them. Open directly into the preview; do not add a landing page, gallery or separate entry screen unless requested. Use English for preview-shell labels and guidance. Use compact pill-shaped badge buttons in a black-and-white shell: light gray at rest, black with white text when selected, no persistent borders, and a visible keyboard-focus indicator. Keep any product-specific colors confined to the previewed subject when the brief requires them. Keep visible copy to the task title, useful action/state labels and a short sample-data disclosure; omit scaffold branding, variant counts and disposable-prototype explanations. Use Pretendard consistently for the shell, controls and sample content; the scaffold embeds the font for offline use.
   - Match the preview size to its subject. Tooltips, popovers, menus, buttons and small dialogs keep realistic intrinsic or reference dimensions and appear with just enough surrounding context (such as their trigger) to explain placement. Do not stretch them to fill a comparison cell or add a minimum height to fill the canvas. Pages, dashboards and full-screen flows use the intended viewport width and height. Keep component dimensions consistent across single and side-by-side views; reflow or scroll the comparison layout rather than scaling up the component. The generated variant root defaults to intrinsic width; explicitly set its width to 100% for a whole-screen preview.
   - Choose the visual direction from the user’s brief and application references. Do not carry the shell’s typography, colors or framing into the product UI by default, or reproduce an unrelated design system unless requested. When alternatives concern visual direction, vary hierarchy, composition, density or typography meaningfully; for a narrow behavior comparison, keep the surrounding design consistent.
   - Spend no time on architecture, tests, error handling or repository conventions. Plain DOM and CSS are enough; copy markup, colors or tokens from the application when that gets closer to the real look faster.
   - Use synthetic fake data, just enough to show the states. No real records.
   - Open the file in a browser and check that every variant renders in every state and its interactions run. Give the user the file path only after that check.

   For a running-application preview, start its development server, check the requested state in a real render, and provide only URLs whose content you checked. Separate variants there may need separate worktrees: record the source branch used for each variant, run configured setup, use free ports and avoid `devServer.forbiddenPorts`.

   If execution, browser access or URL exposure is unavailable, report the limitation and the alternatives; never present a prototype or widget as the real app.
4. **Compare.** One variant is fine unless the user asked for several. For several variants, open in side-by-side comparison by default and let the user select a variant to inspect it alone. Say what each one changes against the stated criteria; the prototype's side-by-side toggle shows them together. For running-application variants, a worker using the `variants` delegation contract below can capture them with `kind: "variants"`, and `node <tools>/screen-report.mjs --out <notesDir>/screen-reports/<task>/variants.html <result.json>...` renders one report. Open reports only when `openReports` is on.
5. **Carry over the direction, not the code.** Record which variant was chosen and what about it matters (layout, timing, interaction). The real implementation follows the normal playbook and repository conventions. Copying prototype code into the application is a separate decision; state it when you make it.
6. **Clean up.** Keep preview servers up while the user reviews, then stop the servers you started and delete the prototype file unless the user wants to keep it. Before removing variant worktrees, run `node <tools>/cleanup-merged.mjs <variant branch> --base <source branch> --discard` to show the removal list. Resolve a missing source branch from the task context or repository settings before proceeding. Keep the same `--base` when adding `--yes`, and do so only when deletion is authorized. Never use `git worktree remove --force` by hand.

## Evidence

Report the medium, where the preview lives, the states and interactions you checked in a browser, and checks you could not run. A running process or open port alone does not prove the preview works.

## Delegation contracts

For independent variant capture, use /haechi:delegate with this contract. The main session owns the preview workflow and user choice. Repository files remain read-only; name authorized output paths separately. `loginContext` may state that no login is needed.

```haechi-handoffs
{
  "variants": {
    "skills": [
      "screen-design"
    ],
    "principles": [
      "real-artifact"
    ],
    "checks": [],
    "writeScope": "read-only",
    "contextRequired": [
      "repository",
      "urls",
      "states",
      "artifactLocation",
      "loginContext"
    ],
    "completion": [
      "Capture the supplied variants as kind: variants, without a MATCH/MISMATCH verdict or ranking; return actual screenshots for the user to choose, or BLOCKED with missing evidence."
    ]
  }
}
```
