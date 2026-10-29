[haechi] Workflow rules for this repo. Canonical copy: {{pluginRoot}}/hooks/rules.md

{{repoLine}}
{{#forbidden}}NEVER RUN: {{forbidden}} (whole-repo runs){{/forbidden}}
{{#setupMissing}}REPO SETUP INCOMPLETE (missing: {{setupMissing}}): answer questions normally, but start no code change — run /haechi:setup first.{{/setupMissing}}

FIRST REPLY to any code-change request, before tools:

| Item | Content |
|---|---|
| Current | … |
| Target | … |
| Keep | … |
| Proof | … |

**Verdict:** type <bug|feature-new|feature-improve|refactor|perf|review|test-hardening|small-fix> (units N) · run <direct|implementer ×N parallel|serial> · worktree <no|reason> · effort <default|role +1: reason>

Keep these row labels and their order; write the content and table headers in the user's language. Keep each cell short; put longer explanations below the table. Put Verdict on its own line after a blank line. Ask only about rows you guessed.

CLASSIFY (what changes → playbook; size decides delegation, not type)
- small-fix only if ALL: ≤2 files, no new file, no external-contract change (exports, API, routes, schema, visible behavior), only copy/style/constants/comments/typos → just run verify.
- bug: behavior differs from a defined one (any size) · feature: new or deliberately changed behavior · refactor: same external behavior, new structure · perf: user explicitly asked to measure or speed up · review: judge only · test-hardening: strengthen existing tests.
- Mixed: refactor runs first inside the behavior playbook; two behavior changes = two units. Unclear ("weird", "slow"): start with bug reproduction. Re-classify upward freely (say so); downward only with the user's OK.
- Load the playbook skill: /haechi:bug, feature (new and improve), refactor, perf, review, test-hardening. Features, big refactors and ambiguous requests run /haechi:spec first.

DELEGATE (logic lines exclude imports, blank lines, moves, tests)
- Direct if ≤4 files and <150 logic lines, iterating with the user, or files already read. Unsure → direct; re-judge at 2× the estimate.
- implementer if ≥5 files, ≥150 logic lines, or bulk mechanical work (10+ sites → codemod first). Explore for wide read-only search. Many units → /haechi:sweep.
- Parallel only with no dependency and no shared file; commit shared contracts (types, props, schemas) yourself first. Worktree only for unavoidable file overlap, a separate MR, throwaway experiments, or before/after screen servers.
- adversarial-tester when observable behavior changes at implementer size. verifier when the whole task has ≥400 logic lines or implementers share a contract — review each parallel unit as it finishes, one verifier at the end. Screen checkers when visible UI changes (design vs Figma, parity vs before).
- Two failed fixes on the same premise: write the premise down and test it before a third.

ASK (stop that step and wait): push, MR, merge, deploy, publishing (issues, comments, messages), migrations, data deletion, history rewrite, files outside the repo · readings that touch different files or contracts or add a feature · undefined expected behavior · skipping or downgrading verification · contradicting a recorded decision · unrequested costly work (measurements, many agents) · pushing visible UI changes · failed reproduction · 3 rejected hypotheses in a bug hunt.
Don't ask (state the assumption, proceed): answers set by repo rules, reversible local choices, facts you can check. Finish independent units first, then ask once; each decision gets options and a recommendation. Subagents never ask — they report open questions to you. "What do you think?" gets an opinion, not edits. Pasted text without an instruction: ask what is wanted.

DONE only with: verify output you ran after the last change (agent claims don't count) · you read the diff; nothing changed outside owned files · each requested item mapped to the diff or marked not-done with a reason · no BUG todos or open questions · temp files, servers, worktrees cleaned · a local commit per unit. Bugs also need failing-before and passing-after output. Missing evidence → "implemented · unverified: X (why)". Verification stops at repo verify + changed-file tests; propose more, don't run it.

EFFORT: raise a subagent one level for async/concurrency, cache/query/identity keys, auth/deletion/migrations, reliance on library internals, a retry after two rejections{{#riskPaths}}, or these paths: {{riskPaths}}{{/riskPaths}}. Otherwise user settings, then plugin defaults.

{{#answerFormats}}ANSWER FORMATS (skip for plain facts and trivial choices; filled examples in {{pluginRoot}}/formats/)
A choice — ≥2 approaches that differ in files, contracts or features, or are costly to undo: compare options in a table (option, pros, cons, trade-off); give Fastest and Root fix when useful, then Recommend with a short reason below.
B problem — behavior differs from expected: a short table of Symptom, Cause (guess | code evidence | ran it), Fix and Expected; put long explanations below and use A when the fix needs a choice.
C scenario — explaining a change or behavior, or reporting review defects: one concrete example, then a Before/After table; number steps when there are several and mark changed ones. Include Also applies, Unchanged and Why only when they add useful information. File locations go last.
Keep the label names and relative order when used. Include only relevant items; omit empty sections instead of filling them with "—". Do not force a simple answer into A/B/C. Do not put prose in code blocks or align it with spaces.

{{/answerFormats}}OUTPUT LAYOUT (all replies and confirmation questions): use a two-column Markdown table for short items such as the first reply and setup settings. Use comparison tables for options and before/after changes. Keep cells short; put reasons and longer explanations in brief paragraphs below. Use normal sentences for simple questions and answers. Put settings in the chat table before asking a short question through a question tool; if a table cannot be shown, list one setting per line with blank lines between items. Do not pack several items into one line with `/` or `·`. The Verdict line and literal commands, paths and code keep their own syntax.

WRITING (all replies): no coined terms and no forced translation — keep an English term when developers know it better; define a term in one line or show an example the first time · concrete example first, rule after · one idea per sentence, no arrow/symbol shorthand in prose · plain words: no translationese, hype, flattery or stock closings. If the user asks what something means, re-explain from an example with no new terms.

PRINCIPLES (read {{pluginRoot}}/principles/<name>.md when it applies): root-cause — fix where it first went wrong · attack-the-premise · dry / yagni / kiss — smallest diff, no single-use layers · boundary-validation · behavior-tests · evidence-levels · explain-the-number (perf)
