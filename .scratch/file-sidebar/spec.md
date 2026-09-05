Label: ready-for-agent

# The file sidebar: a file tree of an AgentWorkspace

The build spec for `.scratch/file-sidebar/`, whose map reached the destination on 2026-09-05 with
seven tickets resolved and the frontier empty. Every decision below is a ticket's, and the ticket
carries the reasoning. **Read the map's *Decisions so far* before starting, and the ticket for
whatever you are touching.** Where this spec and a ticket disagree, the ticket wins and this file
is wrong.

## Problem Statement

blobot's whole claim about agents is that **an agent's real state is a git worktree, not a
conversation**. Every surface built so far reads that worktree as a *figure*: the tray says
`+412 −7 · 9 files`, `WORKSPACE` says the branch and how far ahead it is, `CONTEXT` says how full
the window is.

**Not one of them can say which nine files**, and no surface in the app can. A user watching an
agent work can see that something changed and cannot see what. Their own editor is open on the
user's repository, not on `~/.local/share/blobot/worktrees/blobot/<team>/<agent>`, which is where
the agent actually is.

There is also a shipped defect underneath this. `pushFeed` is `[entry, ...feed].slice(0, 200)`
(`model.ts:1511`), and `App.tsx:283` passes `state.feed.length` to `useWorkspaces` as its
revision. Once a team has settled 200 tool calls the length saturates, the effect never re-fires,
and **local git is never re-read again for the rest of the session** — the tray's churn figure
silently freezes.

## Solution

A **resizable right sidebar holding one panel: a file tree of one AgentWorkspace**, decorated with
what git says has changed in it. It is a window onto the work and **never an editor**: read-only
in every direction, blobot writes no byte into an AgentWorkspace from this surface. A click opens
the file in the user's own editor.

Closed by default, one global remembered width, and it draws **the pane's agent** — in an agent's
pane that agent's worktree; in the team pane an empty state whose content is the members' faces,
because a single tree there would be false about the other members.

## User Stories

1. As a user watching an agent work, I want to see which files it has changed, so that I can judge
   what it did without reading every tool call in the transcript.
2. As a user, I want the tree to sit in a panel I can open and close, so that the transcript keeps
   the window when I am reading rather than inspecting.
3. As a user, I want the panel's width remembered across sessions, so that I set it once.
4. As a user, I want to drag the panel wider and have it track my pointer exactly, so that it does
   not feel like the app is lagging behind my hand.
5. As a user dragging the panel below its floor, I want it to snap shut, so that there is one
   gesture for *make it smaller* and *put it away*.
6. As a user on a laptop, I want the transcript to keep its 900px measure, so that opening the
   sidebar does not make the thing I am reading worse.
7. As a user, I want a visible glyph in the chrome that opens the panel, so that I do not have to
   discover a gesture.
8. As a user, I want directories to expand only when I ask, so that opening a folder with
   `node_modules` in it does not stall the app.
9. As a user, I want a collapsed directory to tell me there is something changed inside it, so
   that I can find changed files without opening everything.
10. As a user, I want a modified file marked `M` and an untracked one marked `?`, so that I can
    tell *I changed this* from *this is new* without reading hue.
11. As a user, I want the marks parked at the panel's right edge, so that *which files changed* is
    a glance down one edge rather than a read of every row.
12. As a user, I want ignored files shown and dimmed rather than hidden, so that I can see what is
    in the folder the agent can see.
13. As a user, I want an ignored directory left unexpanded until I ask, so that the tree does not
    spend anything on 68,000 files I did not ask for.
14. As a user, I want each file to carry a mark that tells `Blob.tsx` from `styles.css`, so that I
    can scan by kind.
15. As a user, I want those marks monochrome, so that the sidebar does not become the most
    saturated thing on a screen whose only saturated things are the blobatars.
16. As a user, I want the extension still visible in the name, so that a mark I do not recognise
    costs me nothing.
17. As a user clicking a file, I want it to open in my own editor, so that the tree is a way into
    my tools rather than a dead list.
