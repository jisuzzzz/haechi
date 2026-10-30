---
name: boundary-validation
---

## Do
Validate and handle errors where data enters: user input, files, network responses, configuration. Inside, trust the types and do not re-validate.

## Check
Flag validation missing at an entry point, and repeated validation deep inside code that already received checked data.
