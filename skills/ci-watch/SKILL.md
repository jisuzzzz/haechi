---
name: ci-watch
description: Watches a GitLab merge request's CI pipeline in the background, sets auto-merge when allowed, fixes failing jobs in this session and pushes, then cleans up after merge. Use for /haechi:ci-watch, right after /haechi:mr opens an MR, or when the user asks to watch CI or a pipeline.
---

# Watch CI and fix it

The session that opened the MR fixes its CI, because it knows the intent. The tool waits; the session decides and fixes. The ask list and DONE rules are in the session rules.

Approval: watching needs none. The first fix push needs the user's yes, unless the user themself asked to watch CI (/haechi:ci-watch, "watch CI") — continuing here after /haechi:mr on your own does not count, and `git.autoMerge` approves only auto-merge. After one yes, later fix pushes to the same MR are covered.

GitLab only (`git.host` is `gitlab`). On GitHub say that CI watching is not available in v0 yet, and stop.

The haechi tools folder is two levels above this skill's folder (`<this skill's folder>/../../tools/`). Run tools with `node`, from inside the repo.

## 1. Start watching

1. Find the MR iid: the argument, the /haechi:mr result, or `glab mr list --source-branch <current branch>`.
2. Start the watcher with the harness's background mode, so its exit wakes the session. Never poll it yourself.
   ```bash
   node <tools>/watch-pipeline.mjs <iid> --sha <full HEAD sha>
   ```
   `--sha` skips the old head pipeline the MR still shows right after a push. Check that the first output line starts with `WATCHING`.
   With merged results pipelines the pipeline runs on a temporary merge commit, so `--sha <HEAD>` never matches and the watcher exits after 10 minutes with `GIVE_UP` (no pipeline for that sha). If the MR's head pipeline ref is then `refs/merge-requests/<iid>/merge`, rerun it without `--sha`.
3. Auto-merge, only if `git.autoMerge` is `true` or the user said yes when asked once: `glab mr merge <iid> --auto-merge --sha <full sha> --yes`. Set it only after `WATCHING` — before the pipeline exists GitLab merges at once or refuses. Set it again after every fix push, because a failed pipeline can drop it. "Already set" is fine; any other error: tell the user in one line and keep watching.
4. Tell the user in one line that watching started (and whether auto-merge is set), then wait for the exit.

The watcher already retries infrastructure failures (DNS, network, image pull) up to 3 times per job and transient API errors. Do not retry those yourself.

## 2. On exit

| Exit | Line | Do |
|---|---|---|
| 0 | `GREEN …` | Check whether the MR merged (`glab mr view <iid>`). GitLab merges a few seconds after the pipeline passes, so with auto-merge set re-check a few times over about a minute first. Merged → step 5. Not merged → say why (conflict, auto-merge off). |
| 1 | `FAILED <job> …` + trace tail | Step 3. |
| 2 | `GIVE_UP <reason>` | Report the line and stop. If it is an auth failure (401, Unauthenticated), ask the user to log in again (`glab auth login`). |

## 3. Fix a failed job

1. Find the cause in the trace tail. If it is not enough, read the full trace: `glab api projects/:id/jobs/<job id>/trace`.
2. Reproduce locally with the narrowest repo command: map the job to `commands.verify`, `commands.testOne <file>` (only the files the trace names) or `commands.typecheck`. If none fits, read the job's script in the CI config and run the narrowest equivalent. Never run a command listed in `forbidden`.
3. Fix it, run the same local check until it passes, commit by the /haechi:commit rules, push, and go back to step 1 with the new sha.

Forbidden ways to pass — these are bypasses, not fixes:
- new lint-disable comments, `ts-ignore`-style suppressions, type-check baseline entries or similar;
- deleting or skipping tests, or bending assertions to the current behavior;
- loosening CI config or gate scripts, or adding labels that override gates.

The repo's AGENTS.md may list more.

## 4. Stop and report

Stop without fixing, and report the job, the cause, what you tried and why it did not work, when:
- the same job fails again after a fix push — no third try on the same premise;
- only a forbidden way would pass;
- the failure is in code the MR did not touch (suspected flaky) — do not retry or fix it;
- the fix needs a visible-UI or behavior decision.

## 5. After merge

1. From the main checkout run `node <tools>/cleanup-merged.mjs <branch>`. It only lists.
2. Show its to-delete and skipped lines, and ask once — deleting is an ask item.
3. On yes rerun with `--yes` and report the result in one line. Stop any dev servers this task started.

Never run `git worktree remove --force` by hand: links inside a worktree can lead the deletion into the main checkout. The script unlinks them first.
