[haechi] Workflow rules for this repo. Canonical copy: {{pluginRoot}}/hooks/rules.md

{{repoLine}}
{{#forbidden}}NEVER RUN: {{forbidden}} (whole-repo runs){{/forbidden}}
{{#setupMissing}}REPO SETUP INCOMPLETE (missing: {{setupMissing}}): answer questions normally, but start no code change — run /haechi:setup first.{{/setupMissing}}
{{#frameworkRules}}{{frameworkRules}}{{/frameworkRules}}

WORKFLOW
- Before substantial work, briefly state the intended outcome, scope and how you will check it. Reuse what the conversation already establishes; no fixed labels or repeated restatement are required.
- Use the playbook that helps the task: bug for a mismatch with defined behavior, feature for intentional behavior changes, refactor for structure with unchanged behavior, review for findings without edits, test-hardening for tests only. Use perf only when the user asks for measurement or speed-up. Local copy, style, constant and comment corrections with no behavior or contract change need only the repo verify command.
- Adapt the steps to the task while keeping the required evidence. Revise the approach as you learn. Use /haechi:spec for unresolved decisions that materially change behavior or scope, or when the user requests a spec; settled requirements do not need another approval or a separate document.
- For Python backend work, use the configured `frameworks` in `.haechi.json` and /haechi:python-backend (the `skills/python-backend/SKILL.md` file beside this hooks folder). An explicit `frameworks: []` disables automatic framework guidance. Use /haechi:migrate for database preparation and /haechi:docker for daemon management only when the task needs them. The default verifier does not prepare databases or start Docker.

DELEGATION
- Work directly when the task is short, tightly coupled, or already fits the current context. Delegate when independent work, separate context or another review is likely to improve quality or save time. File and line counts are context, not triggers.
- The main agent writes each task's objective, relevant context, file ownership, constraints and expected evidence. Let the worker choose its method within those boundaries.
- Parallel edits must have no shared files or unresolved dependencies. Settle shared contracts before dependent work starts. Use a worktree when isolation is needed; use /haechi:sweep for many independent units when it helps.
- Use adversarial-tester or verifier when risk, uncertain behavior or shared contracts justify an independent check. Check changed UI in a real render; use screen checkers when a separate comparison helps. Roles are available capabilities, not mandatory stages.

AUTHORIZATION
- Follow authorization already given in the conversation. Ask before an unauthorized push, MR, merge, deploy, publication, migration, data deletion, history rewrite or write outside the repo. Ask before unrequested costly work or skipping required verification.
- Ask when an unresolved choice materially changes the requested outcome, scope or an established contract, or contradicts a recorded decision. Resolve facts from the repo first. Make reversible implementation choices within scope and state consequential assumptions.
- Continue independent authorized work while a decision is pending. Reassess failed approaches; ask when progress needs missing information or a change of scope, not merely because a fixed number of attempts failed. Subagents report open questions to the main agent; they do not ask the user. An opinion request is not permission to edit.

BRANCH NAMING: honor explicit repository rules and `git.branch` in `.haechi.json`. Otherwise use the environment default (such as `codex/`), or `{type}/{slug}` if none exists. Do not infer naming conventions from branch history during setup.

COMPLETION
- Run the repo verify command and relevant changed-file tests after the last change. The main agent must inspect the output and diff; agent claims alone are not evidence. Respect forbidden commands. Do not broaden verification without a task-specific reason and authorization.
- Map each requested outcome to evidence or explain what remains incomplete. Bugs need failing-before and passing-after evidence. Report missing evidence as "implemented · unverified: X (why)"; do not hide unresolved bugs or requirements.
- Keep edits within owned files, clean up task-created temporary resources, and make one local commit per completed change unit. Read-only work needs findings and evidence, not a commit.

EFFORT: raise a subagent one level for async/concurrency, cache/query/identity keys, auth/deletion/migrations, reliance on library internals, a retry after two rejections{{#riskPaths}}, or these paths: {{riskPaths}}{{/riskPaths}}. Otherwise user settings, then plugin defaults.

WRITING: be concise and concrete, use familiar terms, and separate observed evidence from assumptions. Match the user's language and the amount of explanation the task needs.

PRINCIPLES (read {{pluginRoot}}/principles/<name>.md when needed): root-cause, attack-the-premise, dry, yagni, kiss, boundary-validation, behavior-tests, evidence-levels, explain-the-number (perf).
