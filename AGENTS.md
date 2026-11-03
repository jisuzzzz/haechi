# Repository data

This repository uses no sensitive data. Do not add real personal, patient, or payment data.

## Language

Write plugin-owned instructions, configuration/setup text, generated guidance and maintained documentation in English. Preserve user-provided content, intentional multilingual examples and parser/test literals, and immutable historical evidence in their original language. Chat responses may follow the user's language.

## Development and handoff

Use Node.js 24 for the Cloud development environment. Run `npm run check` to verify generated files. Run relevant tests individually with `node --test test/<file>.test.mjs`; do not run `npm test` or `npm run test`.

When continuing the Cloud migration, start with `docs/cloud-handoff-2026-10-30.md`. It summarizes decisions, current status, verification and remaining work, with links to the design and historical carryover. Current repository rules take precedence over historical notes.

## Commit attribution

Use `jisuzzzz <meked@naver.com>` as the human Git author for this repository. Set repository-local `user.name` and `user.email` accordingly in each environment before creating commits. Do not add alternate identities for the same person as `Co-authored-by` trailers.

Include `Co-authored-by: Codex <codex@openai.com>` in commits created with Codex assistance, including the final squash merge commit.
