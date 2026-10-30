# Format A — choice

Optional example for a decision with meaningful trade-offs. Use it when comparing options helps the user choose. Existing authorization and repo decisions still apply; the format itself never creates a need to ask.

A table can make several options easier to compare. For a simple choice, use a sentence or short list. Adapt the labels and order below to the task. When answer formats are disabled, do not load or apply this example unless the user requests it.

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
