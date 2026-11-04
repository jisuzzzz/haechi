---
name: screen-parity
description: Compare before and after screens against intended differences and a noise baseline. Use with a supplied before/after comparison brief and explicit source-edit and server boundaries.
---

# screen-parity

## Task boundary

You check that a change left the screen as it was, except for the differences the brief says are intended. The orchestrator owns the servers; you only use the URLs it gives you.

Never edit source, commit, stash, checkout or reset. Never start a dev server on a port the repo settings forbid. Run one browser process at a time per login session file.

## Procedure

**Inputs.** BEFORE URL (server at the base revision), AFTER URL (server with the change), the screens and states to visit, the intended differences (empty for a pure refactor), and the login session file if needed. Missing or unreachable URL → `BLOCKED` with what is missing. A design-driven redesign → `BLOCKED: wrong agent — use a worker with /haechi:screen-design`.

**Capture.** Follow the tool-selection and export checks in the shared [capture procedure](${PLUGIN_ROOT}/skills/document/references/capture.md). Prefer one throwaway script, in a temporary file you delete afterwards, that takes the base URL as a parameter and drives every state with the repository's browser test helpers (`.haechi.json` `screenCheck.helpers`) or Playwright directly. A connected browser tool can substitute only when it reproduces the same conditions and supplies every required capture, snapshot and log. Use an existing authorized login session; never type a password; never perform actions that write server data. Per state save a viewport screenshot (animations disabled, same viewport both sides), the accessibility snapshot of the relevant region, and console errors. Mask regions that change by themselves (relative times, clocks, spinners).

When the caller also needs document attachments, follow the shared [capture and numbered-annotation procedure](${PLUGIN_ROOT}/skills/document/references/capture.md). Keep comparison images and masks separate from untouched evidence and numbered explanatory copies. A comparison with disabled animations is not evidence of motion or real-time behavior; record that separately only when needed. This does not change the BEFORE/AFTER input requirements.

Choose interaction checks relevant to the change, such as keyboard navigation and focus return or save-request failures, and run the same checks on both versions. Distinguish console errors, uncaught exceptions and unhandled rejections. Mark relevant states or interactions left unchecked; image comparison alone does not verify them.

**Noise baseline.** Run BEFORE twice, then AFTER once, back to back. The BEFORE-to-BEFORE difference is noise. If data changed between the two BEFORE runs, run again.

Do not widen masks or weaken the capture procedure to hide an AFTER difference. If the measurement setup needs correction, explain why and repeat the BEFORE captures as well as AFTER.

**Compare.**
1. Open the original BEFORE and AFTER images for each checked state with an image-capable tool and visually compare corresponding regions, even when the pixel difference is small. Check concrete changes in clipping, overlap, wrapping, alignment, icons and readability against the intended differences. Saving screenshots or generating a report does not count as viewing them.
2. Compare accessibility snapshots for structure, text, labels and states. Use pixel differences above the noise baseline and the opened diff image to locate or confirm changes. Neither a matching tree nor a low pixel count alone proves visual parity.
3. Classify each difference as `EXPECTED` (an intended difference), `UNEXPECTED` (regression) or `NOISE`. An intended difference that does not appear is also a failure.
4. Console errors present in AFTER but not BEFORE are findings.

If the images cannot be opened or a required region is unreadable, return `BLOCKED` for that state and overall and report the partial checks; do not return a visual `PASS`. Pure aesthetic preferences are open questions, not regressions.

**Report.** `PASS`, `FAIL` or `BLOCKED`; per state, differences by class with the viewed image pair, region and supporting snapshot lines or diff image path; intended differences confirmed or missing; new console errors; the noise level observed; relevant comparisons or interactions left unverified. Also write the results as one JSON file for `screen-report.mjs` (schema in its header comment): `kind: "parity"`, `task`, `verdict`, `states` with `images` (BEFORE, AFTER, Diff) and classed `items` (intended differences as `EXPECTED`), `consoleErrors`, `noise`, `openQuestions`. A difference you cannot classify from the brief is an open question, not a FAIL.
