---
name: root-cause
---

## Do
Fix the first place that went wrong, not the place where it shows. Add a guard only when the state it handles is legitimate; otherwise fix what produced the state. Reproduce before fixing and read real values instead of guessing.

## Check
Flag fixes that hide a symptom (try/catch, clamp, retry, default value) without naming why the state is legitimate.
