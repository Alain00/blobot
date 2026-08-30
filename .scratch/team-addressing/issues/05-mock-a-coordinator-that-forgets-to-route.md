Type: task
Status: needs-triage
Blocked by: 02

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
