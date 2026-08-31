# Handoff: transcript-scale, 2026-08-30

Written to close a session that had grown too large, and to be the note the next one would want
to find. Read this, then `.scratch/transcript-scale/spec.md`. Everything below is committed to
the working tree; nothing is uncommitted-and-forgotten except what the last section names.

## Where the effort stands

All ten tickets are closed. `spec.md`'s index is current and is the shortest true summary.

- **01, 02, 04, 05, 06, 07, 09** — resolved before this session.
- **10 (compaction by handoff)** — built, amended twice from a live run, and **now run live
  itself**. Nothing is outstanding on it.
- **03 (virtualize the conversation)** — **deferred**, measured first.
  `prototype/03-measurement.md`.
- **08 (the MCP surface)** — answered, **decided 2026-08-30 and moved out**: a per-agent choice
  at hire time. It now lives at `.scratch/runtime-posture/issues/04-the-mcp-surface-nobody-counted.md`,
  where the ticket always said it belonged.

## Ticket 10, as it actually ended up

blobot chooses the *moment* and writes no summary of its own. At **80% of ticket 09's working
ceiling**, checked after every turn, it asks the agent for a handoff and opens a fresh session
with it. Per agent, on by default (`compaction`: `auto` | `off`, NULL is `auto`, migration 0015).

**It shipped with two mechanisms and now has one.** The runtime's own `/compact` was tried first
on a cost argument; you watched it run on a real agent at 223k and said it loses too much, so the
ordering is gone along with `AgentRuntime.compacts`, `compact()` and `adapters/acp/compaction.ts`.
`how: 'command'` stays in the event vocabulary because **you have a stored row with it** and the
transcript must still draw that line. `/compact` stays in the composer palette for a person to
type; it is not something blobot reaches for.

**The cost of that, stated so nobody rediscovers it as a surprise:** every compaction is now two
turns and a discarded session rather than one turn that keeps it, and the refusal path matters
more because there is nothing cheaper to fall back to.

**Where things live:**

| what | where |
| --- | --- |
| threshold, prompt, limits, refusal strings | `packages/core/src/orchestrator/compaction.ts` |
| the loop, and `SPOKEN` | `packages/core/src/orchestrator/orchestrator.ts` |
| `restart()` per adapter | `adapters/{claude,opencode,codex}/*-agent-runtime.ts` |
| the archive | `apps/desktop/src/main/handoff-archive.ts` |
| the setting | `renderer/src/components/CompactionPick.tsx` |
| the transcript line and disclosure | `model.ts` `compactionLine`, `Conversation.tsx` `Compaction` |

**Decisions worth not relitigating**, each with its reason on the code:

- **Occupancy triggered, never time triggered.** Compaction *is* cache invalidation, so it buys
  headroom and quality and never cache economy. A timer fires on idle teams and pays a full
  uncached read of a context nobody is using.
- **Fire with margin.** The handoff turn is the most expensive one available and the one most
  likely to stop on `max_tokens`. A handoff that stops, is empty, or exceeds `HANDOFF_LIMIT`
  (6,000 chars) is a **refusal to restart** — the old session is kept and the transcript says so.
- **The handoff travels as text, never as a path.** ADR-0004's refusal applied again: a path is
  an ungated read outside the workspace, because `Read` never prompts. The file under
  `~/.local/share/blobot/handoffs/` is your record, not the agent's route.
- **blobot's own turns are published and recorded for what they *did*, never for what they
  *said*.** `SPOKEN` in `orchestrator.ts`. Found on screen: three of blobot's turns rendered as
  three paragraphs in Alice's own voice in a conversation where nobody had asked her anything.
- **`personaIsSessionBound`** is blobot's word for a provider fact (true on Claude and Codex,
  false on OpenCode). The line says `standing instructions re-read` only where it could have
  moved.

## The bug your live run found, and the fix

`a turn is already in flight` thrown from `promptFromUser`, and Alice never answered. Three fixes,
three tests:

