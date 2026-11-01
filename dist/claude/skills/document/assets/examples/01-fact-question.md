# Example: confirming column order in report exports

## 0. Summary

FE needs to decide whether the report screen can offer an export that follows the user's column order. **Please have BE confirm whether the exporter already supports a caller-selected order and what input it accepts.** This is a capability question, not an approved change request.

## Table of contents

- [0. Summary](#0-summary)
- [1. Why we need the answer](#1-why-we-need-the-answer)
- [2. What BE should confirm](#2-what-be-should-confirm)
- [3. What FE will do next](#3-what-fe-will-do-next)
- [4. Document and review status](#4-document-and-review-status)
- [5. Evidence notes](#5-evidence-notes)

## 1. Why we need the answer

In the fictional mockup, a user moves Quarter before Region. We do not know whether downloading the report would preserve that order.[^input] The screen must not promise a choice that the exporter ignores.

## 2. What BE should confirm

Does the exporter accept an ordered list of columns? If so, please explain how FE supplies it and what happens when a requested column is unavailable. If the output order is fixed, tell us which order the user receives. Include the code or documented behavior checked and any remaining uncertainty.

## 3. What FE will do next

If supported, FE will use the confirmed input and plan an export check. If unsupported, FE will keep the default export and explain its order. If investigation is needed, FE will wait for the answer before offering the choice. BE can identify a separate change request if new behavior would be required.

## 4. Document and review status

Example version 1, prepared on 2026-11-01; initial question draft. Human review has not been performed for this example. Owner assignment is unconfirmed. Planned review: FE checks the screen's promise; BE checks export capability and exceptions. No service investigation or test result is claimed.

## 5. Evidence notes

[^input]: [Synthetic report export input](SCENARIOS.md#1-report-export-question). Quarter and Region are invented column labels. The mockup behavior is an assumption, not an observation of a running service.
