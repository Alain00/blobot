# Handbooks: build status and session handoff

**All six steps are built.** The store, `composePersona`, `record_entry` with its bounds, the
transcript block, the gauge row, and the pane: the panel behind the tray's door, the notice card
above the composer, and the wire-only prompt behind *brief them*. An agent can be briefed, can
write to its own Handbook, the write opens in the turn that made it, what it costs is under the
gauge, and a person can read and prune it from the agent's own pane.

**Nothing has been run live.** That is the one thing left, and it is both the proof and the
calibration of two provisional constants. See *Known gaps*.

Typecheck, tests and build pass. Read `map.md`'s *Decisions so far* to judge relevance, then zoom
into only the tickets your task touches.

## What is built, 2026-08-31

- **The store.** `handbook_entries` (`packages/core/src/store/schema.ts`, migration
  `0019_messy_pestilence.sql`), keyed on `(team_id, agent name)` with no foreign key to `agents`,
  tombstoned with the team, absent from the purge figure. `handbookOf`, `handbookEntryById`,
  `recordHandbookEntries`, `removeHandbookEntry`, `handbooksOfTeam` on `SqliteStore`, with the
  comment ticket 07 asked for about ADR-0002 and renaming.
- **The persona.** `handbook/persona.ts` composes the block and `composePersona` folds it in
  immediately before standing instructions, as a **parameter**, with no adapter changes on any of
  the four. `start-team.ts` reads the entries and passes them. The handoff prompt gained ticket
  04's one clause telling the agent not to restate its Handbook.
- **`record_entry`.** `RECORD_ENTRY_TOOL` on the loopback server, offered only when a
  `recordEntry` handler is attached; `Orchestrator.handleRecordEntry` owns every refusal;
  `bounds.ts` carries the two limits, the per-turn call cap and the wordings. A
  `recordEntry(entries)` step on the mock scenario builder exercises it through a real turn.
  `onHandbookWrite` publishes `HandbookWrite`, which is what step 4 draws.
- **The transcript block.** `Compaction`'s collapsed shape (`.hbwrite`, `HandbookWrite` in
  `Conversation.tsx`), one line per call, carrying `remove` on each entry and `withdrawn` on what
  a correction replaced, plus the plain system line for a full Handbook. Persisted as an event
  (`handbook_recorded` / `handbook_full`) and restored in the snapshot: the event says which
  entries a call touched and the **rows** say what they say and whether they are still there, so
  a reopened team never offers to remove something already gone. Removal is `blobot:removeHandbookEntry`
  and is the same act the panel will make. DESIGN.md carries the rules.
- **The gauge row.** `UiInjection.handbookChars`, a sub-row under `persona` in `Feed.tsx` reading
  `handbook`, above `your standing instructions` because that is the order the persona composes
  them in. Hidden when empty, no possessive, no count, and it never warns. Computed in main by
  `handbookChars(teamId, agentName)` on both snapshot paths, and followed live by the reducer.
  DESIGN.md's activity-column bullet carries the rules.
- **The pane.** `components/Handbook.tsx`: `ComposerFooter` (the tray's `handbook · N` door plus
  the dialog behind it) and `HandbookNotice` (the card above the composer while it is empty). The
  entries reach the renderer on the snapshot, `UiSnapshot.handbooks`, keyed by agent id.
  `WorkspaceLine` gained one `door` node and draws the tray for a door alone when there is no
  branch. `Composer` gained `notice` and `suggest`. `--screen=handbook` opens the panel for a
  screenshot, beside `--pane` and the other review affordances.
- **The briefing turn.** `BRIEFING_KNOCK` in `handbook/persona.ts` and
  `Orchestrator.promptForBriefing`, over `blobot:brief`. **No text travels from the renderer**:
  two ids go and the words are looked up on the far side, which is `detect/remedies.ts`'s argv
  rule drawn again. It writes **no `messages` row at all**, so the transcript opens with the
  agent's own words.

## Decided while building, which no ticket covers

- **The ordinal is counted over every entry the Handbook ever had, removed ones included.**
  Ticket 10 says the persona numbers the entries so `replaces` can name one, and left the
  numbering to the implementation. Numbering the *live* list one to n is wrong in a quiet way: an
  entry removed in the pane mid-session renumbers everything under it while the agent is still
  reading the persona it was given at session start, so it would correct entry 3 and withdraw
  what used to be entry 4. Stable ordinals cost a gap in the sequence after a removal, which is
  honest, and the gap is the same act being visible. `HandbookEntry.ordinal` is derived on read
  by the store, never stored and never the writer's to give.
- **The whole-Handbook bound is measured against what the Handbook *would* be** — what survives
  the call plus what it adds — so a correction that replaces a long entry with a short one is not
  refused for the space the old one was taking.
