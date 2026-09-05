Type: grilling
Status: resolved
Blocked by: 02

# What the tree reads, when it re-reads, and what it says while it is wrong

## Question

Three decisions that resolve together, against 02's measurements.

**One walk or a lazy read.** A tree that walks the whole worktree on open knows everything and
pays for it in a repository with 50,000 files; a lazy read per expanded directory pays only for
what is looked at and cannot answer *which directories contain something changed* without a second
source. The changed set is that second source and is cheap and flat (`git status --porcelain`), so
the likely shape is **lazy directories plus one flat changed set** — but the roll-up in ticket 01
depends on which, so decide it here and say so.

**When it re-reads.** `useWorkspaces` is the precedent and it is argued: local git follows the
work, re-read whenever a turn settles, on a revision bump and **no timer**, because *"a team left
open in the background must not sit making requests nobody wanted"*. A filesystem watcher is the
tempting alternative and is a long-lived resource per agent per open team in a folder that
contains `node_modules`; it is also a tree that twitches in the corner of the eye while the reader
is doing something else, which is the flank-nobody-watches failure in a new costume. Charting's
default is **settle-driven plus the manual refresh the forge half already has**. Confirm or
overturn it here, on the record, because it is the decision the author is most likely to feel in
daily use.

**What it says while it is stale.** This is the real cost of the answer above and it has no
default: a turn can run for minutes, during which an agent is writing files and the tree is
describing the folder as it was before the turn started. Options include saying nothing (the tree
is simply old), a mono line saying when it was read, or the tree going quiet in some legible way
while a turn is in flight. Whatever is chosen, *no pull request* and *we could not look* is the
governing precedent: **an unverified absence must not be drawn as a verified one**. A file the
agent created two minutes ago and the tree does not list is exactly that.

## Answer

Resolved 2026-09-05, against ticket 02's measurements. One correction lands first, because this
ticket was written on a false premise and so was the map.

### The premise was wrong: the existing signal is not per turn

The question said `useWorkspaces` re-reads *"whenever a turn settles"*. It does not.
`App.tsx:283` is `useWorkspaces(openTeamId, state.feed.length)`, and `pushFeed` takes **every
settled tool call** as well as every ended turn (`model.ts:1079`, `1109`, `1131`, `1162`). The
signal already fires every few seconds during real work, not once at the end of a turn that can
run for minutes. Everything downstream of that sentence needed re-deciding, which is why the
watcher argument below lands where it does.

### One: lazy directories, one flat changed set

`readdir` per expansion; **no walk, anywhere**. 0.06 ms against 535 ms, and the walk returns
123,021 entries of which about 700 are the user's.

Three reads and nothing else:

1. **`git status --porcelain=v2`** — `-unormal`, once per refresh, for the whole worktree. Flat
   cost, 3 ms on a 68,000-file AgentWorkspace, and it does not scale with what is on disk.
2. **`readdir`** — per directory, as it is expanded. Free.
3. **`git check-ignore --stdin`** — one batched invocation per directory as it opens, ~2 ms,
   because 02 established the derivation is wrong about an empty untracked directory.

**A collapsed directory can carry the roll-up without anything having walked it.** For untracked
work `-unormal` already collapses it: `? junk/` is one row meaning *there is something new in
here*, whatever the size of it. For tracked-but-modified files the flat set is a handful of rows
and the roll-up is a prefix match over them. So ticket 01's decoration may assume a collapsed row
knows whether its subtree contains changes — that fact is available at every level, cheaply, and
does not depend on the reader having opened anything.

### Two: the signal is `state.feed.length`, inherited unchanged

**Rejected: a filesystem watcher.** Not on cost — 02 killed that argument, a re-read is 3 ms — but
because the existing signal **already fires on the same events a watcher would fire on, minus the
ones nobody wants.** A watcher on an AgentWorkspace also fires for `npm install` writing 68,000
files into an ignored directory, for a build's output, and for every temp file a tool touches. It
is a long-lived resource per agent per open team, in a folder whose largest directory here holds
4,098 entries, bought to learn something the transcript is already telling us.

**Rejected: marking a file from `targetOf`.** Tempting, because blobot already extracts the exact
path a tool call is about — ACP's `locations` plus Codex's diff-block fallback, all of it parsed
in `adapters/acp/target.ts` and already relative to the workspace. It would let the tree mark a
file the instant a call opens. It is refused because it draws a claim from **the announcement of
an edit rather than from the filesystem**: an agent's call says what it intends to touch, and a
call that fails, is cancelled, or is refused at the permission prompt would leave a file marked as
changed when nothing on disk changed. That is the same class of error `agent-media`'s frame is
built to avoid — the tree must report what blobot measured, and the only thing that measures the
worktree is git.

**Rejected: also re-reading when a call starts.** It is one extra 3 ms read and it does not answer
the case it was proposed for. A four-minute `npm test` is stale in the middle either way; firing
at its start just moves the stale window.

So: the tree re-reads on the same revision every other local-git reader uses, plus the manual
refresh the forge half already has. No timer, and the reason is unchanged and already written
down — *"a team left open in the background must not sit making requests nobody wanted"*.

### Three: while it is stale, it says nothing

The stale window is now one tool call rather than one turn, and a stale tree is the ordinary state
of a tree for a second or two.

**Rejected: a timestamp at the foot.** It looks like the honest answer and is the worse one. It
invites arithmetic about staleness on a surface that is almost never stale, and it is a value in
mono that changes on its own — the same objection the map's fog already records against putting a
duration on a live step.

**Rejected: dimming while a call is in flight.** A second moving thing in a flank, which is
precisely what the activity column died of on 2026-09-04.

The tree is as of the last settled call and does not narrate that. **The transcript is forty
pixels away and already says what is running**, with the file name on the call, which is the
strongest form of *this may have moved since* available anywhere in the window — and it is a
sentence blobot already draws rather than a second device invented for the flank.

This does not weaken *an unverified absence must not be drawn as a verified one*. That rule is
about the sidebar claiming a thing is **absent** when it never looked — a `plain` workspace with
no diff, a workspace that has moved, a demo with no folder, which are ticket 05's. A tree that is
two seconds behind a running edit has looked, and said what it saw.

### Four: a defect found on the way

`pushFeed` is `[entry, ...feed].slice(0, 200)` (`model.ts:1425`), so **`state.feed.length`
saturates at 200 and then never changes again**. `useWorkspaces`' effect is keyed on that number,
so once a team has settled 200 tool calls, local git is never re-read for the rest of the session
and the tray's churn count silently freezes. Shipped behaviour today, not introduced here; the
sidebar would inherit it and be far more visibly wrong than a count is, because a missing file is
more legible than a stale number. A monotonic counter replaces the length. Recorded on the map
under *Found on the way* and fixed by whoever builds the sidebar.
