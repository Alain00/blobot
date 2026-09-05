Type: task
Status: open
Blocked by: 07

# What a teammate can still say to you, and how it gets out

## Problem

The guard rail on 07 and 08. Fold a teammate's whole turn and the failure mode is not a cluttered
column, it is **the one line that had to reach the person disappearing into a shut block**.

`partnerWork` already refuses to swallow some of it, and those refusals were argued for
elsewhere. This ticket is to make the list explicit and complete rather than emergent, before the
live path starts consulting it too.

## What must come out, and why

- **An unanswered permission request.** The hardest case and the one `CLAUDE.md` names: an agent
  nobody addressed has no other way of reaching the user, and with nobody listening a request is
  cancelled, never allowed. Folded, the turn stops and the reason is invisible.
- **A refusal.** `end('refusal')` is a turn that ended unusually and left the agent perfectly
  answerable. It is addressed to whoever can act on it, which is not the agent that mailed it.
- **A failure that ends the teammate's turn.** `error` is fatal in this vocabulary and needs a
  restart. A block reading `ran 3 tools` over a dead agent is a false summary.
- **A Routine proposal, and a Handbook write.** Both already open inline in the turn that did
  them, on the grounds that an agent arming or recording something off screen is the version that
  must not exist. That argument does not weaken because a teammate did it.

## What must not

- The teammate's ordinary prose. A reply to the principal is addressed to the principal, and the
  principal's own account of it is what the person reads. This is the whole of 07.
- Its calls, its diffs, its counts.

## The thing to check

Whether any of these coming out **breaks the run** — as a running call does today — or comes out
*without* ending it, the way the principal's own prose is lifted. Breaking the run splits one
turn into two folds with a line between them, which is the failure mode the aside-versus-fold
merge already fixed once. Lifting is almost certainly right and is not what the code does.

## Done when

The list is one exported predicate with the reason on each entry, read by both `runFrom` and the
live path, and a scenario exists in which a teammate raises a permission mid-fold and the block
does not eat it.

## Note, 2026-09-05 — from 07: two of these five are a different mechanism

The list mixes two things and only one of them has somewhere to go.

**Lifted** — out of the block, at the top level beside the principal's answer: an unanswered
permission, a refusal, a failure that ended the teammate's turn. These are public under 07's rule
because the person is the only party who can act on them.

**Visible without being public** — a Routine proposal and a Handbook write. `CLAUDE.md` says both
*open inline in the turn that created them*, in `Compaction`'s collapsed shape. That is a
disclosure **inside** the run, not a lift out of it; the argument was that arming or recording
something off screen must not exist, and a block the reader can open is not off screen. Lifting
them would also put a teammate's bookkeeping at the same altitude as the answer to the question
the person asked.

So the exported predicate is probably two predicates, or one returning which of the two it is.
Say so on each entry, since the reason differs per entry and that is what this ticket is for.
