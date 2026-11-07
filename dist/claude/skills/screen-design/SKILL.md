---
name: screen-design
description: Compare rendered screens with supplied designs or capture supplied variants. Use with a supplied design comparison brief and explicit source-edit and server boundaries.
---

# screen-design

Apply the [common work contract](../../principles/work-contract.md) within this task’s scope. It owns applicable pre-action evidence, product implementation obligations and completion requirements; this skill supplies the method. Current common guidance already delivered or read may be reused.

## Task boundary

You check that a rendered screen matches its design. The orchestrator owns the servers; you only use the URLs it gives you.

Never edit source, commit, stash, checkout or reset. Never start a dev server on a port the repo settings forbid. Run one browser process at a time per login session file.

## Procedure

**Inputs.** The brief must give a design source (Figma node URL or local screenshot paths), the app URL, how to reach the screen and which states to check (default, hover, open, empty, error…), and the login session file if the app needs one. No design source and no variant URLs → return `BLOCKED: design source required for <screen>`; never infer the intended look from the code. If the brief says the look should stay the same → `BLOCKED: wrong agent — use a worker with /haechi:screen-parity`. Unreachable URL → `BLOCKED` with what failed.

**Variants.** When the brief gives several variant URLs (spec drafts) instead of a design source, the user chooses. Capture the same screens and states on every variant as **App** below describes, and open the images to confirm they show the requested state; do not rank the designs. Write one result file with `kind: "variants"`, `task`, and per state one image per variant labeled with the variant name; no verdicts, no items. Report the image paths and new console errors per variant.

**Design.** Open the supplied reference images with an image-capable tool. With a Figma node URL and Figma tools available, read its screenshot, layout values (padding, gap, sizes, text) and variables. When frame width and auto-layout padding disagree, padding wins. Sample text in a design is placeholder data, not a requirement.

**App.** Follow the tool-selection and export checks in the shared [capture procedure](${CLAUDE_PLUGIN_ROOT}/skills/document/references/capture.md). Prefer the repository's browser test helpers (the folder named in `.haechi.json` `screenCheck.helpers`, if any) or a throwaway Playwright script for controlled comparisons. A connected browser tool can substitute only when it supplies the required states, measurements and logs. Delete temporary scripts afterwards. Use an existing authorized login session; never type a password. Never perform actions that write server data. Capture each state as a screenshot of the region matching the design frame, and read the numbers that matter with computed styles and bounding boxes.

When the caller also needs document attachments, follow the shared [capture and numbered-annotation procedure](${CLAUDE_PLUGIN_ROOT}/skills/document/references/capture.md). Keep original captures for comparison and create separate marked copies for explanation. This does not change the design/variant input requirements or make the attachment an approval.

Choose additional checks only where the changed interaction needs them: for example keyboard entry, closing and focus return for a modal, or failed requests for a save. Distinguish console errors, uncaught exceptions and unhandled rejections when collecting runtime errors. Report relevant states or interactions you could not check; a screenshot does not prove an interaction works.

**Compare, in this order.**
1. Open both the reference and captured app images for each checked state and visually compare corresponding regions. Look for concrete differences such as clipping, overlap, wrapping, alignment, missing icons or unreadable text; follow the task's criteria rather than imposing a new design preference. Saving screenshots or generating a report is not this comparison.
2. Use structure and content to check which elements exist, their order, labels, icons and state. Use measurements to explain or confirm relevant visual differences: expected versus actual values; ignore rounding of 1px or less. Map design colors to the repository's theme tokens.
3. Concrete visual defects are `MISMATCH` even if the measured values match. Purely subjective preferences (balance, visual weight) are `NEEDS_USER_REVIEW`; do not defer observable defects as taste. Pixel diffs against a design are not a verdict — fonts and data differ.

If images cannot be opened or a required region is unreadable, report `CANNOT_TELL` for that comparison and `BLOCKED` for that state and overall, keeping any partial checks. Never claim visual agreement from measurements alone.

**Report.** One line per check — `MATCH` / `MISMATCH (expected X, got Y, where)` / `NEEDS_USER_REVIEW (why)` / `CANNOT_TELL (why)`; image paths with design and app side by side per state; new console errors. Name the image pair and region behind visual findings, and state which comparisons or interactions remain unverified. Also write the results as one JSON file for `screen-report.mjs` (schema in its header comment): `kind: "design"`, `task`, `verdict`, `states` with `images` (Figma, AFTER, Diff) and `items` classed `MATCH` or `MISMATCH`, `consoleErrors`, and `openQuestions` holding every `NEEDS_USER_REVIEW` and `CANNOT_TELL` check with its reason. Approval of the look belongs to the user — say which images they should look at.
