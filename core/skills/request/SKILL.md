---
name: request
description: Drafts a request to another team for an API, field or parameter that does not exist yet, saves it in the user's notes folder, and keeps the same file up to date as answers come in. Use for /haechi:request, when a feature needs something another team owns and the user says to request it, or when an answer to an existing request arrives.
---

# Request to another team

Example: the order list needs a `currency` field that `GET /api/orders` does not return. The feature playbook stops and asks instead of working around it in the client. The user says "let's ask the API team for it". This skill writes that request.

The document is built so the other team can answer item by item, fast: one table of requests at the top, one section per request below it, a decision log at the bottom. Answers go into the same file; there are no reply files. A long analysis belongs in its own design doc, linked from `related`.

The haechi tools folder is two levels above this skill's folder (`<this skill's folder>/../../tools/`). Run tools with `node`.

## Draft

1. **Check what exists first.** Read the other side's API schema, docs or code when you can reach them, and confirm the field really is missing. Quote what you found in the request's contract.
2. **Fill the fields** as JSON in `<notesDir>/requests/YYYY-MM-DD-<slug>.json`. Keep this file: later answers update it and render again.
   - `title`, `from`, `to`, `date` (YYYY-MM-DD), `status` (`Pending` | `In progress` | `Done`), optional `related` (link)
   - `requests[]`, one per thing asked: `id` (`REQ-1`, `REQ-2` …), `request` (one line), `priority` (`P0` blocks the feature, `P1` needed soon, `P2` nice to have), `why`, optional `due`, `status`, `contract`, optional `alternatives`, optional `rollout`, `proof`
   - `openQuestions[] {question, answer?}`, `decisions[] {date, item, decision, note?}` — `[]` when empty
3. **Write each request so it can be answered without a meeting.**
   - `contract`: the expected response shape, what each field means, whether it can be null, and an example payload.
   - `alternatives`: only when the request is costly for the other team. Briefly compare other workable options; a table is optional.
   - `rollout`: only for a breaking change. The order in which both sides deploy.
   - `proof`: how both sides will know it is done, for example "`GET /api/orders/42` returns `"currency": "EUR"`".
   - Item status starts as `Pending`. Allowed values: `Pending` · `Accepted` · `Accepted with changes` · `Rejected` · `On hold`.
4. **Run /haechi:plain on the text in the fields**, so the rendered file needs no further edits. Content is in the team's language; titles, table headers and status values stay in English.
5. **Render:** `node <tools>/render-doc.mjs request <notesDir>/requests/YYYY-MM-DD-<slug>.json --out <notesDir>/requests/YYYY-MM-DD-<slug>.md`. Exit 2 lists every bad field at once — fix them all and run it again.

## Where it lives

- Save it as `<notesDir>/requests/YYYY-MM-DD-<slug>.md` (fields next to it as `.json`), with `notesDir` from `~/.haechi/user.json`. If `notesDir` is missing, ask once where notes go.
- Never inside a repository. A request is a record of a conversation between teams, often with chat quotes, parts of the other side's code and talk about their production systems.
- The user asking for the request covers writing these two files. **Sending it** — by chat, email, issue or anywhere else — requires authorization for that action. Reuse explicit authorization already given; otherwise show the file and ask before sending.

## When answers come back

The user pastes or relays an answer, from chat or anywhere else. Update the request's `.json` file and render it over the same `.md` file:

- the answer of each matching open question,
- one Decision log row per decision (date, item, decision, note),
- each item's status in the Requests table,
- the document status: `In progress` once the other team starts answering, `Done` when no item is `Pending` or `On hold`.

Then tell the user what changed for the feature: what is now unblocked, what still waits, and any change to the plan.
