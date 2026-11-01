# haechi design

Status: v0 in progress. This document describes what the plugin does and why. It changes as decisions change.

## Goals

- One workflow for Claude Code and Codex users across frontend (TypeScript, React, React Native) and backend (Python, FastAPI, Django) repositories.
- Keep repository facts, authorization boundaries and completion evidence available. Load task guidance when it helps.
- Work is called done only with evidence.
- No stack-specific rule packs. Plugin rules target the defects agents actually produce. Anything that differs per repository is a setting the repository declares.

## Layers

```
[0] setup     user setup (notes folder, report preference, install check)
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
- Check changed UI in a real render. A separate screen checker helps when there is a useful design or behavior comparison. Screen checkers open the original images to compare appearance, using structure and measurements as supporting evidence. Unviewable states remain blocked, and aesthetic preferences stay separate from observable defects.

## Playbooks and documents

- Task playbooks are `bug`, `feature`, `refactor`, `perf`, `review` and `test-hardening`. Their procedures are guidance; repository permissions and required evidence remain constraints.
- Detailed investigation techniques live in optional skill references. They ship with both plugins but are not injected into the session rules or inlined into agent prompts. The main agent chooses jobs and context; workers choose their methods within the assigned scope.
- `eval` collects observed workflow failures separately from suspected causes, freezes a baseline/candidate comparison, and requires repeated target improvement without candidate failures before adoption. Independent behavioral judgment and final-file verification remain necessary; `eval-report.mjs` only checks supplied judgments and evidence completeness. Records are read when relevant, never injected as permanent lessons. See the [evaluation protocol](../skills/eval/references/protocol.md) and [seed observations](../evals/failures.md).
- `spec` helps resolve consequential behavior or scope decisions, or produce an explicitly requested spec. Accepted requirements and checkable outcomes can stay in chat. File counts, a new screen or an export change alone do not require a formal document or another approval.
- `sweep` coordinates many independent units when splitting helps. Change units get commits; read-only units return findings and use conversation evidence to resume.
- Specs and requests to other teams are written directly in Markdown and updated in the same file. Repository or team conventions determine their layout; empty sections and duplicate machine-readable copies are unnecessary. `screen-report.mjs` builds screen reports. `plain` improves lasting prose.
- Requests to other teams and screen reports live in the user's notes folder, never in the repository.

The `spec` step came from the user's wish to discuss a task with the main session and agree on what to build before implementation. That intent still applies when a consequential decision is unresolved. The current workflow lets settled requirements stay in chat; the earlier preference for always saving a spec is recorded in the [carryover notes](carryover-2026-10-30.md).

## UI previews

Preview started from the pstack idea of showing layout and design choices quickly with disposable code, so the user can choose a direction before product implementation. Describing it only as worktrees, development servers and comparison reports lost that purpose and made the actual application seem like the default.

Version 0.0.11 chose a single HTML file with fake data as the default. [`preview-scaffold.mjs`](../tools/preview-scaffold.mjs) provides a fixed top bar with variant and state switchers, number-key shortcuts, side-by-side comparison and a "Throwaway prototype · fake data" badge. The file opens without a server, keeps the selection in the URL hash and shows a rendering error in the affected variant. It refuses existing output files and paths inside a git work tree.

The agent fills the prototype CSS, `STATES` data and each variant's `render(data, root)` function. It keeps the generated controls intact so previews share the same navigation. An illustrative widget fits when a still image answers the question. The running application fits when the user requests it or the choice depends on real data, state or integration that fake data cannot replace. The [preview skill](../skills/preview/SKILL.md) defines the procedure and browser checks.

Setup-generated preview CSS for each repository was considered and rejected because it would add maintenance work. There is no automatic design-token integration. The agent can still copy product colors, fonts or spacing when that helps build the preview quickly; the running application remains available when its real environment matters.

Implementation carries over the chosen layout, timing and interaction. Reusing prototype code is a separate decision.

## Git

- `commit` works the same on every host. `mr` opens merge requests on GitLab (glab) and pull requests on GitHub (gh) from the repo's title and body conventions. `ci-watch` (GitLab only for now) waits for the pipeline in the background, fixes failures in the session that opened the merge request, stops after the same job fails twice, and never passes a gate by suppressing it.
- Git settings are resolved when an operation needs them: explicit settings and repository instructions first, then the remote URL and local remote HEAD. An unresolved host or target requires a focused question at that operation, not another setup run. Local commits need no host login; authorized remote operations check authentication for their selected host.
- After a merge, `cleanup-merged.mjs` lists the local branch, worktree and leftover remote branch, and deletes them only after one yes. It unlinks links inside a worktree first, so deletion cannot follow them into the main checkout.

## When to ask

Use authorization already given. Ask before an unauthorized external action or destructive operation, before unrequested costly work, and before skipping required verification. Ask about unresolved choices that materially change the outcome, scope or an established contract. Resolve facts from the repository and make reversible implementation choices within scope. Subagents report consequential open questions to the main agent.

## Done means

For example, a CSV download button rendering proves that the button exists. A downloaded file proves that the download ran. Checking its rows against the requested filter proves that part of the export behavior. These are different claims and need different evidence.

The main session keeps the required outcomes and unchanged contracts available from the request and repository. They can stay in the conversation. It chooses and revises methods, tools and delegation without a fixed agent sequence or extra approval, but cannot lower acceptance criteria to fit the implementation.

Completion requires repo verification and relevant tests after the last change, a reviewed diff, passing behavior evidence for every required outcome, cleanup of task-created temporary resources, and one local commit per completed change unit. The main agent inspects the assertions or interaction results, not just a command exit code or worker verdict. Evidence must identify the command or interaction, relevant conditions, expected and observed result, and the checked final change. No separate evidence ledger or fixed report format is required.

| Check result | Meaning |
|---|---|
| Passed | The executed check confirmed the required behavior under the stated conditions. |
| Failed | The observed result contradicts the expected result. |
| Unverified | Evidence is missing, skipped, stale or insufficient. Zero tests and all-skipped tests do not establish a behavior pass. |
| Needs decision | The required expected behavior is unresolved. |

Successful termination requires all required outcomes to pass, applicable repo checks to pass, and no known defect or unresolved decision preventing the requested result. A defect can prevent success even if its fix lies outside owned files; report the boundary without treating it as edit authorization. Skips unrelated to required behavior may be explained, but do not supply evidence for it. Bugs need the same reproduction failing before and passing after for the intended reason. Read-only work reports the inspected scope and limits; "no defects found" is not proof that the product works, and read-only work needs no commit.

Stopping because access, information, authorization or a consequential decision is missing does not mean success. Report partial results, the remaining outcomes and what would unblock them. Implemented work without required proof is "implemented · unverified". A replacement check must establish the required behavior; a reason for omitting a check is not a waiver.

These are evidence obligations, not a graph executor or a host-level completion lock. Hooks provide instructions and tools check observable command results; the main agent still judges acceptance coverage. Changes to these instructions do not by themselves prove improved host-agent behavior. The [completion forward check](core-validation.md) records six constructed cases and their limits. The [workflow observations](../evals/failures.md) and [pilot decision](../evals/pilot/decision.md) keep earlier evidence separate.

## Writing and design judgment

Use concise, concrete language. The [answer skill](../skills/answer/SKILL.md) restores situational A/B/C guidance: A supports a choice with comparable trade-offs and a justified recommendation; B connects a symptom, evidence, cause or uncertainty, remedy and check; C explains behavior through a concrete situation. The agent selects the pattern and includes its relevant content while choosing its own work methods. There is no separate response-layout setting or required work sequence.

Use prose, lists or tables to fit the content; do not print A/B/C labels or empty headings just to satisfy the pattern. Explicit output requests take precedence, simple answers stay short, and existing document Parts/templates remain the structure for cross-team artifacts. Unknown causes, proposed changes and unmeasured effects remain visibly uncertain. The skill reuses the document evaluation's facts, uncertainty, responsibility, answerability and evidence criteria without adding a document-review process to chat. The [evaluation record](core-validation.md) distinguishes checked behavior from any claim of improved human readability. Earlier templates and the decision to keep prose out of code blocks remain in the [carryover notes](carryover-2026-10-30.md).

The answer skill uses the original A/B/C foundation with a local editing check. Read the whole answer before trimming: preserve the explanation, evidence and uncertainty, and remove repetition when it adds reading effort without helping understanding or a decision. A brief recap or reminder can help even when it was not explicitly requested. Do not impose a length target or a one-mention rule. The [flow comparison](core-validation.md) separates content checks, blind model preferences and the user’s choice of the original foundation. The [previous refinement](core-validation.md) remains as historical evidence, not proof of better readability.

A single caller does not make a file or abstraction wrong. Separation should clarify a responsibility, isolate a dependency or make behavior easier to test. Avoid layers that add work without those benefits. When the user asks the agent to design a UI, it can use the existing product patterns and make a draft without first demanding a design reference. The main agent checks a draft with written criteria in a real render; screen-design-checker is reserved for its supported visual references.

## Settings

- `.haechi.json` in the repo: verify and single-test commands, a forbidden-command list (empty when none), test locations and the sensitive-data rule. Optional settings include typecheck, `pythonTestMap` for explicit Python source-to-test relationships, Git settings, worktree setup and teardown, and risk paths.
- `~/.haechi/user.json`: `notesDir` for files that must stay out of the repo (requests to other teams, raw measurements, screen reports, login sessions for screen checks) and `openReports` for opening reports automatically. Updates preserve unknown existing keys.

## Setup scope

A repository can finish setup without any Git settings. Completion requires `commands.verify`, `commands.testOne`, nonempty `testDirs`, `sensitiveData` and a `forbidden` array, which may be empty. Known Git candidates can be retained without collecting missing values or proving remote login. Explicit Git values are preserved. Branch creation follows explicit naming rules or the environment default. Commit resolves its format from explicit rules or recent commits. MR resolves its body from an override, the repository template, or Summary, Changes and Validation sections. Merged PR history is consulted for formatting only when requested.

Setup detects execution settings and returns existing settings alongside candidates. Independent machine and repository checks run together, and their results feed one confirmation batch. The agent reuses successful checks when their relevant inputs have not changed. A verifier that actually runs the configured test can satisfy the single-test proof too; a no-tests result cannot. On reruns, unavailable evidence stays unverified until checked. Instruction discovery stays within the repository and its ancestors.

The default verifier uses `pythonTestMap` to select explicit test files for changed Python sources. A configured single-test command takes precedence over detected pytest. Skipped checks and missing or incomplete test-execution summaries produce exit 2. Reported test failures produce exit 1 even if a wrapper exits 0. The verifier checks runner-reported execution; acceptance coverage still needs the main agent's judgment. The [Python backend guide](python-backends.md) defines supported summaries, path rules, command precedence and database prerequisites.

## Build and distribution

- Sources live in the root `skills/`, `agents/`, `hooks/`, `tools/` and `principles/` folders, with metadata in `plugin.json`. Platform adapters live in `hooks/claude/` and `hooks/codex/`. `build/build.mjs` generates `dist/claude` and `dist/codex`; CI fails when `dist` is stale.
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
