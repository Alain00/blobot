# blobot's design rules

The one place the interface is written down. `apps/desktop/src/renderer/src/styles.css` is the
implementation; this is what it means and what you may not do to it.

Read this before changing anything a user can see. The rules here were each paid for by a
screen that was wrong first, and the reason is given with every one — if a reason no longer
holds, say so and change the rule deliberately rather than working around it.

**Binding.** These came from ticket 12 (`.scratch/first-demo/issues/12-team-and-conversation-ui.md`)
and its amendments. Contradicting one is a ticket reopen and a note in `build.md`, not a quiet
edit. Adding to them is ordinary work.

## The governing rule

**The blobatars are the only saturated thing on the page.**

Everything else is `--ground`, `--raised`, `--ink`, `--muted`, `--line`. No accent colour, no
brand colour, no coloured badges, no red errors, no green success. Colour means *identity*, and
an agent is the only thing on screen that has one.

Consequences you will keep bumping into:

- **Status is never colour**, and it is a shape or a word, **never both at once**. A coloured dot
  is exactly what the palette forbids. **Three dots while a turn is in flight, and no word** —
  `starting`, `thinking`, `working` and `responding` are one fact to a glance down a column, and
  spelling WORKING beside dots that already say so is the same claim twice in the narrowest
  place in the app. **The word survives exactly where the dots would lie**: `waiting`, which is
  not busy but stopped until a human looks, and which takes the one inversion on the page; and
  `failed`, struck through. `idle` says nothing anywhere. A slow breathe on the blobatar sits
  under all of it. *Amended 2026-08-30, twice on the same day. First: this said three channels,
  the third being a hairline that swept while a turn was in flight. A bar travelling toward an
  end claims progress toward a finish, and nothing here knows how far into a turn an agent is;
  at 14px it did not read as a bar anyway, only as a shimmer beside the word. Three dots claim
  "occupied, no estimate", which is the truth, and they are the glyph the transcript already
  used for "still coming". Then: the word went with it for those four states. It had been the
  only thing separating four body animations that turned out to be sub-pixel, so once those
  collapsed it was distinguishing nothing, and* which *kind of busy is a question the transcript
  answers concretely — in tool lines and text arriving — rather than as an abstraction printed
  over them. The count a fold carried ("2 working") went with the word, since it was qualifying
  it. It survives as the `aria-label`, so nothing is lost to a reader not reading the shape.*
- **A blobatar is seeded by the agent's *name*, never by a row id.** The library derives the
  whole face from that string, so a surface that seeds it with an id draws a different creature
  for the same agent. That is exactly what happened: the rail seeded by Agent id, the roster
  lists by profile id and the hire preview by the name being typed, and one agent wore three
  faces. The colour picker already says the name gives the face; this is that sentence enforced.
  Only the hue is stored, because the user can choose it.
- **Nine silhouettes, never the organic one.** *2026-08-31.* The library partitions the hash into
  ten shape bands, so `organic` is not something a name asks for and can be argued out of: it is
  a region of the hash, and the only way to not have it is to not offer it. Every `<Blobatar>` in
  the app spreads one constant, `SHAPE_TRAITS`, which names the other nine as a list and lets the
  name pick among those. What that costs is the library's weighting, since a list is uniform over
  what it lists, and the reason it is one constant rather than a choice per surface is the rule
  directly above: two rosters listing different shapes give one agent two faces.
- **A blobatar appears where you are identifying among agents or choosing one, and never
  where a single agent is merely named.** Saturation is the one channel that pulls the eye, so
  a face repeated on every surface that mentions its agent spends the channel on repetition and
  leaves the rail, which is the census, no louder than a button. That earns a face for the rail,
  the composer's mention menu, and a turn in the transcript; it takes one off the conversation
  header, off the send button, and off the far end of a peer route that the pane you are in
  already is. Where the rule takes a face away, the name stays.
