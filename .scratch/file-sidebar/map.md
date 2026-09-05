Label: wayfinder:map

# The file sidebar: seeing the folder the agent is working in

## Destination

A locked set of decisions for a **resizable right sidebar holding one panel: a file tree of an
AgentWorkspace**, decorated with what has changed in it. What a row says, whose folder it is, how
the tree is read and when it is re-read, what it does in a workspace that is not a repository,
where it sits on the surface ramp, and how it moves.

The map is done when nothing is left to *decide* before someone writes that code. It plans; it
does not build.

Raised by the author, 2026-09-05: *"i mostly will do coding, so we need a resizable sidebar on the
right"*, with two reference shots — a file tree, and a tabbed code viewer behind it. The second
panel is deferred by the author in the same sentence and is **out of scope** for this map.

## What this actually is

blobot's whole claim about agents is that **an agent's real state is a git worktree, not a
conversation** — the sentence `transcript-scale/10` survives on. Every surface built so far reads
that worktree as a *figure*: the tray says `+412 −7 · 9 files`, `WORKSPACE` says the branch and
how far ahead it is, `CONTEXT` says how full the window is. Not one of them can say **which nine
files**, and there is no surface in the app that can. That is the hole this sidebar fills, and it
is the reason it is not the activity column coming back in a new costume: the column was *the same
events listed a second time*, and this is the only rendering of a fact the transcript never
carries.

The grain is `<team>/<agent>`, as it is for a Handbook, a Routine and a branch. There is no "the
files" in this app — a team has a Workspace path and every Agent has its own worktree on
`blobot/<team>/<agent>`, which is the isolation model. `WORKSPACE` already met this and answered
it by being drawn twice, *"where a single branch name would be false about the other members"*.
This inherits that answer rather than re-deciding it.

## The rules this touches

- **The flanks rule**, `DESIGN.md` — *the flank is recessed*, rewritten **2026-09-05** to note it
  now has one subject, because the activity column came off that morning and the window went to
  two columns. A right sidebar restores the third. It survives the rule's own reasoning (see
  *Already decided*, 3), but the rule needs an amendment written, not a quiet contradiction of
  something dated yesterday.
- **The governing rule** — *the blobatars are the only saturated thing on screen*, yielded once,
  for attachment thumbnails, on *content the user supplied is not blobot's to desaturate*. Both
  reference shots are saturated. See *Already decided*, 4.
- **ADR-0004**, attachments are embedded and never linked — not contradicted here, because nothing
  leaves the tree in this map's scope. See *Out of scope*.
- **The Icons rule** — *Lucide, no other icon set*, with one narrow exception for a runtime's
  vendor mark, greyed. Ticket 01 needs a second icon set for the file-type mark, so this **will be
  amended**, which per `CLAUDE.md` is a reopen and a note in `build.md`. Ticket 07 owns it, and
  owns the larger question of whether those icons keep their colours, which is the governing rule
  rather than this one.
- **Motion**, both budgets, and the two-in-the-air cap — a drag, a collapse and a folder expanding
  are three moving things this adds.

Binding, per `CLAUDE.md`. Contradicting any of it is a reopen and a note in the relevant
`build.md`, not a quiet edit.

## Already decided

Settled in the charting session, 2026-09-05, breadth-first with the author. These are not tickets
and are not open; they are the frame the tickets sit in.

1. **It is a window onto the work, never an editor.** Read-only in every direction. blobot writes
   no byte into an AgentWorkspace from this surface, and acquires no buffer model, no dirty state
   and no race with an agent editing the same file. The author has an editor already and it is
   open on the same folder.
2. **Whose folder: the agent's own worktree.** In an agent's pane it is that agent's. In the team
   pane it needs an explicit chooser (ticket 04) — a tree quietly showing a different checkout
   than the diff line above it is the `STOPPED`-on-every-rail-row failure again.
3. **This is not the activity column returning**, and the reason is in *What this actually is*.
   The details popover **stays a popover**: `CONTEXT` and `WORKSPACE` are figures read on purpose,
   and folding them into a persistent panel buys back a fifth of the window for something nobody
   watches, which is what came off.
4. **Colour splits on authorship.** blobot drew the tree, so the tree is monochrome — no coloured
   file-type badges. The user wrote the file, so a viewer would carry syntax highlighting in
   colour, the same sentence as the thumbnail yield. Decoration for changed files is weight and a
   mono mark, never green and orange.
5. **The tree says what changed**, and that is what makes it worth the width. It inherits
   `churn.ts`'s `UNTRACKED_CEILING` and its `partial` honesty rather than inventing a second
   ceiling.
