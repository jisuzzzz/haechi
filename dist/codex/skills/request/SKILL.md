---
name: request
description: Drafts a request to another team for an API, field or parameter that does not exist yet, saves it in the user's notes folder, and keeps the same file up to date as answers come in. Use for /haechi:request, when a feature needs something another team owns and the user says to request it, or when an answer to an existing request arrives.
---

# Request to another team

Example: the order list needs a `currency` field that `GET /api/orders` does not return. The feature playbook stops and asks instead of working around it in the client. The user says "let's ask the API team for it". This skill writes that request.

Write one document that the other team can answer without this chat. Use [the document skill](../document/SKILL.md) for the shared Parts, situational templates, narrative, evidence and scoped human review. Keep this skill's notes location and same-file update behavior below. Default to Markdown; honor an explicitly requested format.

## Draft

1. **Check what exists first.** Read the other side's API schema, docs or code when you can reach them, and confirm the field really is missing. If that side is inaccessible, state what remains unconfirmed. Put detailed evidence in endnotes, with a reference beside the supported claim.
2. **Choose and fill the shared template** in `<notesDir>/requests/YYYY-MM-DD-<slug>.md`. A new API or field normally uses `change`; an unanswered fact uses `fact`; an observed error uses `bug`. Apply the conditional Parts that the case needs. Start with the current need; no old document is required. Use summary, linked TOC, numbered sections and the human review record from the document skill. Use tracking IDs or a table only when they help this particular request.
3. **Make each item answerable without a meeting.** State what is needed, why it matters, its priority and current status, then give:
   - the expected contract: response shape, field meanings, nullability and an example payload;
   - proof of completion, for example "`GET /api/orders/42` returns `"currency": "EUR"`";
   - alternatives only when the request is costly, and deployment order only for a breaking change.
   Include a due date only when one is established. Track unanswered questions and dated decisions when they exist; omit empty sections. Suggested item statuses are Pending, Accepted, Accepted with changes, Rejected and On hold; translate them for the team when helpful.
4. **Collect visual evidence when needed** using [the shared capture procedure](../document/references/capture.md). Reuse browser helpers or temporary Playwright, preserve the original PNG, make a separate numbered-border PNG and attach both with explanations. GIF is optional when motion matters. Complete the document skill's plain-writing, navigation, evidence and image checks. Human review stays pending until the actual reviewer confirms its scope.

## Where it lives

- Save it as `<notesDir>/requests/YYYY-MM-DD-<slug>.md`, with `notesDir` from `~/.haechi/user.json`. If `notesDir` is missing, ask once where notes go.
- An explicit user-specified format or destination takes precedence over these defaults.
- Keep requests outside repositories by default. They often contain chat quotes, parts of the other side's code and discussion of production systems.
- The user asking for the request covers writing this file. **Sending it** — by chat, email, issue or anywhere else — requires authorization for that action. Reuse explicit authorization already given; otherwise show the file and ask before sending.

## When answers come back

The user pastes or relays an answer, from chat or anywhere else. Update the same Markdown document directly:

- the answer of each matching open question,
- a dated decision for each resolved item,
- each item's status in its summary and details,
- the overall status: In progress once the other team starts answering, Done when no item is Pending or On hold.

Done here describes the request conversation. Keep implementation, deployment, verification and human review statuses separate. Use the document skill to refresh the summary and next action, preserve actual review scope/version, and record only real replies and decisions.

Then tell the user what changed for the feature: what is now unblocked, what still waits, and any change to the plan.
