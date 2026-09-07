Type: task
Status: done

# A live block outlives the team it belongs to

## What happened

The author created a two-member team (`Mara and me`, one Agent) while another team was open, and
the new team's pane came up carrying **the previous team's transcript**: forty-odd `tool reply`
rows under three live blocks, from a team the new one shares no Agent with.

Reported 2026-09-07 with a screenshot. Two things in that screenshot identify the transcript as
the other team's beyond argument: `Bob`, `Compaign Auditor` and `Creative Designer` draw as
names, while the same block's other rows draw as `alice_7ad081` and `mara_8f3545`. That split is
`blobatar`'s and no other team's, because those three Agents were removed from it and the ones
still on it are exactly the three that resolve. (The raw ids are their own ticket,
`team-addressing/07`.)

## It is not a data bug, and the reducer is not wrong either

Both halves were measured against the author's own database, and both are clean.

- `Mara and me` holds **0** rows in `messages` and **0** in `agent_messages`. Nothing was ever
  written into it.
- Main's snapshot for it is correct. Logged at the moment of the switch:
  `snapshot team="Mara and me" opening=undefined messages=0 answers=0 agents=mara_c2349b`.
- The renderer's reducer is correct. Probed live in the running window at the same moment:
  `state.items: 0`, `itemsFor(...): 0`, and `statuses` holding `idle` for every agent on both
  teams.

And yet, in that same probe:

```
.railrow.sel      "Mara and me"      // the rail agrees with main
.msg / .tool      41                 // the previous team's rows, still on screen
.msg.live         5                  // five live blocks, in a pane whose team has one Agent
.col children     6                  // one column, one React root, one .conv
```

Every one of those 41 nodes carries a `__reactFiber$…` key from the live root, all with the same
root suffix. So they are not orphans left behind by a second `createRoot` and they are not
detached: **React owns DOM that its own state says should not exist.** `rowsOf([])` cannot return
a row, and `pending` is drawn from `agents`, which was one Agent whose status was `idle`.

## Reproduced two ways

Both against a copy of the author's database, in an isolated `--user-data-dir`, with a temporary
`--debug-switch=<ms>:<teamId>` / `--debug-create=<ms>` hook in `main/index.ts` (reverted).

1. **Switch away and back.** Open `Mara and me`, switch to `blobatar`, switch back. The rail,
   the composer's recipient and the file sidebar all follow. The transcript does not: 41 rows
   of `blobatar` remain, twenty seconds after the switch.
2. **Create while another team is open.** Open `blobatar`, create a team. `sel: "Dbg Team"`,
   `rows: 41`. This is the author's case.

A cold launch straight onto the new team is clean, which is why this never showed up in a
`--screenshot` review: the reviewing flag opens one team and never switches.

## Where to look

The survivors are all `msg live` and `tool reply`, never a settled row. That is the live-block
path this effort built, and nothing else:

- `rowsOf`'s `live` row and `Live` / `Block` in `Conversation.tsx`;
- `useDwell`, whose `held` is only ever emptied by a timer scheduled for items that entered as
  `early`. An item that lands in `held` by another route is never scheduled for removal, and
  `kept` deliberately preserves anything still absent;
- `folded`, the `useRef<Set<string>>` read during render, which is per mount and never cleared;
- `useSwallowed`'s `loose` ref and its `flying` state.

This effort's own `build.md` already flags the shape of it under *Left over*: *"the dwell now
holds a batch's calls for 800ms in a block that no longer disappears"*. Ticket 05's amendment
made the block stand for the turn rather than for the call, which is right, and it removed the
unmount that used to sweep this state up.

Note also that `onStatus` is deliberately **not** filtered to the open team, so a backgrounded
team's agents keep writing into `state.statuses`. That is correct and load-bearing for the rail,
but it means anything that decides "is this agent mid-turn" from `statuses` alone will answer for
agents who are not in the pane.

## The one thing not settled

The reproductions above ran with the window **occluded** behind other windows, and Chromium
throttles compositing and rAF for a hidden window. So what is proved is that the reducer state
and the committed DOM disagree; what is not proved is whether the commit is genuinely starved or
whether occlusion contributed. The author sees it on a visible, focused window, so it is real
either way, but the first step is to reproduce it with the window in front and confirm the same
probe numbers. That is why this is `ready-for-human` rather than `ready-for-agent`.

## Done when

- Switching teams, and creating a team while another is open, both leave the transcript column
  holding nothing that belongs to the team that went away.
- A test covers it at the level the bug lives at: render `Conversation` with one team's items and
  an agent mid-turn, then re-render with `items: []` and a different roster, and assert the
  column is empty. The existing suites all mount once and never change teams, which is exactly
  the hole this fell through.
- `build.md` records what the mechanism turned out to be.

## Worked, 2026-09-07, and **not closed**

