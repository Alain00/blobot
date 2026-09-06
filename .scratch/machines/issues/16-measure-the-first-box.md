Type: task
Status: claimed
Blocked by: none

# Measure the first box

## Current continuation — 2026-09-06

Claimed for the continuous implementation goal. Reconcile the historical checklist
against the later measured RC5, worktree, image, adapter and network evidence first.
Do not repeat superseded clone/allowlist/base work or infer provider/platform results
that were not measured. The remaining live acceptance checks stay explicit.

[The evidence ledger](../research/53-first-box-evidence-ledger.md) reconciles the
historical checklist without respending superseded probes. Four signed-out ACP
initializes were observed in RC5/arm64; fx returns its authentication gate. Ten
native Docker CI smokes cover published image architectures, not sbx Linux/KVM.
Real guest login/session/MCP/turn evidence per runtime, attachment-sized JSON
through real sbx and the remaining platform coverage are still open. This ticket
is not resolved by the ledger or by another ticket's synthetic runtime fixtures.

## Question

Three tickets decided the `box` kind on paper and nothing has run. Given from `01`: a microVM on
this computer, one per Agent, two volumes, blobot's own image per runtime, `sbx` first. Given
from `02`: the carrier is `http://host.docker.internal:<port>/agents/<id>/mcp` plus one
`sbx policy allow network --sandbox <name> localhost:<port>` line, the mailbox's three constants
unchanged. Given from `03`: the runtimes' own fences confine the shell and never the CLI, so a
box is the first boundary that fences the CLI too.

All of it rests on `research/03` (c) and `research/06`, marked [DOC] and *unrun* because `sbx`
was never logged in, and `13`, `14`, `15` and `05` are each waiting on a measurement. This ticket
spends them, in order, and records them as `research/07-the-first-box.md`: [OBS] on every line,
nothing [DOC], platform and versions named.

**One act is the user's; the rest is unattended.** `sbx login` is Docker OAuth in a browser
(`research/02` §4). Guillermo does it by hand and blobot reads nothing of it — *no credential
storage*, kept as `claude auth login` keeps it. Items 1 to 3 cost no tokens; 4 and 5 cost a turn.

1. **The mailbox from inside a `shell` sandbox**: `host.docker.internal:<port>` with the bearer,
   then the SSE stream — `research/03` (c)'s exact commands. Does the bearer arrive unchanged,
   does the stream stay open, does `127.0.0.1` fail as the docs say?
2. **`sbx create --clone` on a worktree plus its repository**, then `git fetch sandbox-<name>` on
   the host. Does a clone from a worktree refuse, does the repository beside it cure that, and
   does the branch come home named `blobot/<team>/<agent>`?
3. **RAM, disk and boot time** of an empty sandbox, and the same three figures stopped — sparse
   ext4 and no kernel, `research/06` reads; measure it.
4. **Docker's own claude image reaching the mailbox** via `mcpServers` on that hostname, with a
   blobot-launched bridge inside over `sbx exec -i`, stdin kept open. Does JSON-RPC survive the
   transport, does the CLI dial the mailbox, and does a blobot-launched `claude` start at all
   with `~/.claude` absent (`research/02` §4)?
5. **Live, on the `local` kind**: does `_meta.claudeCode.options.sandbox` pass through the bridge
   unedited (`research/02` §3, by source only), and does a real `claude` under an srt fence on
   macOS authenticate from the Keychain (`research/02` §2)? `research/02`'s two open items, and
   `04`'s first spend.
6. **A first hand-built image** — `node:22`, the pinned `claude-agent-acp` 0.70.0 and `claude` —
   as an `sbx` template under `-t`. Does it meet the kit contract (`agent` at uid 1000,
   `/home/agent`, proxy variables across sudo; `research/06`, *Docker Sandboxes*), or which part
   fails? Which `claude` goes in, the adapter's pin or this Mac's — say which.

**Nothing concludes from an exit code.** An installer exits 0 having installed nothing; a
`sbx create` that returns is not a box that boots. Every line in `research/07` is a thing seen: a
body, a byte count, a figure with a unit.

Priors. ADR-0001 as `01` extended it, one box per Agent, is what item 2's naming tests.
ADR-0003: a sandbox does not pick up `~/.claude`, so item 4 is where *all three scopes* meets a
Machine that cannot load them. ADR-0004: a worktree at its own absolute path is a mount, not a
link; say whether that holds inside. First-demo ticket 14's rule: item 6 is one runtime, so it
measures `13`'s contract and never offers `box` for Alice alone.

## What must come out of it

1. `research/07-the-first-box.md`, [OBS] throughout, one section per item, commands as run so
   Alain can repeat items 1 to 4 on Linux with KVM.
2. What each neighbour takes from it, left on that ticket as a comment and decided there: `13`
   the kit contract and what a blobot-launched CLI needs (items 4, 6); `14` the `exec -i`
   transport, a stopped box's figures, `_meta` through the bridge (items 3, 4, 5); `15` the
   bearer and the stream through the proxy, and whether a refusal is logged (item 1); `05`
   `--clone` and the branch's name after the fetch (item 2); `04` the Keychain (item 5).
