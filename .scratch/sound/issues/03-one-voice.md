Type: prototype
Status: resolved
Blocked by: 02

# One voice, and why a quiet notification is longer rather than louder

## Problem

Velvet UI ships three voices — signature, velvet, crisp — and invites you to pick. Picking is easy.
The question underneath is whether blobot gets **one** voice or more than one, and that is a
channel decision rather than a taste decision.

There is a real pull toward two. Interaction sound and notification sound have opposite jobs: one
must not claim attention, because you already know what you did; the other must claim it, because
you are not looking. A single timbre serving both is an assumption, not an obvious truth.

## Answer

**Resolved 2026-08-31, by listening.** One voice. `crisp`, at a low level. The author's words:
*"i like the crisp, mid-low volume."*

### The voice

A triangle at the fundamental, a sine at the third harmonic at 0.16, a 2.4kHz-highpassed noise
transient at 0.16 of the note's gain lasting 20ms, all through a lowpass at 8.2kHz with Q 0.9.
Attack 1.2ms, decay 85ms. Default level 0.32.

Everything is **synthesized at play time**, never a file. That is Velvet's *never identical twice*
and it is also the right answer for this repo for three unglamorous reasons: no asset to ship, no
licence to track, and nothing to load before the first sound can play. Each note is jittered ±1.2%
in frequency, ±16% in gain and ±10% in its offset within the sequence, so the twentieth `send` of
the day is not mechanically identical to the first.

### One voice, and the reason is the governing rule

A second timbre would be **a fourth channel inside a fourth channel**. blobot has spent colour on
identity, motion on status and contrast on almost nothing, each time on the argument that a
channel with two meanings has none. Timbre carrying *which category is this* would be that mistake
made a fourth time, and it would be the first one made without a screen having been wrong first.

Category is already carried, three times over: by what you just did, by where the sound falls
relative to your own action, and by the pitch grammar in ticket 02. A user who cannot tell an
`allow` from a `waiting` is not helped by a different oscillator.

### The real finding: duration buys attention, volume does not

`crisp` is excellent for interaction. 85ms, bright, gone before you have finished the click. It is
the worst possible choice for `waiting`, which has to reach somebody in another chair: 85ms of
quiet bright is easy to miss entirely.

The reflex fix is to make it louder. **That is refused.** A notification that is the loudest thing
in the app breaks *quiet by design* and makes sound the one channel that outranks everything in an
interface whose governing rule is that almost nothing may pull the eye.

The fix is **duration**. `waitingPatient` is the same two notes with a wider gap, then the pair
again a second later at half gain. Same voice, same interval, same level, more time. It is
noticeable across a room and still quiet next to your keyboard, which is the property that was
wanted and the one volume cannot give.

Both are in the prototype so the choice is made by ear. **They are alternatives and never both**,
which the prototype enforces by leaving `waitingPatient` out of its `ALL` preset.

### What is refused

**Per-agent voices.** The obvious next ask, and it is the governing rule again: an agent's identity
is its blobatar's colour and its face. Giving identity a second channel takes it from the first
one, and eight agents on two teams is eight timbres nobody can name.

**A voice picker in the app.** Three voices in the prototype exist to make one decision once. The
other two do not ship. A setting here would be blobot asking the user to do design work.

**Level as a user-facing slider.** Left to ticket 06, but noted: the prototype has one because
tuning needs one, and shipping it is a different question from having built it.