- **A refused call records nothing at all**, including when only one entry in the list is over
  the per-entry bound. What is disclosed in the turn has to be exactly what happened.
- **The ordinal is a column, written at insert.** Deriving it on read from `ORDER BY created_at,
  id` was the first version and the demo caught it on screen: `record_entry` takes a list, all of
  it is written in the same millisecond, and a uuidv7's tail is random, so a three-entry briefing
  came back in an order nobody wrote it in. Numbering must respect the order the agent wrote them
  and must never change afterwards, and a column is the only thing that does both.
- **blobot's own loopback tools no longer draw a raw tool line in the transcript.** `OWN_TOOL`
  filtered `message_agent` only, so `blobot_record_entry` drew as a mono call line beside the
  block that *is* its rendering. `propose_routine` had the same duplicate and nobody had noticed.
  Extended to all three, which is what that filter's own comment always argued for.
- **The demo can show it**: `writes-it-down`, on the same argument as `schedules-itself`. Without
  it the only way to look at the block is to brief a real agent in somebody's real repository.
- **The persona carries one sentence ticket 09's four lines do not**, telling a briefed agent
  what the numbers are for and that a `told` entry is not its to withdraw. Ticket 09 wrote the
  test for *when to record*; ticket 10 requires the agent to be able to name an entry, and a
  number nobody explains is not a capability. It is drawn only when the Handbook is non-empty.

- **The figure is the entries' own text, and nothing of the prose around them.** Not the
  ordinals, not the dates, not `WHEN_TO_RECORD`. Three reasons and they agree: it is what
  `HANDBOOK_LIMIT` is measured against, it is what the panel's foot will stand beside the entries
  with, and it is the only part of the block a person can change. Counting the framing would put
  a number in a column about cost that nobody can act on and that never moves.
- **It reads the Handbook as it stands, not as it was in the persona that was sent** — exactly
  like `instructionsChars`, which reads the Agent's current instructions rather than parsing the
  stored persona. Both take at the team's next start, which is ADR-0002's rule, and stating it is
  the panel's job rather than the gauge's.
- **And therefore it follows the two live paths**, in the renderer's reducer: a `handbookWrite`
  adds what was written and drops what the same call withdrew, and a `handbookRemoved` takes the
  entry out. Without this the row would sit at nothing for the whole of the session in which an
  agent was first briefed, which is the session the whole feature is about: standing instructions
  only move through a dialog that refreshes the snapshot on its way out, and nothing refreshes
  when an agent records mid-turn.
- **The gauge's figure is derived, not carried.** `UiInjection.handbookChars` was the first
  version and lasted an hour: step 6 puts the entries themselves in the renderer, so a second
  count of them on the injection record was one truth too many and could drift from the list the
  panel draws. `Feed` sums `handbooks[agentId]` instead. The comment on `instructionsChars` says
  why the Handbook's figure is deliberately *not* its neighbour.
- **`add one` is a composer prefill, not a write.** `Composer` takes `suggest: {text, at}` and the
  `at` is what makes it fire, so the same words offered twice are two offers and a re-render after
  the user clears the field does not refill it. It **appends** rather than replaces, because a
  control that silently ate a half-written message would be the worst thing on that screen.
- **The panel became a dialog the same day it was built**, ticket 06's 2026-08-31 amendment and
  the author's correction from a live team. It shipped as a panel under the composer, in the
  tray's shape, which is what the ticket resolved against a four-entry mock. The first real
  Handbook settled it: **two entries, 774 characters, two thirds of the pane**, against a bound of
  8,000. `.modal` caps its height and scrolls inside itself, which is what a body with no ceiling
  needs and what a strip of chrome under a field cannot give it. `.hbentry` moved from `--ground`
  to `--raised` with it: `.modal`'s own ground is `--ground`, so the rows arrived in the dialog
  with no fill at all. Caught on screen, not reasoned.
- **An entry is folded to its first line**, in the same pass and on the same evidence. The dialog
  fixed the container; one real entry is still a paragraph, and three of those are a wall wherever
  they sit. `.route`'s chevron, the tail folded and never the row, rows independent, and the whole
  text in the DOM either way, and **open, the entry takes the whole row while `author · age` drops
  under it as a byline** — 22 characters of mono beside a paragraph was setting the measure that
  paragraph was read at. **`writesItDown` gained a 500-character entry with it** — every
  entry in that scenario was a tidy one-liner, against which both the panel and the dialog looked
  fine, which is ticket 08's *a kind mock produces a UI that shatters on first contact* aimed back
  at the mock.
