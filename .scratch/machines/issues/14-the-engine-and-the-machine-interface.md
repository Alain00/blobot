Type: grilling
Status: open
Blocked by: none

# The engine, the Machine interface, and a box's lifecycle

## Question

Ticket `01` gave the object and **constrained** the shape without deciding it: *a Machine is a
`spawn` provider with two volumes, and the box dials blobot, never the reverse* is point 8 (i),
carried as named fog and checked by every ticket that fixes an interface — this one first, since
this is the interface. Given from `01`: one box per Agent (ADR-0001, extended), `sbx` the first
engine, Apple `container` the second, `local` a kind too. Given from `02`: on a box the carrier is
`host.docker.internal` plus one `sbx policy allow network --sandbox <name> localhost:<port>`
line, minted where `endpointFor` mints `127.0.0.1` (`mcp/peer-message-server.ts:302`), and the
carrier is a property of the **kind**. The interface is not given, and its neighbours are waiting
on it by name. One thing has run since they were written: `research/08` is `16`'s `sbx` record,
measured on this Mac on 2026-09-04, and it names this ticket in its *What this settles*. It is
read before any of this, and where it moves a figure or a gate this ticket says so in place rather
than carrying the older line.

**The interface.** `WorkspaceProvider` (`workspace/workspace.ts:104`) has eight methods —
`inspect`, `initialize`, `provision`, `reconcile`, `remove`, `purge`, `measure`, `workspaceFor` —
and its unrecoverable one is a method, never a flag. Does `Machine` mirror it, or take another
shape because a box can be *stopped* and a worktree cannot? The lean is that two of the eight are
not optional. `reconcile` is the verb `05` §3, open, leans to mapping a box's states onto — box
gone with both volumes present is `repaired`, the missing directory of `01` point 8 (iii) seen
from the other end; a workspace volume gone with the host branch present is reported and never
repaired silently — and the one case `05` refused to make a reconcile outcome, *the engine itself
absent or stopped*, it handed here as a refusal by name at launch. `workspaceFor` is the pure
reader, and a Machine needs one for the same reason: naming the box, its volumes and its carrier
without touching them is not the job of provisioning them. Then `start` and `stop`, which no
worktree has. What does `spawn` take? Two runtimes reach their CLI through `spawnNpmBridge`
(`adapters/acp/npm-bridge.ts:59`) — `process.execPath` as node against a bridge entry resolved
from the host's `node_modules` — and three do not: OpenCode, fx and Cursor spawn the CLI itself
with `acp` (`adapters/{opencode,fx,cursor}/stdio.ts`). In a box the node, the entry and the CLI
are all the box's, so the lean is that `spawn` cannot be framed on the bridge: it carries a bare
argv and a cwd for three runtimes and a bridge entry for two, the Machine decides what runs them
and where, and blobot keeps the `LineTransport`. One more thing has to cross it, or `machineFor`
becomes a second provider switch: the image is **per runtime** (`01` point 7; `13` output 8, all
five get one), so its tag is provider knowledge, and a `box` Machine has to receive it without
branching on `runtime_id`. `15` output 2 has already fixed the shape for the vendor's hosts — a
member on `AgentRuntime` each adapter fills, the way `accepts` says what a runtime takes — and the
question here is whether the tag crosses the same way, on what `spawn` takes, and whether that is
one member or two; the lean is one, since a tag and a host list are both facts the adapter knows
and the Machine treats as opaque. And does `machineFor` sit beside `runtimeFor` in main
(`apps/desktop/src/main/runtime-for.ts`) or beside `workspaceProviderFor` in core
(`workspace/provider-for.ts`) — why do those two differ, and which reason applies here?

