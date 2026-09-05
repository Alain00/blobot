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
