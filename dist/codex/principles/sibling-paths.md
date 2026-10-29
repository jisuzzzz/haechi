# sibling-paths

## Do
Most bugs are a rule applied on one path and missing on its sibling. For each guard, comparison, dedupe or normalization in a change, list the paths that must obey the same rule — display vs save, existing vs incoming, add vs move or remove, common vs edge format — and check those first.

## Check
For each rule in the diff, name the sibling paths and confirm each applies it; a missing one is a defect with both locations.
