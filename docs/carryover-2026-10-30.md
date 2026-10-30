# Carryover notes, 2026-10-30

Source: the user-supplied Claude handoff, `haechi-carryover.md`, dated 2026-10-30. It records decisions from conversations on 2026-10-29 and 2026-10-30 that were missing from the design document. Historical reports below are attributed to that handoff; they are not new runtime verification.

The [design document](design.md) now includes the compatible intent behind spec, preview and explanatory writing. This file keeps conflicting older decisions, operational observations and remaining work separate from the current workflow.

## Older decisions that conflict with the current workflow

| Topic | Handoff decision | Current rule |
|---|---|---|
| Spec before implementation | Discuss the task with the main session, then save a spec before proceeding. The spec step was introduced to reuse this process across tasks. | The [spec skill](../skills/spec/SKILL.md) resolves consequential open decisions or writes an explicitly requested spec. Settled requirements can stay in chat. |
| A/B/C response formats | Always use the same presentation through `formats/*.md`: A compares options, trade-offs, the fastest approach and a more fundamental solution; B explains the problem, cause, remedy and expected effect; C uses a relatable scenario, especially when explaining a behavior change. | [Writing and design judgment](design.md#writing-and-design-judgment) chooses prose, lists or tables to suit the content. There is no separate response-layout setting or template system. |
| Prose in code blocks | On 2026-10-29, keep A/B/C responses out of code blocks. Fixed line breaks caused long lines to overflow, and English labels interrupted Korean prose. The user wanted to retain the formats themselves. | Preserve the readability rationale as history. It does not restore the old formats or introduce a new mandatory response layout. |

## Operational observations

These installation observations came from the handoff and were not rechecked against live Claude Code or Codex installations during this documentation update.

- **Release versions:** the handoff reports that `plugin.json` must get a new version for `claude plugin update` and `codex plugin marketplace upgrade` to pick up a release. The current build reads this metadata to generate both distributions.
- **Codex hook approval:** the handoff reports that version or installation-path changes require approval again in `/hooks`. It observed `trusted_content_hash` changing while `trusted_hash` stayed the same in the Codex config. The checker limitation is tracked below.
- **Claude reload:** the handoff reports that `claude plugin update` needs a restart or `/reload-plugins` before the changes take effect.
- **Temporary installations:** remove a local installation created only for verification after the check. The handoff reports that leaving it installed injected haechi context into other sessions too.
- **Private-word scan:** [CI](../.github/workflows/ci.yml) supplies the `HAECHI_SCAN_PATTERNS` secret. Locally, set `HAECHI_SCAN_FILE` to a private pattern file and run `npm run scan`. The [scanner](../scripts/scan-public.mjs) reads only Git-tracked files; keep the pattern list outside the repository. These details were confirmed from the current source.

## Remaining work

| Item | Evidence as of 2026-10-30 | Next check or decision |
|---|---|---|
| Codex hook approval detection | The handoff reports a false "trusted" result after an upgrade. [`parseCodexTrust`](../tools/check-user.mjs) currently checks only for a `trusted_hash` assignment; it does not validate `trusted_content_hash` or the current installed hook content. Source inspection confirms that limitation, but this update did not reproduce the live upgrade scenario. | Reproduce approval before and after a plugin update or path change, establish the host's trust semantics, then add a regression test and fix the checker. |
| Preview in a real task | The handoff says the preview skill had not been used for an actual design task. The scaffold and instructions exist, but no browser or real-task validation was performed in this update. | Use the skill for a requested preview; check each variant, state and interaction in a browser and record whether the workflow helps the user choose. |
| Commit author identity | The handoff reports two author identities across versions 0.0.4–0.0.10. No preferred identity was established in this update. | Decide which identity future commits should use. |

### Historical Windows test failure

The handoff reports that the single-quoted path case in `test/verify-default.test.mjs` failed on Windows from 0.0.10, while Ubuntu CI passed. It suspected Windows shell quoting; that cause was not established by the handoff.

The current [test](../test/verify-default.test.mjs) already tests only double-quoted custom paths on Windows. It includes single-quoted paths on other platforms and skips the explicit `sh` wrapper cases on Windows. This differs from the reported failing version, so the old report should not be treated as a currently reproduced failure.

On 2026-10-30, `node --test test/verify-default.test.mjs` on Windows passed 20 tests, failed none and skipped 2. The first sandboxed run failed while creating temporary Git repositories because `.git/config` was not writable; rerunning with the required filesystem access passed. This establishes the current test result, not support for single-quoted shell paths on Windows. Whether that quoting should be supported remains an open compatibility decision.
