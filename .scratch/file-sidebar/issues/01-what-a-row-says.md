Type: prototype
Status: resolved

# What a row says, once the badge is gone

## Question

The reference the author gave draws a tree of coloured file-type badges. *Already decided* 4 takes
the colour away: blobot drew the tree, so the tree is chrome, so the tree is monochrome. That
leaves a hole where the badge was, and a row that must carry three things at 14px in 220 to 400
pixels of width:

- **What it is** — a directory or a file, and which kind of file. The badge did this in the
  reference. `DESIGN.md`'s icon section has already ruled twice on glyphs beside the words they
  denote (*an icon beside the word it denotes is the same claim twice in the narrowest place in
  the app*), and a filename already ends in its own extension. So: does a file row get a mark at
  all, or is the extension the mark? Do directories get the one glyph in the tree, since *there is
  something inside this* is the one fact a name cannot carry?
- **What changed in it** — added, modified, untracked, and a directory that *contains* something
  changed. This is the decoration that makes the sidebar worth its width (*Already decided* 5),
  and it is weight and a mono mark rather than hue. Which mark, at which altitude, and does a
  collapsed directory roll its descendants' state up?
- **The nesting** — the reference uses indentation plus a chevron column. `DESIGN.md`'s rail entry
  already argued this shape for teams: *the chevron column carries the nesting*.

Decide the row. A prototype is the right instrument: this is *how should it look* with a real
worktree behind it, and the cheapest honest version is the real tree of this repository's own
`.scratch` and `packages` at three or four levels, drawn against `styles.css`'s tokens.

Two constraints that are not open: no colour, and the changed-decoration may not be the only
carrier of its fact if it is ever also a sound (`DESIGN.md`, Sound).

## Answer

Resolved 2026-09-05 at the author's direction, against `prototype.html` — four row treatments
plus two icon studies, drawn on this repository's real `git status` and `styles.css`'s real
tokens. The prototype stays, as `sound/prototype.html` does.

### The row is B: chevron, mark, name, and a fixed status column at the right

```
▸  [icon]  apps                              2
▸  [icon]    desktop                         2
   [icon]      Blob.tsx                      M
   [icon]      styles.css                    M
   [icon]      Composer.tsx
▸  [icon]  node_modules                          ← dimmed
▸  [icon]  .scratch                          ?
   [icon]  CLAUDE.md                         M
```

Four columns, three of them fixed: **the chevron** carries the nesting (`DESIGN.md`'s rail entry
already argued this shape for teams), **the mark** says what kind of thing it is, **the name**
takes the rest, and **the status column is parked at the panel's right edge**.

**The status column is a value in mono**, which is what mono is for — *this is a value, not a
sentence*. `M` for modified, `?` for untracked, a count on a collapsed directory that has changes
under it. 03 established the roll-up is free at every level, so a collapsed row can carry it
without anything having walked the subtree.

**Rejected: A (weight only).** One channel and no vocabulary — it cannot separate modified from
untracked, and three levels of dimness is the whole language.

**Rejected: C (the mark after the name, ragged).** It survives any panel width, and it destroys
the thing the panel is for: *which files changed* stops being a glance down an edge and becomes a
read of every row.

**Rejected: D (a bar in a gutter).** The strongest glance of the four and the one I would have
argued for on the sheet alone, but it has no vocabulary at all — modified, added and untracked are
one bar.

**Rejected: B′ (the column parked at a measured offset).** It kills B's real cost, which is
visible in the prototype: at 320px `CLAUDE.md` and its `M` sit 200px apart, and the gap widens
every time the panel does. The author took the panel edge anyway. **The cost is accepted, not
overlooked** — recorded here so that if the gap turns out to read badly in use, B′ is on the shelf
and does not have to be re-derived.

### The mark is a file-type icon per extension, and it needs a new icon set

The ticket was written expecting *no glyph on a file*, on `DESIGN.md`'s own twice-stated rule that
*an icon beside the word it denotes is the same claim twice in the narrowest place in the app* —
a filename ends in its own extension, which is a badge already there costing nothing. **The author
overruled it**, and the prototype then found that the rule was not the binding constraint anyway.

**Measured, from the installed `lucide-react`: Lucide cannot do per-extension.** Its file family is
*one page outline with a small motif inside*, seven usable glyphs, and `.ts`, `.tsx`, `.js`, `.mjs`
and `.css` all collapse onto `file-code` — so `Blob.tsx` and `styles.css` draw identically. At 13px
what separates `file-json` from `file-text` is about four pixels of stroke inside an identical
rectangle. It is a glyph per *kind*, and a coarse one.

**Also rejected: E, the extension itself in mono** in the same fixed column (`tsx`, `css`, `md`,
`yml`). It is per-extension in the literal sense, has no vocabulary to run out of, needs no second
icon set, and is what the author's reference is actually doing — `MD` in a coloured square is a
two-letter tag, not a picture. Refused by the author in favour of the real thing.

So the mark is a **real file-icon set** — Seti, vscode-icons, Material Icon Theme or similar.
`DESIGN.md`'s Icons section reads *Lucide, no other icon set, no inline SVG paths pasted into
components*, with exactly one narrow exception (a runtime's vendor mark, greyed, in the one module
allowed to hold a vendor path). A file-icon set is a second icon set and that sentence has to be
amended, which per `CLAUDE.md` is a reopen and a note in `build.md`, not a quiet edit.

**Which set, how it ships, and whether it is coloured is ticket 07**, graduated out of this one.
It is not a detail: it touches the local-first rule (bundled, never a CDN), the bundle, a licence,
and — if the icons keep their colours — the governing rule itself, which has been yielded once in
the life of the app.

### What still does not draw

