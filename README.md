# haechi

An agent workflow plugin for Claude Code and Codex.

Haechi is a creature from Korean folklore that tells right from wrong. This plugin does the same for agent work: it routes each request to a playbook, delegates to subagents when that pays off, and calls work done only with evidence.

Status: v0 in progress — installable for trial. Expect breaking changes until v0.1.

## What's in it

- Setup (`/haechi:setup`): detects your commands, test layout and git conventions, asks only what it cannot detect, proves each command runs, and writes `.haechi.json`.
- Rules injected on every prompt: how to classify a request, when to delegate, when to stop and ask, and what counts as done.
- Playbooks: `bug`, `feature`, `refactor`, `perf`, `review`, `test-hardening`, plus the procedures they call: `spec`, `sweep`, `plain`, `request`.
- Git: `commit`, `mr` (GitLab and GitHub), `ci-watch` with cleanup after merge (GitLab only for now).
- Subagents: implementer, adversarial-tester, verifier, screen-design-checker, screen-parity-checker, experiment-runner, experiment-auditor.

## How it works

You ask: "The due date shows the next day for users in UTC-5." The first reply restates the task and says how it will run:

```
Current: formatDate('2024-02-29') shows Mar 1 in UTC-5
Target:  the date shown matches the date stored; the spec says dates are not shifted
Keep:    time display and other formats
Proof:   a test that fails now and passes after the fix
Verdict: type bug (units 1) · run direct · worktree no · effort default
```

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

- `.haechi.json` in the repository, committed and shared by the team: verify and single-test commands, commands that must never run on the whole repo, test layout, git conventions, worktree setup.
- `~/.haechi/user.json`, per person: budget, model overrides, answer formats on or off, and a notes folder for anything that must stay out of the repository.

Team judgment rules (what is sensitive, where code goes) stay in the repository's `AGENTS.md`.

## Design

[docs/design.md](docs/design.md) explains what the plugin does and why.

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
