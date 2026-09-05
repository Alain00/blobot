Type: grilling
Status: open
Blocked by: none

# Where the boundary goes: around the bridge, or inside the runtime

## Question

Two layers are available and they fail in opposite places.

**Outside** — srt around `spawnNpmBridge` (`adapters/acp/npm-bridge.ts:62`), which is one spawn
site for all three runtimes. Provider-agnostic by construction, which is exactly the shape the
architectural rules ask for, and it confines node, the bridge, the CLI and every tool at once.
It severs the mailbox (`02`) and it cannot hide the CLI's own credential from the CLI's own
`Read` tool, because they are the same process.

**Inside** — Claude's `sandbox.*` settings and Codex's `--sandbox` mode, translated per adapter
from one blobot word, exactly as `careful`/`normal`/`trusting` already are. Keeps the mailbox,
because the CLI is managing its own connections. Draws the one seam blobot cannot draw: the
CLI's process may read the credential, the bash subprocesses it spawns may not. Costs an
asymmetry (`03`) and costs configuration reach.

Decide which, or in what order, or both.

## What makes this hard

- **The delivery route on Claude is not obvious.** The sandbox is a *settings* surface, and
  ticket 14 refused seeding `<workspace>/.claude/settings.local.json` because an AgentWorkspace
  is a checkout that can be committed home. The lever that unlocked ticket 14's 2026-08-30
  amendment was discovering the bridge passes `allowedTools` through `_meta.claudeCode.options`
  untouched. **Establish whether it passes a `sandbox` object the same way.** If it does this is
  cheap; if it does not, the honest options are an env var, user-scope settings, or nothing.
- **"Both" is not free.** Two fences whose policies disagree produce a failure nobody can read
  from the transcript, and the app has exactly one word for it (`waiting`). If both, one of them
  owns the policy and the other is fixed.
- **The trust selector may not be the right control.** `careful`/`normal`/`trusting` is about
  *prompting*. A sandbox is about *reach*. Folding a boundary into the same three words makes
  the middle position mean two unrelated things; a second control is honest and is one more
  thing on a form ADR-0002 already keeps deliberately short.

## The prior this must not quietly break

*"A guarantee that holds for Alice and not for Bob is worse than no guarantee"* — ticket 14, on
refusing to hard-block on OpenCode where it could. That is exactly the trade the inside option
offers, and it is the same argument turned up one level, because a sandbox is a much bigger
claim than a `deny` rule. Either answer it or overturn it explicitly.

## Amendment, 2026-09-04 — absorbed, and a third layer exists

This was `.scratch/sandboxing/02`. Two things change.

**Five runtimes, not three.** `spawnNpmBridge` is still one spawn site, but Cursor already runs
with its own sandbox enabled by blobot, so the *inside* option is not hypothetical on every
runtime — it is partly shipped, unexamined, on one.

**There is a third layer now, and it is the reason the effort was widened.** Outside-the-bridge
and inside-the-runtime were the only two options while the machine was a given. If the Machine
is itself a choice, the boundary can be **the machine**: a container, a VM, another box. That
layer has properties neither of the other two has — it is runtime-agnostic like the outer fence,
it does not have to fight the CLI for its own credential like the inner line, and it costs the
mailbox and the worktree in ways `02` and `05` are the tickets for.

This ticket now decides between **three** layers, or an order among them, not two.

## Amendment, 2026-09-04 — this computer only

*Corrected in place on 2026-09-05, after two reviews read it against the sources on disk; what
each correction replaced is recorded under `## Comments`. The title above still reads* around the
bridge, or inside the runtime*; the live question is inside `local` only, and the title is left as
the record of where this started.*

