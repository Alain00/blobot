Type: prototype
Status: resolved
Blocked by: 01

# The vocabulary: what makes a sound, and what each one means

## Problem

A list of sounds is not a design. If every event gets a bespoke noise the set has no grammar, and
a user learning it has twelve unrelated things to memorise rather than one system with twelve
instances. The app already refuses this elsewhere: status is a shape **or** a word and never both,
the three transcript voices are three and not five, the schedule is three shapes and never an
expression.

So: which events, and what is the grammar that makes them one set.

## What exists to build on

Velvet UI's four moments — state change, notification, confirmation, failure — and its one
mechanical claim: **positive states rise in pitch, negative states fall.** That is a real
convention and free to honour.

`orchestrator/bounds.ts` is the precedent for the shape of the answer: a small closed set, stated
in the interface, refused rather than silently extended.

## Answer

**Resolved 2026-08-31, by listening to `prototype.html` rather than by argument.** Twelve events,
one pitch set, three grammatical rules. The author's verdict on hearing them: *"i like all the
sounds."*

### One pitch set

`D3 146.83 · D4 293.66 · F4 349.23 · G4 392 · A4 440 · C5 523.25 · D5 587.33 · E5 659.25`

Pentatonic, so two sounds landing in the same moment never produce a dissonance. That matters
because this app has fan-out: several things genuinely can happen at once, and a set that only
sounds correct in isolation is a set that sounds broken exactly when the app is busiest.

### Rule one: yes and no are one interval, not two sounds

`allow once` rises a fifth, A4 to E5. `reject` falls the same fifth, E5 to A4. One shape, mirrored.

This is the audio counterpart of the app having exactly one inversion on the whole page. A user
who learns either one has learned both, and a falling fifth is *informative rather than punitive*
without needing a buzz, a dissonance or a second timbre to say so.

### Rule two: a repeated note at a whisper means a standing rule was written

`arm a Routine` rises G4 to C5, then says G4 again at a third of the gain, 340ms later. The echo
**is** the schedule: a thing that will happen more than once.

`allow always` takes the same grammar: the allow rise, then its last note again at a whisper. Both
write a standing rule the user will live with after the moment passes, and they earn the same
suffix. `allowed` and `allowed_always` are separate values in `PermissionOutcome` precisely
because they are not the same record of what happened, so they must not be the same sound.

`disarm` is the arm rise reversed **with the echo removed**, because the echo was the part that
meant it recurs. Removing it is the statement.

### Rule three: consequence goes down and takes longer

`delete a team` is three falling notes, A4 F4 D4, with a longer tail. `delete and full clean` is
that plus D3 under the tail.

The purge is the only unrecoverable act in the app and the only place the range goes below
everything else. This is the one sound in the set that is allowed to be the biggest, and it is
matched to a dialog that already prices what it destroys before it runs.

### The twelve

**Interaction** (a committed act, never a navigational one):

| event | shape |
| --- | --- |
| `send` | one note, D5, the shortest thing in the set |
| `allow` | A4 to E5, up a fifth |
| `allowAlways` | that, then E5 again at a whisper |
| `reject` | E5 to A4, down a fifth |
| `arm` | G4 to C5, then G4 at a whisper |
| `disarm` | C5 to G4, no echo |
| `remove` | A4 F4 D4, falling |
| `purge` | that, with D3 under the tail |

**Notification** (blobot acted):

| event | shape |
| --- | --- |
| `waiting` | C5 to D5, a step |
| `waitingPatient` | the same step, wider, said twice — an **alternative** to `waiting`, never an addition |
| `handoff` | D5 to G4, the quietest thing in the set |

**Navigational**, built and off: `hover`, `key`, `popover`. See *What is refused*.

### Why `send` survives despite being the most frequent

It is the one committed act whose completion nothing else reports once the eye has moved. The
composer clears, but you are already looking at the transcript. It is therefore the shortest and
quietest sound in the set, which is the price of keeping it.

### What is refused

**Navigational sound**: hover, keystroke, panel open. Built into the prototype and switched off,
so the argument can be *heard* rather than asserted. The session simulation is 8 sounds in 25
seconds with them off and about 65 with them on, and the density strip draws both.

The precedent is not a matter of taste. `DESIGN.md` refuses the composer's `@mention` list its
open animation on frequency grounds alone, and that list opens silently. Frequency is a harsher
disqualifier for sound than for motion, because a sound cannot be looked away from.

**Per-turn sound** — an agent finished, a tool ran. One prompt to four agents ends four turns, and
this is exactly the failure the ambient motion budget exists to prevent. It is also unnecessary:
the whole design already makes turn completion legible without interrupting.

**A Routine firing.** Argued and refused. The rail's unread mark is *earned by origin*, which is
the sentence that decides it: a turn you did not start is marked, not announced. A sound at 09:00
on a machine you are using for something else is precisely the interruption ticket 01 named as
worth protecting.

## Comments

`handoff` is armed by default and is the weakest member of the set. It reports rather than
requests, and ticket 01's own logic says a notification that asks nothing of the user is the
hardest to justify. It is left armed because the author said all of them, and flagged here rather
than silently dropped. If one sound comes back out, it is this one.
