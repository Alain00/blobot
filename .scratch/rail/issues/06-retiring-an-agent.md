Type: grilling
Status: resolved
Blocked by: 05

# Retiring an agent, and what goes with its thread

## Question

Retiring is on the agents screen today and removes a definition. With `01`, retiring an agent
also disposes of a Team, a Workspace, a branch, a transcript and possibly a Machine with an 8 GiB
home and a 20 GiB volume, and none of that is what *retire* currently means.

The team-delete flow already answers most of this and the answer is to reuse it rather than
invent a second one: it removes every AgentWorkspace **before** tombstoning the rows because the
branch is `blobot/<team>/<agent>` and the name has to still be true, it prices the full clean
first (`recovers about 3.1 GB`), it reports what it kept, it releases the name, it keeps the
transcript, and Machines' review split working-folder and private-state outcomes so one failure
does not take the other down.

Decide:

- **What the retire dialog says now**, given it is two acts. The agent leaves every team it is on
  *and* its thread is deleted, and those have different costs.
- **Whether the thread can be kept.** A retired agent with a surviving thread is a row for
  somebody who no longer exists.
- **Order.** Memberships first or thread first, and what a partial failure leaves behind.
- **The agent that is on three teams.** Retiring already has to answer this; the thread does not
  change it, but the copy now has to hold both.
- **Whether a thread can be deleted without retiring** — the agent stays hired, the row stays,
  the history and the folder go.

## Answer

Decided with the author, 2026-09-06.

**Retiring deletes the thread, priced first and explicitly acknowledged.** Not a side effect and
never silent: the dialog says the conversation and its folder go, shows what that recovers, and
the user has to acknowledge it before the retire proceeds. Teams are untouched — they keep
running with their workspaces and their conversations, and *ending a team is a separate decision*
stays true of every team the user made. The alternative kept the row alive for a retired agent, on
the grounds that a live conversation must stay reachable; the author took the other side, and it
is the coherent one: a thread is not a team in the user's vocabulary, it is this agent's
conversation, and retiring the agent ends it. What the rule buys is that the rail's contents stay
one sentence — *every hired agent* — with no exception for people who are gone but still have a
folder.

**A thread can also be deleted without retiring**, from the agent row's menu, reusing the
team-delete dialog: the same worktree removal before the tombstone is written, the same full-clean
tick with its priced `recovers about 1.2 GB`, the same independent reporting of what was kept.
That ordering and that pricing were bought expensively in the Machines review; what changes here
is the noun in the copy. It is the one destructive act in this map that is genuinely undoable —
the agent stays hired, the row stays, and saying hello makes a new thread.

**A deleted conversation does not come back, and the dialog says so.** The Team is tombstoned and
its transcript kept but unreachable, and the next message makes a new thread with a new folder.
Reattaching the tombstone instead would make deletion mean *hide* while the folder was gone
anyway, so the returning history would reference paths that no longer exist.
