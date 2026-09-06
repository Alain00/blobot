Type: grilling
Status: claimed
Blocked by: none

# The image: one per runtime

## Current implementation scope, 2026-09-06

[Post-creation resource changes](25-post-creation-resource-changes.md) are deferred
under the author's autonomy delegation, after actual full-state reconstruction
and native-route investigations. CPU/RAM are selected at creation; ordinary
stop/start retains this same Machine. Full-copy replacement remains guarded and
is no longer an activation prerequisite for that unchanged-storage lifecycle.
Remaining image gates still require actual readiness, mount/capacity/ownership,
distribution and normal persistence validation. No preservation test is relabeled
as a pass, and this image ticket remains claimed until those gates are finished.

## Question

Ticket `01` point 7 is given: blobot builds **its own minimal Linux image per runtime**, in its
own CI, pulled on first use, `sbx` the first engine behind the Machine interface. This ticket
decides what that image *is*. *Image* is this ticket's word and never a screen's (`CONTEXT.md`,
*Avoid*).

**The base.** `sbx` runs a user image under a contract (`research/06`, *Docker Sandboxes*): a
non-root `agent` at uid 1000 with passwordless sudo, `/home/agent` owned by it, the proxy
variables preserved across sudo, and the agent binary *"either baked in or installed with
`setup.install`"* — the second route is the one every Docker-authored kit takes, `curl …
claude.ai/install.sh | bash` as root (`research/06`, *How the market builds the per-agent
image*), and output 3's named-version install has to weigh it against baking. Every
Docker-authored kit starts `FROM docker/sandbox-templates:shell`, whose source is unpublished;
what the running template *is* was measured on `16`'s box (`research/08` §2, §5): the tags are
`shell-docker` and `claude-code-docker`, Ubuntu 26.04 on the guest's 7.0.12 kernel, node 22.22.1
at `/usr/bin/node`, `tini` as pid 1, `agent` in `sudo` and `docker` with `sudo -n true`
answering, and `/etc/hosts`, `/etc/resolv.conf`, the proxy variables and `BASH_ENV` injected by
the runtime rather than by the image. Decide what blobot starts from: that template, a `node:22`
base, or Ubuntu from scratch. `cursor-agent` ships glibc `.node` addons and its own node, so
alpine is out for at least one (`research/06`, *How the market builds the per-agent image*). The
user the CLI runs as is the contract's — uid 1000, never root — and the contract is the whole
reason here. What root would do to the fifth level is `10`'s and open: the bridge gates
`bypassPermissions` on `!IS_ROOT || IS_SANDBOX`, so root with that flag set is not refused, and
whether `set_mode(bypassPermissions)` takes at uid 1000, with or without `IS_SANDBOX` set, is
`10` §4's own spend and not a premise here. Whether the image sets `IS_SANDBOX` in its
environment at all is one item on output 2's list, decided with `10`. What is this ticket's is
the contract's **passwordless sudo**: `10` §5 reads whether blobot's image grants it, and the
question is whether an image under `-t` may leave it out and still be run by the engine, or
whether the contract makes it a fact carried to `10` — root that reaches the two volumes and
nothing else — rather than something blobot chose.

**The contents.** A private node, the pinned bridge, the CLI, git, nothing else. Two bridges
exist and three do not — `BRIDGE_VERSION` in `adapters/claude/stdio-bridge.ts` pins
`claude-agent-acp` 0.70.0 and `CODEX_BRIDGE_VERSION` in `adapters/codex/stdio-bridge.ts` pins
`codex-acp` 1.7.0, both matching `packages/core/package.json`; `npm-bridge.ts` declares the
version on the spec and each adapter checks it against what the bridge reports on `initialize`
(`assertBridgeVersion` in `claude-agent-runtime.ts`, `#assertBridgeVersion` in
`codex-agent-runtime.ts`); OpenCode, fx and Cursor speak ACP themselves — so ask whether the
bridgeless images need node at all. One measured fact about the pinned bridge bears on *the CLI*:
installed inside Docker's own Claude template, `claude-agent-acp@0.70.0` brought 99 packages and
**659 MB**, of which the bridge is 708 KB and 605 MB is two bundled `claude`s —
`claude-agent-sdk-linux-arm64` at 306 MB and `-musl` at 299 MB — beside the template's own
(`research/08` §5). `npm-bridge.ts` already points the bridge at the user's binary through
`CLAUDE_CODE_EXECUTABLE` on the host; the same variable over `sbx exec -e` made the bridge inside
run the template's `claude`, which announced itself to the mailbox as 2.1.246, and whether an
install can leave the bundled two out is unmeasured. So output 2 says which binary the image's
bridge runs, and output 7 counts the two or says how the image is built without them. OpenHands'
published image reads to the same shape, Node 22 at `/acp-node` with the ACP bridges beside the
vendor's CLI (`research/06`, from the image's documentation; nothing of OpenHands was run on
either machine).

**Whether *nothing else* survives ticket `03`.** Whether a runtime's own fence runs *inside* a
box — the same per-runtime constant as on `local`, or off because the box is the boundary — is
`04`'s question 3, taken there with the fact that Codex's is not a choice; `04` says *`13` reads
the answer for whether `bwrap` is in the image*, and that is the division: `04` decides whether
a fence is on, this ticket decides whether the image can hold one. Three of the five runtimes
carry a fence, and on Linux each needs something the image either has or does not: Claude's is
bubblewrap and socat, Cursor's is bubblewrap and Landlock, Codex's is Landlock (`research/04`,
the table). Landlock is the guest kernel's (`research/06` saw `nerdbox-kernel-arm64` at 7.0.12,
and `research/08` §2 saw it running), and bubblewrap needs an unprivileged user namespace, which
a runc container inside the microVM may or may not be allowed — unmeasured, and `16`'s if `04`
turns a fence on. One fact this ticket adds, for the *absence* side of output 2, **by source and
not by measurement** (`research/07` §5 items 6 and 7): the two doors that turn Claude's fence on
fail in opposite directions in an image without `bwrap`. Through `_meta` — `04`'s route — the
SDK forces `failIfUnavailable: true` when the key is absent, so the session fails at start; item
6 reads that from the SDK's own source, and item 7 says the path was not taken, that what a
machine without the dependency says is unmeasured, and that by the docs it is a startup error.
Through a repository's own `.claude/settings.json`, where `sandbox.enabled` is an any-scope key
(`03`) and the file rides into the box in the workspace volume as the clone, the CLI's own
default is `false` — *a warning is shown and commands run unsandboxed*, the schema's text — which
is silence as far as blobot is concerned, and where that warning goes is not recorded. `04`
closes the second door by saying *off* in `_meta` rather than leaving it to a default; whether
that is enough is `04`'s, and what it costs here is the packages: two, plus the second policy
vocabulary beside the box's that `04`'s *both is not free* names.

