---
name: bug
description: Bug playbook — reproduce, find the first wrong decision, pin it with a failing test, fix at the cause, prove failing-before and passing-after. Use for /haechi:bug, when behavior differs from a defined one, or when a request is unclear ("it's weird", "it's broken") and needs reproduction first.
---

# Bug playbook

The main session owns this workflow. For a delegated step, follow /haechi:delegate for agent selection and complete packet delivery: objective, relevant evidence, ownership, constraints and required task skills. Keep later stage decisions and integration in the main session; do not give an agent the whole playbook to restart.

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
4. **Choose the fix.** Default to the smallest fix at the cause within the authorized scope. Use **Choosing where to fix** below to explain meaningful alternatives before implementation. Ask only for an unsettled consequential behavior or scope decision; changing persisted data representation requires explicit authorization, which may already be present in the conversation.
5. **Search for the same pattern.** Look for the same cause elsewhere. For a cause fix, include affected uses within the authorized scope. For deliberately limited containment, identify the uses left exposed instead of silently expanding the chosen fix. Revisit the choice if this search changes its coverage or cost. Different cause: ask whether to record it as an issue.
6. **Write the failing test (main session).** You write it, not an implementer. Pin the reproduction as a test and confirm it fails for the intended reason, not a typo or a missing import.
   Leave: the failing output. If a test is impossible, write why and the replacement check.
7. **Implement the chosen fix.** Make the smallest change for the selected scope, normally at the cause. Main or a worker with /haechi:implement-work through /haechi:delegate. An implementer makes your failing test pass; give it the test path, chosen fix, coverage and known remaining exposure. A try/catch, clamp, retry or default value at the symptom site needs either evidence that the state is legitimate or the explicit containment rationale from step 4. Do not describe containment as removing the cause.
8. **Verify and attack.** The failing test passes, then repo verify. Check sibling paths (`/haechi:sibling-path-map`); use a worker with /haechi:attack-tests when independent context would help challenge a risky or complex fix. Review with /haechi:review-diff, using a separate worker with /haechi:verify-work when independent review adds value.
   Leave: the passing output.
9. **Finish.** Local commit. Report the cause, the changed behavior and the verification evidence.
10. **Propose recurrence prevention.** If the cause took deep digging to find, propose an always-on signal (a log line, a lint rule, a type). Treat additional contract tests, lint rules and runtime assertions as supplements to the chosen fix, not another fix location. Detection does not expand what the fix corrects. Propose these additions only; do not build them without authorization. The reproduction and verification tests above remain required.

## Choosing where to fix

Describe the concrete code or behavior being changed in the user's language. Choose a primary fix location; these are alternatives, not maturity levels or a sequence to perform. Explain any necessary supporting changes.

| Where to change | What it does | Limits to explain |
| --- | --- | --- |
| Only the reported action | For example, clear sorting when the tab button is clicked. | Other actions with the same cause remain exposed. This may be cheapest, but estimate from the actual change. |
| The code responsible for the cause (default) | Fix the first wrong decision: the producer of invalid state, or the consumer that mishandles legitimate state. | Check other uses of the same cause and name the covered scope. |
| A shared processing point | For example, reject sorting unavailable on the current tab when building a request. Useful when several producers cannot reasonably be fixed together. | Coverage depends on every relevant action passing through this point. Check bypasses and effects of invalid state that remains inside the application; future actions are covered only if they also pass through it. |
| Data representation or ownership | For example, store sorting separately for each tab so this class of state mixing cannot occur. | Explain compatibility, migration, behavior changes and expanded scope. Obtain explicit authorization before changing persisted representation; do not ask again for an already authorized change. |

When fixing the reported action also fixes the cause, briefly explain and proceed within the authorized scope. When the locations have meaningfully different outcomes, present only two or three feasible options, comparing the same axes: covered behavior, estimated effort, remaining exposure, and changes to persisted data or observable behavior. Recommend one and explain why. Do not invent alternatives or treat a larger redesign as inherently better. Comparing options alone does not require pausing; ask when the choice needs an unresolved consequential behavior or scope decision.

If fixing now is unsuitable, explain the option to defer and record the issue. If another team or a library owns the cause, propose an upstream request with the evidence and expected contract; sending it needs authorization. A local library patch such as `patch-package` is not the default. State what remains unresolved for either choice.

## When stuck

- For ambiguous causes, component boundaries, test pollution, races or flaky tests, [investigation techniques](references/investigation.md) offers optional probes. Read only the relevant part when useful; it is not another required stage.
- Two fixes on the same premise failed: write the premise down and test it directly before a third fix (attack-the-premise).
- Repeatedly rejected hypotheses: reassess the premise and summarize what was ruled out, the evidence and the next direction. Continue meaningful independent investigation within the authorized scope. Ask when progress requires unavailable reproduction data, access, a consequential decision or additional costly work that was not authorized.
- A real bug you will not fix in this task: record it the repo's way of recording a known bug (AGENTS.md); if none, ask.

## Extra DONE evidence

Failing output before the fix and passing output after it, from the same reproduction test, failing for the bug rather than a setup or import error. If a test is impossible, explain why and show the same trigger failing before and producing the expected result after through a direct executable check. Without that proof, report the fix as unverified rather than successful. Include the relevant nearby behavior checks on the final change.

## Delegation contracts

These references are the authoritative requirements for delegated steps in this playbook, not a mandatory agent sequence. The main session fills the named context fields and task-specific acceptance criteria; detailed procedures and principle bodies stay in their referenced files. `read-only` means repository files remain unchanged; authorized temporary or report outputs must be named separately in `artifactPaths`.

```haechi-handoffs
{
  "implement": {
    "skills": [
      "implement-work"
    ],
    "principles": [
      "dry",
      "yagni",
      "kiss",
      "boundary-validation",
      "root-cause",
      "failing-test-first",
      "behavior-tests"
    ],
    "checks": [],
    "writeScope": "scoped",
    "contextRequired": [
      "repository",
      "requirements",
      "reproduction",
      "ownership"
    ],
    "completion": [
      "Run the supplied reproduction before and after a bug fix.",
      "Check each required outcome on the final change and report gaps."
    ]
  },
  "attack": {
    "skills": [
      "attack-tests",
      "sibling-path-map",
      "mutation-check"
    ],
    "principles": [
      "sibling-paths",
      "behavior-tests"
    ],
    "checks": [],
    "writeScope": "scoped",
    "contextRequired": [
      "repository",
      "requirements",
      "changedFiles",
      "ownership"
    ],
    "completion": [
      "Demonstrate that tests detect the targeted defects without weakening expected behavior."
    ]
  },
  "review": {
    "skills": [
      "verify-work",
      "review-diff",
      "impact-map"
    ],
    "principles": [
      "evidence-levels",
      "behavior-tests"
    ],
    "checks": [
      "agent-defects",
      "sibling-paths",
      "dry",
      "yagni",
      "kiss"
    ],
    "writeScope": "read-only",
    "contextRequired": [
      "repository",
      "requirements",
      "base",
      "changedFiles",
      "priorEvidence"
    ],
    "completion": [
      "Report concrete defects with expected and observed behavior and affected consumers.",
      "Distinguish passing checks, failures, missing proof and unresolved expectations."
    ]
  }
}
```
