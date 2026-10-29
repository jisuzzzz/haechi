# Format C — scenario

Use it to explain a change (the done report), to answer "how does this work", and to report review defects.
Do not use it for plain facts, simple questions or answers a rule already settles.

Start with a concrete example in one sentence, then use a Before/After Markdown table. Number steps when there are several and mark the changed ones. Keep cells short; put reasons and longer explanations below the table. Use the labels below only when needed, in their relative order. Omit empty or obvious sections. Write rendered Markdown, not a code block or text aligned with spaces.

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
