# Task provenance

Expanded tasks were designed from recorded failure causes and public repository issues. Distinguish SWE-bench tasks that fix the original repository bug from custom tasks that reproduce the same failure mechanism in small React/FastAPI projects.

- React request ordering and export: asynchronous response ordering and pagination/search state.
- FastAPI caching and reservations: tenant-specific cache separation and atomic SQLite transactions.
- Verification reporting: zero executed tests or failed tests do not pass merely because the command exits zero.

Preserve [sources and applicability](provenance.json), [upstream source hashes](upstream-source-hashes.json) and [SQLite-related source hashes](sql-upstream-source-hashes.json). A tool reproduction without the original conversation does not establish that an agent actually made a false completion claim.

Reproduction logs, component execution results and historical verifier replay scripts remain at the corresponding paths in the preserved local source workspace. Public PRs exclude repeated execution material. Storage locations and identifiers are in the [evidence index](../evidence-index.json).
