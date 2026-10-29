# Format C — scenario

Use it to explain a change (the done report), to answer "how does this work", and to report review defects.
Do not use it for plain facts, simple questions or answers a rule already settles.

Fixed labels in this order. Write `—` for an empty slot.

| Label | Meaning |
|---|---|
| Example | One concrete case with real values and screen or endpoint names. |
| Before → After | The steps of that case, numbered, side by side. Mark the steps that changed. |
| Also applies | Other cases the same rule covers. |
| Unchanged | What stays as it was. |
| Why | The reason in one line. File locations go last. |

## Example

```
Example:        A user marks "Pay invoice #7" done in a list with 4 open todos.
Before → After: 1. Click the checkbox                     | 1. Click the checkbox
                2. The todo moves to the bottom            | 2. The todo moves to "Done"  (changed)
                3. The counter still says 4 open           | 3. The counter says 3 open   (changed)
Also applies:   Marking done from the search results and from the keyboard shortcut.
Unchanged:      Undo, sorting of open todos, the API call.
Why:            The counter read a cached list instead of the updated one — todos/useOpenCount.ts.
```
