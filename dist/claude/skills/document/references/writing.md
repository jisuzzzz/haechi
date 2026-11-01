# Writing a document from the first observation

For a Failed tab that shows a count but no rows, begin with the discrepancy and why it stops the user's work. Next explain what was observed and what remains unknown. Ask the owning team to confirm the behavior needed, then state what the requester will do with that answer. Put captures and logs after the discussion, with references beside the supported claims.

## Structure and source of truth

The [common Parts](../assets/parts/) define information and review responsibilities. [catalog.json](../assets/catalog.json) records those responsibilities; [presets.json](../assets/presets.json) records required Parts, conditional rules and reading order. The [six templates](../assets/templates/) are ready-to-copy defaults; `document-template.mjs` can compose additional Parts in the same order. [The common base](../assets/COMMON-BASE.md) is useful for a short question. Read [the examples](../assets/examples/SCENARIOS.md) for complete first-writing documents. Their situations are fictional, not evidence about the user's service.

Start with `0. Summary` (or `0. 요약` for Korean), then a linked table of contents and consecutively numbered sections. Number subsections as `2.1`, `2.2`; indent their TOC entries, not the body paragraphs. A document should explain why the next section follows. Preserve that reasoning when removing or adding a Part. The summary must match the current open questions and next step after replies.

The formatter recognizes `요약` / `Summary`, `목차` / `Table of contents` / `Contents`, and `근거 주석` / `Evidence notes` / `Endnotes`. English names are case-insensitive, and the TOC language follows the summary. For other languages, maintain equivalent navigation and endnotes directly rather than changing the team's language to satisfy the helper.

Use only information needed for the case. A short fact question can remain short. The four common requirements are summary, current document identity/status, request/question and human review scope. Parts define required information, not a separate heading for each Part. Keep conditions and their reasoning in the working discussion. Metadata, decision history and pending review records can point to it rather than explaining the same conditions again. Preserve useful summaries and explanations. No old request, source document, tracking code or prior agreement is needed. If there is no cited material, omit the evidence section rather than inventing a footnote.

## Facts and responsibility

Name what the author actually saw, the relevant environment and the limit of the observation. A screenshot of an empty list does not prove a filtering bug in the backend. Express a possible cause as a hypothesis and say what the owner would inspect to confirm or reject it. If the author has not seen the other repository, say so and ask a specific question.

Missing source records do not prove that work, measurement, access, delivery or review never happened. Distinguish unknown occurrence from unavailable results and confirmed nonexecution. Preserve reported completions with their source and scope rather than replacing them with unknown status.

Describe the consumer-visible result needed. Explain necessary input/output semantics, error conditions and compatibility when relevant. Internal functions, database changes and deployment choices belong to the implementing team unless a shared constraint makes them part of the requested result. A proposal stays a proposal until the relevant people decide.

The author checks their own observations and needs. The owning team checks its code, runtime facts and implementation judgments. Both sides review shared contracts. Product or operations reviewers participate only when their decisions are needed. List roles as pending when no person has accepted them. AI must not manufacture names, approvals, test results or release states.

## Evidence at the end

Keep the explanation readable. Cite a code location, actual response, log or capture with a short footnote reference at the claim. In the last section, identify the source, relevant lines or region, environment/time and what the source establishes. Keep raw excerpts and full payloads in attachments. A compact contract or before/after comparison can use a table; an evidence inventory does not need one.

For screenshots, use [capture.md](capture.md). Preserve original and numbered PNG, explain each number in prose, and distinguish observation from an expected-state diagram. A GIF is optional and should answer a temporal question a still image cannot. Link the original recording and a decisive still when using one. A static document such as PDF needs the still.

## Updates

Keep one current document per conversation when possible. Add an actual response in the relevant discussion and record who confirmed which facts. Preserve dates and review scope for earlier versions. Only compare an agreement with implementation when an agreement exists. Record real changes of fact or decision without mandatory `REQ`, `DIFF` or similar codes.

Before delivery, check comparable totals and component values, and conditions across sections. Preserve disagreements as open questions rather than silently correcting them or inventing causes. Remove unused placeholders and authoring comments; align summary, request and next action; regenerate the TOC; resolve footnotes; open the actual media; check relative links. Leave a truthful list of unknown facts, missing evidence and review still needed.
