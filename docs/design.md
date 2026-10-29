# haechi design

Status: v0 in progress. This document describes what the plugin does and why. It changes as decisions change.

## Goals

- One workflow for Claude Code and Codex users across frontend (TypeScript, React, React Native) and backend (Python, FastAPI, Django) repositories.
- Keep repository facts, authorization boundaries and completion evidence available. Load task guidance when it helps.
- Work is called done only with evidence.
- Keep shared rules focused on defects agents actually produce. Optional Django/FastAPI profiles add framework guidance; commands and environment choices remain repository settings.

## Layers

```
[0] setup     user setup (budget, notes folder, install check)
              repo setup (detect, ask what cannot be detected, prove commands run, write .haechi.json)
[1] hooks     first prompt and after compaction: guidance + repo facts; reminders otherwise
              Claude Code: a mod (function hooks). Codex: command hooks. Both call one core.
[2] main      the main session chooses the approach, delegates when useful, checks evidence and reports
[3] playbooks bug · feature · refactor · perf · review · test hardening, plus spec and sweep procedures
[4] agents    implementer · adversarial-tester · verifier · screen-design-checker · screen-parity-checker
              · experiment-runner · experiment-auditor
```

Beside them: `.haechi.json` (machine-read repo settings, committed), `AGENTS.md` (human judgment rules), `~/.haechi/user.json` (per-person settings and paths outside the repo).

## Request flow

1. The hook supplies repository commands, authorization boundaries and task guidance. Full rules appear at session start and after compaction; other prompts get a short reminder.
2. For substantial work, the agent briefly explains the outcome, scope and check method. It reuses decisions already made in the conversation. No fixed table, labels or verdict line are required.
3. The agent loads the playbook that helps the task and adapts its steps while preserving the required evidence.
4. It delegates independent work when parallelism, separate context or an independent review is useful. Parallel edits have separate file ownership, and shared contracts are settled before dependent work starts.
5. Completed changes need verification, diff review and a local commit. Read-only work produces findings and evidence without a commit. External actions require authorization; an explicit request can already provide it.

## Classification

- Local copy, style, constant and comment corrections with no behavior or contract change need only the repo verify command.
- Bug: behavior differs from a defined one. Feature: new or deliberately changed behavior. Refactor: same outside behavior, new structure. Perf: only when measurement or speed-up is asked for. Review: findings without edits. Test hardening: strengthen existing tests.
- Classification helps choose guidance. The agent can revise its approach as it learns, without asking merely to change a label. Changes to requested scope or verification still follow the authorization boundary.

## Delegation

- File and line counts describe scope; they do not trigger delegation or a reviewer.
- Work directly for short or tightly coupled tasks. Delegate independent work when it saves time or benefits from separate context. Each brief states the objective, relevant context, file ownership, constraints and expected evidence; the worker chooses its method.
- Use a verifier or adversarial tester when risk, uncertainty or shared contracts justify an independent check. Roles are capabilities, not mandatory stages.
- Check changed UI in a real render. A separate screen checker helps when there is a useful design or behavior comparison.

## Playbooks and documents

- Task playbooks are `bug`, `feature`, `refactor`, `perf`, `review` and `test-hardening`. Their procedures are guidance; repository permissions and required evidence remain constraints.
- `spec` helps resolve consequential behavior or scope decisions, or produce an explicitly requested spec. Accepted requirements and checkable outcomes can stay in chat. File counts, a new screen or an export change alone do not require a formal document or another approval.
- `sweep` coordinates many independent units when splitting helps. Change units get commits; read-only units return findings and use conversation evidence to resume.
- `render-doc.mjs` is available for a formal spec and formats requests to other teams. `screen-report.mjs` builds screen reports. These artifact schemas stay fixed for their tools; optional chat formats do not control them. `plain` improves lasting prose.
- Requests to other teams and screen reports live in the user's notes folder, never in the repository.

## Git

- `commit` works the same on every host. `mr` opens merge requests on GitLab (glab) and pull requests on GitHub (gh) from the repo's title and body conventions. `ci-watch` (GitLab only for now) waits for the pipeline in the background, fixes failures in the session that opened the merge request, stops after the same job fails twice, and never passes a gate by suppressing it.
- After a merge, `cleanup-merged.mjs` lists the local branch, worktree and leftover remote branch, and deletes them only after one yes. It unlinks links inside a worktree first, so deletion cannot follow them into the main checkout.

