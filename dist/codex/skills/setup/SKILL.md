---
name: setup
description: Optionally diagnose Haechi installation and discover repository execution settings without writing repository files. Use when the user requests /haechi:setup or asks to check their installation or execution settings.
---

# Haechi setup diagnostics

Use this command when requested. Normal tasks can start immediately and resolve commands from repository instructions and project configuration as needed.

Run the relevant read-only tools from the plugin's `tools/` folder, two levels above this skill:

- `node <tools>/detect.mjs <repo root>` finds candidates from project files and reports existing `.haechi.json` settings as `existingSettings`. Use existing settings and repository instructions to resolve task commands, then use the candidates to fill gaps.
- `node <tools>/check-user.mjs` checks installed tools, plugin installation and Codex hook trust. Use it when the user asks about their machine or installation. If Codex hooks need trust, tell the user to open a fresh Codex session and use `/hooks`.

Report the applicable settings, their sources and any details the user asked to check that remain unresolved. Detection supplies candidates. When asked to verify a command, run the smallest relevant check permitted by repository instructions and inspect whether it exercised the intended files or tests.

Treat existing `.haechi.json` files as read-only. Leave the repository untouched during diagnostics. If the user explicitly asks to save personal preferences, update only `~/.haechi/user.json` and preserve its other keys. Personal preferences include `notesDir` for files kept outside repositories and `openReports` for opening screen reports automatically.