**`sbx` first.** A blobot kit, declared rather than flagged (`research/06` §*The table*,
§*Docker Sandboxes*): sized volumes, the allowlist, the operator's skills read-only (ADR-0003),
the bridge as entrypoint, the name `blobot-<team>-<agent>` from `02`. The kit's contract — the
user, the home, the proxy variables across `sudo` — is `13`'s (§*The base*) and is not restated
here; what this ticket takes from it is one question about the interface, and it is `10` §4's and
unmeasured: the bridge gates `bypassPermissions` on `!IS_ROOT || IS_SANDBOX`, so root with that
flag set is not refused by the bridge, and the CLI's own root rejection is [DOC] from `research/06`
and measured nowhere on this map; whether `set_mode(bypassPermissions)` takes inside a box at uid
1000, with or without `IS_SANDBOX`, is `10` §4's own spend. What the interface needs survives
either answer: it has to be able to say that the fifth level is unavailable on this engine and
this image, rather than let the mode fall back silently. The transport is `sbx exec -i`, stdin
kept open — read from `sbx create --help` (`research/03` §*Addendum*) and now **run once**:
`research/08` §5 carried `initialize` and `session/new` over it both ways, 0.43 s and stderr
empty, `-e` and `-w` carrying env and cwd, EOF ending it cleanly, and a real `claude` inside
dialled the mailbox through `host.docker.internal` with the bearer intact. `research/07` §4 still
reads *not run* and is superseded by that section. What is measured is one runtime's bridge,
npm-installed into Docker's own template; what is not is the same transport under a blobot image
(`-t`: `research/08` §6 boots a store-local tag in 3.7 s and leaves the `node:22` contract
untested), the login inside, and a real turn — `research/08`'s own *still unmeasured* list, and
the one gate output 2 keeps. What is this ticket's about the engine's readiness is the interface
and not the remedy: whether the daemon is a condition — `sbx`'s own, started on demand, or a thing
blobot must see up before `spawn` (`research/08` §1 found it running at 106 MB, and the same pid
is the proxy) — and whether readiness is a verb on `Machine` that answers in `08`'s four words, or
is entirely detection's.

**How `sbx login` and the daemon are driven is this ticket's**, and the shape is fixed by the
permanent rule before it is decided: *the user never sees or types a Docker command*, so
`runtime-readiness`'s remedy — a command shown in full and confirmed, on the pty
`main/runtime-step.ts` holds — is **unavailable for the engine**, which `08` §2 reads as a
consequence from here and does not restate. The login is driven **unseen**, as a verb behind the
interface, or the rule is raised with the author; it is never shown. What is decided here is the
verb and what it may do: spawn the engine's own login on the user's own act, with no command
quoted, so the vendor's browser opens the way `claude auth login`'s does and blobot reads nothing
of the stream; start the daemon, if `08` §1's question comes back *blobot's* rather than *the
CLI's own on demand*; initialise the network policy before a first start, which `08` §1 proposes
is blobot's act and never a state the user meets, with the preset `15`'s; and what each hands
back, since nothing concludes from an exit code and the screen ends on the engine asked again.
The state that calls for the login is `08`'s (*Needs sign-in*, on the engine); its words, whose
account it names, and whether the vendor is named as the account's owner are `09` §2's. The loop
`09`'s *Not this ticket* names — `08` §2 sending it here, this ticket's item 2 sending it back —
closes here.

**`TeamPool`** (`apps/desktop/src/main/team-pool.ts`): three teams live, LRU eviction, never
mid-turn, `hold` for a Routine. Is eviction `stop`, selection `start`, deletion `destroy` before
tombstoning — *the name has to still be true* applies to the box name — and `closeAll` on quit
`stop`, never `destroy`? One measured fact bears on the first before it is asked: on the first
engine a box **stops itself 30 s after its last exec session ends**, `sbx ls` says `stopped`, and
the next `exec` boots it in about a second (`research/08` §4). So an eviction that closes the
bridge's stdin is a stop whether blobot calls one or not, and `sbx stop` (0.16 s) is the
difference between *now* and *in thirty seconds*; whether the interface calls it, or leans on the
engine's own grace, and what `start`, `stop` and `hold` mean under an engine that stops for
itself, is the mapping. And **when the pull runs** is a lifecycle question and is taken here: `13`
output 6 decides who pulls, `12` §1 draws the figure at *create* as a stand-in and sends *when*
here by name — at team creation, at `provision`, or at the first `start` — and the answer has to
leave `08` §1's image layer either a state to detect or struck. What a stopped box costs was this
ticket's own hypothesis — *volumes, no kernel* — once attributed to `research/06`, which says
nothing of a stopped box (`16`'s amendment §5 records the misattribution; the one written source,
`research/02` §4, reads *stopping keeps the VM*). It is measured now, and the hypothesis held on
host RAM: `research/08` §4 has the shim process gone when stopped, the daemon alone at 161–180 MB,
the templates at 2.4 GB on disk with no sandbox left, and the restart at 0.99 s on the next
`exec`; running, 0.8–1.7 GB host RSS, 12 GiB and 12 vCPU by default, with `-m` and `--cpus` to
cap. This ticket takes those figures and decides what the interface does with them; a stopped box
under a blobot image is `16` item 3 again under `-t`, and moves a figure, never a shape. `05` §4,
open, leans to the other half: a volume that cannot be measured because the engine is stopped is
**not 0**, and `measure` gains an *unknown*. The figure's shape on screen — two volumes named
apart or folded on the purge line — is `05`'s; the engine call behind it, and whether *unknown* is
the interface's own answer or a caller's inference from a stopped engine, is this ticket's.

