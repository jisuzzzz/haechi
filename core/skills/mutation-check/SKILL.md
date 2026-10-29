---
name: mutation-check
description: Checks whether tests catch small deliberate breakages in changed lines, and lists the breakages they miss. Use when writing or hardening tests, or when a review asks whether the tests are strong enough.
---

# Mutation check

Run `node <tools>/mutation-check.mjs --file <source> --tests <test files> --test-cmd "<single-test command with {tests}>" [--base <base>] [--limit 20]` (the tools folder is in the task's "[haechi] Repo facts" block, or two levels above this skill's folder; the single-test command is in the same block). Add `--json` for machine-readable output.

It changes one changed line at a time — flips a comparison, swaps `&&` and `||`, flips a boolean, shifts a number by one, drops a call — runs the tests, and restores the file. It refuses to run when the tests already fail. It runs the tests once per mutant, so give the shell a long enough timeout or run it in the background; if a run is killed anyway, the next run restores the file before it starts.

For each **survived** mutant decide:
- **A real gap** — the change alters behavior a user could observe and no test noticed. Strengthen an assertion or add a case that kills it.
- **An equivalent mutant** — the change cannot alter behavior (for example `>=` versus `>` where that boundary value can never arrive). Write down why and leave it.

Each new test must kill a different mutant or cover a different path. Never weaken a test, never edit the source to make a mutant die, and do not chase equivalent mutants. Report mutants killed, survived and equivalent, before and after your changes.