3. What was not run, and why, so that nobody reads an absence as a no.

## Not this ticket

Deciding anything. The image (`13`), the engine and lifecycle (`14`), egress and how a block is
said (`15`), the Workspace (`05`), the inner fence (`04`), `sbx login` on screen and a Docker
account against *no cloud dependencies* (`08`, `09`). The Linux half of every item is Alain's
(`research/03`, *What is still unmeasured*).

## Amendment, 2026-09-04 — what has already run, and what this ticket still owns

Two reviews read the body against the sources on disk and found its record wrong in several
places. The body stands as what was believed at 20:50; every correction is here. **Revised
2026-09-05** against two further reviews and `research/08`: the record of what has run was stale
by one file, one blocking claim was false on disk, two data were routed from a subject that cannot
answer them, and *the default policy* named no preset. Every line below is the revised one.

**1. Two records exist, and most of the `sbx` half is spent.** The body says *nothing has run*
and names `research/07` as a file to be made. Two files hold the record now, and neither was
written by a claimant — the tracker forbids it (*claim: set `Status: claimed` and save before any
work*), it happened twice, and both are recorded here rather than hidden.
`research/07-the-first-box.md`, written by the charting session four minutes after the body,
holds section (5), [OBS], two real turns on this Mac against `claude` 2.1.260 and the pinned bridge
0.70.0: `_meta.claudeCode.options.sandbox` reaches the SDK unedited; `denyRead: ['~/.ssh']` hid
the directory from a shell; the loopback mailbox was reached from Bash with
`network.allowLocalBinding: true` and refused silently without it; an unlisted host raised a
`SandboxNetworkAccess` permission request. The body's *"`research/02` §3, by source only"* is
stale on that half. The other half — does a real `claude` under an srt fence on macOS sign from
the Keychain — research/07 §5 point 8 says in its own words *is not measured by this, and must not
be read as measured*: the SDK sandbox fences Bash and its children, the process holding the login
sat outside it in both turns, and the test that answers it wraps the bridge process itself. Then
`research/08-the-first-box-sbx.md`, measured 2026-09-04 and written at 00:52 the next day with this
ticket still `open`: `sbx` v0.39.0 after `sbx login`, zero tokens, holding **item 1** (§2), **the
`--clone` run of item 2** (§3), **item 3** (§4), **item 4a** (§5) and **the first probe of item
6** (§6) — plus one state change that outlives it, `sbx policy init deny-all`, undone by
`sbx policy reset`, and two pulled templates kept in the store. `15` already cites it by section.
So research/07's headers for (1) to (4) and (6), which still read *not run, waits on `sbx login`*,
are stale, and the split is **kept rather than folded**: `research/07` is the `_meta` half and
`research/08` the `sbx` half, two tickets cite research/08 by section, and what a claimant adds
goes into research/08 as new sections, with research/07's empty headers pointed at it rather than
filled. Output 1 reads that way now. The ticket stays `open`; what a claimant spends, and does not
re-spend, is in 6.

**2. Item 5 is `04`'s, and leaves this ticket.** `04`'s amendment claims both halves — *two
turns, one order*: the Keychain under srt first, spent only if its (b) is not refused on the
merits, then `session/new` with `sandbox` in `_meta`, spent only if its (a) turns Claude's fence
on — and spends neither before the author answers. `04` is `Blocked by: none` and on the frontier
beside this ticket, so two sessions would have spent the same turns. And it was never a box
measurement: it runs on the `local` kind, under a title that says *box*. So **`04` keeps both**,
with one comment to take from here: its second turn is on disk as research/07 §5 — `04`'s own tail
records it as *measured after the amendment above was written*, and that sequence is `04`'s to
state and stands — so (a) reads it whether or not the fence is turned on, and only the Keychain
turn is still to spend. research/07's own *What the neighbours take* addresses the `_meta` result
to `14`; `14` has already handed it on to `04`, which is where it lands — `14` never asked about
`_meta`, and *whether `_meta` owns the policy* is `04`'s question 1. This amendment edits
research/07 nowhere.

**3. Item 6 stays here, and `13` has said why.** `13`'s *Research to run first* named the same
measurement, and its current text withdraws the spend: *"the measurements this ticket needs are
`16`'s ... borrows two items by name rather than re-spending them"* — item 6 confirms its output
1, marked provisional until then, and the `~/.claude`-absent question bears on its output 2. So
one ticket runs it and one reads it. What research/08 §6 already holds: `-t` takes a store-local
tag as it is and reads an unknown one as a registry reference (a 403 pull); `template load` takes
a tar, so a blobot image needs no Docker daemon on the Mac; and a snapshot of Docker's `claude` box
under `-t` on the `shell` kit booted in 3.7 s with the CLI and the bridge present at uid 1000,
**one** ext4 mount and eight sentinels — the volumes and the credentials are the **kit's** and not
the image's. What is unrun is the contract on a `node:22` base — the user, the home, the proxy
variables across `sudo` — and the bridge's `initialize` from it, with the CLI never made to speak,
because a turn inside needs a login inside and that is item 4b's cost, paid once. Two corrections
to the item, both `13`'s. *"The adapter's pin or this Mac's"* named a pin that does not exist and
a binary that cannot go: no adapter pins a CLI — `BRIDGE_VERSION` in
`adapters/claude/stdio-bridge.ts`, matching `packages/core/package.json`, pins the bridge, and
`npm-bridge.ts` checks that spec against what the bridge reports, as `13` states it — and this
Mac's 2.1.260 is a Mach-O arm64 binary (research/07's header) that no Linux image can hold. So what
goes in the template is **2.1.260, named through `claude.ai/install.sh`**: the version measured
here, said in the record, with the choice itself `13`'s output 3; Docker's own template ships
2.1.246 (research/08 §5). And **two data move here from item 4**, for the reason 6 gives: what
`initialize` answers with `~/.claude` absent, and where a login inside comes to rest. One
conditional half, `13`'s ask: whether `bwrap` runs inside — an unprivileged user namespace in a
runc container inside the microVM — spent only if `04` turns Claude's fence on, and otherwise
written down as not run and why.