**Never in it.** Five absences follow from what is already decided; a sixth is this ticket's own
proposal and sits in output 2. No login: the credential lives in the data volume (`01` point 4),
and Docker's own limit — *"proxy-managed OAuth isn't supported for third-party sandbox agents,
including kits that extend a built-in agent"* (`research/06`, *Docker Sandboxes*) — means the
CLI writes its own sign-in into the box's `/home/agent`. **Whether that is the data volume is the
kit's to make true**, not a fact of the home: in Docker's own Claude template `~/.claude` itself
is overlay and only five subdirectories under it are volumes, so a login written there is in no
volume (`research/08` §5, and its *still unmeasured*: where `.credentials.json` lands after
`/login`); `14` declares the kit, and output 7 says what the data volume has to hold. The CI
runner signs into nothing. No key: `child-env.ts` strips `BLOBOT_*_API_KEY` here and a box must be
no weaker. No repository: the AgentWorkspace is the second volume (`05`). No skills: the
operator's `~/.claude/skills` is a read-only mount (`01` point 5, keeping ADR-0003 true) and
never baked in — because the operator edits it, and an image is built in CI from nothing of the
operator's. Where the mount lands is output 9. No volumes: a volume is the kit's and never the
image's — a snapshot of Docker's template run under a `shell` kit came up with that kit's one
mount and eight sentinels, whatever the image had been saved from (`research/08` §6) — so what
the image needs declared is output 7's and the declaring is `14`'s. And the proposal, **no
blobot code at all**: the bridge is a vendor's npm package and the node and `node_modules` that
run it are the box's own; the mailbox is the CLI's own MCP client dialling `host.docker.internal`
(`02`), measured for a real `claude` handed `mcpServers` over `sbx exec -i` (`research/08` §5);
and `14`'s question frames `spawn` as blobot keeping only the `LineTransport` on the host, which
is open there and taken here as the frame and never as an answer.

**Built, published, versioned, pulled.** The precedent is `whisper-cli.yml`: one workflow, one
pinned upstream tag, a release under blobot's own tag, a sha256 per asset pinned in core
(`speech/catalog.ts`) so an unpinned build is a refusal and never a fetch. It also found the
repository private and the release URL with it (`.scratch/dictation/build.md`); a pull that needs
a token blobot holds is a credential blobot stores. Two facts from `16`'s box narrow the pull
(`research/08` §6): `-t` with a tag the store does not hold is a **registry pull** the engine
makes — an unqualified name went to `docker.io/library/…` and was answered `403` — while
`sbx template load` takes a tar and a store-local tag is used as is with nothing downloaded, so a
blobot image needs no daemon on the Mac and no registry at all. That is the difference between a
download blobot makes and can draw and a pull the engine makes and reports as it likes, and it is
output 6's.

**What the neighbours have handed here by name.** Each is accepted as an output below or refused
back, so that resolving this one leaves nobody waiting:

- `15`: *what each CLI phones home to at first start*, and *an image that phones out is `13`'s to
  silence*. Both accepted, output 3. The first draft of this ticket refused the first to `15`
  while `15` refused it here, and `15`'s output 1 says in its own words that the hosts per
  runtime are not its to write; the hole between the two closes on this side.
- `09` §1 and its *Not this ticket*: *what the image can run, `stdio` servers among it* —
  accepted, output 2. *How the pull is drawn* — accepted, output 6. *When an image bump owes a
  restart, and what the transcript says about it* — the first is output 4's *when a new tag is
  owed*, with `14` deciding what a running box does; the sentence is refused back to `09`, by
  `09`'s own rule that it decides words.
- `12`: what the image holds, what the first download weighs, who pulls (outputs 2, 6, 7); the
  `/` menu on a box (output 10).
- `05` §4: pricing and deleting the image (output 7). `05` §5: where the mount lands, and the
  ADR-0003 amendment (output 9).
- `04` question 3: whether the image can hold a fence (output 2). `10`: the user, `sudo` and the
  daemon (the base paragraph, output 2).
- `14`: *the kit references it by tag* — which layer hands the kit the tag is output 4.
- `16`: the kit contract on a `node:22` base, what a blobot-launched bridge needs beside the
  vendor's binary, `bwrap` inside if asked (outputs 1, 2).

## What must come out of it

1. The base, named, and whether it is one base for five images or two. Decided against the
   contract as `research/06` reads it and as `research/08` §2 and §6 saw Docker's own template
   satisfy it; `16` item 6 — a `node:22` base under `-t` — is what confirms it, and
   `research/08` lists that base under *still unmeasured*, so this output is **provisional** on
   it, and a failure there reopens this output and nothing else.
2. The contents per runtime, with a reason for each item and each absence — including, per
   runtime, whether the packages its own fence needs on Linux are in (the paragraph above);
   which binary the bridge runs and whether the two bundled `claude`s ride in (*The contents*);
   whether the image carries any blobot code (the proposal above is none); and whether the image
   carries a **daemon**. That one is read now: Docker's template carries its own `dockerd` in
   the guest, pids 90 and 103, `/var/lib/docker` as an ext4 volume of its own, and `agent` in
   the `docker` group — the `-docker` suffix on its tags is that (`research/08` §2, §5) — so a
   daemon is a thing an image carries and a kit sizes, and `10` §5 asks whether blobot's box has
   one for the `docker` verb, a project whose tests need one being the case for it, against
   output 7's budget. And **what the image can run**, which `09` §1 hands here: a repository's
   own project-scope configuration — `.mcp.json` on Claude, each runtime's equivalent — travels
   in the clone, and a `stdio` server named there runs inside only if the image holds what
   launches it. Say which, from the contents: one launched by `npx` has node and needs the
   registry, which is `15`'s list; one launched by `uvx` or `python` has no interpreter under
   *nothing else* and does not run, and what the CLI says of that is the CLI's. Whether it moves
   anything into the image or is a sentence for `09`'s third paragraph — the lean is the
   sentence. One line stays open to `16`: whether a blobot-launched CLI starts at all with
   `~/.claude` absent — item 4a, which `research/08` §5 could not ask because Docker's template
   pre-seeds `~/.claude` — and it is read from `16`'s record when it runs.
