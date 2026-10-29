---
name: setup
description: Sets up haechi for this user and this repository — detects execution commands and base/protected branches, asks only what cannot be detected, proves each command runs, and writes .haechi.json. Use for /haechi:setup, when the haechi block says REPO SETUP INCOMPLETE, or when the user asks to set up or refresh haechi.
---

# haechi setup

Detect execution settings, collect the required confirmations once, prove the commands run, then write the settings. Never ask the user for a value you can read from the repo, and never trust a "done" you can check yourself.

Scripts live in the plugin's `tools/` folder, two levels above this skill's folder (`<this skill's folder>/../../tools/`). Run them with `node`. Each prints JSON and changes nothing.

## Collect once

Read existing user settings once. Run `node <tools>/detect.mjs <repo root>` and, when user setup is needed, `node <tools>/check-user.mjs` concurrently. Detection includes the existing `.haechi.json` as `existingSettings`; compare it with the candidates instead of rereading it. Keep explicit settings and unknown custom keys, including optional Git formats, unless the user approves a replacement. If `existingSettings.error` is present, repair the invalid settings with the user before writing; do not treat them as missing.

Reuse these results throughout this setup. Read a source file only when its reported value or source leaves a decision unresolved. Limit `AGENTS.md` discovery to the repository and its ancestor directories; read nested instructions only for paths you will change. Never search the entire home directory for instructions.

Combine machine and repository findings in one draft, using a table when helpful, then ask all outstanding questions in one batch. An answer already given in this session satisfies its confirmation; do not ask again. Tool checks detect installed versions, not install Node or Python. Branch names, commit formats and MR templates are resolved when those operations happen, not investigated during setup.

## A. User setup (once per machine)

Run it when `~/.haechi/user.json` is missing or the user asks.

