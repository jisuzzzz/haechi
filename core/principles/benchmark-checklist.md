---
name: benchmark-checklist
---

## Do
For every measurement: name the limiter; run every side tuned the way production runs; check the arithmetic against limits (removing 10% of the work cannot make it more than about 11% faster); count errors and non-success results; repeat at least five times, alternating sides; measure the end-to-end path a user waits on; confirm the work actually ran inside the timed region.

## Check
Each item above, answered from the raw data. Missing any of the limiter, tuning or ran-at-all checks makes the verdict inconclusive.
