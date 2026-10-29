# Format B — problem

Use it when behavior differs from what was expected: a bug, an error or log line and "why does this happen", a CI failure's cause.
Do not use it for plain facts or for explaining a change (that is format C).

Use a two-column Markdown table for a short overview. Keep the labels below in their relative order when used; omit empty items. Keep cells short and put longer reasoning below the table. Use format A when the fix needs a choice. Write rendered Markdown, not a code block or text aligned with spaces.

| Label | Meaning |
|---|---|
| Symptom | What was observed, and the conditions that reproduce it. |
| Cause | The cause, tagged with how far it is proven: guess, code evidence, or ran it. |
| Fix | The proposed fix; use format A (choice) when the user needs to choose. |
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
