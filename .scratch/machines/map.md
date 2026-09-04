Label: wayfinder:map

# Machines: where an agent executes, and whether it has a home

## Destination

A locked set of decisions for **the Machine** — the place an agent executes. Today that is always
*this computer, in a git worktree of the team's folder*, and it is a given rather than a choice:
nothing in the app names it, and every screen, rule and refusal was written on top of it.

The map is done when three things are decided together, because they are one thing:

- **the object** — what a Machine is, what grain it hangs at, and whether an AgentProfile gets a
  home of its own;
- **the kinds** — local, a fence on this machine, and a box that is not this one, and what each
  costs in mailbox, workspace, detection, disclosure and trust;
- **the channel** — whether an agent can be addressed outside a team at all, and what a turn
  there is.

It plans; it does not build. The map is done when nothing is left to *decide* before someone
writes that code.

Raised by the author, 2026-09-04, in two parts. First: *"let's debate it's useful that an agent
can be messaged outside a team, UI, UX, use cases, grok bot as reference, how useful this is?"*
Then, having agreed a profile might have a home: *"inside the agents home there could be a map.md
that teach the individual profile that he has more projects. but u must know that later we want a
machine proxy, where u can execute ur agent in a sandbox/ssh/etc."*

That second sentence is why this map is about Machines rather than about a DM. A home for an
agent and a proxy for executing it are the same object seen from two ends.

## What this actually is

Grok Bot is the reference and it is worth being precise about what transfers. Its Bots are
messaged like colleagues, each runs on **its own persistent cloud computer** with a browser,
filesystem and terminal, signs into the user's tools with the user's credentials, learns a
workflow by demonstration and saves it as a scheduled routine, and stops for approval before
sending, publishing, buying or deleting. Bots and group chats share one namespace.

The **ergonomics** transfer. The **architecture** does not, and the reason is one line: their
computer is a hosted VM behind a $300/month subscription, and blobot is local-first with no cloud
dependencies. blobot's equivalent is a place the user already owns.

The deeper difference is the work product. Grok's bots do errands across SaaS apps, so nothing
they make needs a name that survives, so the computer can belong to the bot. **blobot's work
product is a branch in the user's repository**, which is why `blobot/<team>/<agent>` names the
pair: the output is scoped to the pair. That is the constraint every ticket here bends around,
and the map's job is to find out how far it bends before it breaks.

Three of blobot's own decisions already landed at `<team>/<agent>` for the same reason each time
— the AgentWorkspace branch, a Routine's owner, a Handbook's key — with the same sentence written
out each time: *a workspace, a session and a mailbox are what a turn needs, and none of them are a
Team's to lend or a Profile's to hold.* Ticket `01` is where that sentence is either extended or
amended, and it is not to be worked around quietly.

## Notes

**Domain.** blobot is a local-first Electron desktop app that assembles teams from the coding
agents a user already has installed. It provides no inference, stores no credentials and provides
no infrastructure. `CLAUDE.md` has the permanent architectural rules and `CONTEXT.md` the
glossary; both bound every ticket here and neither is renegotiable inside one. `DESIGN.md` is
binding for anything a user sees.

**Skills every session should consult:** `/grilling` and `/domain-modeling` by default.
`/research` for the research tickets. `/prototype` for `12`, where the question is what it looks
like.

**Read before any ticket:** `research/01-external-sandbox-libraries.md` — measurements taken
against real tools on this machine on 2026-08-31, including the one result that blocks the
obvious approach. `absorbed-sandboxing.md` is the framing of the effort this map absorbed and
carries the constraints anything here must hold.

**Absorbed, 2026-09-04:** `.scratch/sandboxing/` no longer exists. Its five tickets are `02`,
`03`, `04`, `09` and `10` here, each carrying an `## Amendment` recording what the wider
destination changed; its research and spec moved with them. The four places in the codebase and
in other efforts that pointed at `.scratch/sandboxing/04` now point at `.scratch/machines/10`.
Check for an `## Amendment` before treating any of those five as final.

**Settled while charting, 2026-09-04** — premises, not decisions to revisit. Each was put to the
author and agreed, or follows from a permanent rule:

- **The destination is the whole Machine abstraction**, not only the home and the DM. The
  author's choice, over the narrower reading in which the machine proxy is merely a constraint
  the home must not break.
- **`.scratch/sandboxing/` is absorbed rather than deferred to.** A sandbox is a kind of Machine
  and the boundary question is the same question.
- **The user brings the box.** blobot never provides, hosts, provisions or pays for
  infrastructure. This rules the whole hosted-sandbox category out on the rules rather than on
  the merits, and it is recorded so it is not re-asked (`research/01` §1).
- **A DM is wanted enough to be worth deciding.** `map.md` exists to serve it: the author's
  proposal is a profile that knows it has more projects, which only means anything if the profile
  can be spoken to.
- **The work product stays a branch.** Nothing here trades the team grain for the bot grain. A
  profile-grain home produces no branch and no pull request, and whatever it is for, it is not
  for that.

## Decisions so far

Nothing yet. The frontier is `01`, `02` and `03` — one grilling and two research, all takeable
now.

## Not yet specified

In scope, not yet sharp enough to ticket. Graduates as the frontier advances.

- **A Routine whose Machine is unreachable when it fires.** *Missed firings* already exist, with
  `Run now` beside them, and a run is already skipped for a Workspace that is gone or a runtime
  that is not installed. An unreachable Machine is a new skipped reason and probably nothing
  more, but a run gets three turns and nobody is watching, which is the condition under which
  every assumption here gets tested first.
- **Compaction and the handoff archive off-machine.** A handoff is archived under
  `~/.local/share/blobot/handoffs/` — deliberately never in the AgentWorkspace, because that is a
  checkout an agent could commit home. Whose home that is when the agent runs elsewhere is
  unexamined, and the handoff travels as text rather than as a path, which is the half that
  already survives the move.
- **Attachments across the boundary.** ADR-0004 embeds bytes rather than linking paths, and that
  decision is immune here for a reason that had not happened yet: a path on the user's machine is
  meaningless on another one. What is not examined is the two ceilings and the fan-out cost when
  the bytes cross a network rather than a pipe.
- **Two agents on one Machine.** If a Machine is per profile or per team, two agents share a
  place. Whether that reintroduces what ticket 10 refused — *never a shared directory* — depends
  on whether the sharing is of a directory or only of a host, and that reads `01`.
- **A Machine whose OS is not this one.** Path shapes, the mono figures in `WORKSPACE`, and
  whether a Windows box is a kind or a variant.
- **Whether a Machine has an identity on screen.** A Team has an icon detected from its Workspace
  and drawn as a sticker on the folder. Whether a Machine earns anything similar, or is a word
  and a hairline, is downstream of `12`.
- **Promoting what is true everywhere.** The `handbooks` map left open whether an entry that
  turns out to be about the person rather than the team can be promoted to standing instructions.
  A profile with a home meets that question from the other side.

## Out of scope

Ruled beyond this destination. These do not graduate; they return only as a fresh effort.

- **Hosted sandboxes and cloud VM providers** — Vercel Sandbox, E2B, Daytona, Modal, Fly
  Machines. Refused on *local-first* and *no cloud dependencies*, and because they would ship the
  user's repository to a third party, which is a much larger version of the leak ADR-0004
  already refuses. Measured and recorded in `research/01` §1 so it is not asked twice.
- **blobot providing a machine.** Same rule, stated separately because it is the thing Grok Bot
  does and the thing this map will be tempted to copy.
- **Sandboxing blobot itself, or the Electron app.** The subject is the agent's process subtree
  and what it can reach. Carried unchanged from the absorbed effort.
- **An approvals system**, or a screen administering what each agent may currently do. Ticket
  14's out-of-scope line, carried: a boundary the user does not administer is one thing, and a
  console for authoring rules is another, and this is still not it.
- **blobot storing an ssh key, a token, or any remote credential.** *No credential storage* has
  one conscious exception on ADR-0005 and it does not extend. Ticket `11` decides how a Machine
  is reached *within* this refusal, not whether to relax it.
- **Sharing an agent, a Machine or a team with another person.** Grok Bot has shareable bot
  links. blobot is one operator on one machine and nothing here changes that.
