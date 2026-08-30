Type: task
Status: needs-triage

# Mode drift is watched, and ignored

## Problem

`#applyPermissionMode` forces `default` after `session/new` and after `session/load`, which is
ticket 14's trap generalized and correct as far as it goes. Nothing re-forces it *during* a
session.

The adapter already sees drift happen. `current_mode_update` is handled at
`packages/core/src/adapters/claude/claude-agent-runtime.ts:390`, assigned to `#modeId`, and the
comment there says out loud that a mode drifting off `default` "is the posture quietly failing".
Then nothing uses it. It is a private field with no reader.

A session can be moved off `default` from inside itself — `/config`, and plausibly others.
Those are off the palette now, which is a menu decision and not enforcement: typing one still
works.

## Why it matters more than it looks

The creation flow's disclosure *tells the user* blobot sets the runtime to prompt. That is a
statement of fact the app makes on its own behalf. When it stops being true the app keeps making
it, and the user's next unattended agent runs under a posture they were told it did not have.

## What to settle

Whether the answer is to re-force `default` the moment drift is seen, or to surface it and let
the user decide. Re-forcing is silent and fights the user if they meant it; surfacing needs
somewhere to put the message, and the status fold is derived rather than a place to keep facts.

Note that `waiting` is already a Status the fold derives from a permission channel, so there is
precedent for the posture being visible in the same vocabulary.

## Done when

The disclosure is either kept true by a mechanism, or the app stops claiming it.
