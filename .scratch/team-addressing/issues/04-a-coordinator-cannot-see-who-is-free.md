Type: task
Status: resolved
Blocked by: 02

# A coordinator cannot see who is free

## Problem

Ticket 05 explicitly declined a `listTeammates` tool for the MVP: the roster goes in the wake
prompt and the persona instead, which costs one line and no round trip. That is right for an
agent who messages a named colleague. It is not obviously enough for an agent whose job is to
decide *who* should do a thing, because it can see who exists and not what any of them are
doing.

A router that cannot see status will hand work to a busy agent.

## What already exists

- `handleMessageAgent` acks `started` or `queued`. The coordinator therefore learns after the
  fact that a recipient was busy, which may be enough: it can route, read the ack, and route
  elsewhere on the next call.
- The status fold (`AgentStatusTracker`) already knows every agent's status in the orchestrator
  process, derived and never persisted. Exposing it costs no new state.

## What to settle

- Whether the ack is sufficient and no new tool is needed. This is the cheap answer and should
  be disproved before a tool is added.
- If a tool is needed, that it stays consistent with ticket 05's reasons for refusing one:
  free-form and self-correcting rather than a frozen enum, since `mcpServers` binds at session
  creation and a baked roster goes invisibly wrong when the roster changes.
- Whether status is even the right question. Ticket 05's rejection of `listTeammates` was about
  round trips, not secrecy, and a coordinator asking "who is free" every turn is a round trip
  per turn.

## Done when

Either it is written down that the ack is the answer, or `team_status` exists with the same
free-form, degrades-honestly shape as `message_agent`.

## Answer

**The ack is the answer. No `team_status` tool.** Closed with issue 02, 2026-08-30.

The ticket asked its cheap answer to be disproved before a tool was added, and it was not
disproved: it was made moot. There is no router. Nobody's job is to decide *who* should do a
thing, so nobody needs to see what everybody is doing — the user picks the agents by name, and
the user can already see every status in the rail.

For the case that remains, a peer messaging a peer, ticket 05's reasoning is unchanged and its
answer holds: `handleMessageAgent` acks `started` or `queued`, so an agent learns after the fact
that a recipient was busy and can route elsewhere on the next call, at no round trip. Ticket 05
refused `listTeammates` over round trips rather than secrecy, and an agent asking "who is free"
every turn is a round trip per turn.

If a coordinator ever returns, this ticket returns with it and the ack is where it starts.

## Reopened, 2026-08-30: the coordinator returned

*"If a coordinator ever returns, this ticket returns with it and the ack is where it starts."*
It has. Issue 06 gives the lead work to hand out, so this ticket's finding — **a router that
cannot see status will hand work to a busy agent** — is load-bearing again. It was never
disproved; it was made moot, and it is not moot now.

The answer issue 06 builds is neither of the two this ticket framed. It is not `team_status` and
it is not the ack alone:

- **The roster travels with status on it, in the envelope**, replacing the roster line that was
  already there. Fresh at turn start, no round trip, no new tool, no frozen enum — which is what
  this ticket asked any answer to be.
- **The ack stays the mid-turn correction.** `started` or `queued` still tells the lead after the
  fact that a recipient was busy, at no round trip. Ticket 05's reasoning is unchanged.

So the cheap answer was right about round trips and wrong about sufficiency, and the fix is to
put the fact where the roster already was rather than to add a tool that asks for it.
