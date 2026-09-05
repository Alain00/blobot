Type: grilling
Status: open
Blocked by: 20, 21

# Reevaluate the first Machine engine with the measured trade-offs

## Question

After both comparison research tickets are resolved, is it worth changing blobot's first
Machine engine to vanilla Docker Engine, or should we continue with `sbx`? Decide with
Guillermo through **grill-with-docs**, not by substituting the agent's preferences for his.

## Session boundary and method

This is a **later-session HITL decision**, not work for the session creating it. Read both
research artifacts and the current implementation first; use `grill-with-docs` with its
grilling and domain-modeling skills. Ask only choices whose factual prerequisites are settled.
If evidence is insufficient, name the missing fact and obtain it safely rather than asking
the author to guess or declaring a winner from the Eve comparison alone.

## Decision to resolve

- Compare both candidates against the author's requirements: own Machine per Agent, preserved
  data, editable maximum CPU/RAM rather than reservations, warning before interrupting work,
  simple settings, low overhead, idle sleep, message wake and truthful visual state.
- Make any isolation/egress/root/inner-Docker/login difference explicit. A simpler persistence
  mechanism does not silently authorize changing the microVM boundary or trust promises.
- Weigh native capabilities, the surrounding code and operational burden, remaining work,
  retained reusable implementation, migration/recovery risk and platform/distribution friction.
  Sunk implementation effort alone is not a reason to keep an engine or discard it.
- Choose **continue sbx** or **change engine**, with conditions and reasons approved by Guillermo.
  If neither can be accepted yet, record the precise unresolved branch instead of a false close.

## Completion and authorized plan changes

Record the author's answers and explicit final decision. Only **after** that decision may
this ticket update the remaining map and dependent tickets: reaffirm the route, or reopen the
affected decisions and define the migration/validation/rollback order. Keep still-valid work.
Use an ADR only if the domain-modeling criteria warrant one; amend the glossary only if a
domain meaning changes. The research tickets themselves authorize none of these plan changes.

No implementation of an engine switch in this ticket without an explicit additional request.
Link the decision from the map and hand off the newly agreed next work.

## Starting context

- [Current completion/activation boundaries](../build.md), implementation commit `5d2edd9`.
- [Lifecycle, persistence and resource research](20-engine-lifecycle-persistence-and-costs.md).
- [Isolation, network and product research](21-engine-isolation-egress-and-product.md).
