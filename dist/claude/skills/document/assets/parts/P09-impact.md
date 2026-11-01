# P09 Impact and migration

- Requirement: Required for additions/changes and removal/migration. Also required for other types if consumer migration, existing data changes or removal are affected
- Placement: The relevant discussion in the body
- Narrative role: Explains how the change affects other consumers and migration.
- Author: Change owners on both sides
- Reviewer: Each affected consumer and provider owner. The relevant operations owner if deployment or data changes are involved
- Check: Has global removal been decided based only on one’s own consumer? Are migration, removal and recovery conditions recorded, along with actual acceptance of responsibility?

<!-- body:start -->
## Change impact and rollout

This request has [impact] on [usage scenarios, screens or other consumers]. If behavior or data is already in use, check [actually relevant conditions such as direct entry, refresh, permissions, old versions or other clients]. For a new feature, describe [provider and consumer work to prepare together].

We intend to proceed in [prerequisite, deployment and consumer migration order]. If order does not matter, state [the reason for that assessment]. Do not create a removal plan if no existing behavior is being removed.

If removal, migration or reprocessing of existing data actually occurs, confirm [target selection, usage paths without replacements, evidence of discontinued use, recovery and stop conditions, and owners]. Leave unknown impacts as [questions to confirm and owners].
<!-- body:end -->
