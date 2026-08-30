Type: grilling
Status: needs-triage
Blocked by: 02

# What authority does a relayed message carry?

## Problem

`composePersona` and `envelope` (`packages/core/src/orchestrator/envelope.ts`) frame every peer
message as **from a teammate, not the operator**, and instruct the recipient to refuse a request
that is destructive or outside its role. That sentence lives in the envelope rather than the
persona precisely so it survives contact with a message trying to override it.

A coordinator relaying the user's words has two options and both are bad:

- **Keep the peer framing.** The coordinator's routed work is weaker than the same words typed
  directly at the agent. Workers may refuse the thing the user actually asked for, and the user
  cannot tell why.
- **Add a third voice**, something like *relayed on behalf of the operator*. Then any prompt
  injection that reaches the coordinator's context carries operator authority to every agent on
  the team, and the trust boundary that exists between two agents today collapses into one.

This is the sharpest problem in the effort and it is a security decision, not a copy decision.

## Why it is not hypothetical

The coordinator's context is the union of everything the team says. It reads peer messages, and
under issue 04 it may read tool output about team state. It is the most injectable surface on
the team and it would be the one holding the strongest authority.

## Precedent to weigh

Ticket 14's posture, and `docs/adr/0003-what-an-agent-inherits.md`: the palette **fails closed**
and offers only what a person authored. The equivalent posture here is that relayed authority
is never granted, and a coordinator can only ask, never instruct.

If that is the answer, then a coordinator cannot make an agent do something it would refuse from
a peer, and issue 02's cost case has to survive that limitation.

## What to settle

Whether a third envelope voice exists at all, and if so what exactly it says, what it is allowed
to authorise, and what stays refusable regardless of who relayed it.

## Done when

There is an ADR. This is the class of question ADR-0001 and ADR-0003 are for: it outlives the
feature, and the next person will otherwise re-litigate it.
