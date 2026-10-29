# dry

## Do
Extract logic or markup that repeats in two or more places, and decide where it lives. Repeated calls to the same component or helper are not duplication. Do not create an abstraction or a new file that has only one caller.

## Check
Quote both copies of a repeated block and say where it should live. Flag a new file, wrapper or layer that has one caller or only passes arguments through, and name the existing module it belongs in.
