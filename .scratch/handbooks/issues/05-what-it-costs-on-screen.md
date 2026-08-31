Type: grilling
Status: resolved
Blocked by: 03

# What a Handbook costs, under the gauge

## Question

The `CONTEXT` block already draws what blobot itself injects, in estimated tokens, under the
gauge: the peer-message breakdown, the wake batch, and `attachments · 2 · 480 KB · sent this
session`, worded apart because it is the only figure there that is not per-turn. A Handbook is
the second such figure, and it is not per-turn either — it is per session, present in every one.

## What it has to settle

- **The numbers from ticket 03, chosen.** That ticket decides there is a bound and where it is
  enforced; this one picks what it is, against something measured rather than guessed. A real
  Handbook from a real interview is the right evidence, and one can be produced with
  `--live-claude` once ticket 02 has landed.
- **The line's wording.** It is not per-turn, so by the attachments precedent it is worded apart.
  It is also not bytes, unlike attachments, and not a count of anything the user did.
- **What it says when the Handbook is empty.** Probably nothing, on the rule that a zero is
  noise; but an agent whose Handbook is empty is the one case where the user might want to be
  told, since that is the state the whole feature is about. Weigh it here rather than defaulting.
- **What it says as it approaches the bound.** The gauge advises nothing today and that is
  deliberate. A Handbook near its ceiling is different from a context window near its ceiling,
  because the remedy is a person deleting an entry rather than blobot opening a session, and
  there is no machinery that will act on it for them.

## What is binding

The gauge is observation only. DESIGN.md's monochrome rule holds. Nothing here recommends,
warns in colour, or blocks a write — the write is refused at the tool boundary in ticket 03, in
words, to the agent, which is where a refusal belongs.

## Answer

**A sub-row under `persona`, beside `your standing instructions`. Hidden when empty, warning
never. 1,000 and 8,000, provisional, with the calibration written down.** Resolved 2026-08-31 with
the author.

### It is part of the persona, not a separate injection

This ticket assumed a top-level line beside the peer-message and attachment figures. Reading
`Feed.tsx` says otherwise. The block already draws `persona` as a row with **`your standing
instructions` as a sub-row under it**, then `last wake prompt`, `queued`, `blobot's own tool`, and
`attachments`.

A Handbook is not a fourth thing blobot injects. It is **part of the persona**, so it goes where
standing instructions already are: the persona row is the total, and the two sub-rows are the two
parts of it the user owns and can change.

That also means the pair ticket 04 placed adjacent **in the persona** is drawn adjacent **in the
gauge**. One relationship, stated in two places, contradicted in neither.

### The row says `handbook`

No possessive, no entry count.

`your standing instructions` is second person and *your* is load-bearing there: those are words the
user wrote. A Handbook is partly the agent's, so the same possessive would be a small lie in a
column whose whole job is to be accurate about cost.

The **count** lives in the panel, where a person can act on it. The gauge is about cost.

### Hidden when empty

Consistent with both neighbours, which hide at zero (`instructionsChars > 0 &&`,
`attachmentCount > 0 &&`).

The ticket wondered whether an empty Handbook is the one zero worth drawing, since it is the state
the whole feature is about. It is not: **the notice card above the composer already says exactly
that**, in the agent's own pane, unmissably, and it is the invitation. Two surfaces saying
*unbriefed* is one too many, and the quieter one would be the redundant one.

### It never warns, and the reason is not the context ring's

The ring stays monochrome and nothing turns red because **blobot will act**: a full window is
something the session boundary handles by itself.

The Handbook row stays quiet for the opposite reason. **blobot will not act.** The remedy is a
person removing an entry, and the place that carries the number they act on is the panel's foot,
`1,240 of 8,000`, standing beside the entries they would remove. A warning in a column that cannot
be acted from would be an alarm pointing somewhere else.

Worth stating plainly so a later session does not "fix" the inconsistency: two rows in the same
block are quiet for opposite reasons, and both are right.

### The numbers, and how to replace them

**1,000 characters per entry, 8,000 per Handbook. Provisional.**

The sanity check they now have, from ticket 02's live probe: 8,000 characters is roughly 2,000
tokens, and Claude's empty-prompt turn carried a **~36,000-token cached prefix** for seventeen
output tokens. So a completely full Handbook is about **five percent** of what an agent already
pays on every turn. That is a defensible ceiling, and it is the first number in this effort with
anything measured behind it.

**The calibration, as an instruction rather than an intention:** after the first live briefing
interview against a real runtime, measure the Handbook it produced. Move these numbers only if that
measurement contradicts them, and record what it was either way. A guess that survives a
measurement is worth more than a guess replaced by another guess.
