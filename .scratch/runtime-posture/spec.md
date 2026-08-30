# Promises blobot makes about the runtime that nothing currently keeps

Spun out of `.scratch/command-palette/issues/03`, where grilling the command palette turned up
three places where blobot tells the user something about how an agent runs, and then has no
mechanism that keeps it true.

None of these are palette work. They are here because a menu filter is not enforcement: a
command left off a list still runs when typed, so anything genuinely load-bearing has to be
handled where it actually lives.

## The shape they share

Ticket 14 established the posture: blobot forces `session/set_mode("default")`, and the
disclosure that closes team creation *states* this rather than asking for consent. ADR-0003
narrowed what an agent inherits. Both are promises. Each issue below is a way the promise can
quietly stop being true while the app keeps displaying it.

## Issues

- `01-mode-drift-is-watched-and-ignored.md` — the adapter already sees the drift and writes it
  to a private field.
- `02-permission-state-can-be-rewritten-on-disk.md` — worse than drift, because it outlives the
  session and lands in the user's repository.
- `03-an-agent-that-cannot-reach-its-teammates.md` — the loopback server can be switched off
  from inside the session, and the failure is silence.
