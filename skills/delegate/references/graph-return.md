# Publish a compact shared-task result

Use only for an existing work-graph task that spans sessions, has a dependency or produces a shared result. Short standalone work needs no graph stage. Record a meaningful return, blocker or handoff, not each tool call. This is an optional host adapter path, not a new agent or background observer.

## One call, one decision view

```sh
node <plugin-root>/tools/delegate-return.mjs publish <plugin-root> <host-request.json> <handoff.json> <new-evidence-directory>
```

The host supplies the existing [return request](return.md), using the graph task ID as `taskId` and the original main native session as `sessionId`. Raw logs must already be durable and accessible to the recipient. Choose an authorized new evidence directory outside worker ownership; existing directories are never overwritten.

The tool reads observed records, validates packet/source/target versions, saves `return.json`, checks and updates the existing graph, and prints only a compact coordinator view. It makes no model calls and does not print intermediate full records. The view includes the original goal and acceptance, reported criterion outcomes, relevant command/exit/output excerpts, every nonzero exit, excerpt warnings, missing evidence, the next action and the saved proof reference. Do not also send the complete bundle to the main. Open the referenced evidence only when this view or retained context cannot establish the required behavior.

The handoff contains:

```json
{
  "expectedVersion": 7,
  "session": {"provider": "codex", "sessionId": "actual-main-session-id"},
  "status": "active",
  "next": "Main reviews boundary behavior and ownership",
  "observations": [
    {
      "criterion": "Exact existing acceptance condition",
      "outcome": "passed",
      "observed": "The final boundary check executed five assertions and all passed.",
      "recordIds": ["actual-host-record-id"]
    }
  ]
}
```

Use the current graph version and verified provider identity, never the example values. `status` is `active` while awaiting main review or `waiting` with a concrete `reason` and next action. `outcome` is a reported `passed`, `failed`, `unverified` or `needs-decision`. Pass/failure reports require actual record IDs. A missing-proof report may have an empty list. Observations must match existing acceptance conditions; the tool does not redefine the goal or infer which command proves a criterion. Carry the worker's concise criterion results through the host and preserve their claim status; do not introduce a separate model call to rewrite logs into bookkeeping.

## Integrity and acceptance

Only affected criterion entries are replaced. Other evidence, decisions, artifacts, owners and dependency links remain. Repeated identical `record` requests do not advance the graph. No task is automatically created, reopened, released or marked complete. Graph evidence explicitly remains pending main review. A reported pass or a valid hash is not semantic proof; the main checks actual results and final versions before completing through the existing work-graph update path. Before-change failures remain visible and are not automatically final failures.

Unknown records/criteria, changed sources/targets, missing proof files, stale graph versions and invalid sessions fail. A graph publication failure retains the newly prepared proof and reports its location; there is no automatic retry. After inspecting/reconciling the current graph, reuse that proof with:

```sh
node <plugin-root>/tools/delegate-return.mjs record <plugin-root> <host-request.json> <return.json> <handoff.json>
```

Underlying graph writes retain their lock, version and permission checks. Storage is local to the repository/worktrees; this does not provide remote transport, shared uncommitted files, native dispatch or provider authentication. Existing legacy inline evidence remains in the graph; use `work-graph show ID` for its full command/expected-result fields. Files changing after publication require fresh checks. This interface reduces intermediate model-visible output by construction, but end-to-end token/time savings require measurement.
