# Example: selecting urgent support tickets before pagination

## 0. Summary

A support-screen mockup can hide an older Urgent ticket because it selects priorities only from the first page. **We request a list query that selects the chosen priority before pagination.** BE should confirm the supported query and access rules; FE will then connect the view and validate the result.

## Table of contents

- [0. Summary](#0-summary)
- [1. Why the current approach is insufficient](#1-why-the-current-approach-is-insufficient)
- [2. Required behavior and open decisions](#2-required-behavior-and-open-decisions)
- [3. Integration and planned checks](#3-integration-and-planned-checks)
- [4. Document and review status](#4-document-and-review-status)
- [5. Evidence notes](#5-evidence-notes)

## 1. Why the current approach is insufficient

The synthetic first page contains Routine tickets, while an older page contains an Urgent ticket.[^input] Selecting Urgent from the first page produces an empty view even though a match exists. Fetching pages until a match appears would make the result depend on how far back it lies.

## 2. Required behavior and open decisions

The Urgent view should receive matching tickets from its first query, within the caller's permitted support queue. Subsequent pages must keep the same selection. Calls without a priority choice should retain their existing meaning.

Please have BE confirm whether this query already exists, how FE supplies the priority and continuation position, and how unsupported values are reported. Both sides need to settle what happens if a ticket's priority changes between page requests. BE owns the implementation method; the support product owner confirms the meaning of Urgent if that policy is unclear.

## 3. Integration and planned checks

FE will keep the existing list available until the supported environment and activation conditions are confirmed. Missing response or test records leave readiness unconfirmed; they do not prove that implementation or testing never occurred.

The planned check uses a fixture with the only Urgent ticket beyond the newest page. Its first filtered query must return that ticket, continuation must preserve the selection, and unauthorized tickets must stay hidden. These are acceptance criteria, not reported test results. No service capture is attached.

## 4. Document and review status

Example version 1, prepared on 2026-11-01; change request draft. Human review has not been performed for this example. Owner assignment is unconfirmed. Planned review: FE checks the view and requests; BE checks selection, pagination and access. Both sides confirm integration conditions before accepting the change.

## 5. Evidence notes

[^input]: [Synthetic support-ticket input](SCENARIOS.md#2-support-ticket-change-request). The tickets and priorities are invented. No screen capture, network observation or backend investigation establishes this situation in a real service.