18. As a user, I want the tree to re-read itself as the agent's calls settle, so that it follows
    the work without my asking.
19. As a user, I want no timer behind it, so that a team left open in the background is not sitting
    there running subprocesses nobody wanted.
20. As a user, I want the tree to say nothing while it is a second behind, so that I am not doing
    arithmetic about staleness on a surface that is almost never stale.
21. As a user in the team pane, I want the panel to show me the members' faces rather than one
    agent's files, so that it never quietly shows me a different checkout than the line above it.
22. As a user in the team pane, I want clicking a face to open that agent's pane, so that the
    shortest path from *I want to see her files* is one click.
23. As a user, I want the panel's head to carry the agent's face and name, so that two agents'
    trees are impossible to confuse.
24. As a user, I do **not** want the head to repeat the branch, because the tray forty pixels away
    already says it.
25. As a user with a `plain` (copied) Workspace, I want the status column absent rather than empty,
    so that I do not read *nothing changed* off a column that could never have said anything.
26. As a user with a `plain` Workspace, I want the head to say `a copy`, so that the missing column
    has a reason on screen.
27. As a user with a `nested` Workspace, I want the tree to draw the repositories I ticked and the
    loose files beside them, so that I see everything the agent can touch.
28. As a user with a `nested` Workspace, I want the seam between a git-backed subtree and the
    copied loose files marked, so that I do not read the absence of marks in one subtree as
    *clean* after seeing marks two rows above.
29. As a user whose Workspace folder has moved or been deleted, I want the panel to say
    `folder not found`, so that a blank panel is not the only thing I get.
30. As a user in demo mode, I want the panel to say `no folder`, because the mock agents have no
    worktree at all.
31. As a user, I never want the panel to draw nothing, because a panel drawing nothing is
    indistinguishable from one that has not finished reading.
32. As a user who collapsed a folder, I want it still collapsed when I come back to this agent, so
    that switching teams does not reset what I was looking at.
33. As a user who quits the app, I do not expect my expansion state to survive, because a schema
    migration for a scroll position is the wrong trade.
34. As a user with a team open in the background, I want its tree to cost nothing until I look at
    it.
35. As an agent, I am never told any of this, because the sidebar is observation in the same sense
    the context gauge is observation.
36. As a user, I want the tray's `+412 −7 · 9 files` to keep updating after the team's 200th tool
    call, so that the figure I have been trusting all session is still true.
37. As a maintainer, I want the icon set bundled rather than fetched, so that the app has no cloud
    dependency.
38. As a maintainer, I want an extension with no bundled icon to draw the generic page glyph, so
    that the set failing to know something is not a crash.
39. As a maintainer, I want the two rule amendments written into `DESIGN.md`, so that the next
    flank and the next icon set are argued against a rule rather than against this feature.

## Implementation Decisions

### Reading (core)

**A new module in `packages/core/src/workspace/`, beside `status.ts` and `churn.ts`.** It is the
fourth reader of a worktree and it obeys the same two rules the other three do: read, never
written by an agent, never shown to one.

**Three reads and nothing else** (ticket 03, priced by ticket 02):

1. `git status --porcelain=v2 -unormal`, **once per refresh, for the whole worktree.** 3 ms on a
   68,000-file AgentWorkspace and flat in what is on disk, because git does not descend into an
   ignored directory. `-unormal` and never `-uall`: it collapses an untracked directory to a
   single `? dir/` row and is flat where `-uall` is linear (15 ms at 20,000 untracked files).
2. `readdir`, **per directory, as it is expanded.** 0.06 ms. **No walk, anywhere** — a recursive
   walk of a real AgentWorkspace is 535 ms and returns 123,021 entries of which about 700 are the
   user's.
3. `git check-ignore --stdin -n -v`, **one batched invocation per directory as it opens**, ~2 ms.
   It cannot be derived from `ls-files` and `status`: an ignored directory and an *empty
   untracked* directory are both absent from both, so the derivation is wrong exactly where it
   would be silent. `.git` must be excluded by the tree's own rule — `check-ignore` reports it as
   not ignored.

