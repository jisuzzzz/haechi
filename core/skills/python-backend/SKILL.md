---
name: python-backend
description: Apply Django or FastAPI workflow rules to Python backend changes, using configured framework profiles and the repository's test and database setup.
---

# Python backend workflow

Use the profiles in `.haechi.json` `frameworks`: `python-django` and `python-fastapi`. An explicit `[]` disables automatic framework guidance; apply it only if the user explicitly requests it. If the setting is absent, inspect the repository before choosing a profile. Apply only the framework relevant to the changed paths; a mixed repository may use both. These rules supplement the task's bug, feature or refactor playbook.

## Django

- Trace model changes through serializers or forms, views, ORM queries and constraints that depend on them. Verify API and persisted behavior with the repository's explicit test scope.
- When models change, inspect the migration history and generated migration operations together. Review data conversions, defaults, constraints and dependencies before applying migrations. Do not rewrite migrations already shared or applied without established authorization.
- Keep tests on the documented test database. Respect the repository's transaction fixtures and Django test settings; do not substitute the development database when test setup is missing.

## FastAPI

- Check request validation, response models and status codes at the HTTP boundary, including failure cases affected by the change.
- Preserve dependency override cleanup and lifespan startup/shutdown in tests. Use the repository's existing TestClient or async client setup so the test exercises the application's actual dependencies.
- Follow the existing sync or async session and transaction ownership. Check commit, rollback and connection cleanup where a change crosses a request or dependency boundary.
- Identify migration tooling from repository configuration. FastAPI does not imply Alembic, SQLAlchemy or any particular database.

## Database and service preparation

Keep test selection separate from environment preparation. The default verifier uses `pythonTestMap` and `commands.testOne`; it does not start services or apply migrations. Report missing prerequisites as unverified.

When schema preparation is needed, use /haechi:migrate to inspect the configured plan and actual database target, apply within the user's authorization, and check the resulting state. When the repository depends on Docker, use /haechi:docker to check the configured context and manage the local daemon only as needed. Configuration is not authorization to change a database or stop a shared daemon. Reuse authorization already given in the conversation.
