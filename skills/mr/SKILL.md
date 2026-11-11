---
name: mr
description: Opens a merge request (GitLab, glab) or pull request (GitHub, gh) for the current branch — title and body in the repo's format, reviewer and assignee set, then CI watching on GitLab. Use for /haechi:mr, when the user asks for an MR or PR, or at the end of a playbook once the work is committed.
---

# Merge request

Follow the repository instructions and templates. "MR" below means a GitLab merge request or a GitHub pull request.

## 0. Approval

- The user asked for the MR ("/haechi:mr", "open an MR"): that approves pushing the branch and creating this MR. Do not ask again.
- You reached this step on your own, at the end of a playbook: ask first. Show the branch, the target, the title and the reviewer.
- Visible UI changes: the session rules require showing the screen to the user before the push. Check that it happened. If not, do that first.

## 1. Analyze

Resolve the host and target before these commands. Honor the user’s target and the repository instructions. For missing values, inspect the remote URL (`git remote -v`) and local remote HEAD (`git symbolic-ref --short refs/remotes/origin/HEAD`). Use the host's CLI to confirm its project/default branch when needed. Ask only when the host or intended target remains ambiguous. Check authentication for the selected host now, reusing current successful evidence.

Run these together (`<base>` is the resolved target):

```bash
git branch --show-current
git log <base>..HEAD --oneline
git diff <base>...HEAD --stat
```

Read `git diff <base>...HEAD` where the log and stat are not enough to describe the change.

## 2. Title and body

- Title: honor the repository instructions. Otherwise follow the commit subjects collected in Analyze; with no established format, use a concise description of the change. Example: `fix(orders): keep the time zone when formatting due dates`.
- Body: honor the repository instructions and read the applicable PR/MR template: GitHub templates under `.github/`, the root or `docs/`; GitLab templates under `.gitlab/merge_request_templates/`. Follow the template's instructions, not just its headings. If several templates apply and repository guidance does not choose one, ask which one to use.
- If neither repository instructions nor a template specifies a format, use `## Summary`, `## Changes` and `## Validation`. State why the change is needed, what changes and how it was checked. Drop a section only if the selected template marks it optional and it has no content.
- Do not scan merged PR/MR history to infer a body format unless the user asks to match previous requests.
- Group changes by module or area, not by file. Example: one bullet group for `src/orders/` and one for `src/api/orders.ts`, each bullet one change.
- Closing keyword: if the branch name, a commit or the conversation names an issue the change resolves, add `Closes #12`. Partly addresses it: `Related to #12`.
- Apply the common writing rules to the body; consult the [clear-writing principle](../../principles/clear-writing.md) as needed.
- Append the attribution footer the environment asks for, if any.

## 3. Before creating

- Push the branch: `git push -u origin <branch>`. This is part of the user's MR request.
- Look for an MR on this branch: `glab mr list --source-branch <branch>` or `gh pr list --head <branch>`. One exists: update it instead of opening a second one. Ask before overwriting its description unless the user's request already authorizes that update.
- Resolve the reviewer from the user request or repository instructions:
  - a username: use it.
  - If explicitly directed to use the previous MR reviewer, take the reviewer of the most recent merged MR into the base, and say which MR you took it from. GitLab: `glab mr list --merged --target-branch <base> --order merged_at --sort desc`, then `glab mr view <iid>` on the first one. GitHub: `gh pr list --state merged --base <base> --limit 1 --json number,reviewRequests,latestReviews`.
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
- GitLab: continue with /haechi:ci-watch <iid> to watch the pipeline, and set auto-merge if the repository instructions or the user authorize it. Pushing fixes follows ci-watch's approval rule.
- GitHub: CI watching is not available yet. Say so in one line.
