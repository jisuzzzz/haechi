# Resume verification after same-turn Codex compaction

This live scenario checks that a running Codex turn can edit a fixture, compact automatically, recover the installed Haechi workflow rules, run the tests, and review the final patch before it replies.

| Start | Exercise | Inspect |
| --- | --- | --- |
| Run the command below from the Haechi checkout | Fix the zero-count badge in a fresh temporary Git repository, load synthetic context after the edit, then verify the change in the same turn | Installed hook identities, turn and command events, test output, the reviewed diff, and the final review |

## Run the scenario

Use Node.js 24, Git, and a signed-in Codex CLI with Haechi installed. The plugin's SessionStart and PostCompact hooks must be enabled and trusted in Codex. The runner starts its own app-server process and one ephemeral workspace-write thread with approval disabled. It sends one user request. Thread settings apply only to that run. The runner removes the fixture when it finishes.

The first command uses the configured Codex model. The second uses the model and effort from the verified run.

    node evals/codex-compaction-replay.mjs
    node evals/codex-compaction-replay.mjs --model gpt-6-astra --effort high

The command prints a fresh evidence directory under the Git-ignored `evals/codex-compaction-runs/`. Set `--output DIRECTORY` to retain evidence elsewhere or `HAECHI_CODEX_BIN` to select the Codex executable. Use `--help` for the available flags.

To include the packaged completion command in the same turn, add `--complete`.

    node evals/codex-compaction-replay.mjs --complete --model gpt-6-astra --effort high

This mode copies the packaged Codex completion tool into the isolated workspace. After compaction the agent must run the four fixture tests through `complete verify`, inspect the final diff, record a passing review, and invoke `complete` before the final response. The runner checks that all results match the independently captured final diff and retains the tool hashes and command outputs.

The default thread threshold is 32,000 tokens. A synthetic fixture command supplies the context after the source edit without calling the manual compaction API. If the edit and tests happen without a compaction between them, the run fails. A different model or local tool configuration can change when the threshold is reached. Use a fresh run and `--compact-limit TOKENS` when investigating that boundary. Keep the previous run when comparing thresholds.

## Read the evidence

- `scenario.json` records the prompt, thread settings, initial file hashes, and runner hash before the turn. `baseline.tap` shows the zero-count assertion failing and the three existing behavior checks passing.
- `events.jsonl` records selected app-server notifications in order. Inspect the native thread and turn IDs, edited source at the context command, completed compaction, trusted PostCompact and SessionStart hooks, passing test output, actual `git diff` output, and final agent review.
- `final.diff` captures the patch independently after Codex finishes. Its content must match the patch shown by the agent's diff command. The tested source and unchanged test fixture are checked against the final file hashes.
- `result.json` contains the machine verdict and the sequence number supporting each step. The runner exits nonzero if a required check is missing or fails. On runtime errors, inspect the partial events and `server.stderr` if present.

The automated verdict checks the event sequence, four executed and passing tests, the exact patch, and the presence of a review that addresses numeric strings. Read the review text against the diff to assess its reasoning. Each verdict applies to that run's installed plugin, CLI, model, and fixture. The host delivers SessionStart context to the immediate continuation after automatic compaction. [Codex app-server protocol](https://learn.chatgpt.com/docs/app-server) · [SessionStart recovery](https://learn.chatgpt.com/docs/hooks#sessionstart)

The local grader tests run without starting Codex.

    node --test test/codex-compaction-replay.test.mjs