1. Use the collected `check-user.mjs` result: tools found, logins per host, plugin installed in Claude Code / Codex, Codex hooks trusted.
2. Add these preferences to the combined question batch, each with a recommended default:
   - budget: small / **normal** / large (moves every role's effort one step)
   - notes folder for files that must stay out of repos (requests, raw measurements, screen reports): default `~/.haechi/notes`
   - optional answer-format examples A/B/C: **on** / off (on makes examples available; it does not require their labels or tables)
   - in a terminal only: open screen reports in the browser automatically: **yes** / no
3. Write `~/.haechi/user.json`:
   ```json
   { "budget": "normal", "notesDir": "~/.haechi/notes", "answerFormats": true, "openReports": true, "repos": {} }
   ```
   Model overrides are not asked; people who want them edit the file.
4. If Codex is installed and `codexHooks.missing` is not empty: tell the user to open a new terminal, run `codex`, open `/hooks` and trust the haechi entries. A Codex that was open before the install does not list new hooks. Then recheck the hook trust entries in the Codex config. The hooks count as trusted only when the config says so, not when the user says so. Other successful tool checks do not need to be repeated.

## B. Repo setup (once per repo, again when it changes)

1. **Use the detection result.** Every candidate has a `value` (or null) and a `source`. Setup requires execution commands, test locations, forbidden commands, the sensitive-data rule, Git host, base and protected branches. Do not inspect branch/commit history, MR templates or merged PRs for setup. `git.branch`, `git.commit` and `git.mrTemplate` are optional overrides; preserve existing values and omit them from a new setup unless the user supplied them.
2. **Show the combined draft** with each setting, its value and where it came from. A table is optional. Include machine results when user setup is needed. Mark guesses and unknowns.
3. **Ask only what is unknown or still needs confirmation**, together with user preferences in one batch:
   - sensitive data: patient data / personal data / payment data / none — require user confirmation; quote what `AGENTS.md` already says if it says anything. Reuse a confirmation already given for this repository
   - the forbidden whole-repo commands: confirm or edit the detected list
   - the changed-files verifier: pick among `commands.verifyCandidates`, or the default verifier `node <tools>/verify-default.mjs {files}`
     For Python with the default verifier, use explicit `pythonTestMap` entries to connect source paths to existing test files. A source is an exact file or a directory ending in `/`; `tests` contains Python file paths, not globs or directories. Preserve existing mappings. Infer candidates from the repo, but confirm a test scope that is not established. Unmapped sources remain unverified; never substitute a whole-repository pytest run. The verifier uses the configured `commands.testOne` (which must contain `{file}`) before detected pytest.
   - base and protected branches: confirm
   - any other required item whose value is null
   For backend tests, identify the repository's test database and required services, environment variables and preparation command. Reuse its documented setup. Do not put credentials in `.haechi.json`. Record missing prerequisites as unverified; choosing the verifier does not authorize database creation, migrations or resets. For pip, prove commands inside the intended virtual environment or configure its executable explicitly.
   Optional Python extensions can be configured in the same batch:
   - `frameworks`: save detected `python-django` and/or `python-fastapi` profiles when they apply. Preserve an explicit list, including `[]` to disable guidance. Hooks share the selected profiles with main agents and subagents through `/haechi:python-backend`.
   - `migrations`: use the detected command candidate or the repository's commands, plus `environment: "local"` or `"test"`. The object needs `plan`, `apply` and `check` shell commands. A Django dependency alone is not a runnable management entry point. FastAPI does not imply Alembic; `alembic.ini` supplies a candidate. When several tools are present, choose commands for the intended database. Alembic's candidate `current --check-heads` requires 1.17.1 or newer; for older versions use a repository check that fails when heads are unapplied. Verify the actual target from repository configuration without storing or printing credentials. The environment label is not proof of the destination. `/haechi:migrate` runs the explicit preparation workflow.
   - `docker`: if requested, record an existing Docker `context` and the local provider's `start` and `stop` commands. Docker files only indicate possible use, not an installed daemon or provider. Read contexts and provider help to determine commands; do not install Docker or change the global context. `/haechi:docker` checks readiness and manages the configured daemon.
   These extensions are optional and do not make existing setup incomplete. Preserve their custom commands on reruns. Setup detection and ordinary verification never execute migration application or daemon start/stop. Reuse authorization already given when proving an explicitly requested preparation action; otherwise leave mutation commands unverified.
   Recommended items get a "later" option: dev server command and ports the agent must not use, worktree dependencies (fresh install or link to the main checkout — linking is faster but must be unlinked before the worktree is deleted), spec and measurement record folders, the merge request reviewer (a username, `previous-mr` to reuse the last merged one's, or none), whether CI watching may set auto-merge without asking (`git.autoMerge`). `worktreeTeardown` is an extra shell command run inside a worktree before it is removed. Worktrees are always removed through `cleanup-merged.mjs`, which unlinks every link inside the worktree first, so linked dependencies need no teardown; set it only for other steps (stopping a local database, for example).
4. **Prove each command runs**, on the smallest scope. Plan the checks once so they do not repeat the same work:
   - verify: one relevant file. If the verifier only accepts changed files and the tree is clean, report "runs, checked nothing" (unverified); prove it on the first real change. Do not alter source just to satisfy setup.
     For a Python map, use an existing source file covered by the map and confirm that its test actually runs. Default verifier exit 2 means incomplete verification; exit 1 means a failed check or invalid configuration. A successful lint alone does not prove source behavior.
   - single test: one small existing test file. If the verifier output already proves the configured test runner ran that file with the same options, reuse that evidence. Otherwise run the configured single-test command. Exit 0 with no tests found is unverified.
   - git CLI: logged in for the repo's host. Reuse a successful host result from `check-user.mjs`; otherwise check that host once
   - typecheck: only if it accepts a file argument; a whole-repo typecheck is not run — record it as unverified
   Run independent read-only checks concurrently. Reuse successful output while the command and relevant inputs are unchanged. Re-run after a relevant change or an inconclusive result, not just to repeat a completion checklist. A command that fails gets fixed with the user and run again. If it still fails, leave it empty and report it.
5. **Write `.haechi.json`** at the repo root, then run `node <tools>/check-settings.mjs <repo root>` until it reports `complete: true`. Shape:
   ```json
   {
     "commands": { "verify": "node scripts/verify.mjs {files}", "testOne": "yarn vitest run {file}", "typecheck": null },
     "forbidden": ["yarn test", "yarn lint"],
     "testDirs": ["src/tests"],
     "sensitiveData": "patient data — fixtures are synthetic only",
     "generated": [],
     "devServer": { "command": "yarn dev", "forbiddenPorts": [5173] },
     "worktreeSetup": "yarn install --frozen-lockfile",
     "worktreeTeardown": null,
     "specDir": "docs/{feature}",
     "perf": { "recordsDir": "docs/{area}/perf" },
     "git": {
       "host": "gitlab", "cli": "glab", "base": "develop", "protected": ["develop", "main"],
       "reviewer": "previous-mr", "autoMerge": false
     },
     "riskPaths": []
   }
   ```
   Paths outside the repo (notes, login sessions for screen checks) never go here — they belong in `~/.haechi/user.json`. Refuse a value that points outside the repo and say why.
6. **Sensitive data in AGENTS.md.** If `AGENTS.md` does not state the rule the user gave, add a short section with it. Do not write other judgment rules for the team — point out what is missing instead.
7. **Commit locally through /haechi:commit.** If the current branch is the base or a protected branch, create a setup branch using the session's branch-naming rule first (for example `codex/chore/haechi-setup`). Commit `.haechi.json` and any `AGENTS.md` change in one commit. Push only with user authorization.

## Running it again

Compare the detection result with `existingSettings` and show only changed or missing settings. Preserve hand-edited values, including optional Git formats. Reuse available readings and rerun only checks affected by changed settings, source configuration, dependencies, authentication or hook trust.

Do not invent prior verification evidence from a saved command. If earlier successful output and unchanged relevant inputs cannot be established, mark that check unverified or run the smallest check needed to prove it. An unchanged setting is not proof that its command works. Do not add a cache or timestamp file for setup.

## Report

Report what each setting is now and where it came from, what was proven to run, what was left unverified and why, what the user still has to do.
