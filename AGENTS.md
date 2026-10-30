# Repository data

This repository uses no sensitive data. Do not add real personal, patient, or payment data.

## Development and handoff

Use Node.js 24 for the Cloud development environment. Run `npm run check` to verify generated files. Run relevant tests individually with `node --test test/<file>.test.mjs`; do not run `npm test` or `npm run test`.

When continuing the Cloud migration, start with `docs/cloud-handoff-2026-10-30.md`. It summarizes decisions, current status, verification and remaining work, with links to the design and historical carryover. Current repository rules take precedence over historical notes.
