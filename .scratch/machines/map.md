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

**Narrowed, 2026-09-04 (Guillermo): this computer only.** The kinds decided here are `local`
and `box` — a microVM on this computer, blobot's own image per runtime inside it, one per Agent
with two volumes. A Machine of the user's own over ssh, a hosted Machine, a second client such as
a phone, and blobot as a service are **fresh efforts** (see *Out of scope*); this map fixes its
interfaces so that none of them is a rewrite. The wording of the three bullets above stands; the
*kinds* bullet now reads *local, and a box on this computer*.

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

**Design direction, 2026-09-06 (Guillermo).** Be meticulous about design: simple,
organized, understandable and minimal, respecting the site's existing design.
Use the current components and patterns; reveal operational details only where
they help. This supplements DESIGN.md and the claimed Machine-screen ticket.

**Resumed after main integration, 2026-09-05 (Guillermo).** The author said “continua” after
the validated merge `1167d61`. The requested pause is complete; continue the entire Machines
goal, starting with the claimed image ticket's complete-state preservation work. The merged
UI is the baseline for later UI work. All existing acceptance gates and commit/validation
requirements remain in force.

**Current checkpoint.**
[Where the boundary goes: around the bridge, or inside the runtime](issues/04-where-the-boundary-goes.md)
is resolved after Guillermo accepted both the architecture and the native failure timing.
Claude's local policy is active and its protected-command failure is measured with a synthetic
local provider. Cursor's ACP setting is not described as a verified native fence. No boundary
answer remains pending. Continue the full implementation goal; the image ticket remains claimed
and its complete-state migration is still unfinished. All box activation gates remain in place.

