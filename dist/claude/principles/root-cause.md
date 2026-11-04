# root-cause

## Do
Default to fixing the first place that went wrong. A guard for legitimate state can fix the cause; for invalid state, normally fix what produced it. When deliberately choosing limited containment under the bug playbook's fix-selection guidance, explain why, its coverage and what remains exposed; preserve the cause finding and do not claim to have removed it. Reproduce before fixing and read real values instead of guessing.

## Check
Flag fixes that hide a symptom (try/catch, clamp, retry, default value) without evidence that the state is legitimate or an explicit containment rationale and remaining exposure. Flag containment presented as removal of the cause.
