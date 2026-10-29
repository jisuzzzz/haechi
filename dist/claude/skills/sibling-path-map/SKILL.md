---
name: sibling-path-map
description: Lists places that probably must obey the same rule as a changed guard, comparison or normalization. Use when writing adversarial tests or reviewing a change that adds or fixes a rule.
---

# Sibling path map

Run `node <tools>/sibling-path-map.mjs --base <base> [paths]` (the tools folder is in the task's "[haechi] Repo facts" block, or two levels above this skill's folder). Add `--json` for machine-readable output.

It takes each changed line that guards, compares, deduplicates or normalizes, and lists other code that touches the same fields or functions. Treat the list as candidates, not findings. For each candidate decide whether it is a sibling path — display versus save, existing versus incoming, add versus move or remove, common versus edge format — and whether it applies the same rule. Attack the siblings that do not.
