---
name: request
description: Drafts a request to another team for an API, field or parameter that does not exist yet, saves it in the user's notes folder, and keeps the same file up to date as answers come in. Use for /haechi:request, when a feature needs something another team owns and the user says to request it, or when an answer to an existing request arrives.
---

# Request to another team

Example: the order list needs a `currency` field that `GET /api/orders` does not return. The feature playbook stops and asks instead of working around it in the client. The user says "let's ask the API team for it". This skill writes that request.

Write one Markdown document that the other team can answer item by item. Update that file as answers arrive. Use the team's language and adapt headings and tables to the request; a long analysis belongs in a linked design document.

## Draft

1. **Check what exists first.** Read the other side's API schema, docs or code when you can reach them, and confirm the field really is missing. Quote what you found in the request's contract.
2. **Write Markdown directly** in `<notesDir>/requests/YYYY-MM-DD-<slug>.md`. Identify who is asking whom, the date and the overall status. Link related material when useful. For several requests, use stable item IDs and a summary table; a short request can use a list.
3. **Make each item answerable without a meeting.** State what is needed, why it matters, its priority and current status, then give:
   - the expected contract: response shape, field meanings, nullability and an example payload;
   - proof of completion, for example "`GET /api/orders/42` returns `"currency": "EUR"`";
   - alternatives only when the request is costly, and deployment order only for a breaking change.
   Include a due date only when one is established. Track unanswered questions and dated decisions when they exist; omit empty sections. Suggested item statuses are Pending, Accepted, Accepted with changes, Rejected and On hold; translate them for the team when helpful.
4. **Run /haechi:plain on the draft**, then apply edits directly to this Markdown file.

## Where it lives

- Save it as `<notesDir>/requests/YYYY-MM-DD-<slug>.md`, with `notesDir` from `~/.haechi/user.json`. If `notesDir` is missing, ask once where notes go.
- Never inside a repository. A request is a record of a conversation between teams, often with chat quotes, parts of the other side's code and talk about their production systems.
- The user asking for the request covers writing this file. **Sending it** — by chat, email, issue or anywhere else — requires authorization for that action. Reuse explicit authorization already given; otherwise show the file and ask before sending.

## When answers come back

The user pastes or relays an answer, from chat or anywhere else. Update the same Markdown document directly:

- the answer of each matching open question,
- a dated decision for each resolved item,
- each item's status in its summary and details,
- the overall status: In progress once the other team starts answering, Done when no item is Pending or On hold.

Then tell the user what changed for the feature: what is now unblocked, what still waits, and any change to the plan.
