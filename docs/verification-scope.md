# Verification scope after v0.0.8

Decision date: 2026-10-30

## Release decision

v0.0.9 removes the framework profiles, migration automation and Docker daemon management introduced in v0.0.8. It restores the v0.0.7 implementation, with a new version number. Published tags and release history remain available.

Haechi should help agents use the repository's verification commands and judge their evidence. The repository owns service preparation, database lifecycle and framework-specific conventions. Agents can follow those existing instructions when a task requires preparation; haechi does not need dedicated backend preparation skills for that work.

The rollback removes `python-backend`, `migrate` and `docker` skills, their executable helpers, framework hook injection and setup candidates. Their shared process runner has no remaining consumer and is removed too.

## Review of v0.0.7

The v0.0.7 verifier is Python-specific in its source-to-test mapping, but it does not require Django or FastAPI. Its test planning takes files, available runners and repository settings; it does not branch on either framework. A plain Python fixture with only pytest and Ruff dependencies produced no detected framework and still selected the configured test for a changed source file.

| Part | Assessment |
|---|---|
| Preserve repository test commands and their options | Fits haechi's verification role. The repository chooses how its tests run. |
| Detect test dependencies in `requirements-dev.txt` | Fits command discovery; it does not introduce framework workflow policy. |
| Report missing tools and unmapped sources as incomplete | Useful evidence handling. A skipped check should not count as a successful check. |
| `pythonTestMap` | Remains optional and unchanged in v0.0.9. Whether haechi should own this mapping, or rely on repository verification scripts, needs a separate design decision. |
| FastAPI/MySQL example | Demonstrates one verification path. It does not establish support requirements for all backend repositories. |

The existing `commands.verify` is the natural integration point for repositories that already have a verification script. The default verifier is a fallback. Before adding more language-specific mapping settings, validate whether that fallback is needed in real repositories and whether their existing scripts already select tests.

## Evidence limit to address separately

The default verifier checks command exit status, not test discovery counts. In an isolated fixture, a configured single-test command printed `no tests collected` and exited 0; with a successful lint command, the verifier reported `verification complete`. This follows the exit-status handling in [`verify-default.mjs`](../core/tools/verify-default.mjs), lines 141–150.

Therefore, its success result proves that the planned commands exited successfully. It does not independently prove that tests were collected or executed. This limitation is retained in the rollback and should be considered in the v0.0.7 design review, together with the source-to-test mapping. The setup skill already requires treating an exit-0/no-tests result as unverified when an agent checks command output.

Before changing the verifier, decide how the repository reports that tests actually ran. Do not invent runner-specific output parsing or a new generic mapping schema as part of this rollback.

## Updating from v0.0.8

- The `frameworks`, `migrations` and `docker` settings added in v0.0.8 are no longer consumed. Existing `pythonTestMap` and test commands continue to work.
- Remove references to the three removed skills or their tool paths from repository instructions if they were added. Use the repository's existing preparation commands when needed.
- Updating the plugin does not change existing databases, containers or daemon state.

## Rollback validation

- Compared `core/`, both generated distributions, `test/` and `examples/` with the v0.0.7 tag. Only the three plugin version fields differ after the release version update.
- The 60 relevant build, detection, hook and verifier tests passed with no skips.
- `npm run check` confirms all 123 generated distribution files match the shared source.
- Confirmed no executable or skill references to the removed helpers remain in the plugin.
- The plain-Python planning probe and the exit-0/no-tests fixture described above ran successfully; the temporary fixture was removed.
