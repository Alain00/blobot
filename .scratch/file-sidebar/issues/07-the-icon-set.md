Type: grilling
Status: resolved

# A second icon set, and whether it keeps its colours

## Question

Graduated out of ticket 01, which decided the row and found that the mark on it cannot come from
Lucide: measured against the installed `lucide-react`, `.ts`, `.tsx`, `.js`, `.mjs` and `.css` all
collapse onto one glyph, so `Blob.tsx` and `styles.css` draw identically. The author chose a real
file-icon set. That choice is not free, and every part of the bill is a rule this repo has written
down.

**The rule being amended.** `DESIGN.md`, Icons: *Lucide (`lucide-react`), 13 to 17px, `--muted` at
rest. No other icon set, no inline SVG paths pasted into components, no emoji in the interface* —
with one exception, a runtime's own vendor mark, greyed, held in the single module allowed to
carry a vendor path. A file-icon set is a second icon set. Per `CLAUDE.md` this is a **reopen and
a note in `build.md`**, and the amendment has to say what the exception is and where it stops, the
way the vendor-mark exception does. An exception whose boundary is not written is a rule that has
been deleted.

**Which set, and under what licence.** Seti UI, vscode-icons, Material Icon Theme, and whatever
else is a candidate. Each needs its licence read and recorded, not assumed — these ship inside a
distributed desktop application.

**How it ships, which is not negotiable.** blobot is local-first with no cloud dependency, so the
icons are **bundled, never fetched**. That is the same refusal `adapters/acp` makes about a
vendor's endpoint and the same one the palette makes about a plugin's surface. So: the whole set,
or a subset compiled from an extension allowlist? A subset is the shape the palette already uses
and it fails closed — an unknown extension gets the generic file glyph — where shipping a whole
set means a thousand SVGs in the bundle for a tree that will draw fifteen of them.

**The one that is a different size of question: colour.** The author's reference is coloured, and
these sets are coloured by design — that *is* what distinguishes `.ts` from `.tsx` in most of them.
The governing rule is *the blobatars are the only saturated thing on screen*, yielded **once**, for
attachment thumbnails, on the argument that *content the user supplied is not blobot's to
desaturate*. That argument does **not** reach here: a file-type icon is blobot's chrome, drawn by
blobot, about a file rather than being one — which is exactly the seam ticket 01's Q4 split on.
`styles.css` also carries `--added` and `--removed`, the one saturated pair that is not a
blobatar, and its comment says *nothing else may use them*, so there is already a closed exception
sitting next to this one.

Three answers, and they are not the same size:

- **Greyed, one `currentColor`, normalised to a 24-unit box.** This is the vendor-mark exception
  applied a second time, word for word, and it amends Icons only. A row of thirty saturated
  squares down the flank beside a rail of faces is the case the governing rule exists for.
- **Coloured.** A second yield of the governing rule, in a column of many small marks rather than
  in a single thumbnail the user supplied. It needs its own argument and its own boundary, and it
  cannot borrow the thumbnail one.
- **Coloured only on a changed file.** Superficially attractive; refused on sight unless someone
  argues it, because it makes hue a second carrier of the status column's fact and hands the
  reader two channels saying one thing.

**Bounded by the same rule as everything else here.** Whatever is chosen, the icon may not be the
only carrier of its fact: the name still ends in its extension, which is the point ticket 01 was
overruled on, and that redundancy is now load-bearing rather than an objection.

## Answer

Resolved 2026-09-05, measured against both candidate sets on disk, this repository's real tree and
real `git status`, and a census of **224,688 real files** across this machine's projects. Drawn in
[`prototype-icons.html`](../prototype-icons.html), which stays beside `prototype.html`.

**Material Icon Theme, MIT, greyed to one `currentColor`, shipped as a generated subset.**

### The set: Material Icon Theme

MIT, `Copyright (c) 2025 Material Extensions`. Seti UI is also MIT (`Copyright (c) 2014 Jesse
Weed`) and lost on measurement, not on licence:

|  | Material | Seti |
| --- | --- | --- |
| icons | 1,251 | 169 |
| extension + filename mappings | **3,461** | 385 |
| `.jsonl`, `.log` | own glyphs | neither, both fall to the default page |
| folder | `folder` / `folder-open` | one glyph, no open state |
| legibility at 15px | holds | fails |

The last row is the one that decides it, and it is visible in panel C: seti's `.tsx` mark is the
React atom, and at 15px it reads as a **cog**, so `Blob.tsx` and a settings file draw the same
shape. Its `.md` mark reads as a downward arrow. Seti was drawn for a 22px sidebar; ticket 01's row
is 24px tall. `vscode-icons-js` is not a candidate at all — it is a name-to-icon *mapper* that
points at a CDN and ships no assets, which the local-first rule refuses on sight.

### The colour: greyed, and the ticket's own fear was measurably wrong

