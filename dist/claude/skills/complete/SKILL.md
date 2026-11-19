---
name: complete
description: Check whether an implementation has a passing review for its current Git diff. Use when closing an authorized product implementation with Haechi or when the user asks for the common completion check.
---

# Complete an implementation

Apply the [common work contract](../../principles/work-contract.md). The completion command checks the saved review and the current Git change. Verify the implementation's required behavior and resolve findings that block completion.

Use `node <tools>/complete.mjs` from the product Git checkout. The tools folder is in the Haechi repo facts when available, or two levels above this skill's folder. No project setup is required. At a completion request, run the check first and use its result. A held result needs a current review or a checkout that can be captured before you report completion.

1. **Start review on the first working diff.** Run `node <tools>/complete.mjs snapshot --patch` just before applying [Review-diff](../review-diff/SKILL.md). Use the returned base, diff identity and patch. If a staged version differs from the working version, review the returned staged patch as well.
2. **Record the result of the actual review.** Run `node <tools>/complete.mjs record <diff> pass "<review result and evidence>"` when the review supports a pass. Use `changes-required` if findings still block completion. Compare the identity against the snapshot from before review. If it has changed, review the affected changes and record against the current snapshot. Record the result as part of the authorized implementation workflow. A read-only review can hand the snapshot and findings back to the implementer.
3. **Check at implementation completion.** Run `node <tools>/complete.mjs`. Continue completion only when the command exits zero and the required behavior checks also pass. A held result identifies missing or stale evidence, outstanding findings, or a checkout that could not be captured. Reuse a matching pass after compaction or in a later session.

By default, the command compares against the merge base of the repository's detected default branch and includes Git-visible staged, unstaged and untracked changes. If no default branch is found it uses HEAD. For a different comparison scope, pass the same `--base <ref>` on snapshot, record and completion. When committing directly on a local default branch without a remote baseline, pass the pre-change commit to keep that review scope after the commit.

The review result lives under the worktree's Git metadata. The command checks its match and verdict. Review findings and behavior evidence establish what was checked. Use the result in the existing handoff and work-graph record when applicable.
