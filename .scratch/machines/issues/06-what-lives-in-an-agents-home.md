Type: grilling
Status: open
Blocked by: none

# What lives in an agent's home, and what map.md may say

## Question

Raised by the author, 2026-09-04: *"inside the agents home there could be a map.md that teach
the individual profile that he has more projects."*

The proposal is good and it is the wayfinder pattern this repo already trusts: an index read to
judge relevance, then zoom only into what the task touches. A profile that knows *she is on three
teams, one is a Rust service, one is a folder of documents, she leads on the third* is **compact
context**, which is the permanent rule, rather than the full copy the rule forbids.

**But a map is a document blobot writes into a place an agent can read, and this repo has
refused that shape twice** — `first-demo` ticket 14 refused a settings file in an AgentWorkspace because a
file left in a checkout can be committed home, and ADR-0004 refused handing an agent a
`resource_link` to a path because `Read`, `Glob` and `Grep` never prompt, so a path handed to an
agent is an ungated read. A `map.md` that names `/home/alain/work/acme-api` is that second
refusal, authored by blobot, in blobot's own file.

## What to decide

1. **Names or paths.** The obvious rule is that a map carries names and never paths, and it
   should be tested rather than adopted: an agent told about a project it cannot locate may go
   looking, and a coding agent that goes looking is `Glob` across a home directory. Establish
   whether a name is safe on its own, or whether the safety has to come from the Machine (`04`)
   rather than from the wording.
2. **What else the map may carry.** Team names, roles, who the teammates are, what the Workspace
   is *about*. Almost certainly not: transcripts, Handbook entries, diffs, or anything from
   another team's turn — that is the leak the team grain exists to prevent, and it is the one
   thing that must not follow from a profile-grain home.
3. **Who writes it and when.** Composed fresh from the live status fold, like `composeLeadBrief`,
   or a file maintained on the disk? The first is honest by construction and has no staleness;
   the second is what the author proposed and is what survives if the home is where the agent
   executes, because a file is readable and a composed prompt is not.
4. **What else lives there.** Standing instructions currently live in a SQLite column and are
   authored alone in a text field. Handoffs are archived to `~/.local/share/blobot/handoffs/`,
   which is nobody's home in particular. Both are candidates and neither has to move.
5. **Whether an agent may write to its own home.** `record_entry` writes a Handbook, disclosed
   inline, bounded, provisional. A home an agent can write to freely is the *"rewriting its own
   persona off screen"* refusal in a new location, and the narrowing that ticket 10 of
   `handbooks` allowed (withdraw your own `noticed` entry, never a `told` one) is the shape any
   yes here should take.

## The precedent that decides most of it

`composeLeadBrief` is this exact problem solved once already, one grain down: what a lead knows
about its teammates is **composed fresh every turn because it *is* the live status fold**, it
replaces the roster line rather than doubling it, and it never enters the `messages` row. If
`map.md` can be that, it inherits an argument that has already been made and tested. If it must
be a file, say why, because the difference is whether staleness is possible at all.

## Amendment, 2026-09-04 — after ticket 01: two objects, and one narrowing

Ticket `01` is resolved and this ticket reads it. What it decided that bears here, in its own
words: **a home and a Machine are two objects.** A home is the AgentProfile's — its `map.md`, its
standing instructions, its archived handoffs — and where a turn runs is the Agent's: one Machine
per Agent, placed per Agent, never per AgentProfile. The map's founding sentence, *the same object
seen from two ends*, is withdrawn, and `CONTEXT.md` now says it under **Machine**: *a Machine is
not a home; what an AgentProfile keeps for itself across teams is a different object.* So **the
home is not where anything executes.** Nothing runs in it, no Session is bound to it, and no
AgentWorkspace is under it.

That settles the premise and none of the questions. The five under *What to decide* stand, with
one change to how the third of them — *who writes it and when* — reads. Its second option, a
file on disk, was argued as *what survives if the home is where the agent executes, because a
file is readable and a composed prompt is not*. The home is never where the agent executes, so
that clause has lost its premise: a file can still be the form the home takes on disk, but *the
agent runs there and can read it* is no longer a reason available to it. The questions are
restated and renumbered at the end of this amendment; the numbers there are the ones a resolving
session uses, and this paragraph is the last to use the original ones.

