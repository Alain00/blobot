Type: prototype
Status: resolved
Blocked by: 09

# The team and conversation UI

## Question

### Amendment — Machine power, reopened and resolved by Guillermo, 2026-09-05

The author explicitly requests a green lower-right avatar dot when the Agent's Machine is
awake and gray while asleep. This narrows the monochrome rule for power only; the binding
rendering rule is in `DESIGN.md`, “Machine power exception”. Activity and runtime readiness
remain separate. This amendment does not reopen the rest of the team's layout.

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

## Reopened a third time, 2026-08-30: "hiding a message is for the peer voice only"

The third reopen, and again one sentence. *Hiding a message is for the peer voice only* was
written against the case where the alternative was folding a whole reply, and its reason says so:
*an agent's answer is the thing the pane exists to show*. It does not cover a caption on a tool
call, and a long turn is mostly those.

The screenshot that prompted this was one Claude turn, flat: a dozen lines of *"Now the
interaction wrapper that every desk object shares."*, three shell one-liners wrapping across
three lines each, and the permission sentence *"you allowed this, and it stops asking"* stamped
on every call the rule covered. The paragraph the whole turn was leading to sat under all of it.
Two things were wrong at once, and the second is the worse one:

- The narration wins the column by weight while saying the least. A caption is a sentence in
  sans at the body size; a call is one mono line at 11.5px. Twelve of each and the eye reads
  twelve intentions.
- **The transcript was keeping the narration and throwing away the work.** A finished call left
  the items list on completion (`model.ts`, *"the in-flight line lives in the conversation and
  leaves it when the tool finishes"*) and only the feed kept it. So what survived a turn was an
  agent's account of what it did, and never what it did.

The seam is the **step**: a caption and the calls it introduces. Settled steps fold; a run of
them is one line saying how many calls it stands for. A finished call now stays in the
transcript, which costs no ink because it is only ever drawn inside a fold — the default view is
quieter than before this change, not louder.

What is *outside* a block is the design, and it is enforced by the grouping rather than by a
flag at the render site: a running or asking call, a question nobody has answered (`waiting`
spends the app's one inversion, and a stopped agent behind a chevron is the modal problem
wearing a chevron), a live answer, and any prose long enough to be one. Trailing prose is
trimmed off the end, because the last thing said in a turn has no call after it.

Borrowed from the pattern, deliberately: the chevron and the mono label, so the transcript has
one disclosure gesture and not two. Refused from it: the checkmark per step, because ticket 08
exists to say a cancelled call reports `completed` with `exit: null`; and the duration, because
blobot cannot honestly claim one across a permission wait. The count is what a reader wants
anyway.

Two things that came with it and are independent of the fold:

- **The permission tail is gone.** *"you allowed this, and it stops asking"* is a sentence about
  a standing rule, and it was printed once per use of that rule. Where the rule goes is said in
  the block that asks, which is the moment it is a decision. The record says `allowed always`.
- **A call carries a verb.** `read` / `edit` / `run`, from the `ToolKind` core already receives
  off both runtimes and the renderer used to drop, drawn in a fixed column. Nothing for an MCP
  tool: its name is its server's, and a verb blobot invented for it would be a guess printed
  beside three facts.

The one thing the author overruled: **diff counts beside an edit may be green and red**, against
the governing rule, on the grounds that two small signed numbers carry their meaning in the sign
and the colour is reinforcement rather than the channel. Recorded in `DESIGN.md` as a named
exception. Not built — no runtime's `rawOutput` is plumbed through core yet, and doing it means
a live run against both.

### The same day: the fold had to reach a transcript nobody watched happen

The reopen above was built against a live turn, and a restored pane has no tool lines — so it
grouped nothing and came back as the flat wall the fold exists to prevent, in the ordinary case
of a relaunch or a team switch. The store had every fact needed; migration `0009` adds the one it
did not (`exit_reported`, which separates a cancelled call's explicit `exit: null` from a call
that never had an exit code, and without which a restored header counts its failures wrong).

It also turned up a call being dropped by both the transcript and the activity column, from
before any of this: the renderer filters streamed events by the team it is showing, and does not
know which team that is until its first snapshot resolves. `logOfTeam().running` covers it. The
underlying drop is recorded in `build.md` and is a change to how a team is opened.

## Amendment, 2026-08-30: the rail is a list of agents under headings

Reopened by the operator, on the rail alone. Three decisions on this ticket are reversed, and
`DESIGN.md`'s *Screens* section carries each with its reason.

**The folder is gone.** A team's mark was a drawn folder with up to three members peeking over
the front, a `+N` on the panel and the project icon straddling the panel's bottom edge. At the
size a row draws, that is six paths and two questions in one box, repeated down a column whose
whole job is to be quiet, and the operator's objection was density: *"it adds too much noise to
the whole rail."* The container was the noise, and the two answers stacked in one slot were what
made the container necessary.

**So the mark answers one question, and the project icon wins it.** Faces are the fallback, on
teams with no icon. This reverses this ticket's *"an icon that replaced the mark would answer
which project by deleting who is on it"*, and the reversal is deliberate rather than a
softening: **faces cannot tell similar teams apart**, because the same agents are on several
teams — ADR-0001 — so two teams sharing a roster drew an identical stack. An icon is unique to
the project by construction. The cost is real and is not hidden: on a team with an icon the rail
no longer says who is on it. It is one click away, on the rows the team opens into.

**A team row is one small line, with a chevron.** The row was already a disclosure and nothing
said so. The chevron is an indicator and not a control — exactly one team is open, and a twisty
that could collapse the team you are reading would have to invent an *open but collapsed* state.
The second line went with it, which took `led by Alice`: who leads is now `LEAD` on the lead's
own row, which this ticket refused on the grounds that leading is a fact about the team. That
reason survives the move, because the roster is visibly nested under its team now, so a row
inside the section is already scoped to it.

**What was given up that is worth naming.** The face flight — the roster opening by throwing its
members out of the folder into their rows — is deleted. It was the only thing in the interface
that *said* the rows are the folder's contents rather than merely laying them out that way. With
a project icon in the mark it could only ever have run on half the teams, and half a gesture that
fires on some rows and not others is worse than none. The roster's growth and the rows' fade
remain, and the whole row fades now rather than its text alone.

## Amendment, 2026-08-30: the rail's doors move to its foot, and there is a settings screen

Reopened by the operator on the rail again, and this time on the two rows above `TEAMS`.

**`YOUR AGENTS` and `ROUTINES` are gone from the top of the column.** They stood there because
that is the order the model reads in — an agent exists before a team, and a Routine belongs to
an agent — and that reason is about the model rather than about the column. On screen the two
headed rows pushed the teams down and read as a second list stacked on the first, which is the
exact failure the team row was shortened to avoid in the amendment above. The column is about
teams, so the teams start at the top of it.

**They are three doors at the foot now**, over a hairline: *Agents*, *Routines*, *Settings*.
Named for what is behind them and not set in mono, because a heading names what is under it and
there is nothing under these. They are drawn like `Search` at the other end of the column, which
is the only other thing in the rail that is a door rather than a list item.

**The operator's own proposal was one door.** *Settings*, with *Agents* and *Routines* as
sections inside it. That was refused on the merits and the refusal was accepted: an AgentProfile
is the roster — ADR-0001's whole point is that an agent exists before any team, and hiring one
is the first thing anybody does here — and a Routine is standing work that produces turns in a
transcript and can put an unread mark on a rail row in this very column. Neither is a preference
set once. The tell is the unread mark: nothing behind a *Settings* door should ever be able to
put one there.

**So `Settings` is a third door and it has content of its own.** The machine: which runtimes are
installed and whether a credential is present, ticket 11's four states with ticket 11's remedies
beside them. That screen had no place before — detection was reachable only from inside the hire
dialog, so *is Codex signed in?* was answered behind a decision about an agent the user had not
decided to hire. It is a working surface with a column of its own, and one section in it. A
sidebar with one true item is more honest than four invented ones.

**Two things went while the rail was open.** The hairline under the open team's roster, which
was doing nothing the gap was not already doing and made the roster read as a panel dropped into
the list. And the outlined list row: a list of things — a runtime, an agent, a Routine — is a
**filled** row on `--raised` now, with the hairline spent on hover instead of on every row at
rest. `DESIGN.md` carries both.

## Amendment, 2026-09-11: the flanks share the transcript's ground

At the author's direction, after trying it in the app. The rail, the file sidebar and `.setrail`
drop `--recessed` for `--ground`, so the window is one plane with a hairline at each wall. The
plane step was 1.03 and nobody could see it; the hairline was already doing the separating.
`DESIGN.md`'s *the flank is recessed* is amended in place, and the test a new flank has to pass
is unchanged.