`01`, `02` and `03` are resolved and the map is narrowed to this computer, so most of this ticket
is answered before it opens. The kinds are `local` and `box`. **For `box` the boundary is the
Machine**: a microVM on this computer (`01`, point 6), one instance per Agent (points 3 and 4)
with two volumes (point 4), a closed list of what it reaches and egress through a host-side proxy
(point 5); and the mailbox arrives through the one door the kind opens —
`host.docker.internal:<port>` behind a per-sandbox policy rule — which `02` read from Docker's
own documentation and `16` has since run (`research/08` §2 and §5: `sbx` v0.39.0 logged in, a
`curl` through that hostname with the bearer intact and `Host` rewritten to `localhost:<port>`,
an SSE stream held open through the proxy, and a real `claude` dialling the mailbox from a
`session/new` whose `mcpServers` named that hostname). The three-layer choice above collapses to
the Machine for `box`, and nothing in it is re-decided here.

What that boundary does for the CLI's own login has to be said exactly, because (b) leans on it.
The login lives on the *data* volume, **inside** the box (`01`, point 4; `research/02` §4, *the
OAuth token lives in the VM*; `research/06`, *"Proxy-managed OAuth isn't supported for
third-party sandbox agents, including kits that extend a built-in agent"*), so a shell in the box
can read it. What the box bounds is **where it can be sent** — the egress list — and what else
the agent can read, which is nothing of the user's but the one mount `01` point 5 names, the
operator's `~/.claude/skills`, read-only: no host home, no Keychain, no `~/.ssh`, no other
agent's volumes. That holds on every runtime because it is a property of the place rather than
of a fence inside the process that holds the login. It is not `03`'s promise. *The agent cannot
read what the CLI must send* was said of the outside option's credential masking (`research/02`
§2), and the box does not keep it; it keeps a different one, and neither is to be described as
the other.

What remains is **`local`, on its own**, and it is three questions. `01` point 6 names the first:
*`fenced` is not a kind but defence in depth inside `local`, which `04` decides.*

**The priors, by name.** First-demo 14's rule is engaged under (a) and answered there rather than
re-read. ADR-0003 is engaged under (a), because the scope that can widen a fence is the scope the
ADR keeps. ADR-0004 is engaged at the end of (a): no fence here touches `Read`. ADR-0001 is
**not** engaged, because nothing here touches grain: `01` extended it — a box joins the list of
what a working agent does not share — and every fence in this section is around one Agent's own
process subtree, which is already the pair.

### (a) Does `local` get an inner fence, and which layer owns its policy

The inner option, per runtime, as `03` found it (`research/04`, the table, which marks each cell
[OBS] or [DOC]):

- **Claude.** Reachable two ways. `_meta.claudeCode.options.sandbox` reaches the SDK unedited —
  **measured**, `research/07` §5, two real turns on this Mac: every key sent was honoured,
  `denyRead` hid `~/.ssh` from a shell, loopback reached only with `allowLocalBinding: true` and
  was refused silently without it, and an unlisted host raised a `SandboxNetworkAccess`
  permission request through the ordinary channel. By source, the SDK folds that object into the
  `--settings` tier, *the highest user-controlled settings tier* (`research/07` §5 item 6). Or
  user or managed settings, which is worse on its face: blobot authoring a rule in the operator's
  own `~/.claude/settings.json`, the thing fx's `/allowlist` was refused from the palette for
  doing. Either route meets the same trap, **and the trap is read, not measured.** By the docs
  (`research/04`, Claude section, [DOC]), `sandbox.enabled`, `excludedCommands`,
  `filesystem.allowWrite` and `network.allowLocalBinding` are any-scope keys, and for the array
  keys such as `excludedCommands` and `allowRead` Claude Code *merges entries from every scope
  the session loads*, so a repository's own `.claude/settings.json` **can, by the docs**, widen a
  fence blobot set from `_meta` — which is how `03`'s Answer put it, *can widen*. What
  `research/07` measured is the opposite direction only, every `_meta` key honoured, and it spent
  no turn on whether a project-scope array merges into the `--settings` tier; nothing on this map
  has watched a checkout widen a `_meta` fence. If it does, it is ADR-0003's sentence biting —
  *the settings scope decides what an agent can do* — and a checkout is an author of its own
  fence. There is no per-key way out: `settingSources` is a list of scopes, `user` / `project` /
  `local`, which the ADR's own amendment calls *far too coarse*, and the only keys held to user or
  managed scope are `filesystem.disabled`, `allowAppleEvents`, `strictAllowlist` and
  `tlsTerminate` — none of the ones a fence is made of. The scope that widens is `project`, and
  dropping it takes the workspace's `CLAUDE.md` and the repository's own skills with it: that
  reopens the ADR proper, *Why the project scope is the point, not a concession*, and not its
  amendment, which reinstated `user`. So the honest options are three — drop `project` and reopen
  the ADR; managed settings, a machine-wide file blobot would author with admin rights, worse than
  user scope on the same ground; or turn the fence on and accept that a checkout can widen it,
  recorded as such — and this ticket says which, **resting on that unmeasured merge and saying
  so**: the turn that measures it is under (b)'s order, and if the merge does not happen the
  three options collapse to one. On `failIfUnavailable`, the first draft here said *on by
  default*, and that is true of one route only. Through `_meta` the SDK forces it `true` when
  `enabled` is true and the key is absent, so a missing dependency fails the session rather than
  running unfenced (`research/07` §5 item 6). The CLI's own default is `false` — *a warning is
  shown and commands run unsandboxed* — so through user or managed settings, and for a checkout
  that turns `sandbox.enabled` on itself, the default is silence on stderr and not a refusal;
  `research/02` §3's *defaults true* is the SDK's, and both are true of their own caller. The
  refusal to start is a property of the `_meta` route — the shape `09` §4 has taken for a box —
  and question 1 carries it as that route's and never as the fence's.