3. The version each image carries; how each CLI's self-update is turned off (`DISABLE_UPDATES`
   on Claude; `cursor-agent` auto-updates by default — `research/06`), or the pin is not the
   version that runs; **what each CLI reaches at first start**, per runtime, as a fact of the
   image; and that the image itself reaches nothing at boot. The first-start hosts are accepted
   from `15`: the update check, the telemetry endpoints, and whatever the install route left
   pointing outward, measured on `16`'s box under `deny-all` through `sbx policy log`, which
   lists every host refused with a count and a reason (`research/08` §2, §5). One runtime is
   measured: a signed-out `claude` 2.1.246 reached `api.anthropic.com` alone, at boot and on
   `session/new`, plus the engine's own MCP gateway, which the kit pointed it at and blobot's
   kit will not (§5). `15` decides the rule, the categories, whether telemetry is admitted, and
   pins the hosts as they arrive; this ticket supplies what each CLI asks for and why. The
   image's own boot is the other half: Docker's template asks `ports.ubuntu.com` and
   `download.docker.com` at every boot and is refused (§2, §5), `15` says an image that phones
   out is this ticket's to silence, and it is — an image built in CI has no updater to run at
   boot, and the measure is a policy log that holds nothing of the image's own after a boot.
   **No adapter pins a CLI**: only the bridge is pinned and checked, and every live suite runs
   whatever binary is on `PATH`. So the version is a choice and not a lookup, and each candidate
   says which machine measured it: `claude` 2.1.251 on Alain's Linux (`first-demo/research/02`,
   2026-08-29), 2.1.260 on this Mac (`research/04`, 2026-09-04) and 2.1.246 in Docker's own
   template (`research/08` §5); `codex` 0.148.0 in its own effort (`codex-runtime/research/01`,
   2026-08-30) and 0.151.0 here; `opencode` 1.18.4 on Alain's Linux (`research/01`, 2026-08-31)
   and 1.17.9 here; `fx` 0.0.7 in its own effort (2026-08-31) and here alike; `cursor-agent`
   2026.08.25 in its own effort (`cursor-runtime/01`, 2026-08-31) and 2026.09.02 here.
4. The tag. Proposed: *the adapter's pin*, so a bridge bump is an image bump. Say what a CLI
   bump with no bridge bump is — a second tag component, or a rebuild under the same one, which
   is the pin lying — and when a new tag is **owed**. What a bump then does to a box that
   exists is `14`'s, which accepted it by name: a Session belongs to the runtime that opened it
   (ADR-0002), the runtime is now a thing the image pins, and the resume state in the data
   volume — Cursor's `acp-sessions/`, Claude's `~/.claude/projects` — was written by the old CLI
   and is read by the new one. The line between the two: this ticket says when a box is running
   an image the pin no longer names; `14` says what happens to it. And **which layer holds the
   image reference per runtime**, so that the Machine layer never learns the provider: `14` says
   the kit references the image by tag, and this is the shape `15` output 2 asks for the
   vendor's hosts — a member on `AgentRuntime` each adapter fills, the way `accepts` says what a
   runtime takes, or the kit. Say which, here, because the tag is the adapter's pin.
5. Where it is published, so a pull needs no credential of blobot's, and for which
   architectures (two machines chart this map). A hosted kind is out of scope to build and in
   scope as a constraint (`map.md`, *Reopened while working*): what is published has to be a
   thing a box that is not on this computer could pull too, and `01` point 7 already records the
   image verified to travel — the same OCI image under `sbx --cloud`, egress rules carried and
   secrets never (`research/06`, *A hosted kind exists*).
6. Who pulls — the engine on `-t`, or blobot ahead of it — narrowed by `research/08` §6: an
   unqualified `-t` is a registry pull the engine makes and reports in its own words, which is
   not a sentence the user reads; a tar through `sbx template load` is a download blobot makes,
   with the dictation download's shape — a streaming sha256 against the pin, `Range` resume, and
   the one figure that knows its end, `downloading · 412 MB of 574 MB` (`DESIGN.md`) — and the
   word beside that figure cannot be *image*. How the pull is drawn is this ticket's, which `08`
   and `09` hand back here; the state word for an image the engine does not hold is `08`'s (*Not
   installed*, with `pull` as a `RemedyKind`, asked of the engine), and the sentence for a launch
   refused on it is `09`'s (§4, *blobot's own image not yet pulled*).
