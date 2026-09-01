Type: grilling
Status: resolved
Blocked by: 05

# Three teams reach waiting at once, and the window is not focused

## Problem

`TeamPool` keeps three teams live and every stream channel leads with a team id, because several
teams stream at once now. So three agents can enter `waiting` inside the same second, and the
notification sound has the fan-out problem that ticket 02 used to disqualify per-turn sound.

Separately: the whole justification for this sound is reaching someone who is not looking. That
means it has to work with the window unfocused, minimised, or behind something else. Which is also
the state where a badly behaved sound is most annoying, because there is no visible cause.

## Answer

**Resolved 2026-08-31. One sound per two seconds, and never for something you can see.**

### The coalescing rule

`waiting` is **debounced across the whole app, not per team**: at most one in any two second
window, regardless of how many teams entered the state.

The count is not encoded. Three teams waiting does not play three times, or play a different sound,
or play a longer one. The sound means *somebody needs you*, and the rail already carries who and
how many, inverted, on the row. Ticket 07's rule applies exactly here: the sound is not the carrier
of the fact.

Two seconds because it is longer than the longest sound in the set plus its tail, so no two
notifications overlap, and short enough that two genuinely separate events a few seconds apart are
still two events.

### Never for what is already on screen

**No sound when the team that entered `waiting` is the open team and the window is focused.**

You are looking at it. The inline permission block is in the transcript in front of you and the
status word is in the column. A sound there is the app telling you something you are already
reading, which is the same claim twice in the same moment, and `DESIGN.md` refuses that shape
elsewhere by name.

This is the rule that keeps the notification honest: it fires **only** in the case that justified
it. Everything else is the visual channel doing its job.

### Unfocused, minimised, hidden: it plays

That is the entire point, so it plays in all three. Web Audio in a renderer is not throttled the
way a timer is, and the sound is short enough that a hidden window's rendering state is irrelevant.

Two boundaries:

- **A closed window plays nothing**, because there is no renderer. This is the same limitation
  Routines already state in one line — *blobot runs these while it is open, it does not run them in
  the background* — and it needs no new sentence, because a permission request needs a running team
  to have been raised at all.
- **No OS notification, no dock badge, no tray.** Those are a different feature with a different
  rule, and `DESIGN.md`'s sentence still forbids them. This effort adds sound and nothing else.

### Interaction sounds need none of this

They are bounded by how often a person can commit an act, which is a bound the person holds.
Ticket 01's split does the work: no debounce, no focus test, no coalescing. If two fire together
the pentatonic set means they do not clash, which is why it is pentatonic.