**The roll-up is free at every level and nothing walks to get it.** `? dir/` is already the fact
*there is something new in here*; for tracked-but-modified files the flat changed set is a handful
of rows and the roll-up is a prefix match over them. A collapsed row can therefore carry a count
without the subtree having been opened.

**A per-directory entry ceiling** in the shape of `churn.ts`'s `UNTRACKED_CEILING` — a stated
number with a `partial` flag rather than a silent truncation. Measured: outside the ignored tree no
directory in this repository exceeds **55** entries; the 4,098-entry one is inside `node_modules`.
A ceiling around 500 never fires on an ordinary directory and still caps the one an author
deliberately opens.

**Nested workspaces read in parallel.** 22 repositories serially is 231 ms and a visible pause;
`Promise.all` is 26 ms.

### The refresh signal

**`useWorkspaces`' signal, inherited unchanged**: it re-reads on the same revision, plus the manual
refresh the forge half already has. **No timer**, and the reason is already written down — *a team
left open in the background must not sit making requests nobody wanted*.

**The `pushFeed` defect is fixed as part of this work.** `state.feed.length` is replaced by a
**monotonic counter on the state**, bumped wherever `pushFeed` is called. The feed's 200-entry cap
stays; what must not saturate is the revision. This is a `model.ts` change with its own reducer
test, and it is the first thing to build, because every liveness claim below rides on it.

**Rejected and not to be reintroduced:** a filesystem watcher (not on cost — a re-read is 3 ms —
but because the existing signal fires on the same events minus `npm install` writing 68,000 files
into an ignored directory, and a watcher is a long-lived resource per agent per open team);
marking a file from `targetOf` (it would draw a mark from *the announcement of an edit rather than
from the filesystem*, so a cancelled or permission-refused call leaves a file marked when nothing
moved); re-reading when a call *starts* (it moves the stale window rather than closing it).

### The IPC surface

**Two methods beside `workspaceStatus` on `window.blobot`**, with their `Ui*` types in
`shared/api.ts` next to `UiWorkspaceStatus`:

- read one directory of one agent's workspace — `(teamId, agentId, relativePath)` answering the
  entries, each with its kind, its ignored flag, and its status mark or roll-up.
- open a path in the user's editor.

**The open handler is guarded the way `blobot:openLink` is.** That handler refuses anything that
is not `http:`/`https:` before calling `shell.openExternal`, on a stated reason. This one takes a
`teamId`, an `agentId` and a **relative** path, resolves it against that agent's own workspace in
main, and refuses anything that escapes it. **The renderer never sends an absolute path**, which
is the same containment rule `agent-media`'s ticket 06 arrived at, and for the same reason: blobot
must not become a read primitive that goes around ticket 14's permission posture.

**Panel state is the renderer's** — expansion and selection in memory per `<team>/<agent>`, lost on
quit; the width in `localStorage`. Neither goes near SQLite.

### The four states that are not a tree (ticket 05)

The governing rule: **the sidebar never draws an absence it did not verify.**

| kind | tree | status column | head |
|---|---|---|---|
| `git` | drawn | drawn | face and name |
| `nested` | drawn, ticked repos and the loose files | drawn inside repositories; the seam marked | face and name |
| `plain` | drawn | **absent, not empty** | `a copy` |
| moved/deleted | not drawn | — | `folder not found` |
| demo | not drawn | — | `no folder` |

Two cases the ticket was chartered with **do not exist**: `nested` needs no in-scope rule, because
`nested-repos.ts` already made an unticked repository *absent, not present-and-ignored*, so the
tree has nothing to hide; and a stopped team is not an empty state, because the worktrees are on
disk and `git status` needs no running agent.

The one the ticket missed and the build must answer: **in a `nested` workspace the loose files
beside the repositories are a copy**, so one tree is part git-backed and part not, and marks are
impossible in some subtrees. A repository root is already the only directory whose row can carry a
roll-up, so **check whether that alone makes the seam legible before adding any device**, and if it
does not, add the smallest thing that does.

