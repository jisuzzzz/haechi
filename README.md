# haechi — Workflow plugin for Claude Code and Codex

Haechi is a Claude Code and Codex plugin for AI coding agent workflows. Reproduce bugs, build features, review code, and verify changes with your repository's own commands.

Install the plugin, configure your repository once, and describe a task. Haechi gives the agent task playbooks, repository settings and verification tools, with guidance to report what was checked before calling the work done.

**Early release:** workflow guidance continues to evolve. See the [0.1.0 release notes](docs/release-0.1.0.md) for compatibility and verification scope.

[Quick start](#quick-start) · [Usage examples](#usage-examples) · [Commands](#commands) · [Settings](#settings) · [Contributing](#source-and-contributing) · [Skills](skills/) · [Agents](agents/)

## Quick start

You need Git, Node.js 24 LTS (24.22.2 or newer), and a Claude Code or Codex installation with plugin support. Keep your Node.js LTS line on its latest security patch. The repository pins its development version in `.nvmrc`; with nvm, run `nvm install` and `nvm use` from the repository root.

### 1. Install for your agent

**Claude Code**

```bash
claude plugin marketplace add jisuzzzz/haechi
claude plugin install haechi@haechi
```

**Codex**

```bash
codex plugin marketplace add jisuzzzz/haechi
codex plugin add haechi@haechi
```

For Codex, open a new terminal, run `codex`, and trust the haechi hooks in `/hooks`.

### 2. Set up your repository

Open your repository in your agent and run:

```text
/haechi:setup
```

Setup detects the verification commands and test locations, confirms the forbidden commands and sensitive-data rule, and proves that the commands run. It saves shared settings in `.haechi.json` and asks for personal preferences once per machine.

Run setup once per repository, then again when its execution settings change. Git settings are resolved when a Git operation needs them.

### 3. Reproduce and fix a bug

```text
/haechi:bug The due date shows the next day for users in UTC-5. Reproduce it and fix the conversion.
```

For this bug, the agent collects a reproduction, finds the cause, adds a failing test, fixes the code and checks that the test passes. Its report shows what changed and what was verified.

You can also describe a task in natural language and let the agent choose useful skills. Prefixing the prompt with a command explicitly requests that method; it does not make the method an exclusive workflow.

## What haechi adds

- **Checks that fit your repository.** Hooks supply your configured verification commands, forbidden commands and task guidance, including recovery after compaction. Later requests remind the agent to assess the relevant guidance and required evidence.
- **Reproduce, repair and verify.** Bug fixes need evidence of the failure before the repair and the result afterward. Features need checks against their acceptance criteria; code reviews report findings without editing code. The [common work contract](principles/work-contract.md) defines these obligations across task methods.
- **UI previews before implementation.** The [preview skill](skills/preview/SKILL.md) guides the agent to build and check an interactive proposal, then carry the selected design and interaction criteria into implementation.
- **Work you can resume.** For work that spans sessions, depends on another task or produces a shared result, [work-graph](skills/work-graph/SKILL.md) guides the agent to record the goal, progress, decisions, verification results and next action, with links to native sessions.
- **Delegation when it helps.** The main session gives a bounded task to a repository-required agent or the plugin's generic worker, with the required guidance, context, file ownership and expected evidence. Independent reviews use separate executions, and the main session checks the results. See [delegate](skills/delegate/SKILL.md) for the packet procedure and host limits.
- **Results with verification evidence.** The agent checks each requested outcome against actual results on the final change and reports gaps. Exit 0 alone is insufficient; missing proof is `implemented · unverified`.

Settled requirements can stay in the conversation. The spec skill helps consolidate requirements and acceptance criteria; its description guides selection. It does not require a saved document or a new approval. Completed changes get local commits; push, PR/MR creation and merge require authorization, which your request can already provide.

## Usage examples

### Review code with Claude Code or Codex

```text
/haechi:review Review this branch against main. Report defects with evidence; do not edit files.
```

The review reports concrete defects, open questions and verification gaps within the requested scope. The request above keeps the repository files unchanged.

### Preview a UI before implementation

```text
/haechi:preview Show two options for the table row actions menu. Let me open the menu, select an action and see the result using sample data. Keep this to a prototype.
```

For a disposable prototype, the agent builds an interactive HTML preview outside the repository, serves it on localhost, and checks the relevant states and interactions in a browser before sharing the URL. It reports any unavailable checks. When implementation is requested, the selected design and interaction criteria become the reference for the product change.

### Resume work across sessions

For a task already recorded by work-graph, start a later session in the same repository and describe the work to continue:

```text
Continue the recorded table row actions menu task. Check its goal, decisions, verification results and next action before making changes.
```

For eligible work, work-graph guidance calls for recording the task before substantial work and updating it when the remaining plan or completion judgment changes. It retains applicable user constraints and durable results so a later session can find what remains. Short standalone questions need no new task.

Records live in the repository's Git common directory. Linked worktrees share them; separate clones and remote machines do not synchronize them automatically. Hooks remind the agent to maintain these records; recording still depends on the agent following the guidance. See [work-graph](skills/work-graph/SKILL.md) for storage, session access and handoff details.

## Commands

Choose a useful method or describe the task naturally. Existing commands remain compatible; none exempts product changes from the common work contract. Each command links to its instructions.

| Task | Command | What it does |
|---|---|---|
| Fix incorrect behavior | [/haechi:bug](skills/bug/SKILL.md) | Reproduce the bug, fix its cause, and prove failing-before and passing-after. |
| Add or change behavior | [/haechi:feature](skills/feature/SKILL.md) | Establish the required behavior, build it, and check each acceptance criterion. |
| Restructure existing code | [/haechi:refactor](skills/refactor/SKILL.md) | Change the structure and verify that behavior stays the same. |
| Review code | [/haechi:review](skills/review/SKILL.md) | Report defects and open questions with evidence. |
| Measure or improve performance | [/haechi:perf](skills/perf/SKILL.md) | Establish a baseline, measure candidates, and audit the result. |
| Strengthen existing tests | [/haechi:test-hardening](skills/test-hardening/SKILL.md) | Challenge the tests with mutations and improve what they catch. |

Focused skills handle particular work:

- [delegate](skills/delegate/SKILL.md) exposes a compact step input form and assembles complete worker guidance into task files, returning only a coordinator receipt. Direct delivery depends on the host; it does not enforce permissions or prove behavior.
- [spec](skills/spec/SKILL.md) helps establish requirements and acceptance criteria; [preview](skills/preview/SKILL.md) builds and checks UI proposals; [sweep](skills/sweep/SKILL.md) coordinates independent units of work.
- [impact-map](skills/impact-map/SKILL.md), [sibling-path-map](skills/sibling-path-map/SKILL.md), [mutation-check](skills/mutation-check/SKILL.md) and [review-diff](skills/review-diff/SKILL.md) support verification and review.
- [eval](skills/eval/SKILL.md) records workflow failures and compares proposed improvements in fresh contexts before changing active guidance. It runs when relevant to an evaluation task and adds no background memory or global rules. Seed observations are in [evals/failures.md](evals/failures.md).
- [answer](skills/answer/SKILL.md) shapes choices, problem explanations and concrete scenarios while preserving evidence and useful explanations. [work-graph](skills/work-graph/SKILL.md) keeps minimal shared task state and native session links.
- [Clear writing](principles/clear-writing.md) supplies shared expression guidance for chat and lasting prose; [document](skills/document/SKILL.md) composes cross-team documents from shared Parts and six templates; [request](skills/request/SKILL.md) uses that system to write and update requests in one file.
- [commit](skills/commit/SKILL.md) makes a local commit; [mr](skills/mr/SKILL.md) opens a GitHub PR or GitLab MR; [ci-watch](skills/ci-watch/SKILL.md) watches and fixes GitLab CI through merge and cleanup. GitHub CI watching is not available yet.

Browse all skills in [skills/](skills/) and the single generic worker in [agents/](agents/). See [worker migration and validation](docs/worker-validation.md) for upgrade steps, host requirements and measurement limits.

For a document without an earlier request, start from the current observation:

```text
/haechi:document Draft a backend request for a support queue: the Open tab shows 12 tickets but no rows. If the development screen is accessible, capture it and mark the count and empty list. Keep the suspected backend cause unconfirmed.
```

The document skill reuses browser helpers or temporary Playwright scripts for captures. `screenshot-annotate.mjs` in the installed plugin preserves the original PNG and creates a separate PNG with numbered borders; GIF is optional when motion matters. Agent-facing [Parts and templates](skills/document/assets/COMBINATIONS.md) use English, while work documents follow the recipient's language. The [capture guide](skills/document/references/capture.md) covers coordinates, attachments and missing access. See the [validation scope and unresolved quality claims](docs/document-validation.md) before treating the templates as a writing standard.

## Settings

| File | What belongs here |
|---|---|
| `.haechi.json` | Shared repository settings: verify and single-test commands, forbidden commands (`[]` when none), test locations and the sensitive-data rule. Commit this file. |
| `AGENTS.md` | Team rules and judgment, such as sensitive-data handling and where code belongs. |
| `~/.haechi/user.json` | Personal preferences: `notesDir` for files kept outside repositories and `openReports` for opening screen reports automatically. |

Setup preserves explicit settings and unknown existing keys. A saved command is not proof that it works; setup runs the smallest relevant check and reports anything left unverified.

Git host, base/protected branches, naming rules and PR/MR formats are optional settings. The Git skills resolve them when needed from explicit settings, repository instructions and remote information, and ask about an unresolved target at that operation.

For Python repositories, see the [backend verification guide](docs/python-backends.md) for source-to-test mapping and test database prerequisites.

## Source and contributing

Edit the root source folders. The installed plugins in `dist/` are generated from them.

| Path | Purpose |
|---|---|
| [skills/](skills/) | Task playbooks and supporting skills. |
| [agents/](agents/) | One generic worker, without fixed model, effort or tool lists. Playbooks define task contracts; the main supplies context and permissions at dispatch. |
| [hooks/](hooks/) | Shared session rules and platform adapters in `claude/` and `codex/`. |
| [tools/](tools/), [principles/](principles/) | TypeScript tool sources and shared implementation/review principles. |
| [plugin.json](plugin.json) | Shared plugin metadata. |
| [build/](build/) | Generates both platform distributions. |
| [dist/claude/](dist/claude/), [dist/codex/](dist/codex/) | Generated plugins that users install. |
| [test/](test/) | Tests for the tools, hooks and build. |
| [docs/](docs/) | Design notes and verification guides. |

Use the Node.js version in [CI](.github/workflows/ci.yml) when building the distributions. After editing source:

```bash
npm ci
npm run build
npm run check
```

`tools/*.mts` and `hooks/rules.mts` are TypeScript sources. Keep relative tool imports ending in `.mjs`; TypeScript resolves them to `.mts` during development. The build removes types and emits the existing `.mjs` paths into both distributions. Plugin users need no TypeScript compiler.

`npm run typecheck` checks the sources with strict TypeScript settings. Both `npm run build` and `npm run check` run it first. `npm run check` also checks whether the distributions match the source. Tests import the generated JavaScript, so rebuild before testing source changes. Run affected tests individually with `node --test test/<name>.test.mjs`, then commit the source and regenerated `dist/` files together. For a README-only change, run `npm run check` and check the links.

Open a pull request for your changes. The [design notes](docs/design.md) explain the architecture; the [verification scope decision](docs/verification-scope.md) records earlier verification changes and limits.

## Session context

<details>
<summary>How an explicitly selected playbook is remembered</summary>

Starting a prompt with `/haechi:feature <task>` (or `bug`, `refactor`, `perf`, `review`, `test-hardening`) remembers that selection within the session and working directory. Follow-up prompts and resumed or compacted sessions receive a reminder. Supporting skills such as `/haechi:preview` and `/haechi:spec` leave the selection intact and can also be used on their own. Product UI implementation uses the selected design reference and inherits the common work contract's tests, rendered comparison and component reuse review. The stored command is a user preference, not an exclusive workflow or proof of completed work.

A new primary command replaces the selection. Use `/haechi:context clear` when a task is finished, cancelled or replaced; natural-language task changes are not classified automatically. A new session has no selection.

This records user intent, not skill execution, progress or permission to edit. Persistence requires the host to deliver the literal command in `UserPromptSubmit.prompt`, together with `session_id` and `cwd`. Hosts that consume slash commands before this event cannot persist the selection through this mechanism. Local hook payload tests do not establish live host compatibility.

</details>

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE) for attribution.

## Evaluation tools

Use the [shared Harbor runner](evals/harbor/README.md) to compare constructed React/FastAPI tasks and locally prepared SWE-bench tasks. [Historical findings and limitations](docs/evaluation-results.md) are recorded separately from the reusable tools; raw logs, snapshots and generated task payloads stay in local archives.
