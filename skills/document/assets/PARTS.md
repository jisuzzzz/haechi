# Common Part requirements and review responsibilities

Parts define the information and responsibilities needed. Choose the reading order for the document’s purpose; do not append Parts in numeric order. If there is material to cite, collect it in P03 at the very end. Existing documents are not required, and missing evidence must not be invented. Place document details, actual decisions and human confirmation after the body. Consult this index and individual Parts for authoring and review guidance.

## Table of contents

- [1. P01 Summary](#1-p01-summary)
- [2. P02 Document identity and status](#2-p02-document-identity-and-status)
- [3. P03 Evidence notes](#3-p03-evidence-notes)
- [4. P04 Problem and desired outcome](#4-p04-problem-and-desired-outcome)
- [5. P05 Requests and questions](#5-p05-requests-and-questions)
- [6. P06 Causes and hypotheses](#6-p06-causes-and-hypotheses)
- [7. P07 External behavior contract](#7-p07-external-behavior-contract)
- [8. P08 Implementation options](#8-p08-implementation-options)
- [9. P09 Impact and migration](#9-p09-impact-and-migration)
- [10. P10 Acceptance criteria and verification plan](#10-p10-acceptance-criteria-and-verification-plan)
- [11. P11 Owning team reply](#11-p11-owning-team-reply)
- [12. P12 Decisions and corrections](#12-p12-decisions-and-corrections)
- [13. P13 Implementation handoff and executed verification](#13-p13-implementation-handoff-and-executed-verification)
- [14. P14 Human review record](#14-p14-human-review-record)
- [15. P15 Visual material](#15-p15-visual-material)
- [16. P16 Performance and scale](#16-p16-performance-and-scale)
- [17. P17 Asynchronous processing and state](#17-p17-asynchronous-processing-and-state)
- [18. P18 Permissions and policy](#18-p18-permissions-and-policy)

## 1. [P01 Summary](parts/P01-summary.md)

**Required for all types.** Helps the reader identify the problem and the judgment needed at the start. Placement: The relevant discussion in the body.

Author: Request or handoff author. Reviewer: Authoring-side owner. If a reply changes the status, the team owning that fact also confirms it. Check: Do the problem, required answer, settled and open matters, and next action match the state in the body?

## 2. [P02 Document identity and status](parts/P02-identity.md)

**Required for all types.** Places the document details at the end. Placement: Document and review records after the body.

Author: Document owner. Reviewer: Document owner and the people who can confirm each status. Check: Do not turn missing owner information into an assertion that no owner is assigned. Use unassigned only when nonassignment is confirmed. Are the current author, scope, version and status clear? Are previous documents and document IDs linked only when they exist?

## 3. [P03 Evidence notes](parts/P03-evidence.md)

**Conditionally required when actual material is cited. Omit when there is none; existing documents are not required.** Places the sources, original material and limitations of body notes at the end. Placement: Evidence notes at the very end of the document.

Author: Observer or investigator. Reviewer: An owner on the responsible team with access to the code, operations or screen for each fact. Check: Is the scope confirmed by direct observations, code, captures, logs and measurement records accurate? Do notes connect to actual citations without assuming unavailable material or past documents?

## 4. [P04 Problem and desired outcome](parts/P04-problem.md)

**Required for additions/changes, bugs, removal/migration and performance requests. Optional for fact questions and handoffs.** Explains the need through the situation and the gap between actual and expected behavior. Placement: The relevant discussion in the body.

Author: The side that observed the problem. Reviewer: Owner on the observing team. If expected behavior is product policy, the person responsible for that decision. Check: Are observations and expectations specific? Has the impact been overstated as though its full extent had been checked?

## 5. [P05 Requests and questions](parts/P05-requests.md)

**Required for all types.** Connects the preceding explanation to the judgment needed from the other side and follow-up action. Placement: The relevant discussion in the body.

Author: Request or handoff author. Reviewer: The sender confirms the required result; the recipient confirms the question, scope and acceptance of responsibility directed to them. Check: Are requests, questions and implementation proposals distinguished? Will the answer determine the requesting side’s next action?

## 6. [P06 Causes and hypotheses](parts/P06-hypotheses.md)

**Required for bug investigations. A confirmed cause is not required; an unknown cause is allowed. Optional for other types.** Explains which interpretation the observations support and what remains unconfirmed. Placement: The relevant discussion in the body.

Author: Investigator. Reviewer: Owner on the team responsible for the relevant code, data or operational path. Check: Are observed symptoms separated from causal inference? Is there a way to confirm or reject the hypothesis?

## 7. [P07 External behavior contract](parts/P07-contract.md)

**Required for additions/changes, removal/migration and implementation handoffs. Required for bugs and performance work if external behavior changes.** Explains the external behavior that addresses the problem. Placement: The relevant discussion in the body.

Author: Proposing side and provider. Reviewer: The provider checks guarantees and meaning; the consumer checks actual dependencies. The relevant decision owner handles policy judgments only. Check: Are required results separated from internal implementation? Are null, permission, aggregation and exception semantics sufficiently explained?

## 8. [P08 Implementation options](parts/P08-options.md)

**Optional for all types. Use when proposing an internal approach.** Explains differences between approaches to obtaining the required result. Placement: The relevant discussion in the body.

Author: Proposer. Reviewer: The implementation-owning team decides the method. Other teams confirm only conditions affecting shared contracts, cost or schedule. Check: Has an attractive implementation been treated as an obligation for the other side? Are assumptions, measurements and estimated costs distinguished?

## 9. [P09 Impact and migration](parts/P09-impact.md)

**Required for additions/changes and removal/migration. Also required for other types if consumer migration, existing data changes or removal are affected.** Explains how the change affects other consumers and migration. Placement: The relevant discussion in the body.

Author: Change owners on both sides. Reviewer: Each affected consumer and provider owner. The relevant operations owner if deployment or data changes are involved. Check: Has global removal been decided based only on one’s own consumer? Are migration, removal and recovery conditions recorded, along with actual acceptance of responsibility?

## 10. [P10 Acceptance criteria and verification plan](parts/P10-acceptance.md)

**Required for changes, bugs, removal, performance and handoffs. A short fact question may close with the answer required in P05.** Closes with what to verify and what to do next. Placement: The relevant discussion in the body.

Author: The side defining the required result and the side performing verification. Reviewer: Both sides confirm shared results and conditions; the executor confirms the feasible scope. Check: Are expected results observable? Have unagreed criteria been treated as pass conditions? Are plans separated from execution?

## 11. [P11 Owning team reply](parts/P11-reply.md)

**Required when writing an actual reply. Do not prefill in the initial request.** Updates current understanding and remaining questions with the new answer. Placement: The relevant discussion in the body.

Author: Owner of the area being asked about. Reviewer: The actual owner who can confirm code, operational or policy facts in that area. Check: Does the reply answer the question directly and separate confirmed scope, unknowns and constraints in its own area? Does it avoid requiring tracking IDs or past documents to answer?

## 12. [P12 Decisions and corrections](parts/P12-decisions.md)

**Required when deciding a shared contract or policy, or correcting existing facts or agreements.** Records detailed decision and correction history at the end. Placement: Document and review records after the body.

Author: Document owner and the relevant decision owner. Reviewer: Both provider and consumer for shared contracts. The relevant decision maker for product, permission or operational policies. The owning team for technical fact corrections. Check: Is there an actual choice or confirmation record? Are corrections and comparisons recorded only when there is previous content to change?

## 13. [P13 Implementation handoff and executed verification](parts/P13-handoff.md)

**Required at implementation handoff or closure. In an initial request, write plans only; do not fill this Part as executed results.** Explains the implementation scope and the meaning of actual confirmation results. Placement: The relevant discussion in the body.

Author: Implementation owner and verification executor. Reviewer: The provider checks implementation, environment and evidence; the consumer checks its own integration and migration results. Operations confirms only necessary deployment and data scope. Check: Can implementation and integration conditions be understood from this document alone? Are verification and deployment stated within the actually confirmed scope, with comparison to prior agreement only when differences exist?

## 14. [P14 Human review record](parts/P14-human-review.md)

**Required for all types. At drafting, record planned reviewer roles only and keep pending review until actual confirmation.** Tracks the scope of actual human confirmation at the end. Placement: Document and review records after the body.

Author: Each actual reviewer. The document owner compiles the record accurately. Reviewer: Record only the scope actually confirmed by the reviewer. Do not infer another person’s approval or review. Check: Describe planned review by role, key scope and body location without explaining all conditions again. Missing past records leave review occurrence unconfirmed. Are the actual person, section or question to check, document version, time and remaining conditions connected? Can the review scope be found without task tracking IDs?

## 15. [P15 Visual material](parts/P15-visuals.md)

**Conditionally required when judgment depends on seeing a screen or behavior. If capture is unavailable, record the missing attachment and who should confirm it.** Places original captures, full responses and attached diagrams at the end. Placement: Attachments at the end.

Author: Observer or person explaining the flow. Reviewer: The observing team for actual screens; the team owning each step for relationships and sequence. Check: Are actual captures, originals, annotated copies and explanatory diagrams distinguished, and problem locations clearly marked with borders and numbers? Are GIF reproduction order, static alternatives, sensitive information and inclusion appropriate?

## 16. [P16 Performance and scale](parts/P16-performance.md)

**Required for performance requests. Also required for other types when measurements determine adoption of an option or completion.** Explains the key figures and interpretation needed for performance judgments. Placement: The relevant discussion in the body.

Author: Person able to measure and proposer of the result. Reviewer: The executor confirms measurement and interpretation; the consumer confirms required user outcomes and acceptance criteria. Check: Are local and production, measured and expected, and single-run and distribution figures distinguished? Are correctness, cost and sample conditions included?

## 17. [P17 Asynchronous processing and state](parts/P17-async.md)

**Required when newly defining or changing acceptance, completion, failure, retry, cancellation or notification behavior.** Explains actors, states, and the sequence of failure and recovery. Placement: The relevant discussion in the body.

Author: Owner of each step. Reviewer: Each step’s owning team confirms its processing and signals; the consuming team confirms user-visible states and recovery flow. Check: Are successful HTTP responses separated from processing completion? Are ID granularity, retry responsibility, idempotency and missed events on reconnection apparent?

## 18. [P18 Permissions and policy](parts/P18-permissions.md)

**Required when changing authentication, authorization or exposure policy, or when a policy judgment is needed.** Explains the permissions and policies users will rely on and the judgments still needed. Placement: The relevant discussion in the body.

Author: Team owning the behavior and policy proposer. Reviewer: The provider confirms enforcement, the consumer confirms screen and feature meaning, and the relevant policy owner confirms policy choices only. Check: Are current code, desired policy and deployment configuration distinguished? Has success under specific conditions been expanded into overall safety or completed verification?

Record actual owner assignment, acceptance and confirmation results in the document’s closing records. Keep short questions short. A single paragraph is sufficient if it preserves the necessary information.
