Type: grilling
Status: resolved

# What a Machine is, and what grain it hangs at

## Answer to the narrow reopen, 2026-09-05 — worktrees on both kinds

Guillermo rejected the box clone after clarifying that it owns an independent Git store and
the planned clone has no origin: “prefiero worktree siempre igual que en local”. This reopens
**points 4 and 5 only**, the clone/private-workspace-volume choice and the closed host-access
list. The Machine's grain, the local/box kinds, sbx selection and guest capabilities stand.

The accepted implementation is the existing host AgentWorkspace worktree plus its common Git
directory, both mounted RW at their canonical host paths in the Agent's own box. The parent
checkout and other worktrees' file directories remain unmounted. Nested Workspaces reuse the
existing scoped worktree tree and add each selected repository's actual common directory;
plain Workspaces remain private copies, since they have no Git repository to hold a worktree.

The [worktree research](../research/20-worktrees-in-sbx.md#parent-session-live-fixture--observed-2026-09-05)
now includes a passing synthetic RC5 fixture: commit inside at UID 1000, the host branch
updated without fetch, the same origin URL, main checkout and sibling loose files absent at
UID 1000 and root, and work preserved after stop/start. Fixture boxes and host files were
removed. It establishes the ordinary two-directory mount shape, not all repository layouts
or production activation.

**Accepted by Guillermo:** “eso está bien, no pasa nada”. This closes the shared Git write boundary. A true worktree
shares the repository's objects, refs, configuration and hooks. Mounting that common directory
RW lets a process in the box modify those shared files, including files a later host Git
command will use. This is access to the user's repository metadata, even while the user's
checkout files stay outside the box. A per-Agent branch is not an enforcement boundary around
that metadata. The old no-host-repository boundary cannot be claimed for this design.

The author selected worktrees and explicitly accepted the broader metadata consequence.
No real user repository was mounted for the investigation. Host credentials, SSH forwarding,
host home and the host Docker socket have not been added to the access list. The same origin
URL does not by itself grant a box the host's authentication or authorize egress.

The narrow reopen is resolved. Continue
[Where a Workspace lives when the Machine is not this one](05-where-a-workspace-lives.md).
Its implementation revises the Workspace-dependent lifecycle assumptions; unrelated resolved
decisions and their measured evidence remain valid.

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

## Answer, 2026-09-04

Decided with the author in one session, against `research/02` to `research/06` and the market
survey in `research/05`. Eight decisions; the reasons are here and nowhere else.

1. **The noun is Machine**: the place an Agent's Turn executes. It has an entry in `CONTEXT.md`.
   On screen it is said by kind and in plain words — *this computer*, *a sandbox on this
   computer* — and the word *Docker* never appears, by the permanent rule; *sandbox* is reserved
   for the kind that is one.
2. **A home and a Machine are two objects.** A home is the AgentProfile's — its `map.md`, its
   standing instructions, its archived handoffs — and where a turn runs is the Agent's. The map's
   founding sentence, *the same object seen from two ends*, is withdrawn: it is what gave this
   ticket three defensible answers. The home stays on this map (`06`, `07`, `12`) and is not this
   ticket's.
3. **A Machine is a kind in a global registry, and every Agent gets its own instance of it.** The
   registry is like *your agents*: places set up once — this computer, always; a sandbox on this
   computer, when its engine is present; later a box of the user's own over ssh, later still one
   blobot provides. Placement is **per Agent**, chosen when the Team is formed, with a **Team
   default** in the folder step so it is asked once, and a per-Agent choice on the agent's own row
   for the exception (Mara needs the iOS simulator, which no Linux VM has). Never per Team only,
   which makes a mixed team impossible, and never per AgentProfile: Grok Bot's computer is per
   *user* and not per bot (`research/05`), so the argument for a profile-grain machine was never
   Grok's to lend.
4. **One instance per Agent, as simple as possible, with two volumes** — the author's shape. A
   *data* volume holds the CLI's own login and state, per agent; a *workspace* volume holds the
   AgentWorkspace as a clone, brought home by fetch. No two agents share a box. ADR-0001 is
   **extended, not amended**: the list of what a working agent does not share gains a box, and a
   *host* was never on that list because the box is per pair. Deleting an agent deletes its box
   and both volumes, so `purge` is exact rather than promised.
5. **What a box gets is a closed list**: the two volumes; the operator's `~/.claude/skills`
   read-only, so ADR-0003 stays true and the mount cannot become the path by which one agent
   widens what the next may do; one door to the mailbox, a host port and a bearer token; egress
   through a host-side proxy with a domain allowlist, a blocked request **said in the transcript**
   and never lost in silence; and nothing else — no host home, no host Docker socket, no host
   network, no other agent's volumes.
6. **Kinds in scope, and order.** `local` (today) and `box` (a microVM on this computer) are
   decided fully on this map, and `box` is built first. `fenced` is not a kind but defence in depth
   inside `local`, which `04` decides. `remote` and `hosted` are out of scope to build; the
   interface must not preclude them (point 8). A new team's default stays `local`; `box` is
   **offered** in the folder step when its engine is detected, with its cost beside it; and the
   fifth trust level, *everything*, is choosable **only for an agent on a `box`**, which `10`
   takes from here.
7. **One image, many engines.** blobot builds its own minimal Linux image per runtime — node, the
   pinned bridge, the CLI at the version each adapter measured — in its own CI, pulled on first
   use with a figure that knows its end. The engine that runs it is a separate choice behind the
   Machine interface. **`sbx` first**, on `research/06`: the strongest boundary on all three
   platforms, the least for blobot to build, `--clone` and ssh-agent forwarding already built, and
   the image verified to travel (`sbx --cloud`). Its costs go on screen through `09`: a Docker
   account is required, and the VMM is proprietary. Apple `container` is the second engine, when
   its host door matures.
8. **Four constraints a future kind puts on this one**, carried as named fog and checked by every
   ticket that fixes an interface: (i) a Machine is a `spawn` provider with two volumes, and **the
   box dials blobot, never the reverse**; (ii) the orchestrator depends neither on Electron nor on
   the renderer sharing its process, and a store is one SQLite per user; (iii) sleep is
   stop-and-keep-volumes and wake is `session/load`, so no kind may require a CLI session to
   outlive its box; (iv) the mailbox must be able to wake a sleeping agent, not only queue for it.

**Not decided here**: what the image contains (`13`), the engine interface and the box lifecycle
(`14`), the egress list and how a block is said (`15`), the Workspace in a box (`05`, amended),
detection and login inside a box (`08`, amended), the copy (`09`, amended), the fifth level
(`10`, amended).

## Amendments, 2026-09-05

Four corrections to the answer above, each raised by a ticket that read it, none changing the grain.

- **Point 1, the word Docker.** The author accepted one Docker sign-in as the floor, delivered as
  onboarding with a button that opens the browser (`08`, *Decided, 2026-09-05*). So Docker is named
  **once, as an account**, on the onboarding screen and where a sandbox is offered, because a
  sign-in page cannot be anonymous. It is still never a command, a mechanism or a word anywhere
  else, and `CONTEXT.md`'s Avoid entry now says exactly that.
- **Point 2, archived handoffs.** Struck from the home's list. A handoff is the pair's: archived
  under `~/.local/share/blobot/handoffs/` on this computer and carried into a fresh session as
  text, never a path (`06`'s amendment; `14` checks it as acceptance).
- **Point 5, what crosses.** Two narrowings. *Keeps ADR-0003 true* was said of the skills mount
  and overstated it: inside a box the operator's global `CLAUDE.md`, `settings.json` and hooks do
  not cross, and `05` (§11) writes ADR-0003's second amendment saying so. And the closed list gains a
  refusal it did not know it needed: `sbx` forwards the user's **ssh agent** into every box by
  default (`SSH_AUTH_SOCK=/run/ssh-agent.sock`, `research/08` §2), a signing socket wider than
  anything on this list; the kit turns it off (`17`). `CONTEXT.md`'s entry names the skills mount.
- **Point 4, conditionally.** *A data volume holds the CLI's own login and state, per agent* is true
  of tiers 2 and 3 on `08`. If `16` measures that the engine's proxy-managed sign-in survives
  blobot's image (tier 1), the login is per machine and runtime, held in the engine's own store
  and never in a volume, and this point reopens by name on that day. Recorded so the reopen is
  not a surprise.
- **Point 1, where the account is named**, sharpened: the onboarding screen, the folder step
  where a sandbox is offered, and Settings' machine section where the engine's readiness is
  shown — three places, one word, and `CONTEXT.md` says so.
- **Point 7, the fourth reason for `sbx`.** *`--clone` and ssh-agent forwarding already built* is
  withdrawn as a reason: `05` refuses `--clone` as the engine defines it, since a read-only mount
  of the user's whole checkout inside the box is ADR-0004's read hole, and the forward is off. What
  stands is the mechanism beneath it, a clone in the volume and a git daemon that let blobot fetch
  the branch home in 38 ms (`research/08` §3), which blobot drives itself. Three reasons remain.


### Comment, 2026-09-05: inheritance amendment delivered

[ADR-0003's second amendment](../../../docs/adr/0003-what-an-agent-inherits.md#second-amendment-2026-09-05-inheritance-inside-a-box)
now records that the operator's skills cross read-only while the box's user settings scope
belongs to the Agent. The accepted shared-Git exception also means Git config/hooks/reflogs
are shared; the older clone list's absence claims about those files are superseded.
