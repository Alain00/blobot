Type: grilling
Status: open
Blocked by: 05

# Cards: the closed set of blobot's inline blocks

## Question

The author wants creation to open a chat with "un artifact estilo form" and trust to "salir con
un artifact al necesitar el primer permiso". blobot already draws inline blocks in the
transcript: the permission request, a Routine proposal, the compaction handoff, a Handbook
write. These are one thing, and the word for it is **card**, chosen so it never collides with
an agent-authored artifact (out of scope). What is the set, and what is a card allowed to do?

Decide, with the author:

- **The set.** Enumerate: creation (define the Agent: face, colour, role, purpose, anchor,
  standing instructions), permission (once / always / reject, plus *raise to trusting from the
  next session*), Routine proposal (arm / disarm), Handbook write, identity rewrite (ticket 05),
  compaction handoff, anchor confirmation. Anything else? Is the `WORKSPACE`/`CONTEXT` gauge a
  card or a fixture?
- **Who opens one.** blobot, in a turn (permission, disclosure) or at a moment (creation). Never
  the Agent directly: an Agent calls a tool and blobot decides whether that is a card.
- **What a card may take.** Text fields, pickers, buttons. It is a *form in the transcript*, and
  the transcript is three voices (user, agent, system) plus these. Does a card have a voice of
  its own, and what does its answer look like once given: does the card fold into a line (the
  way a Routine proposal does) or stay open?
- **Where the answer goes.** A creation card's answers are the definition; a permission card's
  answer is a `PermissionOutcome`; an identity card's *revert* is an edit. None enters the
  `messages` row as user text. Confirm.
- **Trust on the first permission.** The first permission request on a `normal` Agent carries
  the offer to raise the level from the next session. Only the first? Every one until raised?
  Recommendation: every one while the level is `normal`, worded once, small.
- **Compaction card.** Today's handoff block plus, per the author, the threshold "modificable en
  la UI de una forma que me imagino": leave the how to ticket 15, decide only that the card
  says the threshold and links where it is changed.

The answer is the enumerated set with each card's fields and outcome, and the glossary entry.
Look, not yet: ticket 16 draws them.

## From ticket 01, 2026-09-03

Two cards the model now needs, to be enumerated with the rest: the **re-anchor** card a DM shows
when the anchor is **missing** (choose another folder, or let blobot make one), and the sentence
on the **creation** card that the runtime cannot be changed afterwards. The Avoid list in
`CONTEXT.md` now names *artifact* with *card* as the word.

## From ticket 02, 2026-09-03

The delete-Agent dialog carries two ticks: the priced full clean (as today) and **keep its
folder** for a made anchor, with the folder's size beside it. The delete-group-chat dialog carries
the first. Whether these are cards in the DM or dialogs over it is ticket 15's call on the word.
