Type: task
Status: needs-triage
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
