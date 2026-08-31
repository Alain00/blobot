Type: grilling
Status: resolved
Blocked by: 01

# Where a Handbook is stored, and what outlives what

## Question

One SQLite file under Electron's `userData`, Drizzle schema, checked-in migrations. That much is
the house pattern and is not in question. What this ticket settles is the **key** and the
**lifetime**, both of which are load-bearing and neither of which is obvious.

## The key

`<team>/<agent>` — the same identity the AgentWorkspace branch is named for and the same identity
a Routine belongs to. The subtlety is that this identity is a *name pair*, not a row id, and the
app has already been bitten by the difference: deleting a team removes every AgentWorkspace
**before** tombstoning the rows, because the branch is `blobot/<team>/<agent>` and the name has to
still be true when the branch is deleted.

So: is a Handbook keyed on the Agent row, or on the name pair? The answer decides ticket 15's
behaviour in charting — a Handbook survives its Agent being removed from the roster, and comes
back when the same person is re-added — because that is only expressible if the Handbook outlives
the row it belongs to.

## What it has to settle

- The key, and whether the Handbook row is tombstoned, orphaned or left keyed on names.
- **Roster editing.** Removing an agent and adding them back restores the Handbook. Renaming is
  not possible today (an edit keeps the name, ADR-0002), which is what makes a name key safe;
  say so, because a future rename feature would break it silently.
- **Team deletion.** The Handbook dies with the team, alongside the AgentWorkspaces the delete
  already removes. The transcript is *kept* on a team delete, so this is a deliberate difference
  and the answer should say why: the transcript is a record of what happened, and a Handbook is
  live context for a team that no longer exists.
- **The full clean.** Deleting a team can be a full clean, priced first, reporting what it
  recovered. A Handbook is bytes in SQLite rather than a directory, so it almost certainly does
  not appear in that figure — confirm, and say so, rather than leaving a caller to guess.
- **What the recorder persists.** `SqliteRecorder` persists the durable subset of the event
  stream. An entry being recorded is an event that opens inline in the transcript, so it is in
  that subset; whether the transcript replay redraws the block, and whether removal is an event
  too, follows from ticket 08.

## Recommendation

Keyed on the name pair, surviving the Agent row, deleted with the team, and absent from the
purge figure with one line in the dialog saying nothing else is left behind.

## Answer

**Its own `handbook_entries` table, keyed on `(team_id, agent name)`, tombstoned with the team,
absent from the purge figure, with both the rows and the events persisted.** Resolved 2026-08-31
with the author.

### What reading `editTeamRoster` settled

Two facts decided this, and neither was known when the ticket was written.

**Re-adding an agent always creates a new row.** `editTeamRoster` mints
`${refSlug(name)}_${randomBytes(3)}` for every joiner and never revives a tombstone. So a Handbook
keyed on `agents.id` would be lost on every removal and re-add, which is exactly the trap charting
ruled against: removing somebody and putting them back is the ordinary way a user fixes a mistake.

**And the name is not released on removal.** `CREATE UNIQUE INDEX agents_team_name ON agents
(team_id, name)` is plain, with no `WHERE deleted_at IS NULL`, and `tombstoneAgent` sets
`deletedAt` without renaming — unlike `tombstoneTeam`, which renames to `<name> · deleted · <id>`
for exactly this reason. See the defect section below.

### The key

`(team_id, agent name)`. Its own table, no foreign key to `agents`, so the Handbook outlives the
row it belongs to.

It is the same tuple the branch `blobot/<team>/<agent>` is named for, the same tuple that unique
index is on, and the same identity a Routine belongs to. `team_id` rather than the team's name,
because a team can be renamed and its id cannot.

**This is only safe because an agent cannot be renamed.** ADR-0002 keeps the name at an edit,
which is what makes a name key stable at all. A future rename feature would silently orphan every
Handbook unless it moves them, and that sentence belongs in the implementation as a comment rather
than in a changelog after somebody finds out.

Rejected: `agents.id`, which loses the Handbook on re-add; and a JSON column on `agents`, which
cannot outlive the row and turns per-entry removal into a read-modify-write.

### Tombstoned with the team, never hard deleted

The team is tombstoned and can never be reopened, so a tombstoned Handbook is never composed
again. That is what *dies with the team* means operationally, and it costs nothing.

Hard-deleting would make this the one table in the schema that breaks the rule the rest of it
keeps — rows are never removed, because a cascade tears holes in a transcript — for a few
kilobytes.

### Not in the full clean's figure

The delete dialog prices what it recovers, measured from AgentWorkspaces:
`recovers about 3.1 GB · alice 2.9 GB · bob 180 MB`.

A Handbook does not appear in it. It is kilobytes against gigabytes, and adding it would make the
number dishonest about what it answers: that figure says *what work am I destroying*, and a
Handbook is not work. Recorded here so that nobody adds it later believing the omission was an
oversight.

### Both the rows and the events are persisted

They are different things and both are needed.

- **The rows** are what `composePersona` is composed from. They are the Handbook.
- **The events** are what redraws ticket 08's block in the transcript after a team switch, the way
  the compaction line and the activity column already survive one, because the snapshot carries
  the persisted log. They include entries that were later removed, since a transcript records what
  happened and is never rewritten.

**Removal is an event too.** Without it, a reopened team draws a removal control beside an entry
that is already gone.

### A defect found while resolving this, and ruled out of scope

Removing an agent from a team and adding them back later **collides on `agents_team_name`**. The
index has no partial predicate and `tombstoneAgent` does not release the name. This exists today,
with no Handbooks anywhere, and it is a defect in roster editing rather than in this effort.

It is ruled out of scope rather than fixed here, because fixing a roster bug inside a map about
Handbooks buries it. But the right fix is worth recording, because both candidates are compatible
with the key above:

- **A partial index** (`WHERE deleted_at IS NULL`) is the correct one.
- **Renaming on tombstone**, which is what `tombstoneTeam` already does, would also work and would
  leave the Handbook key untouched, since what we store is the live name.