**Directories keep the chevron and now take a folder glyph too**, open and shut. The chevron says
*there is something inside this*, which is the one fact a name cannot carry; the folder glyph is
the file-icon set's own answer to the same row and comes with it rather than being added.

### Left for the build

The gap at wide panel widths (B′ is the fallback), and the exact status vocabulary beyond `M` and
`?` — renamed, deleted and conflicted have no draw yet and no reader has asked for one.

## Amendment, 2026-09-05: the weight and the mark say two different things

Reopened by the author from the built thing, on the same day. The complaint was *the folders which
contain modified files do not have the mark*, and the panel was right: measured on the worktree in
the screenshot (`~/.local/share/blobot/worktrees/blobatar/bob`), `git status --porcelain=v2
-unormal` returned **one line** and the branch was **three commits ahead**. Every folder really was
clean.

**What was wrong is the measure, and this ticket inherited it rather than choosing it.** Ticket 03
says *the tree reports what git measured*, and what it measured is `status` — uncommitted against
`HEAD`, the same figure the tray's `+412 −7` uses. blobot has a commit control in the tray, so an
agent committing is the **ordinary** case, and a tree that empties the moment it does fails the
effort's own problem statement: *not one of them can say which nine files*.

**The answer is a second channel, not a third letter.** A fourth read joins the three — `git diff
--name-only <base>...HEAD`, one tree comparison per worktree against the base `status.ts` already
counts `ahead` from — and the two facts split across the two channels the row already has:

- **The weight** is *this file is part of what this agent did on this branch*, committed or not.
  It is what survives the commit, and it is the fact the reader was asking for.
- **The mark** is unchanged: `M` and `?`, *and it is not committed yet*. A committed file lifts
  with **nothing in the status column**.

So the vocabulary this ticket closed stays closed. `M` and `?` still separate modified from
untracked and nothing else was invented. What changed is that weight stopped being a restatement
of the mark — which is what it was, and which is why *A (weight only)* was rejected above for
having *one channel and no vocabulary*. It has a vocabulary now; it just is not the mark's.

A collapsed directory's roll-up counts the **union**, because *there is work in here* is the
question a folder answers. Measured on that same worktree: `apps 19`, `packages 14`, `docs 1`,
with `bun.lock M` still the only thing uncommitted. **19 ms** for the whole read, against 20 before
the fourth command.

Unchanged: no base to measure against — a detached HEAD, or a repository inside a `nested`
Workspace whose branches are its own — collapses the weight back onto the mark rather than guessing.

## Second amendment, 2026-09-05: the mark wears git's hue

By the author, on sight of the built tree: *the added/modified/removed in the file tree needs
colour*. This ticket's answer was *weight and a mono mark, **never hue***, so the change is
recorded here rather than made quietly.

**What the original rule was protecting is still protected.** The refusal was aimed at the
reference's coloured file-type badges — a hue per extension, on every row, saying nothing about the
work, decorating the whole flank and putting a wall of saturation beside the blobatars. None of
that moves. The row is still monochrome: the name, the Material mark, the weight, the ignored
dimming, a directory's roll-up count.

**What changed is that the status column was already the exception's own subject.** DESIGN.md
`:455` settled the diff counts a week earlier and its same-day amendment turned that from *one
exception* into **two tests**: the hue must reinforce a fact that is legible without it, and the
chroma must stay low enough that a blobatar wins the eye. `?` and `M` pass both — the letter is the
channel and the hue rides on it, and a row carrying a mark is already lifted, so a reader who sees
no colour at all loses nothing. And the status column *is* `+412 −7` one file at a time: colouring
the figure and greying its per-file breakdown is the inconsistency that amendment was written
against.

Three things bound it:

- `?` takes `--added` and `M` takes a new `--modified`, which is the ramp's **orange rather than
  its yellow**. `M` is the mark most rows carry, and the commonest state must not be the brightest
  thing in the flank.
- A directory's **roll-up count is coloured by the fold of what is under it** — see below. It was
  muted for an hour, on the argument that a folder holding both kinds would have to be drawn as
  one of them.
- **No hue without a letter.** Nothing gains a colour that did not already have a mark, so the
  vocabulary this ticket closed is still closed and there is still no third letter. A deleted file
  has no row to colour — it is not in the listing — which is why `--removed` is not spent here.

### The folder's count, and the argument that was wrong

Leaving the count muted was defended here on two grounds: that a count *names no state, so colour
would be its only channel*, and that `19` is a **union** — modified and untracked and
committed-on-this-branch together — so any single hue asserts one of those about a folder holding
several.

The author's answer is that the union has a rule, and Zed has been shipping it: added only is
green, deleted only is red, **mixed is orange**. The second ground was not a fact about folders,
it was an unexamined assumption that a fold has to lose information. It does not — it has to
*choose*, and the choice is a decision this ticket can make.

In this tree's two letters the rule collapses to one line: **`M` the moment anything under it is a
change to a tracked file, `?` where everything uncommitted in there is new.** A change to a tracked
file is the stronger claim, and a folder of nothing but new files is a folder nothing has been
taken out of. The mixed case and the modified case are the same answer, which is exactly why no
third letter is needed and the vocabulary still closes.

The first ground survives intact and is what bounds this: the count is still not *only* colour.
A folder with work in it is already **lifted**, which is the weight channel saying *there is
something here*; the hue only ever says which kind. And a folder whose work is **all committed**
keeps a muted count, because that is the same silence a committed file's own status column keeps —
so the fold is `mark`'s own meaning, *and it is not committed yet*, answered for a directory.

It costs nothing: `markUnder` is the prefix pass `countUnder` already makes, over the smaller of
the two sets, and it returns on the first `M`. Nothing walks.