**4. What this ticket owns is items 1 to 4 and 6, and it gates one neighbour.** The body says
`13`, `14`, `15` and `05` *are each waiting on a measurement*, and the first version of this point
said none lists `Blocked by: 16` and this ticket *blocks nobody*. That was false on disk: `15`
reads `Blocked by: 13, 14, 16`, its body says what it takes from here *is left there as a comment
when it resolves*, and the tracker's rule is that a ticket is unblocked only when every file it
lists is `resolved`. So this ticket is a **gate on `15`** until it resolves, and a **record** for
the other three: `02` left these on its *still unmeasured* list when it resolved and nobody else
claims them, and `13` (*not blocked on it*), `05` (*blocked by nothing, on purpose*) and `14`
(taking the stopped-box figure and the transport as settled *when* items 3 and 4 have run) each
resolve on paper with the figure marked provisional, so for them it lands as comments and moves a
figure, never a shape. What unblocks `15` is resolving this ticket, and its item 1 — the one thing
`15` names from here — is spent (research/08 §2); whether `15` waited on that alone and could drop
this ticket from its line is `15`'s line to change and not this ticket's, said here so a claimant
weighs the remainder in 6 against a neighbour standing behind it. `Blocked by: none` above is right
and stays; the neighbours' lines stay as they are.

**5. Attributions, and one prior, corrected.**

- The *given from `03`* was wrong twice. `03` credited *the agent cannot read what the CLI must
  send* to the outside option, a fence around the bridge, not to a box; and `04`'s amendment now
  says the box does not keep that promise but a different one — the login is on the data volume,
  where a shell inside can read it; what the box bounds is **where it can be sent**, the egress
  list, and what else the agent can read, which is nothing of the user's — and that holds on
  every runtime because it is a property of the place rather than of a fence inside the process
  that holds the login. *First* is build order, `01` point 6, and nothing else.
- `research/02` §4 names `sbx login` as Docker OAuth and a prerequisite; *opens a browser* is
  `research/06`'s (*Login*), so the body's citation was half right and not wrong. And
  `research/06` is largely [OBS] — the cask, `sbx create --help`, the embedded kit specs, read
  from the installed v0.39.0 — so *marked [DOC]* was wrong; *unrun* was right, and only of a
  sandbox itself.
- Item 3's *"sparse ext4 and no kernel, `research/06` reads"*. `research/06` reads that block
  volumes are sparse ext4 images and every volume must set a size, and gives the running figure,
  50% of host RAM up to 32 GiB; it says nothing about a stopped box. *Volumes, no kernel* is
  `14`'s hypothesis — `14` carries the same *as `research/06` reads it* and is wrong by the same
  line, worth a comment there — and the one source on a stopped box, `research/02` §4's
  *stopping keeps the VM*, cuts the other way. **Measured, both hold of different things**
  (research/08 §4): stopped, the shim process is gone and the daemon alone holds 161 to 180 MB, so
  `14`'s *no kernel* held on RAM; what a stop keeps is the sandbox object and its disk — `sbx ls`
  says `stopped`, and the next `exec` boots it in 0.99 s — and a box with no attached session stops
  itself 30 s after the session ends. `14` takes the figure; the comment there is still owed.
- *One act is the user's.* The person typing `sbx login` here is the author running a
  measurement, and the product's user *never sees or types a Docker command*. That act is spent;
  **two more are the author's** now, both logins inside, on item 4b.
- The ADR-0004 prior was written against a shape `01` replaced. *A worktree at its own absolute
  path is a mount, not a link* describes the mount `research/03` (c) read and `05` refused; `01`
  point 4's workspace volume holds the AgentWorkspace **as a clone**, and item 2 tests a clone.
  Where ADR-0004 bites is the **host repository mounted read-only beside it**, which `--clone` is
  defined by: the user's checkout is outside the AgentWorkspace, `Read`, `Glob` and `Grep` never
  prompt, and inside Docker's own kit nothing prompts at all, so what a shell there can read the
  agent can read — `.env` and every gitignored file, the reflog, the stashes. `05` §6 says so in
  those words and refuses the mount outright, never as a fallback. What research/08 saw: the
  primary workspace at the host's absolute path, virtiofs read-write, in the bind-mounted `shell`
  box that served only as the door's probe (§2) — the shape `05` §6 refuses for a Workspace; and
  the `--clone` clone at the repository's own absolute path with `origin` the read-only mount at
  `/run/sandbox/source` (§3). It did **not** run the readability test, so the hole is still argued
  and not shown; item 2 keeps it.

**6. Items 1 to 4, restated, with what is spent marked.** *Nothing concludes from an exit code*
is unchanged. **The preset is named for every item**, because *the default policy* was undefined
and the datum handed to `15` was unsized by it: every box in this record runs under **`deny-all`**,
the baseline research/08 initialised and the only one under which an egress row measures anything,
plus whatever rules the kit brings of its own, which the record lists. What `balanced` admits —
the *broad wildcards* of `research/02` §4 — is unrun, and is `15`'s to ask for or refuse, since the
preset is `15`'s (`08` §1).

- **1, spent** (research/08 §2 — `shell` kit, `deny-all`, one rule scoped to the sandbox for
  `localhost:<port>`): the bearer arrived unchanged; `Host` was rewritten to `localhost:<port>`,
  the peer the proxy on the host's loopback, no `Via` and no `X-Forwarded-For`; SSE stayed open
  through the proxy for its 3 s on one upstream connection; `127.0.0.1` and `localhost` inside
  were refused (rc 7, the VM's own loopback); an unlisted host answered a synthesized **403** and
  nothing timed out; `sbx policy log` lists every allowed and refused host with a count and a
  reason, `--json` too, beside the template's own boot noise (`ports.ubuntu.com`,
  `download.docker.com`); the `shell` kit brought `allow openrouter.ai` of its own; and a scoped
  rule dies with its sandbox (§7).
- **2, half spent, and re-aimed on `05`'s note to this ticket.** Spent (§3): `--clone` refuses a
  worktree, with or without the repository beside it; from the main repository it took 3.9 s, ran
  a git daemon *in the guest* published on a host loopback port, put the clone at the repository's
  own absolute path with `origin` the read-only mount, and the host's fetch took 38 ms and landed
  the branch under `refs/remotes/sandbox-<name>/<branch>` and `refs/sandboxes/<name>/<branch>` —
  the name intact under two remote namespaces, `refs/heads/` never touched, which is `05` §1's
  shape *(b)* by the engine's own hand; `refs/sandboxes/*` survives `rm`. Unrun, and what `05` and
  `14` wait on, is the other shape: a **narrow clone made on the host** — one branch at its
  current commit, `--single-branch --no-tags`, never `--shared` or `--reference` — put into the
  workspace volume before the box starts, and the branch **fetched home from it** with no host
  checkout in view. Two questions, in order. Whether the engine offers any way to fill a volume
  from the host before the box starts; if it does not, whether a bundle carried in over
  `sbx exec -i` as bytes and cloned inside is the same shape by another route. Then the fetch
  home without `--clone`'s remote: a bundle written inside and read out over `sbx exec`, or a
  remote helper over `sbx exec -i` — what worked, what did not, what a fetch costs. That is `14`'s
  to build and this ticket's to see once; it decides nothing. And one line from ADR-0004 that
  research/08 did not run: from a shell inside a `--clone` box, is the read-only mount readable —
  a gitignored `.env`, `git reflog`, `git stash list`, `git branch --list 'blobot/*'`? A yes is
  `05` §6's hole, measured. In every shape, the branch comes home named `blobot/<team>/<agent>`,
  or the record says what name it came home under.
- **3, spent** (§4): boot 34 s with the template to pull, 3.9 s pulled, 8.9 s for Docker's
  `claude` kit, 3.7 s from a store-local snapshot; running, 0.8 to 1.7 GB host RSS on the shim,
  the guest 12 vCPU and 12 GiB (half the host) with no swap and a 20 G overlay root; stopped, the
  shim gone and the daemon alone 161 to 180 MB, `sbx stop` in 0.16 s and the first `exec` after
  it in 0.99 s; the data dir 528K to 3.3G across three boxes and a 659 MB `npm install`, 2.4G after
  `rm` with the templates kept. Which hypothesis held is under 5.
- **4, split in two**, because a *start* and a *turn* are different measurements at different
  costs. **4a, spent** (§5, Docker's `claude` kit, `deny-all` plus the kit's own six `:443`
  hosts): Docker's kit ships no bridge — its entrypoint is `claude --dangerously-skip-permissions`
  (`research/06`) — and `npm install` of the pinned bridge was refused with a 403, `registry.npmjs.org`
  not being on the kit's list; after one scoped allow, 99 packages and 659 MB, two bundled
  `claude`s among them unless `CLAUDE_CODE_EXECUTABLE` is pinned. The bridge over `sbx exec -i`
  answered `initialize` in 0.43 s with stderr empty, `-e` and `-w` carrying env and cwd, EOF ending
  it cleanly; `session/new` with `mcpServers` on `host.docker.internal` behind item 1's rule was
  accepted, and the real CLI dialled the mailbox with the bearer intact. **What it could not ask**:
  `~/.claude` absent, because the template pre-seeds it — `~/.claude.json` with onboarding done,
  `settings.json` with `defaultMode: bypassPermissions`, five sized volumes under it and `~/.claude`
  itself on the overlay — so that datum is item 6's, on an image where the directory is genuinely
  absent, and `13`'s output 2 reads it from there. What it answered instead, for `08`: `initialize`
  reported `authMethods: []` with the CLI signed out, so an empty list is not the proof of a login
  the adapter's `assertAuthenticated` reads it as, inside this box at least; whether the pre-seeded
  `~/.claude.json` is why is item 6's same question. **4b, one turn, unspent, and its subject is
  item 6's template**, not Docker's kit. A turn needs a signed-in CLI inside, and the body counted
  no act for it. The record takes one route: the CLI's own login inside — `claude auth login`
  under `sbx exec -it`, by hand, the URL carried to a host browser by hand — which is the flow
  `08` §2 asks about per vendor, and the one it sets `/login` inside an interactive session apart
  from as a different flow; both are the CLI's own, and the record says which it ran. Two are
  refused as subjects, for one reason. Not a provider API key in the engine's store with
  `sbx secret set`, because the product's agents run on the user's own CLI login and never on a
  key blobot or its engine holds, and a record that ran on a key would be read as the product's
  route. And not Docker's own kit, where the login is the **proxy's** — `sbx` opens the vendor's
  URL in the host browser, keeps the token host-side and injects it at the proxy (`research/03`'s
  addendum strings; `research/06`, *Network and credentials*) — a route `research/06` reads as
  unsupported for a third-party image, so a credential coming to rest there answers for the kit
  and would be read as the product's route by the same mistake. Which route the product takes
  inside a box is `08`'s, and this settles nothing of it. Then: does the CLI dial the mailbox from
  inside, does the turn end, and **where the credential came to rest** — on the overlay or in a
  declared volume, since `~/.claude` on Docker's template is overlay and a login there does not
  persist (§5; `08`'s tier 2 draws the consequence) — look, and say which, because `08` and `13`
  both read it. And one probe `08` asked of this ticket on 2026-09-05, named here rather than folded
  in: whether a blobot image handed as `-t` to the **`claude` kit** keeps that kit's proxy-managed
  OAuth — the sentinel present, the login in the host browser, `claude auth status` inside saying
  signed in with nothing written under `/home/agent`. Zero tokens, one login act, spent after item
  6's template exists because it needs one; a yes is `08`'s tier 1 measured and a login that never
  enters a box, a no is `research/06`'s [DOC] line measured. Either way it answers for a blobot
  image and not for the kit, which is what makes it a subject 4b's rule admits.

Costs, restated: items 1, 3, 4a, the `--clone` half of 2 and the first probe of 6 are spent, at
zero tokens; the rest of 2 and 6 cost none; 4b costs one turn. Three acts are the author's —
`sbx login`, spent; 4b's login inside; the kit-OAuth probe's — and the record names each.

**7. Routing, restated, spent and unspent marked.** `13`: the kit contract and whether a
`node:22` base meets it (6, unrun); what a blobot-launched bridge needs beside the vendor's
binary (4a, spent: it lands and starts, and unpinned it drags 605 MB of bundled `claude`);
`~/.claude` absent (6, moved from 4a, unrun); `bwrap` inside if asked (6); and Docker's template
as research/08 already lists it for `13` — Ubuntu 26.04, node 22.22.1, `claude` 2.1.246, its own
`dockerd`, `bypassPermissions` by default. `14`: the `exec -i` transport (4a, spent: JSON-RPC
both ways, stderr empty, `-e`/`-w`, EOF clean); a stopped box's figures and the 30 s auto-stop
(3, spent); whether `exec` can carry a clone in and a fetch home without the mount (2, unrun).
`15`, **gated on this ticket**: the bearer and the stream through the proxy and whether a refusal
is logged (1, spent); what `deny-all` plus the kit's own rules admitted on the way to a bridge
(4a, spent: the kit's six hosts and `mcp-gateway.docker.internal`, `registry.npmjs.org` refused
until allowed) and on the way to a login (4b, unrun); `balanced` unrun and `15`'s to call for.
`05`: the branch's name after the `--clone` fetch (2, spent: intact, under two remote namespaces,
`refs/heads/` untouched — its shape *(b)* by the engine); what the narrow clone costs and what
the fetch home costs, and what the read-only mount let a shell read (2, unrun). `08`:
`authMethods: []` from a signed-out CLI on Docker's kit (4a, spent); where the login inside came
to rest (4b, unrun); the kit-OAuth probe (4b, unrun). `04`: nothing to run; research/07 §5 is its
evidence, already on disk.

First-demo ticket 14's rule, applied to what is left: items 4 and 6 are one runtime each —
Docker's own kit and a hand-built template, both Claude — so they measure a transport, a start
and a contract, and say nothing about a `box` for the other four; `13` output 8 has already
refused a `box` for Alice's runtime alone, and nothing in this record may be read as one. The
other four runtimes' templates, and their egress, are unmeasured and say so on research/08.