`folder not found` and `no folder` are the **short form**. Core's full sentence — *"blobot cannot
find `<path>`. The folder this team points at has been moved, renamed or deleted"* — stays at the
launch refusal, which is where the fix is; it is too long for a flank.

### The row (ticket 01)

Four columns, three of them fixed: **chevron · mark · name · status column parked at the panel's
right edge.**

- The **chevron** carries the nesting, which is `DESIGN.md`'s rail argument applied again.
- The **mark** is a file-type icon (below).
- The **status column** is a value in mono at the right edge — `M`, `?`, and a roll-up count on a
  collapsed directory. **Its cost is accepted, not overlooked**: at 320px a name and its `M` sit
  200px apart, and B′ (the column at a measured offset) is on the shelf if that reads badly in use.
- **Decoration is weight and a mono mark, never hue.** A changed row lifts from `--muted` to
  `--ink`; an ignored row dims.
- Directories keep the chevron **and** take a folder glyph, open and shut.

Beyond `M` and `?`, renamed / deleted / conflicted have **no draw yet and no reader has asked for
one** — decide it at the keyboard, minimally.

### The icon set (ticket 07)

**Material Icon Theme, MIT, greyed to one `currentColor`, normalised to a 15px box, shipped as a
generated subset.** Lucide cannot do this — `.ts`, `.tsx`, `.js`, `.mjs` and `.css` all collapse
onto `file-code`.

- **Greyed loses nothing, measured**: across all **3,461** of Material's extension and filename
  mappings, **zero** pairs become indistinguishable when the fill becomes `currentColor`. Its 100
  colour-only geometry pairs are all `languageIds`, which a file tree never consults.
- It is the **vendor-mark exception applied a second time**, because most of these marks *are*
  vendor marks — eight of the eleven this repository's own tree draws are somebody's logo — and
  `RuntimeMark`'s three words already govern them: greyed, never coloured, never in place of the
  name.
- **A build-time generator** takes an icon allowlist, prunes Material's own mapping to entries
  whose icon is bundled, and emits **one checked-in TypeScript module** of inlined greyed paths —
  the shape Drizzle's checked-in migrations already use. That module is the only place allowed to
  hold these paths, exactly as `RuntimeMark.tsx` is for a vendor's own mark. Widening it is adding
  a name to the allowlist and re-running the generator; Material's 3,461 mappings are theirs and
  are never retyped.
- **The generator must exclude** Material's ~250 named folder icons (ticket 01 said *a* folder
  glyph — `folder` and `folder-open` and nothing else) and the 54 `_light` duplicates, which greyed
  are 54 copies.
- **Bundled, never fetched.** Whole set: 1,049 KB against a 2,588 KB renderer bundle (+41%) for
  6.6× more glyphs than a real machine has ever had a file for. The 189 needed to cover 100% of
  224,688 real files cost 168 KB (+6.5%). **The initial allowlist should be smaller than 189** and
  grow from what people actually open.
- **A miss is the generic page glyph**, which 23.5% of those 224,688 files already draw with the
  whole set bundled. A miss is the set's resting state, not a new failure mode.
- The MIT notice ships with it.

### Where it sits and how it moves (ticket 06)

- `.vA` is `232px minmax(0,1fr)` and the transcript's `.col` is `max-width:900px`. **The ceiling is
  `window − rail − 900`, not half the window** — charting's "half the window" would leave the
  transcript 488px on a 1440px screen. The floor of 220 wins when even that is impossible. **The
  transcript keeps its measure; the sidebar gives.**
- Closed by default; **one global remembered width**, not per team; drag below the floor snaps shut.
- **The toggle is a second glyph in the chrome, beside the details one**, where the activity
  column's toggle stood. **Two is not a row of switches; a third would be** — that is the standing
  limit for this chrome. Rejected: no visible toggle; the panel's own edge as the control (an
  invisible strip at the window's edge is a hit target found by accident).
