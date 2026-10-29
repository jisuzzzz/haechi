# Format B — problem

Use it when behavior differs from what was expected: a bug, an error or log line and "why does this happen", a CI failure's cause.
Do not use it for plain facts or for explaining a change (that is format C).

Fixed labels in this order. Write `—` for an empty slot.

| Label | Meaning |
|---|---|
| Symptom | What was observed, and the conditions that reproduce it. |
| Cause | The cause, tagged with how far it is proven: guess, code evidence, or ran it. |
| Fix | The options in format A (choice); one line per option when they are simple. |
| Expected | What will be different after the fix, and how to check it. |

## Example

**Symptom:** On `/api/orders?page=2` the first order of page 2 is the last order of page 1. It happens on every page after the first.

**Cause:** `offset = page * size - 1` in `orders/list.ts:41` (ran it: page 2 with size 20 gives offset 39).

**Fix:**
1. Use `(page - 1) * size`. Fastest = Root fix.
2. Switch to cursor paging. Out of scope.

**Expected:** Page 2 starts at order 21. To check, the new test "page 2 starts after page 1" passes, and it fails on the old line.
