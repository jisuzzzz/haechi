# agent-defects

## Do
Watch for the defects agents actually produce: a rule on one path only; a final-looking empty state while data is still loading; one field used as both lookup key and identity; null ids matching each other; leftovers after a move or split; another area's internal file imported instead of shared state; a new context or global field where a prop would do; the same fact held in two places.

## Check
Look for each of these in the diff first, with the input or state that produces the wrong result.
