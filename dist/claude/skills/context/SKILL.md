---
name: context
description: Show or clear the explicitly selected task playbook context. Use /haechi:context clear when the task is finished, cancelled, or replaced.
---

# Selected task context

`/haechi:context clear` clears the saved selection through the user prompt hook. Report that it is cleared only when the hook observed that exact command. If the host consumes slash commands before prompt hooks, explain that persistence is unavailable on that host; never claim it succeeded. A fresh session starts without a selection.

For other requests, explain the selected context supplied by the hook. It records user intent only, not skill execution or progress. Read the selected playbook when needed; freely choose applicable steps. No editing restriction, completion gate or automatic skill execution is introduced.
