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