## When to ask

Use authorization already given. Ask before an unauthorized external action or destructive operation, before unrequested costly work, and before skipping required verification. Ask about unresolved choices that materially change the outcome, scope or an established contract. Resolve facts from the repository and make reversible implementation choices within scope. Subagents report consequential open questions to the main agent.

## Done means

Verify output from after the last change, the diff reviewed, each requested outcome mapped to evidence or marked incomplete, task-created temporary resources cleaned up, and one local commit per completed change unit. Bugs also need failing-before and passing-after output. Missing evidence is reported as "implemented, unverified". Read-only work does not require a commit.

## Writing and design judgment

Use concise, concrete language. Choice, problem and scenario formats are optional examples; the agent chooses prose, lists or tables to fit the content. The hook adds suggestions only when answer formats are enabled. The recovery document contains no format suggestions, so rereading it cannot bypass `answerFormats: false`. Playbooks do not reintroduce mandatory chat layouts.

A single caller does not make a file or abstraction wrong. Separation should clarify a responsibility, isolate a dependency or make behavior easier to test. Avoid layers that add work without those benefits. When the user asks the agent to design a UI, it can use the existing product patterns and make a draft without first demanding a design reference. The main agent checks a draft with written criteria in a real render; screen-design-checker is reserved for its supported visual references.

## Settings

- `.haechi.json` in the repo: commands (verify, single test, typecheck), forbidden whole-repo commands, test layout, optional `pythonTestMap` for explicit Python source-to-test relationships, Git host and base/protected branches, optional Git format overrides, worktree setup and teardown, optional risk paths.
- `~/.haechi/user.json`: budget, model overrides, optional answer-format examples on or off, and a notes folder for anything that must stay out of the repo (requests to other teams, raw measurements, screen reports, login sessions for screen checks).

## Setup scope

A repository can finish setup without `git.branch`, `git.commit` or `git.mrTemplate`. These optional overrides are preserved if already set. Branch creation follows explicit naming rules or the environment default. Commit resolves its format from explicit rules or recent commits. MR resolves its body from an override, the repository template, or Summary, Changes and Validation sections. Merged PR history is consulted for formatting only when requested.

Setup detects execution settings and returns existing settings alongside candidates. Independent machine and repository checks run together, and their results feed one confirmation batch. The agent reuses successful checks when their relevant inputs have not changed. A verifier that actually runs the configured test can satisfy the single-test proof too; a no-tests result cannot. On reruns, unavailable evidence stays unverified until checked. Instruction discovery stays within the repository and its ancestors.

The default verifier uses `pythonTestMap` to select explicit test files for changed Python sources. A configured single-test command takes precedence over detected pytest. Skipped checks produce exit 2 rather than a successful verification result. The [Python backend guide](python-backends.md) defines path rules, command precedence and database prerequisites.

The [backend extensions](backend-extensions.md) add optional framework profiles and explicit migration and Docker preparation tools. Hooks carry the selected profiles into main sessions and subagents. Preparation is separate from verification: starting a daemon or applying migrations requires an explicit action and the conversation's authorization for its target.

## Build and distribution

- Sources live in `core/`. `build/build.mjs` generates `dist/claude` and `dist/codex`; CI fails when `dist` is stale.
- Agents name their principles, checks and procedures in frontmatter. The build writes them into the agent body, so Claude Code and Codex agents get the same text.
- Both tools install from this repository: `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`.
- Codex plugins cannot carry agents, so setup installs the generated agent TOML files.

## Findings that shaped the design

- A plugin installed by a user in Claude Code cannot change the system prompt or the first-message context (`prompt.compose`, `prompt.context` are skipped by the built-in security plugin). Rules go in through `prompt.submit` context.
- `prompt.submit` context does not reach subagents. The `agent.spawn` hook can append to a subagent's prompt.
- Codex runs hooks from CLI-installed plugins once the user trusts them in `/hooks`; subagents inherit the parent's injected context.
- Claude Code reads `AGENTS.md` on its own.

## Roadmap

P0 verification spikes → P1 skeleton and build → P2 core rules and hooks → P3 setup → P4 agents and principles → P5 playbooks (P0–P5 done) → P6 git skills → P7 real use on one repository → P8 v0.1 release.

## Credits

Several ideas are adapted from pstack (MIT). See NOTICE.
