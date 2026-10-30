# Investigation techniques

Choose a technique when it can distinguish the causes still in play. These are optional probes, not a checklist for every bug.

## Several causes fit

Name the plausible explanations and choose the cheapest observation that separates them. Test one hypothesis at a time and keep the evidence against it as well as for it. No fixed number of hypotheses or agents is needed.

## A failure crosses components

Compare input, output and required configuration at the suspected boundaries, such as CI to build process or API to worker. Check presence and shape without logging secrets or whole payloads. Temporary instrumentation should identify the failing boundary and be removed when no longer needed.

## A test passes alone but fails in a group

Keep the failing run's actual order. Confirm the victim passes alone and fails after its predecessors, then reduce those predecessors to locate the polluter. Repair leaked environment, mocks, module state, servers or temporary resources where they are owned; do not hide the leak with a defensive reset in the victim. Stay within the repository's allowed test scope.

## A race depends on execution order

When practical, use controlled promises or test barriers to reproduce the harmful interleaving. Assert the required outcome, such as one winner or no lost updates, rather than only the absence of exceptions. Avoid production-only hooks or arbitrary delays just for a test.

## A test is flaky

If elapsed time is not the behavior under test, wait for an observable condition rather than a fixed sleep, reading fresh state on each probe. After changing waits or timeouts, confirm that a known regression or forced bad interleaving still fails. Repeat only enough to answer the remaining uncertainty; do not weaken assertions to obtain stability.