6. **A click opens the file in the user's own editor.** One IPC call, and it makes the tree a
   finished thing on the day it ships rather than a list of names waiting on a panel that is out
   of scope.
7. **Closed by default. One global width**, remembered, floor around 220px, dragging below the
   floor snaps it shut. *Ceiling corrected by 06, 2026-09-05: `window − rail − 900`, not half the
   window, which on a 1440px screen would have left the transcript 488px.* Not per team: a per-team sidebar width is a
   preference nobody has, and the rail is global.
8. **Ignored files are shown and dimmed, never hidden**, and an ignored directory is not descended
   into until asked.
9. **Nothing here reaches an agent.** Observation in the same sense the context gauge is
   observation: read, never written, never shown to a session, nothing entering a prompt.
10. **Expansion and selection are remembered in memory, per `<team>/<agent>`**, and lost on quit.
    Not persisted: a schema migration for a scroll position is the wrong trade, and coming back to
    a team the pool still holds and finding the tree collapsed is the complaint *a team keeps its
    place in the rail* already answered.
11. **Where it lives**: the agent pane and the team pane only. The three screens over the working
    surface cover it, as they cover everything else.
12. **If the second panel is ever built, the tree is `--recessed` and the viewer is `--ground`** —
    the same authorship seam as 4. Recorded here so the ramp is not re-litigated by a later
    effort; the panel itself stays out of scope.

## Notes

**Copy is short.** The author's instruction, 2026-09-05: *reduced text and verbosity in the UI.*
The general rule behind `DESIGN.md`'s **Words** section. Prefer a label to a sentence and nothing
to an explanation the surface does not need; try the version with no line first. It binds every
string this map produces, ticket 05's four empty states hardest.

**Domain.** `CLAUDE.md` for the permanent architectural rules, `CONTEXT.md` for the glossary,
`DESIGN.md` binding for anything a user perceives. Every session consults `/grilling` and
`/domain-modeling`; the sidebar's look is `/emil-design-eng` territory too.

**Where the code is.** `apps/desktop/src/renderer/src/components/` (`Conversation.tsx`,
`Details.tsx` for the popover this sits beside, `Workspaces.tsx`), `useWorkspaces.ts` for the
liveness precedent, `packages/core/src/workspace/` (`status.ts`, `churn.ts`, `workspace.ts`,
`icon.ts` — whose *one walk four levels deep* is the closest thing to a directory-reading
precedent), and `styles.css`'s one flat namespace.

**Two precedents that must not be re-answered.** `useWorkspaces` re-reads local git off a
revision bump and **on no timer**, with the reason written down: *"a team left open in the
background must not sit making requests nobody wanted"*. And `churn.ts` states a ceiling and flags
`partial` rather than under-reporting. Ticket 03 inherited both.
*Corrected 2026-09-05 while resolving 03: this map and that ticket both said the revision fires
**on turn settle**, and it does not.* `App.tsx:283` passes `state.feed.length`, and `pushFeed`
takes every **settled tool call**, so the signal is seconds rather than minutes. The watcher
question was argued against the wrong number until this was found.

## Decisions so far

<!-- one line per resolved ticket -->

- **02 — git is flat and cheap, the filesystem is not.** [What reading the folder actually
  costs](issues/02-what-the-folder-costs.md). `git status --porcelain=v2` is **3 ms** on a real
  AgentWorkspace with 68,000 files on disk, because it does not descend into an ignored directory;
  it scales with *tracked* files and takes 10,000 of them to reach 15 ms. A recursive walk of the
  same folder is **535 ms and 123,021 entries**, against **0.06 ms** for one directory. So a lazy
  tree is not a compromise, it is the only option, and the four-orders-of-magnitude gap is 03's
  first decision already made for it. `-unormal` is flat under 20,000 untracked files where
  `-uall` is linear, and its collapsed `? dir/` row *is* the roll-up a lazy tree needs.
  `check-ignore` batches a whole directory in one ~2 ms call and **cannot be derived away** — an
  ignored directory and an empty untracked one are both absent from `ls-files` and `status`.
  Outside the ignored tree **no directory in this repo exceeds 55 entries**; the 4,098-entry one
  is inside `node_modules`. A real `nested` Workspace is 22 entries, 18 repos and 4 not, at 231 ms
  serial and **26 ms parallel**. The sting: **03 can no longer argue the watcher on cost**, since
  a re-read is 3 ms, so liveness during a turn has to be argued on its own.
