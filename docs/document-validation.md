# Document feature validation

The document skill supplies authoring scaffolds and evidence-handling tools. Human readability and an automatic writing-quality improvement remain unverified. Two reader/decision comparisons rejected the proposed routing changes; those candidates are not included in this release.

## 1. Delivered behavior

The English maintained kit has 18 Parts, six default combinations, required/conditional/optional information and reviewer scopes. Work documents follow the recipient's language, start from the current need, and use a summary, linked numbered sections and final evidence notes. Missing execution, result, assignment or historical-review records remain unconfirmed. Reported completion retains its actual source and scope; it is not independent verification or approval of a new document.

Existing browser-helper/Playwright capture procedures feed a separate numbered-border PNG. The original stays available. GIF is optional for motion or ordering questions. Captures and reviewer sign-off are never invented when access or records are absent. The maintained examples are synthetic illustrations, not company requests or runtime evidence.

## 2. Reproduce the mechanical checks

Use Node.js 24 from a clean checkout:

```sh
npm run build
npm run check
node --test test/build.test.mjs
node --test test/document-template.test.mjs
node --test test/screenshot-annotate.test.mjs
node --test test/document-quality-eval.test.mjs
```

These tests generate small synthetic fixtures in temporary directories. They check nested text/binary asset packaging, template composition and Korean/English navigation/endnotes, original-preserving PNG annotation, and evaluation-record integrity. They do not reproduce a company application, independent human reading or the historical model experiments.

`tools/document-quality-eval.mjs` is the relocated legacy baseline-diagnostic verifier. Run it with `--root <saved-evaluation-directory>` and optionally `--preflight`. It checks the old six-type, two-trial, six-question schema and its saved hashes, links and coverage. It neither grades writing nor accepts the later reader/decision study schema. No frozen package copy or historical run bundle ships with it.

## 3. Historical findings

The later studies separated locked main-only answers from lookup in current references. Both sides used matched CLI defaults in fresh contexts, with independent source-aware judgments. File-access separation was instructed and audited, not an operating-system read jail. The exact model identifier was not exposed.

| Study | Cases | Fresh writers / readers / source judges | Adoption |
| --- | ---: | ---: | --- |
| First reader/decision comparison | 4 | 16 / 16 / 4 | Rejected |
| Revised comparison | 5 | 20 / 20 / 5 | Rejected |

Each used two trials per variant and case. The cases retained the three full original request scopes and added neighboring retirement/cache cases. Candidate failures included lost contract qualifiers, decision conditions moved out of the main text, and unknown assignment stated as unassigned. Baseline documents also had errors. Audits found inconsistent answer aggregation and questions that did not expressly ask for all the answer-key details; historical results remain unchanged rather than being regraded into success.

Three later examples were edited with the answer keys and separately checked. They are editorial artifacts, not blind authoring trials or evidence of template improvement. Their 129 selected semantic units included 118 main/reference obligations and 11 permitted omissions. Imaging retained an undefined source-policy/instrument gap. Shorter main text did not always mean a smaller total document-and-reference bundle. Human participants: **0**.

The published kit is not byte-identical to the frozen experiment snapshots: language maintenance, index consistency and synthetic-example provenance were curated separately. Its deterministic tests establish mechanics, not a writing-quality advantage. Actual frontend/backend readers still need to validate decision relevance, necessary explanation, effort and preferred length before a team treats the kit as its writing standard.

## 4. Evidence identifiers and retention

The original local sources, prompts, judgments and snapshots remain preserved under the maintainer archive ID `document-decision-evidence`. The local source-archive commit is `e7994fe093cc9ab98d7383a0c454ec1e0341212b`; it is intentionally absent from this PR's ancestry. These identify retained evidence, not public download links.

Frozen plan SHA-256 identifiers:

- First comparison: `8ae9330ed287960bc58ff7498c215bc0ba77879d9ac78ea5622d3a37f8b583c5`.
- Revised comparison: `1c884f6cf73b8cab357cf755ca5b63f3c232c2292e5230091db5bdde6a8fb010`.

Historical semantic reruns require that separate archive and its original execution conditions. The commands above reproduce public mechanical checks only. Raw session logs, judge packets, copied harnesses, company originals and full run snapshots are excluded from the release branch. Future quality claims require a separately frozen evaluation and actual reader evidence, rather than this publication step.