- **A terminal is quoted, not exempt.** The one surface that embeds another program's output
  (a runtime's own sign-in) hands xterm a monochrome sixteen-colour palette, so a vendor's
  greens and cyans do not become the only saturated thing on screen that is not a blobatar.
  Nothing legible is lost: a terminal carries structure in bold, dim, inverse and its own
  glyphs, and the login that prompted this marks its selection with a filled circle against
  empty ones. The transcript already holds the same line, rendering markdown with no syntax
  colour at all.
- **Content the user supplied is not blobot's to desaturate.** An image the user attaches is
  drawn as itself, in colour, in the composer and in the transcript. This is the one place the
  rule above yields, and it yields because the rule is about *blobot* not competing with the
  faces: an attachment is a person's own file quoted back to them, not a signal blobot is
  emitting, and the reason to scroll back to it is to see which one it was. Narrow on purpose.
  It licenses no coloured chrome, no coloured chips and no coloured icons, and it leaves the
  team icon and `RuntimeMark` exactly as they were — a vendor's logo is still greyed, because
  that is blobot choosing to put a brand on screen. See `.scratch/composer-attachments/`.
- **Contrast is the attention channel**, because colour is spoken for. Spend it almost never.
  There are two inversions in the whole app: `waiting` (the one state where an agent sits
  forever until a human looks) and an armed primary button.

## Tokens

| Token | Value | What it is |
|---|---|---|
| `--recessed` | `#060608` | The flanks: the rail and the activity column. Below the page, never `#000`. |
| `--ground` | `#0a0a0b` | The reading surface: the transcript, and nothing else. |
| `--tray` | `#0e0e10` | The bar tucked under the composer. |
| `--raised` | `#131315` | Anything lifted: a bubble, a field, a menu, a selected row. |
| `--ink` | `#fafaf8` | Text, and the one emphasis worth spending. |
| `--muted` | `#8a8a93` | Secondary text, every mono label, every icon at rest. |
| `--line` | `#232327` | Every hairline and every border at rest. |
| `--sans` | Geist | Everything a user reads as prose. |
| `--mono` | Geist Mono | The three cases under **Type**, and nothing else: a value, a literal, a signage label. |
| `--hand` | Caveat | Display type on the creation flow. Nowhere else. |

Dark only (`color-scheme:dark`). There is no light theme and adding one is a design project,
not a variable swap: half these rules are about what is *brightest* on the page.

**No ink edge on a closed shape. Ever.** *2026-08-31, and it is a ban rather than a preference.*
A 2px `--ink` rule down one side is a mark in the gutter of the page: it works on `.refusal` and
`.disclosure`, which have no ground and no border, where it is the only thing saying *these
sentences are one thing*. Put it on a shape that is already closed — a card, a filled list row,
anything with `--raised` or a hairline — and it stops containing and starts highlighting, so the
block reads as selected, or errored, or as the one item on the screen that is not like the
others. It was tried on the permission card and thrown out for exactly this; it survived on the
Routine proposal and on `.openerror` and was wrong there too. If a closed shape needs to say
something about itself, it says it **in words, or by where it sits** — never with an edge, and
never with colour.

## Type

- **Surfaces, and the ramp they sit on.** `--ground` is the page, `--raised` is anything lifted
  off it, and `--tray` is the bar tucked under the composer. The greys are a hair cool by design
  and the hair is the same size all the way up: `+1` of blue over the grey at `--ground`, `+2` at
  `--raised` and `--tray`, `+2` again at `--recessed`. **A new surface is placed on that ramp,
  never beside it** — `--tray`
  is the channel-by-channel midpoint of its two neighbours, and the first value tried was `+4`,
  which everyone reads as *blue* rather than as a lifted grey. At this chroma a band says *this
  bar is a thing* and nothing more, which is the whole of what a surface may say next to a face.
- **The flanks are recessed, and both of them are.** `--ground` is the surface you read on, so
  the transcript has it and nothing else does; the rail and the activity column are chrome and
  sit a step below it, on `--recessed`. Toning the rail alone was considered first and cannot
  answer its own question: the activity column is exactly as much *not the transcript* as the
  rail is, and dressing one side of a three-column window reads as an accident.
- **Down, not up, and the reason is the faces.** A lifted flank was built first and was wrong
  twice. It fights what the shape already says — a sidebar is the wall of the room, not
  something hovering over it — and it spends the tone in the direction that costs the blobatars
  contrast. The rail is where they live, and a darker ground under a face gives it more. The
  `#000` refusal below is about the floor, not about everything above it: ten levels separate
  the page from black and this uses four of them. Either direction keeps the hairlines, because
  the tone says **different plane** and the line says **edge**, and neither may do both jobs.
- **Going down also costs one token instead of two.** Every lifted surface inside a flank —
  Search at the head of the rail, a selected row, the gauge's open row, a hover — stays
  `--raised`, and its gap *widens* from nine levels to thirteen rather than collapsing to five.
  The lifted version needed a fifth surface to buy that back. What must still be told is
  `--cut`: a face is cut out of the surface behind it, so a moved surface hands the blobatars
  their new ground or every one of them wears a halo of the old one.
- Body is 14px/1.5 sans. Prose gets sans; the three cases below get mono at 10 to 12px, usually
  `--muted`, usually uppercase with letter-spacing when it is a label.
- **Mono is a signal, not a texture.** It says "this is a value, not a sentence". A mono
  paragraph is a bug.
- **A word in mono is a value pretending to be code.** That sentence was written for the
  workspace tray, where `clean` and `commit` and a branch name sat in one row and only the diff
  counts kept the family. It is the general rule, and *anything literal* was too loose a test to
  find it: a status word is literal, a sentence explaining why a turn stopped is literal, an
  empty-state line is literal. Everything blobot puts on screen is literal about something.
  **Mono has exactly three cases:**
  1. **A value that must not reflow.** `+412 −7`, `84%`, `120k/200k`, a time, a byte size. The
     argument is `font-variant-numeric:tabular-nums`, not the family — a count that changes while
     you are reading it must not shift the words beside it. Mono comes along because the two
     belong together.
  2. **A literal you could copy, type or paste.** A path, a branch, a command, a model id, an
     `@name`, a tool name. The test is that it was *quoted from somewhere else* — it exists
     outside this window and blobot is repeating it exactly.
  3. **An uppercase signage label.** `TEAMS`, `CONTEXT`, `WORKSPACE`, the status word. Not prose:
     the app's own furniture, where the tracking is what makes a word read as a rule rather than
     as text. This is the case that pays for the status channel, which is a permanent rule.
- **Everything else is sans, and sentences especially.** An empty state, a hint, a recovery
  instruction, a button label, the line that says why a turn stopped — these are blobot talking,
  and blobot talks in prose. Uppercase mono with letter-spacing is the least readable setting on
  the page, so the one line explaining a failure is the worst thing to spend it on. Content an
  agent wrote is prose too: a markdown table's header is the agent's, not blobot's signage.
- The hand face carries the creation flow's display line only. One voice per page: handwriting
  on every subhead would make the steps look optional.
- **The three faces are bundled, never fetched.** Geist, Geist Mono and Caveat come from
  `@fontsource`, imported in `main.tsx`, latin subset, and only at the weights named here. They
  were a `<link>` to Google Fonts, which made a local-first app render in Geist on a machine with
  a network and in whatever `ui-sans-serif` resolves to on one without, with nothing on screen
  saying which you were looking at. Nothing in `index.html` may request a font. The `--sans`
  stack names **`Geist Sans` and `Geist`**, in that order: the first is what the bundled faces
  call themselves, the second is what a machine with the typeface installed calls it.

## The three voices in a transcript

Distinguished structurally, never chromatically. This is the load-bearing part of the
conversation and the reason it is not a generic chat app.

- **From you** — a solid filled bubble, right-aligned, no name. Right *is* the label: there is
  only ever one "you", so the side stays unambiguous however many agents share the pane. The
  routing tag (`to Alice`) sits under it, and only in the team pane.
- **From the agent** — no container at all. It is the pane's default voice; boxing it would make
  the agent look like a guest in its own transcript.
- **From a peer** — inset and unfilled: one line, being a chevron, `message received from` or
  `message sent to`, the far end's blobatar and its name. **Shut, with no peek**, and it opens on
  a click into the message and the trust framing printed verbatim on the received side. The
  **dashed** edge is on the opened message and not on the shut line: a one-line label needs no
  enclosure, because it says in words what the border says in texture. A peer message is usually a whole turn quoted back at an agent; at full
  height a single one buries every reply around it, and the eight-line fold it had before still
  outweighed the reply it was about. A peek also claims the first eight lines are the part worth
  reading, which for a quoted turn is rarely true. One blobatar, not two: the near end of the
  route is the pane the line is already sitting in.

**Dashed against solid is the whole trick, so do not soften it.** A user message and a peer
message are both "text someone sent this agent"; solid-and-filled against dashed-and-unfilled
reads as higher against lower authority before a word is parsed, which is the visual form of a
peer message being refusable rather than an instruction. The enclosure was four dashed sides on
a raised ground, then one edge, and is now one edge down the *opened* message only; each of those
is a weight change, not a signal change, and the signal is not yours to spend. Wherever a quoted
turn is on screen, the dashed edge is on it.

Other transcript rules:

- A turn is labelled once. Consecutive messages from one agent drop the repeated blobatar and
  name and tighten their gap.
- The column fills the pane to a 900px measure and centres.
- A time rule appears before the first item and after a fifteen-minute gap.
- Three dots stand in for an agent that has been asked something and has not started streaming.
- **Only the message being written carries status.** A blobatar beside a settled message is
  still: that message is a record of something already said, and twenty of them bobbing in
  unison the moment their agent starts working is the same fidget the team mark's folded
  animation was withdrawn for. The rail row and the pending dots carry the state instead — not the transcript's header, which carries no status at all.
- **Hiding is for the peer voice and for settled steps.** A message from you is yours and
  short; an agent's answer is the thing the pane exists to show, and putting it behind a click
  would be hiding the work. **Amended 2026-08-30 (ticket 12):** a caption on a tool call is not
  that answer. A long turn is a dozen of them — *"Now the desk surface and the scene that ties
  it together."* — each introducing one call, and then the paragraph it was all leading to.
  Drawn flat that reads as a bulleted list of intentions, because the captions are sentences and
  the calls are one mono line each, so the narration wins the column by weight while saying the
  least and the answer is buried under the work that produced it.

  So a **step** — a caption and the calls it introduces — folds, and a run of them is one line:
  `ran 6 tools`, plus `· 1 failed` when something did. Three things are structurally outside a
  block rather than flagged open inside one, so that "the live step never folds" is a property
  of the grouping (`rowsOf`) and not an exception at the render site somebody can forget: a call
  that is running or asking, a question nobody has answered, and a live answer or any prose long
  enough to be one. Trailing prose is trimmed off the end for the same reason — the last thing
  said in a turn has no call after it, so it is the answer.

  **The header counts calls, never seconds.** A duration is a claim about effort blobot cannot
  make honestly across a permission wait, and the count is what a reader wants before deciding
  whether to open it. **And there are no ticks.** The pattern this borrows from puts a checkmark
  on every finished step; ticket 08 exists because a cancelled call reports `completed` with
  `exit: null`, so a tick beside one is that trap asserted louder and wrong. A line that finished
  cleanly says nothing — silence, which is not a success claim — and a line that did not says
  what happened.

  It takes `.route`'s chevron and mono label so the transcript has one disclosure gesture and
  not two, and leaves behind the dashed edge, which is the peer voice saying *refusable, lower
  authority* about somebody else's mail. This is the agent's own work in its own turn.

  A call carries a **verb** from the four kinds core already has off both runtimes — `read`,
  `edit`, `run`, and nothing for an MCP tool, whose name is its server's and not ours to
  paraphrase. It is a fixed column: a ragged left edge is what stops a stack of calls reading as
  a list, which is the whole value of the fold.

  **The title beside it is the target, and it is the same string whichever runtime is behind
  it.** Left to their own titles the two disagree twice over on identical work — Claude says
  `Edit notes.txt`, its verb plus a workspace-relative path, and OpenCode says
  `tmp/blobot-oc-kAIrDZ/notes.txt`, the absolute path with its leading slash gone. So the line
  said the same fact twice in two registers for one agent and gave a long machine path for the
  other. Both are settled on ACP's `locations`, which is the protocol's own field and carries no
  verb, shown relative to the AgentWorkspace: what differs between two agents on a team is the
  part of the path that says nothing about the work. A path outside the workspace keeps its
  `../`, which is worth seeing. A call about no path — every command — keeps its own title,
  because there is nothing else to say. Claude's verb is taken off what is left, in the adapter,
  the only place allowed to know that `Edit` and `Write` are its words.

  **Diff counts (`+74 −41`) are where saturated colour appears off a blobatar**, by the author,
  2026-08-30. Two small numbers whose sign already carries the meaning, so the hue reinforces a
  fact that is legible without it rather than being the channel for it. `--added` and `--removed`
  are deliberately low-chroma so a blobatar still wins the eye.
  **Amended the same day, by the author: more colour is allowed, at low chroma.** The rule that
  survives is not *one exception* but the two tests the exception passed — the hue must reinforce
  something already legible without it, and the chroma must be low enough that a blobatar still
  wins the eye. Both counts wear the pair wherever they appear, which now includes the composer
  tray's uncommitted `+412 −7`: it is the same object at a different altitude, and colouring one
  while greying the other reads as an inconsistency rather than as a rule. What has not changed:
  colour is never the only channel for anything, and a large area of it is a surface question
  rather than an accent — see `--composer`. A zero is drawn where it was measured, because `+12 −0` is a
  different edit from `+12 −8`; **absent is not zero** — a call that changed nothing, a diff too
  large to measure and a runtime that sends no diff block all draw nothing.

  **The kind is a glyph, and the header counts notes. Added 2026-08-31, at the author's
  direction, off a mockup.** A shape is differentiable at a glance in a way three lowercase
  words at 11.5px are not, and that is the whole job of the column. Three things make it a swap
  rather than the mockup's per-row label:

  - **The glyph took the verb's column and did not join it.** An icon beside the word it denotes
    is one fact in two channels in the narrowest place in the app, which is the argument that
    took the status word out from beside the dots. The word survives as the glyph's label, so
    nothing is lost to a reader not reading shapes.
  - **The column is still fixed**, at 16px. The mockup sized each row's label to its own text,
    which starts every target at a different x, and a ragged left edge is the entire reason the
    column exists.
  - **MCP gets no glyph and the slot stays empty.** It is the blank verb's own argument, harder:
    an MCP tool's name belongs to its server, and a shape is a paraphrase with even less room to
    hedge than a word. Empty reads as *blobot has no word for this*, which is true.

  Lucide at 13px and `--muted`, which is the icons rule and not an exception to it: `FileText`,
  `Pencil`, `SquareTerminal`.

  **And a shut block says what the run touched.** A footer of `selection.ts +5 −1
  Interactive.tsx +8 −0`, filenames and the counts summed per file, **each one a chip in
  `.md code`'s own vocabulary** — the hairline colour as a fill, no border, 5px corners, and not
  a shape invented for this. The transcript already pills a filename wherever an agent writes one
  in backticks, so a row of bare filenames under a paragraph full of chips read as the unfinished
  version of the same object. It is a set of discrete facts and not a column, which is why the
  chip is right here and stays wrong on the call lines inside the fold: those are rows that have
  to align, and a ground sized to each row's own text is the ragged edge again with a border
  around it. It answers the one question
  a reader has about a fold they are not going to open, which the call count never did. Three
  things it is careful about: it is drawn **shut only**, because opened the same numbers are on
  the calls that made them and beside *which* call that was, so drawing both is the same fact
  twice inside one block; it is the **filename**, not the workspace-relative path the call's own
  line carries, because shut is a glance and a column of shared prefixes puts the distinguishing
  word at the end of every entry — except where two touched files share a filename, when **both**
  keep their whole path, since the short form would otherwise be a lie about how many files
  there are; and **absent is still not zero**, so a file only ever touched by calls with no
  measured diff is not listed at all rather than listed as `+0 −0`.

  The header counts them too: `ran 6 tools · 6 notes`. The captions really are folded in here, so
  a reader deciding whether to open one should know there is prose behind the count. They are
  **notes and never messages** — a message in blobot is what an agent says to you or mails to a
  peer, and a block swallows neither. A failure takes that slot whenever there is one, because
  the caption count is trivia beside it.
- **A permission block is a transcript item, not a modal.** An agent that has been asked to run
  something dangerous stops until a human answers, and two agents can be stopped at once: a
  modal would serialise them into whichever arrived first. It stands where that tool's line
  would have stood, in the same gutter, wearing `.refusal`'s ink edge because it is the same
  kind of event — something stopped, and a person is the only way past it. **No button is
  armed**: `waiting` already spends the app's one inversion in the rail, and
  blobot has no opinion about whether the call should run, which is why it is asking. Three
  answers, **allow once**, **allow always** and **reject** (ticket 14 and its second
  amendment), and the tool line does not print `running` while nothing is running. The block
  says where an *always* goes, because a standing rule the user cannot find is the reason the
  answer was withheld in the first place: it is a line in that one agent's
  `.claude/settings.local.json`, and no other agent's.

  **Amended 2026-08-30: it is a card, and the prose is behind a disclosure.** The ink edge is
  gone entirely — it was `.refusal`'s on the argument that this is the same kind of event, and
  that held for a refusal, which is one sentence. This is four things — a claim, a literal of unbounded length, a reason,
  and three answers — and an edge runs down the side of four things without containing them, so
  the block read as loose transcript rather than as one object that has stopped. It is the
  composer's own ground, hairline and 14px radius, because every control descends from the
  composer and this is the one place in the transcript that *is* a control. It keeps its width
  to a measure, so a two-word command does not make a card the width of the window.

  Inside it, **the command is its own line**: run inline through the sentence, a real one wraps
  three times and the only thing on the block a person has to read becomes the hardest thing on
  it to find. It scrolls in its own track rather than wrapping, the rule a path already follows.
  And the four lines explaining what blobot vouches for and where an *always* is written are
  **behind the disclosure**, not on the face: they were identical on every request forever and
  were the largest thing on the block, which is read once and noise every time after. The rule
  above is kept — the block still says where an always goes, one click away, on the control that
  is about to write it. Nothing about the answers changed: still three, still none of them
  armed, still no colour.

  **The card and the Routine block are one grammar** (`.card`), because they are one kind of
  thing: something structural happened inside this turn and there is a control about it. They are
  told apart by what they say and by the fact that one of them is holding three answers, **not by
  an edge**. The ink edge was tried on the permission card for exactly that job and read as a
  highlight stuck to one side of an already closed shape; a hairline all the way around is the
  containment, and a second heavier edge on one side of it is decoration.
- **A session blobot replaced draws in the system voice, and it opens.** The one system line
  that is not just a line, because on a handoff it carries the note the agent wrote for itself,
  and that note is the whole argument for preferring a restart to an opaque `/compact`: a line
  that only said a session had been replaced would be asking the reader to take blobot's word for
  what survived. It borrows `.route`'s chevron and mono label so the transcript has one
  disclosure gesture and not three, and it leaves behind `.sysline`'s rules either side — a
  divider across the column that you can open reads as a section rather than as a line. It leaves
  behind the uppercase too, because the label is a sentence with numbers in it and not a caption.
  **Shut by default**, like the steps fold: this is a thing that happened, not a thing to read,
  until somebody asks why their agent stopped remembering yesterday. The path it was archived to
  sits *under* the note rather than in the line, because it is where the file went and not part
  of the sentence about what happened.

  **The words say what happened and never what to do.** `context compacted · 110k of 120k`,
  `fresh session · 110k of 120k estimated · the handoff is below`, `session kept · 110k of 120k ·
  the agent wrote no handoff, so the session was kept`. The pair of numbers is the activity
  column's own pair rather than a percentage, and `estimated` is drawn where nobody measured that
  model — restarting a session off a guess is a stronger claim than drawing that guess on a
  gauge, and the line must not conflate them. A refusal leads with what did *not* happen, because
  a reader scanning the column needs to know the agent is still carrying everything it was.
  Nothing here offers `/compact`; the gauge does not advise and neither does this.
- **An agent writing to its own Handbook draws in that same shape, and carries removal.** One
  collapsed system line, `mara · wrote down 3 things`, opening to the entries with their numbers
  and a `remove` beside each. It is `Compaction`'s gesture rather than a fourth one for the
  reason that comment gives, about this exactly: this is a thing that happened, not a thing to
  read, until the reader asks what their agent now believes. A **card** was rejected — several
  sentences of an agent's notes in the middle of a conversation every time it learns something
  is how the disclosure that makes agent-written entries safe becomes the noise that makes the
  conversation unreadable.

  **One line per call, not per entry**, because `record_entry` takes a list and the turn
  produced one act. The line **carries removal** on the same argument the permission card does:
  the whole justification for letting an agent write into its own persona is that you see it
  happen and can undo it *there*, and sending the reader to a panel to act turns a disclosure
  into a notification. It **stays after a removal**, saying what it said, with the entry marked
  gone: a transcript is a record of what happened and is never rewritten, which is why a Routine
  the user later disarmed still shows the turn that armed it.

  **Nothing marks the rail for it.** That mark is earned by origin, so a turn you started is not
  unread, and an entry written during a Routine run is already marked by the run. There is no
  *unreviewed* state on an entry to draw. A Handbook that is **full** is the exception that
  leaves the room: one plain system line, `mara · handbook is full, nothing was recorded`,
  because it is the one refusal in the app whose remedy belongs to somebody who is not in it.

  **blobot's own loopback tools draw no tool line.** `message_agent`, `propose_routine` and
  `record_entry` are each rendered as what they did — the peer enclosure, the Routine block, this
  one — so the raw mono call beside that says the same thing twice in the one register a reader
  can do nothing with.
- **The transcript follows its own height, not the item list.** Markdown lays out after it is
  handed its text, a code block is highlighted a frame later, and a fold opens by hundreds of
  pixels on a click — so the stick-to-bottom is a `ResizeObserver` on the column, and it lets go
  the moment the reader scrolls away from the bottom.

## Controls

Every control descends from the composer. If you are adding one, start there.

- **`.field`** — `--raised` ground, `--line` border, 12px radius, 9/14 padding. Focus moves the
  border to `--muted`. Inputs, textareas and the select trigger are all this.
- **`.btn`** — the same pill, fully rounded. `.btn.primary` inverts to ink **only when it is
  armed**, so the button answers "will this do anything?" before it is read. Disabled is 40%
  and `not-allowed`.
- **`.iconbtn`** — a 32px circle, muted at rest, ink on hover. For chrome: close, panel toggle.
- **`waiting` is a pill.** The one inversion on the page is still an inversion, and it is round
  like everything else that is filled here. *Corrected 2026-08-30: it shipped square-cornered,
  the only unrounded corner in the interface, and read as a sticker stuck onto the row.*
- **`.listrow`** — one row in a list of things: a runtime, an agent, a Routine. **Filled, not
  outlined**: `--raised` ground, 12px radius, 10/12 padding, no border. *Added 2026-08-30, and it
  reverses what every list here did first.* A transparent row inside a hairline that lifted to
  `--raised` on hover spends a border on saying *this is a row* — which a list of rows says by
  being a list — and leaves the resting state of a screen full of them as a grid of empty boxes.
  Filled at rest reads as one list of solid things, and it frees the hairline to mean what it
  means everywhere else here: a division between two kinds of thing. **Hover cannot be "lift
  it"**, because the row is already the lifted ground, so it is a hairline drawn *inside* the
  row — an outline, so nothing reflows — and only on rows that are pressable: a list you cannot
  click must not answer the pointer. **A picker row is `.listrow.pick`** — the same row, not a
  different control. A row whose job is chosen-or-not needs its unchosen state to be the quiet
  one, so it is outlined at rest and takes the filled ground only when it is on, and the line is
  an inset shadow rather than a border, so choosing one does not reflow it. *Amended 2026-08-31:
  picker rows were their own class, with their own radius, padding, gap and line spacing, so the
  same agent, with the same face and the same two lines, was a visibly different object on* your
  agents *than in the roster you pick it from. Only the difference that carries meaning survived
  the merge.*
- **Icon-only where the label would repeat the screen.** The composer's send is an arrow in
  Alice's pane, because the pane is already the recipient; in the team pane it carries the
  recipient's name beside the arrow, because there the recipient is a live question — and can
  be one the user never typed, since the team pane addresses the team's lead when nobody is
  named. Two names and a count past that (`Alice, Bob +1`): a message can address several
  agents, and a list that grows with the roster stops being readable at the width a send control
  has. Never a face — a blobatar on a button reads as the affordance rather than as an identity.
- **A disabled primary keeps its fill.** *2026-08-31, and it applies to every filled control,
  not only to send.* The composer's send is the page's one armed inversion, and unarmed it wore
  `--raised` inside a `--line` border — which is the secondary button's costume, so the control
  changed *kind* on the first keystroke and the field looked as though it had two different
  buttons at its end. A primary that is off is the same control turned down: keep the fill, step
  it down the ramp (a low mix of `--ink`), drop the border entirely, leave the glyph `--muted`.
  Never an outline, and never `opacity` low enough to stop it being a shape — that was the
  version before this one, and the arrow disappeared with it.
- **The composer's ends are `+` and send, and they are different kinds of thing.** Attaching is
  at the **head** of the pill and sending at the tail, because one adds to the message and the
  other sends it, and two round buttons sharing a corner made the second one read as a lesser
  send. It is a **plus**, not a paperclip: the glyph names the gesture — *add something to this
  message* — rather than the file type, while the label and the tooltip still say attach a file,
  which is all it does today.
- **The context ring stands where the paperclip was, and it is a reading, not a control.** How
  full the window this message is going into is, as a dial, next to send: the person about to
  paste a stack trace into an agent at 94% should not have to look at another column to learn
  that. Monochrome — `--ink` for what is used against `--line` for what is left — and nothing
  turns red, because a full window is something blobot handles by itself and not an alarm worth
  the one saturated thing on screen. It **advises nothing and refuses nothing**: it is never a
  reason send is disabled. It draws only for the resolved recipients, and only once they have
  reported, since a ring at 0% claims an empty window where the truth is an unknown one. On a
  fan-out it is the **fullest** recipient, and the panel names that agent and lists every
  other one, because a single ring over several agents is only honest if the number belongs to
  somebody. The panel **opens on hover** and holds **nothing but the rows** — a press is too much
  ceremony for a figure wanted in passing, and the three lines it shipped with, explaining where
  the handoff comes from and that nothing here is a limit, were the largest thing in it and true
  every time. It takes no focus when it opens, because the caret belongs to the field. The figures are the activity column's own, out of one shared `usage.ts`, so the two
  can never round differently.
- **The composer's draft outlives the pane it was typed in, and nobody decided that.** There is
  one `Composer` for the whole app, so words typed at Alice are still in the field after a switch
  to another team, addressed to a stranger. It is recorded here so it is not mistaken for a
  design: per-team drafts are the right answer and an open ticket.
- **A menu of several groups is one control, not several.** The agent form's *how it answers*
  is a single trigger over one menu holding a labelled group per axis (model, effort, and
  whatever else that runtime offers), because these are one decision about one agent and three
  stacked selects would read as three unrelated settings. The trigger says the resolved answer
  (`Opus (1M context) · Medium`), not the stored one, so a control nobody has touched still
  says what will happen. It borrows `.selectmenu` and `.selectitem` outright: a second menu
  that looked like a different menu would be claiming the two are different kinds of thing.
  What the group adds is a mono label, a hairline between groups, and a `default` badge on the
  choice that is what happens when blobot stores nothing.
- **A menu longer than a dozen rows grows a field.** A runtime is free to advertise forty
  models, and past about a dozen rows a menu stops being something you scan. The field sits at
  the top of that same menu, above a hairline, with the count beside it (`3 of 47` once a word
  has been typed), and it narrows every group at once: it matches the label and the value
  together, because `GPT-5.4` is what the menu says and `openai/gpt-5.4` is what the changelog
  said. A group the query empties disappears rather than standing as a heading over nothing.
  **Under the threshold there is no field**, and the query dies with the menu: this narrows what
  is already on screen, so it is not the second search bar the navigator's rule refuses. The
  menu opens on the row the agent is already set to, since on a list that long it is the first
  thing anyone looks for.
- **The groups are named by the runtime, never by us.** The component is handed
  `{id, label, choices}` and draws them in the order it got them. It has no list of provider
  words in it, which is what lets one runtime offer three groups and another one with no branch
  anywhere in the renderer.
- **A pick's sentence is on its menu row, not under the closed control.** *2026-08-31, and it
  reverses what the trust and compaction pickers shipped with.* One control explaining itself
  permanently is a helpful form; three of them in a row is blobot talking over the two words the
  user came to set, and the agent form now has three — how much it says, what it can do without
  asking, and starting over when it runs out of room. The text is unchanged and one keystroke
  away, on the row it describes, where it is read **while** choosing rather than after. The
  trigger keeps the word alone. This is only for a pick whose options are blobot's own closed
  vocabulary: the runtime picker keeps its readiness line, because that line is a fact about the
  machine rather than a gloss on a word, and it can change while the dialog is open.
- **A dialog is 560px unless it is holding a form.** `.modal.roomy` is 760, and only the hire and
  edit dialogs wear it. Eight fields stacked one per row ran past the fold on a 1080-tall screen,
  which put the standing instructions below the window on the dialog whose job is stating them.
  The width buys rows: name and role, then the runtime and what it advertises, then blobot's
  three words side by side. Everything else stays narrow, because a paragraph set to 760px is a
  paragraph nobody reads to the end of.
- Selection in a list is the raised ground alone. No left rule: a row that lifts and brightens
  is already saying it twice. The row is **inset and rounded** at `.field`'s 12px, like every
  other lifted surface here — a full-bleed square block is the one shape this app does not have,
  and it reads as a band across the rail rather than as the row being pointed at.
- **Hover is not the raised ground.** It was, and selection was too, so the two were one
  declaration twice over and a row you were pointing at looked like the row you were in. They
  answer different questions, so they differ in kind and not in degree: selection takes the
  ground, hover takes the row's muted second line to ink. Pick the line every row has — the one
  carrying the preview *or* the role — so a row nobody has spoken on still answers the pointer.

## Icons

**Lucide** (`lucide-react`), 13 to 17px, `--muted` at rest, `strokeWidth` default. No other icon
set, no inline SVG paths pasted into components, no emoji in the interface.

**One exception: a runtime's own mark**, in `RuntimeMark.tsx`, which is the only module allowed
to hold a vendor path. It is the team icon's rule applied a second time — a logo may be on
screen **greyed, never coloured, and never in place of the name**. A runtime is a product whose
face people already know, and `Claude Code` and `OpenCode` are two labels that begin the same
way in a list that is five long now; the mark is what the eye lands on before it reads either. The
label always stays beside it, so the mark is a second channel onto one fact and never the only
one. An id with no mark draws nothing: there is no placeholder, exactly as a team without an
icon is not a team missing one. Marks come from the vendor's own origin at one `currentColor`,
normalised to a 24-unit box so they weigh the same as each other and as a Lucide glyph.

## Primitives

**Radix for behaviour, never for looks.** `@radix-ui/react-dialog`, `@radix-ui/react-select` and
`@radix-ui/react-dropdown-menu` are in use. Take a primitive when you need the half nobody screenshots: a focus trap, focus
returned to the trigger, `aria-modal`, a listbox with arrow keys and type-ahead. Style every
pixel yourself from the tokens above.

**`cmdk` for the one thing Radix has no primitive for: a combobox.** The composer's `@mention`
menu, and the `/` palette that will be the same list, need a menu whose arrow keys move a
*virtual* cursor while focus stays in the text input. Every Radix menu moves real focus into the
menu instead, so there is nothing to take. cmdk is unstyled and its rule is the same as Radix's:
behaviour only. Do not use its `Command.Input` — it hardcodes `spellCheck={false}` and
`aria-expanded={true}` after spreading your props, and a message field is prose that is usually
not showing a menu. Keep the input, take the list.

The same division holds where a Radix menu has to be typed into: **Radix keeps the popover, cmdk
takes the list** (the runtime options menu, once it is long enough for a field). Focus has to be
moved into the field from `onOpenAutoFocus`, not later from an effect: these menus open inside a
dialog, and focus arriving after both layers have settled reads to the dialog's focus scope as
focus escaping, which shuts the menu.

**No shadcn, no Tailwind.** Considered and declined 2026-08-29: the design system already
exists, so shadcn's value would have been defaults we override to nothing, plus a build step.
If you want a component from it, take the Radix primitive underneath it instead.

## Motion

Motion is a real channel here, not decoration: it is what makes "two agents working at once"
legible from across the room. It is also the only thing that moves, so anything you add
competes with status.

**There are two budgets, and the sentence above is about the first one.**

**Ambient motion** runs on its own, forever, whether or not anybody is doing anything. It is
spoken for: it means status, and it lives on the blobatar. Adding a second ambient animation
anywhere is a design decision, and almost always the wrong one.

- Status animation on the blobatar is **one** loop, not six: a slow breathe for every state
  where something is happening, still for `idle`, grayscale and still for `failed`. Plus the
  face's own poses, which are a separate channel and stay (`thinking`'s two-dot eye loader,
  `sleepy` while starting, `surprised` while waiting).
