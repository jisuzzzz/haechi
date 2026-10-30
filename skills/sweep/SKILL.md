---
name: sweep
description: Coordinates independent units of work when separate context or parallel execution helps, with findings for read-only reviews and commits for completed changes. Use for /haechi:sweep when a task benefits from splitting into independent units.
---

# Sweep

The main session runs this, because agents cannot ask the user, start other agents or commit. The calling playbook decides what one unit's work is and in what order units go; this procedure handles the rest. Delegation and DONE rules are in the session rules.

## Steps

1. **Choose units and mode.** Delegate units when independence or separate context offers a clear benefit; keep tightly coupled work together. Editing units must not write the same files concurrently. Read-only units may inspect shared context but should have distinct review questions. Example for test hardening: `src/utils/formatDate.ts` plus `test/utils/formatDate.test.ts` is one unit.
2. **Order.** Use the priority the calling playbook gives — risky places first.
3. **Preview material cost.** Estimate effort when it affects the user's decision. For test hardening, use mutants per file and test run time. Ask before substantial extra work outside existing authorization; do not repeat an accepted cost decision.
4. **Run.** Parallelize independent units when useful within the available resources. Keep dependent work sequential. Review each unit as it finishes.
5. **Record each unit.** Editing mode: one local commit per completed, reviewed unit, using the repo's convention and any relevant metric. Read-only mode: return findings and evidence in the conversation; make no edits or commits.
6. **Resume.** Reuse completed findings and checks from the conversation. For editing work, also read `git log` for completed units. Do not create a progress file unless the task needs one.

## Report

The calling playbook's report, plus units completed, units left and why. Compare actual effort with a cost preview when one was useful; no fixed report format is required.
