# Reading flows and combinations by situation

After the summary, connect the situation, interpretation and requirements the reader needs to understand, and close with necessary judgments and next actions. Preserve Part requirements while varying the order by purpose. Place document and review records after the body. Add attachments and notes only when actual material exists. Existing documents, past agreements and task tracking IDs such as REQ or DIFF are not prerequisites.

## Table of contents

- [1. Fact questions and investigation requests](#1-fact-questions-and-investigation-requests)
- [2. Feature addition and change requests](#2-feature-addition-and-change-requests)
- [3. Bug investigation and fix requests](#3-bug-investigation-and-fix-requests)
- [4. Removal, retirement and migration requests](#4-removal-retirement-and-migration-requests)
- [5. Performance improvement requests](#5-performance-improvement-requests)
- [6. Implementation handoff and integration confirmation](#6-implementation-handoff-and-integration-confirmation)
- [7. Adding Parts conditionally](#7-adding-parts-conditionally)
- [8. Requirement comparison](#8-requirement-comparison)

## 1. [Fact questions and investigation requests](templates/01-fact-question.md)

Summarize why you are asking, move from what is currently known to the question, and close with actions based on the answer.

Default body order: Summary · Requests and questions.

## 2. [Feature addition and change requests](templates/02-change-request.md)

Explain the need for change through the current problem, present the required behavior and impact, then close with the other side’s judgment and completion conditions.

Default body order: Summary · Problem and desired outcome · External behavior contract · Impact and migration · Requests and questions · Acceptance criteria and verification plan.

## 3. [Bug investigation and fix requests](templates/03-bug-investigation.md)

Start with observed symptoms, distinguish causes and hypotheses, then connect them to investigation and fix requests and verification methods.

Default body order: Summary · Problem and desired outcome · Causes and hypotheses · Requests and questions · Acceptance criteria and verification plan.

## 4. [Removal, retirement and migration requests](templates/04-retirement-migration.md)

Explain the reason for removal and replacement behavior, review consumer migration and removal conditions, then close with the next judgment.

Default body order: Summary · Problem and desired outcome · External behavior contract · Impact and migration · Requests and questions · Acceptance criteria and verification plan.

## 5. [Performance improvement requests](templates/05-performance-change.md)

Explain the delay and the meaning of measurements, review targets, approaches and correctness to preserve, then connect them to comparison and the next choice.

Default body order: Summary · Problem and desired outcome · Performance and scale · Requests and questions · Acceptance criteria and verification plan.

## 6. [Implementation handoff and integration confirmation](templates/06-implementation-handoff.md)

Explain the implementation purpose and behavior currently intended for delivery, review integration conditions and adoption impact, then close with the answers needed and verification methods.

Default body order: Summary · Implementation handoff and executed verification · External behavior contract · Requests and questions · Acceptance criteria and verification plan.

## 7. Adding Parts conditionally

- **Actual evidence citation:** Cites actual material such as direct observation records, code, captures, logs, responses or measurements. If no material is available, leave a question to confirm instead of creating a note. Parts to add: [P03 Evidence notes](parts/P03-evidence.md).
- **External contract change:** Requests, changes or hands off new external behavior of an API, event or data. Parts to add: [P07 External behavior contract](parts/P07-contract.md).
- **Migration or existing data impact:** Affects existing consumer migration, removal, mixed versions or reprocessing of existing data. Parts to add: [P09 Impact and migration](parts/P09-impact.md).
- **Screens or complex relationships:** Screen state or behavior over time is a basis for judgment. Provide actual captures, annotated copies or GIFs, or record that capture is unavailable and what needs confirmation. Parts to add: [P15 Visual material](parts/P15-visuals.md).
- **Performance judgment using figures:** Performance improvement is the main purpose, or measurements determine adoption of an option or completion. Parts to add: [P16 Performance and scale](parts/P16-performance.md).
- **Asynchronous behavior change:** Newly defines or changes acceptance, completion, failure, retry, cancellation or notification behavior. Parts to add: [P17 Asynchronous processing and state](parts/P17-async.md) · [P15 Visual material](parts/P15-visuals.md).
- **Permission or policy judgment:** Changes authentication, authorization or exposure policy, or requires a policy judgment. Parts to add: [P18 Permissions and policy](parts/P18-permissions.md).
- **Reply phase:** The owning team replies to an actual question or request. Parts to add: [P11 Owning team reply](parts/P11-reply.md).
- **Decision or correction occurs:** Actually decides new behavior or policy. Record changes or corrections to prior content only when such content exists. Parts to add: [P12 Decisions and corrections](parts/P12-decisions.md).
- **Implementation handoff or closure phase:** Hands off implementation and verification results, or closes change work. Parts to add: [P10 Acceptance criteria and verification plan](parts/P10-acceptance.md) · [P13 Implementation handoff and executed verification](parts/P13-handoff.md).

When a reply arrives, update the body’s current understanding and next actions. Do not keep appending entire previous requests and replies and lengthening the reading sequence. Track previous content in decision/correction records and endnotes. A simple fact question can close once the required answer, evidence and human confirmation are satisfied.

For mixed cases, select each needed Part once and connect them according to the document’s logic. Place hypotheses after observations, internal options after required results, and migration after the impact explanation. Connect explanatory diagrams to the relevant discussion, and reference original captures, full responses, logs and raw measurements at the end.

## 8. Requirement comparison

This table is an index for authors choosing a combination. Do not copy it into the completed document’s body. Conditional means required when the relevant situation or later phase occurs; leave unknown conditions as questions to confirm.

| Part | Fact questions | Additions/changes | Bug investigation | Removal/migration | Performance | Implementation handoff |
| --- | --- | --- | --- | --- | --- | --- |
| [P01 Summary](parts/P01-summary.md) | Required | Required | Required | Required | Required | Required |
| [P02 Document identity and status](parts/P02-identity.md) | Required | Required | Required | Required | Required | Required |
| [P03 Evidence notes](parts/P03-evidence.md) | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional |
| [P04 Problem and desired outcome](parts/P04-problem.md) | Optional | Required | Required | Required | Required | Optional |
| [P05 Requests and questions](parts/P05-requests.md) | Required | Required | Required | Required | Required | Required |
| [P06 Causes and hypotheses](parts/P06-hypotheses.md) | Optional | Optional | Required | Optional | Optional | Optional |
| [P07 External behavior contract](parts/P07-contract.md) | Conditional | Required | Conditional | Required | Conditional | Required |
| [P08 Implementation options](parts/P08-options.md) | Optional | Optional | Optional | Optional | Optional | Optional |
| [P09 Impact and migration](parts/P09-impact.md) | Conditional | Required | Conditional | Required | Conditional | Conditional |
| [P10 Acceptance criteria and verification plan](parts/P10-acceptance.md) | Conditional | Required | Required | Required | Required | Required |
| [P11 Owning team reply](parts/P11-reply.md) | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional |
| [P12 Decisions and corrections](parts/P12-decisions.md) | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional |
| [P13 Implementation handoff and executed verification](parts/P13-handoff.md) | Conditional | Conditional | Conditional | Conditional | Conditional | Required |
| [P14 Human review record](parts/P14-human-review.md) | Required | Required | Required | Required | Required | Required |
| [P15 Visual material](parts/P15-visuals.md) | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional |
| [P16 Performance and scale](parts/P16-performance.md) | Conditional | Conditional | Conditional | Conditional | Required | Conditional |
| [P17 Asynchronous processing and state](parts/P17-async.md) | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional |
| [P18 Permissions and policy](parts/P18-permissions.md) | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional |
