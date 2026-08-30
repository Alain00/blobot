Type: prototype
Status: resolved
Blocked by: 09

# The team and conversation UI

## Question

The demo's whole payoff is visual: two blobatars working at once, and a visible message
passing between them. That either reads instantly or the demo is flat.

Prototype the team view and the conversation panel to answer: how a team of agents is laid
out and how status is expressed at a glance; how an agent-to-agent message is rendered so it
is obviously *not* a user message; whether there is one conversation per agent, one per team,
or both; and where the activity feed sits relative to the conversation.

Rough and throwaway. React to it, do not polish it. No provider-specific logic anywhere in it.

## Design direction (from the author, recorded while charting)

The visual language is **blobatar.dev's** — Swedish editorial minimalism. Source of truth:
`~/Projects/personal/blobatar/apps/site/styles.css`, which is heavily commented and worth
reading before prototyping.

**The governing rule:** *the blobatars are the only saturated thing on the page.* Everything
else is monochrome. This is load-bearing for us — agent identity and agent status are the two
things that must pop, and the palette already reserves colour for exactly the first of them.
Status therefore cannot be expressed as colour without breaking the rule, which is a real
constraint on the prototype rather than a stylistic preference.

**Tokens** (Tailwind v4 `@theme`, dark-only — `color-scheme: dark`, no light variant):

| Token | Value | Role |
|---|---|---|
| `--color-ground` | `#0a0a0b` | page. Near-black, **not** `#000` — against true black the blobatar silhouettes read as cut out; against this they read as placed |
| `--color-raised` | `#131315` | cards, panels |
| `--color-ink` | `#fafaf8` | text |
| `--color-muted` | `#8a8a93` | secondary text |
| `--color-line` | `#232327` | borders |

**Type:** Geist (sans), Geist Mono, Caveat (hand — used sparingly, one voice, subset to a
single heading).

**shadcn:** the site defines shadcn colour aliases pointing at the five tokens, but only so the
showcase can render registry items unmodified. The site's own vocabulary is
`ground`/`raised`/`ink`/`muted`/`line`, and blobot should use that vocabulary too. Note the one
collision documented there: `muted` here is a *text* colour, whereas shadcn's `muted` is a
surface.

A screenshot of the site is available from the author on request.

## Answer

