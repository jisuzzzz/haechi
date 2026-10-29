---
name: bug
description: Bug playbook — reproduce, find the first wrong decision, pin it with a failing test, fix at the cause, prove failing-before and passing-after. Use for /haechi:bug, when behavior differs from a defined one, or when a request is unclear ("it's weird", "it's broken") and needs reproduction first.
---

# Bug playbook

The main session runs these steps. Classification, delegation, the ask list and the DONE rules are in the session rules; this file adds only what is specific to bugs. Principle files are two levels above this skill's folder (`<this skill's folder>/../../principles/<name>.md`): read **root-cause**, **attack-the-premise** and **failing-test-first** before step 3.

## Restatement focus

The key line is **Current**: the symptom and the exact conditions that trigger it. Example: "Current: `formatDate('2024-02-29')` returns `Mar 1` when the user's time zone is UTC-5."
The easy mistake is assuming the expected behavior was ever defined. A bug needs evidence that it was: a doc, a spec, a test, a crash, or wrong data. With no evidence it is an improvement — re-classify to /haechi:feature and ask for the expected behavior.

## Steps

1. **Restate.** Current = symptom and trigger conditions. Target = the defined behavior and its evidence. Keep = the behavior around it. Proof = the reproduction test fails before and passes after.
   Move on when Target has evidence. Without evidence, re-classify upward and ask.
2. **Reproduce.** Use the smallest rung that shows the bug: unit test, then component test, then the repo's screen helper, then manual steps. Add a positive control — a case on the same path that should pass — so you know the reproduction actually ran the buggy path. Try every environment you can reach before asking.
   Leave: the reproduction command and its failing output. If it does not reproduce, ask for conditions and list what you ruled out.
3. **Trace the cause.** Find the first wrong decision using real values and logs, not guesses. If the state is legitimate, the cause is the code that cannot handle it. If the state is wrong, the cause is where it was produced. A bug that appears only after a restart points at persisted state. For a library, read its source; patching the library is not the default fix. Name the root cause even if a recorded decision says "don't touch" that area.
   Leave: format B (problem), with the evidence level in Cause.
4. **Choose the fix.** Write Fix in format A (choice). If Fastest equals Root fix, go on. If they differ, ask the user.
5. **Search for the same pattern.** Look for the same cause elsewhere. Same cause: include it in this fix. Different cause: ask whether to record it as an issue.
6. **Write the failing test (main session).** You write it, not an implementer. Pin the reproduction as a test and confirm it fails for the intended reason, not a typo or a missing import.
   Leave: the failing output. If a test is impossible, write why and the replacement check.
7. **Fix at the cause.** Smallest change at the cause. Main or implementer by the delegation rules. An implementer only makes your failing test pass; give it the test path. No try/catch, clamp, retry or default value at the symptom site — only when step 3 showed the state is legitimate.
8. **Verify and attack.** The failing test passes, then repo verify. Sibling paths: at direct size the main session checks them (`/haechi:sibling-path-map`); at implementer size run adversarial-tester. Review by the main session with /haechi:review-diff, or verifier when the session rules call for it.
   Leave: the passing output.
9. **Finish.** Local commit. Report the cause in format B and the changed behavior in format C (scenario).
10. **Propose recurrence prevention.** If the cause took deep digging to find, propose an always-on signal (a log line, a lint rule, a type). Propose only; do not build it.

## When stuck

- Two fixes on the same premise failed: write the premise down and test it directly before a third fix (attack-the-premise).
- Three hypotheses rejected: stop and send an interim report in format B with:
  - ruled out — each hypothesis and how you checked it;
  - remaining candidates and the next direction;
  - questions — continue or change direction, and can the user give more reproduction data or an environment.
- A real bug you will not fix in this task: record it the repo's way of recording a known bug (AGENTS.md); if none, ask.

## Extra DONE evidence

Failing output before the fix and passing output after it, from the same test. If that is impossible, say why and show the replacement check.