1. **A prompt for a busy agent is left undelivered in the mailbox** rather than marked delivered
   and handed to a second `sendPrompt`. `#runTurn`'s own tail drains it. `promptFromUser` had
   never checked `#busy` and never needed to — until this ticket, every turn was one the user or
   a peer began, and the composer sits downstream of the status those produce.
2. **`#maybeCompact` refuses to start while a turn is in flight** — a microtask window between
   `#runTurn` clearing `#busy` and the compaction's first turn.
3. **`#runTurn` only clears the `#busy` flag it claimed**, so a refused prompt can no longer
   leave a live turn looking idle.

## The handoff path, run live — closed 2026-08-30

The item this note called the one outstanding thing on ticket 10 is done, and the ticket carries
the evidence. `packages/core/src/orchestrator/live-compaction.test.ts`, under
`BLOBOT_LIVE_CLAUDE=1`, drives a real `claude` through a real compaction and passes.

**It does not lower `COMPACTION_TRIGGER`,** which is what this note suggested and would have been
a source edit somebody has to remember to undo. `contextCeilings` is already an
`OrchestratorOptions` field, so the test hands the agent a 1,000-token ceiling and the first real
turn trips the threshold on its own at 26,970 used. Raising the entry afterwards is how it stops,
because the map is read at check time.

**What came back.** A 1,473-character handoff against a 6,000 limit — firing with margin is not
the binding constraint it was feared to be. First person, no retelling of the conversation, and it
separated what it had established from what it had assumed without being asked to, including a
line telling its successor to check `git status` rather than trust it. The fresh session, asked
what it was working on, answered with the ticket, the file and the next step, and kept the hedge.
The specimen is quoted in full on ticket 10; it is the first one anybody in this repo has seen.

## What is *not* done

- **Ticket 08's build.** The decision is taken and written down; nothing is built. blobot's own
  word on the hire and edit dialogs, a column on the profile, and one adapter translation each.
  The open half is that **only Claude has a measured lever** — `strictMcpConfig` through `_meta` —
  no OpenCode equivalent is known and Codex was never probed. Follow `CODEX_EXPRESSES_TRUST`: an
  adapter that cannot express blobot's word says so in the code, rather than shipping a control
  that silently does nothing on two runtimes out of three. Probe them the way §2 probed `claude`.
- **Ticket 03's cheaper fix is unbuilt on purpose.** `case 'earlier'` in `model.ts` caps nothing,
  so `items` grows for as long as somebody keeps clicking *load earlier*. A ceiling there is the
  move if anybody ever complains; nothing has.

## Three things about this working tree

- **The loss in `apps/desktop/src/renderer/src/model.test.ts` was looked for, and one hole was
  real.** `moreAbove` appeared on nine snapshot fixtures and was asserted on by nothing, and
  `case 'earlier'` — the one action that adds to the *top* of a pane — had no test at all. That
  is very likely what went. Four are written now, one per claim the case actually makes: it
  prepends rather than replaces, so the live tail survives; a page that overlaps keeps the copy
  on screen, because that one may be mid-stream; `moreAbove` is the store's word; and the cursor
  **never moves forward**, so an empty page cannot ask for the same window twice. Nothing else in
  that file looks absent — every shipped feature has a block.
- **The `orchestrator.ts` race resolved clean.** Read through: `OrchestratorOptions` has ten
  fields, each declared once, assigned once in the constructor and read once. No duplicate
  private declarations. Nothing to repair.
- **The concurrent session is still live.** A `Routines.test.tsx` failure appeared and fixed
  itself between two runs a minute apart, which was somebody else editing the untracked routines
  work. Re-run the gate before you trust a red one.

## The gate, as of this handoff

`pnpm -r typecheck`, `pnpm -r test` (561 core + 357 desktop) and `pnpm -r build` all pass. The
live suites are off by default and pass on demand: `BLOBOT_LIVE_CLAUDE=1` now covers the
compaction path as well as the adapter.