Prototyped as three structurally different variants at
`.scratch/first-demo/prototypes/12-team-ui/index.html` — one throwaway HTML file, no build
step (also published for viewing at
https://claude.ai/code/artifact/f0db1f5f-7499-4155-b5a3-d269cc86df80), `?variant=A|B|C`,
with a scripted scene that plays the exact moment this ticket cares
about: the user asks Alice to fix a double-charge, Alice guards the UI and messages Bob for
the server-side idempotency key, both work at once, Bob hits a permission prompt, Bob
replies. **A won**, with the team view folded back into it and the recipient picker thrown
out. B and C were killed and are recorded below because *why* they lost is the answer to two
of the four questions.

### Layout: a rail of the team, a pane for the conversation, a feed on the right

Three columns. Left rail (232px) is the team; centre is the selected conversation; right
(288px) is the activity feed. The rail's first item is the **team itself, drawn as a group** —
its members' blobatars overlapped — and below it, under an `AGENTS` label, one row per agent.

An agent row is **two lines, not three**: name on the first, `role · status` on the second with
the status right-aligned so it forms a scannable column down the rail. The first draft gave
status its own line and the rows were visibly too tall — at three agents the rail already felt
like a settings screen rather than a team.

The group is drawn with a **silhouette cut, not a ring**: each blobatar in the stack gets a
1.5px outline in the surface colour, following its own outline. Blobatars are transparent-backed
and none of them are circles, so the conventional overlapping-avatar ring reads as a badge
that does not fit the shape. The cut colour swaps to `raised` when the row is selected.

### There is one conversation per agent **and** one for the team, and the team is a peer in the rail

This is the question the ticket asked, and the answer is "both" — but the shape matters more
than the count. The team conversation is **not a second surface**. It is another item in the
same rail, selected the same way, rendering into the same pane. Everything else about the
window is unchanged.

Selecting the team gives every agent's messages in one chronological stream, and a peer
message appears **once, at its crossing**. Selecting an agent gives that agent's session as the
runtime actually sees it — which means a peer message appears **twice** across the app: once in
Alice's pane as `sent to Bob`, once in Bob's as `from Alice`. That is not a duplication bug, it
is ticket 06's decision rendered honestly: Alice's session and Bob's session both genuinely
contain that message, and the per-agent pane's contract is that it shows you what the agent
sees. The team stream is the derived view, so it is the one that de-duplicates.

Variant B — one team room and *no* per-agent view — is what this replaces. It lost because
the per-agent transcript is not a nicety: it is the only place the user can see what Bob was
actually told, and ticket 06 spent its whole argument on not hiding peer traffic from the user.
A room-only app hides half of it behind a de-duplication rule.

### The activity feed is docked right, and it is per-agent with a team tail

For an agent: that agent's events on top, the team's below a rule. For the team: the whole
team's, undivided. It stays a **third column rather than a tab or a drawer** because the demo's
claim is that you can watch two agents work at once — a feed you have to open to see is a feed
you never see while something is happening.

Tool activity is the seam between the feed and the conversation: the in-flight tool line renders
in the conversation (`Edit  src/checkout/PayButton.tsx`, mono, muted, under the message it
belongs to) and its completion goes to the feed. The conversation shows what the agent is doing
*now*; the feed is the log.

### Status is legible in monochrome through three channels

The blobatars are the only saturated thing on the page (this ticket's governing rule), so
status gets no colour. Three channels, applied identically wherever an agent appears:

| Channel | What it carries |
|---|---|
| **Motion on the blobatar** | still (`idle`), slow breathe (`thinking`), bob-and-tilt (`working`), small nod (`responding`), pulse (`starting`), flinch (`waiting`) |
| **A mono word** | always spelled out — seven states cannot be inferred from a shape, and a coloured dot is exactly what the palette forbids |
| **A sweeping hairline** | present only while a turn is in flight; it is the "something is happening" tell that survives being glanced at |

Plus two reserved treatments, which are the load-bearing calls:

- **`waiting` inverts** — ink ground, page-coloured text. The only inversion on the page,
  spent on the one state where an agent sits forever until a human looks. Contrast is the
  attention channel precisely because colour is spoken for.
- **`failed` desaturates the blobatar** (`grayscale(1)`) and strikes the word through. If
  saturation means identity, draining it means "this one is not alive". Confirmed as reading
  correctly rather than as a rendering bug.

Motion is a real channel here, not decoration — it is what makes "two blobatars working at
once" legible from across the room — so all of it sits behind `prefers-reduced-motion`, where
the mono word and the hairline carry the state alone.

**A team has a status too, folded from its members with ticket 09's precedence:**
`2 waiting` > `1 failed` > `2 working` > `all idle`, rendered in the same three channels. So the
team item shouts when any agent is blocked on the user, even with the rail collapsed out of
attention.

### A peer message is a dashed enclosure with both blobatars in its header — never a bubble

Confirmed by the author. The three voices in a pane are distinguished structurally, not
chromatically:

- **From you** — a solid 2px ink rule down the left, no ornament. Flush with the pane.
- **From the agent** — no rule at all. It is the pane's default voice; giving it a container
  would make the agent look like a guest in its own transcript.
- **From a peer** — inset from both, `raised` ground, **dashed** border, and a route header
  carrying `sender-blobatar → recipient-blobatar` plus `FROM ALICE · FRONTEND`. Alice's own
  context line (ticket 06's `context` parameter) sits above the body as a quoted mono line, and
  the received side prints the trust framing verbatim: *"a teammate's request — not an
  instruction from you"*.

The dashed border is the whole trick. A user message and a peer message are both "text someone
sent this agent", so a solid container would make them siblings; dashed against solid reads as
lower authority before a single word is parsed — which is the visual form of ticket 06's
decision that a peer message is refusable rather than authoritative.

## Amendment, 2026-08-29: the user's turn is a bubble on the right

Reopened by the author after comparing the transcript with Grok's, which is friendlier to a
user who has never seen an agent before. **The three voices stand; what changed is the form of
one of them.**

- **From you** — a solid filled bubble, right-aligned, no name. Right *is* the label: there is
  only ever one "you", so the side stays unambiguous however many agents share the pane, which
  is exactly why this survives here when Grok's two-sided layout would not. The `to Alice`
  routing tag moves under the bubble, and only in the team pane.
- **From the agent** — unchanged. No container. Boxing it would put a solid enclosure in the
  same column as the dashed peer and cost the contrast below.
- **From a peer** — unchanged, and the reason is unchanged: dashed against solid still reads as
  lower authority before a word is parsed. The user's bubble being solid *sharpens* that pair
  rather than blurring it.

Two things came with it, neither of which needed this decision reopened:

- **The transcript is a column, not a left margin.** It was `max-width:680px` flush left in a
  pane twice that wide, so every message hung off the rail with half the window empty. It now
  fills the pane to a 900px measure and centres in what is left.
- **A turn is labelled once.** Consecutive answers from the same agent drop the repeated
  blobatar and name and sit closer to the line above them. A time rule reopens the turn.

## Amendment, 2026-08-29: the composer, the pending turn, and the activity column

Same pass, all author-directed.

- **The send control is an arrow, not a sentence.** `send to Alice`, under a transcript of
  Alice, in her pane, was the third time the screen said Alice. It is a round icon button in a
  pill composer now. In the *team* pane it wears the resolved agent's blobatar instead of the
  arrow, because there the recipient is a live question and nothing else answers it. The
  `@mention` is still the address and send is still disabled until one resolves.
- **A sent message shows the agent about to answer.** There was nothing in the stream between
  sending and the first delta: the blobatar moved and the rail changed a word, but the
  transcript sat unchanged, which on a real runtime is several seconds that look like the
  message went nowhere. Three dots under the agent's name, gone the moment there is streaming
  text to watch instead. `isPending` in `model.ts`, tested.
- **The activity column can be hidden**, from an icon in the chrome. This does not reopen the
  rejection of *auto*-collapsing it: that failed because the column would come back on the first
  tool call and shove the conversation sideways mid-turn. A toggle only ever moves when the user
  asks. Remembered in `localStorage`, like the rail's width.
- **Selection in the rail is the raised ground alone.** The 2px ink rule was a third emphasis on
  a row that already lifts and brightens, and it cut into the blobatar's column.
- **The team mark's members overlap by about a third** rather than by a few pixels, so the mark
  reads as one clump instead of a constellation. `markLayout` has a test for it.
- **Icons are Lucide**, at the author's direction. First use in the app.

## Amendment, 2026-08-29: the creation flow is editorial, and an agent has a colour

Author-directed, after the fourth pass.

- **The add-team screen is the one editorial page in the app.** A display line in the hand face
  the page already had, a standfirst, four numbered steps. Nowhere else changes: it is the only
  surface that is read once, start to finish, before anything exists.
- **Its controls are the composer's, generalised.** `.field` is the composer's pill; `.btn` is
  the same shape; the primary button inverts to ink when armed, as send does.
- **Hiring is a modal**, because the agent outlives the team being made. The blobatar preview is
  the subject of it: centred, on the page rather than in a card, with no name under it, since
  the name is in the field below being typed.
- **An agent has a colour**, chosen from thirteen in a block, defaulting to the one its name
  gives it. Persisted on the profile and copied onto the Agent, because the face has to follow
  it onto every team. This does not spend the palette: the blobatars were always the saturated
  thing, and this only says which saturated thing.
- **Radix supplies the dialog and the select.** Behaviour only. shadcn was considered and
  rejected: the design system exists, and its value would have been the defaults we override.

## Amendment, 2026-08-29: what an agent's rail row says

Also from the Grok comparison, and it reverses the earlier rejection of a preview line.

- **The last thing the agent said, and when.** Its own words only, collapsed to one line, with a
  terse timestamp on the name line. A peer's message and the user's are not that agent speaking.
- **The role stays, as the fallback.** Grok can drop it because its names *are* roles ("Inbox
  Manager"). blobot's are the user's own, so `Alice` alone says nothing about what she is for.
  The row shows the role until she has said something, and the preview after.
- **`idle` is no longer spelled out.** A quiet team said IDLE on every row under ALL IDLE, which
  is the one state that needs no words. Every other state still gets its word, and `waiting`
  still inverts.
- **Still no coloured dot**, and this is the part of the request not taken. Colour is spent on
  the blobatars by this ticket's governing rule, and seven states cannot be told apart by one
  anyway. Motion on the blobatar plus a word on the states that are not resting is the same
  information without spending the palette.

### The recipient is an `@mention`, not a picker

The team pane originally had a `to Alice ▾` picker. It is gone, replaced by addressing inside
the sentence: typing `@` opens an agent list, a resolved mention takes ink weight and an
underline, an unresolved one stays muted, and the send button names who it resolved to and
carries their blobatar.

- **In an agent's pane the recipient is implicit** and a mention *overrides* it — talking to
  Alice needs no `@`, and `@bob` mid-sentence re-points the message. Last valid mention wins.
- **In the team pane there is no implicit recipient**, so send stays disabled until a mention
  resolves.

That second rule is why the picker had to go. A picker defaulted to `to Alice ▾` quietly
implied a broadcast surface that ticket 05 does not have: a message lands in exactly one
agent's session. Requiring the mention makes the team pane what it honestly is — the place you
read the whole team and address one of them by name.

**Note for whoever implements it:** this makes `@` the human's addressing gesture while ticket
05 already specified `message_agent(recipient)` as the agent's, with a free-form recipient the
orchestrator validates. They are the same resolution rule on two surfaces, and the composer's
unresolved-mention state is the human-facing twin of the orchestrator's "no such teammate"
error. Resolve both through one function or they will drift.

### Variant C is the demo, and it is not the app

C put each agent in its own full-height column so the peer message could physically cross the
gutter — the best thirty seconds of screen recording in the set, and the clearest reading of
"two blobatars working at once". It is not the answer, because it only works at N=2: the third
agent was already exiled to a label in the composer before the variant was finished. Recorded
here because if the demo ever needs a hero shot, that is the shot, and because the in-flight
message is the one idea from it worth stealing back into A later.

### Provider-agnosticism held

No variant needed to know which runtime an agent is. `OpenCode` and `Claude Code` appear
exactly once each, as a label in the conversation header, sourced from the agent record like
its role. The UI never branches on it.

## Amendment — from ticket 14

Ticket 14 chose a posture where an agent genuinely prompts before a short list of shell
commands, and rejected a modal for answering. The transcript therefore gains one element this
prototype does not have: a **permission block**, rendered inline where the in-flight tool line
already appears, offering exactly two choices — **Allow once** and **Reject**.

`allow_always` is deliberately not surfaced even though both runtimes offer it over ACP: it
persists for the session, which makes it a rule the user authored with nowhere to see or revoke
it.

The conversation header also gains a small permanent posture indicator beside the branch.
**Withdrawn 2026-08-30** by ticket 14's own amendment of that date: the header carries no
posture line any more. See the amendment below.

Neither changes anything decided above — `waiting` already had its contrast inversion, and the
block sits in a position the layout already uses.

## Reopened, 2026-08-29: one point only — the team pane's implicit recipient

Raised by the author. *The recipient is an `@mention`, not a picker* decided that **in the team
pane there is no implicit recipient** and send stays disabled until a mention resolves. That is
the point now open, and only that point. Charted at `.scratch/team-addressing/`, issue 01.

The ask is to talk to a team without naming a member first. Nothing else in this ticket is in
question: `@` stays the human's addressing gesture, an agent pane's implicit recipient is
unchanged, and last valid mention still wins.

**The reason given here survives and constrains the answer rather than blocking it.** The picker
was removed because a quiet default implied a broadcast surface ticket 05 does not have. A
message still lands in exactly one session and this effort proposes no broadcast, so a default
recipient is admissible **only if the composer names and draws the agent it resolved to**. A team
pane that looks like it is talking to *the team* is the surface this ticket removed, and would be
a second reopen rather than a fix.

**Answered 2026-08-30, and the amendment is this:** the team pane addresses the team's **lead**
when the user names nobody, and nothing else in the ticket moves. A team may have no lead, and
then this ticket's original rule stands unchanged — send stays disabled until a mention resolves.
The exchange is the one demanded above: the composer names who it resolved to, in the placeholder
before a key is pressed and on the send control afterwards. See
`.scratch/team-addressing/issues/01-a-default-recipient-for-the-team-pane.md`.

## Amendment, 2026-08-30: where a blobatar may appear, and what the header is for

Raised by the author, on the working surface as built. The blobatars are the app's only
saturated thing and they are the readable, expressive part of it, which is exactly why the same
face was on screen five times at once for one agent: the rail row, the rail's team mark, the
conversation header, every turn in the transcript, the pending row, the peer route header, the
composer's mention menu and the send button. The header's face was 38px against the rail's 34px,
so the copy outranked the original.

Three decisions, one rule.

**The rule.** A blobatar appears where you are *identifying among* agents or *choosing* one, and
never where a single agent is *merely named*. It keeps a face in the rail, in the composer's
mention menu and on a turn in the transcript. It takes one off everywhere else, and the name
always stays where the face goes.

**The conversation header is one mono hairline row.** It carried a blobatar, the agent's name in
bold, its role and its status word — and the selected rail row a few pixels to its left carries
every one of those, larger, including the same `StatusWord`. What is left is the three facts the
rail does not carry: the role, the runtime and where this agent is working. Nothing above the
transcript is saturated or bold any more, and the header carries no status at all, which
supersedes this ticket's "the header carries the state" wherever it appears above.

Ticket 14's posture line went from the header the same day, on the author's call, and its reason
is recorded on ticket 14: a sentence printed over every pane all day is not read either, and it
was spending a third of the one line left on a fact that never changes.

**The send button shows the recipient's name, never their face.** The pill, the `@mention` the
user just typed and the tooltip already name them; a face on a button also reads as the
affordance rather than as an identity.

**A peer message is one line, shut, with no peek.** A chevron, `message received from` or
`message sent to`, the far end's blobatar, the name. It opens on a click into the context, the
message and the received side's trust framing. The dashed edge went with it, onto the opened
message: a one-line label needs no enclosure, and the edge is still on every quoted turn that is
actually on screen. This supersedes the eight-line fold with a `more`
toggle decided above: at the length a quoted turn actually runs to, even eight lines outweighed
the reply the message was about, and a peek asserts the first eight lines are the part worth
reading, which for a whole turn quoted back is rarely true. One blobatar rather than two,
because the near end of the route is the pane the line is already sitting in.

`DESIGN.md` carries all four, and `Foldable` is gone with the fold.

## Amendment, 2026-08-30: the rail keeps its order, and a team is a folder

Raised by the author. Two things, and the first is a prerequisite for the second.

**A team keeps its place in the column when you open it.** The rail built its rows as *"the
running team, then everything else"*, so clicking a team hoisted it to the top and every other
row shifted under the pointer: the order of the list depended on what you last clicked, and the
team you were on a minute ago was never where you left it. `listTeams` already orders by
`createdAt` and that order is stable across every switch, so the rail renders it.

The hoist was never an ordering decision. It was a **lookup** solved with one — the running team
is drawn from the `team` prop rather than from its summary row, because the summary carries none
of what the conversation knows and demo mode has no row for it at all. The substitution happens
in place now, and the prepend survives only for the demo case that needed it.

**A team row is a folder.** Monochrome, with up to three members peeking over the front panel and
a `+N` on the panel for the rest. Three decisions inside that:

- **Cropped by the front panel, and sized to the folder rather than to the box.** A face that
  hangs past the folder's sides reads as standing beside a container rather than in one, which is
  what happened at first: three faces at full size came to 98 of the box's 100 units inside a
  folder that is 84 wide.
- **A peeking face may be small, and a blobatar elsewhere may not.** The ~26px floor the 26→34
  pass established is a floor on *motion* — under it, breathing at `scale(1.035)` is half a
  pixel — and these faces do not move: the folder carries the team's folded status and they are
  its cargo. All a peeking face has to do is be identifiable, which a blob with its own hue
  manages well under that floor. This is the fact that lets three of them fit.
- **Three peek, and the rest is a count.** A folder shows the first few of what is in it, so a
  team of four draws three and `+1`.
- **The open folder stands open, and is empty.** Its front is a pocket flared wider than the box
  at the top and narrower at the bottom — the ordinary open-folder shape. Three gentler
  treatments were tried and all three failed the same way: a tapered clip-path, a dropped panel
  and a rotated flap each drew a folder that was merely *empty*, and empty already means
  something in this column, being the dashed ghost of a team with nobody on it. Keeping one face
  in the open folder was tried too and is a worse lie than the one it was meant to fix: a folder
  with a single face reads as *a team of one*, drawn for precisely the team whose whole roster is
  listed underneath it.

  The folder is drawn as two inline SVG paths rather than as bordered boxes, because a
  `clip-path` on a bordered box loses the stroke down every slanted edge: the open pocket would
  be a filled wedge with a hairline on two sides of four. The stroke is `non-scaling`, so it is
  one physical pixel at 46px and still one at 160.

  Two things about the geometry, both of them corrections. **The back stops at y=58**, well above
  the bottom of either front: it is a back, none of it below the fold is meant to be seen, and at
  full height its two bottom corners came out past the sides of the narrowing pocket and read as
  a misalignment. And **the folder is drawn inset**, x 4..96 rather than to the edges: it is
  chrome around the only saturated thing on the page, and a folder drawn to the box's edges made
  the faces the smaller half of their own mark.

The mark's single folded-status animation moves with it: the **folder** carries the status, not
the faces in it. Same keyframes, same durations, applied to the container. A folder that moves is
one thing moving, which is what the fold is a claim about.

The fly-out — the members leaving the folder for their rows when a team opens — is built, and it
**contradicts an interaction-motion rule**, which is why it is written down here rather than
merely done. `DESIGN.md` said *nothing on the paths that are walked all day*, and named team
switching. Two things about that.

The clause was written when a team row was a static cluster of faces, where switching was a pure
data swap and any motion on it would have been decoration on a frequent path. A row is a folder
now, and shut and open are structurally different things — cargo in a container, or a list of
rows. The travel is what makes them one object instead of two pictures.

And the frequency objection is met rather than waived: **under 250ms including the stagger, never
gating a click, cancellable mid-flight** because A → B → C is ordinary in a column of teams. It
also satisfies the rule immediately below the one it breaks, *nothing that carries meaning of its
own*: the folder and the rows already say what the roster is, so a reader who misses it, or who
asked for reduced motion, has lost nothing.

`DESIGN.md` now carries this as its one named exception. If that reads as too much rope, this is
the paragraph to reopen.

## Reopened again, 2026-08-30: "last valid mention wins"

The second reopen, and a different sentence from the first. *The recipient is an `@mention`, not
a picker* decides that a message has **one** recipient and that **the last valid mention wins**.
Both halves are now false, and `.scratch/team-addressing/issues/02-does-a-coordinator-earn-its-turn.md`
is where they were argued.

**A message still lands in exactly one agent's session** — that is ticket 05 and it does not
bend. What changed is that one thing the user types can commit **more than one message**:
`@alice @bob the page double-charges` writes a row per named agent, each carrying the user's own
words with the user's own authority. That is the fan-out the author asked for, and the reason it
is not the broadcast surface this ticket removed is that blobot never decides who a message is
for and never expands a set the user did not type.

**The addressing rule is now the leading run.** Mentions before the first ordinary word are the
recipients; a mention later in the sentence is a reference, so `ask @bob about @alice's branch`
reaches Bob alone. `ship it @bob` no longer sends to Bob, which is a real loss taken on purpose:
keeping it would mean two rules, the second existing only for a behaviour that was hours old.

Everything else in this ticket stands, including the reopen above it: `@` is still the human's
addressing gesture, an agent pane's implicit recipient is unchanged, the team pane's implicit
recipient is still the lead when nobody is named, and the composer still says who it resolved to
— now up to two names and a count.
