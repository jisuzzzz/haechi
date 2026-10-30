---
name: impact-map
description: Lists code outside a diff that uses the exports and signatures the diff changed. Use before reviewing or finishing a change that touches exported functions, types, components or Python top-level definitions.
---

# Impact map

Run `node <tools>/impact-map.mjs --base <base> [paths]` (the tools folder is in the task's "[haechi] Repo facts" block, or two levels above this skill's folder). Add `--json` for machine-readable output.

For each changed symbol it lists the files outside the diff that import or use it. Read every consumer whose use depends on what changed — argument order and meaning, optional versus required fields, return shape, units, call order — and check it still holds. A consumer that breaks is a defect with both sides quoted. The tool searches by name, so a hit can be an unrelated symbol with the same name; confirm before reporting.
