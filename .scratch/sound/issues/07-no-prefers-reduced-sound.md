Type: grilling
Status: resolved
Blocked by: 05

# There is no prefers-reduced-sound, so what does blobot honour

## Problem

`DESIGN.md` ends both motion budgets with one withdrawal rule: *everything decorative sits behind
`prefers-reduced-motion`*, no exceptions, with the mono word and the three dots carrying state
alone.

Sound has no counterpart. The CSS media feature does not exist and no platform exposes an
equivalent. So either blobot invents an inference, or it says the switch is the whole
accommodation and means it.

## Answer

**Resolved 2026-08-31. The switch is the whole accommodation. blobot infers nothing.**

### `prefers-reduced-motion` must not be reused

The tempting shortcut is to mute sound when that query matches, on the reasoning that both are
sensory-reduction preferences and one signal is better than none.

**It is wrong, and it is wrong in the direction that hurts.** `prefers-reduced-motion` is set by
people with vestibular disorders, and by people who find animation distracting. Neither has said
anything about audio. Some of them rely on audio *more* precisely because the visual channel is
one they have turned down. Muting the app for them would take the accessible channel away on the
strength of a signal about a different sense.

An inference that is right half the time and silently harmful the other half is worse than no
inference, because nobody can see it happening.

### What blobot does instead

Nothing automatic. The switch in Settings is visible, persistent and remembered, which is Velvet's
own principle honoured literally rather than approximated.

Two mechanical obligations, which are not inferences:

1. **The AudioContext is created on a user gesture and never before.** Browsers and Electron both
   refuse otherwise, and a context constructed at module load is a `suspended` object that plays
   nothing and reports success. Nothing here is allowed to be a silent no-op.
2. **A failure to produce sound is never an error the user sees.** No output device, a suspended
   context, a platform that refuses: the app carries on. Sound is *a bonus layer, never the
   message*, so nothing in the app may depend on one having been heard.

### The consequence worth writing down

Because there is no query to fall back on, **every meaning a sound carries must already be carried
somewhere the eye can find it**, with no exceptions and no partial cases. That is already true of
the twelve in ticket 02, and it is the constraint any thirteenth has to clear:

- `waiting` is the status fold's own word, inverted on the rail row, plus the inline block.
- `allow` / `reject` / `allowAlways` each leave a permanent record in the transcript block.
- `arm` / `disarm` open a block that stays and says `disarmed`.
- `remove` / `purge` report what they did after they run.
- `send` puts the message in the transcript.
- `handoff` rides `context_compacted` and opens inline.

A sound that is the only carrier of its fact is not admissible. This is the audio form of the
withdrawal rule, and it is stricter, because there is no media query to withdraw behind.
