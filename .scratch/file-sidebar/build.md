# The file sidebar: what was decided while building, and what is left

Built 2026-09-05, all seven tickets in one session, against `spec.md`. `map.md` has the decisions
and each ticket the reasoning; this has the parts that are only visible from inside the code.

## The two rule amendments, applied

Both are in `DESIGN.md`, both were worded on their tickets, and neither was re-argued.

- **The flanks rule** (06) takes a second amendment dated the same day as the first. The rule's
  own text now carries the test — **is this the only rendering of this fact?** — with the one
  line that separates this flank from the one removed that morning: *the activity column drew
  what the transcript was already drawing; this draws what the transcript cannot.* The
  `--recessed` token row names two flanks again, and the sidebar has its own entry beside the
  details-panel one.
- **Icons** (07) takes its second and last exception: Material Icon Theme, greyed to one
  `currentColor`, normalised to a 15px box, in the one generated module allowed to hold those
  paths — and the paragraph says where the exception **stops**, which is the file tree.

## What was decided at the keyboard

**The status vocabulary is `M` and `?`, and `M` is everything that is not untracked.** Ticket 01
left renamed, deleted and conflicted open and said *decide it minimally*. A deleted file is not in
the listing to be marked, so the only place those three can show up is a collapsed directory's
count, where *something in here moved* is both true and the useful answer. Nothing new was
invented for them. `readChanged` says so where it parses porcelain v2.

**The seam in a `nested` Workspace was free, as ticket 05 hoped, but not for the reason it
guessed.** It hoped a repository root would already be *the only directory whose row can carry a
roll-up*. It would not have been: the root of a nested Workspace is in no repository, so its
listing is `tracked: false` and every row in it is silent, repository roots included. So
`markRepositoryRoots` reads each repository's own changed set — parallel, the 26 ms number from
ticket 02 — and gives its root a count. **The prediction holds after that fix and not before it**:
in an untracked listing, the rows carrying a count are exactly the repositories, so the device
really is nothing.

**The IPC takes many directories, not one.** Ticket 03 says one `git status` per refresh for the
whole worktree, and a refresh re-reads every folder the user has open. One call per directory
would have run that status once per open folder for the same answer. So `workspaceTree` takes a
list of paths, and expanding a folder is that list plus one.

**The repository governing a directory is asked, never passed in.** `git rev-parse
--show-toplevel` in the directory itself, bounded to the AgentWorkspace. It answers `git`,
`nested` and the seam with one mechanism, and it cannot disagree with the folder in front of it
the way a passed-in list of ticked repositories could. The bound is load-bearing: a worktree
sitting inside some other checkout must not be drawn with that checkout's changed set over it,
and there is a test for it.

**`check-ignore` takes its paths as arguments rather than on stdin.** Ticket 02 measured
`--stdin`. Arguments keep the injected `CommandRunner` the exact shape every other reader in
`workspace/` uses, and one directory is bounded by the entry ceiling, so the command line is
bounded by the same number the listing is.

**The panel is unmounted when it is shut.** Expansion memory is per `<team>/<agent>` and lives in
the component, so switching agents and coming back is free, which is what *Already decided* 10
asks for. Closing the panel is a person putting it away and it starts fresh — cheaper than
hoisting the state, and nobody asked for the other behaviour.

## The defect the map found, fixed first

`AppState.settled` is a monotonic counter, bumped in `settle()` beside `pushFeed` so the two can
never disagree, and `App.tsx` passes it to `useWorkspaces` in place of `state.feed.length`. The
feed's 200-entry cap stays: the cap is about memory and the revision is about liveness. A
re-delivered event is not a new settlement, so the counter refuses it exactly where `pushFeed`
does. `model.test.ts` proves it at 260 settled calls with the feed still at 200.

## Measured while building

- The reader against a real repository with a `node_modules`, an ignored `build.log`, an
  untracked directory and two modified files: **20 ms for three directories, including node's own
  start-up.** Ticket 02's numbers hold.
- The initial allowlist is **81 glyphs, pruned to 590 extension and 475 filename mappings**, and
  the generated module is 72 KB. The renderer bundle went from 2,588 KB to 2,731 KB — **+5.5%**,
  under ticket 07's +6.5% estimate for the 189 that cover this machine, which is the point of
  starting smaller.
- Reviewed with `--screen=files` against a real `--live-claude` team on a scratch repository:
  `drafts ?`, `src 2` and `CLAUDE.md M` in the column at the edge, `node_modules` and `build.log`
  dimmed and present, and the head carrying Alice's face with no branch on it.

