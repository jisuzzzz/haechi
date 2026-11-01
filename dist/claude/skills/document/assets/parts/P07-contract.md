# P07 External behavior contract

- Requirement: Required for additions/changes, removal/migration and implementation handoffs. Required for bugs and performance work if external behavior changes
- Placement: The relevant discussion in the body
- Narrative role: Explains the external behavior that addresses the problem.
- Author: Proposing side and provider
- Reviewer: The provider checks guarantees and meaning; the consumer checks actual dependencies. The relevant decision owner handles policy judgments only
- Check: Are required results separated from internal implementation? Are null, permission, aggregation and exception semantics sufficiently explained?

<!-- body:start -->
## Required external behavior

The required result is [what the consumer or user should obtain]. For [input or situation], we want [behavior or response]. This describes [a newly proposed requirement, behavior to confirm, or implementation being handed off].

- **Input and output:** [Meaning and types of targets, paths, fields and events; differences between required, omitted, null and empty values].
- **Order and scope:** [Where needed, units and reference times for sorting, ties, filters, pages and aggregation].
- **Exceptions and permissions:** [Where needed, allow, deny, error, partial success, time, unit and expiration conditions].

[Include a small request/response example needed for judgment. Explain changing semantics and conditions to preserve only when changing existing behavior. Do not create comparison items when there is no existing feature or prior agreement.]

[Undecided conditions] will be settled after an answer from [the area to confirm them]. The team providing the result decides internal functions and storage methods.
<!-- body:end -->
