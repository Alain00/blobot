Label: wayfinder:map

# Sound: the first channel that reaches past the window

## Destination

A locked set of decisions for **interface sound in blobot**: what makes a sound, what it means,
what it sounds like, what is on by default, where it is switched off, and what the one rule it
contradicts becomes instead.

The map is done when nothing is left to *decide* before someone writes that code. It plans; it
does not build.

**Not reached.** Five tickets are resolved, five are open. The frontier is ticket 06.

Raised by the author, 2026-08-31, from <https://velvet-ui-eight.vercel.app/>: *"i want to
implement the sounds, what do u think?"*, then *"i thinking of interaction, and notification, a
button click, is either user interaction or notifications"*, then, having listened: *"i like the
crisp, mid-low volume"* and *"i like all the sounds, but make them in a way we can quick toggle
them later"*.

## What this actually is

Sound is a **fourth channel**, and this app has spent the other three deliberately. Colour means
identity and is spent only on blobatars. Motion means status and is spent only on the blobatar's
one ambient loop, with a second budget for things that run once because a person just acted.
Contrast is the attention channel and is spent almost never. Every one of those rules exists
because the channel is scarce and a second claimant makes the first one quieter.

Sound has the same scarcity property and one thing none of the others have: **it reaches a person
who is not looking at the window.** That is the whole of what it adds and the whole of what makes
it dangerous.

The author's own split is the frame this map is built on, and it is better than the one the first
session used. Every candidate sound is either:

- **interaction** — you did something, so the sound cannot interrupt you, by definition; or
- **notification** — blobot did something, so it can.

Those are not two flavours of one feature. They are two features with different rules, different
defaults, and different relationships to the rule below.

## The rule this contradicts

`DESIGN.md`, in the Routines bullet: *blobot still never interrupts: no notification, no badge, no
sound.*

Binding, per `CLAUDE.md`, and contradicting it is a reopen rather than a quiet edit. Ticket 01
settles what it actually forbids and ticket 05 drafts what it becomes. Read both before writing a
line of audio code.

## Notes

**Domain.** blobot is a local-first Electron desktop app that assembles teams from the coding
agents a user already has installed. It provides no inference and stores no credentials. See
`CLAUDE.md` for the permanent architectural rules and `CONTEXT.md` for the glossary. `DESIGN.md`
is binding for anything a user perceives, and this effort is the first to argue that *perceives*
was always the right word and *sees* is what the file happens to say.

**The prototype is the artifact.** `.scratch/sound/prototype.html`, opened in a browser. Every
sound in the vocabulary, synthesized live through Web Audio with no files and no dependency, three
voices, per-event switches that persist, and a twenty five second simulation of an ordinary
working session at real cadence with a density strip drawn under it. Tickets 02, 03 and 04 were
resolved by listening to it, not by argument, and any ticket that reopens them should be listened
to the same way.

**Skills to consult:** `/grilling` on 07 and 08. `DESIGN.md` on everything.

## Decisions so far

- **01 · Two budgets, and 1031 only ever meant one of them.** Interaction sound slips past *never
  interrupts* on the word itself; notification sound does not and needs the amendment.
  `issues/01-two-budgets.md`
- **02 · Twelve events, one interval, and the echo means it recurs.** Yes rises a fifth, no falls
  the same fifth, a repeated note at a whisper means a standing rule was written.
  `issues/02-the-vocabulary.md`
- **03 · One voice for the whole app: crisp, at a low level.** A second timbre would be a fourth
  channel inside a fourth channel. Duration buys attention, never volume.
  `issues/03-one-voice.md`
- **04 · Thirteen switches persist, three switches ship.** The state is one flat map of event id to
  boolean, unkeyed by team or agent, because sound is a property of this machine and this person.
  `issues/04-every-sound-switchable.md`
- **05 · What 1031 becomes.** Drafted, not yet applied to `DESIGN.md`.
  `issues/05-the-amendment.md`

## Fog

Open, in frontier order:

- **06** where the mute lives, what the default is, and what a first run hears
- **07** there is no `prefers-reduced-sound`, so what does blobot honour
- **08** three teams reach `waiting` at once, and the window is not focused
- **09** the seam: where the player lives and what it must never know
- **10** demo mode, screenshots and tests must be silent

## Not yet specified

Beyond this destination, not blocking it:

- Per-agent voices. Refused on sight by ticket 03, but it is the obvious next ask and the reason
  it is refused should be re-read rather than re-derived.
- Anything on a device that is not this machine. A push notification is a hosted service and
  `CLAUDE.md`'s first rule forbids it.
- Speech of any kind. blobot provides no inference and a synthesized voice reading an agent's
  message is a different product.