**`01` point 8 as acceptance, and `11`'s constraint beside it.** (i) *The box dials blobot*, yet
`sbx exec -i` is blobot dialling in: mailbox only, or must the control channel be
direction-agnostic behind `spawn` so a hosted kind needs no amendment? (ii) No Electron in the
orchestrator: `spawnNpmBridge` runs `process.execPath`, which is Electron in the app, so a
`local` Machine in core whose `spawn` reaches for it is a Machine that depends on Electron — does
`spawn` take the node to run under, or does `local` resolve it and `box` never need it? What
moves into core is not asked: the orchestrator without a window is a fresh effort (`map.md`,
*Out of scope*). (iii) Sleep is stop-and-keep, wake is `session/load` re-supplying `mcpServers`
on the box carrier: is the resume state in the data volume, and the handoff archive, which
travels as text (ADR-0004), still on the host? (iv) The mailbox can wake: the first `exec` after
a stop, boot included, is 0.99 s on the first engine (`research/08` §4) — is that cheap enough for
a peer message to call, or is `hold` the answer? (v) `11` closed as out of scope and left one
constraint on this interface: blobot stores a hostname and never a credential, the transport is
the user's own `ssh` spawned, the mailbox rides a reverse forward (`research/03` (d)), and
`ssh <box> …` is one implementation of the same seam `sbx exec -i` implements. Check `spawn`'s
signature against it as against the four: does the seam admit a transport that is a process
blobot spawned from a user-owned argv with no engine behind it, and a carrier that appears on the
far side's own loopback rather than on a hostname the engine owns? Built nowhere; an interface
that cannot take it is the rewrite the map exists to prevent.

**`local`'s implementation, and the second engine.** `local` is a kind and not an engine (`01`
points 6 and 7), so the question is what its implementation of the interface is: is `spawn`
there today's `spawn` with the box verbs as no-ops — the lean — and is its data volume the user's
own `~/.claude`, said honestly, or is the two-volume shape a fiction on this kind? What goes
*inside* `local` is `04`'s: whether Claude's inner fence is composed at `session/new` —
`research/07` §5 measured that `_meta` reaches the SDK unedited, per session, no file written, and
handed the finding here; it is handed on to `04`, which owns whether it is turned on and who owns
the policy — and whether srt around the bridge ships. This ticket exposes the seam those ride
through and decides nothing about them: if `04` ships either, `local`'s `spawn` is not a no-op,
and the interface has to have said where that goes. Apple `container`: no door short of a `sudo`
pf redirect or a vmnet bind, and no egress control (`research/06` §*Apple `container`*). `02`
decided the carrier is the **kind**'s and that is not re-decided here; the question this ticket
owns is whether an engine that cannot open its kind's door may be registered as that kind at all.
The map's fog already reads `container` as waiting for the door; say whether that is a rule of
the interface — an engine promises what its kind promises, or is not that kind — or a preference.
First-demo ticket 14's rule decides it: *a guarantee that holds for Alice and not for Bob is worse
than no guarantee*, and two agents on `box` under two engines with two doors is that shape. If
the honest answer turns out to be that the carrier is per engine, that is an `## Amendment` on
`02` and a reopen, never a second decision here.