- **A face can follow the pointer, and that is not ambient.** *2026-08-31.* The gaze layer is
  the one thing on a blobatar that moves because the user's hand moved, so it answers to the
  second budget and not the first: with a still pointer it is a still face, and the driver stands
  itself down under `prefers-reduced-motion` and on any pointer that is not a fine one. Three
  faces have it and nothing else does. The rail's `waiting` agent follows the cursor until you
  answer it, which is the same sentence `surprised` already says and the reason that state is the
  only one the fold reaches into. The 112px preview in the hire and edit dialogs follows it
  always, because there the face is the subject and nothing on the screen competes. The
  transcript's pending face turns toward the composer *while the user is in it*, and that gate is
  what keeps it out of the first budget — it acknowledges the person typing, and claims nothing
  about an agent noticing anything, which no runtime reports.
  **The excursion on the first two is deliberately above the status signal**, at 12 units against
  the `thinking` seesaw's 8.4, which is the reverse of the amplitude argument the idle layer is
  admitted on one bullet up. Both can be true because they are different budgets: the idle floor
  runs forever and must stay under the signal, and this runs only while a hand is moving. A gaze
  pitched under the signal is a channel nobody notices, which is the same as not having built it.
  A settled transcript message still does not gaze, or pose, or move at all.

- **Neither the blobatar nor the team's folder animates the state itself.** The dots do that.
  *Amended 2026-08-30: this listed six body animations and gave the folder the folded status as
  motion. Two things were wrong with it. `bob` travelled 3px and tilted 2.5 degrees every .9s,
  which reads as fidgeting rather than working, and folded onto a rail row it made a whole team
  hop, in a column whose job is quiet. And the distinction the six were bought for was never
  legible: `breathe` at scale(1.035) against `nod` at scaleY(.965) is sub-pixel at 34px, so
  nobody has ever told thinking from responding by looking at a face. The word already said
  which state. The folded status is still on the team row, in the same word and the same dots
  the agent rows use, so what the folder carried is not lost — only its motion is.*

