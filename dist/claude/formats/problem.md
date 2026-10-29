# Format B — problem

Optional example for explaining a bug or failure. Include the symptom, the evidence for its cause, and what would resolve it.

A table can help with several findings; a short paragraph often explains one problem better. Adapt the labels and omit unneeded sections. When answer formats are disabled, do not load or apply this example unless the user requests it.

| Label | Meaning |
|---|---|
| Symptom | What was observed, and the conditions that reproduce it. |
| Cause | The cause, tagged with how far it is proven: guess, code evidence, or ran it. |
| Fix | The proposed fix and any decision the user needs to make. |
| Expected | What will be different after the fix, and how to check it. |

## Example

| Item | Details |
|---|---|
| Symptom | `/api/orders?page=2` repeats the last order from page 1. |
| Cause | The offset subtracts 1 after multiplying (ran it). |
| Fix | Use `(page - 1) * size`. |
| Expected | Page 2 starts at order 21; the regression test passes. |

With `page=2, size=20`, the old formula gives offset 39. The test "page 2 starts after page 1" fails on the old formula and passes with the fix. Cursor paging is outside this fix's scope.

File: `orders/list.ts:41`.
