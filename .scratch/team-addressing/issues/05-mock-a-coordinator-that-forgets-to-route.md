Type: task
Status: needs-triage

# Mock a coordinator that forgets to route

## Problem

Ticket 08's thesis is that a kind mock produces a UI that shatters on first contact with a real
runtime, which is why `MockAgentRuntime` reproduces the observed traps on purpose: ragged
deltas, a cancelled tool reporting `completed`, `used: 0` on cancel.

A coordinator has an obvious trap of its own, and it is the one from issue 02: **it reads the
user's message, answers in prose, and never calls `message_agent`.** The work silently never
happens, the transcript looks healthy, and the user finds out later.

Related and already observed live: asked to message Bob, Alice ignored blobot's tool, called
Claude's own `ListAgents`, found three unrelated sessions and reported Bob unreachable. That
was fixed for that route by `SHADOWING_TOOLS`, and it is the same failure shape.

## What to build

A checked-in scenario in `packages/core/src/mock/` where the coordinator acknowledges a request
and routes nothing, so that whatever is built for issues 01 to 04 has to face it before a real
CLI is spawned.

## What it forces a decision about

Whether blobot detects this at all. It can see that a user prompt produced a coordinator turn
with no outbound message, which is a signal it does not currently look for. Whether that is
worth surfacing, and as what, is the question the scenario is meant to make unavoidable.

## Done when

The scenario exists and the coordinator design has an answer for it that is not "the model will
remember".

## Reframed, 2026-08-30: the trap is a peer's, not a coordinator's

Issue 02 closed with **no coordinator**, and this ticket survives it — unblocked, and about a
failure that exists in the product today rather than one a coordinator would have introduced.

Alice is asked to get Bob on the API side. She answers *"I'll ask Bob to review it"*, never calls
`message_agent`, and the transcript looks healthy. Nothing about that needs a router: it is the
`SHADOWING_TOOLS` failure shape, observed live, in the ordinary two-agent case.

**blobot surfaces it, and never repairs it.** Decided in the grilling:

- **The trigger is lexical and scoped**: the turn's text names a teammate **whom the user named
  in the prompt that started it**, and no message reached that teammate. The orchestrator can
  already see this — it counts turns and owns `handleMessageAgent`, so nothing new is plumbed.
- **Scoped, because unscoped is noise.** "Bob's branch is fine" names Bob and promises nothing.
  A warning that fires on shop talk is a warning nobody reads, which is worse than silence.
- **Never inference.** Detecting a *promise* means reading prose, and blobot provides no
  inference. A name and an absence are both facts.
- **Worded as an observation, never an accusation**, and it offers no button that sends the
  message for her: blobot deciding what the message should have said is blobot doing inference.
- **Known limitation, on the record**: it cannot see a promise made about a teammate the user
  never named.

So this ticket is now two things: the checked-in scenario in `packages/core/src/mock/` where an
agent says it will message and does not, and the system line that scenario exists to produce.