7. A size budget per runtime, against Docker's compressed figures — claude-code 610 MB, minimal
   300, codex 758, cursor-agent 595, opencode 1011 (`research/06`) — and two in the store on
   this Mac, `shell-docker` at 589 MB and `claude-code-docker` at 937 MB (`research/08` §4): the
   real figure behind `12`'s stand-in *downloads about 600 MB the first time*. The budget counts
   the bridge's install as measured, 659 MB with two bundled `claude`s, or says how the image is
   built without them. And **the two volumes' sizes**, which `12` hands here and `14` declares
   in the kit: every volume in a kit must set a size (`research/06`, *Volumes are a kit's*), and
   the one prior is Docker's Claude kit, which declares five volumes under `~/.claude/` —
   `projects` at `2g` and four siblings at `512m` — and leaves `~/.claude` itself on the overlay
   (`research/08` §5); blobot's shape is one data volume holding the whole of the CLI's home, so
   that is a prior for the figure and not for the shape. The workspace volume is the clone,
   which for a real repository may be the larger of the two; `12`'s *up to 4 GB on disk per
   agent* is the stand-in until this output names the figures. And when an image is **deleted**,
   since `05` §4 makes it this ticket's to price and delete: it is shared by every agent on that
   runtime, so it belongs to neither `remove` nor `purge`, and it is the one shared thing on a
   box — read-only and per runtime, so it shares nothing ADR-0001's list is about, which is
   worth one sentence saying so.
8. The build order among the five. **All five get one.** `01` point 7 is *per runtime*, and the
   box is the boundary on every runtime because every runtime's own fence sits inside the process
   that holds the login (`03`), so a fence of its own is no criterion for whether a runtime gets a
   box — and a `box` offered for Alice's runtime and not Bob's is first-demo ticket 14's refused
   shape at greater cost. The one asymmetric fact is the reference, not the boundary: four have a
   Docker kit to read (claude-code, codex, cursor-agent, opencode; `research/06`, and
   `research/08` §1's ten agents with no fx among them) and fx has none, so fx's image is built
   from its install docs alone. A resolver who concludes that not all five should get one is
   reopening `01` point 7, and says so on that ticket.
9. **Where the skills mount lands, per runtime, and the amendment it carries** — `05` §5 hands
   both here. The landing: a mount, a symlink the image makes, or a path the adapter hands the
   CLI. Each CLI reads `~/.claude/skills` relative to its own home, and that home is the data
   volume's; the first engine puts the *primary* workspace at the host's absolute path
   (`research/02` §4) and says nothing about where an extra read-only one lands, so that is
   unread and not to be assumed. One thing is measured since: Docker's own Claude kit mounts a
   skills directory of the engine's at `/home/agent/.claude/skills` (`research/08` §5), which is
   where Claude looks; whether a kit can point that mount at the operator's directory, and where
   the other four look, is this output. It must land where **every** runtime that reads it looks
   — fx warns about the directory in its own diagnostics, Cursor loads the user's skills — or it
   is offered on none, which is `05`'s rule on first-demo 14's; how, per runtime, is this output.
   Not ADR-0004's refusal: the agent is handed no path, the CLI finds the directory where it
   always looks. The amendment: `01` point 5 says the mount keeps *ADR-0003 true*, and `05`
   found that true of skills and overstated of the scope — the ADR's amended decision loads
   `user`, and in a box the user scope is the data volume's, blobot's and per agent, so the
   operator's global `CLAUDE.md`, `settings.json` and hooks do not cross, and `settings.json`
   must not, because it is the file whose fence keys merge across scopes (`03`). `05` raised it
   and decided nothing; this ticket writes it as a second amendment at ADR-0003's foot and a
   comment on `01` point 5, because it owns the mount and its reasons.
10. **What the `/` menu offers on a box** — `12` names it a palette question for `13` and `05`,
    and it is taken here whole so it lands somewhere. `01` point 5 settles *what crosses*, and
    `05` §5 reads it as given: the workspace's `.claude/` travels in the clone and the operator's
    `~/.claude/skills` is the mount. What is left is how the allowlist is **built**. Today it is
    built on the host from files (`adapters/claude/palette.ts`, and each adapter's own): the
    workspace's `.claude/` at `cwd`, the operator's `~/.claude/skills`, and vouched built-ins. On
    a box the second half reads the same host directory the mount is made from and needs nothing;
    the first half is enumerated from a `cwd` that on a box is a clone in a volume the host does
    not read, so the names come over the engine's exec, or from the user's repository at the
    fetched branch, or the palette on a box offers the skills half alone — say which, per
    runtime, and that the names blobot offers are the names the CLI inside resolves. The user
    scope's own commands are absent for the reason output 9's amendment gives.

This is at the top of the map's range for one session: ten outputs, five of them per runtime
across five runtimes, and an amendment at ADR-0003's foot. If it splits, outputs 9 and 10 — what
crosses into the box, and how the palette is built from it — are the seam and a second session;
nothing else is severable, since outputs 1 to 8 are one image and its pull.

## Research to read first, and what is borrowed

`16`'s `sbx` half has run and is `research/08-the-first-box-sbx.md`, measured 2026-09-04 with
`sbx` logged in, [OBS] on every line; `research/07` is the `_meta` half, and its §4 and §6 read
*not run* because the record moved to a second file, not because nothing ran. This ticket still
runs nothing and borrows by name. What `research/08` settles here: Docker's template's shape (§2,
§5; the base paragraph); a real `claude` 2.1.246 started by the pinned bridge over `sbx exec -i`
and dialling the mailbox through `host.docker.internal` with the bearer intact (§5; the first
half of `16` item 4a, on output 2); the bridge's 659 MB (§5; outputs 2 and 7); `~/.claude` on
the overlay (§5; *Never in it* and output 7); `-t` against a registry and `template load`
against a tar (§6; outputs 5 and 6); and a snapshot of the template run under `-t` with the kit's
volumes and not the image's (§6; output 7). What it leaves for `16` to run, in its own *still
unmeasured*: the contract on a `node:22` base, and a CLI started with `~/.claude` absent — item 6
and the rest of item 4a — on which output 1 stays provisional and output 2 keeps one line open.
Both are read from wherever `16` writes its `sbx` record, which is `research/08` today, and
nothing in an unrun item is a no.

What is read, and costs nothing: the kit contract in full as `research/06` quotes it; the vendor
install routes the same file already lists — `claude.ai/install.sh` with a version, the codex
musl release against the npm shim, opencode's tarball, `fx-linux-*`, the cursor-agent tarball —
checked for the form that installs a **named** version offline in a Dockerfile, which is what
output 3 needs; and `research/07` §5 items 6 and 7 for the two `failIfUnavailable` defaults and
the path that was not taken. What each CLI phones home to at first start is **this ticket's**,
output 3, and the CI runner reaches nothing at build time: the registries a *build* needs are
the runner's and never the box's.

## Priors

ADR-0001, as `01` extended it: the image is the one thing agents on a runtime share, and output 7
says why that shares nothing the ADR's list is about. ADR-0003: the operator's skills reach the
box as `01` point 5's read-only mount, output 9 carries the amendment that narrows the ADR's
*user* scope to skills on a box, and output 10 keeps the palette an allowlist of what a person
authored when one of the three scopes is the data volume's. ADR-0004: no path is handed to an
agent anywhere here; the mount is the CLI's own lookup, and the pull is blobot's own fetch on the
host. *Providers live behind `AgentRuntime`* (`CLAUDE.md`): output 4's image reference is the one
place a runtime's identity would reach the Machine layer, and it is named there so that it does
not. First-demo ticket 14's rule — *a guarantee that holds for Alice and not for Bob is worse
than no guarantee* — decides output 8 and the mount's landing in output 9, and refuses an inner
fence being promised on the runtimes that carry one.

## Not this ticket

The engine interface, the box lifecycle, and what an image bump does to a running box and a
resumed session (`14`, which accepted it; when a bump is owed is output 4, and the sentence the
transcript says of it is `09`'s). The Workspace volume and the branch coming home (`05`). The
egress list — its rule, its categories, whether telemetry is admitted, and the pinning of hosts
as they arrive (`15`; what each CLI asks for at first start is output 3). The state word for an
image the engine does not hold, and the login inside the data volume (`08`). The refusal
sentence for a launch on an image that is not there, and a pull that fails partway — the
dictation download's refusal is the precedent, and the words are `09`'s. Whether a runtime's own
fence is on inside a box, and which layer owns its policy (`04`, question 3); whether the image
can hold one is output 2. The fifth level, whether the mode takes at uid 1000, and what root or
`sudo` reaches (`10`, which is blocked on this ticket for the user, the `sudo` and the daemon).
The kit's declaration of the volumes and the allowlist (`14`); what they must hold is outputs 3
and 7.

## Amendment, 2026-09-05

Four changes, none of them to the base, the version or the tag. The first narrows what this
ticket owns; the other three are facts read from `research/08` and one line from `02`'s comment
of the same day, each landing on a numbered output above. `research/08` is cited by the sections
it has — seven numbered ones and a *What this settles for tickets 05, 13, 14, 15* list — and
nothing below was run.

**1. Outputs 9 and 10 move to `05`; this ticket keeps the image's contents only.** `05` §5 handed
both here by name — *where the mount lands* and *how the palette is built from it* — and the first
draft of this ticket accepted them. That was the wrong seam. `01` point 5 is a closed list of what
**crosses** into a box, `05` is the ticket that reads that list for the Workspace and the third
mount, and a skills mount and a palette built from what crossed are questions about crossing, not
about what the image holds: the image is built in CI from nothing of the operator's, so nothing
about where the operator's directory lands or how its names reach the composer is a fact of the
image. What stays here of output 9 is one sentence, already under *Never in it*: the skills are
never baked in. With the two outputs goes ADR-0003's second amendment — `05` raised it, and `05`
writes it at the ADR's foot with the comment on `01` point 5 correcting *stays true* to *stays true
of skills*. `01`'s own amendment of this date names `13` as the debtor (*"`13` owes ADR-0003 a
second amendment saying so"*); read `13` there as `05` from this date, and the comment on `01` is
`05`'s to leave when it writes the amendment. The split that the paragraph after output 10 called
*the seam* is taken, in the direction it named: this ticket is outputs 1 to 8, one image and its
pull. `05` §5's sentence *"`13` is the ticket that meets it"* is superseded by this amendment and is
`05`'s to restate; nothing on `05` is edited here. One fact per runtime that `05` will need is read
from the same install docs output 3 reads — the directory each CLI looks in for skills, relative to
its own home — and is supplied to `05` as a comment when output 2 is written; it decides nothing.

**2. Output 8 is provisional on `16`.** *All five get one* rests on `02`'s answer that the mailbox
survives on every kind by one door per kind, and for the box that door is
`http://host.docker.internal:<port>` through the engine's proxy. `02`'s comment of 2026-09-05 adds
the fact that makes it provisional: inside the guest `host.docker.internal` resolves to `fe80::1`
in `/etc/hosts`, a link-local address, and it is **not** in `NO_PROXY`
(`localhost,127.0.0.1,::1,gateway.docker.internal`; `research/08` §2), so the door is reached only
by a client that hands the request to `HTTP(S)_PROXY` rather than dialling the name. Claude's did:
`NODE_USE_ENV_PROXY=1` is set in the box, and a real `claude` 2.1.246 arrived at the mailbox
through the proxy with the bearer intact (§5). Claude is the only one measured. fx is a Zig binary
and OpenCode runs on Bun — neither is node, and whether their MCP clients honour the proxy
variables for a plain `http://` URL is unmeasured, as it is for Codex's bridge and for
`cursor-agent`. `16` carries the other four. A runtime whose client dials `fe80::1` directly has no
mailbox in a box, and an agent with no mailbox is not an agent on a team; so a *no* on any of the
four reopens output 8 **for that runtime**, and goes first to `02` — the carrier is a property of
the kind, and the kind may have a second door — before it goes to `01` point 7. It does not come
here: no package in an image makes a client honour a variable it ignores.

**3. Two facts from `research/08`, each landing on an output.**

*The bridge's 659 MB, and the pin* (§5, and the `13` bullet of *What this settles*). The npm
install of `claude-agent-acp@0.70.0` weighs 659 MB because it bundles two `claude`s —
`claude-agent-sdk-linux-arm64` at 306 MB and `-musl` at 299 MB — beside the one the image installs;
the bridge itself is 708 KB. The same record shows the way out: with `CLAUDE_CODE_EXECUTABLE` set,
the bridge ran the CLI it was pointed at, which announced itself to the mailbox as 2.1.246, and the
bundled two were never the binary that ran. So **the image pins `CLAUDE_CODE_EXECUTABLE` to the
one CLI it installs**, in the image's own environment and not per spawn: which `claude` this bridge
runs is a fact of the image's contents, output 2's own question, and not a thing the adapter should
have to remember to hand over `exec -e` on every start. `adapters/claude/stdio-bridge.ts` already
names that variable as the one line that points the bridge at a binary, so nothing in core changes.
Output 2's *which binary the bridge runs* is answered: the image's, at output 3's version, never a
bundled one. Output 7 is narrowed rather than answered: the pin makes the bundled two dead weight,
and whether the build can leave them out — they arrive as the SDK's platform packages, and whether
an install can be told to omit them is unmeasured — is the difference between a Claude image near
Docker's own 610 MB and one 605 MB heavier, which output 7 measures in CI rather than guesses.

*`template load`, and the route* (§6). A `-t` naming a tag the store does not hold is a registry
pull the engine makes — an unqualified name went to `docker.io/library/…` and got `403` — while a
tag the store holds is used as it is, 3.7 s and nothing downloaded; and `template save` wrote a
1.09 GB tar of a 1.96 GB store image (§4, §6). `template load FILE` is read from `--help` (*"an
image from a tar file"*) and was not run; that one command is `16`'s to spend, and it is the only
unrun step in the route. Two conclusions. The **build-and-pull route is CI → tarball →
`template load`**: the workflow publishes a tar per runtime and architecture as a release asset,
with a sha256 pinned in core, the way `whisper-cli.yml` and `speech/catalog.ts` already do, and
nothing in the route is a registry — no daemon on the Mac, no registry account, no token. A private
repository is then the same wall it was for the dictation engine (`.scratch/dictation/build.md`),
and is not this ticket's to move. Output 5 reads that as its answer for *where*; the guest here is
`aarch64` (§2), and a second architecture is Alain's to name. And **"pull on first use" is a
download blobot makes**, of a tarball, followed by one engine command: a streaming sha256 against
the pin, `Range` resume, and a figure that knows its end — `downloading · 412 MB of 574 MB` — with
a word beside it that is never *image*. That is output 6, taken on the side it leaned to, because
the other side is a pull the engine reports in its own words to a policy the user never reads.
What it settles for `08` §1: the image layer **exists** — an image blobot downloaded and the
engine no longer holds is a state to detect before a launch, *Not installed* with `pull` as the
`RemedyKind`, exactly as `08` wrote it on this branch. What it hands `14`, and `17` — the engine,
split from `14` on `08` and not yet a file in `issues/`: the load is one engine command run unseen,
like `sbx policy init`, and what it loads is a file blobot already verified. And what the download
costs against output 7's budget: the tar is smaller than the store image (1.09 GB against 1.96 GB),
so the figure on screen is the download's and the disk figure is the store's, and `12`'s two
stand-ins are two figures and not one.

**4. Git identity: `05` decides whose name is on commits; this ticket asks one narrower thing.**
`research/08` §3 committed inside a box, and its script set `git config user.email` and
`user.name` by hand before it did — so what an unconfigured `git commit` inside blobot's image would
do was not measured, and by git's own rule it refuses: with no `user.email` in any config and a
hostname with no domain to build one from, it stops with *"Please tell me who you are"*, and the
commit an agent's whole turn was for does not happen. On `local` this never arises, because the CLI
runs under the user's own `~/.gitconfig`; in a box the home is the data volume's and holds nothing
of the operator's (item 1 above; `05` §5). Whose name goes on the commit — the user's, carried in
as a value; the agent's, `alice@blobot.local` as the probe did; or a name that says it was made in
a box — is a question about the branch that comes home, so it is `05`'s, the ticket that owns that
branch; it is not yet on `05` and is handed there by name. What is this ticket's is only whether
the image sets a **fallback** identity so the commit does not fail: a `GIT_AUTHOR_*` and
`GIT_COMMITTER_*` default, or a system-level `gitconfig`, that `05`'s answer overrides from
outside. The lean is yes, and stated: an image with no identity has a failure mode whose fix is a
config the user cannot reach, and a fallback naming the agent and the box under a `.local` domain
is honest about what happened without pretending to be the user. Whether the fallback lives in the
image's `/etc/gitconfig` or in the data volume's `~/.gitconfig` (which `05`'s answer would write)
is decided with `05`; whatever the image sets, none of it is the user's name or email, which is
the same line drawn once more — an image built in CI holds nothing of the operator's.

**What moves, restated.** To `05`: outputs 9 and 10, ADR-0003's second amendment, the comment on
`01` point 5, and whose name is on a commit. To `16`: the door on the other four runtimes (output
8), `template load` run once, and an install without the bundled two (output 7). To `08`: the
image layer, on the branch it already wrote. To `14` and `17`: the load as the engine's own
command. Kept here: outputs 1 to 8, the fallback identity, and `Blocked by: none`.

## Note, 2026-09-05 (consistency pass)

The fallback identity's domain is `05` §9's `.invalid`, not `.local`. And the 659 MB is the npm
install's, not the env var's: the bridge package pulls two bundled `claude` binaries, and
`CLAUDE_CODE_EXECUTABLE` only chooses which CLI runs (`research/08` §5); this ticket asks how the
image installs the bridge without them.

## Implementation input, 2026-09-05 — engine reevaluation closed

[Reevaluate the first Machine engine with the measured trade-offs](22-reevaluate-the-first-machine-engine.md#answer)
settles guest sudo and private Docker/Compose as required capabilities while retaining sbx.
Read that resolution before revisiting the base/daemon alternatives above. This ticket remains
open: the image still needs its contents and persistence guarantees implemented and verified.
Before designing replacement, use the persistent-state inventory in
[Lifecycle, persistence and resource costs](../research/16-engine-lifecycle-persistence-and-costs.md):
home/workspace copying alone does not preserve system package changes or the private daemon's
data. Do not label those covered by the existing synthetic two-volume test.


## Current continuation, 2026-09-05

Claimed as the second implementation ticket in the author's two-ticket continuation.
[Image decision frontier](../research/21-image-decision-frontier.md) separates existing
answers, proposals and factual gates. The base proposal (a pinned common shell-docker
derivative) was accepted in the **Base decision** below; its other proposals remain proposals.
Workspace now uses host worktrees; its former clone volume budget does not apply.
No release image has been built or published in this continuation.

### Resumed from handoff, 2026-09-05 — local snapshot coverage measured

While the base choice was pending, independent synthetic investigation established
local rootfs-versus-volume snapshot coverage and exposes engine-provided Docker startup and
an overlapping Docker mount; see
[Local templates and private Docker](../research/22-local-template-and-private-docker.md).
That note links the runnable fixture and raw results. It narrows the factual persistence
gate, not the release-image choice or permission to snapshot real Agent state. No production
code or activation guard changed, no release was built, and this ticket remains claimed.

### Base decision, 2026-09-05 (Guillermo)

The author answered **“si acepto”** to the explicit recommendation to use a common derivative
of Docker's shell template, pinned by hash, adding each runtime in its own image.
Use `docker/sandbox-templates:shell-docker` at multi-platform digest
`sha256:5fc81bc7a127e59d81b244a06831ae3212a0310b2e5a0349c54e29249e45e919`;
the architecture manifests and source evidence are in
[Image decision frontier](../research/21-image-decision-frontier.md).
This settles the base only. Guest sudo and private Docker/Compose remain the already accepted
capabilities; complete state preservation, measured capacities, image contents and release
acceptance still need their own evidence and any remaining human decisions.

### Architectures and initial capacity, 2026-09-05 (Guillermo)

The author accepted **arm64 and amd64** build/distribution targets, and initial per-Agent
capacity ceilings of **8 GiB for `/home/agent` and 20 GiB for private Docker**. The
AgentWorkspace remains the host worktree, outside these private-volume budgets. These are
capacity limits, not measured physical disk consumption or a claim that later resizing is
implemented. Validate the effective engine sizes and report actual download/store costs
separately. Do not retain the old placeholder of 4 GB total per Agent.

### Implementation checkpoint — continuous goal, 2026-09-05

The author now requests the entire Machines implementation as a continuous goal, with
validation and one commit per ticket, and delegates basic implementation choices. Keep the
five verified compatibility baselines in `images/machines/inputs.json`; this is an engineering
choice under that delegation, not a fabricated answer to the earlier optional versions prompt.
Keep shared images on Agent deletion. No automatic image garbage collector is introduced.
The eventual explicit cleanup must check both active Machines and retained recovery Machines.

The build recipe, bridge lockfiles, native CI matrix, draft-release assembler and standalone
startup check are implemented in [the image build directory](../../../images/machines/README.md).
Each final tag names its OCI manifest hash, separately from its recipe hash; changed bytes
cannot silently rebuild under the same tag. Each runtime has a 1 GiB archive regression ceiling.
Five Linux arm64 candidates have been built and their CLI versions verified. Linux amd64 is
configured for native CI, not yet measured. No release has been published and adapter download
lists remain empty until verified assets are available anonymously.

Each adapter supplies its image definition through `AgentRuntime.machineImage`; the engine
does not dispatch on provider names. `SbxImageStore` implements the already-decided verified
Range download and template-load route, rejects conflicting references, and validates the
archive's architecture, user, Docker storage label and both manifest formats before load.
Shared download handling now reports disk-write failures instead of hanging and refuses a
mismatched pinned length. Its real-engine fixture is [the installation receipt](../research/27-image-store-live-results.json);
that initial receipt predates the final storage-label guard and content-derived tags.

`start-docker=false` plus explicit privileged kit storage produces one home device of exactly
8 GiB and one Docker device of exactly 20 GiB; see [the capacity and quiescence measurement](../research/28-explicit-docker-volumes-and-quiescence.md).
The image's Docker wrapper uses guest sudo because RC5 omits supplementary groups. Core now
verifies those capacities, the daemon's root-owned mode 0710 and distinct devices. Docker
workload mounts beneath its private root do not change the host-mount boundary. Resource
replacement stays refused for both mounted Workspaces and kits with explicit Docker storage
until complete preservation is implemented; it never falls back to the old two-tree copy.

The ticket remains claimed while the remaining real-image acceptance and persistence work is
completed. Boot/first-start traffic is being measured independently of credential-free Docker
ACP startup; a successful initialize is not evidence of mailbox delivery or a paid turn.

### Acceptance results before publication, 2026-09-05

- [All five signed-out sbx observations](../research/29-runtime-image-deny-all-traffic.md)
  completed under deny-all. Boot/idle had no observed hosts; Codex, OpenCode and Cursor have
  runtime-start requests. [Source attribution](../research/31-codex-first-start-hosts.md)
  traces plugin initialization without silently disabling those capabilities. Egress owns
  admission of these destinations. fx still requires authentication before initialize.
- [Final local build receipts](../research/32-runtime-image-builds.json) retain the manifest
  IDs and content-derived references. [The final real-store fixture](../research/33-image-store-fixture.mjs)
  and [result](../research/33-image-store-fixture-results.json) pass the current storage-label,
  dual-manifest and load/readiness checks, including the full content tag; cleanup is verified.
- [The maintained-exec copy](../research/30-held-exec-preservation.md) preserved a 22,599,680-byte
  private archive exactly, Docker image/container/volume state, home metadata and the original
  Machine's recoverability with changed CPU/RAM. **Complete preservation remains unproven:**
  sbx's rootfs snapshot loses subsecond mtime, and production maintenance/exclusion/crash recovery
  are not implemented by this research fixture. Keep reconfiguration guards closed.

Distribution now needs a non-obvious publication decision: `Alain00/blobot` is private, while
runtime downloads must be anonymous. The prepared proposal is a separate public
`guillermolg00/blobot-machine-images` repository containing only build recipes/workflow and
runtime release artifacts. The account was checked and this proposed repository was not found.
No repository was created, source published, workflow dispatched or release made public.
The image ticket remains claimed; a commit of this checkpoint does not mark it resolved.

### Public artifact repository decision, 2026-09-05 (Guillermo)

The author answered **“ok”** to the explicit question authorizing creation of public
`guillermolg00/blobot-machine-images` and publication there of the build recipes and images
that pass validation. This authorizes the reviewed runtime-only publisher tree, native CI
builds and verified release assets; it does not change the application repository's visibility.
Record the actual publication receipts and anonymous-download checks before adding app pins.

### Public distribution acceptance, 2026-09-05

[Native CI and public distribution](../research/34-public-runtime-distribution.md) records the
published immutable release, all ten native build/smoke passes, anonymous whole-file checks
through the production downloader, actual Range resume, and the actual release's successful
load/readiness check in sbx. Both architectures are now pinned in every adapter. The release
is built from `056a3b31fa1838e16fcdd181c7c89528f7baf226` in the separate public repository.

[Rootfs fidelity and maintenance research](../research/35-rootfs-fidelity-and-mount-namespaces.md)
found that RC5 snapshots lose ACL/mtime fidelity and alter sparse-file content. An authoritative
PAX transfer restores the seeded content and metadata and survives candidate stop/reopen.
Private mount namespaces and a child cgroup freezer also pass bounded experiments, including
recovery after deliberate worker death. **Production complete-state migration remains open:**
the components must be composed and tested over the entire persistent rootfs, with admission
of late writers handled explicitly. Snapshot-only replacement and metadata-only patches cannot
meet the contract. Keep the existing resource-replacement guard until that implementation passes.

[Whole-container freezer and exec admission](../research/36-sibling-freezer-and-exec-admission.md)
closes the measured late-exec gap and recovers the original after worker death. Core now has a
tested internal framed `SbxStateChannel` for bounded opaque relay and sanitized failure handling;
it is not yet connected to resource replacement. The author's next checkpoint includes a commit,
integration of latest `main` and a pause before UI. This instruction changes session pacing,
not this ticket's acceptance criteria or claimed status.

[Complete PAX dumpdirs and running-binary replacement](../research/37-complete-pax-dumpdir-and-live-runtime.md)
validates authoritative absence/type restoration and safe default replacement in a complete
synthetic chroot. It records negative unlink/overwrite cases and the remaining xattr/socket
coverage gates. The fixture passes eleven assertions, cleans its own container, and does not
exercise production migration, real rootfs composition or durable cutover.

### Resumed after main; transfer and interrupted-replacement recovery checkpoint

Guillermo resumed the complete implementation goal after the validated main merge `1167d61`.
[Whole-root composition](../research/38-full-rootfs-composition-and-reopen.md) now covers
62,746 entries and excludes all three synthetic host mounts. Two full PAX archives per boot
match with no warnings. Reopening the original changes only `dockerd.log` in the recorded
projection; a post-boot whole-root SHA is therefore not interchangeable with restoration
verification. [Inode flags and preboot verification](../research/39-inode-flags-and-preboot-verification.md)
records the unknown flags and the absence of a documented RC5 maintenance-boot contract.

The internal three-tree protocol preflights rootfs/home/Docker, bounds aggregate bytes and
checks source/relay/receiver digests. [PAX validation](../research/41-state-archive-validation.md)
adds bounded path/metadata/coverage checks, including omitted members and archive warnings'
underlying coverage risk. Both remain foundations for the guest worker; they do not claim a
complete migration or substitute byte equality for metadata not encoded by the archive.

The staged lifecycle now records an admitted candidate and its copying/verifying phase
before mutation. Explicit recovery keeps the original active and retains the partial candidate.
Separate SQLite OS locks replace stale-on-crash directory locks for new operations, using
the existing dependency and no payload database. Process-death tests verify exclusion while
alive and reacquisition after SIGKILL without changing the journal. Legacy directory locks
still refuse automatic adoption. The real isolated two-volume lifecycle fixture verifies
interruption, recovery through a fresh owner, preserved files and restart; this is not a
full-root/private-Docker migration test. Keep the image ticket claimed and existing guards.

[File attributes and tar omission](../research/40-file-attributes-and-tar-omission.md) adds
42 verified synthetic attribute mutations/restorations. PAX omits the measured immutable,
append-only, nodump and project-inheritance flags. Base ioctl failures and statx's possibly
inherited lower-layer immutable bit remain distinct observations; none authorizes a blanket
metadata exception. Fixtures are cleaned and sbx is available. The implementation checkpoint
is `65ec602`; the author-facing decision round on the existing inner-fence owner is now open
at [Where the boundary goes](04-where-the-boundary-goes.md). This image ticket remains claimed.

### Guest protocol checkpoint — 2026-09-06

[The guest protocol](../research/51-guest-state-protocol.md) now implements the
bounded, ordered peer for the existing host relay, with independent wire checks,
backend restoration verification and disposal on failure. Its 14 new tests pass;
full core is 989 passed / 47 skipped, with typechecks and core build passing.
The actual filesystem/maintenance backend and full migration remain unfinished.

[Overlay copy-up](../research/50-overlay-copy-up-and-base-attributes.md) confirms
that the measured image-backed immutable observation does not prevent ordinary
mutation, while explicitly set upper immutable does. Rewriting also changes
ancestor-directory representation. Selective restoration is being investigated;
no unknown-attribute exception or production gate removal is adopted here.

### Held guest and selective archive checkpoint — 2026-09-06

[The production maintenance helper and tree reader](../research/55-production-maintenance-and-tree-reader.md)
now pass in a real owned RC5 guest, for source and target roles across stop/reopen.
Each role reads and validates all rootfs/home/Docker members twice with identical
archives. Source views are read-only, target views address their private trees,
the host worktree is excluded and disposal leaves writers frozen for VM stop.

[Selective extraction](../research/52-selective-incremental-extraction.md) and
[the compiled index/selector](../research/54-compiled-selection-against-gnu-tar.md)
cover changed members, authoritative deletion, ancestor times and hardlink
relationships. Six synthetic full restorations yield identical PAX archives.
Empty selections skip tar. Full core is 1,002 passed / 47 skipped; types/build
pass. Remaining: attributes outside PAX, same-image base comparison, the actual
three-tree receiver and candidate cutover verification. Keep this ticket claimed.

### Streaming receiver checkpoint — 2026-09-06

[Same-image comparison](../research/56-same-image-base-selection-and-attributes.md)
leaves all 60,946 source entries with both ioctl queries unavailable untouched.
Seven equal-PAX entries still have different observed attributes, so content
selection alone is insufficient. No exception turns unknown attributes into zero.

[The compiled receiver](../research/57-streaming-restore.md) restores a synthetic
private tree in an actual held guest. It checks the full received index, rejects
truncation, terminates helpers on failure, skips empty selection and requires
attribute hooks. Bounded bundle/description codecs carry preflight metadata before
archive bytes. Full core: 1,025 passed / 47 skipped; core types/build pass.
The actual attribute backend, composed three-tree migration and verified cutover
remain unfinished. This is a checkpoint; the ticket and existing guards stay open.

### Attribute backend and composed transfer checkpoint — 2026-09-06

[The attribute backend](../research/59-production-attribute-restoration.md) passes
actual synthetic restoration of ten directory policies, five file policies,
ACLs, xattrs, protected deletion and hardlinks. Unknown attributes remain explicit;
selected unknown inodes refuse before mutation. The full guest bootstrap and
filesystem backend now compose real archive and attribute verification with the
three-tree protocol. Core: 1,057 passed / 47 skipped, types/build pass.

[The first actual two-Machine composition](../research/60-composed-state-transfer.md)
passes all source preflight, then refuses the target root selection's three
unqueryable symlinks. It is not a successful full migration. Both owned fixtures
clean up. [The API research](../research/58-xattr-acl-reconciliation-and-fileattr-limits.md)
documents inherited special-inode state, so no unknown-as-zero exception is adopted.
Continue the native-route investigation and remaining runtime/activation work;
keep this ticket claimed and the existing replacement guard.

### Production adapter launch checkpoint — 2026-09-06

All five adapters now resolve their pinned executable/module and configuration
inside the guest. Host executable overrides, host module paths and Electron's
Node override are excluded. The desktop shares verified image downloads and
creates/adopts an owned Machine per persisted Agent placement. [Published Claude
arm64 acceptance](../research/64-production-box-launch-acceptance.md) passes actual
ACP initialize/session/new/default-mode, inbound MCP handshake and stop/reopen of
the same Machine. No login, tools or inference were performed; ACP ready does not
prove signed in, so the desktop checks guest login before ordinary launch.

Core 1,080/47 and desktop 626/1; types/builds pass. The remaining runtime/platform
acceptance and operational setup/login UI are still open. Post-creation resource
editing remains explicitly deferred by the sizing scope decision.
