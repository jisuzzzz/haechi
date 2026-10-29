# haechi design

Status: v0 in progress. This document describes what the plugin does and why. It changes as decisions change.

## Goals

- One workflow for Claude Code and Codex users across frontend (TypeScript, React, React Native) and backend (Python, FastAPI, Django) repositories.
- Rules apply on every prompt, not only when the model remembers a skill.
- Work is called done only with evidence.
- No stack-specific rule packs. Plugin rules target the defects agents actually produce. Anything that differs per repository is a setting the repository declares.

## Layers

```
[0] setup     user setup (budget, notes folder, install check)
              repo setup (detect, ask what cannot be detected, prove commands run, write .haechi.json)
[1] hooks     every prompt: principle index + routing rules + repo settings summary
              Claude Code: a mod (function hooks). Codex: command hooks. Both call one core.
[2] main      the main session orchestrates: restate, classify, split into units, delegate, judge, report
[3] playbooks bug · feature · refactor · perf · review · test hardening, plus spec and sweep procedures
[4] agents    implementer · adversarial-tester · verifier · screen-design-checker · screen-parity-checker
              · experiment-runner · experiment-auditor
```

Beside them: `.haechi.json` (machine-read repo settings, committed), `AGENTS.md` (human judgment rules), `~/.haechi/user.json` (per-person settings and paths outside the repo).

## Request flow

1. The hook injects the rules.
2. The first reply to a code-change request restates the task in four labeled lines and a verdict line:
   ```
   Current: what is true now
   Target:  what must be true when done
   Keep:    what must not change
   Proof:   how completion will be shown
   Verdict: type · run (direct / implementer ×N) · worktree · effort raises
   ```
3. Questions and small fixes skip playbooks. Everything else runs a playbook.
4. Delegated units run in parallel only when they share no files and do not depend on each other. Shared contracts are committed first.
5. Review, outside-behavior checks, then completion with evidence, then a local commit. Push and merge requests are asked for.

## Classification

- Small fix: at most two files, no new file, no change to anything another module, service or user can observe, and only copy, styles, constants, comments or typos.
- Bug: behavior differs from a defined one, at any size. Feature: new or deliberately changed behavior. Refactor: same outside behavior, new structure. Perf: only when measurement or speed-up is asked for. Review: judge only. Test hardening: strengthen existing tests.
- Re-classifying upward is automatic and announced. Downward needs the user's OK.

## Delegation

- Logic lines exclude imports, blank lines, whitespace-only changes, pure moves and tests.
- Direct work below five files and 150 logic lines, or when iterating with the user. Otherwise an implementer.
- A verifier reviews when the task has 400+ logic lines or implementers share a contract. Parallel units are reviewed one by one as they finish, then once together.
- The adversarial tester attacks sibling paths and runs mutation checks when behavior changes at implementer size.

## Playbooks and documents

- Each playbook is a skill the main session loads after classifying: `bug`, `feature`, `refactor`, `perf`, `review`, `test-hardening`. They hold only what is specific to that kind of work; the shared rules stay in the hook.
- `spec` runs before features, big refactors and requests that can be read two ways. `sweep` splits many-unit work into non-overlapping units with one commit each.
- Lasting documents are filled as JSON and rendered by a script, so the shape never drifts: `render-doc.mjs` for specs and requests to other teams, `screen-report.mjs` for screen-check results as one HTML page. `plain` is the last pass on any written draft.
- Requests to other teams and screen reports live in the user's notes folder, never in the repository.

## Git

- `commit` works the same on every host. `mr` opens merge requests on GitLab (glab) and pull requests on GitHub (gh) from the repo's title and body conventions. `ci-watch` (GitLab only for now) waits for the pipeline in the background, fixes failures in the session that opened the merge request, stops after the same job fails twice, and never passes a gate by suppressing it.
- After a merge, `cleanup-merged.mjs` lists the local branch, worktree and leftover remote branch, and deletes them only after one yes. It unlinks links inside a worktree first, so deletion cannot follow them into the main checkout.

## When to ask

Stop and ask before anything that leaves the machine or is hard to undo (push, merge, publish, migrations, deletes), when two readings change different files or contracts, when expected behavior is undefined, before skipping verification, and before costly work nobody asked for. Otherwise state the assumption and continue. Subagents never ask; they report open questions.

## Done means

Verify output run after the last change, the diff read, each request item mapped to the diff, no open questions, temporary files and worktrees cleaned, one local commit per unit. Bugs also need failing-before and passing-after output. Missing evidence is reported as "implemented, unverified".

## Writing

No coined terms and no forced translation: keep the English term developers know. Concrete example first, rule after. One idea per sentence. Three answer formats with fixed labels: choice (Options, Fastest, Root fix, Recommend), problem (Symptom, Cause with evidence level, Fix, Expected), scenario (Example, Before → After, Also applies, Unchanged, Why).

## Settings

- `.haechi.json` in the repo: commands (verify, single test, typecheck), forbidden whole-repo commands, test layout, git conventions, worktree setup and teardown, optional risk paths.
- `~/.haechi/user.json`: budget, model overrides, answer formats on or off, and a notes folder for anything that must stay out of the repo (requests to other teams, raw measurements, screen reports, login sessions for screen checks).

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
