# Native session coordination

A link is `{ provider, sessionId, hostId? }`, obtained from the provider, never guessed from a title or ownership token. `hostId` is the provider's routing identity, not the string “codex” or a filesystem path. Keep the returned value when supplied. Resolve ambiguity before sending; never choose the last session implicitly.

## Codex desktop

Discover available tools by their names; tool namespace prefixes can vary.

| Intent | Native tool and input |
| --- | --- |
| Locate a session | `list_threads`; match the actual task/workspace and keep returned `id` and `hostId` |
| Read its report | `read_thread({threadId: sessionId, hostId, turnLimit: 2})`; use cursors for older context and request outputs only when proof needs them |
| Follow progress | `wait_threads({targets:[{threadId: sessionId, hostId, afterCursor}], timeoutMs: 0})` for a snapshot, or a bounded wait; retain the returned cursor |
| Send follow-up | `send_message_to_thread({threadId: sessionId, hostId, prompt})` within the user's explicit authorization for that target |

Use an existing link from `sessions ID`, confirm the target with a read, then use the relevant operation. Transmit the concrete objective and relevant context; do not demand a workflow or copy the whole source conversation. Preserve model settings unless the user requested a change. Read the destination response to verify it handled the request. A transport acknowledgement is not evidence that work succeeded. If sending fails or delivery is uncertain, inspect the destination before retrying to avoid duplicate instructions.

A session's request to report back does not itself authorize messaging it. Do not broadcast every report to every session. Any authorized session can query reports and coordinate; no permanent supervisor is required.

## Other Codex hosts

Prefer native tools exposed by that host. A connected Codex App Server supports thread listing/reading and turn start/steer/interrupt; inspect the installed protocol before using it. Connect to the provider's existing runtime for active-session control. Starting another app-server process or using `resume` is not proof of attachment to an already-running session.

For a known stopped CLI session, `codex exec resume SESSION_ID -` accepts a follow-up from stdin. Check the installed CLI help and the target's state first. Do not use `--last`, interpolate prompts into shell commands, or resume a session owned by another live process. When only stored history is available, report live control as unavailable. Haechi does not ship a separate CLI transcript reader or background daemon.

## Claude Code

Keep the native session ID and host context. When the installed Claude Agent SDK is available, its `listSessions`/`getSessionMessages` interfaces read stored sessions and `resume` continues a known stopped session. An existing connected SDK execution may support queued input and interruption. This does not imply remote control of an arbitrary running terminal session. Without that connection, report live control as unavailable. Do not parse or edit internal provider databases as a substitute for supported interfaces.

## References

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Claude SDK sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
- [Claude streaming input](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode)

Provider histories remain the source of detailed reports. Store only latest work state, short completion evidence and source references in haechi. If a source was deleted, expired or is inaccessible, report the gap; do not manufacture a report or silently substitute a different session.
