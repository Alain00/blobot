Type: task
Status: resolved

# A departed member's words draw as an agent id

## Problem

Take somebody off a team and their half of the conversation stops having a name. Every row they
ever wrote draws `mara_8f3545` where it used to draw `Mara`, with a blobatar whose hue is derived
from that id rather than from the face they had.

Observed 2026-09-07 on the author's `blobatar` team, which has had three members removed. The
transcript reads:

```
Compaign Auditor   I don't have anything in flight yet, and my Handbook here is empty.
alice_7ad081       Replied to Bob: nothing in flight for me and nothing blocked on him.
Compaign Auditor   Sent Bob a reply: I'm not yet briefed on the campaign auditing work.
alice_7ad081       Told Bob I will hold and not start PR 5 until Alain confirms.
```

Two of those four speakers are on the team and two are not, and the transcript says so in the
worst available way: by leaking a database key into the reading column.

## Why it happens

The renderer resolves every name through one map:

```ts
const byId = new Map(agents.map((agent) => [agent.id, agent]));
```

`agents` is `snapshot.agents`, which is the **live roster** — `team.agents` on the running team,
which is the roster the orchestrator was started with. Every fallback in `castOf` and in `Reply`
is then `?? item.agentId`. A removed Agent is tombstoned rather than deleted, so its rows survive
in the transcript with nothing left to resolve them.

The store already knows the answer. `agentsOfTeam(teamId, { includeDeleted: true })` is what
`transcriptOfTeam`, `answersOfTeam` and `logOfTeam` all use to decide which rows belong to the
team, so the name, the hue and the shape of every departed member are one flag away.

## The thing to decide

Not *whether* a name is available, but **what the transcript should say about somebody who is no
longer here.** Three candidates, and this ticket exists because the cheapest is probably not the
right one:

1. **Just draw the name and face.** Cheapest, and reads as if they are still on the team. A
   reader scanning the column would count six members where the roster says three.
2. **Draw the name, marked.** The face and the name, with the roster's own vocabulary for
   somebody who has left. Honest, and it costs a word in a column that already refuses badges.
3. **Draw the name and say nothing.** The past tense is carried by the fact that they have not
   spoken since, and the rail and the file sidebar are where a roster is answered.

Whatever wins binds three surfaces, not one: the transcript rows, the `to`/`from` on a peer
message, and the fold's `1 message with <face>` line, which will otherwise draw a hueless blob
for a name it cannot find.

## Not the same as the `Mara and me` defect

This ticket is how the *other* bug was identified — the name-versus-id split is what proved the
pane was showing `blobatar` — but it is independent of it and would still be true with that
fixed. See `live-steps/11`.

## Done when

- A transcript row written by a member who has since left the team draws whatever this ticket
  decides, and never a raw agent id.
- The same holds for a peer message's `to` and `from`, and for the fold's message line.
- A test puts a tombstoned Agent's row in a snapshot and asserts on what is drawn.

## Answer, 2026-09-07

**The name and the face, marked once.** Candidate 2, chosen by the author against the two that
say nothing.

The mark is `off the team`, in the header's own register: a mono word at `--muted` beside the
name, which is the register `typing` already occupies, so nothing new was invented and this
column still refuses badges. It rides the name **where the name is introduced and nowhere else**.
For an agent's own rows that is exactly where the header draws, so the existing grouping rule is
what decides it: a run of six rows from a departed member says it once, on the first, and the
five continuations under it carry no name to mark. There is no second rule to keep in step with
the first.

Three surfaces, because a name is introduced in three places: the row's header, the line naming
the far end of a peer message, and the fold's `messages with`. The stacked form of the fold's
faces drops its names past two and therefore has nothing to mark, which is the same answer it
already gave that label for the same reason.

## How

`UiSnapshot.departed`, and it is **its own list rather than an addition to `agents`**. `agents`
is the roster: the composer's `@mention` list, the file sidebar's chooser, the pending faces and
the rail all iterate it, and every one of them would be wrong about somebody who has been taken
off. What a departed member is still owed is a *name* and a *face* on the rows they wrote, which
is a lookup and not a membership. So `UiDepartedAgent` carries an id, a name, a hue and a shape
and nothing else: no status, no workspace, no runtime, because there is nothing running to report
any of them, and offering the shape of a roster member is how one ends up in an `@mention` list.

`departedOf` in main is the store read the ticket already identified —
`agentsOfTeam(teamId, { includeDeleted: true })` — with the **live roster subtracted** rather than
the deleted flag trusted, so the two lists cannot both claim the same person however the reads
are ordered. It is in both snapshots, the opening one and the live one.

In the renderer the resolution map stopped being `Map<string, UiAgent>` and became
`Map<string, Speaker>` — an id, a name, a face, and `gone`. `UiAgent` satisfies it, so the roster
half needed no change, and nothing that reads the map ever wanted anything else: every use was
`name`, `hue` and `shape`. `castOf` carries `fromGone` and `toGone` beside the names it already
resolved, so `ItemView` stays memoized on primitives.

`components/ConversationDeparted.test.tsx` puts a tombstoned Agent's rows in a pane and asserts
all four claims: the name is drawn, the id is nowhere in the column, the mark appears once for a
run, the face is the one the profile was saved with and not the one the id alone produces, and
the peer line and the fold both name them.

## Not changed

Nothing else in the window learned about departed members, and that is the point of the separate
list. The rail, the composer, the sidebar's chooser and the pending faces are all about the
roster, and the roster is exactly who is on the team now.