**What the neighbours have handed here by name.** Each is accepted as an output below or refused
back to its ticket, so that resolving this one leaves nobody waiting:

- `05` §6: the fetch transport when `--clone`'s read-only mount of the host repository is
  refused — the branch brought home over the engine's exec as a git remote helper, or as a
  bundle — *`14`'s to build and unmeasured*. Accepted: whether `Machine` carries a way to run git
  against a volume, or the `box` workspace provider does it over `spawn`. What is measured is the
  shape refused: `--clone`'s own remote fetches home in 38 ms through a git daemon in the guest
  (`research/08` §3), which is the comparison and not the route; `16` item 2, re-aimed, is the
  route's first run.
- `05`, restated: whether moving an Agent between Machines is offered. The host branch is what
  makes it survivable; whether it is a control is accepted here as a question, with a lean to
  refuse on this map — a move is a new box or a new worktree from the fetched branch and a
  restart, which is the roster edit's shape, and offering it is `12`'s screen once it exists.
- `05` §3, `08` §3 and `09` §4: an engine stopped or missing at launch is not a reconcile
  outcome; it is refused by name, with `08`'s detection. Accepted as the interface's: a readiness
  verb, what it costs, and what `start` hands back — a confirmation that the box engaged, its door
  open and its posture as reported, or only that the engine returned — which `09` §4 asks of
  `spawn` by name and writes both sentences for. **Refused back to `08` §4**: whether the refusal
  reads the memo or asks the engine fresh is caching policy, and `08` §4 holds it as its own
  proposal, *measured before decided*; this ticket measures the cost and hands it there, and does
  not decide it twice.
- `12` §4: whether a Machine kind carries a *door for the user* beside the mailbox carrier.
  **Refused back — and `12` had withdrawn it in the same section**: a person's way into an
  AgentWorkspace is a feature and not a Machine question, the map never graduated it, and it lives
  on no ticket until the author answers `12`'s put-to-the-author item 6. Nothing here takes
  `ssh <name>.sbx` onto the kind, which is the mechanism `12` refused on a pixel; this ticket's
  *door* is the mailbox's carrier and Apple `container`'s host door, as `12` reads it. If the
  author graduates it, what it would meet here is whether a kind carries a second door at all, and
  that is asked then.
- `12` §1, and its *Not this ticket*: when the pull runs. Accepted, beside the `TeamPool` mapping
  above; who pulls stays `13` output 6, and how it is drawn stays `13`'s.
- `08` §2, and `09`'s *Not this ticket*: how `sbx login` and the daemon are driven. Accepted —
  the mechanism is this ticket's, above, unseen and never shown; the state word stays `08`'s and
  the words `09`'s.
- `15` output 8: the block's carrier, and whether the proxy's log is followed as it happens or
  read back per turn, and so what crosses this interface — since `sbx` owns its proxy and
  `container` leaves it to blobot. Accepted as a question of the interface — a block event the
  kind emits, or nothing — with `research/08` §2's two carriers as the measured input, a
  synthesized `403` to the tool and `sbx policy log --json` per host with count and reason beside
  the template's own boot noise; the words stay `09` §3's.
- `13`, *Not this ticket*: what an image bump does to a resumed session, and to a running box.
  Accepted: a Session belongs to the runtime that opened it (ADR-0002), and the runtime is now a
  thing the image pins.

## What must come out of it

1. The `Machine` interface in `packages/core`: the verbs, `reconcile` and a pure reader among
   them; `spawn`'s signature, carrying a bare argv for three runtimes and a bridge entry for two,
   and the image tag without a provider switch; what crosses it, and what `start` hands back.
2. The `sbx` kit, declared against `13`'s contract; `exec -i` as the transport, measured once on
   one runtime's bridge under Docker's own template (`research/08` §5) and **provisional until it
   has carried a session under a blobot image** — the one gate kept; whether the daemon is a
   condition; whether readiness is a verb on the interface; and **how `sbx login` and the daemon
   are driven — unseen, behind the interface, never shown**. Not the state word (`08`) and not
   the words (`09`).
3. The `TeamPool` mapping, under an engine that stops for itself; when the pull runs; what a
   stopped box costs, from `research/08` §4, provisional under a blobot image; whether `measure`
   answers `05` §4's *unknown* itself.
4. `01` point 8's four constraints and `11`'s fifth checked against `spawn`, or the amendment
   naming which fails.
5. Where `machineFor` lives, and why.
6. `local`'s implementation of the interface, with the seam `04`'s choices ride through named
   and nothing decided about them; what `container` lacks, and whether an engine without the
   kind's door may be that kind at all — *per engine* is an amendment on `02`, not an output here.
7. The delegated questions above, each answered or refused back: the fetch transport; a move
   between Machines; the readiness verb at launch, with the caching refused back to `08` §4; when
   the pull runs; the login and the daemon; the proxy's refusal signal on the interface; an image
   bump under a resumed session. The user's door is refused back and is not an output.

**Size.** This is at the top of the map's range for one session, as `09` says of itself, and it
names its seam rather than leaving it to be found. If it splits: **(a)** the interface — outputs
1, 4, 5 and 6, `spawn`'s signature and `local`'s implementation with it — because the seam is the
type and everything in (b) is a caller of it; **(b)** the first engine — the kit, the transport,
the pool mapping and the pull (2, 3), `container`'s registration rule, and the delegated
questions (7). (b) would be a ticket of its own, numbered after `16`, and `08` and `15`, both
blocked on this one, would name it on their *Blocked by* lines, since the daemon, the login, the
kit and the proxy's signal all fall on that side. Nothing here opens it, because the map is not
this ticket's to edit; a claimant who takes (a) alone resolves this ticket with (b) split off by
name, never left as leftovers.

## Priors

ADR-0001, as `01` extended it: one box per Agent, so every verb here takes an Agent and never a
Team or a profile, and `destroy` is exact because nothing on a box is shared — the image alone is,
read-only and per runtime (`13` output 7), which is why its tag crosses `spawn` as a fact about
the runtime and not about the Agent. ADR-0003: the operator's skills reach a box as `01` point 5's
read-only mount, which the kit declares here; the user scope inside is the data volume's, and the
narrowing `05` §5 raised is `13`'s to write — the kit declares the mount and decides nothing about
the scope. ADR-0004: the transport carries bytes and never a path, which is why the fetch
transport's two candidates are a bundle over `exec -i` and a fetch home, and why point 8 (iii) can
leave the handoff archive on the host — it travels as text. First-demo ticket 14's rule decides
`container`'s registration: an engine promises what its kind promises, or is not that kind,
because two agents on `box` under two engines with two doors is a guarantee that holds for Alice
and not for Bob.

## Not this ticket

