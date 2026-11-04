# Capture actual evidence and attach numbered regions

For an empty Failed list, capture the count and list in one viewport. Mark the count as 1 and the list as 2. In the document explain what is inconsistent, link the untouched original, and ask the owning team to confirm the suspected cause. This is the shared capture procedure for documents, `worker with /haechi:screen-design` and `worker with /haechi:screen-parity`; collecting an attachment does not require running a design or parity comparison.

## Choose an available capture method

Start with what the evidence must show, then inspect the tools actually available in this session. Check page access and control, PNG file export, GIF recording, video recording, and any measurements or logs needed for the task. A model-visible screenshot is not necessarily a saved attachment. Do not infer recording or file-export support from a product name, a browser connection, or a tool used in another session.

| Evidence needed | Preferred available method | Fallback and limits |
| --- | --- | --- |
| A value, layout or empty state | A connected browser tool that can reach the state and save a PNG. | Reuse a project helper, or a temporary Playwright script with installed tooling. |
| A short sequence of actions for explanation | A connected GIF recorder that can save the result. | Use an existing video recorder and convert when supported. Inspect whether frames are sampled or waits are shortened; do not claim timing evidence from an illustrative sequence. |
| Repeatable design or before/after comparison | Existing project helpers or Playwright with controlled states and capture conditions. | A connected browser tool is suitable only if it can supply the same required conditions, measurements, snapshots and logs. Report unavailable checks rather than weakening the comparison. |
| Flicker, waiting or event timing | A recorder with verified time preservation, plus relevant logs. | Keep usable partial evidence and name the timing claim that remains unverified. A GIF export alone does not prove continuous capture or original timing. |

For example, use Claude in Chrome's GIF tool only when it is exposed and supports the required recording and export. For Codex or any other host, inspect the connected browser's actual capabilities instead of assuming an equivalent GIF tool. Tool selection does not change access permissions or the caller's evidence requirements. Avoid a new capture stack when available tools can supply the required evidence.

## Collect the actual state

Use the provided app URL or the project's established run command and the method selected above. Before writing a script, read `.haechi.json` `screenCheck.helpers` and relevant browser tests. Reuse a helper that reaches the required state; otherwise write a temporary Playwright script using the project's installed browser tooling. Remove temporary scripts after collecting results unless the user asked to keep a reusable reproduction.

Use an existing authorized login session; do not place passwords or session secrets in the document. Keep the check read-only under the existing screen-checker constraints. A reproduction that changes server data needs an appropriately authorized test environment; collecting evidence does not grant production mutation authority. The main session owns any server it starts and cleans up temporary resources.

Follow the recorded steps and confirm the target state before saving the PNG. Record URL, environment, build/revision if known, timestamp, viewport, reproduction steps and the observed result. State unknown values as unknown. Preserve the unmodified PNG. Avoid capturing unrelated private content; if redaction is needed, keep the protected original in its authorized location and label the shareable copy as redacted. Do not attach restricted originals to a wider audience.

Confirm that each exported file exists and opens in the intended viewer. Open saved images and inspect the recorded sequence to check the requested state or actions; report any playback or inspection limit. Tool success alone is not proof of a usable attachment or a verified bug. If a tool exposes only an image preview, use a supported export or another capture method before promising a saved file.

## Locate regions without changing the page

Get bounding boxes from the rendered elements when possible. For a viewport PNG, `page.screenshot({ path, fullPage: false, scale: 'css' })` pairs with visible element `boundingBox()` coordinates. Ensure the page has not scrolled, resized or changed between measurement and capture. Convert fractional bounds outward: floor the left/top, ceil the right/bottom, clip to the PNG bounds, then calculate integer width/height. An off-screen or empty rectangle needs another capture. Browser helpers may use other capture settings; crop offsets, full-page scroll and device scale must be converted into **original PNG pixel coordinates** before annotation. For an existing image, inspect it and measure the intended regions directly.

Do not change page data or insert a pretend expected result to make evidence. Include enough surrounding context to understand the symptom. If using a cropped image, keep a contextual capture and identify the crop.

Save region coordinates and concise explanations in a separate JSON file:

```json
{"regions":[
  {"x":120,"y":80,"width":160,"height":40,"label":"The failure count is 3."},
  {"x":120,"y":150,"width":520,"height":180,"label":"The list for the same conditions is empty."}
]}
```

These are illustrative coordinates. Measure the actual capture instead of copying them.

```sh
node "${CLAUDE_PLUGIN_ROOT}/tools/screenshot-annotate.mjs" --image /chosen/path/original.png --regions /chosen/path/regions.json --out /chosen/path/annotated.png
```

The tool uses the original's pixels to create a separate PNG, with numbered borders and space for edge markings. It prints paths, dimensions and numbered explanations as JSON. Supply standard 8-bit, non-interlaced RGB/RGBA PNGs; unsupported images fail explicitly. Re-capture as PNG rather than silently changing the evidence. Select disjoint regions. If regions overlap or there is no clear space for their numbers, merge related observations into one region, use fewer regions or separate marked images. The tool fails instead of hiding another selected region. Keep the original. Open both images, confirm the marked region is right and legible, and check that the labels match the numbers. Color alone must not carry the meaning.

## Attach to the document

Store shareable media beside the document, such as `request.assets/original.png` and `request.assets/annotated.png`. Use paths relative to the document, not the plugin installation or the author's home directory. Place the attachment section after the discussion and review records, before the final evidence notes. For example:

```markdown
The Failed screen’s count and list do not match.[^failed-screen]

## Attachments

![Failure count and empty list marked 1 and 2](request.assets/annotated.png)

1. The count shows 3 failures.
2. The list for the same conditions is empty.

[Original capture](request.assets/original.png). The actual development screen was captured; only numbers and borders were added to the annotated copy.

## Evidence notes

[^failed-screen]: Observed environment, build and time; screen entry and reproduction steps; original and annotated paths. This capture establishes the screen state; the server cause remains unconfirmed.
```

Replace the example's observations and conditions with actual evidence. Regenerate numbering/TOC with `document-template.mjs --format <document.md>` after editing. Ensure notes are last and attachment paths resolve from the saved document. Keep the original, region JSON and relevant reproduction metadata available for review. A document version should identify which capture it cites.

## GIF only for a temporal question

Use a still PNG for a wrong value, alignment or empty state. Use a short recording only when click order, flicker, waiting or state transitions explain the issue. Select the method above: direct GIF recording can avoid a separate video conversion for an explanatory sequence. Otherwise reuse the project's recording helper or Playwright's video recording if available, extract the useful segment and convert to GIF only when an installed conversion tool and the receiving viewer support it. Retain a decisive still and the untouched source recording (the original GIF for direct GIF capture, or the original video when converting). Do not require an additional video merely because the tool exports GIF; obtain time-preserving evidence when the claim needs it. Do not install a new recording stack just to satisfy an attachment slot.

State trimming, skipped waits or changed playback speed. A sequence of stills is a step illustration, not continuous recording or timing evidence. GIF has no audio. Long interactions belong in video with selected stills; PDF uses static frames. If recording or GIF conversion is unavailable, attach usable video/stills or record what remains uncollected. GIF is not a default completion requirement.

## Access or capture unavailable

Record the missing URL, session, data or environment, who can provide or collect it, and what remains unverified. Continue writing the factual parts. A person can supply an actual capture for annotation when automation cannot reach the screen. Never substitute a generated mockup or the bundled fictional examples for runtime evidence. No captured image establishes human review or proves a backend cause by itself.
