---
name: commit
description: Commits the current task's changes locally — stages only owned files, writes the message in the repo's format, lets pre-commit hooks run. Use for /haechi:commit, when a unit of work is done and needs its local commit, or when the user asks to commit.
---

# Commit

Works with git on any host. Settings come from `.haechi.json` → `git`. The ask list and the DONE rules are in the session rules; this file adds only what is specific to committing.

## 1. Review

Run these together:

```bash
git status
git diff --staged
git diff
git log --oneline -10
```

No changes: say so and stop.

## 2. Stage

- Stage only the files the current task owns, by name: `git add src/orders/formatDate.ts test/orders/formatDate.test.ts`. Never `git add -A` or `git add .` without reading the status first — the tree can hold another session's work.
- Never stage secrets: `.env` files, keys, tokens, credentials. If one shows up in the diff, leave it out and tell the user.
- Files already staged that the task does not own may be another session's: do not unstage them. Commit only your paths instead (`git commit -F - -- <your files>`) and say so.
- Note every changed file you leave unstaged and the reason. You report it at the end.

## 3. Message

- Format and language come from `git.commit`. Example: `en: type(scope): summary` gives `fix(orders): keep the time zone when formatting due dates`. No `git.commit`: copy the style of the recent log.
- The subject says what changed. The body is optional and says why.
- One commit per unit of work. Split only when the kinds of diff differ — a file move and a behavior change go in separate commits, as the refactor playbook says (/haechi:refactor).
- End with the attribution trailer the environment asks for, if any.
- Pass the message through a single-quoted heredoc in a POSIX shell. PowerShell can corrupt non-ASCII arguments to native programs.

```bash
git commit -F - <<'EOF'
fix(orders): keep the time zone when formatting due dates

formatDate dropped the offset, so orders due at 23:30 showed the next day.
EOF
```

## 4. Hooks

- pre-commit hooks run. Never pass `--no-verify`.
- A hook fails: read its output, fix the cause, stage the fix and commit again. The commit did not happen, so this is a new commit, not an amend.
- A hook changes files (a formatter, for example) and the commit stops: stage those files and commit again.
- Never amend a commit that is already pushed.

## 5. After the commit

- Push only when the user asks. Pushing is an ask item.
- Merging into the base or a protected branch is not part of this skill. Merge requests go through /haechi:mr.

## Report

- The commit hash and subject, one line per commit.
- What stayed uncommitted, each file with the reason (another task's file, a secret, generated output).
