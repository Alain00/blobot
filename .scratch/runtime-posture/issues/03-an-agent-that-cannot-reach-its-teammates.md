Type: task
Status: needs-triage

# An agent that cannot reach its teammates says nothing

## Problem

`/mcp [reconnect|enable|disable [<server>|all]]` is a built-in. `disable all` switches off every
MCP server on the session, including ticket 15's loopback `message_agent` endpoint, which is an
agent's **only** route to a teammate. It is off the palette, and it still works when typed.

Decided while grilling issue 03: blobot does not try to block this, because it cannot, and
pretending otherwise is the dishonest option. What it should do instead is make the consequence
visible rather than silent.

## Why the signal already exists

Ticket 15 measures readiness by the **inbound handshake** rather than by `session/new`, precisely
because neither runtime re-handshakes. So blobot already knows the difference between an agent
that has reached the loopback server and one that has not. Today that knowledge is used once, at
launch, and then discarded.

This is the same class as the Workspace that has been moved or deleted, which now says so
instead of being reported as "not a git repository". An agent that cannot message its team is at
least as worth saying.

## The failure it prevents

Observed live already, in a different guise: asked to message Bob, Alice ignored blobot's tool,
called Claude's own `ListAgents`, found three unrelated sessions and told the user Bob was
unreachable. `SHADOWING_TOOLS` fixed that particular route. A disabled loopback server produces
the same user-visible outcome — an agent that reports its teammate cannot be reached — with no
sign of why.

## What to settle

Where it surfaces, and whether it is a Status. `waiting` is precedent for the fold answering a
question that comes from a channel rather than from the stream.

## Done when

An agent whose loopback server is gone is distinguishable, in the UI, from an agent whose
teammate is simply busy.
