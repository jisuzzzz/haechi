---
name: docker
description: Inspect, start or explicitly stop a configured local Docker daemon for repository work. Use when Docker is unavailable or the user asks to manage its daemon.
---

# Docker daemon

Use `node <tools>/docker-daemon.mjs status|start|stop <repo-root>`, where `<tools>` is this skill's `../../tools/` directory. With no arguments, it checks status in the current directory.

The optional repository setting is:

```json
{
  "docker": {
    "context": "colima",
    "start": "colima start",
    "stop": "colima stop"
  }
}
```

These are trusted repository commands; select the actual local provider and context from existing setup. Desktop, Colima and systemd can use their existing start/stop commands. Do not guess a provider, install software, change privileges or put credentials in these settings. Only `context` is needed for status; an action needs its corresponding command.

Read status before managing the daemon. Every Docker check uses the configured context without changing the user's global context. A failed connection means **unreachable**, not proven stopped. Status exits 0 when ready and 2 when unreachable; configuration and action failures exit 1.

Start and stop require `--execute`; omitting it fails before running any command. Use authorization already established in the session. Otherwise ask immediately before the requested mutation, with the context and configured command ready to review. A setup setting alone does not authorize daemon management.

- **Start:** `node <tools>/docker-daemon.mjs start <repo-root> --execute`. A ready daemon is left running. The provider command has a 60-second limit, each Docker check has a 5-second limit, and readiness polling lasts up to 45 seconds after the provider command. A timeout or failed command is a failed preparation, so do not continue to migrations or report tests ready. Mutating commands are never retried automatically.
- **Stop:** run only for an explicit stop request, never as automatic cleanup. `node <tools>/docker-daemon.mjs stop <repo-root> --execute` refuses when containers are running or their state cannot be checked. It runs the configured stop command and waits for the endpoint to become unreachable; this observation does not independently prove the provider's service state. A stop request never authorizes stopping unrelated containers, pruning, deleting volumes or resetting a database.

Start/stop support only local Unix sockets and local Windows named pipes. Remote endpoints can be inspected but are not managed. Provider commands must target that same local daemon and return promptly; the tool cannot infer arbitrary shell command semantics. Report the observed state and any remaining prerequisite before backend verification.

Timeout, SIGINT and SIGTERM handling terminates active commands and their ordinary local descendants. It cannot cancel detached provider work or undo a daemon start already requested. After a timeout or interruption, inspect status before deciding what to do next; do not automatically retry startup or stop the daemon to clean up.

Docker references: [contexts](https://docs.docker.com/engine/manage-resources/contexts/) and [context inspection](https://docs.docker.com/reference/cli/docker/context/inspect/).
