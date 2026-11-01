---
name: evidence-levels
---

## Do
Say how strong each claim is: 1 stated, 2 pointed to file:line, 3 traced the failing path step by step, 4 ran a script or test, 5 reproduced in the running app. Push the facts that matter to 3 or higher.

Match the evidence to the claim. A command exiting successfully proves execution, not that tests ran or a required behavior passed. Inspect the actual assertions or interaction and expected versus observed result. Name the checked change and relevant environment; earlier results cannot prove behavior affected by later edits. A fixture or simulation proves only what it exercised, not live host or service integration.

Use passed, failed, unverified or needs decision for required checks. Missing evidence is unverified, not a pass; an undefined expectation needs a decision, not an invented test. Preserve partial results and the scope of each claim. Choose evidence suited to the behavior without adding unrelated tests, documents or mandatory reviewers.

## Check
A defect needs level 3 or higher: a failing path traced to a wrong result, a sibling rule missing with both locations quoted, a contract mismatch with both sides quoted, or execution output. Below that it is an open question.

Flag success claims based only on exit codes, test names, worker verdicts, zero executed tests, skipped required checks or results predating an affected change. Check the assertions against the requirements. "No defects found" is bounded by the inspected scope, not proof of correctness. Missing proof and observed failure must remain distinct.
