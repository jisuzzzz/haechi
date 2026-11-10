# Work graph commands

For example, task `formats` waits for a template contract, then records which template version it used. Another session can read both tasks and the template without the original conversation.

Run `node ${CLAUDE_PLUGIN_ROOT}/tools/work-graph.mjs COMMAND [ID]` from the repository, or append `--cwd /absolute/worktree`. Output is JSON. Writes read one JSON object from stdin. Use a quoted heredoc or a file; do not interpolate task text into shell code.

## Read

- `list`: unfinished work, default 20 tasks per page. Confirmation candidates come first, then active, waiting and planned work; ties use recent updates and task ID.
- `list --view archived`: completed and cancelled work, automatically classified by status.
- `list --view all`: both unfinished and archived work. Use this when checking for an existing matching task.
- Add `--limit N` (1–100) and `--offset N` to any list view. Follow the returned `nextOffset` until it is null, repeating the same view and `--as-of` timestamp returned as `asOf` on the first page. This freezes the seven-day comparison while paging. If the graph `version` changes between pages, restart from offset 0 without `--as-of` because records may have changed.
- `sessions ID`: durable provider session references only. Follow [native coordination](sessions.md) for reports and authorized messages.
- `show ID`: full task details and connections, including archived tasks.
- `affected ID`: direct and indirect consumers, including archived ones. These are review candidates, not automatically failed tasks.
- `check`: read-only local reference readability and captured evidence integrity check across all tasks, including archived work. Returns `ok`, `checkedLocalReferences` and `issues` with task ID, field, original path and error code. CLI exits 1 for issues, 0 when none are found, and 2 for invalid input or store errors. HTTP and provider references still need source checks.
- `requests`: list saved create/update requests by ID, scope, original graph version and state. Use it to locate an interrupted request.
- `--help`: command and field reference.

An absent store reads as an empty graph at version 0 without creating files. Errors reading an existing store are errors, not an empty graph. Commands do not create Git repositories.

List output is a view, not a store export: it includes `view`, `matchingTasks`, page fields and whole-store counts (`totalTasks`, `openTasks`, `archivedTasks`, `attentionTasks`). Its `edges` include connections touching any task on the page; other endpoints may require `show ID`. Lists contain compact identity/state/owner/session-link summaries; use `show` for goals, acceptance and evidence. Read tasks have derived `archived` and `needsAttention` flags; do not send those flags back as mutable task fields.

Completed/cancelled work is archived immediately, including records created by older versions. Returning its status to `planned`, `active` or `waiting` brings it back to the default list; evidence and links remain. No migration, timer, record deletion or extra archive command is needed. An unfinished record last updated at least seven days ago has `needsAttention: true`; this requests confirmation, never a status change, ownership release or takeover. Reads do not change timestamps or graph version. A meaningful record update refreshes the timestamp normally.

## Write

`create`, `update` and `claim` accept an optional `session: { provider, sessionId, hostId? }` from the current hook snapshot. Include it on ordinary writes to new or existing tasks. It is stored as a durable link in the same transaction, not as a task field; conflicts or invalid evidence preserve both the prior task and its links. The packaged Codex CLI defaults to its native `CODEX_THREAD_ID` when omitted. Claude package tools and unmarked source tools never infer Codex identity from inherited environment variables; supply the hook identity explicitly. Read the returned `sessionConnection`: `connected` or `unavailable`. When unavailable, resolve native identity before declaring the linking work done. No global “latest session” file is used.

Every write needs `expectedVersion`, the current graph version from a read. Successful writes advance the version. Concurrent or outdated writes fail without replacing newer records. The version belongs to the whole graph, so an unrelated update can also require rereading.

```sh
node ${CLAUDE_PLUGIN_ROOT}/tools/work-graph.mjs create <<'JSON'
{"expectedVersion":0,"id":"templates","title":"Shared template contract","goal":"Define the common document fields","acceptance":["Contract names every required field"],"next":"Inspect existing document templates"}
JSON
```

Replace the example version with the actual current version in subsequent writes.

| Command | JSON fields besides `expectedVersion` |
| --- | --- |
| `create` | Optional `id`; required `title`, `goal`, `acceptance` (nonempty array of strings); optional fields listed below |
| `update ID` | Only the fields being changed; fields are replaced, not appended |
| `connect ID` | `provider` (`codex` or `claude`), actual `sessionId`, optional provider `hostId`; adds a durable link, preserved after release |
| `claim ID` | `sessionId`, optional `host`; captures current worktree and branch |
| `release ID` | `sessionId` matching the recorded owner; use after an agreed handoff |
| `link ID` | `to` (prerequisite task ID), `type` (`depends_on` or `uses`), `reason`; `uses` also requires `version` of the consumed result |
| `unlink ID` | `to`, `type` |

Task fields for create/update:

- `title`, `goal`, `acceptance`: the requested outcome and its conditions.
- `status`: `planned`, `active`, `waiting`, `completed`, or `cancelled`. Waiting or cancelled work needs a `reason`.
- `reason`: why work is waiting, cancelled or otherwise incomplete.
- `decisions`: optional binding decisions only, not a progress log. `next`: optional next useful action or handoff note. Empty optional fields are omitted from new records.
- An `update` with `status: "completed"` or `"cancelled"` clears an inherited `next`. Include `next` explicitly only for a useful new handoff. `next: ""` removes the field, including on an existing completed task; unrelated updates preserve explicit handoffs.
- `artifacts`: array of `{ "path": "/absolute/path/to/result", "revision": "commit or content digest" }`. Use absolute paths for local files so another worktree can find them.
- `evidence`: prefer compact entries `{ "criterion": "exact acceptance condition", "observed": "short actual result", "revision": "tested commit or digest", "artifact": "resolvable proof file or provider/host/session/turn reference" }`. The reference contains check details; inspect it before completion. Old inline entries remain supported as an array of `{ "criterion": "exact acceptance condition", "command": "actual check or interaction", "expected": "expected behavior", "observed": "observed behavior", "revision": "verified commit or content digest", "artifact": "/absolute/path/to/check-output" }`. `artifact` is required for compact entries; it is optional only when both `command` and `expected` are supplied inline. Completion requires an entry for every acceptance condition. The tool does not run checks or judge whether evidence establishes success.

Relations point from the consuming task to its prerequisite. Link targets must already exist. There is no mandatory stage order and no automatic session dispatch. `claim` refuses a different existing owner. The owner is an advisory coordination record; this local CLI is not an authentication boundary.

Create, explicit artifact/evidence updates and completion reject unreadable absolute local paths and `file:` URLs without saving any partial mutation or session link. Other URI/provider references are preserved without network validation. Existing records remain readable when a file disappears later; use `check` to locate and repair it. Before removing a worktree, preserve every referenced result outside it, verify its original revision or byte hash and update affected paths, including archived tasks. Run `check` before and after cleanup; never erase evidence entries to suppress a failure.

## Recoverable writes and captured evidence

Supply a unique `requestId` with `create` or `update ID` to save the exact request before applying it. Use a verified `session` with `provider`, `hostId` and `sessionId`. Use the same request ID and payload if delivery is uncertain. A repeated successful request returns its original result, including its original version. Read again before making a new decision. Reusing an ID with a different payload or scope fails.

If the original command was interrupted, run `recover REQUEST_ID` and pass `{"session":{...}}` on stdin with the original verified session identity. The tool either returns the saved result or applies the pending request against its original `expectedVersion`. If another write changed the graph, including a cancellation, inspect the latest task and decide whether to submit a new request with a new ID. Requests and results remain available for inspection. Reads and hooks never replay them.

For local evidence, first review the source and obtain its SHA-256. Run `snapshot` with `{"path":"/absolute/path/to/verified-output","sha256":"<64 lowercase hex digits>"}` on stdin. The tool checks the reviewed digest, saves a copy of the file (up to 8 MiB) in the Git common directory and returns its `artifact` path. Use that path in `evidence[].artifact`. Recoverable writes that add local evidence or mark work completed require captured local evidence. Inline and provider evidence remain available. `check` reports a changed copy as `HASH_MISMATCH` and a missing copy as `ENOENT`. It checks ordinary local references for readability. The agent still judges what the evidence proves.

## Storage and recovery

The file lives at `<absolute git-common-dir>/haechi/work-graph.json`. Linked worktrees share it. Independent clones and remote machines do not. Graph records are not source-controlled and are not a substitute for saving or committing artifacts. Some hosts protect the Git directory; a write may need normal filesystem permission for this store.

Schema 1 records are read without rewriting. The next successful mutation upgrades the store to schema 2, preserving existing fields, evidence and relations. Older plugin tools cannot read schema 2: use the current installed tool. No source session is inferred from a legacy ownership token. Archiving is a read-view separation, not disk compaction. All evidence and relations remain in that file; the existing 8 MiB store limit still applies. Default lists and hook summaries avoid presenting all historical work, but storage is not automatically pruned.

Writers use an exclusive lock and atomic file replacement. A busy lock fails instead of waiting indefinitely. A crashed writer can leave a lock. First establish that the writer has stopped, then remove only that lock. If the writer was applying a saved request, recover that request before any other write. A graph replacement may already have happened, and recovery can identify it from the saved checkpoint. Otherwise reread the graph before retrying. Do not replace an unreadable graph with a new empty one.

Session hooks show at most eight unfinished tasks, prioritizing the current session's work, then confirmation candidates and active work. They report archive and attention counts even when those records are not shown. `hasMore` means more unfinished records exist. Start CLI listing at offset 0 because the session summary uses a different order. Hooks only read; they neither register tasks nor take ownership. If a hook reports unavailable data, use the CLI to diagnose it; do not assume there is no work.

When local references are unreadable, hooks also include `referenceIssueCount` and up to eight `referenceTaskIds`, including archived work. Paths and field-level errors stay in `check` rather than expanding every prompt summary. The warning is current filesystem availability, not a change to task status or proof that the result was never verified.
