# Browser preview before implementation — 2026-11-04

The candidate passed 4/4 fresh verification trials with an actor-controlled real browser. This verifies only the listed tasks and conditions, not installed desktop plugin delivery or a comparative reliability gain. No active guidance was changed.

## Required behavior and frozen conditions

The user's request was to verify the previously unverified browser check before implementation. Two synthetic UI requests (row rename menu and help tooltip) were each executed twice in fresh conversations. Neither request names preview. Required outcomes were frozen before dispatch: implicit preview selection; real screenshot-producing render; every requested connected interaction and visible result checked in the throwaway preview before product edits; unchanged product during those checks; completed implementation within scope; truthful reporting and preserved artifacts.

- Candidate: `git:b52c1d08cb6db1f6dd6e6e0eaf1232fee4a8e9bd`.
- Final verification plan SHA-256: `926df66cd83bb030bbc0ee1e0e152b9358635c533f136e77c683e9fa566c8054`.
- Archive: `/Users/zsu/haechi/evals/preview-browser-20261104` (ignored; raw traces, sessions, screenshots, browser observations, file history and judgments).
- Evidence inventory: `evidence-manifest.json`, SHA-256 `bad901fdd09b5a2e0e7a7237ca34dd95097730f5d8fcbb10ee90ab9a1218c924`.
- Codex CLI 0.153.4, observed default `gpt-6-astra`, high effort, fresh home/conversation per trial, workspace-write shell sandbox, approval_policy never, 600-second trial budget, at most two concurrent actors.

The browser is a fixed local-only MCP service using real Playwright Chromium. It accepts file open, screenshot/DOM snapshot and CSS-based hover/click/fill/focus/key actions. External requests and files outside the assigned trial are blocked; actors cannot submit arbitrary JavaScript or shell code to this service. Each action returns the rendered screenshot and visible DOM. This one tool is explicitly approved in temporary trial configuration; shell approvals remain disabled. Host settings were not changed. The per-tool configuration follows the [official MCP documentation](https://learn.chatgpt.com/docs/extend/mcp).

Unlike the preceding evaluation's later host replay, these browser actions were selected and inspected by the implementing actor during execution. The service records UTC time, screenshot, observed DOM and current product hash. A separate observer records product hash transitions every 20ms. Original session tool inputs/outputs provide an additional source for edit order and added-file inspection. Audit counts alone are not behavioral judgments.

## Results

| Run | Case | Independent result | Preview browser actions before edit | Last preview check UTC | First observed product edit UTC |
| --- | --- | --- | --- | --- | --- |
| P1 | ui-row | pass | 10 | 2026-11-04T14:38:52.977Z | 2026-11-04T14:39:28.359959+00:00 |
| P2 | ui-tooltip | pass | 7 | 2026-11-04T14:38:47.558Z | 2026-11-04T14:39:40.317908+00:00 |
| P3 | ui-row | pass | 10 | 2026-11-04T14:42:02.229Z | 2026-11-04T14:43:08.618396+00:00 |
| P4 | ui-tooltip | pass | 9 | 2026-11-04T14:42:58.741Z | 2026-11-04T14:43:51.734461+00:00 |

For rows, evidence must show hover, pointer transfer into the menu, rename, input, save with the renamed row visible and Escape dismissal. For tooltips, it must show hover, pointer transfer, focus opening and Escape dismissal. Opened pages or assertions in final messages alone do not pass. The independent evaluator inspected the actual action sequence, visible results, screenshots, source edit records and final artifacts; the main session reconciled the per-criterion findings with the requested outcomes. See `judgment.json`, `results.json`, `runs/P1` through `runs/P4/audit.json` and `browser.jsonl`.

## Preparatory failure and limits

The first attempted dispatch lacked a per-tool MCP approval entry. Two actors hit `MCP tool call requires approval, but approval policy is never` before browser execution. They were interrupted and preserved under `approval-blocked-attempt/`, including the original plan and traces; the other two trials had not started. They are not counted as passing trials. After adding approval only for the reviewed local-browser tool in temporary homes, a new plan was frozen and four fresh trials were run. Task wording, candidate and behavior criteria were unchanged. This is an environment repair, not a tuned instruction comparison.

The snapshot's 121 file hashes and final plan hash were rechecked. Product hash sampling can miss extremely brief writes; browser-time hashes and original tool timestamps provide corroboration. Cross-trial reading is prohibited by instructions, not an OS read boundary. The browser service runs outside the shell sandbox; its code and path/network constraints define that capability's boundary. These are plain HTML fixtures with synthetic data and no backend or login. There is no claim for all UI stacks, installed plugin hooks or browser tools not available in this environment. This candidate-only verification does not prove improvement over baseline.

Independent evaluator limits: Candidate-only verification; no files were modified, replacement browser tests run, or external services contacted. Row and tooltip interaction lists were applied to their respective original tasks. Every recorded browser action was traced: A 44, B 25, C 25, D 40. Trace tool arguments, returned DOM observations and screenshot bytes match browser.jsonl; audit details were cross-checked rather than accepted as verdicts. Retained observation comparisons normalize archived path aliases and escaped newlines. Product history samples index.html only, so additional-file timing was checked against source command inputs/outputs and final file inventories. Passes cover the recorded interactions and inspected artifacts, not untested browsers, devices or comparative improvement.

The earlier report's browser-order limitation remains a historical statement of its conditions; this follow-up supplies new evidence under the narrower browser capability described here. The default browser tool approval failure also demonstrates that instruction wording alone cannot make an unavailable or unapproved browser execute.
