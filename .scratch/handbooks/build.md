# Handbooks: build status and session handoff

**Nothing is built.** The map is complete, all ten tickets are resolved, and this file is the
handoff to the first implementation session. Read `map.md`'s *Decisions so far* to judge relevance,
then zoom into only the tickets your task touches.

`CONTEXT.md` carries **Handbook**, **Entry** and **to brief** already, written by ticket 01 as it
resolved. That is the only change to the repository so far.

## What a Handbook is, in one paragraph

What an Agent knows about **this team's** work, held at `<team>/<agent>`. Made of **entries**,
folded into the Persona immediately before standing instructions, elicited by talking to the agent
rather than by filling in a form, and added to by the agent itself with `record_entry`. Standing
instructions are about the person and travel with them; a Handbook is about the work and stays with
the team.

## Build order, and why it is this order

Each step is runnable and observable before the next one starts. Do not reorder without a reason:
the last step is deliberately last because it is the only part a user meets.

**1. The store.** `handbook_entries`, keyed on `(team_id, agent name)`, no foreign key to `agents`.
Drizzle schema plus a checked-in migration. Tombstoned with the team. Ticket 07 has the reasoning,
including the comment that must go in the code: *this key is safe only because ADR-0002 forbids
renaming an agent.*

**2. `composePersona`.** The Handbook block, numbered entries with short absolute dates, placed
immediately before standing instructions. The conditional empty state is in ticket 04 verbatim and
is the mechanism the whole feature turns on. `envelope.ts` stays pure: the entries are a parameter,
not a store read. No adapter changes at all, on any of the four. **This step is testable on its own**
and should be, because everything after it is downstream of the persona being right.

**3. `record_entry` and its bounds.** One tool on the loopback MCP server, taking a **list**, with
`source` and optional `replaces` per entry. Two constants and two refusal functions in `bounds.ts`,
beside `tooLongToSend`. Tickets 03 (plus **both amendments**), 09 and 10.

**4. The transcript block.** `Compaction`'s collapsed shape, carrying removal, plus the
full-Handbook system line. Persist the events as well as the rows, removal included. Ticket 08.

**5. The gauge row.** A sub-row under `persona` in `Feed.tsx`, hidden when empty. Ticket 05. Small,
and it wants step 3's numbers to exist first.

**6. The pane: panel, then notice card.** The panel behind the tray door, then the card above the
composer, then the wire-only prompt behind *brief her*. Tickets 06 and 02. Last because it is the
only part a user meets, and because by then everything it operates on is real.

## What will bite

- **fx refuses an empty prompt** (`-32602`), measured. The control sends a minimal instruction on
  the wire that is never drawn. Do not try to make a wordless turn work; ticket 02 already did.
- **An empty turn is not a free turn.** ~36,000 tokens of cached prefix for seventeen output
  tokens, on Claude. Any cost reasoning starts there.
- **`record_entry`'s definition is context**, paid on every turn by every agent on every team,
  whether or not anybody uses it. Keep it short. `MESSAGE_AGENT_TOOL` carries a comment saying why.
- **fx pays for the Handbook on every turn**, because its persona has no channel. That is fx's own
  cost and no adapter may special-case it.
- **Codex stores `developer_instructions` on the session**, so an edited Handbook does not take on
  a resume (codex issue 06). Accepted, not worked around. ADR-0002's rule stands: a change takes at
  the team's next start, and the panel says so.
- **Every class this feature adds is prefixed** — `.hbnotice`, `.hbnact`, `.hbentry`. The prototype
  reproduced DESIGN.md's `.preview` grenade within an hour of reading the warning about it.
- **Re-adding a removed agent collides on `agents_team_name`.** Out of scope and real. See below.

## Known gaps, deliberately left

- **The two constants are provisional.** 1,000 per entry, 8,000 per Handbook, about five percent of
  what an agent already pays per turn. **Measure a real Handbook after the first live briefing
  interview** and move them only if that contradicts them. Record the measurement either way.
- **`agents_team_name` has no partial predicate** and `tombstoneAgent` does not release the name,
  so removing an agent and adding them back later collides — today, with no Handbooks anywhere.
  Ruled out of scope on ticket 07. Its own effort. Either fix (a partial index, or renaming on
  tombstone the way `tombstoneTeam` does) is compatible with the Handbook key.
- **No live verification exists.** Ticket 02 probed all four runtimes for the empty prompt only.
  Nothing has been run end to end, and the first live briefing is both the proof and the
  calibration.

## The next session

Start at step 1. It is small, it is entirely testable, and it is the only step with no upstream.

## Where the reasons are

Ten tickets under `issues/`, each with an `## Answer`. **Ticket 03 carries two amendments**, from
tickets 09 and 10; read them before treating its answer as final. The screen prototype is
`prototypes/06-handbook/index.html`, a single self-contained file. The live measurements are
`research/02-empty-prompt.md`, with versions.
