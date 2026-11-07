# haechi design

Status: v0 in progress. This document describes what the plugin does and why. It changes as decisions change.

## Goals

- One workflow for Claude Code and Codex users across frontend (TypeScript, React, React Native) and backend (Python, FastAPI, Django) repositories.
- Keep repository facts, authorization boundaries and completion evidence available. Load task guidance when it helps.
- Work is called done only with evidence.
- No stack-specific rule packs. Plugin rules target the defects agents actually produce. Anything that differs per repository is a setting the repository declares.

## Layers

1. Repository setup supplies verified commands, forbidden commands and ownership facts.
2. The [common work contract](../principles/work-contract.md) owns pre-action evidence, implementation principles, conditional verification/review obligations and completion.
3. Task skills supply useful methods. The model chooses them for the next action as requests and findings develop; no exclusive primary playbook controls the task.
4. Hooks deliver the shared summary initially and after supported recovery, with actionable reminders on later task submissions. The main owns requirements, integration and the completion decision.
5. Delegation composes method guidance and the common contract into complete scoped packets for the generic worker. Existing playbook/step identifiers remain compatible operation names.

Beside these layers: `.haechi.json` holds repository facts, `AGENTS.md` holds repository rules, and `~/.haechi/user.json` holds personal paths and preferences. None of these records proves that work passed verification.

## Request flow and delivery

For substantial work, briefly explain the intended outcome, scope and check method. Reuse settled requirements and decisions without a fixed reply format or another approval. Before product-source edits, receive/read applicable common guidance. Already-current guidance may be reused. Choose task methods as useful; a changed finding within one turn can change the next action without another user prompt or label switch.

Full rules are emitted on the first eligible injection and after marked compaction; later requests receive the same actionable reminder about applicable guidance, pre-action evidence and completion. Its stable recovery path points to `hooks/rules.md`, which directs product work to the canonical contract. Codex registers SessionStart/UserPromptSubmit command hooks; PostCompact marks state for the next injection. Injection state is isolated by exact session identity and resolved repository root; missing identity uses stateless full delivery and malformed stored state recovers full. Claude uses prompt.submit and registration/repository-local state, with compaction/clear reset; host control/command passthrough remains intact. Task skill bodies also reference the common contract for command-driven entry.

Unit adapter execution and packet validation are not proof of native host delivery. Claude registration lifetime across sessions and actual command paths require host evidence. UserPromptSubmit does not fire for a tool result. No blanket PostToolUse reinjection, natural-language hook router or Stop-hook completion lock is added.

## Applying methods and obligations

New behavior, defined mismatch, behavior-preserving transformation and changed UI can overlap. Their applicable obligations accumulate under the common contract instead of selecting one exclusive category. `bug`, `feature` and `refactor` retain useful investigation, requirements/dependency and transformation techniques. `preview` creates/checks a proposal and preserves the selected reference. A proposal-only request does not authorize product implementation.

Narrow copy/comment/constant corrections without behavior or contract changes need repository verification and diff inspection, not a new proposal or full implementation ceremony. Read-only review and tests-only hardening preserve their boundaries. Performance work still requires an explicit measurement/speed-up request. An explicit command remains a user preference; stale stored context cannot override a newer request.

## Delegation

- File and line counts describe scope; they do not trigger delegation or a reviewer.
- Work directly for short or tightly coupled tasks. Delegate independent work when it saves time or benefits from separate context. Each brief states the objective, relevant context, file ownership, constraints and expected evidence; the worker chooses its method.
- Use a verifier or adversarial tester when risk, uncertainty or shared contracts justify an independent check. Roles are capabilities, not mandatory stages.
- Check changed UI in a real render. A separate screen checker helps when there is a useful design or behavior comparison. Screen checkers open the original images to compare appearance, using structure and measurements as supporting evidence. Unviewable states remain blocked, and aesthetic preferences stay separate from observable defects.

## Task skills and documents

