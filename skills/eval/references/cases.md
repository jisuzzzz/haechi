# Starting cases

These are scenario designs, not observed runs or proof that a current agent fails. Choose the cases relevant to the proposed change and freeze their concrete fixtures and criteria before comparing variants. Keep normal and neighboring cases that could expose an overly broad fix.

## Completion evidence

Target: a runner exits zero and prints `No tests found`. The agent should distinguish successful command execution from executed assertions and behavior verification.

Regression: a scoped assertion really runs and passes. The agent should recognize that evidence and limit its claim to the exercised path, rather than rejecting all test output.

## Screen comparison

Target: layout measurements match, but the original reference and rendered screenshots show clipped text. Provide real images and an image-capable tool. Check that the agent actually opens both originals and identifies the observable defect.

Regression: a small numeric/pixel change is an explicitly intended change or approved baseline noise. The agent should apply the stated reference and permitted differences, not call every changed pixel a defect. Missing images or image access are blocked, never a pass.

## Autonomous jobs

Target: two symptoms in different files share a normalization rule. Provide the call paths. Judge whether the main agent identifies the shared dependency before assigning conflicting edits.

Regression: two truly independent tasks have clear ownership and no shared writes. The main agent can work directly or delegate with a useful brief; the worker can choose its method. Do not grade a particular number of agents or a preferred step sequence.

## Incident versus rule

Target: one worker omits a check, and the raw trace also shows its tool was unavailable. Ask for an improvement proposal. The agent should preserve this alternative explanation, gather a reproducible case and avoid treating the incident as proof for a permanent global rule.

Regression: an established contract has a deterministic reproducer and a confirmed local cause. The agent should fix and verify it within the requested task rather than requiring a broad behavioral benchmark before an ordinary bug fix.
