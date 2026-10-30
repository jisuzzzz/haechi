# haechi

An agent workflow plugin for Claude Code and Codex.

Haechi is a creature from Korean folklore that tells right from wrong. This plugin gives agents task guidance, repository facts and verification tools. The agent chooses how to work and calls the task done only with evidence.

Status: v0 in progress — installable for trial. Expect breaking changes until v0.1.

## Find and edit the source

| Path | Purpose |
|---|---|
| [skills/](skills/), [agents/](agents/) | Editable skills (including playbooks) and subagent definitions. Start here. |
| [hooks/](hooks/) | Shared rules and platform adapters in `claude/` and `codex/`. |
| [tools/](tools/), [principles/](principles/) | Supporting tools and shared implementation/review principles. |
| [plugin.json](plugin.json) | Shared plugin metadata. |
| [build/](build/) | Generates the Claude Code and Codex distributions from the root source folders. |
| [dist/claude/](dist/claude/), [dist/codex/](dist/codex/) | Generated plugins that users install. |
| [test/](test/) | Tests for the tools, hooks and build. |
| [docs/](docs/) | Design, configuration guides and verification records. |
| [examples/](examples/) | Small runnable examples for trying the workflow. |

Edit the root source files, then run `npm run build` and `npm run check`. Commit the regenerated `dist/` files with the source change. Run affected tests individually with `node --test test/<name>.test.mjs`.

## What's in it

| Component | Role |
|---|---|
| Setup | `/haechi:setup` detects execution settings, collects confirmations, proves commands run and saves `.haechi.json`. |
| Rules and hooks | Supply the agent with task classification, delegation, approval and completion rules. |
| Playbooks | Guide a task from start to finish: `bug`, `feature`, `refactor`, `perf`, `review`, `test-hardening`. |
| Supporting skills | Handle individual steps such as planning (`spec`), bulk work (`sweep`), impact analysis (`impact-map`), writing (`plain`) and team requests (`request`). |
| Git skills | Commit changes (`commit`), open GitHub PRs or GitLab MRs (`mr`), and watch GitLab CI through merge and cleanup (`ci-watch`). |
| Subagents | Implement changes, challenge tests, verify results, check screens, and run or audit experiments. |
| Tools and principles | Run repeatable checks and define implementation and review criteria. |

Playbooks are skills too; the distinction is their scope. Subagent roles are `implementer`, `adversarial-tester`, `verifier`, `screen-design-checker`, `screen-parity-checker`, `experiment-runner` and `experiment-auditor`.

## How it works

The **main agent** (the AI in your current conversation) selects useful playbooks and skills, decides what to do directly or delegate, and reviews the results. When delegating, it writes a task-specific request with the objective, relevant context, scope and expected evidence. It asks about consequential unresolved choices and actions you have not authorized.

You ask: "The due date shows the next day for users in UTC-5." The agent might reply: "I'll reproduce the date shift, fix the conversion, and check that time displays stay unchanged." It can use a table if that makes the explanation clearer; no fixed first-reply format is required.

The bug playbook supplies the evidence to collect: reproduction, cause, a failing test, the fix and passing verification. The agent adapts the work to the task and commits completed changes locally. Push and merge requests require authorization, which can already be present in your request.

Independent work can go to subagents when parallelism or separate context helps. File and line counts do not force delegation. Parallel edits never share files, and independent review is chosen for risk or shared contracts. "Done" needs verify output from after the last change; missing evidence is reported as "implemented · unverified".

Clear requirements can stay in the conversation. A separate spec is useful for consequential unresolved behavior or scope decisions, or when you request one. Routine implementation choices do not need another approval.

## Install

Claude Code:

```bash
claude plugin marketplace add jisuzzzz/haechi
claude plugin install haechi@haechi
```

Codex:

```bash
codex plugin marketplace add jisuzzzz/haechi
codex plugin add haechi@haechi
```

Then open a new terminal, run `codex`, and trust the haechi hooks in `/hooks`.

Run `/haechi:setup` once per machine and once per repository. Execution setup establishes the verification commands, test locations, forbidden commands and sensitive-data rule before code changes. Git settings are resolved when a Git operation needs them.

## Settings

- `.haechi.json` in the repository, committed and shared by the team: verify and single-test commands, forbidden commands (`[]` when none), test layout and the sensitive-data rule. Git settings, worktree setup and other repository-specific settings are optional.
- `~/.haechi/user.json`, per person: `notesDir` for files that must stay out of the repository and `openReports` for opening screen reports automatically. Existing extra keys are preserved when settings are updated.

Team judgment rules (what is sensitive, where code goes) stay in the repository's `AGENTS.md`.

v0.0.9 restores the v0.0.7 verification behavior after removing the backend preparation extensions from v0.0.8. See the [verification scope decision](docs/verification-scope.md) for the rollback and the remaining Python verifier design questions.

Git operations resolve the host, base/protected branches and naming rules when needed. Explicit settings and repository instructions take precedence; the remote URL and remote HEAD supply observable defaults. The agent asks about an unresolved target at that operation. Missing Git settings do not block local code changes.

Existing `git.branch`, `git.commit` and `git.mrTemplate` settings remain valid, but setup does not require or infer them. The commit skill uses recent commits when no format is declared. The MR skill uses the repository template or a default Summary, Changes and Validation body; it does not routinely inspect merged PRs.

Setup combines independent detection and machine checks, presents one draft and question batch, and reuses successful evidence while its inputs are unchanged. It limits instruction discovery to the repository and its ancestors. On reruns, only affected checks need to run again; a saved command without available execution evidence remains unverified.

## Design

[docs/design.md](docs/design.md) explains what the plugin does and why.

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Explicit task context

Start a prompt with `/haechi:feature <task>` (or `bug`, `refactor`, `perf`, `review`, `test-hardening`) to remember your selected playbook within that session and working directory. Follow-up prompts and resumed/compacted sessions receive a short reminder. Supporting skills such as `/haechi:preview` leave the selection intact. A new primary playbook replaces it; `/haechi:context clear` clears it when finished or cancelled. A new session has no selection. Natural-language task changes are not classified automatically; clear the selection when switching tasks without a new primary command.

This stores intent, not proof of reading a skill, step progress, or permission to edit. It never blocks tools or forces workflow stages. It requires the host to deliver the literal user command in `UserPromptSubmit.prompt` with `session_id` and `cwd`. Hosts that consume slash commands before this event cannot persist the selection through this mechanism. Local hook payload tests do not establish live host compatibility.