- Existing commands `bug`, `feature`, `refactor`, `perf`, `review` and `test-hardening` remain available as methods. Their local scope restrictions remain binding; common obligations are owned by the canonical work contract.
- Detailed investigation techniques live in optional skill references. They ship with both plugins but are not injected into the session rules or inlined into agent prompts. The main agent chooses jobs and context; workers choose their methods within the assigned scope.
- `eval` collects observed workflow failures separately from suspected causes, freezes a baseline/candidate comparison, and requires repeated target improvement without candidate failures before adoption. Independent behavioral judgment and final-file verification remain necessary; `eval-report.mjs` only checks supplied judgments and evidence completeness. Records are read when relevant, never injected as permanent lessons. See the [evaluation protocol](../skills/eval/references/protocol.md) and [seed observations](../evals/failures.md).
- `spec` helps resolve consequential behavior or scope decisions, or produce an explicitly requested spec. Accepted requirements and checkable outcomes can stay in chat. File counts, a new screen or an export change alone do not require a formal document or another approval.
- `sweep` coordinates many independent units when splitting helps. Change units get commits; read-only units return findings and use conversation evidence to resume.
- Specs and requests to other teams are written directly in Markdown and updated in the same file. Repository or team conventions determine their layout; empty sections and duplicate machine-readable copies are unnecessary. `screen-report.mjs` builds screen reports. The common writing rules apply to all authored natural-language output. `principles/clear-writing.md` provides optional detail for drafting and editing; it is not a per-response skill invocation.
- Requests to other teams and screen reports live in the user's notes folder, never in the repository.

The `spec` step came from the user's wish to discuss a task with the main session and agree on what to build before implementation. That intent still applies when a consequential decision is unresolved. The current workflow lets settled requirements stay in chat; the earlier preference for always saving a spec is recorded in the [carryover notes](carryover-2026-10-30.md).

## UI previews

Preview started from the pstack idea of showing layout and design choices quickly with disposable code, so the user can choose a direction before product implementation. Describing it only as worktrees, development servers and comparison reports lost that purpose and made the actual application seem like the default.

Preview is a task skill for creating and checking a proposal. It can run independently or within other authorized work without replacing an explicit user preference. The main session creates the disposable prototype and checks, captures and compares previews directly. A standalone prototype request ends with the checked proposal; product implementation proceeds on the user's authorization under the common product-change obligations, using relevant task methods.

Version 0.0.11 chose a single HTML file with fake data as the default. [`preview-scaffold.mts`](../tools/preview-scaffold.mts) provides a fixed top bar with variant and state switchers, number-key shortcuts, side-by-side comparison and a "Throwaway prototype · fake data" badge. The self-contained file keeps the selection in the URL hash and shows a rendering error in the affected variant. It refuses existing output files and paths inside a git work tree. Serve the file's directory with a local static server, check the localhost URL in a browser before sharing it, keep the server running during review, and stop it afterward.

The agent fills the prototype CSS, `STATES` data and each variant's `render(data, root)` function, applying the shared [UI design principle](../principles/ui-design.md) when building and checking the preview. It keeps the generated controls intact so previews share the same navigation. An illustrative widget fits when a still image answers the question. The running application fits when the user requests it or the choice depends on real data, state or integration that fake data cannot replace. The [preview skill](../skills/preview/SKILL.md) defines the procedure and browser checks.

Setup-generated preview CSS for each repository was considered and rejected because it would add maintenance work. There is no automatic design-token integration. The agent can still copy product colors, fonts or spacing when that helps build the preview quickly; the running application remains available when its real environment matters.

Implementation reuses the chosen layout, timing, interactions and checked reference; retain selected-screen captures and interaction criteria before prototype cleanup. Feature planning and implementation inspect existing components for reuse or a compatible extension. Review checks new components against the actual alternatives and their consumers. Product-source changes, including those made during a preview request, inherit the common contract's tests, rendered reference comparison and code review. Passing tests and visual agreement are separate results. Reusing prototype code is a separate decision.

## Git

- `commit` works the same on every host. `mr` opens merge requests on GitLab (glab) and pull requests on GitHub (gh) from the repo's title and body conventions. `ci-watch` (GitLab only for now) waits for the pipeline in the background, fixes failures in the session that opened the merge request, stops after the same job fails twice, and never passes a gate by suppressing it.
- Git settings are resolved when an operation needs them: explicit settings and repository instructions first, then the remote URL and local remote HEAD. An unresolved host or target requires a focused question at that operation, not another setup run. Local commits need no host login; authorized remote operations check authentication for their selected host.
- After a merge, `cleanup-merged.mjs` lists the local branch, worktree and leftover remote branch, and deletes them only after one yes. It unlinks links inside a worktree first, so deletion cannot follow them into the main checkout.

## When to ask

Use authorization already given. Ask before an unauthorized external action or destructive operation, before unrequested costly work, and before skipping required verification. Ask about unresolved choices that materially change the outcome, scope or an established contract. Resolve facts from the repository and make reversible implementation choices within scope. Subagents report consequential open questions to the main agent.

## Done means