**Interaction motion** runs once, because a person just did something, and is over before the
eye returns to the status column. It cannot compete with status, because it is not there when
status is being read. This is what the transitions in the stylesheet are, and the rules on them
are narrow:

- **Only in answer to something the user did.** A click, a press, a pointer crossing a row. If
  it can start on its own it belongs to the first budget, not this one.
- **Under 300ms, and usually far under.** 120ms for a hover reveal, 140 to 200ms for a press or
  an arrival, 260ms for the fold, which is the only thing here that travels far enough to earn
  it. Two curves, `--ease-out` and `--ease-in-out`. A third would be a decision nobody could
  state the reason for.
- **`transform` and `opacity` only**, and prefer the individual `scale` and `translate`
  properties: they compose with a `transform` a rule is already using for layout instead of
  overwriting it. The one `height` in the app is the opening roster below, and it is there
  because what has to move is everything *beneath* that box, which nothing but its height can
  move.
- **Nothing that carries meaning of its own.** It smooths a change the interface was making
  anyway. If a user has to see the animation to understand what happened, the animation is
  doing a job that belongs to a word.
- **Nothing on the paths that are walked all day.** Not the composer's `@mention` menu, not
  pane switching, not the rail's hover colour, not the activity feed. Frequency is the
  disqualifier, not taste: a hundred small delays a day is a slow app.
