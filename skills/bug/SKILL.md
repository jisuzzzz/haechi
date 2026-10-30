---
name: bug
description: Bug playbook — reproduce, find the first wrong decision, pin it with a failing test, fix at the cause, prove failing-before and passing-after. Use for /haechi:bug, when behavior differs from a defined one, or when a request is unclear ("it's weird", "it's broken") and needs reproduction first.
---

# Bug playbook

The main session runs these steps. Scope, delegation, authorization and completion requirements are in the session rules; this file adds only what is specific to bugs. Principle files are two levels above this skill's folder (`<this skill's folder>/../../principles/<name>.md`): read **root-cause**, **attack-the-premise** and **failing-test-first** before step 3.

## Task focus

Establish the symptom and the exact conditions that trigger it. Example: "`formatDate('2024-02-29')` returns `Mar 1` when the user's time zone is UTC-5."
The easy mistake is assuming the expected behavior was ever defined. Use the conversation, docs, tests, a crash or wrong data to establish it. If a consequential behavior choice remains undefined, ask about that choice; reversible implementation choices do not require approval.

## Steps

1. **Clarify the task.** Establish the symptom, trigger conditions, expected behavior and nearby behavior that must stay unchanged. Use a summary only when useful; fixed labels and tables are optional. Plan to show the reproduction test failing before and passing after.
   If the request deliberately changes established behavior, use /haechi:feature. Ask only when evidence and the user's instructions cannot settle a consequential expectation.
2. **Reproduce.** Use the smallest rung that shows the bug: unit test, then component test, then the repo's screen helper, then manual steps. Add a positive control — a case on the same path that should pass — so you know the reproduction actually ran the buggy path. Try relevant available conditions while useful investigation remains.
   Leave: the reproduction command and its failing output. A failed attempt calls for reassessment; ask for missing conditions when they block progress, and list what you ruled out. Do not claim a reproduction you did not obtain.
3. **Trace the cause.** Find the first wrong decision using real values and logs, not guesses. If the state is legitimate, the cause is the code that cannot handle it. If the state is wrong, the cause is where it was produced. A bug that appears only after a restart points at persisted state. For a library, read its source; patching the library is not the default fix. Name the root cause even if a recorded decision says "don't touch" that area.
   Leave: the cause, its evidence and what remains uncertain.
4. **Choose the fix.** Choose the smallest fix at the cause within the authorized scope. Explain meaningful trade-offs; ask only when alternatives require a consequential behavior or scope decision the user has not settled.
5. **Search for the same pattern.** Look for the same cause elsewhere. Same cause: include it in this fix. Different cause: ask whether to record it as an issue.
6. **Write the failing test (main session).** You write it, not an implementer. Pin the reproduction as a test and confirm it fails for the intended reason, not a typo or a missing import.
   Leave: the failing output. If a test is impossible, write why and the replacement check.
7. **Fix at the cause.** Smallest change at the cause. Main or implementer by the delegation rules. An implementer only makes your failing test pass; give it the test path. No try/catch, clamp, retry or default value at the symptom site — only when step 3 showed the state is legitimate.
8. **Verify and attack.** The failing test passes, then repo verify. Check sibling paths (`/haechi:sibling-path-map`); use adversarial-tester when independent context would help challenge a risky or complex fix. Review with /haechi:review-diff, using a verifier when independent review adds value.
   Leave: the passing output.
9. **Finish.** Local commit. Report the cause, the changed behavior and the verification evidence.
10. **Propose recurrence prevention.** If the cause took deep digging to find, propose an always-on signal (a log line, a lint rule, a type). Propose only; do not build it.

## When stuck

- Two fixes on the same premise failed: write the premise down and test it directly before a third fix (attack-the-premise).
- Repeatedly rejected hypotheses: reassess the premise and summarize what was ruled out, the evidence and the next direction. Continue meaningful independent investigation within the authorized scope. Ask when progress requires unavailable reproduction data, access, a consequential decision or additional costly work that was not authorized.
- A real bug you will not fix in this task: record it the repo's way of recording a known bug (AGENTS.md); if none, ask.

## Extra DONE evidence

Failing output before the fix and passing output after it, from the same test. If that is impossible, say why and show the replacement check.
