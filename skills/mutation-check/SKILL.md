---
name: mutation-check
description: Use when asked to strengthen tests or check their ability to detect defects, or when a specific concern suggests an incorrect implementation could still pass. Introduces small deliberate defects in relevant code and checks which ones the tests detect. Writing a test alone does not require a mutation check.
---

# Mutation check

Apply the [common work contract](../../principles/work-contract.md) within this task’s scope. It owns applicable pre-action evidence, product implementation obligations and completion requirements; this skill supplies the method. Current common guidance already delivered or read may be reused.

Choose the relevant code and tests from the suspected coverage gap, such as a boundary condition, branch or failure path. Before a refactor, use it when the existing tests' ability to protect behavior is uncertain, regardless of change size. A reproduced bug that fails before the fix and passes after does not by itself require another mutation run. Follow explicit mutation requirements in assigned attack-test or test-hardening work; ordinary test writing does not require this extra step.

Run `node <tools>/mutation-check.mjs --file <source> --tests <test files> --test-cmd "<single-test command with {tests}>" [--base <base>] [--limit 20]` (the tools folder is in the task's "[haechi] Repo facts" block, or two levels above this skill's folder; the single-test command is in the same block). Add `--json` for machine-readable output.

Which lines it mutates: by default the lines of `--file` changed against `--base` (default `HEAD`), so a committed file with no new edits gets no mutants. After committing, pass `--base <the commit before the change>`. To harden tests of existing code, pass `--lines 1-<last line>` (or a range) and use the same lines for the before and after runs.

It changes one changed line at a time — flips a comparison, swaps `&&` and `||`, flips a boolean, shifts a number by one, drops a call — runs the tests, and restores the file. It refuses to run when the tests already fail. It runs the tests once per mutant, so give the shell a long enough timeout or run it in the background; if a run is killed anyway, the next run restores the file before it starts.

**Killed** means the command failed with the mutant in place. An assertion failure, parse error, import error or runner failure can all produce that status. It does not independently prove an assertion caught the changed behavior. Failed runs include the last 4,000 characters of combined output, the exit code, signal and any spawn error in both text and JSON reports. Read that evidence before counting a killed mutant as test coverage. The tool does not parse runner output or count executed tests.

For each **survived** mutant decide:
- **A real gap** — the change alters behavior a user could observe and no test noticed. Strengthen an assertion or add a case that kills it.
- **An equivalent mutant** — the change cannot alter behavior (for example `>=` versus `>` where that boundary value can never arrive). Write down why and leave it.

Each new test must kill a different mutant or cover a different path. Never weaken a test, never edit the source to make a mutant die, and do not chase equivalent mutants. Report mutants killed, survived and equivalent, before and after your changes.
