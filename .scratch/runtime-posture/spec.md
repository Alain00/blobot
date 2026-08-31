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
- `04-the-mcp-surface-nobody-counted.md` — a fourth of the same family, arrived at from the
  context gauge and filed under `transcript-scale` until the decision was taken. blobot tells the
  user what an agent inherits and ADR-0003 narrowed it; **for tools that promise has no handle at
  all.** 198 inherited tools reach a blobot-launched agent in an empty directory, 272.8k of
  schema, and 90 of them come from a plugin and a connector that `settingSources` cannot reach.
  `strictMcpConfig` is measured working through blobot's `_meta`, keeping blobot's own loopback
  tool. **Decided 2026-08-30: a per-agent choice at hire time**, blobot's own word beside `trust`
  and `compaction`, because it costs capability rather than tokens and blobot cannot see which
  agents need it. Unbuilt, with one open half — no equivalent lever is known on OpenCode and Codex
  was never probed.