**The one narrowing: a `map.md` is never a file inside a box's volumes.** Ticket `01`, point 5,
gives a box a closed list — a *data* volume holding the CLI's own login and state, a *workspace*
volume holding the AgentWorkspace as a clone, the operator's `~/.claude/skills` read-only, one
door to the mailbox, egress through the host proxy, and **nothing else**. A home is on none of
those, and the closed list is the refusal on its own: it ends in *nothing else*, and a home mount
is something else. What follows says why each place on the list would refuse it anyway, so the
list is not the only reason a later session can find:

- The volumes are the Agent's, one instance per Agent, and a home is the AgentProfile's. Mara on
  three teams would have her home mounted into three boxes at once. What is shared there is not
  her *definition* — ADR-0001 says outright that the definition is what a second team reuses, and
  standing instructions apply on every team by design — it is a file three running agents can
  reach, and the moment any of the three can **write** to it, it is a channel between their
  contexts: ADR-0001's *merging two repositories' contexts into one head*, through a file rather
  than a process. That is a reason about writability and not about reach, and the difference is
  load-bearing. The git-aware rule's *never a shared directory* (`CLAUDE.md`; first-demo ticket
  10's worktree ruling) is a rule about the **AgentWorkspace**, and read as a rule about reach it
  would refuse the read-only skills mount too, which three boxes reach at once, which ticket `01`
  allows, and which this amendment endorses two bullets down. So it is not the authority here.
  Neither is ticket `01`'s point 4: that extension of ADR-0001 keeps a *box* from being shared —
  *a host was never on that list because the box is per pair* — and says nothing about a mount.
  What keeps a home mount out of a box is point 5's *nothing else*; what makes a writable one a
  leak is ADR-0001. `research/05` (d) makes the same stretch this amendment's first draft made —
  *the market's per-user shared computer is what ticket 10's* never a shared directory *refuses* —
  so the stretch is inherited and not invented here. Cite ADR-0001 and point 5 for it, not ticket
  10, or a later session will read the rule as refusing a read-only mount that ticket `01` permits.
