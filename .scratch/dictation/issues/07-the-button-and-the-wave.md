Type: prototype
Status: resolved (answer 1 amended 2026-09-04)

# The button and the wave

## Question

Two things about the composer, decided on a prototype rather than in prose. **Withdrawn by the
author 2026-09-01: no morph.** DESIGN.md `:527` stands (Lucide only); the button swaps its glyph
(`Mic` to `Square`/`Send`) with nothing in between, and the *listening* state is carried by a mono
word, not by a transition.

1. **Where the mic goes.** DESIGN.md `:451-473`: the pill's head is `+`, its tail is send, and
   the context ring stands beside send as a reading. All three obvious slots are taken. Find the
   place, present only when dictation is enabled and configured.
2. **The wave.** A level indicator beside the button that reacts to the incoming audio so it
   feels like it is listening. This is sustained motion, which `:573` reserves for the blobatar
   — but it is **driven by the user's own voice**, not ambient, and that is the argument to test.
   Monochrome, and no red dot: `:463` spends the one saturated thing elsewhere. **The author wants it.**
   Draw it, feel it beside a blobatar in `working`, and write the DESIGN.md amendment that admits
   it: what makes it not ambient (it is the user's own voice, it starts on their gesture and stops
   on it), its bounds (monochrome, `transform`/`opacity`, bars not a red dot, gone the instant
   recording stops), and what it means so no word has to be repeated by it. `prefers-reduced-motion` applies.

Prototype in the real composer against the mock, screenshot through `--screenshot`. The
resolution names the DESIGN.md sentences it adds or amends; a contradiction is written into
DESIGN.md with its reason, never left as an exception in a component.

## Answer (2026-09-01)

Prototyped in the real composer against the mock and reviewed by the author ("no está mal").
Assets: `../research/07-team-pane.png`, `07-composer-peak.png`, `07-composer-trough.png`;
live with `--demo --screen=dictation [--pane=alice]`, which simulates a spoken-sentence level
envelope with no microphone. The prototype stays in the code behind that flag (a `dictation`
prop on `Composer`, `DictationView`) until ticket 12 connects a real Transcriber to it.

1. **The mic is at the head of the pill, after `+`**, never at the tail: at the tail it shares a
   corner with send and reads as *send my voice*; at the head it is the same kind of door as `+`,
   one that adds to the message. Glyph swap `Mic` → filled `Square` in ink, nothing between.
2. **The wave is four 2px bars in `--ink`** between the stop and the field, `transform: scaleY`
   from the level, no keyframe — so it moves exactly as much as the voice does and reads as four
   dots in silence, which is the honest state. Under `prefers-reduced-motion` the bars hold at a
   third.
3. **The word is above the pill**: `LISTENING · 0:05`, mono, in the `.stranded` line the
   composer already uses to speak about the field; the clock because a recording has a ceiling.
4. **The partial is a ghost in `--muted` after the caret**, in the mirror layer and never in the
   textarea's value; committed text lands through `suggest`.

**DESIGN.md amended** under *Ambient motion*, beside the gaze entry: the wave answers to the
second budget (starts and stops on the user's gesture, driven by their own voice), its bounds
(ink, `transform`, no keyframe, no red dot, still under reduced motion), and its meaning (*this
is reaching me*, said nowhere else). `:527` unchanged: `Mic` and `Square` are Lucide.

For ticket 12: `Wave` takes the renderer's RMS (ticket 04), the ghost takes ticket 06's
`partial`, `suggest` takes its `committed` — but at the caret rather than appended, which is the
one change to `suggest`'s rule that ticket 06 decided and this prototype did not build.

## Amendment (2026-09-04) — answer 1 reversed: the mic is at the tail

**The microphone moved from the head of the pill to the tail, immediately left of send**, at the
author's direction, after living at the head in the real app. Answer 1's reasoning is not
withdrawn and is why this is written down rather than edited over: at the tail the microphone
*does* share a corner with send, and the *send my voice* reading it warned about is real. What
outweighed it is a fact only use produces — **the microphone is the last thing you touch before
you send**, so the hand already on send does not travel the width of the field to reach it, and
`+` is left alone at the head as the one door that genuinely interrupts writing to add something.

Two consequences, both built:

- **The wave is outboard of the microphone**, between the context ring and the button, not
  between the button and the field. Inboard it would push the microphone away from send exactly
  while a recording is running, which is the moment the pair most needs to read as one thing.
- **A `.pillhead` group pinned to the first line was tried the same day and reverted.** It came
  out of the same session: with the microphone still at the head, a field grown to four lines put
  both doors on its *last* line, 57px under the words, and every line of text indented past the
  empty corner. Pinning them to the first line fixed that and cost more than it saved — a pill
  whose controls sit on two lines is two rows of chrome around one field. Everything is `flex-end`.

`DESIGN.md` carries both reversals with their reasons, at the composer entry and at the ambient
motion entry that also said *head*. Nothing else in this ticket changes: the glyph swap, the
word above the pill, the ghost after the caret and the wave's own bounds all stand.
