# P17 Asynchronous processing and state

- Requirement: Required when newly defining or changing acceptance, completion, failure, retry, cancellation or notification behavior
- Placement: The relevant discussion in the body
- Narrative role: Explains actors, states, and the sequence of failure and recovery.
- Author: Owner of each step
- Reviewer: Each step’s owning team confirms its processing and signals; the consuming team confirms user-visible states and recovery flow
- Check: Are successful HTTP responses separated from processing completion? Are ID granularity, retry responsibility, idempotency and missed events on reconnection apparent?

<!-- body:start -->
## Processing flow and failure behavior

When [first actor] sends [input and identifier granularity], we want [next actor] to return [acceptance state]. For an implementation handoff, describe the behavior actually provided. Distinguish whether that response means acceptance or final completion, and describe the work that [steps and owning teams] perform next.

During processing, check status through [what is queried or notified, using which ID]. [Completion, partial success and failure] each mean [user-visible meaning]. IDs here are values linking actual APIs or processing targets.

[Actor, conditions and limits] govern retries, and the same ID means [idempotency, duplication and validity period]. Cancellation, reconnection, missed signals and out-of-order signals require [recovery and reconciliation]. Confirm [undecided transitions, timing or policy] with [owner].
<!-- body:end -->
