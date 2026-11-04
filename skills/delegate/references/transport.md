# Deliver the prepared task

Use this when connecting a host adapter or when the host cannot consume saved task artifacts directly. A packet file or a path in a chat message is not proof of delivery.

## Host adapter

Read the saved packet and call `renderPacket(pluginRoot, packet)` from `tools/delegate-task.mjs` immediately before dispatch. It rejects changed sources or tampered packets. Pass the returned full string directly to the host's worker invocation; do not substitute the compact coordinator receipt or trust an independently edited `message.txt`. Keep task artifacts outside worker ownership. The adapter should return a provider-issued execution reference to the main, not echo all instructions.

Use the repository-required agent when specified and deliver the complete rendered task with its role and permissions intact. Otherwise use the registered `worker` definition if available, or pass a generic agent the complete body from `agents/worker.md` (Claude) or the `developer_instructions` body from `agents/worker.toml` (Codex), plus the rendered task. Do not add the generic worker definition over a repository agent's own definition. Generated files do not register a Codex agent. Resolve the paths against the actual installed plugin root, not an assumed source checkout.

Use supported host controls for required tool and permission restrictions. The packet's scope is an instruction, not a sandbox. Preserve session/host model and effort defaults unless the user or task explicitly requires an override. Record actual settings when evaluating. The CLI does not provide a native dispatcher, grant permission or authenticate the host.

## String-only host fallback

If the host's dispatch tool requires the main model to supply the message string, render the packet and send the **entire rendered message**, plus the worker definition when needed. Do not send only its path or a summary and claim complete delivery. This fallback still puts the full message through the main context; describe that limitation rather than claiming preparation token savings cover delivery too.

If required guidance cannot be delivered or required permissions cannot be enforced, report that capability gap before dependent work. Preparation, accepted/queued, started and completed are distinct states. Return execution evidence through the existing return protocol; do not infer success from any of these transport states.
