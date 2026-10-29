# behavior-tests

## Do
Assert what users of the code observe: return values, rendered output, requests made, data written. Two checks for every test: breaking the behavior must make it fail, and changing only internals must keep it passing. Expected values come from requirements, not from running the code.

## Check
Flag tests that still pass when the behavior breaks (loose assertions, expected values copied from output) and tests that fail on internal-only changes (asserting private calls, internal state, render structure).
