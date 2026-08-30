Type: task
Status: resolved
Blocked by: 01

# The chip and the bubble

## Problem

`DESIGN.md`'s governing rule is that **the blobatars are the only saturated thing on screen**. A
thumbnail of a user's screenshot is a full-colour rectangle, in the composer before sending and
in the transcript bubble forever after. Three ways out were weighed: a mono chip with a filename
and a size and no image at all; greyscaling the thumbnail the way `RuntimeMark` greys a vendor
logo; or amending the rule.

## Answer

**Thumbnails, in colour, in both places — and `DESIGN.md` is amended to say why.**

> Saturation is blobot's to spend, and it spends it on blobatars. **Content the user supplied is
> not blobot's to desaturate.** An attached image is drawn as itself, in the composer and in the
> transcript. It is the user's own content quoted back to them, not a signal blobot is emitting,
> and the rule exists to stop *blobot* competing with the faces.

A mono chip is the safe answer and it answers the wrong question: the reason to look at a
transcript from last week is to find *which* screenshot you sent, and a filename answers that
badly. Greyscale is worse than either — consistent with an existing exception, and it destroys
the one thing a screenshot of a colourful UI is for.

The amendment is narrow on purpose. It licenses **user-supplied content**, not decoration: no
coloured chrome, no coloured chips, no coloured icons follow from it. The team icon's rule is
unchanged and so is `RuntimeMark`'s — a vendor's logo is still greyed, because that is blobot
choosing to put a brand on screen, and this is a person looking at their own file.

## Saying what a fan-out costs

Issue 01 sends the bytes to every addressed agent. The composer states the total before the send:
three recipients times one 284 KB image is a fact it can carry, and then the decision is the
user's. This is the *"show the cost, do not manage it for them"* half of issue 02's refusal to
resize, and it is the same posture as the gauge in issue 08 — blobot reports, and does not
intervene in a window it does not own.
