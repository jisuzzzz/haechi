# Example: handing off media preview cards

## 0. Summary

In this fictional handoff, BE reports a local prototype for video preview cards. **FE should review whether its title and preview states are enough to integrate the media library, and identify missing behavior before accepting the handoff.** The prototype report is an invented input, not evidence of an implemented service.[^input]

## Table of contents

- [0. Summary](#0-summary)
- [1. Behavior being handed off](#1-behavior-being-handed-off)
- [2. Conditions needed for integration](#2-conditions-needed-for-integration)
- [3. Planned verification and acceptance](#3-planned-verification-and-acceptance)
- [4. Document and review status](#4-document-and-review-status)
- [5. Evidence notes](#5-evidence-notes)

## 1. Behavior being handed off

For a video titled Garden tour, the draft proposes three display outcomes. An available preview supplies a still image. A preview being prepared keeps the title visible with a placeholder. Unsupported media keeps the title visible with an explanation instead of an image.

These are proposed external meanings. The draft does not establish field types, an endpoint or a deployed response format. FE should confirm whether it can render the three outcomes; BE should provide the concrete response shape and examples needed to build against them.

## 2. Conditions needed for integration

BE needs to provide the prototype's code reference, usable environment and reported verification scope. FE needs to confirm its display requirements and identify any missing information. No such artifacts or results accompany this example, so deployment and integration readiness remain unconfirmed.

Both sides must decide how FE learns that a preview is ready later and how errors differ from unsupported media. BE must enforce access to the underlying media before supplying a preview; hiding a card in FE is insufficient. Actual permission behavior needs verification.

## 3. Planned verification and acceptance

Use representative inputs for an available preview, one being prepared and unsupported media. FE checks the title, still and fallback display. BE checks the response meanings and access restrictions. Record the code, environment, inputs and observed results when those checks occur; this paragraph reports no executed checks.

Keep the handoff in draft until both sides have reviewed the shared behavior and FE has confirmed integration in the agreed environment. Missing records must not be rewritten as tests not run or an owner not assigned. No service captures are attached.

## 4. Document and review status

Example version 1, prepared on 2026-11-01; implementation handoff draft. Human review has not been performed for this example. Owner assignment is unconfirmed. Planned review: BE checks provided behavior and verification scope; FE checks consumption and integration. Their acceptance has not been recorded here.

## 5. Evidence notes

[^input]: [Synthetic media preview input](SCENARIOS.md#3-media-preview-handoff). The prototype report, Garden tour title and display outcomes are invented for this document. They are not actual code, deployment, test or human review results.
