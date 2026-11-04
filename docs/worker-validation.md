# Playbook contracts and the generic worker

Version 0.0.16 replaces seven role definitions with one `worker`. Playbooks select required skills, principles, context, ownership and completion evidence. The main session can still perform small tasks directly. Independent reviews use separate executions; one definition does not mean one shared execution context.

## What ships

- Reusable implementation, review, adversarial-test, screen and experiment procedures live in skills.
- `delegate-task.mjs describe` returns a compact task input form. `assemble` saves the full worker packet and returns its inventory and references. Rendering checks the current sources before delivery.
- `delegate-return.mjs` binds observed command records and target versions to a task. Optional `publish` validates and stores proof, updates an existing work-graph task and returns a compact decision view in one host call.
- Source/session mismatches, missing records, invalid ownership inputs and stale graph versions fail rather than silently dropping evidence. The main still decides whether behavior meets requirements. Graph publication never automatically completes work.

Required procedure bodies remain in the rendered worker packet. Optional references and additional skills are selected when useful. No model, effort or tool list is fixed in the worker definition.

## Upgrade and host limits

Configurations that invoke retired haechi-owned roles need to select `worker` and the relevant playbook step instead. Repository-defined roles such as `implementer`, `tester` or `verifier` may remain when repository rules require them: use the same delegate packet procedure and deliver the complete selected guidance while preserving their role, scope and host-enforced permissions. A custom role is not a reason to replace the packet with a hand-written summary.

The helpers do not spawn agents, register Codex agent types or authenticate provider records. The host must supply actual identity and execution records and enforce permissions. Where native registration is unavailable, use a generic host agent with the worker instructions and rendered packet. A string-only dispatch interface may still require the main to carry the full message. Read-only instructions alone are not permission isolation.

## Validation and measured limits

The release retains self-contained product regression tests for packet assembly, complete principle delivery, stale/missing proof rejection, graph version conflicts and pending-main-review state. Both generated distributions are checked against source.

Six fresh CLI tasks compared the local draft immediately before graph integration with the candidate: implementation, review and audit once per side. All chose direct main execution, and the independent evaluator passed all 36 frozen criteria. Total workload tokens were 303,830 versus 300,601; episode time was 151.444 versus 158.631 seconds. The new graph publication path was not used, so these differences do not establish its performance effect. Cache was uncontrolled and each task had one trial. Native plugin lifecycle and Claude execution were not measured.

Earlier v0.0.15 measurements forced delegation. Comparing their completed review/audit runs with these direct runs describes different execution strategies, not a controlled release speedup. No token, latency or quality superiority is claimed by this release.

Local historical evidence remains in ignored `evals/` archives. The final autonomous-choice archive is `graph-return-20261102-v1`, plan SHA-256 `c7ef096b9bd53208ebaa75016ec07638370de360fd073eac7bcc251919d519c4`, evidence-manifest SHA-256 `a9302f212d36bccae135c15c491b102a7a164bae2f1a3c04719ab8c4f80819f1`. One-off runners, adapter tests and duplicate reports were moved to `workflow-refactor-development-20261102` with a file manifest. Raw records and frozen snapshots were preserved; they are not shipped as plugin assets.

The archive is required to inspect historical model traces. Public tests reproduce mechanical behavior without model calls; they do not rerun the historical evaluation.