The ticket said colour *"is what distinguishes `.ts` from `.tsx` in most of them"*. **Measured, that
is false for both sets.** Every icon in both is a single flat hue over one geometry, and across all
**3,461** of Material's extension and filename mappings, **zero** pairs become indistinguishable
when the fill is replaced with `currentColor`. Colour is a property of a glyph here; it is never
what separates two. Material does hold 100 colour-only geometry pairs — Angular's `.clone.svg`
family, the `_light` theme duplicates — and **not one of them is reachable through a filename or an
extension**. They are `languageIds`, which a file tree does not consult.

So the argument is not *greying costs a distinction*. It is the plain one, and it has already been
made in this repo:

**This is the vendor-mark exception applied a second time, because these mostly are vendor marks.**
Of the eleven file marks this repository's own tree draws, eight are somebody's logo — TypeScript,
React, CSS, Node, pnpm, Drizzle, lefthook, git. `DESIGN.md` already rules on a logo on screen, in
`RuntimeMark`'s own words: *greyed, never coloured, and never in place of the name*. A file-icon
set is not new ground next to that rule; it is the same rule meeting five hundred more vendors. The
extension is still in the name beside the mark, so the redundancy ticket 01 was overruled on is
what keeps *never the only carrier* true.

And panel B is what the governing rule exists for: a red `apps`, a blue `src`, an orange `git`, a
column of thirty saturated squares down the flank beside a rail of faces. The thumbnail yield does
not reach here and the ticket already said why — a file-type icon is blobot's chrome, drawn by
blobot, *about* a file rather than being one.

**Coloured-on-changed is refused**, and the reason is stronger than *hue would say it twice*: the
changed rows are precisely the rows the eye is already on, so it spends the app's one saturated
channel on the rows that least need finding, while the `M` and the lifted weight say it too.

Greyed means `--muted` at rest and `--ink` on a changed row — the row's existing weight, with the
mark joining it rather than adding a channel.

### How it ships: a generated subset, bundled, never fetched

Bundled is not a decision, it is the local-first rule. What was open is *whole set or subset*, and
the numbers settle it. The renderer bundle is **2,588 KB** today.

| | mapping | icons | total | bundle |
| --- | --- | --- | --- | --- |
| whole set, 1,251 icons | 84 KB | 965 KB | 1,049 KB | **+41%** |
| the 189 this machine asks for | 53 KB | 115 KB | 168 KB | **+6.5%** |

189 is not a guess. It is the number of distinct icons needed to cover **100%** of 224,688 real
files across every project on this machine; the top 60 cover 99.35%. The whole set is **6.6×** more
glyphs than the machine has ever had a file for.

The subset is the palette's *shape* without borrowing the palette's reason — nothing here fails
closed for safety, and saying so is what keeps that argument honest. It fails closed because a miss
is cheap, and the set's own numbers prove it: **23.5% of those 224,688 files get the generic page
glyph with the whole set bundled**, because no icon theme has a mark for everything. A miss is not
a new failure mode this subset introduces; it is the set's resting state, met one extension sooner.

The seam is the **assets**, not the mapping. A build-time generator takes an icon allowlist, prunes
Material's mapping to entries whose icon is bundled, and emits one checked-in TypeScript module of
greyed inline paths — the shape Drizzle's migrations already use here. Widening it is adding a name
to the allowlist and re-running the generator, not authoring an extension table; Material's 3,461
mappings are theirs and are never retyped. The generated module is the **one place allowed to hold
these paths**, exactly as `RuntimeMark.tsx` is for a vendor's own mark.

Two things the generator must not pull in:

- **Material's folder vocabulary** — 250-odd named folder icons. Ticket 01 said *a* folder glyph,
  open and shut, and that is `folder` and `folder-open` and nothing else. Panel A draws the
  specialised ones and they are noise: `src` and `apps` become two more shapes to learn in a
  column whose chevron already carries the only fact a folder name cannot.
- **The `_light` duplicates** — 54 icons that exist only to be a second hue. Greyed, they are 54
  copies.

### The `DESIGN.md` amendment

A reopen and a note in `build.md` per `CLAUDE.md`, and it is the build's edit to make, not this
map's — but the wording is decided here so it is not re-argued at the keyboard. Under Icons, after
the `RuntimeMark` paragraph:

> **A second exception: the file tree's marks.** Lucide cannot do per-extension — `.ts`, `.tsx`,
> `.js`, `.mjs` and `.css` all collapse onto `file-code` — so the file sidebar takes Material Icon
> Theme (MIT), greyed to one `currentColor` and normalised to a 15px box, in the one generated
> module allowed to hold those paths. It is the vendor-mark rule reaching further rather than a new
> one: most of these marks are somebody's logo, and the same three words hold — **greyed, never
> coloured, never in place of the name.** The extension stays in the name beside the mark. Bundled
> as a generated subset, never fetched; an extension with no bundled icon draws the generic page,
> which is what a quarter of all files draw anyway. It stops at the file tree: nowhere else in the
> app may a second icon set appear, and a glyph beside the word it denotes is still the same claim
> twice everywhere else.

### Left for the build

The initial allowlist. 189 covers this machine; the honest starting number is smaller and grows
from what people actually open, because a glyph nobody has a file for is a glyph nobody sees.