- **One exception, and it is the only one: a team opening.** The roster's box grows from
  nothing so the teams below slide out of the way instead of being shoved down between two
  frames, and each row fades in, staggered, which is what covers the overlap while that happens.
  Two moving parts, one gesture, one duration.
  *Amended 2026-08-30: there was a third, and it was the best thing here — the faces travelled
  out of the team's folder into their rows, which is the only thing the interface ever did that*
  said *the rows are the folder's contents rather than merely laying them out that way. It went
  with the folder. A mark is a project icon on the teams that have one, so the flight could only
  ever run on half of them, and a face travelling out of a favicon is not a sentence. Half a
  gesture that fires on some rows and not others is worse than none: the user would be learning
  which teams animate, which is not a fact about anything. The whole row fades now, face
  included; it used to be the text alone, because the face beside it was busy travelling.*
  The clause above used to name team switching too, and it was written when a team row was a
  static cluster of faces and switching was a pure data swap, where any motion would have been
  decoration on a frequent path. A row is a folder now, and the shut and open states are
  structurally different things: cargo in a container, or a list of rows. The travel is what
  makes them one object rather than two pictures. It is admitted on terms rather than by
  exemption — **under 250ms including the stagger, never gating a click, and cancellable
  mid-flight**, because A → B → C is an ordinary thing to do in a column of teams. And it obeys
  the rule below it: nothing is *learned* from it. The folder and the rows underneath already
  say what the roster is. Miss it, or ask for reduced motion, and you have lost nothing.
- **Nothing that moves what the user is reading.** The transcript, the feed and the turn pips
  are data, and data does not move for style. *The composer's context ring is the same rule and
  broke it for a day: its arc grew into place over 320ms, which is both a number animating for
  style and — since `usage_updated` arrives from a runtime while nobody is touching anything —
  ambient motion, the budget the blobatar has already spent. The arc snaps, like the pips beside
  it. Only its hover colour fades.*
- **Anything that can be pressed answers the press.** `scale:.97` over 160ms, which `.btn`,
  `.iconbtn` and the swatches have always done — and the composer's send, the one control this
  whole app is built around, did not until 2026-08-31. It is a **pointer** state, so the send
  never animates when it is sent with Enter, which is how it is actually used: keyboard paths
  take no motion, ever.
- **A panel that opens on a hover has to open.** Appearing between two frames under a pointer
  that merely crossed something reads as a glitch rather than as an answer. The house entrance,
  shortened to 140ms because a tooltip-sized thing is not a sheet, and **origin-aware**: it
  scales out of the control it belongs to, never out of its own middle (Radix hands over the
  corner in `--radix-popper-transform-origin` — the popper variable rather than the per-primitive
  alias, since one class here is worn by a Select's content and a Popover's both). A modal is the
  exception and stays centred, because it is anchored to nothing. **Every panel that opens off a
  control gets this** — the workspace popovers, the option menus, the context ring — with exactly
  one refusal: the composer's `@mention` list, which opens on a keystroke mid-sentence dozens of
  times a day, where frequency is the disqualifier.

Both budgets answer to the same withdrawal rule:

- **Everything decorative sits behind `prefers-reduced-motion`**, where the mono word and the
  three dots carry the state alone — the dots held still at .6 opacity rather than removed,
  because three marks that are *there* still say "not finished" without moving. No exceptions. Interaction motion is withdrawn rather than
  deleted: a cross-fade is not motion, so the opacity stays and everything that travels or grows
  goes. That block is **last in the stylesheet**, because it and the rules it overrides carry
  the same specificity and order is the only thing deciding them.

## Words

- **No em dashes** in anything a user reads: UI strings, placeholders, tooltips, demo lines,
  and the prompt text agents receive. A period, a comma, a colon, or the app's `·` separator.
  (Code comments and this file are not product copy.)
- **Never the word "authenticated".** Detection observes whether a credential is present, which
  is a different claim. The four honest states are `ready`, `needs sign-in`, `not installed`,
  `status unknown`. **This survives a sign-in blobot itself ran**: a login that exits cleanly is
  not a login that worked, so the screen that ran it closes on those same four words rather than
  saying *signed in*.
- **A refusal is not a dialog.** Say what is wrong where the user can act on it, in a sentence,
  with the fix in it. `.refusal` is an ink rule and a line of text.
- Terse where a line is shared: `32m`, `3h`, `yesterday`. `ago` is the word that gets the line
  truncated.
- Lowercase for button labels, sentence case for prose, uppercase only for mono labels.

## The stylesheet

One flat file, one flat namespace, no build step between it and the DOM.

- **Name classes for the thing they belong to, not for what they contain.** A `.preview` added
  for a modal silently restyled the rail's preview line and put a box around every agent's last
  message. It is `.hirepreview` now. A generic class name in a new screen is a live grenade.
- Rules carry the reason in a comment when the reason is not obvious from the rule. The
  stylesheet is where design decisions are enforced, so it is where they are explained.
- Delete dead rules in the same change that orphans them.

## Screens, and what each one is for

- **The rail** — every team, running or not, and the running team's agents under it. It is a
  list of agents under headings: **a team row is one small line**, a chevron in a gutter, a mark,
  the name, and at the right either the folded status or when the team was last active, one at a
  time because status outranks recency. An agent row is two lines — a blobatar, a name, the last
  thing that agent said, and when — and stands taller than the heading above it, which is what
  makes the nesting legible without a second frame around it. `idle` is not printed: it is the
  resting state of a quiet app. The role shows only until the agent has said something.
  *Amended 2026-08-30. The two rows were the same box down to the padding, on the grounds that a
  team row standing* taller *made the rail read as two lists stacked. Shorter does the opposite,
  and the rest of that paragraph went with the second line: the member count is the number of
  rows the team opens into, which is a worse way of saying what those rows say.*
- **The doors at the foot of the rail** — *Agents*, *Routines*, *Settings*, over one hairline,
  at the bottom of the column. *Added 2026-08-30, moving two of them.* They were mono rows above
  `TEAMS`: two headed rows over the list pushed the teams down and read as a second list stacked
  on the first, which is the failure the team row's height was cut to avoid. **The order an app
  is built out of is not the order its column is read in** — this column is about teams, so the
  teams start at the top of it. They are **not headings, so not mono**: a heading names what is
  under it and there is nothing under these. They are rows you press, drawn like `Search` at the
  other end of the column, which is the only other thing here that is a door rather than a list
  item, and each is named for what is behind it.
  **`Settings` is a third door and not a lid over the other two.** An AgentProfile is the roster
  and a Routine is standing work that can put an unread mark on a row in this very column;
  neither is a preference. The test is that mark: nothing behind a settings door should be able
  to put one on the rail.