- **The tray draws for a door alone.** `WorkspaceLine` returned null with no branch, which is
  every `plain` Workspace and every folder blobot could not reach. A Handbook is per
  `<team>/<agent>` and has nothing to do with whether git can hold the folder, so hiding it there
  would be one feature's absence deciding another's.

`CONTEXT.md` carries **Handbook**, **Entry** and **to brief**, written by ticket 01 as it
resolved.

## What a Handbook is, in one paragraph

What an Agent knows about **this team's** work, held at `<team>/<agent>`. Made of **entries**,
folded into the Persona immediately before standing instructions, elicited by talking to the agent
rather than by filling in a form, and added to by the agent itself with `record_entry`. Standing
instructions are about the person and travel with them; a Handbook is about the work and stays with
the team.

## Build order, and why it is this order

Each step is runnable and observable before the next one starts. Do not reorder without a reason:
the last step is deliberately last because it is the only part a user meets.

**1. The store.** DONE. `handbook_entries`, keyed on `(team_id, agent name)`, no foreign key to `agents`.
Drizzle schema plus a checked-in migration. Tombstoned with the team. Ticket 07 has the reasoning,
including the comment that must go in the code: *this key is safe only because ADR-0002 forbids
renaming an agent.*

**2. `composePersona`.** DONE. The Handbook block, numbered entries with short absolute dates, placed
immediately before standing instructions. The conditional empty state is in ticket 04 verbatim and
is the mechanism the whole feature turns on. `envelope.ts` stays pure: the entries are a parameter,
not a store read. No adapter changes at all, on any of the four. **This step is testable on its own**
and should be, because everything after it is downstream of the persona being right.

**3. `record_entry` and its bounds.** DONE. One tool on the loopback MCP server, taking a **list**, with
`source` and optional `replaces` per entry. Two constants and two refusal functions in `bounds.ts`,
beside `tooLongToSend`. Tickets 03 (plus **both amendments**), 09 and 10.

**4. The transcript block.** DONE. `Compaction`'s collapsed shape, carrying removal, plus the
full-Handbook system line. Persist the events as well as the rows, removal included. Ticket 08.

**5. The gauge row.** DONE. A sub-row under `persona` in `Feed.tsx`, hidden when empty. Ticket 05.

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
  calibration. See *The next session*, which is entirely about this.
- **The panel's ages are the app's own time copy**, `lastActive` from `time.ts`, so an entry from
  last week reads `Mar 11` rather than the prototype's `2d`. One place the app's time copy is
  written, which that file's own comment asks for. Note that the **persona** uses absolute dates
  and must keep doing so: it is a cached prefix, and a relative date would invalidate that cache
  on every composition.

## The next session

**Brief a real agent**, which is the only thing left and the thing every provisional number in
this effort is waiting on. `--live-claude=<dir>`, press *brief them*, hold the interview, and then:

1. **Measure the Handbook it produced** and write the figure down here whether or not it moves
   `HANDBOOK_ENTRY_LIMIT` and `HANDBOOK_LIMIT`. A guess that survives a measurement is worth more
   than a guess replaced by another guess. Ticket 05 carries the instruction.

   **First reading, 2026-08-31, and it is one reading rather than a calibration.** A real Claude
   agent auditing a real Meta ads account recorded **two entries totalling 774 characters** off
   its own turn, unprompted, the longer of the two about 500. So an entry came in at **half**
   `HANDBOOK_ENTRY_LIMIT` and the Handbook at **a tenth** of `HANDBOOK_LIMIT`. Nothing here
   contradicts either number, and both stay. What it does say is that the per-entry limit is the
   one that will bind first: a model writing a paragraph of account state got halfway to it in one
   go. Read from a screenshot of a live session rather than from an instrumented run, so treat it
   as a sighting and not as the measurement ticket 05 asked for.
2. **Watch what the empty-state block actually does** on a turn carrying only `BRIEFING_KNOCK`.
   Ticket 04's conditional is the mechanism the whole feature turns on and it has never met a real
   model. The knock's wording is the cheapest thing to change if it does not open the conversation.
3. **Do it on OpenCode too.** It was the runtime that confabulated on an empty prompt with no
   persona, and ticket 02's argument is that the persona would have guarded it. That argument is
   still untested.

Then the two leftovers this effort did not touch: surfacing whether an agent resumed or started
fresh, and a ticket for fx writing its own diagnostics into the message voice.

## Where the reasons are

Ten tickets under `issues/`, each with an `## Answer`. **Ticket 03 carries two amendments**, from
tickets 09 and 10; read them before treating its answer as final. The screen prototype is
`prototypes/06-handbook/index.html`, a single self-contained file. The live measurements are
`research/02-empty-prompt.md`, with versions.