- **03 — three cheap reads, the signal blobot already has, and silence while it is stale.**
  [What the tree reads, when it re-reads, and what it says while it is
  wrong](issues/03-what-it-reads-and-when.md). Lazy `readdir` per expansion and **no walk
  anywhere**; one `git status --porcelain=v2 -unormal` per refresh for the whole worktree; one
  batched `check-ignore` per directory as it opens. A **collapsed directory carries the roll-up
  without anything having walked it** — `? dir/` for untracked, a prefix match over three rows for
  modified — which ticket 01 may assume. The refresh is `state.feed.length`, inherited unchanged.
  A **watcher is refused**, not on cost but because that signal already fires on the same events
  minus the ones nobody wants (an `npm install` writing 68,000 files into an ignored directory).
  **`targetOf` is refused too**, and it is the interesting one: blobot already knows the exact path
  every tool call is about, and using it would draw a mark from *the announcement of an edit rather
  than from the filesystem* — a cancelled or permission-refused call would leave a file marked when
  nothing on disk moved. The tree reports what git measured. While stale it **says nothing**: no
  timestamp (a mono value that changes on its own, which the fog already objects to for live
  steps), no dimming (a second moving thing in a flank, which is what the activity column died
  of). The transcript is forty pixels away and names the running call's file.

- **01 — the row is B, and the mark needs an icon set blobot does not have.**
  [What a row says, once the badge is gone](issues/01-what-a-row-says.md), decided against
  [`prototype.html`](prototype.html) on this repo's real `git status`. Four fixed columns:
  chevron, mark, name, and a **status column parked at the panel's right edge** carrying `M`, `?`
  and a roll-up count in mono, because a mark is a value and a fixed edge is what makes *which
  files changed* a glance. **Its cost is accepted rather than overlooked** — at 320px a name and
  its `M` are 200px apart, and B′ (the column at a measured offset) is on the shelf if that reads
  badly. Weight-only, ragged marks and a gutter bar are each rejected on the ticket. **The
  no-glyph-on-a-file argument was overruled by the author**, and the prototype then found the
  rule was not the binding constraint: measured against the installed `lucide-react`, **Lucide
  cannot do per-extension** — seven glyphs, with `.ts`, `.tsx`, `.js`, `.mjs` and `.css` all
  collapsing onto one, so `Blob.tsx` and `styles.css` draw identically. E (the extension in mono)
  was offered and refused. So the mark is a real file-icon set, which is a second icon set,
  which **07** now owns.