**Not this ticket, restated.** `_meta` and the Keychain under an outer fence (`04`). What the
image is, decided on the contract as read with item 6 confirming it (`13`). The product's login
route inside a box, and whether a URL in the pty stream is an exception (`08`). `sbx login` on
screen: the body sends it to `08` and `09`, and the pointer has moved since — `08` §2 sent it to
`14`, `14`'s item 2 sends it back, and `09` names the loop and withdrew its own pointer so that
one of them takes it; `08`'s 2026-09-05 decision now records the author's answer there, one Docker
sign-in as onboarding with a button and the browser and never a terminal. This ticket points at
`08` and `14` and takes neither. Everything else the body's own list names, unchanged.

## Progress, 2026-09-05

What has run, and the record that holds each line. Every figure below is [OBS] on the file it
names, platform and versions on that file's header; nothing here is a decision, and the neighbours
take what the amendment's point 7 routes to them. Two records, kept split as point 1 says:
`research/07` is the `_meta` half and `research/08` the `sbx` half.

**Done on `local`, two turns — `research/07` §5** (Guillermo's Mac, `claude` 2.1.260, the pinned
bridge 0.70.0, SDK 0.3.232):

- `_meta.claudeCode.options.sandbox` **reaches the SDK unedited** through the bridge: `session/new`
  accepted it in both turns, and by source the SDK folds it into the `--settings` layer.
- `filesystem.denyRead: ['~/.ssh']` **works**: `ls` failed with the operating system's own
  *Operation not permitted* against a host count of 7, both turns.
- The loopback mailbox was reached from Bash **only with `network.allowLocalBinding: true`**;
  without it the connect was refused silently — no prompt, no `<sandbox_violations>` block, no
  mailbox log line.
- Egress to an unlisted host **raised a `SandboxNetworkAccess` permission request** through the
  ordinary `session/request_permission` channel; rejected, the command saw `000` and a violations
  block naming host and port was written back to the model.
- `04` reads all four (amendment, point 2). The Keychain half — a real `claude` under an outer fence
  signing in — is *not* measured by it, in research/07's own words, and stays `04`'s.

