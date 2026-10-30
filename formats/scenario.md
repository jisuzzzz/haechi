# Format C — scenario

Optional example for explaining a change or behavior. In a review, describe the observed problem and its consequence without implying a fix has been made.

Use a concrete example when it helps. A Before/After table is useful for comparing several changes; prose or a list may be clearer for one. Adapt the labels below and omit unneeded sections. When answer formats are disabled, do not load or apply this example unless the user requests it.

| Label | Meaning |
|---|---|
| Example | One concrete case with real values and screen or endpoint names; the opening sentence can carry it without a label. |
| Before → After | A comparison table. Number the steps when there are several and mark changed steps. |
| Also applies | Other relevant cases, only when useful. |
| Unchanged | Behavior the reader needs to know stays the same. Omit it when obvious. |
| Why | A short reason below the table, when needed. File locations go last. |

## Example

A user marks "Pay invoice #7" done in a list with 4 open todos.

| Step | Before | After |
|---|---|---|
| 1 | Click the checkbox. | Click the checkbox. |
| 2 (changed) | The todo moves to the bottom. | The todo moves to "Done". |
| 3 (changed) | The counter still says 4 open. | The counter says 3 open. |

The counter read a cached list instead of the updated one. The fix also covers marking done from search results and the keyboard shortcut.

File: `todos/useOpenCount.ts`.
