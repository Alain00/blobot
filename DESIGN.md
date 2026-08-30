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
| `--ground` | `#0a0a0b` | The page. |
| `--raised` | `#131315` | Anything lifted off it: a bubble, a field, a selected row, a menu. |
| `--ink` | `#fafaf8` | Text, and the one emphasis worth spending. |
| `--muted` | `#8a8a93` | Secondary text, every mono label, every icon at rest. |
| `--line` | `#232327` | Every hairline and every border at rest. |
| `--sans` | Geist | Everything a user reads as prose. |
| `--mono` | Geist Mono | Anything literal: a path, a branch, a status word, a label, a time. |
| `--hand` | Caveat | Display type on the creation flow. Nowhere else. |

Dark only (`color-scheme:dark`). There is no light theme and adding one is a design project,
not a variable swap: half these rules are about what is *brightest* on the page.

## Type

- Body is 14px/1.5 sans. Prose gets sans; anything literal gets mono at 10 to 12px, usually
  `--muted`, usually uppercase with letter-spacing when it is a label.
- **Mono is a signal, not a texture.** It says "this is a value, not a sentence". A mono
  paragraph is a bug.
- The hand face carries the creation flow's display line only. One voice per page: handwriting
  on every subhead would make the steps look optional.

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

  **Diff counts beside an edit (`+74 −41`) are the one place saturated colour appears off a
  blobatar**, by the author, 2026-08-30. Two small numbers whose sign already carries the
  meaning, so the hue reinforces a fact that is legible without it rather than being the channel
  for it. `--added` and `--removed` are the only tokens in the stylesheet that name a colour
  instead of a role, they are deliberately low-chroma so a blobatar still wins the eye, and
  nothing else may use them. A zero is drawn where it was measured, because `+12 −0` is a
  different edit from `+12 −8`; **absent is not zero** — a call that changed nothing, a diff too
  large to measure and a runtime that sends no diff block all draw nothing.
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
- **Icon-only where the label would repeat the screen.** The composer's send is an arrow in
  Alice's pane, because the pane is already the recipient; in the team pane it carries the
  recipient's name beside the arrow, because there the recipient is a live question — and can
  be one the user never typed, since the team pane addresses the team's lead when nobody is
  named. Two names and a count past that (`Alice, Bob +1`): a message can address several
  agents, and a list that grows with the roster stops being readable at the width a send control
  has. Never a face — a blobatar on a button reads as the affordance rather than as an identity.
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
way in a list that grows to four; the mark is what the eye lands on before it reads either. The
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
  frames; each row's text fades in, which is what covers the overlap while that happens; and the
  faces travel out of the folder into their rows. Three moving parts, one gesture, one duration.
  **A face that was peeking does not fade in and a face the folder only counted does** — the
  travel reads as travel only if the face is continuous with the one that was there a frame ago,
  and past the third there was no face to be continuous with.
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
  are data, and data does not move for style.

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

- **The rail** — every team, running or not, and the running team's agents under it. A team row
  is a **folder**: monochrome, drawn inset rather than to the edges of its box, with up to three
  of its members peeking over the front and a `+N` on the panel for the rest. The faces are
  **cropped by the front panel and sized to the folder, not to the box** — a face that hangs past
  the folder's sides reads as standing beside a container rather than in one. They may be small,
  which a blobatar elsewhere may not: the ~26px floor is a floor on *motion*, and a peeking face
  does not move, because the folder carries the team's folded status and they are its cargo. The
  open team's folder is **standing open and empty**, its members being the rows beneath it: the
  front is a pocket flared wider at the top than the bottom, which is the ordinary open-folder
  shape and the only treatment tried that could not be read as a folder that is merely
  *emptied* — and emptied already has a meaning in this column, the dashed ghost of a team with
  nobody on it.
  A team may also carry an **icon**, and it goes **on the folder as a sticker** — lower-left,
  over the front panel's bottom edge, greyed — never in place of the mark. The faces answer
  *who is on this team*; an icon answers *which project is this*, which is a different question
  and the one a column of similarly named teams is worst at. Replacing the mark with it would
  answer the second by deleting the first, along with the folded status the folder is the body
  of, and would put a saturated thing on screen that is not a blobatar. Greyed rather than
  silhouetted, because luminance is most of what makes a logo readable at that size and a flat
  silhouette of one is usually a blob. Straddling the folder's edge rather than contained inside
  it, because the front panel at a rail row's 34px is about ten pixels tall and an icon fitted
  into that reads as a smudge on the chrome. A team without an icon is not a team missing one:
  there is no placeholder. An
  agent row is a blobatar, a name, the last thing that agent said, and when. The role shows only
  until it has said something. `idle` is not printed: it is the resting state of a quiet app.
  **A team row and an agent row are the same box**, down to the padding: they sit in one column,
  and a team row standing taller made the rail read as two lists stacked rather than one.
- **The lead is named on the team's row, not on the agent's.** `led by Alice`, under the team
  name, where the running team's member count used to be — because who leads is a fact about
  *the team* and not about the agent: the same agent leads one team and not another, which is
  why it cannot live on an agent's definition either. The agent rows say nothing about it. It is
  **named rather than drawn**, by the blobatar rule above: a face appears where you are
  identifying among agents or choosing one, and this is a single agent being mentioned.
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
- **The activity column** — the log. Tool calls and finished turns. Hideable from the chrome,
  remembered. Never auto-collapses: it would reappear on the first tool call and shove the
  conversation sideways mid-turn.
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
- **Your agents** — every AgentProfile the user has hired, over the working surface rather than
  in place of it: the team behind it keeps running, and nothing on this screen restarts one. A
  row is a face, a name, a role, the runtime and the teams it is on, with its standing
  instructions under them clamped to two lines. Clicking a row edits the definition; retiring is
  an icon revealed on hover and `:focus-within`, the rail's rule for the same reason. It is a
  **working** surface and takes none of the creation flow's editorial treatment: no hand face, no
  standfirst, no numerals. Reached from a row above TEAMS in the rail, because that is the order
  the model reads in.
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
- **Modals** — for things that outlive the screen that opened them. Hiring an agent is a modal
  because the agent exists afterwards whether or not the team is created. A step of a flow is
  not a modal.

## Preferences

Anything that is a preference about a screen (a rail width, a hidden column) goes in
`localStorage`. Anything that is a fact about an agent or a team (its name, its colour) goes in
SQLite. The test is whether it has to follow the agent to another team, or another machine.