**Profile overview checkpoint, 2026-09-06.**
[What lives in an agent's home, and what map.md may say](issues/06-what-lives-in-an-agents-home.md)
is implemented, validated and resolved after acceptance of its [focused proposal](home-decision-round.md).
The behavior of [What an agent addressed outside a team may do, and what its transcript is](issues/07-what-a-dmd-agent-may-do.md)
is now accepted and resolved; continue with its entry-point UI.

**Current implementation frontier.** Profile contact through a visible individual Team is
implemented, validated and resolved, including its entry-point UI. The
[first decision round](profile-conversation-decision-round.md) was accepted after explanation.
No further product answer is pending for this choice. Continue the remaining frontier;
complete-state image preservation remains claimed and unfinished.

**Network continuation, 2026-09-06.** The individual-Team UI is committed as `1aa70a7`.
[Egress from a box: the allowlist, and how a block is said](issues/15-egress-from-a-box.md)
is implemented, validated and resolved. Its [focused decision round](egress-decision-round.md) records Guillermo's choice:
Internet access without a blobot destination allowlist, beyond the harness's own restrictions.
The author also accepted host/local-network reach while keeping the
harness's selected approval policy. Worktrees, credential ownership and engine choice remain
accepted. No further answer is pending about network reach or destination-list editability; no box
activation is implied before the remaining image/runtime/onboarding/UI gates are complete.

**Disclosure checkpoint, 2026-09-06.**
[What a sandbox lets blobot say](issues/09-what-a-machine-lets-blobot-say.md) is implemented,
validated and resolved. No permission answer remains pending. Its Answer supersedes historical
clone/allowlist/box-only-approval prose and supplies the screen ticket's current copy contract.
Continue the remaining implementation frontier; the claimed image preservation and box activation
gates are still outstanding.

**Measured network boundary.** The [RC5 probe](research/46-open-internet-boundary.md) found that
the native Internet wildcard also admits host-loopback services despite private CIDR denies.
The [decision round](egress-decision-round.md) records acceptance of that additional host-network
reach and unchanged approval posture. Owned open-network permissions are implemented; keep the
remaining image/runtime/UI activation gates. Do not reopen the settled network choice.

**Main integration, 2026-09-05.** The incoming September 4 planning fork predates the
accepted local/box scope and uses the numbers now held by the image and engine tickets.
Its two questions are preserved under unique identities:
[Is remoteness a place to execute, or a blobot instance?](issues/23-is-remoteness-a-place-or-an-instance.md)
is outside the already narrowed destination;
[A per-agent composition root: config, MCP servers, skills](issues/24-a-per-agent-composition-root.md)
remains open alongside the existing inheritance/home decisions. This merge neither reopens
resolved Machines tickets nor adopts a server model. References to the original permission
posture use `first-demo` ticket 14; the current Machines ticket 14 owns the engine interface.

**Pause to integrate main, 2026-09-05 (Guillermo).** Finish the current implementation
checkpoint, commit it, fetch and integrate Alain's latest `main`, resolve any conflicts and
validate the combined branch. Then stop before starting further work or UI. This temporarily
overrides continuous advancement; the full goal and open acceptance gates remain unchanged.

**Continuous implementation goal, 2026-09-05 (Guillermo).** Complete the entire Machines
implementation, resuming the claimed image ticket. Validate throughout, commit each completed
ticket separately, and write a checkpoint at each issue boundary so context can be compacted
without losing decisions or evidence. This supersedes the earlier two-ticket/session and
stop-for-handoff limits. Use `grill-with-docs` and pause for non-obvious product/trust decisions;
the author delegates basic implementation choices. Do not reopen the accepted sbx engine,
worktree/shared-Git boundary, base or storage capacities merely because context changed.

**Current continuation, 2026-09-05 (Guillermo): worktrees on both kinds.** The author rejected
the independent box clone after clarifying clone/worktree/remote semantics. The host-access
portion of [What a Machine is, and what grain it hangs at](issues/01-what-a-machine-is.md)
is resolved with the author’s explicit acceptance of shared Git metadata RW; the rest of its
decisions stand.
[Where a Workspace lives when the Machine is not this one](issues/05-where-a-workspace-lives.md)
is implemented and resolved. Continue the claimed
[The image: one per runtime](issues/13-the-image-one-per-runtime.md), using the base accepted
in that ticket's **Base decision** section.
The Workspace ticket's current-direction section supersedes its historical clone design. A synthetic
worktree mount has been verified in sbx; the evidence and its limits live on the tickets.
This changes neither the engine choice nor the two-ticket continuation request; the image
work follows the revised Workspace contract. No production activation has been enabled.

**Session handoff, 2026-09-05 (Guillermo).** The author requested a commit and handoff to
continue in another session. Workspace implementation is committed as `65aece0`; resume the
claimed image ticket with its base choice still pending. This handoff neither resolves that
choice nor marks the image ticket complete. See the latest checkpoint in [build.md](build.md).

**Execution opened, 2026-09-05 (Guillermo).** The author asked to begin development so each
Agent is born and works in its own Docker Machine. Implementation is now in scope, one ticket
per session, alongside the decisions. Start with *The engine, the Machine interface, and a
box's lifecycle*: its interface is the prerequisite for the box implementation; the remaining
`local` inner-fence decision does not block that work. Open decisions remain open until answered.

**Session scope amended, 2026-09-05 (Guillermo).** Continue implementation across **two tickets**
in this session, overriding the earlier one-ticket limit. Any unresolved choice is put to the
author through `grill-with-docs`; do not bypass it to finish implementation.

**Engine review deferred, 2026-09-05 (Guillermo).** Finish the two current tickets on `sbx`,
verify and commit their work, then create research tickets comparing vanilla Docker Engine
with `sbx` and a dependent HITL `grill-with-docs` reevaluation ticket. Prepare a handoff for
that next session. Creating those research tickets does **not** authorize running them now.
Only that later evidence and the author's decision may change the engine or the remaining
plan; the Eve comparison alone changes neither. Current ticket completion remains subject
to its acceptance criteria, not waived by the future review.

**Next-session priority (Guillermo):** take the research pair
[Docker Engine and sbx: lifecycle, persistence and resource costs](issues/20-engine-lifecycle-persistence-and-costs.md)
and [Docker Engine and sbx: isolation, network access and product constraints](issues/21-engine-isolation-egress-and-product.md)
before resuming the older numeric frontier. Their findings unblock
[Reevaluate the first Machine engine with the measured trade-offs](issues/22-reevaluate-the-first-machine-engine.md).
Only the author's decision there can change the engine or remaining plan. This priority changes
no other ticket's status, scope or dependencies. No comparison research was started on creation.

**Engine review complete, 2026-09-05 (Guillermo).** The research pair and human reevaluation
are resolved. [Reevaluate the first Machine engine with the measured trade-offs](issues/22-reevaluate-the-first-machine-engine.md)
records the author's decision and the remaining validation boundaries. Resume box implementation
at [Where a Workspace lives when the Machine is not this one](issues/05-where-a-workspace-lives.md),
before the independent local inner-fence work. This supersedes the research-first priority above;
the next session claims the implementation ticket before working it. Implementation was deferred
to that session at the author's request.

**Domain.** blobot is a local-first Electron desktop app that assembles teams from the coding
agents a user already has installed. It provides no inference, stores no credentials and provides
no infrastructure. `CLAUDE.md` has the permanent architectural rules and `CONTEXT.md` the
glossary; both bound every ticket here and neither is renegotiable inside one. `DESIGN.md` is
binding for anything a user sees.

**Skills every session should consult:** `/grilling` and `/domain-modeling` by default.
`/research` for the research tickets. `/prototype` for `12`, where the question is what it looks
like.

**Read before any ticket:** `research/01-external-sandbox-libraries.md` — measurements taken
against real tools on Alain's Linux machine on 2026-08-31, including the one result that blocks the
obvious approach — **and `research/02-srt-on-macos-and-what-moved.md`**, measured on Guillermo's
Mac on 2026-09-04, where that result does not hold: srt reaches the loopback mailbox on macOS,
srt 0.0.75 masks credentials at the proxy, and Claude's own sandbox is one `_meta` away.
**And the two records of the first box**: `research/07` (Claude's own sandbox through `_meta`, live)
and `research/08` (the first `sbx` box: the door, `--clone`, the costs, the transport). `absorbed-sandboxing.md` is the framing of the effort this map absorbed and
carries the constraints anything here must hold.

**Standing preference, 2026-09-05 (Guillermo) — invisible setup, smooth sign-in.** For a person
who has never had Docker, what they see is: install the app, use it, create an agent, done.
Whatever blobot does underneath with the engine is *practically invisible*, and the CLI's own
sign-in inside a box happens smoothly through the interface or the chat, never in a terminal. This
is the bar every ticket that touches the `box` kind is held to — `08` (setup and sign-in), `09`
(the words), `12` (the screen), `13` and `14` (the image and the engine) — and it is what decides
whether one Docker sign-in is an acceptable floor or whether the engine has to change. **Answered
the same day: it is** — one Docker sign-in, as an onboarding screen with a button that opens the
browser, and never a command to copy; `sbx` stays the first engine (ticket `08`).

**Where each shared question lives, 2026-09-05** — the index the consistency pass asked for, so a
stale pointer on a ticket is corrected by this table rather than by editing nine files:

| question | owner | readers |
|---|---|---|
| setup and sign-in: the screen, the buttons, the four facts, caching | `08` | `12` draws it, `19` supplies costs |
| setup and sign-in: the mechanism (installer, `sbx login`, the daemon, tiers inside a box) | `19` | `08`, `09` |
| every word on screen, including the account named | `09` | `08`, `12` |
| the rail, the user's VS Code door, the sign-in card, the folder-step row | `12` | `09`, `10` |
| what crosses into a box, the volumes' adopt-or-refuse, git identity, `origin`, ADR-0003's second amendment | `05` | `13`, `15`, `17` |
| root kit, naming by Agent id and the environment layer's travel | `17` | `05`, `13`, `19` |
| the box object, SSH admission, the door rule, the pool and the shared daemon | `19` | `05`, `08`, `14`, `15` |
| the interface, the null engine, the `fs`/`terminal` invariant, the verdict on the four constraints | `14` | `17` |
| the image's contents and how the bridge is installed without bundled CLIs | `13` | `05`, `17` |
| the allowlist and how a block is said | `15` | `09` |
| whether `local` gets an inner fence, and the two controls kept apart | `04` | `09`, `10` |
| the fifth level on a box | `10` | — |

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
- **The three axes are separate and were tangled.** Location, reach and composition all appeared
  at once because they all show up when you ask *what if the agent is not here*, and they answer
  to different objects. Recorded because collapsing them again is the most likely way this map
  goes wrong — and because conflating **composition** with **reach** is specifically how `09`'s
  third and worst overstatement gets made.
- **A DM is wanted enough to be worth deciding.** `map.md` exists to serve it: the author's
  proposal is a profile that knows it has more projects, which only means anything if the profile
  can be spoken to.
- **The work product stays a branch.** Nothing here trades the team grain for the bot grain. A
  profile-grain home produces no branch and no pull request, and whatever it is for, it is not
  for that.

**Reopened while working, 2026-09-04 (Guillermo)** — three of the premises above are narrowed,
none is discarded, and the destination is unchanged:

- **The user brings the box → blobot never *requires* a box.** A hosted Machine, provided and
  priced by blobot, is a possible future product. It is **out of scope to build** on this map and
  **in scope as a constraint**: nothing decided here may preclude a `hosted` kind, and every
  ticket that fixes an interface (the mailbox carrier, where a Workspace lives, how a Machine is
  reached, detection) is answered with that kind in view. The rule that does not move is *no
  hosted inference*: what would be sold is compute, persistence and reach, never tokens, and the
  agent still runs on the user's own CLI login.
- **The fork that constraint implies, named so it is not discovered later.** *Hosted compute for a
  local blobot* keeps the orchestrator, the mailbox and credential injection on the user's
  machine, and a remote box dials home; every permanent rule survives it, and Routines still need
  the app open. *A hosted blobot* moves the orchestrator off the laptop and loses the laptop as
  the place the credential lives. **This map designs for the first.** The second is a fresh
  effort, never a resumption of this one.
- **Docker Sandboxes is the first candidate for the local box kind**, on the author's preference.
  Lima, Apple's `container`, Tart and a hand-rolled srt fence are measured against it, not
  dismissed. Its licence is proprietary, its microVM needs KVM on Linux, and `sbx login` wants a
  Docker account; all three are facts a ticket has to carry rather than a reason to refuse it.
- **Take the market as reference, without losing the grain.** Docker Sandboxes, eve, Grok Bot,
  Codex cloud, Cursor's cloud agents, Claude Code on the web, Devin, container-use: each has
  already answered *what a sandbox is bound to, how the repository gets in, and where the branch
  ends up*. `research/05` surveys them so no ticket here reinvents an answer the market has
  settled — and so the one thing the market has not settled, **a branch in the user's own
  repository as the work product**, stays ours.
- **Two machines chart this map**: Alain on Linux, Guillermo on macOS. Every measurement says
  which, because the first blocking result turned out to be a platform's and not a library's.

## Decisions so far

- [What a sandbox lets blobot say](issues/09-what-a-machine-lets-blobot-say.md): kind-specific words reflect host worktrees and open network reach; the shipped permission disclosure uses the selected runtime option's scope instead of a universal Claude file. Approval choices are unchanged, with tests and builds passing.

- [Egress from a box: the allowlist, and how a block is said](issues/15-egress-from-a-box.md): open Internet plus host/local-network reach, preserving approval posture; scoped rule ownership/migration/revocation implemented and tested in RC5. Destination restrictions belong to a separate future effort.

- [Where a profile is addressed from, on screen](issues/18-the-profile-conversation-on-screen.md): a visible talk action opens a dialog to choose an individual Team or use ordinary creation with the profile preselected; existing Team surfaces own its history, permissions and context. Both layouts were prototyped and the implemented flow validated in Electron.

- [What an agent addressed outside a team may do, and what its transcript is](issues/07-what-a-dmd-agent-may-do.md): contact from a profile opens a visible individual Team, with ordinary worktree/tools/history and existing approval/lifecycle rules; exact membership is rechecked before opening, and the screen ticket completes the entry point.

- [What lives in an agent's home, and what map.md may say](issues/06-what-lives-in-an-agents-home.md): a bounded, fresh profile-membership overview on every turn; existing standing instructions, no shared file or new personal-memory writer, and no other-team work contents or added authority.

- [Where the boundary goes: around the bridge, or inside the runtime](issues/04-where-the-boundary-goes.md): native local protection with disclosed limits and inherited project rules; optional box fences disabled independently of approvals, coupled Codex mode retained; protected-command failure may follow startup, verified on the pinned Claude CLI.

- [Where a Workspace lives when the Machine is not this one](issues/05-where-a-workspace-lives.md): host worktrees and shared Git metadata mounted in the staged box lifecycle, Agent commit identity, scoped skills and measured deletion; verified with real Git and sbx, activation remains gated on the remaining tickets.

- [What a Machine is, and what grain it hangs at](issues/01-what-a-machine-is.md): one Machine per Agent; local and box use the existing AgentWorkspace, with its shared Git metadata explicitly writable in a box and the main checkout unmounted.

- [Does OpenCode have a sandbox](issues/03-which-runtimes-have-a-sandbox.md): OpenCode and fx have none; Claude/Codex have native shell protection, while Cursor's native capability is not established through its ACP integration. Current evidence amendment distinguishes capability, configured setting and effective protection.
- [Can a sandboxed agent still reach the mailbox](issues/02-can-an-agent-reach-the-mailbox.md): yes on every kind, by a different door each; the mailbox's three constants survive unchanged and the **carrier** (the hostname minted in `endpointFor` plus the one door the kind opens) is a property of the Machine kind. Linux is read, not run; the Docker door has since been run (`research/08`, comment on the ticket). Evidence in `research/02`, `research/03`, `research/08`.

- [The engine, the Machine interface, and a box's lifecycle](issues/14-the-engine-and-the-machine-interface.md): the Agent-bound interface and null engine are implemented across all five launch paths, with explicit environment layers and shared client-capability protection; box activation remains the engine's work. [Build status](build.md).
- [The first engine: sbx behind the interface, and a box's life](issues/17-the-first-engine-sbx-behind-the-interface.md): root kit and stdin-framed exec implemented and fixture-tested across stop/start; SSH disable is daemon-wide, so production admission and setup continue in [A box's lifecycle, engine setup, and the pool](issues/19-a-box-lifecycle-and-engine-setup.md). No Agent runs in Docker yet.
- [A box's lifecycle, engine setup, and the pool](issues/19-a-box-lifecycle-and-engine-setup.md): staged owned lifecycle, verified sleep/reopen, preserved-data limit changes, scoped mailbox permissions and explicit shared setup; local sleep/power UI is connected, box activation remains behind image/Workspace/egress work.
- [Detection, and its remedies, when the runtime is not on this computer](issues/08-detection-and-remedies-per-machine.md): four states with engine/Agent subjects, awake-only guest probes, fresh checks after remedies and no login inference from exit; Machine-screen and real runtime-image activation remain with their existing tickets.
- [Docker Engine and sbx: isolation, network access and product constraints](issues/21-engine-isolation-egress-and-product.md): researched the shared-kernel versus per-Agent microVM boundary, nested Docker, egress and setup/login/distribution costs; no engine choice or trust change, with unverified guarantees explicit in the evidence.
- [Docker Engine and sbx: lifecycle, persistence and resource costs](issues/20-engine-lifecycle-persistence-and-costs.md): native Engine update/reuse/inspection and sbx copy costs investigated and fixture-tested on Mac; full-Agent performance remains unmeasured, and engine selection belongs to the human reevaluation.
- [Reevaluate the first Machine engine with the measured trade-offs](issues/22-reevaluate-the-first-machine-engine.md): author confirms sbx and general-purpose Machines with guest sudo and private Docker/Compose; resume the existing box implementation without an Engine migration.

Query the issue status and blocking lines for the current frontier; the former recharting
snapshot is superseded by the interface's resolution.

## Not yet specified

In scope, not yet sharp enough to ticket. Graduates as the frontier advances.

- **The four constraints a future kind puts on this one** (ticket `01`, point 8): the Machine as
  a `spawn` provider whose box dials blobot; an orchestrator that depends on neither Electron nor
  the renderer's process, one SQLite per user; sleep as stop-and-keep-volumes and wake as
  `session/load`; a mailbox that can wake a sleeping agent. Each is checked by the ticket that
  fixes the interface it names, and none is built here.
- **What the desktop must already be so a second client can exist.** A phone is a second
  renderer over a network; the IPC surface is an API and every channel already leads with a team
  id. Whether anything in `apps/desktop/src/main` still assumes one window is unexamined.
- **One sign-in per machine rather than per box.** Two candidates: a template box logged in once
  and cloned per agent (refresh-token rotation unmeasured), or the engine's own proxy-managed
  OAuth, which keeps the token host-side and injects it — measured for Docker's own kit, not for
  blobot's image (`16`). Load-bearing since the 2026-09-05 preference; ticketed the day `16`'s
  probe answers, and the question it carried about the *no credential storage* rule is settled (2026-09-05, on
  `08` and `15`): the engine's own store on the user's machine is the CLI's file, not blobot's
  database.
- **Apple `container` as the second engine**, when its host door is something other than a
  `sudo` pf redirect or a bind on the vmnet gateway (`research/06`).

- **Two agents on one Machine.** If a Machine is per profile or per team, two agents share a
  place. Whether that reintroduces what ticket 10 refused — *never a shared directory* — depends
  on whether the sharing is of a directory or only of a host, and that reads `01`.
- **A Windows box.** A box is already a Linux guest on a macOS host, and the guest path question
  is `05`'s now; what is left as fog is whether a Windows host is a variant of `box` or a kind.
- **Whether a Machine has an identity on screen.** A Team has an icon detected from its Workspace
  and drawn as a sticker on the folder. Whether a Machine earns anything similar, or is a word
  and a hairline, is downstream of `12`.
- **Folded, 2026-09-05, so nobody looks for them here**: *two agents on one Machine* (answered by
  `01` point 4); *a Routine whose Machine is unreachable* (the runner already records the launch's
  own refusal as the skipped reason; `09` §4 owns the sentence); *compaction off-machine* (the
  archive stays on this computer and the handoff travels as text; `14` checks it); *attachments
  across the boundary* (one zero-token measurement, a 6 MB line over the exec transport; `16`).

## Out of scope

Ruled beyond this destination. These do not graduate; they return only as a fresh effort.

- **Destination filtering and a configurable network policy.** Guillermo explicitly deferred
  restrictions to another effort after choosing open Internet and host/local-network reach.
  An arbitrary hostname whitelist is not part of this implementation. Harness approval rules,
  authenticated mailbox calls and the remaining Machine boundaries still apply. See
  [Egress from a box: the allowlist, and how a block is said](issues/15-egress-from-a-box.md).

- **Automatic promotion to personal memory.** The accepted
  [profile overview](issues/06-what-lives-in-an-agents-home.md) supplies membership metadata and
  keeps standing instructions under user control. A Handbook entry becoming a shared personal
  instruction needs a separate future memory decision; it is not required for Machines.

- [Is remoteness a place to execute, or a blobot instance?](issues/23-is-remoteness-a-place-or-an-instance.md):
  the server/client fork from main is retained as a future question; this effort already fixes
  local and box execution on this computer.

- **Hosted sandboxes and cloud VM providers** — Vercel Sandbox, E2B, Daytona, Modal, Fly
  Machines. Refused on *local-first* and *no cloud dependencies*, and because they would ship the
  user's repository to a third party, which is a much larger version of the leak ADR-0004
  already refuses. Measured and recorded in `research/01` §1 so it is not asked twice.
- **blobot providing a machine — to build.** Out of scope to build here; in scope as a
  constraint on every interface this map fixes. See *Reopened while working* above: the hosted
  kind is a later product, and this map must not make it a rewrite.
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
- **A Machine of the user's own over ssh** (`remote`). Narrowed out on 2026-09-04 with the
  destination; ticket `11` is closed and what it established survives as a constraint on `14`.
  Returns as a fresh effort.
- **A second client, and a relay to reach the desktop from outside** — a phone answering a
  `waiting` from anywhere. The desktop is the server and the relay forwards bytes it cannot read;
  a fresh effort, with the *second client* fog above as its only footprint here.
- **blobot as a service, and blobot cloud** — the orchestrator without a window, boxes beside
  it, Routines with the laptop shut, priced by awake-seconds and stored gigabytes. Sketched on
  2026-09-04 as a per-user runner, a gateway of paired devices, a machine plane behind `Machine`
  and a `boxd` that dials the runner. Two of its questions are already known to need amendments —
  the CLI's login living in a box on blobot's disk, and the forge as the branch's transport when
  the laptop is off — and neither is answered here.
