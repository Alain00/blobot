Type: grilling
Status: open
Blocked by: 01

# Routines belong to `<chat>/<agent>`, and a Routine may have a Chat of its own

## Question

A Routine belonged to `<team>/<agent>` because a turn needs a session, a mailbox and an
AgentWorkspace, and those were the Team's. They are the Chat's now, so a Routine belongs to
`<chat>/<agent>`. The author added one thing from Codex's automations: **a Routine can have a
Chat of its own**, separate from the DM, where every run lands, so a daily run never pushes the
DM's conversation off its line. Decided while charting.

Decide, with the author:

- **What a Routine's Chat is.** A Chat with one member, made when the Routine is, named after
  it, whose roster cannot change, which holds its own session and (for an anchored Agent) its
  own AgentWorkspace on `blobot/<routine-chat>/<agent>`. Is it deleted with the Routine, or kept
  as history and the Routine merely disarmed? Recommendation: kept until the Routine is
  deleted, then deleted with it, priced like any Chat.
- **Choosing.** When a person writes a Routine, is *its own chat* the default or an option
  beside *in the DM* / *in this group chat*? When an Agent proposes one with `propose_routine`,
  which does it get? Recommendation: own chat by default for both; a Routine in a group chat is
  the exception a person chooses, since a run there reaches every member.
- **The unread mark.** It was earned by origin and drawn on the rail row already there. A
  Routine's Chat is a rail row of its own, so the mark lands there. Does the DM say anything?
  Recommendation: nothing; the row is the whole disclosure.
- **Runs and budget.** Three turns a run, a permission that expires, missed firings, the
  three-strikes disarm: all unchanged. Confirm nothing in `Scheduler.due` or `RoutineRunner`
  needs to know the Chat's kind.
- **The Routines screen.** Still one list, now keyed `<chat>/<agent>` with the DM as the common
  case. What the row says when the Chat is the Routine's own.

The answer amends `.scratch/routines/` by name and the Routine paragraph of `CONTEXT.md`.

## From ticket 01, 2026-09-03

The word for `<chat>/<agent>` is **Member**, and a Routine belongs to one. A DM's slug is `dm`
and a Chat's slug never changes, so a Routine's own Chat needs a slug of its own too. Skipped
reasons gained *the Member is gone* and *the anchor is missing* in place of *no agent on the
roster* and *a Workspace that is gone*.