The image, its base contract and its pull (`13`; the kit references it by tag, and who pulls is
its output 6). Egress and the words of a block (`15`, `09`). The Workspace in a box, and the shape
of `measure`'s figure on the purge line (`05`). Detection, the state word for the engine, whether
the engine has an install door at all, how the CLI's own login inside the box is driven, and
whether the launch refusal reads a memo or asks fresh (`08`); the account sentence and every other
word (`09`). The inner fence inside `local` and who owns its policy (`04`): this ticket names the
seam, `04` decides what goes through it. The measurements (`16`, still open: its `sbx` half is on
disk as `research/08`, its `research/07` §3 and §4 still read *not run* and are superseded there;
what it leaves here as a comment when it resolves moves a figure, never a shape), and the three
things every figure here is provisional on — a blobot image under `-t`, the login inside, a real
turn — which are `16`'s and `13`'s to spend. The fifth level, whether the mode takes at uid 1000,
and what `sudo` reaches inside a box (`10` §4 and §5: the two volumes and nothing else, bounded
and not a level; whether the image grants it is `13`'s). The Machine on screen (`12`). The user's
door into an AgentWorkspace (no ticket; `12`'s item 6, put to the author). `remote` and `hosted`
are out of scope as work; `01` point 8 and `11`'s closing note are the constraints, checked above
and built nowhere.

## Amendment, 2026-09-05 — split: this ticket is the interface; 17 is the engine

The split the *Size* paragraph named has happened, on the seam it named. **Half (b) is `17`**:
the `sbx` kit declared against `13`'s contract, the transport's mechanics under `exec -i`, the
`TeamPool` mapping under an engine that stops for itself, when the pull runs, the daemon, the
installer, and `sbx login` driven unseen — outputs 2 and 3 whole, and of output 7 the fetch
route's first run, the caching cost handed to `08` §4, the login and the daemon, the proxy log's
carrier, and what an image bump does to a running box. `08` already names it (*Ownership, settled
here*: `08` owns the experience of setup and sign-in, `17` owns the mechanism) and `01`'s
amendment sends the ssh-agent refusal there; whether `08` and `15` have moved their *Blocked by*
lines onto it is theirs to do and is not asserted here. **This ticket keeps half (a)**: the
`Machine` interface in `packages/core` (output 1); `01` point 8's four constraints and `11`'s
fifth as acceptance, checked against `spawn` (output 4); where a Machine kind becomes a class —
`machineFor` beside `runtimeFor` in main or beside `workspaceProviderFor` in core, and why
(output 5); and `local`'s implementation as the **null engine** — today's `spawn`, the box verbs
as no-ops, the seam `04`'s choices ride through named and nothing decided about them (output 6).
Of output 7 it keeps only what is a verb or an event on the type: whether `Machine` carries a way
to run git against a volume at all, whether readiness is a verb on it and what `start` hands
back, whether a block is an event the kind emits or nothing, and that a move between Machines is
refused as a control on this map. The registration rule — an engine promises what its kind
promises, or is not that kind — is output 6's and stays; applying it to `container` on the day
its door exists is `17`'s. The delegated questions above are not re-listed; each is read against
this paragraph. `Blocked by: none` stands, because a type needs no engine to be written.

### 1. An invariant no ticket recorded: the client capabilities

All five adapters send the same `clientCapabilities` on `initialize` — `fs.readTextFile: false`,
`fs.writeTextFile: false`, `terminal: false` — at `adapters/claude/claude-agent-runtime.ts:295`,
`adapters/codex/codex-agent-runtime.ts:248`, `adapters/opencode/opencode-agent-runtime.ts:222`,
`adapters/fx/fx-agent-runtime.ts:288` and `adapters/cursor/cursor-agent-runtime.ts:245`. The
literal is written five times, pinned by no shared type and asserted by no test. Each carries the
same comment, *we own no terminals and serve no unsaved buffers*; Codex's alone names a kernel
boundary, Cursor's and fx's name the posture, Claude's and OpenCode's name only the worktree. In
ACP those three booleans say what the **client** will do on the agent's behalf: `fs/read_text_file`
and `fs/write_text_file` are calls the agent makes to blobot with a path, and `terminal/create`
asks blobot to run the shell. blobot is the host process. So if any adapter flipped `fs` on, a CLI
inside a box would read and write **host** files through blobot at whatever path it named, and
with `terminal` on its shell would run on the host — the box, its two volumes and `15`'s egress
fence would all still be true of the agent's own tools and false of the agent. **The box boundary
is only as real as those two booleans.** They are therefore a property of the interface and not
of any adapter: `Machine` is the thing they protect, and the reason they are false gains a second
sentence on each adapter that is the same sentence five times. The interface pins them with a test
in the shape of `packages/core`'s `no-acp-in-core.test.ts` — a walk over
`src/adapters/*/*-agent-runtime.ts` that reads the source, finds the one `clientCapabilities`
literal in each, asserts the three booleans are `false`, and asserts the count of files it found,
so a sixth adapter cannot arrive unpinned. On the source rather than on the wire, because
`initialize` is sent before any Machine exists to observe it, and because the point is that no
adapter may decide this. Whether the shared `adapters/acp` type also narrows the field to a
literal `false` is the build's; the test is the decision.

### 2. Acceptance (iii), with the former fog item folded in

The map's *compaction off-machine* item is folded here rather than carried, on `01`'s amendment
to point 2 (a handoff is the pair's and never the home's) and `06`'s reading behind it. The
question above asked whether the handoff archive is *still on the host*, and it is answered as
acceptance rather than left as a question: **the archive stays on this computer under
`~/.local/share/blobot/handoffs/`, and the handoff travels into the fresh session as text, never
as a path.** That is already how it travels on `local` — ADR-0004's refusal applied to blobot's
own file — and it is what makes blobot's session boundary survive a box with nothing added: the
handoff turn goes out over `spawn`'s transport as a prompt, the text comes back in the agent's
message, blobot archives it on the host, and `session/new` opens over the same transport with the
text inside the prompt. No file crosses, no path is spoken, and the data volume owes it nothing.
So (iii) now reads in full: *sleep is stop-and-keep, wake is `session/load` re-supplying
`mcpServers` on the kind's carrier, a restart on a full context is `session/new` with text, and
the archive is on this computer.* What (iii) still asks is its first half — whether the CLI's own
resume state sits in the data volume, which `research/08` §5 and §6 show is a declared kit volume
or nothing (`~/.claude` is overlay in Docker's template, and the volumes are the kit's) — and that
is `17`'s kit to declare and this ticket's `spawn` to be indifferent to. `local` is held to the
same sentence: nothing in the null engine may hand an agent the archive's path either.

### 3. The user's door is `12`'s, not an output here

Output 7's last sentence and *Not this ticket*'s parenthesis both still list the user's door into
an AgentWorkspace — *open in VS Code* — as refused back with no ticket holding it, and `12` §5
reads that as `14` still holding whether the **kind** carries a door. Closed here, in one
direction: the control is `12`'s, on its put-to-the-author item 6, and it is not an output of this
ticket under either name. The interface fixes one door, the mailbox's carrier, and no second door
as a property of the kind — a property nobody has asked for is not pinned on a type. If the author
graduates the control, the property it needs is asked on the ticket that graduates it, and this
ticket's type is read then and not amended now. `ssh <name>.sbx` stays where `12` put it, the
engine's own mechanism and never on a pixel, and nothing here takes it onto the kind.

### 4. The transport, measured

`research/08` §5 ran the transport this ticket had only read: `initialize` over `sbx exec -i`
against the bridge inside a box in **0.43 s**, rc 0 on EOF, stderr empty; `-e` and `-w` carrying
env and cwd at 0.49 s; and `initialize` plus `session/new` over the same pipe, with a real `claude`
dialling the mailbox on `host.docker.internal` and the bearer intact. (The record's numbered
sections end at §7; the transport row is in §5 and is summarised under *What this settles for …
14*.) That is enough for the interface: `spawn` is a bare argv and a cwd for three runtimes and a
bridge entry for two, the Machine decides what runs them and where, and blobot keeps the
`LineTransport` on its side of a pipe that has now carried JSON-RPC both ways. What stays
provisional is `16`'s and `17`'s — the same pipe under a blobot image with `-t`, the login inside,
a real turn — and it moves a figure, never a shape. Output 2's own gate, *provisional until it has
carried a session under a blobot image*, goes to `17` with the engine.

**Priors.** ADR-0001 as `01` extended it, unchanged: every verb takes an Agent. ADR-0003: the
capabilities in §1 are the counterpart of the skills mount — what an agent inherits crosses as a
read-only mount or as text, never as a client that reads for it. ADR-0004: §2 is its refusal
applied to blobot's own file, and §1 is the same refusal at the protocol layer. First-demo ticket
14's asymmetry rule: three booleans false on four adapters and true on one is the guarantee that
holds for Alice and not for Bob, which is why §1 is a test and not a convention.

**Not this ticket.** The kit, the daemon, the installer, `sbx login`, the pool mapping, the pull
and the fetch route's run (`17`). The setup screen and its words (`08`, `09`). The control *open
in VS Code* (`12`, item 6). What the data volume holds (`13`, `17`).

## Note, 2026-09-05 (consistency pass)

`spawn` takes an explicit **environment layer**, allowlist-only, beside argv, cwd and the bridge
entry: every spawn path today carries one, and a box is where copy-everything inverts. Its shape
is this ticket's; how it travels into a box is `17`'s. The four items the split paragraph routed to
`17` are accepted there by name (`17`, *Handoffs*).
