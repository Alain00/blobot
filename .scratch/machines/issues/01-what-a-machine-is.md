Type: grilling
Status: open
Blocked by: 13

# What a Machine is, and what grain it hangs at

## Question

There is an object in blobot that has never been named because it has never had more than one
value: **the place an agent executes**. Today it is always *this computer, in a worktree of the
team's folder*, and every decision in the app has been taken with that as a given.

Name it, and decide **what it hangs off**. Everything else on this map resolves differently
depending on the answer, and every one of the three candidates is defensible.

- **Per AgentProfile.** The Grok Bot shape: the agent has a computer, projects are things it
  reaches into. Makes the DM coherent, makes `map.md` a natural inhabitant, and gives standing
  instructions and archived handoffs the home they have never had. Fights the branch: a worktree
  of *the team's* Workspace cannot live in a place that belongs to the person and not the work.
- **Per Agent — the `<team>/<agent>` pair.** The grain the AgentWorkspace branch is already
  named for, the grain a Routine belongs to, the grain a Handbook is held at. Three prior
  decisions have landed here for the same reason each time: *a workspace, a session and a
  mailbox are what a turn needs, and none of them are a Team's to lend or a Profile's to hold.*
  Costs the DM its home unless the profile gets a **second**, lesser one.
- **Per Team.** The Workspace is already the Team's, so the Machine following it is the smallest
  change. Costs the per-agent isolation that AgentWorkspaces exist to provide: three agents on
  one box is closer to the shared directory ticket 10 refused than three worktrees are.

## What must come out of it

1. **The noun**, and its entry in `CONTEXT.md`. *Machine* is the working name and is not
   defended; it may be the wrong word for a thing that is sometimes a directory.
2. **Whether a home and an execution location are one object or two.** The strongest case for
   splitting them: an AgentProfile can have a *home* (a directory of its own, holding `map.md`
   and its standing instructions) without that home being *where it executes*, and a DM could
   run on the local Machine in that directory. If they are one object, `local` is a Machine kind
   and the home is what it is made of. This is the crux and it is worth taking slowly.
3. **Whether an AgentProfile gets one at all.** If the answer is no, ticket `06` and ticket `07`
   both collapse and the map is smaller. That is a legitimate outcome.
4. **What happens to the existing grain rules** if the answer is not the pair. ADR-0001's
   reasoning would need amending rather than working around, and this ticket is where that is
   done or refused.

## The prior it must engage with, not route around

ADR-0001: *"almost nothing about a working agent is shareable"* — a workspace, a session, a
status and a mailbox are all per pair, and the runtime process cannot be shared "without merging
two repositories' contexts into one head, which is exactly what the permanent rule ... exists to
prevent." A Machine per profile is a shared *place* for an agent on three teams. Say precisely
what is shared and what is not, because "a directory" and "a running process" have very
different answers, and the ADR was written about the second.

## Not this ticket

Where a Workspace lives when the Machine is not this one (`05`). What is in the home (`06`).
What may be done in a DM (`07`). Those all read this answer.

## Amendment, 2026-09-04 — this ticket no longer owns the location question

Two tickets were added after this one was written and they take half of it away.

**`13` owns the location question.** Whether remoteness is *a place blobot executes into* or *a
blobot instance the client attaches to* is a fork this ticket assumed away, and it decides what
the unit even is before anyone can ask what grain it hangs at. If `13` answers **instance**, then
the candidates below are the wrong three: the question becomes what a **server** owns, the store
split is the whole of it, and "per profile / per pair / per team" is asked about a server's
contents rather than about a Machine. Read `13`'s answer first and re-read the three candidates
against it.

**`14` owns the composition question.** Per-agent config, MCP servers and skills is a third axis
that is per agent under **both** of `13`'s models, so it does not belong here and does not wait
on either. It also has the easiest grain answer on the map, and that is a warning rather than a
comfort: it is easy because it sits where the AgentWorkspace, the Handbook and the Routine
already sit, and the temptation is to let it decide this ticket by resemblance.

**What is left here is the part neither of them takes**: the noun, whether a *home* and an
*execution location* are one object or two, and **whether an AgentProfile gets one at all** —
which is what `06` and `07` are waiting on and the only reason those two tickets exist. If the
answer to the third is no, both collapse and this map is materially smaller.
