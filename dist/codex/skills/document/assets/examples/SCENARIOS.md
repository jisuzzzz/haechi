# Synthetic inputs for first-time document writing

## 0. Summary

These three inputs illustrate a fact question, a change request and an implementation handoff in unrelated fictional products. Their observations, prototype reports and statuses are invented for the examples. They are not service investigation, deployment or test results.[^scope]

Each document starts from its own input. No earlier request, company source or agreement is needed.

## Table of contents

- [0. Summary](#0-summary)
- [1. Report export question](#1-report-export-question)
- [2. Support-ticket change request](#2-support-ticket-change-request)
- [3. Media preview handoff](#3-media-preview-handoff)
- [4. Status and use](#4-status-and-use)
- [5. Evidence notes](#5-evidence-notes)

## 1. Report export question

A report-screen mockup lets a user move the Quarter column before Region. FE wants to know whether the exporter can preserve that choice. Export capabilities, accepted inputs and handling of unavailable columns are unknown.

The [fact question](01-fact-question.md) asks BE for that information before FE chooses the export interaction. It does not request an implementation change.

## 2. Support-ticket change request

A support-screen mockup selects Urgent tickets from a page of recent tickets. Its sample first page contains only Routine tickets; an older page contains an Urgent ticket. Filtering only the first page therefore hides a matching ticket.

The [change request](02-state-filter-change.md) asks for selection before pagination. Priority definitions, query support, access rules and rollout conditions need the relevant owners' confirmation. These are invented inputs, not a captured defect.

## 3. Media preview handoff

Assume BE reports a local prototype for video preview cards. The proposed card contains a title and distinguishes a preview that is available, being prepared or unsupported. FE needs to decide whether this is enough to integrate its media library.

The [handoff](03-media-handoff.md) explains the proposed behavior and the information needed for integration. The prototype report is part of the fiction; no actual code, endpoint, deployment or verification evidence is supplied.

## 4. Status and use

These are illustrative drafts, version 1, prepared on 2026-11-01. They have not received human review. Named owner assignment is unconfirmed; that does not establish that a real team has no owner. The examples make no claim about historical review or execution in any service.

For real work, replace the assumptions with checked facts, preserve uncertainty and ask the owning team about its implementation. Attach actual captures or responses when available, and record their limits. Planned checks are not passing results.

## 5. Evidence notes

[^scope]: This file defines synthetic scenario inputs only. Its links let readers trace an example's assumptions; they do not provide evidence about a company, user or running system.
