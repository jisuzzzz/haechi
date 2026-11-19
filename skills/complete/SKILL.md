---
name: complete
description: Check whether an implementation has passing review and verification for its current Git diff. Use when closing an authorized product implementation with Haechi or when the user asks for the common completion check.
---

# Complete an implementation

Apply the [common work contract](../../principles/work-contract.md). The completion command checks saved review and verification results against the current Git change. Verify the implementation's required behavior and resolve findings that block completion.

Use `node <tools>/complete.mjs` from the product Git checkout. The tools folder is in the Haechi repo facts when available, or two levels above this skill's folder. No project setup is required. At a completion request, run the check first and use its result. Resolve the held condition before you report completion.

1. **Start review on the first working diff.** Run `node <tools>/complete.mjs snapshot --patch` just before applying [Review-diff](../review-diff/SKILL.md). Use the returned base, diff identity and patch. If a staged version differs from the working version, review the returned staged patch as well.
2. **Record the result of the actual review.** Run `node <tools>/complete.mjs record <diff> pass "<review result and evidence>"` when the review supports a pass. Use `changes-required` if findings still block completion. Compare the identity against the snapshot from before review. If it has changed, review the affected changes and record against the current snapshot. Record the result as part of the authorized implementation workflow. A read-only review can hand the snapshot and findings back to the implementer.
3. **Run verification for the final diff.** Use `node <tools>/complete.mjs verify -- <repository verification command and args>` with the existing command that covers the required checks. For example, use `verify --require-tests -- node --test --test-reporter=tap test/example.test.mjs` when a test run must produce executed-test evidence. The wrapper runs the command and records its result only for an unchanged diff. It holds on recognized incomplete test output, including zero tests and skipped assertions. For a set of required commands, use the repository's combined verifier or an explicit shell invocation that fails when any check fails. The latest attempt represents this scope. Assess behavior coverage and any required evidence beyond the command output.
4. **Check at implementation completion.** Run `node <tools>/complete.mjs`. A passing review and passing verification must both match the current diff. Resolve held results for missing or stale evidence, outstanding findings, incomplete or failed verification, or a checkout that could not be captured. Matching results remain available after compaction or in a later session.

By default, the command compares against the merge base of the repository's detected default branch and includes Git-visible staged, unstaged and untracked changes. If no default branch is found it uses HEAD. For a different comparison scope, pass the same `--base <ref>` on snapshot, record, verification and completion. When committing directly on a local default branch without a remote baseline, pass the pre-change commit to keep that review scope after the commit.

Review and verification results live under the worktree's Git metadata. Review findings and actual verification evidence establish what was checked. Use the result in the existing handoff and work-graph record when applicable.