- The workspace volume is a checkout. A file left in one can be committed home, which is the
  first refusal in the question above (ticket 14's settings file) at a second location.
- The data volume is the CLI's own state, and a file placed there is read by `Read`, `Glob` and
  `Grep` without a prompt, which is the second refusal above (ADR-0004) with blobot as the author.
- The skills mount exists so that ADR-0003 stays true — the operator's own skills load inside a
  box as they do outside — and it is read-only *so that the mount cannot become the path by which
  one agent widens what the next may do*, which is ticket `01`'s own sentence at point 5 and,
  before that, the reason `/allowlist` is refused in fx's palette (`CLAUDE.md`). A writable home
  mounted beside it would be that path, with `map.md` as the file that travels.

The same rule holds on `local`, where nothing enforces the closed list, and the reason there is
not a symmetry between the kinds. On `local` a home file is an ungated read — ADR-0004's own
fact, set out in the next paragraph — so a file is the wrong channel on this computer on its own
account, and not because a box refuses it. First-demo ticket 14's *a guarantee that holds for
Alice and not for Bob is worse than no guarantee* is the **second** refusal and not the first: a
home that reaches Alice on this computer as a file she can open and Bob in a box as nothing is
that shape, but the rule is about a posture guarantee the user generalises, and ticket `12`'s
amendment, §4, has already ruled on this map that borrowing it for a likeness between kinds *is a
symmetry preference and not first-demo 14's rule*. Question 5 below says the same of the write
half. The channel is one channel on both kinds because the one channel that is honest on each
turns out to be the same one, which is what the next paragraph establishes, and not because the
kinds must match.

**So if a home exists, it lives on this computer, in a place blobot owns and never in an
AgentWorkspace** — the refusal that put the handoff archive under
`~/.local/share/blobot/handoffs/`, *a checkout an agent could commit home*, and nothing more than
that refusal. Be precise about what the location buys, because on `local` it buys no fence: an
agent on this computer reads that directory with `Read`, `Glob` and `Grep` and no prompt, which is
ADR-0004's own fact, and on Claude writes to it with a `Write` that
`adapters/claude/permissions.ts` vouches at every path from `normal`. The handoffs went there to
stay out of the repository, not because an agent cannot reach them, and the same is all a home's
location can claim. What keeps a home out of an agent's hands is the channel: **it reaches an
agent as composed context, or not at all.** The precedent is the one the section above already
names: `composeLeadBrief`, composed fresh, replacing a line rather than doubling it, never
entering the `messages` row, and carrying no path. That is the permanent rule's *compact context*
in the only form that is the same on `local` and on a `box`, and it is the form that survives the
constraints ticket `01`, point 8, carries for the kinds out of scope: composed text rides the
prompt, which reaches an agent on every kind by construction, and a mount reaches it on one. It is
also how the handoff already travels — as text and never as a path. What is fixed is the channel.
What the home is made of on disk is still open, and is question 4 below — including *which* of
blobot's places, because there are two and they are kept apart on purpose: a file the user can
open under `~/.local/share/blobot/`, beside worktrees, handoffs and speech, or rows in the store
under Electron's `userData` beside the standing instructions column
(`apps/desktop/src/main/speech-files.ts` says *never userData* for the first and means it).

**Fixing the channel opens a collision with ticket `01`, point 2, and it is named here rather
than left for the resolving session to find.** Point 2 lists what a home is — *its `map.md`, its
standing instructions, its archived handoffs* — and that list reproduces question 4 under *What
to decide*, where standing instructions and handoffs were **candidates** of which *neither has to
move*. A handoff is one Agent's write-up of one team's session: it is written at `<team>/<agent>`,
the Handbook's grain, and today it travels into that same Agent's fresh session and nowhere else.
Put it in a profile-grain home whose only channel is composed context and it rides into every
other team's prompt, which is exactly the leak question 2 under *What to decide* — *what it may
carry*, question 3 below — says a profile-grain object must not open. The two cannot both stand
as written. This amendment's reading is that **the handoff is the prior that should yield**: it
is the pair's and not the profile's, and it belongs in a home at most as a location on disk — the
archive it already has — and never as a thing the home's composed context carries. That narrows
point 2 by three words, *its archived handoffs*, and by the map's own rule it is not to be
contradicted quietly: **the session that resolves this ticket reopens `01` on point 2 for those
three words, or says why a handoff is the profile's after all.** The map's fog *Compaction and
the handoff archive off-machine* — *whose home that is when the agent runs elsewhere is
unexamined* — is the same question from the other side, and closes with this one.

Two things here are rules recorded on an open ticket — *if a home exists, it lives on this
computer, in a place blobot owns*, and *it reaches an agent as composed context, or not at all* —
and neither is new: both are derived from ticket `01`, point 5, and ADR-0004, with the handoff
archive as the precedent. The tracker has no state for a narrowing short of `resolved`, and the
map's *Decisions so far* indexes answers and never amendments, so a session that does not open
this file cannot see either. **When this ticket resolves, the `## Answer` restates both rules in
full rather than pointing back here**, and the `01` reopen above goes with them.

**And whether a home exists at all is still this ticket's to answer.** Ticket `01` decided that a
home would be a different object from a Machine; it did not decide that there is one, and its
question's point 3 named *no* as a legitimate outcome that collapses this ticket and `07`. Two
things narrow the field for the author, and the survey has to be read for exactly what it says.
`research/05` says at *What transfers*, (c), that *the market's memory is per repository or per
org, never per agent*, and its *Comparison* table and *Per product* section carry the products
that sentence summarises: eve's memory is per principal, Grok Bot's per user, Copilot's per
repository and user, Jules's per repository, Devin's Knowledge and Playbooks per organisation.
The survey's own summary is narrower than its own table — eve and Grok are neither per repository
nor per org — and the half that carries weight here, **never per agent**, is the half that holds
against every row. The survey's conclusion is that the Handbook, at `<team>/<agent>`, is already
ahead of it. That is a finding about **memory** and it says nothing against a home. The market
does have a per-agent home, and (a) and (d) name it: Sprites gives every agent its own persistent
disk, eve's declared subagents get a sandbox each, and what each of those holds is *a home but no
branch*. So the per-agent home the market has shipped is a disk with nothing on it that survives
as work — which is the object ticket `01` already split off and gave to the Agent as its Machine,
one per pair, where the branch is — and the author has asked for the other half, in the quote
this ticket opens with. What is left to argue is what a profile-grain object holds that is
neither a disk nor a branch. And what a home must beat is not nothing: an AgentProfile already
has standing instructions, and an Agent already has a Handbook per team, so the cheapest home is
*the standing instructions, plus a composed line saying which teams she is on*, with no new
object at all. If the author still wants one, the argument has to be for what that line cannot
carry.

**The questions, restated and renumbered.** These are the numbers a resolving session uses. The
first is new; 2 and 3 were 1 and 2 under *What to decide*; 4 folds the original 3 and 4; 5 is
still 5.

1. **Whether an AgentProfile has a home at all** — and if not, whether a composed line over the
   standing instructions is the whole of `map.md`, which closes this ticket and `07` small.
2. **Names or paths**, sharper now: on a `box` a host path names nothing, on `local` it is an
   ungated read, so a path is useless on one kind and harmful on the other. What this grilling
   can settle is whether a *name's* safety may rest on wording at all, or only on the Machine —
   `04`'s fence on `local`, the closed list on a `box` — with a name offered under that fence and
   never as a promise of its own. What it cannot settle is what a real agent does with a name it
   cannot locate, because that takes a turn: it is a task ticket's, one the resolving session
   names, and not `16`'s, which measures the box.
3. **What it may carry**: team names, roles, teammates, what each Workspace is about — and never
   a transcript, a Handbook entry, a handoff or a diff from another team's turn, because that
   leak is the one thing a profile-grain object must not open. *Handoff* is the word this
   amendment added, and the `01` reopen above is its cost.
4. **On disk, and composed when** — the original *who writes it and when* and *what else lives
   there*, together: whether the source is a file the user can open under
   `~/.local/share/blobot/` or rows beside the standing instructions column under `userData`;
   and whether the composition rides every turn, as `composeLeadBrief` does because it *is* the
   live fold, or the Persona at session start, because which teams a profile is on changes
   rarely and costs prefix tokens on every turn it rides.
5. **Whether the agent may write to it**, and the reason it is narrowed is the `handbooks`
   refusal, not reachability: *a persona that edits itself off screen is unreviewable*, and a
   file write is off screen wherever the file is. On `local` it is a `Write` vouched from
   `normal` into a directory nobody is looking at; on a `box` it is nothing, because no volume
   holds the home — which is Alice and Bob again, so it is not the reason, only the second
   refusal. A write can therefore only be a tool blobot owns, disclosed inline and bounded as
   `record_entry` is. The `handbooks` narrowing — withdraw your own `noticed` entry, never a
   `told` one — is still the shape any yes takes.

**Not this ticket.** What a turn addressed outside a team may do, and what its transcript is
(`07`, which reads this answer). Where a profile is addressed from, and the home on screen
(`12`). The box's closed list is `01`'s, point 5, and is not reopened here; the Workspace inside
a box is `05`. What a real agent does with a project name it cannot locate is a measurement and a
task ticket's, per question 2. The map's *Promoting what is true everywhere* fog — an entry that
turns out to be about the person rather than the team — meets this ticket from the Handbook side
and is not answered by it.

## Note, 2026-09-05 (consistency pass)

*The home on screen* was in a loop with `12`; `18` refuses it back here by name. If this ticket
says a home exists, it owns that screen question or hands it to `18` in words.
