# haechi 0.1.0

This minor release brings the common work contract, preview updates and explicit work-graph recording guidance together. It requires patched Node.js 24 LTS, with a minimum of 24.22.2. Update Node before using the new plugin; `.nvmrc` pins the repository development runtime. Keep the selected LTS line on its latest security patch.

## Changes

- Common pre-action, implementation, review and completion obligations have a shared owner. Task skills supply methods and explicit commands remain compatible.
- Later requests receive a reminder to assess applicable guidance and evidence. Codex session/repository state is isolated, and full rules recover after compaction, clear or missing/corrupt state.
- Worker packets include the common contract and its referenced principles. Shared source headers are grouped while source hashes, ownership and evidence checks remain intact.
- Preview remains supporting guidance, with direct main-session inspection, shared UI-design principles and disposable prototypes served on localhost. Checked design references carry into authorized implementation.
- Work-graph guidance defines initial registration and update timing, retains relevant resumption information, preserves valid user instructions through partial corrections and keeps durable results outside the next-action field.

## Compatibility

The minimum Node version rises from 20 to 24.22.2. This is an intentional compatibility change in the pre-1.0 minor release. Plugin users do not need a TypeScript compiler or a database server.

Work-graph storage remains the existing repository-local JSON file. Its schema, data and native session links do not migrate. This release adds no SQLite storage, automatic context-compaction policy, per-request recording receipt, semantic classifier or Stop-hook completion gate. Existing hook review requirements still depend on the host and installed changes.

## Verification scope

The release is checked on Node 24.22.2 with source type checking, both generated distributions and individually invoked repository tests. Public CI also runs each test file separately and checks publication patterns.

The final macOS run executed all 30 test files: 367 tests passed, no tests failed and two Windows-only tests were skipped. Those skips cover Windows path/case behavior and are not counted as Windows verification. `npm run check` passed with 247 generated files current, and all three plugin manifests identify 0.1.0.

See [workflow validation](workflow-validation.md) for the earlier controlled model and installed-Codex observations and their limits. Those historical results are not a fresh test of every 0.1.0 instruction or host. Work-graph verification covers the authored guidance, packaged delivery and preservation of existing recording mechanics; model decisions can still omit or misclassify work. Claude-native delivery, universal skill compliance and a runtime completion lock are not claimed.