- **Cursor.** Shipped: `cli-config.json` in blobot's own `CURSOR_CONFIG_DIR`, `sandbox: enabled`
  at every level, a constant. What it is: a fence on **writes** — cwd and tmp, `$HOME` and
  `.git/config` denied — with **no network fence at all**, because `allow_all` is the one mode in
  which the network side is off (`research/04`, Cursor section). `adapters/cursor/permissions.ts`
  describes it as network *on inside the sandbox*, and the live sandbox-versus-loopback test
  proves an in-process path the sandbox never touches. `03` relayed both to
  `.scratch/cursor-runtime/`. For this ticket the fact is narrower than the comment: what ships
  is a fence on writes and not on reach.
- **Codex.** Already on, and not chosen. `codex-acp` 1.7.0's `read-only` mode is a
  `workspaceWrite` sandbox with `networkAccess: false`; Codex's true `read-only` is unreachable
  through the bridge, and the only key `CODEX_CONFIG` merges is `writable_roots`, which widens.
  So the inner fence on Codex is a fact to acknowledge rather than a decision to take: the
  asserted mode name is true of the mode, and the fence behind it is workspace-write.
- **OpenCode and fx.** None, and no route to one (`research/04`; `OPENCODE_CONFIG_CONTENT` and
  `FX_PERMISSION_MODE` have nothing to put in).

And on all three the fence is around the **shell tool and its children, never the CLI** — the
login, `Read`, `Write` and the MCP client are outside it by design on every runtime, seen a third
time in `research/07` §5, where the mailbox's own handshake landed before the prompt with the
fence up. The mailbox needs no exemption anywhere (`02`, last row of its table), which is why
Cursor's shipped sandbox and its working mailbox were never the collision the earlier amendment
feared. What it also means: an inner fence changes nothing about ADR-0004's problem. `Read` is
ungated at every trust level and no inner fence confines reads by default (`03`); a fence that
hides `~/.ssh` from `curl` and not from `Read` has moved the leak, not closed it.

So the question is exact. **Turn on Claude's** — the one inner fence that exists and is off —
knowing a repository can, by the docs, widen it? **Leave Cursor's and Codex's** as the constants
they already are? And **which layer owns the policy** where two could. *Both is not free* was
written about srt outside and a runtime's sandbox inside, as if they were two things. On Claude
they are **the same library** — `claude` bundles srt (`research/02` §3) — which is what makes two
policies expressible in one vocabulary and what makes their disagreement invisible in a
transcript. If Claude's inner fence is on and any outer fence is ever on beside it, one owns the
policy and the other is fixed, and that sentence is written down before either ships.