One real cause found and fixed, the reported one not reproduced. Status stays
`ready-for-human` for the reason it was written: the visible-window step has still not been run.

### What was ruled out

Each of these was measured rather than reasoned about, and each was a suspect this ticket named:

- **`Conversation`'s own props path.** The same root, re-rendered with the other team's roster,
  `items: []`, a new `place` and an old agent still `working` in the status map, draws nothing.
  That is `Conversation.test.tsx`'s *the same pane, on another team*, which is the test the
  *Done when* asks for, and it passed the first time it was written.
- **`useDwell`, `useSwallowed` and the `folded` ref.** All three live inside `Live`, and `Live`
  is unmounted by an empty row list, so none of them can outlive the block. The `held` list is
  bounded by its own timers in any case.
- **The reducer.** Already measured on the author's database; unchanged here.

### What was found

**An overtaken snapshot answers last, and the previous team comes back.** `refresh()` asked for a
snapshot and dispatched whatever came back. Main pushes `blobot:team` from a dozen places and
every push is a fresh `snapshot()`, so a switch always has two in flight, and the reducer
replaces the pane wholesale — so whichever answer lands *last* is what the transcript is. An
overtaken answer is not a stale detail to be corrected on the next push: it is the previous
team's whole conversation, live blocks included, put back into a pane that had moved on.

`asked` is a counter now and an answer that is not the latest is dropped, which is the rule
`loadEarlier` has always applied to the thing that *prepends* to the pane, applied at last to the
thing that *replaces* it. A counter and not a team id, because two snapshots of the same team
race the same way and the later one is still the true one.

`AppSwitch.test.tsx` is new and is the first suite in this app that changes teams — the hole this
ticket identified. It holds two snapshot requests and answers them in the order main would not
have chosen, and it fails without the fix.

### Why this is probably not the author's screenshot

Honest about what it does not explain. In this failure the *whole* snapshot is the old team's, so
the rail would say the old team too. The author's screenshot has the rail on `Mara and me` and
the transcript on `blobatar`, which needs `items` to be old while `snapshot.team` is new, and
nothing found here produces that. The disagreement between the reducer's state and the committed
DOM is still unexplained, and the unsettled question below is still unsettled.

### Still to do

Everything under *The one thing not settled*: reproduce with the window in front and focused, and
confirm the same probe numbers. If the numbers hold with a visible window, the remaining suspect
is the commit itself rather than anything either of the fixes above touches.



## Closed, 2026-09-07: two rows under one React key

The unexplained half is explained, on a **visible, focused window**, which is what this ticket was
left open for. It is not a starved commit and it is nothing in `Live`.

`rowsOf` was returning **two live rows with the same `live:<agent>` id**. React leaves the
loser's DOM standing when a key repeats, and from then on nothing can take those nodes away:
they are in the column with a fiber whose parent chain runs back through `Rows`, and `Rows` has
no row for them. That is exactly the shape this ticket recorded and could not account for —
`state.items: 0`, correct props, and forty nodes React "owns".

### Measured

A copy of the author's database, an isolated `--user-data-dir`, the window in front, driven over
the DevTools protocol. Opening `blobatar` from a cold start and then Antonio's own thread:

```
Conversation props   items: 2        // the thread's own two rows
Rows fiber           rows: 2
.col children        9               // seven of them blobatar's, dated two days earlier
each survivor        div < Live < Rows$1 < ... < Conversation
```

### The cause

`liveRunIn` lifts a teammate's settled reply into the live block, gated on `live(principal)`,
which is a fact about the agent **now**, with nothing said about where the run is. On a restored
transcript that means every one of an agent's earlier runs becomes a block the moment that agent
starts a new turn. Five agents with a fortnight of history is a dozen blocks and half a dozen
repeated keys. It never showed on a fixture one turn long, which is every fixture there was —
including this ticket's own new switch test.

### The fix

- **Nothing is lifted out of a run that is neither open nor the tail.** A settled reply in a
  finished run belongs in that run's fold, which is where it already is.
- **The id is a promise the rows keep.** `rowsOf` tracks each agent's standing block; an agent
  that opens a later turn has the earlier one taken back, folded into the run it came out of, or
  drawn flat where it stood if that run had no fold. Unreachable after the first fix, and kept
  because breaking that promise costs a row that never goes away rather than a row that is wrong.

### Done when, answered

- Switching teams leaves nothing of the team that went away — measured in the app, not only in
  jsdom.
- `Conversation.test.tsx` gained *keeps nothing of a team whose agent held more than one turn*,
  and `model.test.ts` covers both halves at the model's altitude: a settled run lifts nothing,
  and no two rows in a transcript share a key.
- `build.md` records the mechanism.

The overtaken-snapshot fix above stands on its own merits and is unrelated to this.
