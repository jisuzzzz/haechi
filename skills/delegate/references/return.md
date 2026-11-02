# Returning observed evidence

The host/orchestrator retains actual tool records before returning a worker result.
It supplies the helper's request; never accept a worker-created proof manifest as
authenticated execution. Hashes detect stale or changed bytes, not forged inputs.
This protocol does not run verification commands, grant permissions, spawn workers or add hooks.

For an existing shared graph task, prefer the [single-call publication path](graph-return.md):
the host validates and saves proof, updates the task and returns a compact decision view.
Do not first print the full return and then ask the main to rewrite it for the graph.
The prepare/check path below remains available for standalone tasks and other hosts.

`node <plugin-root>/tools/delegate-return.mjs prepare <plugin-root> <host-request.json>`
emits a bounded JSON return. Save it in an already authorized host artifact location.
Before delivery, use `check <plugin-root> <host-request.json> <return.json>`.
Supply the checked return alongside the worker's report and diff to the same main
session. The host must recheck if files change before acceptance. Failed checks are
gaps: preserve the failure and require fresh evidence, never relabel it as a pass.

The host request contains:

- `packet`: the original prepared task packet, unchanged.
- `repositoryRoot`, `sessionId`, `taskId`: the actual repository and the original
  main-session/task identity. Retain these identifiers; do not mint a new identity
  to make a stale receipt appear valid. The packet hash binds objective, scope,
  constraints, completion criteria and selected source versions.
- `mainTrace`, `workerTrace`: `{path, format}` for persistent host-owned logs.
  `codex-jsonl` reads completed native tool items and requires a completed turn.
  Other hosts may use `tool-records-v1`: `{complete: true, records: [...]}` with
  records `{id, type: "command_execution", command, output, exitCode}` or
  `{id, type: "file_change", changes: [...]}`. Preserve original tool ordering,
  statuses and the association between commands and outputs. An adapter must
  record observed events, not infer execution from an agent's final answer.
- `targets`: `{path, before, after}` entries covering the assigned scope, relevant
  tests/config/input artifacts and any observed changes. Values are host-observed
  SHA-256 file hashes, or `null` for absence. Include uncommitted content; a Git
  commit alone is not the tested version. The caller verifies coverage; the helper
  cannot discover omitted targets or authenticate a dishonest adapter.

The return contains ordered command/exit/output excerpts, raw trace hash and item
references, observed target versions, and a receipt for complete guidance bodies
actually returned to the main before delegation. Excerpts are explicitly marked
when shortened. Open the referenced item if it is insufficient to check a required
outcome; do not treat an excerpt's omission as success. Before-change failures are
useful reproduction evidence, not proof of the final version. A command may change
files internally: use the trace and final hashes to establish which checks apply
to the final result; if that cannot be established, leave it unverified. Exit zero
with no tests remains zero executed assertions.

Guidance receipts are for this main task only. Paths/descriptions and partial reads
do not qualify. Matching file hashes permit reuse only while the previously read
bodies remain available in the same context. Compaction, task/ownership changes,
source changes or a different main session invalidate that assumption. Check the
current packet and source hashes without returning the bodies again. If a host
cannot establish these facts, read the affected guidance. Independent result
review and permission checks still apply.

Raw logs may contain sensitive output. Apply the host's existing access/redaction
policy before archiving and mark any redaction that limits verification. Keep raw
references retrievable to the recipient; missing access is a gap, not an invitation
to bypass permission checks.
