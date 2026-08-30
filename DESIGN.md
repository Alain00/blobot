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

Two consequences you will keep bumping into:

- **Status is never colour.** It has three channels instead: motion on the blobatar, a mono word
  spelled out, and a hairline that sweeps while a turn is in flight. Seven states do not fit in
  a dot, and a coloured dot is exactly what the palette forbids.
- **Contrast is the attention channel**, because colour is spoken for. Spend it almost never.
  There are two inversions in the whole app: `waiting` (the one state where an agent sits
  forever until a human looks) and an armed primary button.

## Tokens

| Token | Value | What it is |
|---|---|---|
| `--ground` | `#0a0a0b` | The page. |
| `--raised` | `#131315` | Anything lifted off it: a bubble, a field, a hovered row, a menu. |
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
- **From a peer** — inset, unfilled, one **dashed** edge down the left, a route header carrying
  both blobatars, and the trust framing printed verbatim on the received side. Folded to about
  eight lines with a `more` toggle, because a peer message is often a whole turn quoted back and
  at full height a single one buries every reply around it.

**Dashed against solid is the whole trick, so do not soften it.** A user message and a peer
message are both "text someone sent this agent"; solid-and-filled against dashed-and-unfilled
reads as higher against lower authority before a word is parsed, which is the visual form of a
peer message being refusable rather than an instruction. The enclosure was four dashed sides on
a raised ground and is now one edge; that is a weight change, not a signal change, and the
signal is not yours to spend.

Other transcript rules:

- A turn is labelled once. Consecutive messages from one agent drop the repeated blobatar and
  name and tighten their gap.
- The column fills the pane to a 900px measure and centres.
- A time rule appears before the first item and after a fifteen-minute gap.
- Three dots stand in for an agent that has been asked something and has not started streaming.
- **Folding is for the peer voice only.** A message from you is yours and short; an agent's
  answer is the thing the pane exists to show, and folding it would be hiding the work.
- **A permission block is a transcript item, not a modal.** An agent that has been asked to run
  something dangerous stops until a human answers, and two agents can be stopped at once: a
  modal would serialise them into whichever arrived first. It stands where that tool's line
  would have stood, in the same gutter, wearing `.refusal`'s ink edge because it is the same
  kind of event — something stopped, and a person is the only way past it. **Neither button is
  armed**: `waiting` already spends the app's one inversion in the rail and the header, and
  blobot has no opinion about whether the call should run, which is why it is asking. Exactly
  two answers, **allow once** and **reject** (ticket 14), and the tool line does not print
  `running` while nothing is running.
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
  Alice's pane, because the pane is already the recipient; in the team pane it wears the
  resolved agent's blobatar, because there the recipient is a live question.
- Selection in a list is the raised ground alone. No left rule: a row that lifts and brightens
  is already saying it twice.

## Icons

**Lucide** (`lucide-react`), 13 to 17px, `--muted` at rest, `strokeWidth` default. No other icon
set, no inline SVG paths pasted into components, no emoji in the interface.

## Primitives

**Radix for behaviour, never for looks.** `@radix-ui/react-dialog` and `@radix-ui/react-select`
are in use. Take a primitive when you need the half nobody screenshots: a focus trap, focus
returned to the trigger, `aria-modal`, a listbox with arrow keys and type-ahead. Style every
pixel yourself from the tokens above.

**No shadcn, no Tailwind.** Considered and declined 2026-08-29: the design system already
exists, so shadcn's value would have been defaults we override to nothing, plus a build step.
If you want a component from it, take the Radix primitive underneath it instead.

## Motion

Motion is a real channel here, not decoration: it is what makes "two agents working at once"
legible from across the room. It is also the only thing that moves, so anything you add
competes with status.

- Status animations live on the blobatar: still, breathe, bob, nod, pulse, flinch.
- A team mark animates the **folded** team status once for the whole cluster. Four members
  bobbing out of phase is four things fidgeting.
- **Everything decorative sits behind `prefers-reduced-motion`**, where the mono word and the
  hairline carry the state alone. No exceptions.

## Words

- **No em dashes** in anything a user reads: UI strings, placeholders, tooltips, demo lines,
  and the prompt text agents receive. A period, a comma, a colon, or the app's `·` separator.
  (Code comments and this file are not product copy.)
- **Never the word "authenticated".** Detection observes whether a credential is present, which
  is a different claim. The four honest states are `ready`, `needs sign-in`, `not installed`,
  `status unknown`.
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

- **The rail** — every team, running or not, and the running team's agents under it. A row is a
  blobatar, a name, the last thing that agent said, and when. The role shows only until it has
  said something. `idle` is not printed: it is the resting state of a quiet app. Editing and
  deleting a team live on the team's own row as icon buttons, revealed on hover **and on
  `:focus-within`** — hover-only would put both out of reach of the keyboard — because a delete
  button sitting on every row at rest would be the loudest thing in a column whose job is quiet.
- **The transcript** — the three voices above, in a centred column.
- **The activity column** — the log. Tool calls and finished turns. Hideable from the chrome,
  remembered. Never auto-collapses: it would reappear on the first tool call and shove the
  conversation sideways mid-turn.
- **The creation flow** — the one *editorial* page. It ends with ticket 14's disclosure: an
  unnumbered block with an ink edge, above the button that spawns the first agent. Stated, never
  consented to, and it may only claim what blobot actually arranged. It says the runtimes are
  set to prompt; it does not name commands, because blobot can only name them on some runtimes. A display line in the hand face, a
  standfirst, numbered steps. It is read once, start to finish, before anything exists, which is
  a different job from every other surface. Do not spread this treatment; it works because it is
  the only one.
- **Modals** — for things that outlive the screen that opened them. Hiring an agent is a modal
  because the agent exists afterwards whether or not the team is created. A step of a flow is
  not a modal.

## Preferences

Anything that is a preference about a screen (a rail width, a hidden column) goes in
`localStorage`. Anything that is a fact about an agent or a team (its name, its colour) goes in
SQLite. The test is whether it has to follow the agent to another team, or another machine.
