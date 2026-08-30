# Addressing a team without naming an agent

Raised by the author, 2026-08-29: *"how would a team group chat work without having to mention
anyone? Idea: always have a coordinator in a team that routes the messages and distributes
work."*

Nothing here is broken. The team pane works exactly as ticket 12 specified. This effort exists
because that specification makes the team pane a place you *read* the team and address one of
them by name, and the author wants a place you *talk to* the team.

## The request is two features, and they cost differently

1. **Not having to type `@`.** An addressing ergonomic. Needs no model and no new agent: it is
   a default recipient. Issue 01.
2. **Something decomposing a request across agents.** Work distribution. This genuinely needs
   an agent's turn, and it is where all the cost, all the failure modes and the one security
   question live. Issues 02 to 05.

They are separable and should be decided separately. Bundling them means paying a full model
turn to route the word "hi".

## What is binding today

- **A message lands in exactly one agent's session.** Ticket 05. `handleMessageAgent`
  (`packages/core/src/orchestrator/orchestrator.ts`) commits one row with one `toAgentId`.
  There is no broadcast, and this effort does not propose one.
- **The team pane has no implicit recipient**, and send stays disabled until an `@mention`
  resolves. Ticket 12, *The recipient is an `@mention`, not a picker*. Issue 01 contradicts
  this directly and ticket 12 has been marked reopened on that point.
- **Ack means committed.** Ticket 05. The failure it was written against is Alice being
  certain she told Bob and Bob never hearing.
- **A peer carries no operator authority.** `composePersona` and `envelope` in
  `packages/core/src/orchestrator/envelope.ts`, said in the envelope rather than the persona
  precisely so it survives contact with a message trying to override it.
- **Never a full context copy between agents, always compact context.** `CLAUDE.md`.
- **blobot provides no inference.** `CLAUDE.md`. This is load-bearing here: blobot cannot route
  intelligently by itself, so any smart routing is necessarily some agent's turn. It forces the
  coordinator to be an Agent rather than an orchestrator feature.

## What a coordinator does not break

It is **not** the broadcast surface ticket 12 rejected. That ticket killed the `to Alice ▾`
picker because a quiet default implied a message going to the whole team when the system lands
it in one session. A coordinator keeps one recipient; the team pane would honestly mean
*message the coordinator*, provided the UI says so.

It is also the only shape that satisfies the compact-context rule. Real group chat, where
everyone sees everything, is N sessions ingesting every message, N turns per utterance, and
unbounded context growth on all of them. One agent holding the shared thread and handing out
compact briefs *is* the compact-context answer to group chat. That is the strongest argument
for the idea and the reason this effort exists rather than a rejection note.

## Out of scope

- **Broadcast.** One message going to *the team* implicitly is not on the table. It is the thing
  ticket 05 settled and the thing the compact-context rule forbids at scale.

  **Amended 2026-08-30 by issue 02**, which needed the boundary drawn rather than assumed:
  what is forbidden is the *implicit* surface — a composer that sends to everybody because you
  named nobody, which is what ticket 12 removed. **Naming several agents is not that.**
  `@alice @bob` commits one message row per named agent, each landing in exactly one session,
  which is ticket 05's rule satisfied twice rather than bent once. The line to hold: blobot never
  decides who a message is for, and never expands a set the user did not type.
- **Renaming or restructuring Team.** A coordinator is a role, not a new aggregate.
- **Agent context compaction.** Belongs to the CLI behind the adapter. See
  `.scratch/transcript-scale/spec.md`, *Not in scope*.

## Issues

- `01-a-default-recipient-for-the-team-pane.md` — the cheap half, and a ticket 12 reopen.
  **Resolved and built, 2026-08-30**: a team has a lead, the team pane writes to it, and a team
  with none behaves exactly as ticket 12 specified.
- `02-does-a-coordinator-earn-its-turn.md` — the grilling. **Resolved 2026-08-30: no
  coordinator, in any shape.** The ask was fan-out, relayed authority is capped at peer, and so
  a router can only ever deliver weaker work than the same words addressed by the user.
  **Fan-out is multi-mention.**
- `03-relayed-operator-authority.md` — the security question. **Closed with 02, and without an
  ADR**: peer authority always, no third voice, nothing relays. It is the answer that killed the
  coordinator rather than a consequence of it.
- `04-a-coordinator-cannot-see-who-is-free.md` — **closed with 02: the ack is the answer.**
- `05-mock-a-coordinator-that-forgets-to-route.md` — the observed trap, per ticket 08's thesis.
  **Unblocked and reframed**: the trap is a peer's and exists today.

Order: 01 shipped alone. 02 answered and closed 03 and 04 with it; 05 is the only open one.