The [common work contract](../principles/work-contract.md#check) is authoritative for completion. Compare original requested outcomes and accepted amendments with the actual work; a diff can omit an entire requested feature. Inspect applicable behavior evidence and review findings rather than treating a skill read, a worker verdict, a successful command or a completed review as a behavior pass.

The contract distinguishes passed, failed, unverified and needs decision, and defines evidence applicability across relevant implementation versions, inputs, environments and scope. Keep before/after reproduction for a repair, preservation evidence for restructuring and actual rendered evidence for affected UI. Valid prior results may be reused; uncertain applicability must be resolved or reported. A reconstructed baseline cannot establish that an earlier pre-action procedure was followed.

A handoff wording change normally does not invalidate code-behavior results. Check whether the changed documentation is executable input, apply the repository's checks for the actual change and inspect the diff, then reuse still-applicable results. Changed dependencies, inputs, environments, requirements, missing coverage or an explicitly required fresh check still require current evidence. Do not rerun unrelated suites or create a recorder merely to copy already available output into a report; identify reused evidence honestly.

Missing proof sends work back to the affected unfinished action, not to the beginning of a playbook. The main inspects the final diff and evidence, respects authority and scope, cleans owned resources and follows repository commit/handoff rules. Read-only work returns bounded findings without a commit. These are instruction obligations, not a host-enforced completion lock or a graph executor.

Historical [completion checks](core-validation.md) and [workflow observations](../evals/failures.md) retain their original scopes and limits. See [workflow validation](workflow-validation.md) for this release's common-work, preview and native-delivery evidence and limitations.

## Writing and design judgment

Use concise, concrete language. The [answer skill](../skills/answer/SKILL.md) restores situational A/B/C guidance: A supports a choice with comparable trade-offs and a justified recommendation; B connects a symptom, evidence, cause or uncertainty, remedy and check; C explains behavior through a concrete situation. The agent selects the pattern and includes its relevant content while choosing its own work methods. There is no separate response-layout setting or required work sequence.

Use prose, lists or tables to fit the content; do not print A/B/C labels or empty headings just to satisfy the pattern. Explicit output requests take precedence, simple answers stay short, and existing document Parts/templates remain the structure for cross-team artifacts. Unknown causes, proposed changes and unmeasured effects remain visibly uncertain. The skill reuses the document evaluation's facts, uncertainty, responsibility, answerability and evidence criteria without adding a document-review process to chat. The [evaluation record](core-validation.md) distinguishes checked behavior from any claim of improved human readability. Earlier templates and the decision to keep prose out of code blocks remain in the [carryover notes](carryover-2026-10-30.md).

The answer skill uses the original A/B/C foundation with a local editing check. Read the whole answer before trimming: preserve the explanation, evidence and uncertainty, and remove repetition when it adds reading effort without helping understanding or a decision. A brief recap or reminder can help even when it was not explicitly requested. Do not impose a length target or a one-mention rule. The [flow comparison](core-validation.md) separates content checks, blind model preferences and the user’s choice of the original foundation. The [previous refinement](core-validation.md) remains as historical evidence, not proof of better readability.

A single caller does not make a file or abstraction wrong. Separation should clarify a responsibility, isolate a dependency or make behavior easier to test. Avoid layers that add work without those benefits. When the user asks the agent to design a UI, it can use the existing product patterns and make a draft without first demanding a design reference. The main agent checks a draft with written criteria in a real render; the screen-design procedure is reserved for its supported visual references and variant capture.

## Settings

- `.haechi.json` in the repo: verify and single-test commands, a forbidden-command list (empty when none), test locations and the sensitive-data rule. Optional settings include typecheck, `pythonTestMap` for explicit Python source-to-test relationships, Git settings, worktree setup and teardown, and risk paths.
- `~/.haechi/user.json`: `notesDir` for files that must stay out of the repo (requests to other teams, raw measurements, screen reports, login sessions for screen checks) and `openReports` for opening reports automatically. Updates preserve unknown existing keys.

## Setup scope

A repository can finish setup without any Git settings. Completion requires `commands.verify`, `commands.testOne`, nonempty `testDirs`, `sensitiveData` and a `forbidden` array, which may be empty. Known Git candidates can be retained without collecting missing values or proving remote login. Explicit Git values are preserved. Branch creation follows explicit naming rules or the environment default. Commit resolves its format from explicit rules or recent commits. MR resolves its body from an override, the repository template, or Summary, Changes and Validation sections. Merged PR history is consulted for formatting only when requested.

Setup detects execution settings and returns existing settings alongside candidates. Independent machine and repository checks run together, and their results feed one confirmation batch. The agent reuses successful checks when their relevant inputs have not changed. A verifier that actually runs the configured test can satisfy the single-test proof too; a no-tests result cannot. On reruns, unavailable evidence stays unverified until checked. Instruction discovery stays within the repository and its ancestors.

The default verifier uses `pythonTestMap` to select explicit test files for changed Python sources. A configured single-test command takes precedence over detected pytest. Skipped checks and missing or incomplete test-execution summaries produce exit 2. Reported test failures produce exit 1 even if a wrapper exits 0. The verifier checks runner-reported execution; acceptance coverage still needs the main agent's judgment. The [Python backend guide](python-backends.md) defines supported summaries, path rules, command precedence and database prerequisites.

## Build and distribution

- Sources live in the root `skills/`, `agents/`, `hooks/`, `tools/` and `principles/` folders, with metadata in `plugin.json`. Platform adapters live in `hooks/claude/` and `hooks/codex/`. `tools/*.mts` and `hooks/rules.mts` are checked TypeScript sources. `build/build.mjs` removes types and generates JavaScript tools at the existing `.mjs` paths in `dist/claude` and `dist/codex`. Tool imports use `.mjs` specifiers, which NodeNext resolves to `.mts` for type checking. Build and check run strict type checking first; CI fails on type errors or stale `dist` files. Tests run against generated JavaScript.
- There is one generic `worker` definition, without preset model, effort or tools. Repository-required agents can receive the same complete delegate packets while retaining their role and host-enforced permissions. Implementation, review, test attack, screen comparison and experiment procedures remain in skills. Their previous ownership and output contracts remain with the corresponding procedures.
- Compatible `haechi-handoffs` blocks provide method-specific skills, context, scope and completion additions. The canonical common work contract supplies mandatory shared guidance to every packet, with linked principle Do/Check sections and deduplicated hashes. References may appear in several playbooks; procedure and principle bodies have one source. Skills do not contain a hidden role-to-principle dependency map.
- The main selects a bounded operation and uses `delegate-task.mjs describe ROOT PLAYBOOK STEP` for the contract's input form, required acceptance and guidance inventory, without loading worker bodies or helper source. It fills task-specific values and preserves the form's exact write mode and playbook hash; changed playbooks require reviewing a fresh form. Fixed completion criteria are merged automatically.
- `assemble ROOT BRIEF_JSON NEW_OUTPUT_DIR` validates the brief, saves a complete packet and rendered message in a new directory, and returns only task/acceptance, source hashes, guidance inventory and paths. It refuses to replace existing task artifacts. Legacy `prepare`/`render` commands and packet shapes remain compatible. Rendered text groups each source path/hash once, retaining its complete Do and Check bodies under explicit headings; it does not remove assets or weaken packet validation. `render` rejects changed or tampered packets and oversized output. A host adapter should call it immediately before passing the full task directly to a fresh worker; the main need not receive those bodies. A string-only dispatch tool still requires full text in the main context, so this CLI alone does not remove delivery cost or establish token savings. No native dispatcher is added. Workers may load extra relevant skills.
- Repository ownership and explicitly authorized external artifact paths are distinct. No packet grants a sandbox permission; use host controls where enforcement is required. A packet hash proves consistency, not receipt, compliance or quality. Hooks supply repository facts but do not enforce dispatch. The main must check selection, delivery and behavior evidence.
- For an existing shared graph task, `delegate-return.mjs publish` performs raw-record integrity checks, proof storage, criterion-reference validation and graph update in one host call. It returns compact decision inputs, including relevant command outcomes and all nonzero exits, instead of intermediate full bundles. The graph schema and hooks are unchanged. Records remain pending main review; unknown/stale evidence is rejected, conflicts are not retried automatically, and short standalone work skips this path. The host supplies real identity, observed records and criterion claims; the tool does not infer semantic success or authenticate the host. Runtime savings remain an evaluation question.
- Both tools install from this repository: `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`.
- The build emits the Codex worker TOML but this repository does not currently register it through setup. If the host has no custom worker type, the main can use its generic agent with the worker instructions and complete rendered packet. Native registration and permission enforcement must be checked in the actual host; generated files alone are not proof.

## Findings that shaped the design

- A plugin installed by a user in Claude Code cannot change the system prompt or the first-message context (`prompt.compose`, `prompt.context` are skipped by the built-in security plugin). Rules go in through `prompt.submit` context.
- `prompt.submit` context does not reach subagents. The `agent.spawn` hook can append to a subagent's prompt.
- Codex runs hooks from CLI-installed plugins once the user trusts them in `/hooks`; subagents inherit the parent's injected context.
- Claude Code reads `AGENTS.md` on its own.

## Roadmap

P0 verification spikes → P1 skeleton and build → P2 core rules and hooks → P3 setup → P4 agents and principles → P5 playbooks (P0–P5 done) → P6 git skills → P7 real use on one repository → P8 v0.1 release.

## Credits

Several ideas are adapted from pstack (MIT). See NOTICE.
