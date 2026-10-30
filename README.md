# haechi

Agent workflows for Claude Code and Codex: reproduce bugs, build features, review changes, and verify the result with your repository's own commands.

Haechi gives the agent task playbooks, repository settings and verification tools. The agent chooses an approach that fits the task and reports the evidence before calling it done.

**Early release:** installable for trial. Expect breaking changes until v0.1.

[Quick start](#quick-start) · [Commands](#commands) · [Settings](#settings) · [Contributing](#source-and-contributing) · [Skills](skills/) · [Agents](agents/)

## Quick start

You need Git, Node.js, and a Claude Code or Codex installation with plugin support.

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

### 3. Try a task

```text
/haechi:bug The due date shows the next day for users in UTC-5. Reproduce it and fix the conversion.
```

For this bug, the agent collects a reproduction, finds the cause, adds a failing test, fixes the code and checks that the test passes. Its report shows what changed and what was verified.

You can also describe a task in natural language and let the agent select a playbook. Prefixing the prompt with a command explicitly selects one.

## What haechi adds

- **Repository facts in the session.** Hooks supply the configured verification commands, forbidden commands and task guidance, including after compaction.
- **A workflow for the task.** Bugs need failing-before and passing-after evidence. Features need checks for their acceptance criteria. Reviews produce findings without editing code.
- **Delegation when it helps.** The main agent can use implementers, adversarial testers, reviewers and screen checkers. Each task has a clear scope and file ownership; the main agent checks the results.
- **Evidence for completion.** Verification output must follow the last change. Missing checks are reported as `implemented · unverified`, with the reason.

Settled requirements can stay in the conversation. A separate spec helps when a consequential decision is unresolved or you ask for one. Completed changes get local commits; push, PR/MR creation and merge require authorization, which your request can already provide.

## Commands

Start with the playbook that matches your task. Each command links to its full instructions.

| Task | Command | What it does |
|---|---|---|
| Fix incorrect behavior | [/haechi:bug](skills/bug/SKILL.md) | Reproduce the bug, fix its cause, and prove failing-before and passing-after. |
| Add or change behavior | [/haechi:feature](skills/feature/SKILL.md) | Establish the required behavior, build it, and check each acceptance criterion. |
| Restructure existing code | [/haechi:refactor](skills/refactor/SKILL.md) | Change the structure and verify that behavior stays the same. |
| Review code | [/haechi:review](skills/review/SKILL.md) | Report defects and open questions with evidence. |
| Measure or improve performance | [/haechi:perf](skills/perf/SKILL.md) | Establish a baseline, measure candidates, and audit the result. |
| Strengthen existing tests | [/haechi:test-hardening](skills/test-hardening/SKILL.md) | Challenge the tests with mutations and improve what they catch. |

For example, a review request can stay read-only:

```text
/haechi:review Review this branch against main. Report defects with evidence; do not edit files.
```

Supporting skills handle individual steps:

- [spec](skills/spec/SKILL.md) resolves consequential requirements; [preview](skills/preview/SKILL.md) makes a quick UI prototype; [sweep](skills/sweep/SKILL.md) coordinates independent units of work.
- [impact-map](skills/impact-map/SKILL.md), [sibling-path-map](skills/sibling-path-map/SKILL.md), [mutation-check](skills/mutation-check/SKILL.md) and [review-diff](skills/review-diff/SKILL.md) support verification and review.
- [eval](skills/eval/SKILL.md) records workflow failures and compares proposed improvements in fresh contexts before changing active guidance. It runs when relevant to an evaluation task and adds no background memory or global rules. Seed observations are in [evals/failures.md](evals/failures.md).
- [plain](skills/plain/SKILL.md) improves lasting prose; [request](skills/request/SKILL.md) writes and updates a request to another team in one Markdown file.
- [commit](skills/commit/SKILL.md) makes a local commit; [mr](skills/mr/SKILL.md) opens a GitHub PR or GitLab MR; [ci-watch](skills/ci-watch/SKILL.md) watches and fixes GitLab CI through merge and cleanup. GitHub CI watching is not available yet.

Browse all skills in [skills/](skills/) and the seven subagent roles in [agents/](agents/).

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
| [agents/](agents/) | Subagent definitions. |
| [hooks/](hooks/) | Shared session rules and platform adapters in `claude/` and `codex/`. |
| [tools/](tools/), [principles/](principles/) | Verification tools and shared implementation/review principles. |
| [plugin.json](plugin.json) | Shared plugin metadata. |
| [build/](build/) | Generates both platform distributions. |
| [dist/claude/](dist/claude/), [dist/codex/](dist/codex/) | Generated plugins that users install. |
| [test/](test/) | Tests for the tools, hooks and build. |
| [docs/](docs/), [examples/](examples/) | Design notes, verification guides and runnable examples. |

Use the Node.js version in [CI](.github/workflows/ci.yml) when building the distributions. After editing source:

```bash
npm run build
npm run check
```

`npm run check` checks whether the distributions match the source. Run affected tests individually with `node --test test/<name>.test.mjs`, then commit the source and regenerated `dist/` files together. For a README-only change, run `npm run check` and check the links.

Open a pull request for your changes. The [design notes](docs/design.md) explain the architecture; the [verification scope decision](docs/verification-scope.md) records earlier verification changes and limits.

## Session context

<details>
<summary>How an explicitly selected playbook is remembered</summary>

Starting a prompt with `/haechi:feature <task>` (or `bug`, `refactor`, `perf`, `review`, `test-hardening`) remembers that selection within the session and working directory. Follow-up prompts and resumed or compacted sessions receive a reminder. Supporting skills such as `/haechi:preview` leave the selection intact.

A new primary command replaces the selection. Use `/haechi:context clear` when a task is finished, cancelled or replaced; natural-language task changes are not classified automatically. A new session has no selection.

This records user intent, not skill execution, progress or permission to edit. Persistence requires the host to deliver the literal command in `UserPromptSubmit.prompt`, together with `session_id` and `cwd`. Hosts that consume slash commands before this event cannot persist the selection through this mechanism. Local hook payload tests do not establish live host compatibility.

</details>

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE) for attribution.
