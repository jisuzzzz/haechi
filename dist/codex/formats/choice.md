# Format A — choice

Use it when a decision is needed and there are two or more approaches whose results really differ: they touch different files, change different contracts or add different features, or one is costly to undo.
Do not use it for plain facts, choices a repo rule already settles, or trivial differences. Ask each open decision in this format, all of them in one message.

Fixed labels in this order. Write `—` for an empty slot.

| Label | Meaning |
|---|---|
| Options | Each option with pros / cons / trade-off. One line each when they are simple. |
| Fastest | The option that ships soonest. |
| Root fix | The option that removes the cause. Write "Fastest = Root fix" when they are the same; mark it when it is out of scope. |
| Recommend | The option you would pick, and why in one line. |

## Example

```
Options:    ① Format the date in each of the 3 screens that show `dueDate`
               pros: no shared change / cons: 3 copies drift apart / trade-off: fast now, costly later
            ② Change `formatDate` to take the user's locale and use it in all 3
               pros: one rule / cons: touches a shared helper and its 12 callers' tests
Fastest:    ①
Root fix:   ②
Recommend:  ② — the 3 screens already disagree on the day-month order, so a fourth copy would repeat the bug.
```
