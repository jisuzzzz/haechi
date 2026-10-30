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

## Command evidence limits

The default verifier checks command exit status, not test discovery counts. A configured single-test command can print `no tests collected` and exit 0. With a successful lint command, [`verify-default.mjs`](../tools/verify-default.mjs) now reports `commands complete` and explains that successful commands do not prove tests were collected or executed. It preserves the command output for review. A failed command still exits 1; skipped checks still exit 2 when no command fails.

Its success result proves that the planned commands exited successfully. Agents must judge test execution from the repository's own output. The setup skill already requires treating an exit-0/no-tests result as unverified when an agent checks command output. The fallback adds no runner-specific output parsing, test count detection or new mapping settings.

The mutation checker has the same limit: `killed` means the command failed with a mutant in place. It does not independently prove that an assertion caught the behavior change. Failed runs retain the last 4,000 characters of combined output, exit code, signal and any spawn error, so agents can distinguish assertion failures from parse, import or runner errors. Existing mutant statuses and command selection remain unchanged.

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
