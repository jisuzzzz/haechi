---
name: mr
description: Opens a merge request (GitLab, glab) or pull request (GitHub, gh) for the current branch — title and body in the repo's format, reviewer and assignee set, then CI watching on GitLab. Use for /haechi:mr, when the user asks for an MR or PR, or at the end of a playbook once the work is committed.
---

# Merge request

Settings come from `.haechi.json` → `git`: `host`, `cli`, `base`, `commit`, `mrTemplate`, `reviewer`, `autoMerge`. "MR" below means a GitLab merge request or a GitHub pull request. The ask list is in the session rules; this file adds only what is specific to MRs.

## 0. Approval

- The user asked for the MR ("/haechi:mr", "open an MR"): that approves pushing the branch and creating this MR. Do not ask again.
- You reached this step on your own, at the end of a playbook: ask first. Show the branch, the target, the title and the reviewer.
- Visible UI changes: the session rules require showing the screen to the user before the push. Check that it happened. If not, do that first.

## 1. Analyze

Run these together (`<base>` is `git.base`):

```bash
git branch --show-current
git log <base>..HEAD --oneline
git diff <base>...HEAD --stat
```

Read `git diff <base>...HEAD` where the log and stat are not enough to describe the change.

## 2. Title and body

- Title: honor explicit repository instructions and `git.commit` when set. Otherwise follow the commit subjects collected in Analyze; with no established format, use a concise description of the change. Example: `fix(orders): keep the time zone when formatting due dates`.
- Body: honor explicit repository instructions. Use the headings in an existing `git.mrTemplate` override, in that order. Without an override, read the repository's PR/MR template when preparing this MR: GitHub templates under `.github/`, the root or `docs/`; GitLab templates under `.gitlab/merge_request_templates/`. Follow the template's instructions, not just its headings. If several templates apply and repository guidance does not choose one, ask which one to use.
- Without an override or repository template, use `## Summary`, `## Changes` and `## Validation`. State why the change is needed, what changes and how it was checked. Drop a section only if the selected template marks it optional and it has no content.
- Do not scan merged PR/MR history to infer a body format unless the user asks to match previous requests. Missing format settings do not require setup.
- Group changes by module or area, not by file. Example: one bullet group for `src/orders/` and one for `src/api/orders.ts`, each bullet one change.
- Closing keyword: if the branch name, a commit or the conversation names an issue the change resolves, add `Closes #12`. Partly addresses it: `Related to #12`.
- Run /haechi:plain on the body.
- Append the attribution footer the environment asks for, if any.

## 3. Before creating

- Push the branch: `git push -u origin <branch>`. This is part of the user's MR request.
- Look for an MR on this branch: `glab mr list --source-branch <branch>` or `gh pr list --head <branch>`. One exists: update it instead of opening a second one. Ask before you overwrite its description.
- Reviewer from `git.reviewer`:
  - a username: use it.
  - `previous-mr`: take the reviewer of the most recent merged MR into the base, and say which MR you took it from. GitLab: `glab mr list --merged --target-branch <base> --order merged_at --sort desc`, then `glab mr view <iid>` on the first one. GitHub: `gh pr list --state merged --base <base> --limit 1 --json number,reviewRequests,latestReviews`.
  - absent: no reviewer.
- Assignee: the current user. GitLab: `glab api user` gives the username. GitHub: `--assignee @me`.

## 4. Create

Write the body to a file in a temp folder outside the repo, or pass it through a single-quoted heredoc in a POSIX shell. PowerShell can corrupt non-ASCII arguments to native programs.

GitLab:

```bash
glab mr create --source-branch <branch> --target-branch <base> \
  --title '<title>' --description "$(cat <body-file>)" \
  --reviewer <reviewer> --assignee <username> \
  --remove-source-branch --yes
```

GitHub:

```bash
gh pr create --base <base> --head <branch> --title '<title>' \
  --body-file <body-file> --reviewer <reviewer> --assignee @me
```

On GitHub, deleting the branch after merge is a repository setting, or `gh pr merge --delete-branch`. Say so in one line.

No reviewer: leave out `--reviewer`.

A flag is rejected: read `glab mr create --help` or `gh pr create --help`. Do not guess.

## 5. After creating

- Give the MR URL.
- GitLab: continue with /haechi:ci-watch <iid> to watch the pipeline, and to set auto-merge when `git.autoMerge` is true. Pushing fixes follows ci-watch's approval rule.
- GitHub: CI watching is not available yet. Say so in one line.
