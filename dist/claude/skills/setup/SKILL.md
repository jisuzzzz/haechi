---
name: setup
description: Sets up haechi for this user and this repository — detects commands and git conventions, asks only what cannot be detected, proves each command runs, and writes .haechi.json. Use for /haechi:setup, when the haechi block says REPO SETUP INCOMPLETE, or when the user asks to set up or refresh haechi.
---

# haechi setup

Detect what you can, ask only what you cannot, prove every command runs, then write the settings. Never ask the user for a value you can read from the repo, and never trust a "done" you can check yourself.

Scripts live in the plugin's `tools/` folder, two levels above this skill's folder (`<this skill's folder>/../../tools/`). Run them with `node`. Each prints JSON and changes nothing.

## A. User setup (once per machine)

Run it when `~/.haechi/user.json` is missing or the user asks.

1. Run `node <tools>/check-user.mjs`. Show the result as a short table: tools found, logins per host, plugin installed in Claude Code / Codex, Codex hooks trusted.
2. Ask in one screen, each with a recommended default:
   - budget: small / **normal** / large (moves every role's effort one step)
   - notes folder for files that must stay out of repos (requests, raw measurements, screen reports): default `~/.haechi/notes`
   - answer formats A/B/C: **on** / off
   - in a terminal only: open screen reports in the browser automatically: **yes** / no
3. Write `~/.haechi/user.json`:
   ```json
   { "budget": "normal", "notesDir": "~/.haechi/notes", "answerFormats": true, "openReports": true, "repos": {} }
   ```
   Model overrides are not asked; people who want them edit the file.
4. If Codex is installed and `codexHooks.missing` is not empty: tell the user to open a new terminal, run `codex`, open `/hooks` and trust the haechi entries. A Codex that was open before the install does not list new hooks. Then run `check-user.mjs` again — the hooks count as trusted only when the config says so, not when the user says so.

## B. Repo setup (once per repo, again when it changes)

1. **Detect.** Run `node <tools>/detect.mjs <repo root>`. Every field has a `value` (or null) and a `source`.
   - If `git.mrTemplate` is null, read the descriptions of the last 10 merged merge requests (`glab mr list --merged` / `gh pr list --state merged`, then view each) and take the headings most of them share.
2. **Show the draft** as one table: setting, value, where it came from. Mark guesses.
3. **Ask only what is unknown or must be confirmed**, required items in one screen:
   - sensitive data: patient data / personal data / payment data / none — always ask; quote what `AGENTS.md` already says if it says anything
   - the forbidden whole-repo commands: confirm or edit the detected list
   - the changed-files verifier: pick among `commands.verifyCandidates`, or the default verifier `node <tools>/verify-default.mjs {files}`
   - base and protected branches: confirm
   - any other required item whose value is null
   Recommended items get a "later" option: dev server command and ports the agent must not use, worktree dependencies (fresh install or link to the main checkout — linking is faster but must be unlinked before the worktree is deleted), spec and measurement record folders, the merge request reviewer (a username, `previous-mr` to reuse the last merged one's, or none), whether CI watching may set auto-merge without asking (`git.autoMerge`). `worktreeTeardown` is an extra shell command run inside a worktree before it is removed. Worktrees are always removed through `cleanup-merged.mjs`, which unlinks every link inside the worktree first, so linked dependencies need no teardown; set it only for other steps (stopping a local database, for example).
4. **Prove each command runs**, on the smallest scope:
   - single test: one small existing test file
   - verify: one changed file. Many verifiers check only files that differ from HEAD; on a clean tree they exit 0 having checked nothing. Report that as "runs, checked nothing" (unverified), not as proven — prove it later on the first real change.
   - git CLI: logged in for the repo's host
   - typecheck: only if it accepts a file argument; a whole-repo typecheck is not run — record it as unverified
   A command that fails gets fixed with the user and run again. If it still fails, leave it empty and report it.
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
       "branch": "{type}/{slug}", "commit": "en: type(scope): summary", "mrTemplate": ["## Summary", "## Changes"],
       "reviewer": "previous-mr", "autoMerge": false
     },
     "riskPaths": []
   }
   ```
   Paths outside the repo (notes, login sessions for screen checks) never go here — they belong in `~/.haechi/user.json`. Refuse a value that points outside the repo and say why.
6. **Sensitive data in AGENTS.md.** If `AGENTS.md` does not state the rule the user gave, add a short section with it. Do not write other judgment rules for the team — point out what is missing instead.
7. **Commit locally.** If the current branch is the base or a protected branch, create `chore/haechi-setup` first. Commit `.haechi.json` and any `AGENTS.md` change in one commit. Pushing is the user's call: ask.

## Running it again

Detect again, compare with the existing `.haechi.json`, and show only the settings that changed. Keep values the user edited by hand unless they agree to replace them.

## Report

Use the scenario format: what each setting is now and where it came from, what was proven to run, what was left unverified and why, what the user still has to do.
