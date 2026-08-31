Type: task
Status: open
Blocked by: 03, 04

# What a Routine does when nobody can answer an MCP prompt

## Question

The sharpest version of the complaint is not the interactive one. It is:

> an agent asked to audit an ads account **on a schedule** dies on its first tool call, having
> done nothing.

`.scratch/routines/` decided that a permission raised by a run **expires**, *because nobody is
watching*, and `first-demo/14` decided that with nobody listening a request is **cancelled, never
allowed**. Both are right and neither was written with an inherited MCP server in mind: they were
written about `rm` and `chmod`, where cancelling is obviously correct.

For an MCP read the same rule produces a Routine that can never do anything useful with the
user's tooling, and -- worse -- one that **looks like it ran**. Three turns, no output, an unread
mark on the rail.

## What to build once 03 and 04 land

- **The vouch list applies to a Routine run.** It is per agent and stored, so a Routine firing at
  02:00 uses the same list the user filled at 14:00 by answering. That is most of the fix and it
  falls out of 03 for free.
- **An expiry that says what expired.** A run whose turn ended on an unanswerable permission
  should say so in the transcript in the same register as `turn stopped · the context window is
  full` -- which is the precedent for naming a stop reason in words rather than a protocol enum.
  Not `Tool use aborted`.
- **Whether an unanswerable permission should end the run at all.** Three turns is the budget; a
  cancelled tool call may leave two of them to spend on an agent that has already lost the thing
  it was asked to do. Cheaper to stop.

## Not in scope

Letting a Routine widen its own vouch list. An agent may propose a Routine and it is armed when
made (`routines/05`, amended), but everything an agent still may not do is untouched, and
vouching for its own next tool call is squarely on that list. **A vouch list is filled by a
person answering a prompt, and by nothing else.**