## Found in use, the same day

**The head is the way out, and it was not.** Reported by the author against a real team: with the
sidebar open on Bob's tree there is no way back to the faces. Ticket 04 made the sidebar the third
place that can change panes and only pointed it one way — a face takes you *in*, and the rail was
the only way *out*. The head already says which agent you are looking at, so pressing it returns to
the team, which is where the chooser is. Symmetric with the act that got you there, and no words
added.

**The marks were uncommitted work, and an agent that commits emptied the tree.** Reported in the
same message as *the folders which contain modified files do not have the mark*. Measured against
the worktree in the screenshot (`~/.local/share/blobot/worktrees/blobatar/bob`): `git status
--porcelain=v2 -unormal` returned **one line, `bun.lock`**, and the branch was three commits ahead.
So the panel was right and the roll-up worked — every folder really was clean. What was wrong is
the **measure**, inherited rather than chosen: ticket 03 says *the tree reports what git measured*,
and what it measured is `status`, the same figure the tray's `+412 −7` uses, against `HEAD`. blobot
has a commit control in the tray, so an agent committing is the **ordinary** case, and a sidebar
that goes blank the moment it does fails this effort's own problem statement.

**Fixed the same day, and it is on ticket 01 as an amendment.** A fourth read — `git diff
--name-only <base>...HEAD`, against the base `status.ts` already counts `ahead` from — and the two
facts split across the two channels the row already had: **the weight** is *part of what this agent
did on this branch*, committed or not, and **the mark** is unchanged, *and it is not committed yet*.
A committed file lifts with nothing in the status column. **No third letter**, so 01's vocabulary
stays closed; what changed is that weight stopped being a restatement of the mark. A collapsed
directory counts the **union**, because *there is work in here* is what a folder answers. On that
same worktree it now reads `apps 19`, `packages 14`, `docs 1`, with `bun.lock M` still the only
uncommitted thing — **19 ms**, against 20 before the fourth command was added.

## Left over

- **The gap at wide panel widths.** Ticket 01 accepted it and put B′ — the status column at a
  measured offset — on the shelf. Nothing here changes that; it needs use, not a decision.
- **A real filesystem watcher.** Refused for the destination on ticket 03. If a turn's worth of
  staleness proves intolerable in use it comes back as its own question.
- **A file leaving the tree into the composer**, on ADR-0004's embedded path, with *copy path*
  riding along. The map calls it the first thing to build after this ships.
- **Keyboard navigation**, and whether the tree may ever take focus off the composer. Unargued.
- **Whether a folder expanding animates, and whether the panel's open makes a sound.** Both
  budgets and the eight committed acts are in `DESIGN.md`; a toggle may simply be navigational,
  which the `@mention` list was refused an animation for.

## After the first look, 2026-09-05

Four changes from the author reading the built panel, in the order they came.

- **The chooser's rows carry the tray's `+52 −51`**, per agent. It is the one place in the panel
  where four workspaces are on screen at once, and a face with only a name on it says nothing
  about whether there is anything in there. The figure is quoted from `Workspaces.tsx` rather than
  reworded. **Zero is silent** — the tray says `clean` because there the word is a live number's
  zero standing where a figure would be missing, but a column of `clean` beside every idle face is
  the word repeated for saying nothing. Nothing is the resting state and the figure breaks it.
- **The head is drawn as the rail's head is drawn**, and the divider under it is gone. It was the
  only horizontal rule in either flank — the rail separates its head from its list with spacing —
  and a few pixels inside the panel's own border it read as a second border. An inset row with a
  rounded hover ground, `.railfind`'s geometry, the two flanks facing each other across one window.
- **An `ArrowLeft` before the face.** The face was carrying the door on its own, and a face is the
  app's word for *this agent* everywhere else; nothing about it points anywhere.
- **The mark wears git's hue.** Ticket 01's second amendment has the argument; DESIGN.md
  `:1264` and the `--added` token comment carry it. `--modified` is new and is the ramp's orange.
  It shipped with the folder counts left muted, defended here on the ground that `19` is a union
  and a single hue would assert one of the kinds in it. The author answered with Zed's rule —
  added only is green, mixed is orange — and the defence was an assumption rather than a
  measurement: a fold **chooses**, it does not lose. `markUnder` is the prefix pass `countUnder`
  already makes, returning on the first `M`, so the folder says which kind for nothing.