- **The open team's group carries no rule under it.** *Amended 2026-08-30.* There was a hairline
  closing the roster off from the teams below. The gap was already doing that work — the group
  is the only thing in the column with rows nested under it, so its extent is legible from the
  nesting alone — and a line under it made the roster read as a panel dropped into the list
  rather than as part of it. The rail's one hairline is at the foot, over the doors, which is
  the only place in this column where what is below is not more of what is above.
- **The chevron is an indicator, not a control.** A team row was already a disclosure and
  nothing on screen said so. It does not toggle, and the row stays one click target: exactly one
  team is open, because the open team is the one whose sessions are on screen, and a twisty the
  user could press to collapse the team they are reading would have to invent an *open but
  collapsed* state. A team with nobody on it keeps the gutter and loses the glyph — the slot is
  what puts every mark on one left edge, the glyph is a promise of rows underneath. **The roster
  is not indented under it.** An indent the width of the gutter was tried, on the arithmetic that
  the mark had moved right so the faces should move with it: it made the roster read as a nested
  sub-list rather than as the rail's own contents, which is backwards, because an agent row is the
  substance of this column and a team row is a label on it. The chevron column carries the nesting
  and does not need help. What the roster gets instead is air: it is set down off its heading,
  because a heading needs room under it more than a row needs room above it. Shut team rows carry
  the same gap between one another, or a column of one-line rows runs together into the block of
  text the short row was made to avoid.
- **A team's mark is its project icon, and its members' faces only where there is no icon.**
  *Amended 2026-08-30, reversing the rule below it.* It was a drawn folder — a back panel, a
  front panel, three faces cropped by the front, a `+N` on the panel, and the icon straddling
  the panel's bottom edge. Six paths and two questions answered in one 34px box, repeated down a
  column whose whole job is to be quiet. **The container was the noise**, and the two answers
  stacked in one slot were what made the container necessary. So the slot answers one question,
  and the icon wins it: a column of similarly-named teams is exactly what the rail is worst at,
  and faces cannot help there, because the same agents are on several teams — ADR-0001's whole
  point — so two teams sharing a roster draw an identical stack. A project icon is unique to the
  project by construction. What is given up is said plainly: on a team with an icon the rail no
  longer says who is on it, and that is answered one click away by the rows the team opens into.
  The icon is greyed, which is unchanged and is the design decision rather than a taste: the
  blobatars are the only saturated thing on screen. Faces are the fallback and not a lesser
  state — up to three, overlapping, cut out of each other, filling the box rather than fitted
  inside a folder, and past three the last slot is a `+N` rather than a face, because a bare
  stack has no panel to write a count on. A team without an icon is not a team missing one and
  there is no placeholder in either direction, which was true before and stays true.
  **The icon is inset and rounded, because half of the artwork brings its own plate.** *Added
  2026-08-31.* It filled the slot edge to edge, which is right for a transparent logo and wrong
  for an opaque square PNG: the other state is two 11px faces floating in a 20px box, so a
  filled square covering the whole box is around four times the ink and the only hard corner in
  a column of round things, and the rail read as two kinds of object rather than as one mark
  drawn two ways. The answer is **not a container under the faces** — the folder above was
  removed on purpose and that argument is untouched — it is that the icon stops claiming a
  footprint the faces never take: 10% of the slot on every side, and 30% of what is left as the
  round. Fractions rather than pixels, because the mark is 20px on the rail and larger in the
  navigator and the icon picker, and it is the relationship that has to survive the size.
  Transparent artwork barely moves, since `contain` was already letterboxing it well inside the
  box.
