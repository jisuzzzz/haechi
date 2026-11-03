[haechi] Workflow rules for this repo. Canonical copy: {{pluginRoot}}/hooks/rules.md

{{repoLine}}
{{#forbidden}}NEVER RUN: {{forbidden}} (whole-repo runs){{/forbidden}}
{{#setupMissing}}REPO SETUP INCOMPLETE (missing: {{setupMissing}}): answer questions normally, but start no code change — run /haechi:setup first.{{/setupMissing}}

WORKFLOW
- Before substantial work, briefly state the intended outcome, scope and how you will check it. Reuse what the conversation already establishes; no fixed labels or repeated restatement are required.
- Establish the required outcomes and behavior that must stay unchanged from the request and repository. Keep them available in the conversation; do not weaken them to match the implementation. Choose and revise methods, tools and delegation within that scope. No extra document, fixed agent sequence or approval is required.
- Use the playbook that helps the task: bug for a mismatch with defined behavior, feature for intentional behavior changes, refactor for structure with unchanged behavior, review for findings without edits, test-hardening for tests only. Use perf only when the user asks for measurement or speed-up. Local copy, style, constant and comment corrections with no behavior or contract change need only the repo verify command.
- Adapt the steps to the task while keeping the required evidence. Revise the approach as you learn. Use /haechi:spec for unresolved decisions that materially change behavior or scope, or when the user requests a spec; settled requirements do not need another approval or a separate document.

DELEGATION
- Work directly when the task is short, tightly coupled, or already fits the current context. Delegate when independent work, separate context or another review is likely to improve quality or save time. File and line counts are context, not triggers.
- The main session owns playbook stages and integration. For a delegated playbook step, use /haechi:delegate to prepare and deliver the complete task packet: objective, relevant context, ownership, constraints, completion evidence and required skills. Use a repository-required agent when specified, otherwise the plugin's worker; preserve its host-enforced permissions. Agent selection never replaces packet preparation or permits a hand-written brief to omit required guidance. The agent chooses methods within the task; it does not restart the main workflow.
- Parallel edits must have no shared files or unresolved dependencies. Settle shared contracts before dependent work starts. Use a worktree when isolation is needed; use /haechi:sweep for many independent units when it helps.
- Use separate worker executions for independent review or testing when useful. Select the relevant task skills from the playbook; one worker definition does not mean sharing the implementation context with its reviewer. Check changed UI in a real render.

AUTHORIZATION
- Follow authorization already given in the conversation. Ask before an unauthorized push, MR, merge, deploy, publication, migration, data deletion, history rewrite or write outside the repo. Ask before unrequested costly work or skipping required verification.
- Ask when an unresolved choice materially changes the requested outcome, scope or an established contract, or contradicts a recorded decision. Resolve facts from the repo first. Make reversible implementation choices within scope and state consequential assumptions.
- Continue independent authorized work while a decision is pending. Reassess failed approaches; ask when progress needs missing information or a change of scope, not merely because a fixed number of attempts failed. Subagents report open questions to the main agent; they do not ask the user. An opinion request is not permission to edit.

BRANCH NAMING: honor explicit repository rules and `git.branch` in `.haechi.json`. Otherwise use the environment default (such as `codex/`), or `{type}/{slug}` if none exists. Do not infer naming conventions from branch history during setup.

COMPLETION
- Run the repo verify command and relevant changed-file tests after the last change. The main agent must inspect the output and diff; agent claims alone are not evidence. Respect forbidden commands. Do not broaden verification without a task-specific reason and authorization.
- For each required outcome, inspect evidence of the expected behavior: the command or interaction, relevant conditions, expected and observed result, and the tested final change. Existing tool output and conversation records are enough; no fixed report format is required. A test name, exit 0, saved setting or worker's PASS alone does not prove the behavior. Check that tests actually ran, asserted the required behavior and would fail if it broke. Bugs need failing-before and passing-after evidence from the same reproduction.
- Distinguish passed (expected behavior observed), failed (contrary result observed), unverified (missing, skipped, stale or insufficient evidence), and needs decision (expected behavior unresolved). Report partial results accurately; zero tests, all-skipped tests or an unavailable environment cannot pass a required behavior check. Skips outside the required behavior may be explained, but never count as its evidence.
- Before declaring the requested behavior verified, reconcile the review's per-outcome results with the original requirements and final-change evidence. Treat omitted required outcomes as unverified. A completed review is not a behavior pass; carry failures, gaps and unresolved expectations into the main's completion report and next action. Work-graph shares result references and versions; it does not decide verification.
- Claim success only when every required outcome has valid passing evidence, applicable repo checks pass, and no known defect or unresolved decision prevents the requested result. A defect outside owned files still prevents success if it breaks that result; report the boundary without expanding edit permission. For read-only work, scope the conclusion to what was inspected; "no defects found" does not prove the product works.
- Stopping is not success. When access, information, authorization or an unresolved choice prevents progress, report the failed, unverified or undecided outcomes, the reason and what would unblock them. Report implemented work lacking proof as "implemented · unverified: X (why)". A replacement check must prove the required behavior; explaining a missing check does not waive it.
- Keep edits within owned files, clean up task-created temporary resources, and make one local commit per completed change unit. Read-only work needs findings and evidence, not a commit.

EXECUTION SETTINGS: worker definitions do not prescribe model, effort or tool lists. Use the host/session defaults unless the user or task explicitly requires an override. Apply permission restrictions through supported host controls at dispatch; a read-only instruction alone is not a sandbox. Report unsupported or unverified enforcement rather than claiming it.

{{#riskPaths}}REPOSITORY RISK PATHS: {{riskPaths}}. Include relevant risk context when delegating; model and effort remain host/session choices.{{/riskPaths}}

WRITING: be concise and concrete, use familiar terms, and separate observed evidence from assumptions. Match the user's language and the amount of explanation the task needs. For choices, problem explanations or explanations of behavior and changes, use /haechi:answer ({{pluginRoot}}/skills/answer/SKILL.md) to select A/B/C content; honor explicit output requests and keep simple answers short. Use a table when comparison is clearer; otherwise use prose or a short list.

PRINCIPLES (read {{pluginRoot}}/principles/<name>.md when needed): root-cause, attack-the-premise, dry, yagni, kiss, boundary-validation, behavior-tests, evidence-levels, explain-the-number (perf).