- **Motion**: open and close on the interaction budget, ~200ms, `--ease-out`, in flow. **A drag
  animates nothing** and tracks the pointer exactly — an animated drag is a panel that lags your
  hand, which reads as the app being slow. The **snap shut** is the one animated part of a drag,
  because it is the app acting rather than the hand. **The transcript re-centres continuously with
  the drag**, not on release.
- `useRailWidth.ts` is the prior art for the whole drag: pointer capture rather than window
  listeners, `localStorage` rather than the database, and a `clamp` that survives storage being
  denied.
- A `--screen`-style launch flag so a screenshot can open the panel without a pointer, as
  `--screen=details` does for the popover.

### Whose tree (ticket 04)

**It draws the pane's agent. That is the whole rule.** `Pane` is already
`{kind:'team'} | {kind:'agent', agentId}` and the rail expands the open team into a row per agent.

- **No selection of its own** — that would let Bob's tree sit beside Alice's transcript, which is
  the failure the map warns about, and it buys a second thing to remember.
- Following the pane answers *what does it default to*, *does it follow*, and *is it remembered*
  without deciding any of them here.
- **In the team pane the empty state is the chooser**: the members' faces, and **clicking a face
  opens that agent's pane**, the same act as its rail row. The sidebar becomes the third place that
  can change panes, after the rail and the navigator, and that is accepted.
- Rejected: **the team's own Workspace** as a fallback — it is the one folder **no agent is working
  in**, so it would be the only tree in the app guaranteed to show nobody's work.
- **The head is the face and the name, never the branch.**

### The two rule amendments

Both are **reopens with a note in `build.md`** per `CLAUDE.md`, and both are already worded on
their tickets. Apply them; do not re-argue them.

- **`DESIGN.md`, the flanks rule** (ticket 06). The rule's own text takes the count and **the test
  a future flank must pass — *is this the only rendering of this fact?*** — because *the activity
  column drew what the transcript was already drawing; this draws what the transcript cannot.* A
  rule amended without that stated is a rule that will admit the next flank on the strength of this
  one. The sidebar's own entry carries the rest, beside the details-panel entry.
- **`DESIGN.md`, Icons** (ticket 07). The exact paragraph is on the ticket. It must say where the
  exception **stops**: the file tree and nowhere else. *An exception whose boundary is not written
  is a rule that has been deleted.*

### Copy

**Short, and that is a rule now.** The author's instruction, 2026-09-05: *reduced text and
verbosity in the UI*. Prefer a label to a sentence; **try the version with no line at all first**
and keep it only if something is lost without it. It binds every string here, ticket 05's states
hardest — each of them is a sentence today and should not be. **No em dashes in product copy.**

## Testing Decisions

A good test here asserts **external behaviour and a distinction that would be wrong to collapse**,
never an implementation detail. `Workspaces.test.tsx` states the standard for this area in its own
header: *the claims here are the ones a screenshot cannot make, and every one of them is about a
distinction the line must not collapse*. That is the bar.

**Four seams, and none of them is new.**

1. **Core's reader — the injected `CommandRunner` plus a real `mkdtemp` directory.** Exactly
   `status.test.ts`'s shape: a runner answering by the first words of the command line, so a test
   says only what it means, over a temp tree the test built. Assert: an ignored directory is not
   descended into; a collapsed directory carries its roll-up with nothing having walked it; `.git`
   is excluded by our own rule and not by asking git; an *empty untracked* directory is not drawn
   as ignored (the case that kills the cheap derivation); the per-directory ceiling reports
   `partial` rather than truncating silently; a `plain` workspace yields no status at all rather
   than an empty one; a nested workspace's repositories are read in parallel and its loose files
   carry no marks.
2. **The component in jsdom** — `FileTree.test.tsx` beside `Workspaces.test.tsx`, `createRoot` and
   `act`, `window.blobot` stubbed. Assert the five head states draw differently and **none of them
   draws an empty panel**; the `plain` status column is **absent, not empty**; a team pane draws
   faces and a face click asks for that agent's pane; the head carries the face and name and
   **never the branch**; a changed row lifts and an ignored row dims; the status column holds `M`,
   `?` and a roll-up count.
