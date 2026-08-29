Type: grilling
Status: open
Blocked by: 02, 04

# The Claude Code adapter strategy

## Question

Choose Claude Code's integration path — ACP, Agent SDK, or CLI wrapper — and name what the
adapter has to absorb so that nothing outside it knows Alice is Claude.

Enumerate the specific mismatches against the normalized vocabulary and say how each is
handled. Where Claude cannot produce an event the vocabulary has, decide whether the adapter
synthesises it, omits it, or the vocabulary changes.

A path that works but leaks provider knowledge into the orchestrator fails this ticket.
