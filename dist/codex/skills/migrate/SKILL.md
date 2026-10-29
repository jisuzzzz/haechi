---
name: migrate
description: Plan, check or apply repository-configured database migrations for a local or test database. Use when a task needs migration preparation or the user asks to run migrations.
---

# Database migrations

Use the repository's migration tool and existing environment. `migrate.mjs` lives in `../../tools/` relative to this skill. It reads the optional `migrations` object from `.haechi.json`:

```json
{
  "migrations": {
    "environment": "test",
    "plan": "python manage.py migrate --plan",
    "apply": "python manage.py migrate --noinput",
    "check": "python manage.py migrate --check"
  }
}
```

These are trusted repository shell commands. Preserve virtual-environment prefixes, settings flags and container wrappers. Keep credentials in the environment. Command output passes through unchanged; use commands that do not print credentials or sensitive rows. `environment` must be `local` or `test`; the label does not prove which database the commands actually reach. Confirm the selected database through repository configuration and the current environment without printing credentials. Do not infer Alembic from FastAPI alone.

Run `node <tools>/migrate.mjs plan <repo-root>` to display the migration tool's plan. Run `check` to execute its completion check. Both commands can connect to the database; inspect custom commands before using them. They must be read-only. All three command fields are required so preparation cannot leave an unverified apply path.

Before applying, review the migrations and reuse authorization already given for this database and operation. If the target or permission is unresolved, present the plan and resolve that question first. Once authorized, run:

```bash
node <tools>/migrate.mjs apply <repo-root> --execute
```

The tool runs plan, apply and check in order, stopping at the first failure. `--execute` expresses CLI intent; it does not replace conversation authorization. A successful apply without a successful check is incomplete. After five minutes the tool terminates the local command process group on POSIX or process tree on Windows. SIGINT and SIGTERM also terminate active local command trees before the tool exits. Detached processes, container commands and server-side database queries may continue; confirm they stopped before retrying. A timeout or interruption does not roll back database changes. An apply failure can leave partial changes; inspect state before deciding what to do next. Do not automatically retry, roll back, reset data or mark migrations as applied.

Generate migration files with the repository's native tool when the task requires them, then review the generated diff before applying. The automation does not generate or rewrite migration files. For Django, check model changes separately with the repository's `makemigrations --check --dry-run` command. For Alembic, preserve the repository's branch/head conventions and configure an actual completion check; an informational `current` listing alone does not prove the database reached the intended head.

The default verifier does not prepare databases. Start required services separately, prove readiness, then run migrations and the affected tests. Report the selected database scope without secrets, which stages passed, and any failed or unverified stage.
