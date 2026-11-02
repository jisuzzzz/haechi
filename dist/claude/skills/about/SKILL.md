---
name: about
description: Explains what the haechi plugin is and what this build includes. Use when the user asks what haechi is or whether it is installed.
---

# About haechi

haechi is an agent workflow plugin for Claude Code and Codex. It routes each request to a playbook, delegates to subagents when that pays off, and calls work done only with evidence.

This build has setup (`/haechi:setup`), the playbooks (`bug`, `feature`, `refactor`, `perf`, `review`, `test-hardening`), the procedures they call (`spec`, `sweep`, `plain`, `document`, `request`, `review-diff`, `impact-map`, `mutation-check`, `sibling-path-map`), the git skills (`commit`, `mr` for GitLab and GitHub, `ci-watch` with cleanup after merge for GitLab) and one generic worker definition.

The main session owns the playbook and selects a delegated step. Each playbook explicitly names its required skills, principle sections, context fields, repository scope and completion evidence. `/haechi:delegate` validates the task brief and assembles their complete bodies for a fresh worker. The worker has no preset model, effort or tool list; host/session settings and explicit dispatch restrictions apply. Independent review uses a separate execution. Packet validation proves composition, not delivery, compliance or correctness.

`/haechi:document` composes cross-team documents from 18 shared Parts and six situational templates. It connects existing screenshot capture procedures to separate PNG copies with numbered borders and document attachments; GIF is optional when motion matters. `/haechi:request` uses the same writing system for requests and replies.