**First-demo 14's rule, answered here and not re-read.** The rule's letter, under *Nothing is
hard-blocked*: *Rejected: blocking on OpenCode where we can and accepting it is advisory on
Claude* — an asymmetric **mechanism** was refused, on the ground that the user generalises, and
blobot claimed *prompting only*, which was true on both. Turning Claude's fence on inside `local`
is that shape again: a boundary on one runtime that two of the five cannot have and the other two
hold differently. An earlier draft of this section re-read the rule as a rule about *advertising*
— an improvement that does not hold everywhere is *unadvertised until somebody overturns that
rule* — and handed whether the author accepts that reading to `09` §5. That was routing around
it: `09` is `Blocked by: 04`, so question 1 would have been decided under a reading nobody had
accepted, and a *no* at `09` §5 would reopen this ticket by construction. The reading is taken
here. What the map has as precedent is `unattended`, which shipped asymmetric on 2026-08-31 and
shipped **said**: *only one runtime can express it, and the other three say so* (`core/trust.ts`;
first-demo 14's resolved section), with `trustLevelsFor` declaring which positions are real per
runtime and the form drawing only those. So the rule's letter, as it stands today, admits an
asymmetric mechanism whose asymmetry is said and refuses one that is silent — and *unadvertised*
is backed by no decision on this map. Two readings, put to the author as part of question 1
rather than assumed. **Said**, the `unattended` shape: a fence on `local` is a fact per runtime,
said where the runtime's other facts are said, with the words `09`'s. **Unadvertised**, on the
ground that 14's rule was about a *claim* and an unclaimed fence claims nothing — against which
stands the rule's own reason, that the user generalises, and a fence a checkout can widen is
exactly the case where the difference between Alice and Bob is invisible until it is not. `09` §5
keeps the words and the closing line's tense; it does not decide the reading. And whichever is
taken governs (b) as well, because a fence per platform hidden inside `local` is the same shape as
a fence per runtime hidden inside it.

**Inside a box, once more.** `13` says the inner fence inside a box is this ticket's call, and
this ticket had said it was `13`'s; it is taken here, because it is the same question with one
more fact. Claude's fence is bubblewrap and socat on Linux, Cursor's Linux stage is bubblewrap and
Landlock on a 6.2+ kernel with unprivileged userns. An image without them does not do one thing:
Claude's fence through `_meta` **fails the session**, because the SDK forces `failIfUnavailable`,
and through a settings file it **runs unfenced with a warning on stderr** (`research/07` §5 item
6); what Cursor's does in an image without them is not recorded on this map. Codex's is not a
choice blobot makes, and it is not the guarantee the first draft here made of it.
`INITIAL_AGENT_MODE=read-only` is asserted against the mode **name** the session reports;
`#assertPosture` sets the name if it differs and is fatal only if `session/set_mode` fails. That
confirms the name and never the fence, exactly as `03` found on `local`: the name is `read-only`,
the fence behind it workspace-write. Whether `codex` reports the same name in a guest whose kernel
lacks Landlock, and whether it then refuses or runs unfenced, is measured nowhere on this map —
`research/04` ran the Seatbelt launcher on macOS only — so on Codex what is known inside a box is
an inference from a name, and the turn that makes it a fact is `16`'s conditional half, spent only
if a fence is turned on inside a box at all. For Claude and Cursor, decide whether a runtime's
own fence runs inside a box as the same per-runtime constant it is on `local`, or is off because
the box is the boundary and a second fence inside it is the *both is not free* clause with
nothing left to buy. If off, there are two doors to close, and the first draft closed the second
by fiat: an explicit `enabled: false` in `_meta` is the cheapest way to say *off*, but whether a
scalar in the `--settings` tier outranks a project-scope `sandbox.enabled: true` riding into the
box with the clone is **unmeasured** — `research/04` says the array keys merge and says nothing
about a boolean's precedence — so *`04` closes the second door*, as `13` read it, is not yet
true, and `13` is right to hand it back. The mechanism is under question 3 for the author, with
its turn under (b)'s order. `13` reads the answer for whether `bwrap` is in the image.

### (b) Is srt around the bridge worth shipping in `local` at all, now that `box` exists

The outer fence was wanted for one property: *the same fence whatever is behind it*. Two
corrections to where it would go, both this ticket's own. The earlier amendment's *`spawnNpmBridge`
is still one spawn site* was wrong, and the first correction of it — that the wrap point *exists,
one level below*, at `childEnvironment` — was wrong too. Checked: `childEnvironment`
(`adapters/acp/child-env.ts`) composes an environment dictionary and spawns nothing. There are
**four `spawn()` calls serving the five runtimes** — `acp/npm-bridge.ts:63` for Claude and Codex
through their `stdio-bridge.ts`, `opencode/stdio.ts:46`, `fx/stdio.ts:48` and
`cursor/stdio.ts:66` — and srt wraps a **command**: `wrapWithSandbox` takes a command line and
returns one, which `research/02`'s probe spawned under `shell: true`, and no environment carries
that. One env function is shared; no spawn point is. So shipping this means editing four spawn
sites or building a shared spawn helper that does not exist, a cost the first list omitted, and
naming that seam is `14`'s — its output 6, *`local`'s implementation of the interface, with the
seam `04`'s choices ride through named*; this ticket decides what goes through it. And `box` now
has the property the fence was wanted for on every runtime, with a stronger boundary than a
Seatbelt profile (`research/06`), and has it by construction rather than by policy. The outer
fence has to argue for itself as defence in depth **inside `local`**, and the case is in the
measurements:

- **It holds on one platform and not the other, by the same route.** On macOS the mailbox
  survives under `allowLocalBinding` — measured `mailbox-ok`, `research/02` §1 — at the cost of
  admitting every loopback service on the host, a per-port rule being expressible in SBPL and not
  offered. On Linux the network namespace is gone and that key does not exist; the proxy route
  (`research/03` (a), A1) is read and not run and depends on **five unmeasured answers**, one per
  runtime's MCP client honouring `HTTP_PROXY` for a loopback URL; the unix carrier (A2) admits
  every socket on the host, `docker.sock` included, and is refused. So today this is a fence that
  holds on Guillermo's machine and not on Alain's. `research/02` §1 is right that this is a
  different asymmetry from first-demo 14's: that rule was written about one user generalising
  across agents on one machine, and one user on one platform never meets the other platform's
  fence. What carries over is the rule's reason rather than its letter, and (a) has now taken the
  reading, so the same one holds here: **said**, or nothing. A fence per platform is sayable — as
  a fact of this computer, which is where detection already says its facts — but what it would
  say differs by platform in *reach* and not only in presence: on macOS it admits every loopback
  service on the host, on Linux its door is unmeasured. That is the ground, and it is narrower
  than the first draft's *cannot be said at all*, which is withdrawn: that draft held the
  platform axis unsayable while admitting the runtime axis under (a) as unadvertised, and the two
  are the same shape.
- **What it would buy that nothing else on either kind does**: credential masking (`research/02`
  §2, srt 0.0.75) — env on both platforms, files degrading to `deny` on macOS — and a read fence
  (`denyRead`) that otherwise only Claude's own sandbox offers, and only for the shell. Both are
  real, and neither is what the box does. The box does not hide the login from the agent — it is
  on the data volume where a shell can read it — it bounds where the login can go and keeps the
  rest of the user's machine out of reach. So masking is the one property this fence would have
  that no other layer has on any kind, and the case for it inside `local` is made on that alone.
  It is also unmeasured where it matters: on this Mac the login is in the Keychain, not in a file
  srt could mask or deny, so whether a `claude` under srt can sign at all, and whether the shell
  beside it can ask the Keychain the same question, are one mach-lookup question
  (`allowMachLookup`, `research/02` §2) with no answer yet.
- **What it costs beyond the platform**: a second policy vocabulary beside Claude's own sandbox
  (the ownership clause in (a)); a fence blobot maintains against srt's release cadence, for a
  claim it has already decided not to make; the four spawn sites above, or the helper that
  replaces them; and one more thing for detection to know — whether `sandbox-exec` or `bwrap` is
  on this computer — which `08` has no state for and no `Blocked by: 04` line to receive one
  through, on a kind whose whole point is that nothing needs installing. A *ship* on question 4
  reopens `08` by name, the way `09` §4 names its readers.

The decision is ship, keep as measured knowledge, or refuse — and *keep* is a legitimate answer
that costs nothing, because `research/02` and `research/03` already hold everything a later
session would need. What is not legitimate is a refusal on the ground that `box` already has what
this offers, because it does not: a box bounds where the login can be sent, this bounds who can
read it, and they are different guarantees on different kinds. A refusal, if it comes, stands on
the platform, the loopback door, the second vocabulary, the four spawn sites and the Keychain, and
says so.

**The turns, and their order.** The first draft said *two turns, one order* and *spends neither
before the author answers*. The second of them was already spent when that was written — by
`16`'s record, `research/07` §5, before any answer and before the order was set down (`16`'s
amendment, point 2) — so (a) reads it whether or not the fence is turned on, and the order now
reads as follows. First, still, a real `claude` under an outer fence on this Mac: does it sign
from the Keychain (`allowMachLookup`, `research/02` §2; `research/07` §5 item 8 says how — wrap
the bridge process itself and read `initialize`) — spent only if (b) is not refused on the
merits, and closing (b) on the one platform where the mailbox is measured to survive if the
answer is no. Then the one turn this review added, spent only if (a) turns Claude's fence on: a
throwaway checkout with two things in its own `.claude/settings.json` beside a `_meta` fence —
`sandbox.excludedCommands` or `allowRead`, to see whether a project-scope array merges into the
`--settings` tier, and `sandbox.enabled: true` against `enabled: false` in `_meta`, to see which
scalar wins. `research/07`'s reserved Turn C — `{enabled: true}` at `careful`, separating
`allowedTools` from `autoAllowBashIfSandboxed` — rides the same session. Nothing is spent before
the author answers, because either answer can make its turn unnecessary.