- **04 — the sidebar follows the pane, and has no selection of its own.**
  [Whose tree, in the team pane](issues/04-the-team-panes-chooser.md). The map chartered a
  chooser; there isn't one. The tray's `WORKSPACE` line is already agent-pane-only and
  `App.tsx:520` gives the reason (*"one branch and one possible pull request, which is a sentence
  that can be true. The team pane's answer is N of them"*), and the sidebar takes that answer one
  step further: **it draws the pane's agent, full stop.** That deletes three of the ticket's four
  sub-questions, because the pane already answers default, follow and memory. In the team pane the
  **empty state is the chooser** — the members' faces, and clicking one opens that agent's pane,
  the same act as its rail row. The team's own Workspace is refused as the fallback: it is the one
  folder **no agent is working in**. The head is the face and the name, never the branch, which
  the tray says forty pixels away.

- **05 — two of the four cases were not cases, and the fifth was the hard one.**
  [The tree that is not a repository, and the tree with nothing in
  it](issues/05-not-a-repository-and-nothing-to-show.md). `nested` needs **no in-scope rule**:
  `nested-repos.ts` already decided that an unticked repository is *absent, not
  present-and-ignored*, so the tree has nothing to hide. **A stopped team is not an empty state**
  either, since the worktrees are on disk and `git status` needs no running agent. What the ticket
  missed is that a nested workspace's **loose files are a copy**, so one tree is part git-backed
  and part not, and the marks are impossible in some subtrees: the seam is marked minimally, and
  may be free, since a repository root is already the only directory whose row can carry a
  roll-up. On a `plain` copy **the status column does not draw at all** (an empty column reads as
  *nothing changed*) and the head says `a copy`, two words the app already uses. Moved or deleted
  and demo mode take the **short form** in the flank (`folder not found`, `no folder`), with
  core's full refusal sentence staying where the fix is. Drawing nothing is refused everywhere: it
  is indistinguishable from a panel that has not finished reading.

- **06 — the transcript keeps its measure, and the flanks rule gets a test rather than a note.**
  [Where it sits, how it moves, and what the flanks rule says
  afterwards](issues/06-where-it-sits-and-how-it-moves.md). Measured: `.vA` is `232px
  minmax(0,1fr)` and `.col` is `max-width:900px`, so on a 1440px screen a 320px sidebar leaves the
  transcript **888px** and charting's *ceiling at half the window* would leave it 488. **Corrected
  here**: the ceiling is `window − rail − 900`, the 220 floor wins when that is impossible, and
  the sidebar gives before the measure does. The flanks amendment goes in **both** places, and the
  rule's own text carries the test a future flank must pass: *the activity column drew what the
  transcript was already drawing; this draws what the transcript cannot* — **is this the only
  rendering of this fact?** The toggle is a second glyph beside the details one (**two is not a
  row of switches; a third would be**); an invisible edge-as-control is refused as a hit target
  found by accident. Open and close animate on the interaction budget, **a drag animates nothing**
  because a panel that lags your hand reads as a slow app, the snap-shut is the one animated part
  of a drag, and the transcript re-centres continuously rather than on release.


- **07 — Material Icon Theme, greyed, as a generated subset; and the ticket's own fear was wrong.**
  [A second icon set, and whether it keeps its colours](issues/07-the-icon-set.md), against
  [`prototype-icons.html`](prototype-icons.html) and a census of **224,688 real files** on this
  machine. Both candidates are MIT; Seti loses on measurement, not licence — 385 mappings against
  **3,461**, no `.jsonl`, no `.log`, one folder glyph, and at 15px its React atom reads as a cog, so
  `Blob.tsx` and a settings file draw the same shape. The colour question dissolved: across all
  3,461 of Material's extension and filename mappings, **zero** pairs become indistinguishable when
  greyed, because colour is a property of a glyph here and never what separates two. Material's 100
  colour-only geometry pairs are all `languageIds`, which a file tree never consults. So it is the
  **vendor-mark exception applied a second time** — eight of the eleven marks this repo's tree draws
  are somebody's logo, and `RuntimeMark`'s three words already govern them: *greyed, never coloured,
  never in place of the name*. Coloured-on-changed is refused for a sharper reason than *hue says it
  twice*: it spends the app's one saturated channel on exactly the rows the eye has already found.
  Shipped as a **generated subset** — the whole set is 1,049 KB against a 2,588 KB renderer bundle
  (**+41%**) for 6.6× more glyphs than this machine has ever had a file for, where the 189 it does
  ask for cost 168 KB (**+6.5%**). It fails closed, and not on the palette's safety reason: a miss
  is the generic page glyph, which **23.5% of all 224,688 files already draw with the whole set
  bundled**. The seam is the assets and never the mapping — a generator prunes Material's own table
  and emits one checked-in module, the only place allowed to hold those paths, minus the 250 named
  folder icons (01 said *a* folder glyph) and the 54 `_light` duplicates. The `DESIGN.md` amendment
  is worded on the ticket for the build to apply.

## Found on the way

- **The local-git refresh stops after 200 events.** `pushFeed` is `[entry, ...feed].slice(0, 200)`
  (`model.ts:1425`), so `state.feed.length` saturates at 200 and never changes again;
  `useWorkspaces` is keyed on that number, so once a team has settled 200 tool calls local git is
  never re-read for the rest of the session and the tray's `+412 −7 · 9 files` silently freezes.
  Shipped today, not introduced here. A monotonic counter replaces the length. The sidebar would
  inherit it and be far more visibly wrong than a count is, so whoever builds the sidebar fixes it.
  Found resolving 03.

## Not yet specified

- **A file leaving the tree into the composer**, riding ADR-0004's embedded path exactly as a drop
  does. It does not contradict the ADR — the bytes are embedded, nothing is linked — and it is the
  one thing the tree could do that no other surface can: hand an agent a specific file out of its
  own worktree. It is a real design (which agent's composer, what the team pane does, whether the
  fan-out cost is stated) and folding it in would double this map. The first thing to build after
  the destination is reached. *Copy path* to the clipboard is one line and rides along.
- **Whether a folder expanding animates, and whether the sidebar's open and close makes a sound.**
  Both budgets and the eight committed acts are in `DESIGN.md`; nobody has argued this yet, and a
  toggle may simply be navigational, which the `@mention` list was refused an animation for.
- **Keyboard**: arrowing the tree, and whether it may ever take focus off the composer.
- **Whether a real filesystem watcher earns its keep.** Ticket 03 decides against it for the
  destination; if a turn's worth of staleness proves intolerable in use, this comes back as its
  own question, and it is a long-lived resource per agent per open team in a folder containing
  `node_modules`.

## Out of scope

- **The second panel: the tabbed file viewer.** Deferred by the author when the effort was raised.
  It is past the destination and it has to earn its own existence against *you already have an
  editor open on this folder*, which is a real argument and not a formality. Returns as a fresh
  effort, not a resumption. Its one decision that could not wait is recorded in *Already decided*,
  12.
- **Editing a file inside blobot.** Ruled out in charting, and it is not a bigger version of this
  sidebar; it is a different product, with a dirty-buffer model and a write race against an agent
  in the same worktree.