3. **`model.ts`'s reducer, pure** — `model.test.ts`'s existing shape. Assert the revision **keeps
   increasing past 200 settled entries** while the feed itself stays capped. That test is the whole
   proof of the defect fix and it should fail against today's `state.feed.length`.
4. **The icon lookup, pure.** A table function: a known extension resolves, an unknown one falls to
   the generic glyph, and the generated module contains no `fill="#`. **No component test asserts a
   glyph** — that keeps the icon subset free to grow without touching the tree's tests.

**Not tested:** the drag, the animation and the measure arithmetic. jsdom has no layout, and
`Blob.test.ts` and `test-dom.ts` already record why a test that believed otherwise is worse than no
test. Review those with `--screenshot` instead.

The suite must be green before this is called done — `pnpm typecheck`, `pnpm test`, `pnpm build`,
per `CLAUDE.md`.

## Out of Scope

- **The second panel: the tabbed file viewer.** Deferred by the author when the effort was raised.
  It returns as a fresh effort and has to earn its own existence against *you already have an
  editor open on this folder*, which is a real argument. Its one decision that could not wait is
  recorded on the map: if it is ever built, **the tree is `--recessed` and the viewer is
  `--ground`.**
- **Editing a file inside blobot.** Not a bigger version of this sidebar; a different product, with
  a dirty-buffer model and a write race against an agent in the same worktree.
- **A file leaving the tree into the composer**, on ADR-0004's embedded path. It does not
  contradict the ADR and it is the one thing the tree could do that no other surface can — but it
  is a real design (which agent's composer, what the team pane does, whether the fan-out cost is
  stated) and folding it in would double this. **It is the first thing to build after this ships**,
  with *copy path* riding along.
- **Keyboard navigation** — arrowing the tree, and whether it may ever take focus off the composer.
  Unargued.
- **Whether a folder expanding animates, and whether the panel's open makes a sound.** Both budgets
  and the eight committed acts are in `DESIGN.md`; nobody has argued this, and a toggle may simply
  be navigational, which the `@mention` list was refused an animation for.
- **A real filesystem watcher.** Decided against for the destination. If a turn's worth of
  staleness proves intolerable in use it comes back as its own question.
- **A minimum window width below which the panel refuses to open.** Named on ticket 06 as the
  fallback and deliberately not built: a narrow panel is better than an absent one, and nobody has
  met the case.

## Further Notes

**Build order.** The `pushFeed` revision fix first — it is a shipped defect, it is three lines and
a reducer test, and every liveness claim in this spec rides on it. Then core's reader against the
injected runner. Then the row and the icon generator. Then the panel, its drag and the two
`DESIGN.md` amendments.

**Two precedents that must not be re-answered.** `useWorkspaces` re-reads off a revision and **on
no timer**, with the reason written down. `churn.ts` states a ceiling and flags `partial` rather
than under-reporting. Both are inherited here rather than re-decided.

**One correction the map carries and this spec inherits.** The map and ticket 03 both said the
revision fires *on turn settle*. It does not — `pushFeed` takes every **settled tool call**, so the
signal is seconds rather than minutes. The watcher question was argued against the wrong number
until that was found, and the answer survived the correction.

**Nothing here reaches an agent.** No runtime is told the sidebar exists, nothing enters a prompt,
and no byte is written into an AgentWorkspace from this surface. Observation in the same sense the
context gauge is observation.

**Measurement caveats from ticket 02.** Every figure was taken with a warm page cache; cold-start
numbers will be worse and were not obtainable without root. Tracked-file scaling is established up
to 10,000 files and extrapolated above. **No measurement was taken on a network filesystem, which
is where every number here would change.**

**The prototypes stay**, as `sound/prototype.html` does: `prototype.html` (four row treatments and
two icon studies on this repo's real `git status`) and `prototype-icons.html` (the same tree drawn
greyed, coloured, and in Seti). They are the record of two decisions the author made by looking.
