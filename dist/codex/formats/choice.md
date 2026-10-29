# Format A — choice

Use it when a decision is needed and there are two or more approaches whose results really differ: they touch different files, change different contracts or add different features, or one is costly to undo.
Do not use it for plain facts, choices a repo rule already settles, or trivial differences. Ask each open decision in this format, all of them in one message.

Compare options in a Markdown table with short cells. Put the recommendation and longer reasons below the table. Keep the labels below in their relative order when used; omit items that add no information. Write rendered Markdown, not a code block or text aligned with spaces.

| Label | Meaning |
|---|---|
| Options | One row per option, with columns for its pros, cons and trade-off. |
| Fastest | The option that ships soonest, when useful to the decision. |
| Root fix | The option that removes the cause. Combine with Fastest when they are the same; mark it when it is out of scope. |
| Recommend | The option you would pick, and why in one line. |

## Example

| Options | Pros | Cons | Trade-off |
|---|---|---|---|
| 1. Format `dueDate` in each of the 3 screens. | No shared helper change. | The 3 copies can drift apart. | Less work now, more maintenance later. |
| 2. Pass the user's locale to `formatDate` in all 3 screens. | One shared rule. | Changes the helper and tests for 12 callers. | More work now, fewer separate fixes later. |

| Item | Choice |
|---|---|
| Fastest | Option 1. |
| Root fix | Option 2. |

**Recommend:** Option 2. The 3 screens already disagree on the day-month order, so a fourth copy would repeat the bug.