- **The lead is named on the lead's own row, as `LEAD`.** *Amended 2026-08-30.* It was `led by
  Alice` under the team's name, and the reason was that leading is a fact about *the team* and
  not about the agent: the same agent leads one team and not another, which is why it cannot
  live on an agent's definition either. **That reason survives the move**, because the roster is
  visibly nested under its team now: a row inside the section is already scoped to this team, so
  the word reads as *leads here* rather than as a rank the agent carries around. It is still
  named rather than drawn — a face appears where you are identifying among agents or choosing
  one, and this is a single agent being mentioned — and it is a mono label like every other one
  on these rows, never a chip.
- **A team keeps its place in the rail when you open it.** The column's order is the store's, and
  it does not depend on what you last clicked: a user reaching for the team they were on a minute
  ago must find it where they left it. With a dozen teams that place can be below the fold, and
  the group is **scrolled into view** when the team changes — never pinned there. Pinning it was
  tried and rejected: **nothing in this column covers anything else in it.** A group stuck to the
  edge of the scrollport floats over the teams above and below, and the rail is one list, so the
  overlap reads as the open team sitting on top of the others rather than among them. The running team is drawn from the conversation rather
  than from its summary row, and that substitution happens **in place**. Editing and
  deleting a team live on the team's own row as icon buttons, revealed on hover **and on
  `:focus-within`** — hover-only would put both out of reach of the keyboard — because a delete
  button sitting on every row at rest would be the loudest thing in a column whose job is quiet.
- **The transcript** — the three voices above, in a centred column, under **one mono hairline
  row** carrying only what the rail does not: the agent's role, its runtime and where it is
  working, and on the team pane the folder every agent is cut from. **It is the only chrome above
  the working surface.** A strip used to run across the top of the window saying the team's name
  and its path; the name was what the selected rail row was already saying, so it went, and the
  controls it held — the DEMO badge, the turn pips, the activity toggle — sit at the end of this
  row instead. There is no application menubar either: every command blobot has is on the surface
  it belongs to. No face, no bold name, no status word, and no posture line up there — a sentence
  printed over every pane all day is not read, and the creation flow's disclosure is where the
  posture is said. The selected rail row is a few
  pixels to the left already saying all three, larger, so a header that repeated them was a
  second and weaker copy of the rail outranking the rail.
- **A turn a clock started draws in the user's voice, under a `system` line.** The prompt is the
  user's words — they authored them and nobody else said them — so the bubble is solid, filled
  and right-aligned like any other. What it gets wrong is *when*, and `routine · nightly
  typecheck` above it is the whole of the disclosure. **No fourth voice**: the three exist
  because three was hard enough, and dashed against solid is the trick that must not be softened
  by a third texture competing with it. The instrument already existed — a `system` line is not a
  voice, and it was invented to carry exactly this kind of fact beside `turn stopped · the
  context window is full`.
- **A Routine run nobody has looked at draws the rail's own preview line at full ink**, and that
  is the entire treatment. **Not an inversion** — `waiting` owns the app's one inversion and it
  is how a backgrounded team blocked on a permission reaches the user, so this must lose to it,
  which weight against quiet does, legibly, with both in the column at once. Not a dot and not a
  count: a dot is a new element in a column whose job is to be quiet, and two unread reports and
  five are the same decision. It folds onto the team row the way `StatusWord` folds, so a team
  the user is not on can carry it, and **it is earned by origin, never by a turn the user
  started** — an agent finishing work you asked for is not unread, it is finished, and marking
  that would put a mark on almost every row within a day. Opening that agent's pane clears it,
  and nothing else does.
- **The activity column** — the log. Tool calls and finished turns. Hideable from the chrome,
  remembered. Never auto-collapses: it would reappear on the first tool call and shove the
  conversation sideways mid-turn. At its head, `CONTEXT`: a row per agent with its face, its
  name, `used/size`, and the percent. *Amended 2026-08-30: the percent is of blobot's own
  **working ceiling**, not of the advertised window, and the ceiling is named beside it (`37k/1m
  · 12% · of 300k`).* The window a runtime reports answers when the turn hard-stops; it is the
  wrong denominator for the question a reader is actually asking, and dividing by it drew `3%`
  for an agent 300k into a million. Both raw numbers stay, because they are what the runtime
  said and two agents on one team can be running windows five times apart. Past the ceiling the
  row says `past 300k` in words: a percentage over a hundred is not a fact about anything.
  Monochrome, no bar, no colour, and **it does not advise** — a ceiling is a fact about the
  model sitting next to a fact about the agent, never a suggestion to compact.
  *Amended 2026-08-30: the column's head — the `ACTIVITY` label, `CONTEXT` and `WORKSPACE` — is
  **pinned**, and the log scrolls under it.* Both blocks are one row per agent, so on a four-agent
  team the log started below the fold, and reading it scrolled away the one figure on this column
  a person watches *while* something is happening. **This is not the pinned rail group the column
  above rejects.** That rejection is about a group of peers in one list: a team stuck to the edge
  of the scrollport floats over the teams above and below it, and the rail is one list, so the
  overlap reads as rank. This head is not a peer of the log — it is two labelled blocks that were
  already above it, with a rule between, and it stays chrome by drawing as chrome: opaque on
  `--recessed`, no radius, no shadow, no translucency, nothing that reads as a card. It carries
  its own ceiling and scrolls inside itself past it, because a six-agent roster with a `sent`
  panel open would otherwise pin the whole column and leave the log no room.
  *Added 2026-08-31:* a row opens to **what blobot put in there**, and a **Handbook is part of
  the persona rather than a fourth thing blobot injects**, so it draws as a sub-row under
  `persona` — `handbook`, then `your standing instructions`, in the order the persona composes
  them. The persona row is the total and the two sub-rows are the two parts of it the user owns
  and can change; the pair placed adjacent in the persona is drawn adjacent here, one
  relationship stated in two places and contradicted in neither. **No possessive and no count**:
  *your* is load-bearing on the row below, where the words really are the user's, and a Handbook
  is partly the agent's, so the same word would be a small lie in a column whose whole job is
  being accurate about cost. The count lives in the panel, where a person can act on it. Hidden
  when the Handbook is empty, like both its neighbours — the notice card above the composer is
  where an unbriefed agent is named, unmissably, and two surfaces saying it is one too many.
  **It never warns as it fills, and not for the ring's reason.** The ring stays quiet because
  blobot *will* act: a full window is what the session boundary is for. This row stays quiet
  because blobot will **not** — the remedy is a person removing an entry, and the number they
  act on stands in the panel beside the entries they would remove. Two rows in one block, quiet
  for opposite reasons, both right.
- **A Handbook, under the composer, in the agent's pane only.** What an Agent knows about *this
  team's* work, held at `<team>/<agent>`. Two shapes, and which one you get is a fact about the
  agent rather than a preference; they are **never both present**.
  **Unbriefed: a notice card above the composer**, taking the composer's width exactly with no
  inset of its own, because it is the composer's own notice and any margin would say it is a
  separate thing on the page. `Mara has not been briefed`, a muted line under it, and *brief them*
  pushed right. It is **`.openerror`'s shape**, which the app already owned: `--raised` ground, a
  `--line` hairline, a 12px radius, the control at `margin-left:auto`, and no ink edge under the
  ban on an ink edge on a closed shape. Two shapes invented for this both lost to it. **No icon**:
  every icon at rest is `--muted`, so a muted glyph in that slot would have to mean something, and
  not yet briefed is the ordinary condition of a new hire rather than a kind of thing. It
  **persists** while the Handbook is empty, because it states a fact rather than announcing an
  event, and there is **no dismiss** — that would invent *unbriefed and hidden*, a third state
  nothing could then draw. Its control is the quiet button, not the loud one: the loud one grants
  authority, and the whole charting decision was that ignoring this should cost nothing.
  **Briefed: a door on the tray, and a dialog behind it.** The tray's rule is that everything on
  it is a live number or a door and nothing on it is a description, so a Handbook, which is prose,
  cannot sit on it and the only thing that can is `handbook · 4`. *Amended 2026-08-31: what the
  door opens is `.modal`, not a panel under the composer.* It was a panel, drawn against a
  four-entry mock; the first real Handbook was two entries and **774 characters** taking two
  thirds of the pane, against a bound of 8,000. A body with no ceiling cannot live in the
  composer's footing, which is a strip of chrome under a field, and the dialog brings the height
  cap and the internal scroll with it. **A dialog and not a screen over the surface**, which is
  where *your agents* went: that is a **place**, reached from the rail, about every AgentProfile
  the user has, and this is one agent's Handbook reached from that agent's own tray, where what
  you do changes what the agent believes at the team's next start. Not `.roomy` either: entries
  are paragraphs, and a paragraph set to 760px is a paragraph nobody reads to the end of.
  Entries are `.listrow`'s filled rows on `--raised`, each **folded to its first line**,
  then `author · age` in mono, then removal on hover **and on focus** — a control only a pointer
  can find is one a keyboard cannot reach. The fold is `.route`'s chevron, by the rule the
  transcript wrote for it: *a chevron promises the thing is already here and folded*, true here
  and false of `load earlier`. What folds is the **tail** and never the row, so the list still
  reads as a list of somethings; rows open independently, because the reason to open two is to
  compare them; and the whole text is in the DOM either way, since the fold is the stylesheet
  clamping it rather than the component withholding it. **Open, the entry takes the whole row and
  `author · age` drops under it as a byline**: 22 characters of mono beside a paragraph was
  deciding the measure that paragraph is read at, and metadata's width must never set the width of
  the thing it is about. One real entry is a paragraph of ids and
  campaign names, and three of those are a wall wherever you put them: the dialog fixed the
  container, this fixes the row. **Removal only, never editing**: an entry you edited is
  neither yours nor the agent's, and the author field exists precisely so the app can tell those
  apart. **`add one` is not a text field** — it hands the composer the words and the agent records
  what you say next, which is what keeps `record_entry` the single path into a Handbook and
  therefore keeps the transcript disclosure complete. On the foot, `1,240 of 8,000 characters`,
  which is **not** a duplicate of the gauge's handbook row: the gauge answers what blobot is
  spending on this turn, and this answers how much room is left in the thing being edited,
  standing beside the entries a person would remove. And one sentence saying a change takes at the
  team's next start, because ADR-0002's rule applies unchanged and without it a user removes an
  entry and watches the agent go on believing it.
  **In the team pane it is a figure and never a body.** `WORKSPACE` is drawn twice and becomes a
  block in the activity column there, because one branch name would be false about the other
  members. A Handbook has the same problem and takes the opposite answer: four Handbooks do not
  fold into one the way four statuses fold into a `StatusWord`, and four agents' entries in a
  232px column is a wall. The team pane says what a Handbook **costs**; the agent's pane is the
  only place it says what a Handbook **is**.
- **The creation flow** — the one *editorial* page. It ends with ticket 14's disclosure: an
  unnumbered block with an ink edge, above the button that spawns the first agent. Stated, never
  consented to, and it may only claim what blobot actually arranged. It says the runtimes are
  set to prompt; it does not name commands, because blobot can only name them on some runtimes. A display line in the hand face, a
  standfirst, numbered steps. It is read once, start to finish, before anything exists, which is
  a different job from every other surface. Do not spread this treatment; it works because it is
  the only one. **The name is step 01 and the folder is step 02**, because the folder step now
  has a second door — *make one for me*, which puts a git repository with one empty commit under
  `~/blobot` and names it after the team, so the team has to be named before that door is open.
  The picker still fills the name in when it is empty, so nothing is lost by the swap. **No
  strip across the top of it either** — it said the product's own name and counted the teams,
  neither of which the reader can act on here, and it put a second left-aligned anchor above a
  page that is set centred. A user
  who has never seen this app should not have to go and find a repository before they can watch
  two agents talk.
  **A step you have answered folds to its answer** — `01 · checkout`, `02 · ~/code/checkout ·
  git · clean` — and comes back on a click. *Added 2026-08-31, and it is not a wizard:* the page
  is still read start to finish, and the numeral and the title of every step stay on screen, so
  what is being asked is never hidden. What folds is the **tail** of a step behind you, which on
  the folder step is a repository list, a git note and an icon control that together dwarfed the
  three questions around it. A step folds when the step **below** it has been answered, which is
  the only signal here that means *moved on* — validity alone would fold the name field on the
  first keystroke — and one the user opens by hand stays open, because a step that re-folds
  itself while you are reading it is worse than one that never folded. The gesture is the
  transcript's chevron, at the **end** of the head rather than in front of it, so the numerals of
  the steps that fold stay in line with the ones that do not.
- **Your agents** — every AgentProfile the user has hired, over the working surface rather than
  in place of it: the team behind it keeps running, and nothing on this screen restarts one. A
  row is a face, a name, a role, the runtime and the teams it is on, with its standing
  instructions under them clamped to two lines. Clicking a row edits the definition; retiring is
  an icon revealed on hover and `:focus-within`, the rail's rule for the same reason. It is a
  **working** surface and takes none of the creation flow's editorial treatment: no hand face, no
  standfirst, no numerals. Reached from a door at the **foot** of the rail. *Amended 2026-08-30:
  it was a row above TEAMS, on the grounds that an agent exists before a team and that is the
  order the model reads in. True of the model, wrong on screen — see* **The doors at the foot of
  the rail** *below.*
- **Routines** — everything that runs on a clock, over the working surface, in the register of
  *your agents* and reached from the second door at the foot of the rail. A row is the Routine's name, the
  schedule **in words**, the blobatar and name of the agent it belongs to, the team, and when it
  next runs, with the prompt under them clamped to two lines the way standing instructions are.
  **Sorted by last run, most recent first**, which is *what happened while I was away* answered
  without a digest screen: the things that ran overnight are at the top in the morning, already,
  and a sort is cheaper than a surface and cannot go stale.
  **Arming is a control on the row and the loudest thing on the screen**, because it is the only
  thing on it that grants authority. Disarmed is the resting state and reads as one: the name
  goes muted and the next-run line says `not running`, because a Routine that does not fire has
  no next run and printing one would promise a firing that is not coming. `Run now` is beside it
  on every row and is not a debug affordance — blobot never catches up on launch, so it is the
  whole of the remedy for a laptop that was shut, and `missed 4 firings` sits where the next-run
  line would be, **plain and not an error**: a shut laptop is the ordinary condition. Editing and
  deleting are icon buttons revealed on hover and `:focus-within`, the rail's rule for the rail's
  reason.
  **A Routine an agent scheduled for itself is not one the user wrote, and must not draw like
  one.** It is armed when it is made, so it is not waiting for permission — what is still true is
  that **a person has not looked at it**. So it sits **above** the list rather than sorted into
  it, says which agent scheduled it and that it has been running since, shows **a peek** of its
  prompt with the rest one press away, and carries exactly two verbs, `keep` and `disarm`. Both
  are answers, and there is still no third that quietly leaves it unanswered. What says *you
  have not seen this* is that placement and that line, **never** *this is waiting for you*: it
  has been running the whole time it has been sitting there, and a mark that implied otherwise
  would be the screen lying about what has already happened. *Amended 2026-08-31 twice.* The ink
  edge is gone under the ban above — it was a highlight stuck to the side of a filled block. And
  the prompt is clamped, reversing *in full*: a real one is thirty lines, and a block that asks a
  question must hold its two answers on the same screen as the words being answered.
- **Settings** — the machine, and what blobot can do about it. Over the working surface like the
  two doors beside it, and with a **column of its own**: a list of sections on the left, one of
  them current, and the section's screen in the space it leaves. That column is deliberately not
  the rail — same width, same header, and nothing else. No marks, no faces, no status; a second
  column that drew like the first would read as the rail having changed its mind about what it
  lists. The sheet is set against the left of what is left of the window rather than centred in
  it, because centring content in the remainder of a window puts it nowhere in particular.
  **One section: Runtimes.** Ticket 11's four states, one row each, with the version and the
  detail beside them and at most one remedy button — *sign in* or *install it*, the runtime's own
  command on a real terminal. It gates nothing, and the screen says in its own words what the
  states were measured with and that blobot stores no credential. This is the first place
  detection has ever had of its own: it was reachable only from inside the hire dialog, so *is
  Codex signed in?* was answered behind a decision about an agent the user had not decided to
  hire. A sidebar with one true item is more honest than four invented ones.
  **A second section: Context.** One row per model, carrying the *working ceiling* — where that
  model stops being worth more context, which is the mark on the gauge and the number compaction
  measures against, never the window a runtime reports. A row says the figure, the moment it
  produces (`handoff at 240,000`), where the figure came from, and which agents are on that
  model; a model nobody has established anything for draws **the rule and not a number**, because
  the fallback is a fraction of a window nobody is reporting for a session that does not exist.
  The number is **editable**, and that is the point of the section rather than a convenience:
  blobot ships a table of what it has been told, the table ages on somebody else's release
  cadence, and the person who can watch a model go vague is the one sitting in front of it.
  *unset* appears only on a row the user set, since offering to undo blobot's own number is
  offering to undo something they never did. It **reaches teams that are already running** and
  says so, unlike the model or the trust level: those are handed over when a session is opened,
  and this is a threshold compared against after every turn. Sections are added here when there
  is something true to configure, never to fill the column out.
- **An agent that schedules itself opens a block in the transcript, in the turn that did it.**
  This is the price of letting an agent arm anything, and it is not optional: an agent arming
  something off screen is the version of that feature which must not exist. It borrows the
  permission block's grammar — something structural happened inside this turn, and there is one
  control about it — but takes the **system voice's quiet**, because it is not a question. It
  says who, what, the shape and what the shape costs, and carries `disarm` and nothing else.
  There is no `keep` on it: keeping it is what happens if you do nothing, and a button for the
  status quo would read as the agent asking permission. It was not asking. Once answered the
  block **stays and says `disarmed`** rather than vanishing — the transcript is a record of what
  happened here, and a block that disappeared would take the fact that an agent scheduled
  anything with it. blobot still never interrupts: no notification, no badge, no sound.
  **The schedule is three shapes and a time, never an expression**, and the word `cron` appears
  nowhere: the runaway case is not bounded, it is not offered. Where the shape is chosen it says
  **what the shape costs, as a count of firings** (`every day at 09:00 · 1 firing a day`) — a
  count and never a price, in the register the context gauge already uses, because an hourly
  Routine spends twenty-four times what a daily one does against the same per-run ceiling and a
  person choosing between them was making that decision with neither number on screen.
  One line at the head, and it is the only place the limitation is stated: *blobot runs these
  while it is open. It does not run them in the background.*
- **The navigator** — find a team or an agent by name, on `ctrl+k` / `cmd+k`, and from a
  **Search row at the top of the rail** wearing that shortcut. The row is a *button drawn as a
  field*, never a second input: there is one search in this app and it lives in the navigator, so
  a field here would either duplicate it or drift from it. It is not gated on having several
  teams — a door that appears once you have eight of them is a door nobody finds. A layer over
  everything, including *your agents*, because it is how you leave whatever layer you are on: it
  opens on a key, answers, and goes. **Not a search bar in the chrome** — a field standing above
  the working surface all day is paid for on every screen and used on few of them, and the strip
  it would go in was removed for being a second copy of the rail. The rail stays the place you
  *scan*; this is the place you *ask*, which is what scanning stops being able to answer at eight
  or nine rows. It lists agents (the open team's first, the rest carrying their team's name,
  since the same person on two teams is two agents), then teams, then the two places. **Names
  only.** It does not search what agents said: that needs an addressable message and somewhere to
  scroll to, and returning message hits without them would be promising a feature that does not
  exist.
- **Signing in to a runtime, and installing one** — a modal over the runtime picker that **is**
  a terminal. It is here because the four honest states above had no door out of them: the
  picker said *not installed* and the reader went to find the vendor's documentation. blobot
  runs **the runtime's own `auth login`**, or **the vendor's own published install command**, and
  watches.
  **The dialog has no header.** It had one, and an eyebrow, a title in the hand face, the command
  and a line of prose, all above a program that opens by announcing itself: `┌ Add credential`,
  then what it wants. That was blobot talking over something already speaking. The title survives
  for a screen reader only. What is left is the terminal, a `--raised` box at `.field`'s radius
  with no border of its own, fixed in height so it cannot reflow under the hands of somebody
  typing into it, monochrome by the rule above, and one labelled button.
  The exception is the **install confirm**, which still quotes the command in mono above the
  note: it is the sentence being agreed to, and it is the one thing the terminal cannot say for
  itself, because it has not run yet. Signing in has no confirm, since one of these puts software
  on the machine and the other starts a program already on it.
  A URL the program prints is **clickable** and opens in the user's own browser (`http` and
  `https` only, checked in the main process, because that text came out of another program's
  stdout). Selection is xterm's own and **`ctrl+shift+c` copies it**, never `ctrl+c`: in a
  terminal that is how you interrupt what is running, and taking it would be taking a key away
  from the program. **Escape and a click outside belong to the terminal** while a command is
  running, for the same reason; the way out is a button that says `stop and close`. None of
  it is a gate: the runtime stays pickable while it says *not installed*, which is ticket 11's
  rule and the reason this is a button beside a sentence rather than a block in front of one.
- **The tray under an agent's composer** — what is uncommitted here, and where it goes. Tucked
  under the field and half-hidden behind it, because it is not another thing on the page: it is
  the field's own footing. **Everything on it is a live number or a door, and nothing on it is a
  description.** That rule is what decided its contents: `checkout` was a constant under an
  agent's own composer, and `3 changed` counted touched files, which says nothing about whether
  there is an afternoon in them. Both still exist in the team pane's `WORKSPACE` block, where
  they vary from member to member and are worth comparing.
  Two slots, and they are two stages of the same work. **Left is what is in the folder**: `+412
  −7` against `HEAD`, and the commit that would take it. **Right is where it goes**: the pull
  request or the offer to open one, and the branch. The branch is a **control** — a menu of every
  branch this worktree could be on, and a field that both narrows the list and names a new one.
  **A branch another worktree holds is drawn and refused, never hidden**: git will not check one
  branch out twice, and an absent row is a branch the user can see in their own terminal and not
  here. **The holder is drawn, not described** — a teammate's own face at the end of the row,
  which is what blobatars are for, since this is a list of names where the reader is looking for
  a person and `Bob has it` was a sentence doing a face's job at three times the width. It
  carries that agent's stored hue: a face derived from the name would be a second Bob. The two
  holders that are not agents get their own marks and never a face — the folder the user opened,
  and a worktree nobody here made, which keeps its last path segment. The sentence survives on
  the row's `title`, because a face is an identity and not an explanation of why the row is
  refused; the row's own dimming is what says that, and the face keeps its colour inside it,
  since a desaturated blobatar is a different agent.
  **Nothing in the tray is boxed.** A row of bordered pills a few pixels under the composer's own
  border reads as controls inside a control, so each one is type with a hover ground under it,
  and a chevron where there is a menu. The `+` and `−` are **not coloured**: green and red would
  be two saturated things on screen that are not blobatars, and the signs already say which
  direction each number goes. The commit **refuses while the agent is working** and stays on
  screen saying so, because a control that vanishes while an agent happens to be thinking reads
  as a bug, and a commit taken mid-turn captures a file that is halfway written.
  **Nothing in the tray is boxed, and what it lifts to is round.** The hover and open ground
  under `commit`, the pull request and the branch is a *filled* shape, and every filled shape
  here is round — `.btn`, the composer's send, the `waiting` pill. It shipped at 7px, a fourth
  radius nothing else in the app uses, which read as a square patch behind the word rather than
  as a control the row had always contained. *Rounded 2026-08-31.*

  **The popovers that hang off it are one column with a gap in it**, and their parts are ranked.
  *Redrawn 2026-08-31, after the commit one shipped as three children stacked with no space
  between them, so the field's border met the plan's border and the panel read as a single badly
  drawn box.* The **numbers are at the head** — `+51 −37` against a file count — because the
  figure the user is deciding on belongs beside the field, not inside the width of a button:
  `commit 1 file` was a live number setting the size of a control, and the button is one word at
  every count now. The **field is the largest thing in the panel**, since it is the thing the
  popover exists for. The **commands are quoted, not boxed**: `--recessed` ground, no border of
  their own, one line each behind a `$` in the gutter, which says *this came out of a shell*
  where a second hairline only said *this is another box*. **Enter is the commit**, because
  nothing else in there takes a keystroke, and the row of buttons carries the words that say so.

- **Modals** — for things that outlive the screen that opened them. Hiring an agent is a modal
  because the agent exists afterwards whether or not the team is created. A step of a flow is
  not a modal.

## Preferences

Anything that is a preference about a screen (a rail width, a hidden column) goes in
`localStorage`. Anything that is a fact about an agent or a team (its name, its colour) goes in
SQLite. The test is whether it has to follow the agent to another team, or another machine.
