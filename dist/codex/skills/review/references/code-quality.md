# Code quality review rubric

Use this rubric for both changes and existing code. Review behavior and contracts as well; this rubric supplies the quality questions, not a score or a pass/fail gate. It does not authorize edits or a fix-and-recheck loop.

Read the relevant linked principles for detailed criteria. Use [evidence-levels](../../../principles/evidence-levels.md) for every finding. Prefer the repository's explicit rules and confirmed contracts over assumed framework conventions.

## Review questions

| Area | Questions | Principles |
| --- | --- | --- |
| Responsibility and boundaries | Does each part have a clear responsibility? Does splitting or combining code help readers follow it and callers use it? Where does the current boundary cause extra work? | [KISS](../../../principles/kiss.md), [DRY](../../../principles/dry.md) |
| Dependencies and data flow | Can readers trace dependencies, state ownership and updates? Does the code respect the repository's dependency boundaries? Is the same fact owned in several places that can disagree? | [KISS](../../../principles/kiss.md), [DRY](../../../principles/dry.md) |
| Duplication and abstraction | Do repeated blocks implement the same rule and need to change together? Does a shared implementation already fit? Does a wrapper or layer clarify a responsibility or merely add steps? | [DRY](../../../principles/dry.md), [YAGNI](../../../principles/yagni.md), [KISS](../../../principles/kiss.md) |
| UI component reuse | Could an existing component or a small compatible extension meet the new component's required appearance and behavior? What would that extension change for existing consumers? | [DRY](../../../principles/dry.md), [KISS](../../../principles/kiss.md) |
| Readability and simplicity | Do names and control flow explain what happens? Can code be removed or simplified without losing required behavior or clarity? Are options, branches or optimizations justified by a requirement or reachable state? | [KISS](../../../principles/kiss.md), [YAGNI](../../../principles/yagni.md) |

When the target handles user input, files, network responses or configuration, also read [boundary-validation](../../../principles/boundary-validation.md). Check where data is validated before calling an internal check redundant.

## Evidence and counterexamples

- For a boundary or abstraction concern, name the extra steps a reader or caller must follow and the concrete cost. A small file, a single export or one caller is not a problem by itself. A helper that isolates a dependency can be useful with one caller.
- For duplication, quote both locations and name the shared rule that can drift. Similar markup or repeated calls to the same primitive are not enough. Similar code with different reasons to change may belong apart.
- Before recommending reuse, open the shared implementation and check that it supports the required behavior. Before moving state or code, inspect its consumers and relevant tests. An intentional editing draft is not automatically an unnecessary copy of server state.
- For unnecessary UI duplication, cite the new and existing components, the shared requirement, and how the existing API or a small compatible extension covers it. Check the effect on existing consumers. A separate component is justified when reuse would mix responsibilities or change their behavior; similar appearance alone does not establish duplication.
- For readability, point to an ambiguous name, condition or indirection and explain what makes the behavior hard to understand. Different import order, file length or comment style alone is taste unless it violates an explicit repository rule.
- Check applicable questions without inventing a finding in every area. If a needed contract or dependency is unavailable, state the open question and the limit of the review instead of assuming a violation.

## Findings

Use the existing review report; no separate scorecard is needed. Report each issue once with its location, evidence and consequence. For an improvement suggestion, explain the current cost and a smaller alternative without calling it a proven behavior defect. Keep such suggestions in report-only findings; unresolved facts belong in open questions. A demonstrated wrong result or contract violation belongs in defects under review-diff's evidence rules.

Stay within the review scope. Report relevant problems outside the editable files without expanding edit permission. A finding that breaks a required outcome still matters outside those files. No findings is a valid result and does not prove unchecked behavior.
