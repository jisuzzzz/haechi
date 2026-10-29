# haechi

An agent workflow plugin for Claude Code and Codex.

Haechi is a creature from Korean folklore that tells right from wrong. This plugin does the same for agent work: it routes each request to a playbook, delegates to subagents when that pays off, and calls work done only with evidence.

Status: v0 in progress — installable for trial. Expect breaking changes until v0.1.

## What's in it

| Component | Role |
|---|---|
| Setup | `/haechi:setup` detects execution settings, collects confirmations, proves commands run and saves `.haechi.json`. |
| Rules and hooks | Supply the agent with task classification, delegation, approval and completion rules. |
| Playbooks | Guide a task from start to finish: `bug`, `feature`, `refactor`, `perf`, `review`, `test-hardening`. |
| Supporting skills | Handle individual steps such as planning (`spec`), bulk work (`sweep`), impact analysis (`impact-map`), writing (`plain`) and team requests (`request`). |
| Git skills | Commit changes (`commit`), open GitHub PRs or GitLab MRs (`mr`), and watch GitLab CI through merge and cleanup (`ci-watch`). |
| Subagents | Implement changes, challenge tests, verify results, check screens, and run or audit experiments. |
| Tools, principles and formats | Run repeatable checks, define implementation and review criteria, and structure answers. |

Playbooks are skills too; the distinction is their scope. Subagent roles are `implementer`, `adversarial-tester`, `verifier`, `screen-design-checker`, `screen-parity-checker`, `experiment-runner` and `experiment-auditor`.

## How it works

The **main agent** (the AI in your current conversation) selects the playbook and skills, decides what to do directly or delegate at each step, and reviews the results. It asks you when requirements are unclear or approval is needed.

You ask: "The due date shows the next day for users in UTC-5." The first reply restates the task and says how it will run:

| Item | Content |
|---|---|
| Current | `formatDate('2024-02-29')` shows Mar 1 in UTC-5. |
| Target | Display the stored date without shifting it, as the spec requires. |
| Keep | Time display and other formats. |
| Proof | A test that fails now and passes after the fix. |

**Verdict:** type bug (units 1) · run direct · worktree no · effort default

Then the bug playbook runs: reproduce, find the first wrong decision, write the failing test, fix at the cause, run the repo's verify command, and commit locally. Push and merge requests wait for your yes.

Larger work goes to subagents. Parallel units never share files, and a verifier reviews big or contract-sharing changes. "Done" needs verify output from after the last change; missing evidence is reported as "implemented · unverified".

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

Run `/haechi:setup` once per machine and once per repository. Until a repository has `.haechi.json`, haechi answers questions but starts no code change there.

## Settings

- `.haechi.json` in the repository, committed and shared by the team: verify and single-test commands, commands that must never run on the whole repo, test layout, Git host and base/protected branches, optional Git format overrides, worktree setup.
- `~/.haechi/user.json`, per person: budget, model overrides, answer formats on or off, and a notes folder for anything that must stay out of the repository.

Team judgment rules (what is sensitive, where code goes) stay in the repository's `AGENTS.md`.

Branch names and commit/MR formats are resolved when those operations happen. Existing `git.branch`, `git.commit` and `git.mrTemplate` settings remain valid, but setup does not require or infer them. The commit skill uses recent commits when no format is declared. The MR skill uses the repository template or a default Summary, Changes and Validation body; it does not routinely inspect merged PRs.

Setup combines independent detection and machine checks, presents one draft and question batch, and reuses successful evidence while its inputs are unchanged. It limits instruction discovery to the repository and its ancestors. On reruns, only affected checks need to run again; a saved command without available execution evidence remains unverified.

## Repository structure

| Path | Purpose |
|---|---|
| `core/` | Shared source: skills (including playbooks), agents, hooks, platform connectors, tools, principles and answer formats. Edit these originals. |
| `build/` | Generates the Claude Code and Codex distributions from `core/`. |
| `dist/claude/`, `dist/codex/` | Generated plugins that users install. |
| `test/` | Tests for the tools, hooks and build. |
| `docs/` | Detailed design and decisions. |

## Design

[docs/design.md](docs/design.md) explains what the plugin does and why.

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
