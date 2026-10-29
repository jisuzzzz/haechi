---
name: dry
---

## Do
Share repeated logic or markup when it represents the same rule. Repeated calls to the same component or helper are not duplication. A separate file or abstraction can have one caller when it clarifies a responsibility, isolates a dependency or makes behavior easier to test. Prefer the simpler local implementation when separation adds no benefit.

## Check
For harmful duplication, quote both copies and explain which shared rule can drift. For an unnecessary layer, explain the extra work it causes and where the logic fits better. Caller count alone is not a defect.