**Done in a box, zero tokens — `research/08` §1 to §6** (`sbx` v0.39.0 after `sbx login`, macOS
26.6.2, M4 Pro, Docker Desktop's daemon stopped throughout; every box under `deny-all` plus the
kit's own rules):

- **The door** (§2): from a `shell` box with one rule scoped to it for `localhost:<port>`, the
  bearer arrived unchanged, `Host` rewritten to `localhost:<port>`, the peer the proxy on the host's
  loopback, no `Via` and no `X-Forwarded-For`; SSE stayed open through the proxy for its 3 s on one
  upstream connection; `127.0.0.1` and `localhost` inside refused (rc 7, the VM's own loopback); an
  unlisted host answered a synthesized 403, logged per host with count and reason.
- **A real `claude` dialled the mailbox on `session/new`** (§5): Docker's `claude` template, the
  pinned bridge over `sbx exec -i`, `initialize` in 0.43 s with stderr empty, `session/new` with
  `mcpServers` on `host.docker.internal` accepted, and on the host listener the CLI's own
  `POST /agents/x/mcp` with the bearer intact, `ua=claude-code/2.1.246 (sdk-ts, agent-sdk/0.3.232)`.
  Zero tokens, because no prompt was sent.
- **`--clone`** (§3): refuses a worktree, with or without the repository beside it, in 0.25 s; from
  the main repository, clone-and-checkout works — the clone at the repository's own absolute path,
  `origin` the read-only mount, a branch checked out and committed inside — and the host's
  `git fetch sandbox-<name>` brought it home in **38 ms** under `refs/remotes/sandbox-<name>/…` and
  `refs/sandboxes/<name>/…`, `refs/heads/` untouched.
- **Cost** (§4): boot **34 s** with the template to pull, **3.9 s** after; `sbx stop` **0.16 s**; the
  first `exec` after a stop **0.99 s**; auto-stop **30 s** after the last session ends; running,
  **0.8 to 1.7 GB** host RSS on the shim; stopped, the shim gone — 0 for the box, the daemon alone
  161 to 180 MB.
- **Docker's `claude` template** (§5): `claude` 2.1.246 **signed out** (`loggedIn: false`, no
  `.credentials.json`), with `initialize` answering `authMethods: []` regardless;
  **`defaultMode: bypassPermissions`** pre-accepted in `settings.json`; five ext4 volumes under
  `~/.claude` and **`~/.claude` itself on the overlay**, so a login written there does not persist.
- **A third-party image under `-t`** (§6): a store-local tag is used as it is, booted in 3.7 s with
  nothing downloaded; an unknown tag is a registry pull (403). `template save` wrote a 1.09 GB tar
  and `template load FILE` is the door for one from CI, none of it needing a Docker daemon on the
  Mac. The load itself was not run — the store entry came from the save — which is why (d) below
  runs it.
- **One persistent change made**: `sbx policy init deny-all`, undone by `sbx policy reset`. Two
  pulled templates stay in the store, 2.4G in the data dir after `rm`.

## Still to run, in order

Each item says what it costs — zero tokens, or one turn — and whose act it is. Nothing concludes
from an exit code; every line goes into `research/08` as a new section (amendment, point 1), with
research/07's empty headers pointed at it. `Blocked by: none` stays, and `15` stays gated on this
ticket resolving (point 4).

1. **The kit-OAuth probe.** Zero tokens, one login act, the author's. Docker's `claude` template
   first, because a blobot image does not exist yet and the kit needs an image under `-t`; then
   again on (d)'s image, which is the half `08`'s tier 1 rests on, since the vendor reads the route
   as unsupported for a third-party image (`research/06`). `sbx create -t <image> --name <n> claude
   <dir>`, a sign-in from the **host** browser as the kit drives it, then inside: the `SBX_CRED_*`
   sentinel reading `proxy-managed` rather than `none`, `claude auth status`, `ls -la ~/.claude` —
   signed in with nothing written under `/home/agent` is a yes. Then **per host or per sandbox**: a
   second box from the same image with no second login — does its `claude auth status` say signed
   in; `sbx rm` the first — does the second still; where the token sits (the engine's secret store,
   read from `sbx secret --help`, never from a file blobot opens) and whether it survives a daemon
   restart. Whether the engine holding the token host-side is *blobot storing a credential* is a
   reading of a permanent rule that `08` tier 1 and `15` took opposite ways; **the author settled it
   on `08`** (*Decided, 2026-09-05 — the engine's own store is the CLI's file, not blobot's
   database*): the store on the user's machine is the CLI's file, blobot holds, reads, moves and
   proxies none of it, and `15`'s sentence applies to what blobot itself would put there. So nothing
   is treated as the product route before this has run on blobot's image; after it, a yes is `08`'s
   tier 1 measured and one sign-in per machine and runtime, a no is `research/06`'s [DOC] line
   measured and tier 2 is the route. Either way the answer is for the image it ran on and says so.
2. **`/login` inside a box on the pty, per vendor.** Zero tokens; one login act per vendor, the
   author's. Claude first, on Docker's template and on (d)'s image; the other four when `13` has an
   image for each, which is none today (`13`, output 8). `sbx exec -it <box> claude` then `/login`,
   and separately `claude auth login` under a non-interactive `exec` — `08` §2's three lines: whether
   `auth login` under `exec` prints what `/login` printed; whether the transport prints a word of its
   own before the CLI's first byte, since that word would be the vendor's on the user's screen; and
   the shape per vendor — a URL to open on the host, a device code to type, or a wait for a browser
   that never comes — recorded verbatim minus the grant. Then **where the credential came to rest**:
   `~/.claude/.credentials.json` on the overlay, or in a declared volume; `08`'s tier 2 needs a
   declared kit volume and `13` reads the same line. And what the login needed allowed on the way
   through `deny-all` plus the kit's hosts, which is 4b's egress row for `15`. The other four
   commands are `remedies.ts`'s: `codex login`, `opencode auth login`, `fx login`, `cursor-agent
   login`.
3. **A real turn inside a box through a blobot-launched bridge.** One turn. On whichever box (1) or
   (2) signed in, with the record naming the image and the login route. Amendment 6 makes (d)'s
   template the subject; its refusal of Docker's kit as a subject rested on a proxy-held login being
   read as the product's route by mistake, and `08` has since settled that reading, so a turn on a
   kit-signed box is admissible if the record says which — and the turn `13` reads is the one on
   (d)'s image. The bridge over `sbx exec -i` with `-e CLAUDE_CODE_EXECUTABLE` and `-w`,
   `session/new` with `mcpServers`, one prompt that calls `message_agent` and runs one `Bash`: does
   the CLI dial the mailbox mid-turn with the bearer, does the peer message land, does the turn end
   with a stop reason, what `usage_updated` reports, wall time. Whether the kit's `bypassPermissions`
   default reaches a bridge session (`session/new` reported `default`), whether `allowedTools` in
   `_meta` holds inside as research/07 §5 saw it on `local`, and whether a permission request
   crosses the transport as ticket 14's inline block. `14` takes the transport under a turn, `15` the
   egress rows the turn needed.
4. **A hand-built `node:22` image via `template load`, against the kit contract.** Zero tokens. A
   tar built where a builder is — CI (`01` point 7) or this Mac; Docker Desktop's daemon was stopped
   throughout research/08 and a build needs one — from `node:22`: `agent` at uid 1000 with
   `/home/agent`, the pinned bridge 0.70.0 (`BRIDGE_VERSION` in `adapters/claude/stdio-bridge.ts`,
   matching `packages/core/package.json`) with `CLAUDE_CODE_EXECUTABLE` pinned so the 605 MB of
   bundled `claude` is not dragged in, and `claude` **2.1.260 through `claude.ai/install.sh`**
   (amendment 3; the choice itself is `13`'s output 3). `sbx template load <tar>`, then `-t` under
   the `shell` kit and under the `claude` kit. Check the contract as Docker's template shows it:
   uid 1000 in `sudo`, `/home/agent`, `tini` as pid 1 (the kit's or the image's — say which),
   **proxy variables across `sudo`** (`sudo -n env | grep -i proxy`), `BASH_ENV`, `/etc/hosts`, the
   sentinels, the mounts — or which part fails. Then **a start with `~/.claude` absent**: the
   bridge's `initialize` — what `authMethods` says, whether the CLI starts at all with no onboarding
   done and no trust accepted, what `session/new` answers. That is ADR-0003's *all three scopes*
   meeting a Machine that cannot load them, and `13`'s output 2 reads it. `bwrap` inside — an
   unprivileged user namespace in a runc container inside the microVM — only if `04` turns Claude's
   fence on; otherwise written down as not run and why.
5. **The five runtimes' MCP clients against the door.** Zero tokens where a runtime dials MCP at
   `session/new`, as Claude did; one turn where it dials only on the first prompt, and the record
   says which per runtime. `host.docker.internal` resolves to `fe80::1` in the guest's `/etc/hosts`
   and is not in `NO_PROXY`, and research/08 §5 shows Claude's client going through the proxy
   (`localhost:<port>` in the allow log) — measured for Claude only (`02`'s 2026-09-05 comment). For
   Codex, OpenCode (Bun), fx (Zig) and Cursor: does the client honour `HTTPS_PROXY` — a
   `localhost:<port>` row in `sbx policy log` — or dial link-local directly, and if it does, does it
   connect at all and does a rule scoped to `localhost:<port>` still reach it? Each installed in a
   `shell` box, no image needed; signed out is enough where the runtime handshakes signed out, and
   fx does not (`08` §2's table), so fx costs a login act. `02` and `15` read it: a client that
   ignores the proxy is a carrier `endpointFor` cannot mint for that runtime.
6. **Attachments across the exec transport.** Zero tokens. `IMAGE_ATTACHMENT_LIMIT` is 4,000,000
   bytes (`orchestrator/bounds.ts`), about 5.3 MB as base64 in one `session/prompt` line. Pipe a
   6 MB single JSON line into `cat` inside via `sbx exec -i`, `wc -c` and `sha256sum` on both sides:
   whole, chunked, stalled, or capped, and at what size if capped. A legal attachment that fails only
   on a box is Alice/Bob-shaped — first-demo ticket 14's rule, a guarantee that holds for Alice and
   not for Bob is worse than none — and ADR-0004's *embedded, never linked* leaves no other route
   across, so the ceiling would have to move for every kind or the transport would. `14` takes the
   figure.
7. **The third Claude turn from `research/07` §5.** One turn, on `local`: `sandbox: {enabled: true}`
   alone with `trust: 'careful'`, an empty `allowedTools`, the probe source kept on research/07 —
   separates `autoAllowBashIfSandboxed` (default true) from `allowedTools`, whether a Bash call
   prompts at all under a fence, and whether the plain defaults admit loopback. `_meta` is `04`'s
   (amendment, point 2), so one of `04` and this ticket spends it and never both; it lands on
   research/07 §5 either way, `04`'s question 1 reads it, and it bears on ticket 14's posture, since
   a fence that auto-allows makes the vouched list irrelevant for sandboxed commands.
8. **`sbx daemon status` cost.** Zero tokens. Wall time of `sbx daemon status`, `sbx ls` and
   `sbx diagnose` with the daemon up and with it down, whether each starts the daemon (`08`'s
   amendment: `sbx ls` starts it) and what that costs, and which command answers the sign-in fact.
   For `08` §4's caching question: if milliseconds, the launch refusal asks fresh; the decision is
   `17`'s, the engine ticket `08` names as split from `14`, and `08` reads it.
9. **Linux/KVM, Alain.** research/08 §2 to §5 repeated on Linux with KVM from the scripts at the
   end of that file — zero tokens; research/07 §5's probe source with `bwrap` and `socat` — two
   turns; `research/03-linux-mailbox-probe.mjs` for srt on Linux. Platform and versions on every
   line, because the first blocking result on this map was a platform's and not a library's
   (`research/01`, `research/02`).

Not this ticket, unchanged: what each measurement decides. (a) and (b) are read by `08` and `13`,
(c) by `13`, `14` and `15`, (d) by `13`, (e) by `02` and `15`, (f) and (h) by `14` and `17`, (g)
by `04`, and none of them here.

## Corrections, 2026-09-05 (consistency pass)

- *Still to run* item 7, research/07's Turn C, is `04`'s to spend, as this ticket's own amendment
  says twice; struck from here.
- Item 1's closing clause chose tier 2 on a no. It does not: which route the product takes inside
  a box is `08`'s (its three tiers, and its note on the pty *shown*); this ticket measures.
- The gate on `15` is gone: `15` is blocked on `17` and nothing else.
- Where *Progress* and `research/08` differ on what `sbx policy reset` undoes, `research/08` is
  the record and wins.
- Item 4: the 659 MB is the npm install's, which brings two bundled `claude` binaries whatever
  `CLAUDE_CODE_EXECUTABLE` says; the env var picks which CLI runs (`research/08` §5) and shrinks
  nothing. How the image installs the bridge without them is `13`'s.
- Item 3: research/07 §5 cannot tell `allowedTools` from `autoAllowBashIfSandboxed`; do not cite
  it as if it could.
