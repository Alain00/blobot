Type: task
Status: resolved
Blocked by: 01, 02

# What the gauge says about something with no characters

## Problem

`UiInjection` is five character counts, and the pane says it is estimating tokens from them. An
Attachment breaks that twice: it has no characters, and its token cost is a function of its pixel
dimensions that belongs to the provider — blobot cannot compute it for a runtime it is
deliberately ignorant of, and there is no way for it to ask.

There is a sharper problem underneath. Everything `UiInjection` counts today is **per-turn**: the
persona is cached, the wake prompt is composed fresh each time. An Attachment is not. Once sent,
it is in that session's history **for the life of the session**. One 3 MB screenshot is a
permanent resident of Alice's window, and nothing on screen would say so.

## Answer

**Bytes and a count, never tokens, and the wording says `sent`, not `this turn`.**

    attachments · 2 · 480 KB · sent this session

The wording is the whole decision. It is the only line that tells the truth about something that
never leaves, and it sits under the same gauge as figures that all mean the opposite.

Estimating tokens from pixel dimensions was rejected: it would put a provider's arithmetic in
core — the exact knowledge the adapter boundary exists to keep out — to produce a number that
would still be wrong. Saying nothing at all was rejected too: the runtime's own `usage_updated`
would still show the window filling, so the gauge stays truthful, but blobot's one *permanent*
contribution would be the only one it declines to name.

The rule underneath is unchanged and this is consistent with it: blobot does not compact, does
not truncate, and does not manage the window. It reports what it put there.