### (c) One control or two

**Prompting is per agent.** `careful` / `normal` / `trusting` / `unattended` (`core/trust.ts`): a
word on the AgentProfile, carried onto the Agent, taken at the team's next start, translated by
each adapter from its own end. It answers *what blobot vouches for before the runtime asks*.

**Reach is per kind.** What a Machine kind lets a turn touch: this computer, or two volumes, one
door and an egress list (`01`, point 5). The kind is placed per Agent with a Team default (`01`,
point 3), so both controls sit on the agent.

The question this ticket's body raised — *the trust selector may not be the right control* — is
now askable exactly, and `10` waits on the answer because it has the same shape at the Machine
layer. **Are they two controls, refused to fold in either direction?** A trust word that also
meant *fenced* would make the middle of a scale mean two unrelated things; a Machine kind that
also meant *prompts less* would make choosing a place a permission decision nobody was shown. The
evidence for two is a precedent that already ships and says so in its own comment: Cursor's
sandbox is *a constant, not a dial … ticket 10's isolation, never ticket 14's lever*
(`adapters/cursor/permissions.ts` — first-demo's tickets 10 and 14, AgentWorkspaces and the
posture, not this map's). The evidence against is ADR-0002's argument for a short form, and it is
not paid here either way, because the Machine is chosen in the folder step and on the agent's own
row (`01`), not under *how it answers*. If two, whatever (a) decides about Claude's inner fence
takes the same shape: on or off per runtime as a property of `local`, never a position on the
trust selector.

Whatever the answer, one dependency between them already exists and is not a fold: `01` point 6
makes the fifth level, *everything*, choosable only for an Agent on a `box`. How the form shows a
level the Machine does not admit — absent, as `levelsFor` in `TrustPick.tsx` draws a level a
runtime lacks (`trustLevelsFor` in `runtime-for.ts` is only the per-runtime list it draws from),
or the one row that is drawn and says why — is `10` §2's question and is not decided here. An
earlier draft of this section leaned toward the row that is drawn and says why, and `10` §2
quotes that lean; it is withdrawn here, with no lean either way, because the reason the *absent*
rule was written — a provider the form may not name — does not apply to a Machine the form may
name on `01`'s own terms, and whether the rule holds anyway is exactly what `10` §2 is to decide.

### What this ticket now puts to the author

1. Whether Claude's inner fence is turned on inside `local`, and under which reading of
   first-demo 14's rule — **said**, the `unattended` shape, or **unadvertised**, which no decision
   backs; if on, whether `_meta` owns the policy, and which of the three answers to a widening
   checkout is taken — drop `project` and reopen ADR-0003 proper, managed settings, or accept it
   and record it — knowing the widening is read from the docs and not yet measured, with the
   refusal to start kept and understood as the `_meta` route's.
2. Whether Cursor's and Codex's already-on fences are left as the constants they are,
   acknowledged as facts of `local` on those two runtimes.
3. Whether a runtime's own fence runs inside a box — the same constant per runtime as on
   `local`, or off because the box is the boundary — and, if off, whether *off* is said as
   `enabled: false` in `_meta`, knowing a `_meta` scalar against a project-scope `true` is
   unmeasured. `13` reads this for the image; it lists no `Blocked by: 04`, and carries its
   `bwrap` output as provisional until the answer comes, which it already says.
4. Whether srt around the bridge ships, is kept as measured knowledge, or is refused, on the
   grounds (b) names and not on a property `box` does not have. A *ship* edits four spawn sites
   or builds one helper, on `14`'s seam, and reopens `08` by name.
5. Whether prompting and reach are two controls, refused to fold in either direction, with `01`
   point 6 as the one dependency between them. `10` §2 has pre-read this as refused — *refuse to
   fold one into the other* — and built its second shape on it; if the answer is *one control*,
   that bullet reverses and `10` is reopened by name.

### Not this ticket

The copy, including whether the word *sandbox* appears, what `local` says about an inner fence
once the reading is taken, and what the permission block says inside a `box` (`09`). What follows
from the fifth level, including how the form draws a level the Machine does not admit (`10`).
What the box holds (`13`, which reads question 3 for whether `bwrap` is in the image). The engine
interface, the box lifecycle, and the seam an outer fence would ride through (`14` on this map).
The egress list and how a blocked request is said (`15`). The Linux carrier for the mailbox
(`02`'s unmeasured list, Alain's). `16`'s other items, the `sbx` half, in `research/08`; the
Keychain turn is this ticket's on `16`'s amendment point 2, and is spent here or not at all. The
two findings about shipped code — Codex's mode name and Cursor's `allow_all` comment — which `03`
relayed to their own efforts.

## Comments

**2026-09-04 — measured after the amendment above was first written (`research/07`, section
5).** Two real turns on `claude` 2.1.260 through the pinned bridge, on this Mac. The amendment's
"neither verified live" was false in the right direction from that hour:
**`_meta.claudeCode.options.sandbox` reaches the SDK unedited** and every key was honoured —
`denyRead: ['~/.ssh']` hid the directory
from a Bash `ls` (`Operation not permitted`, 0 of 7 entries); loopback to the mailbox reached
**only** with `network.allowLocalBinding: true`, and with it `false` was blocked silently, no
prompt and no trace; `example.com` raised a **`SandboxNetworkAccess` permission request** through
the ordinary `session/request_permission` channel (Deny / Allow Once / Always Allow), and a
rejection wrote `deny network-outbound example.com:443 (user denied)` back to the model. So on
Claude, *blocked and said* inside `local` already has a shape: the permission block blobot draws.
Unseparated: whether no Bash call prompted because `trusting`'s `allowedTools` vouched them or
because `autoAllowBashIfSandboxed` defaults on; the third turn that separates them is written in
`research/07` and unspent. The Keychain half (a CLI *inside* an srt fence) was not measured,
since this fence is Bash-only by construction. This note first stood as a `###` inside the
amendment and left the lines it corrected as they were; the body was corrected in place on
2026-09-05 and the note is kept as the record.

**2026-09-05 — `16` ran the box's door (`research/08`).** The body first said the
`host.docker.internal` door *has not run, and does not run until `sbx login` is spent*. True when
written and stale minutes later: `sbx` v0.39.0 logged in, a `curl` through the door with the
bearer intact, SSE through the proxy, and a real `claude` dialling the mailbox from `session/new`
with `mcpServers` on that hostname. Not load-bearing here — `box` is not re-decided on this
ticket — and corrected in the body above.

**2026-09-05 — corrected after two reviews.** What the body above replaced, so the earlier
reading is not lost: (a) said a checkout *widens* a `_meta` fence as fact, and says *can, by the
docs* now, with question 1 resting on the unmeasured merge; (a) said `failIfUnavailable` is *on by
default* as a property of the fence, and it is the SDK's default on the `_meta` route only, the
CLI's being silence; the box paragraph said Codex's fence *is on in the box or the launch is
refused*, and `#assertPosture` confirms a mode name, never the fence; (b) named `childEnvironment`
as the outer fence's wrap point, and it composes an environment and spawns nothing — there are
four spawn sites, `14`'s seam; first-demo 14's rule was re-read as *unadvertised* and its
acceptance handed to `09` §5, which is blocked on this ticket, and the reading is now put to the
author under question 1 with `unattended` as the precedent for *said*; the turns paragraph said
neither turn was spent, and the `_meta` one had been; `01` point 6 was cited for *one per
Agent*, which is points 3 and 4; *nothing of the user's* omitted the skills mount `01` point 5
names; (c) credited `trustLevelsFor` with drawing, which `levelsFor` does, and had withdrawn a lean
`10` §2 still quotes without saying so; (b)'s *cannot be said at all* on the platform axis
contradicted (a)'s admission of the runtime axis and is narrowed to reach; *a fourth thing for
`08`'s detection* counted states `08` does not have; `16` and the `08` reopen were missing from
*Not this ticket* and question 4; `research/06` was paraphrased and is quoted; and the measured
note was a `###` inside the amendment rather than a comment. `Blocked by` stays `none`: nothing
here waits on another ticket, only on turns and on the author.

### Measured after the amendment above was written, 2026-09-04 (`research/07`, section 5)

Two real turns on `claude` 2.1.260 through the pinned bridge, on this Mac. The amendment's "neither
verified live" is now false in the right direction: **`_meta.claudeCode.options.sandbox` reaches
the SDK unedited** and every key was honoured — `denyRead: ['~/.ssh']` hid the directory from a
Bash `ls` (`Operation not permitted`, 0 of 7 entries); loopback to the mailbox reached **only**
with `network.allowLocalBinding: true`, and with it `false` was blocked silently, no prompt and no
trace; `example.com` raised a **`SandboxNetworkAccess` permission request** through the ordinary
`session/request_permission` channel (Deny / Allow Once / Always Allow), and a rejection wrote
`deny network-outbound example.com:443 (user denied)` back to the model. So on Claude, *blocked
and said* inside `local` already has a shape: the permission block blobot draws. Unseparated:
whether no Bash call prompted because `trusting`'s `allowedTools` vouched them or because
`autoAllowBashIfSandboxed` defaults on; the third turn that separates them is written in
`research/07` and unspent. The Keychain half (a CLI *inside* an srt fence) was not measured, since
this fence is Bash-only by construction. Two source facts from the same record: the SDK forces
`failIfUnavailable: true` when unset while the CLI's own default is `false`, so the refusal-to-start
holds on the `_meta` route and not on a settings-file one; and whether a project-scope array merges
into a `_meta` fence — the widening (a) rests on — was **not** measured, only read.
