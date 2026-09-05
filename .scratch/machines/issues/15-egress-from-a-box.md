Type: grilling
Status: claimed
Blocked by: 19

Current continuation, 2026-09-06: Guillermo rejected the fixed list and selected Internet access
without blobot destination limits beyond the harness's own behavior. The
[focused decision round](../egress-decision-round.md) records the answer. Implement this amended
scope while preserving host separation and the exact mailbox door. The older allowlist,
editability and generic proxy-log transcript requirements below are superseded.

The [measured open-network probe](../research/46-open-internet-boundary.md) exposes a new
decision: the native wildcard also reaches host-loopback services despite private CIDR denies.
The Internet choice is accepted; widening the host-service boundary is not. Keep this ticket
claimed and production guarded pending that answer or a verified additional boundary.

# Egress from a box: the allowlist, and how a block is said

## Question

From `01` point 5: a box reaches the network only through a host-side proxy with a domain
allowlist, and a blocked request is **said in the transcript and never lost in silence**. From
`02`: the one loopback exception is the mailbox door, `host.docker.internal:<port>` behind one
per-sandbox rule, read from the docs there and since measured — the bearer arrived intact and the
stream stayed open (`research/08` §2). From `03`: the runtimes' own fences confine the shell and
never the CLI, and `04`'s amendment draws the consequence for a box: what it bounds is **where the
login can be sent** — the egress list — and that holds on every runtime because it is a property
of the place and not of a fence inside the process that holds the login. Measured for one:
`api.anthropic.com` answered `403` under a deny-all policy (`research/08` §2). So inference
crosses the same proxy, and an empty list is an agent that cannot think.

**Blocked on `14` and nothing else.** `14` decides the kit that declares the list, and whether
the proxy's signal is on the Machine interface; how the list is declared is `14`'s, what it says
is here. The first draft was blocked on `13` and `16` as well, and neither holds. `16` is a
record, and its own amendment (point 4, revised 2026-09-05) says the gate on this ticket existed
only because this ticket's line named it, that the one item this ticket named from there — item
1, the bearer and the stream through the proxy and whether a refusal is logged — is spent in
`research/08` §2, and that dropping it is *`15`'s line to change and not this ticket's*. It is
changed here. What this ticket still takes from `16` — the hosts its 4b admits on the way to a
login, unrun — lands as a comment and moves a host row, never a shape, which is how `16` lands on
`13`, `14` and `05` already. (`research/07` §5 is the Claude `_meta` half on the `local` kind,
run before `16` was claimed; `16`'s amendment moved it to `04`, and it is cited here for one fact
about the other fence.) `13` was a blocker on three grounds and none survives. Whether a runtime's
own fence runs inside a box is `04`'s question 3, taken there by name and read by `13` only for
`bwrap`. What each CLI reaches at first start was refused both ways — the first draft here sent
it to `13` and `13`'s first draft sent it here, which left it with nobody — and `13` has since
**taken it as its output 3**, per runtime, as a fact of the image, measured on `16`'s box under
`deny-all` through `sbx policy log`, with the division stated in its own words: *`15` decides the
rule, the categories, whether telemetry is admitted, and pins the hosts as they arrive; this
ticket supplies what each CLI asks for and why*. Read here in exactly that division, as an input
that arrives and is marked provisional until it does, the way `13` marks its own output 1 on
`16`. And which registries the image's contents need is a conditional this ticket can state
without waiting for the base to be named. `09`'s blocking paragraph still reads this line as
`13`, `14` and `16`; that is said here rather than edited there.

**The list, and the rule it is built by.** Four kinds of host. The vendor's API and login hosts,
which **no adapter carries today** — a grep of `packages/core/src/adapters/` finds OpenCode's
`$schema` URL and one comment naming fx's installer, and no API or login host — so the
rule-preserving shape is a member on `AgentRuntime` each adapter fills, the way `accepts` says
what a runtime takes, and the Machine layer never learns the provider; decide whether that is the
shape, or the hosts live with the kit. `14` already reads the member as the shape and hangs the
image tag on the same seam, and `13`'s output 4 asks the same question of the tag; the lean is
the member, one answer for both, and a resolver who puts the hosts in the kit reopens `14`'s
reading by name. Docker's own kits are a prior, now measured: the Claude kit allows exactly
`api.anthropic.com`, `bridge.claudeusercontent.com`, `claude.com`, `downloads.claude.ai`,
`mcp-proxy.anthropic.com` and `platform.claude.com`, all `:443`, and nothing else (`research/08`
§5); there is **no fx kit at all** (`research/06`, *Docker Sandboxes*; `research/08` §1). And a
kit brings rules of its own that blobot's must not inherit: the `shell` kit allows
`openrouter.ai` (`research/08` §2), and the Claude kit points the CLI at the engine's own MCP
gateway (`research/08` §5). The forge. The registries an agent needs to install a dependency —
npm, and PyPI, crates.io and the Go proxy **if the image holds python, cargo or go**, which
follows `13`'s base and is not settled by its question: Docker's template ships Python, Go and
Java beside Node and a `node:22` base does not (`research/06`, *How the market builds the
per-agent image*, [DOC]), so the registries are a conditional on `13`'s output 1, stated here and
not a block on it — and the CDN hosts behind them, of which one is measured: `registry.npmjs.org`
alone let 99 packages and 659 MB in, with no second host (`research/08` §5). And telemetry, which
the vendor's own allowlist admits: Anthropic's devcontainer firewall lists `sentry.io` and
`statsig.com` beside `api.anthropic.com` (`research/06`, *Plain Docker*); decide whether blobot's
list does. Beside it, two sources of egress that are not the agent's. Docker's template asks
`ports.ubuntu.com` and `download.docker.com` on both boots the record holds, and is refused
(`research/08` §2, §5) — a fact about the base, which `13`'s output 3 has taken to silence (an
image built in CI has no updater to run at boot), and this ticket's to keep off the list and out
of the transcript. And the engine's daemon sends its own event batches off the machine
(`research/08` §1), which is not the box's egress and is `09` §2's account sentence to carry.

Must the list be measured rather than written? A written list is the vendors' documentation,
which names the API host and not the CDN an installer redirects to; a measured one is each runtime
started under a deny-all policy until it stops failing. `research/08` §5 did that for one runtime
at zero tokens, and its shape is the whole method: boot the box, run the bridge's `initialize` and
one `session/new` with no prompt, read `sbx policy log` — which names what was reached for whether
or not it was admitted: `api.anthropic.com` nine times, the engine's gateway three, the mailbox
door twice, nothing else — and one install, which named the registry and no CDN. That method is
now `13` output 3's, per runtime, and what it supplies is *what each CLI asks for and why*; so
the deliverable here is exact: the rule and the categories, decided on paper, and a host row per
runtime **pinned as it arrives** — `[OBS]` where `13`'s method has run, *provisional* where the
row is written from the vendor's page — recorded beside `research/08`. The start hosts cost no
tokens on any runtime, on `13`'s side. The login hosts cost a sign-in each, which is the author's
act: `16`'s 4b spends it once, for Claude, and hands what the policy admitted on the way to a
login here; the other four stay provisional until `08`'s login inside runs on each and the log is
read, as a comment here. What is decided about the default without measuring: `sbx`'s has
*"broad wildcards"* (`research/02` §4); `sbx policy init` must run before a first start
(`research/06`), initialising it is blobot's act and never a state the user meets (`08` §1, run by
`14`), and **the preset it is initialised with is this ticket's**, which `08` §1, `14` and `16`
each say by name — the lean is `deny-all`, the base every row in the record was measured under,
with `balanced`'s wildcards not called for, because a declared list is what replaces the engine's
default and a base admitting hosts the kit never named is a list nobody wrote; a rule added with
`--sandbox` dies with its sandbox (`research/08` §7); and `14`'s kit declares the list.
First-demo ticket 14's rule holds on the **rule and the categories**, not on the hosts: one way
of building the list on all five runtimes, and a block said the same way on all five. The hosts
are per runtime by this ticket's own construction, and a host missing from fx's row is a gap
`13`'s method finds, not a posture guarantee the user generalises — `12` §4 corrected the same
borrow of the rule in itself.

**What a domain rule means.** The proxy is *"a forward proxy for HTTP and HTTPS; other TCP
traffic is forwarded transparently"* (`research/03` (c), read), and a rule takes `*.` wildcards,
a `:port` suffix and `**` (`research/06`). What does a *domain* rule mean for TCP the proxy does
not read — `git fetch` over ssh to `github.com:22`, a database port, a dev server the agent starts
and expects to reach? Then the forge, which is on the list for one reason already: `gh pr view` is
vouched from `normal`, so `api.github.com` has to be reachable for that promise to hold on a box
(`10` §5). The prior is **a pull request is the user's action and never an agent's** (`CLAUDE.md`,
the `WORKSPACE` bullet). `05` §1 gave the three sentences that meet here one owner each, and the
division is read as given: the fetch's direction is `05`'s; what a push from inside meets is this
ticket's outcome 3, to which `05` contributes the one fact that is the Workspace's — **nothing
blobot puts in either volume is a push credential**, the data volume holding the CLI's own login
and nothing else (`01` point 4) and the user's `gh` login being on no list; and what carries the
prior at the fifth level is `10` §5's, named from both. So this ticket decides the route half,
whether the host a push needs is on the list, and states the credential half only as `05` wrote
it. One more thing a push could meet is named so it is not rediscovered, and it is **refused here,
not offered**: the engine's proxy can hold a secret and inject it on the way out (`sbx secret
set`, `research/06`, *Network and credentials*, [DOC]; `research/08` §2 saw eight `proxy-managed`
sentinels in the box's environment and names none of them — the first draft named `GH_TOKEN`
among them, `05` §1 cites *the `GH_TOKEN` sentinel* through this ticket, and the record carries no
such name; said here rather than edited there). A forge token behind the proxy would be a
credential blobot or its engine holds, which the map's *Out of scope* refuses in those words, and
`16`'s amendment (4b) refused the same `sbx secret set` route for the API key; so it is not among
the things a push from inside meets, and a resolver who wants it is reopening the map and not
this ticket. And ssh to the forge is not a domain question at all: `01` point 5's closed list has
no agent socket, so port 22 admitted is anonymous ssh, which no forge offers — `10` §5's *the
pair dies at least once on either answer*. Seen in the box's environment:
`SSH_AUTH_SOCK=/run/ssh-agent.sock`, carried by `socat` to the gateway (`research/08` §2, [OBS]);
that a process inside can ask that socket for signatures without reading the key is read from the
engine's own symbols (`research/03`, *Addendum*, [DOC]) — `05` §1 reads it as the engine's design
and `10` §5 as measured, and what the record holds is the variable and the `socat`, no signature
having been requested from inside. If the forward does what it says, the template hands a box
something wider than `01`'s list, so `14`'s kit turns it off to stay true to the list — `05` §1
and `10` §5 both read it that way — or the socket joins the list, which is **`01`'s to reopen and
not this ticket's to add**; what this ticket says is whether the list would need it. Last, the
fetch home. The direction is `05` §1's and `01` point 4's, read as given: the fetch is blobot's
act, on the user's own machine, inward, and a push would be the agent's and stays refused. What
`05` hands here by name is narrower — *whether the fetch's transport is a network the egress list
sees*. For the first engine's own remote, measured, it is not: `--clone` runs a git daemon
*inside* the box, published on a host loopback port, and the host fetches inward through it in
38 ms (`research/08` §3), with the proxy nowhere in that path. But `05` §6 refuses `--clone`'s
mount, so the transport `14` builds is a different one — a bundle or a remote helper over the
engine's exec — and whether *that* crosses the proxy is unmeasured (`16` item 2, as re-aimed). If
it does, is the transport a fixed entry the way the mailbox door is, or a host on the list? Asked
here, with the lean stated: a fixed entry, because bringing the branch home is blobot's act and
not the agent's reach, and the list is about the agent's reach.

**What the list does not do.** srt's own register (`research/01` §3, *Stated limitations*): no
traffic inspection, so domain fronting passes; a broad allow like `github.com` is an exfiltration
route to any repository. Its third, *a program ignoring proxy variables is not fenced*, is srt's
and not the box's on the docs' account — srt strips a process's network namespace and the proxy
is all that is left, where a microVM's host proxies every outbound TCP connection and forwards the
ones it does not read (`research/03` (c), read); the box's analogue is the non-HTTP TCP question
above, not a settled hole. Read and not run: `research/08` §2's `curl` obeyed `https_proxy`, and
no tool was run against the box with the variables unset, so that one line is this ticket's to
measure. Docker's own is **not** srt's on one point, and the point is half measured: the proxy
holds a CA (`PROXY_CA_CERT_B64`, a *Docker Sandboxes Proxy CA*; `research/08` §2, [OBS]) and a
kit's own hosts go `forward-bypass`, uninspected (`research/08` §5, [OBS]); that the proxy
**terminates TLS** for the hosts a rule allows is the record's own reading of the CA, and no log
line for a rule-allowed HTTPS host is quoted — one is this ticket's to take, and `09` §1, which
already places it as measured, takes the label from here when this resolves. If it holds, on this
engine the proxy reads what an agent sends to a host a person allowed, and reads nothing of what
it sends to the vendor — two facts for `09` to place, and neither is *safe*. And blobot's own:
the vendor's API host is there by necessity and is the one the proxy does not read, and a
credential inside the box can leave through it — ADR-0004's refusal of an ungated read, at the
network. For `09` to place.

**Whose list it is.** The mechanism is per agent — a box is per Agent, `sbx policy` scopes a
rule per sandbox, and a scoped rule dies with it (`research/08` §7) — and whether the *choice* is
per team in the folder step or per agent on its row is `01` point 3's decision again, under
ADR-0001. But that assumes a choice, and two priors say there may be none. The map's *Out of
scope* carries first-demo 14's line: *a boundary the user does not administer is one thing, and a
console for authoring rules is another, and this is still not it*. And first-demo 14's own
*Fixed, not configurable* — *a permissions settings screen is an approvals feature wearing a
smaller hat, and its first version is a text field holding a `deny` list nobody maintains* — in
the form its **second 2026-08-30 amendment** left it, which is the form the prior survives in: the
posture became the user's, per agent, in three words, and the amendment kept the refusal in the
same breath — *still not an approvals feature: there is still no screen listing what an agent may
currently do, nothing showing the `settings.local.json` that allow always accumulates, and no way
to revoke a standing rule except by opening that file*. So the line the prior draws is between a
default made choosable and a list a person administers, and a per-agent list of hostnames a person
edits is, on its face, on the second side of it: that text field holding an allow list instead.
So the first question is whether the list is the user's to edit **at all** — *nowhere, and not
the user's* is a permitted answer, and the one the priors lean to — and if the answer is an
editor, say why it is not the console the map refuses rather than where it goes. Where the list
*lives* is this ticket's; where it is *said*, if anywhere, is `12`'s, and `09` §3 already waits
on that.

Whether an **agent** may ask for a hostname has a prior: fx's `/allowlist` is refused from the
palette because it writes a persistent allow rule into the user's own `~/.fx/settings.json`, and
would be *the only path in the app by which an agent's own turn could widen what the next agent
is allowed to do* (`adapters/fx/palette.ts`). ADR-0003's sentence, carried forward exactly: *the
settings scope decides what an agent **can do**; the palette decides what blobot **offers**;
conflating them is what made a menu problem look like a capability problem.* An egress list is on
the *can do* side, so what the ADR lends is the shape — an allowlist, built from what a person
authored, that fails closed — and not a licence to read *allows* as *offers*. Does the fx refusal
hold for a hostname as for a command? One fact on the other fence bears on it, and its two halves
carry different labels. Measured (`research/07` (5), point 4): Claude's own fence answers an
unlisted host with a `SandboxNetworkAccess` permission request offering *Deny*, *Allow Once* and
*Always Allow*. Read, from the vendor's page quoted there: *Always Allow* writes a
`WebFetch(domain:…)` rule into local settings — the probe answered `reject_once` every time, and
where that file is for a blobot agent is on `research/07`'s own not-run list. Whether that fence
runs inside a box at all is `04`'s question 3, with a lean to *off* there; if it stays on, a
runtime's own list can widen from inside, beneath the proxy, which is why the proxy's list is the
one blobot vouches for and the only one this ticket is about. The person's side of the same
question is not this ticket's: whether a block line offers a person the add — a **door** — is
`09` §3's, which has taken it in so many words and leans to *no*. What this ticket gives it are
the two answers it reads for that and neither decides it: whether there is an editor at all
(outcome 6) and whether an agent may ask (outcome 7); if there is no editor there is nothing a
door could open, which `09` has already drawn.

**How blobot learns of a block.** `01` point 5 says a block is said in the transcript; the words
are `09` §3's. This ticket decides the mechanism: what a refusal is on the wire, and where blobot
reads it. Both carriers are measured now (`research/08` §2, §5), and neither is the silence
`research/06`'s table left open. **The tool's side**: the proxy answers a refused host with a
synthesized `403` and nothing times out — `curl` printed `403`, `npm install` printed `npm ERR!
403` — so the CLI's tool sees an HTTP error and the model reads it in the tool result. **The
proxy's side**: `sbx policy log <name>` lists every allowed and refused host with a count and a
reason, `--json` exists, and the same log carries the template's own boot noise. What that
carrier settles is not this ticket's to say twice. **That a refusal by the proxy is not a
permission request and never enters `waiting`** is `09` §3's — decided there once, with its
reason, after the first draft of this ticket pointed it at `10` §3, `10` §3 read it from `09`, and
`09` found nobody holding it and took it — and it is read here as given; what this ticket
contributes to it is the measured half `09` leans on, that nothing was asked and the turn goes
on, which is the `403`. That the event folds into no `StatusWord` and does not sound is `09` §3's
own. Whether it earns anything on the rail is a place: `12` §3 has drawn nothing there and says
the loop ends on its sentence, and `10` §3 has taken the *whether* — between them and not here.
What is not measured is what decides the carrier: whether that log can be followed as it happens
or only read back per turn, which is the shape of the signal on `14`'s interface; how a tool
reports the `403` inside a real turn, which `research/08` did not spend a token on; and whether
the model's own account of the `403` is the transcript's line or blobot's reading of the log is.
Then the other fence, in case it is on inside a box: on Claude's own sandbox a domain refusal
arrives as a `session/request_permission` with the host in `rawInput`, is written back to the
model as a `<sandbox_violations>` block naming host and port, and a loopback refusal is written
back as **nothing** (`research/07` (5), points 3 and 4). Whether that fence runs inside a box is
`04`'s question 3. What this ticket states is the mechanism, and it is two carriers of different
kinds: a fence's refusal *is* a permission request and draws as ticket 14's inline block with the
agent `waiting`, `10` §3's *unvouched, and stopped*; the proxy's is a `403` to the tool and a
line, `10` §3's *refused, and continued*. So on the wire they are **two events**, said apart and
never folded into one — handed to `10` §3 as a **constraint and not a question**, which `10` has
taken in those words: at the fifth level the request channel is closed, what a fence's refusal
becomes there is `10`'s to measure after `04` answers, and if `04` turns the fence off inside a
box the first event never exists and the constraint costs nothing. And a refusal written back as
nothing is `01` point 5's forbidden silence: where a fence is that silent the only carrier is
blobot's own reading, and Apple `container` has no proxy of its own to read at all
(`research/06`). Then the choice the words depend on: does blobot draw its own line from the
proxy's log, or leave the vendor's text? Filtering a vendor's text is the fx-diagnostics hazard;
silence is what `01` forbids; and a line drawn from the log has to tell the agent's refusal from
the image's boot noise, or it says the agent tried to reach `ports.ubuntu.com`.

**Sizing, and the split.** This is at the top of the map's range for one session, and unlike the
first draft it says where it splits. Everything that closes on paper — the rule and the
categories, the preset, the shape on `AgentRuntime`, the TCP question, the push route, the
fetch's transport, the honest statement, editability, the agent's ask, the two-event constraint,
the fifth level and the mailbox door — is one session and resolves this ticket, with the host
rows pinned as `13`'s output 3 and `16`'s 4b deliver them and provisional until they do. What is
this ticket's own to measure is four things, on a box, in `research/08` §5's shape, three at
zero tokens: one tool with the proxy variables unset, one log line for a rule-allowed HTTPS host,
whether the log can be followed as it happens — and the one that costs a turn, how a tool reports
the `403` inside a real turn. They land as comments and move a row or a carrier's shape by one
word, never a decision, which is `16`'s amendment applied to this ticket's own spend.

## What must come out of it

1. The rule the list is built by — written from what each vendor documents, measured under a
   deny-all policy in `research/08` §5's shape, or both — the **preset** blobot's kit initialises
   the policy with, and the categories that go on the list: the vendor's API and login hosts, the
   forge, the registries `13`'s base needs (a conditional on its output 1), the CDN behind them,
   telemetry admitted or refused, and the kit's own rules that blobot's kit does not inherit. The
   host rows per runtime are **pinned here as they arrive** — what each CLI asks for at first
   start from `13`'s output 3, Claude's login hosts from `16`'s 4b — `[OBS]` where measured and
   provisional where written, and never re-measured here. The image's own boot noise is kept off
   the list and out of the transcript; silencing it is `13` output 3's. (Reads `14` for how the
   kit declares the list.)
2. Where the vendor's hosts live: a member on `AgentRuntime` each adapter fills, or the kit, so
   that nothing outside an adapter learns the provider. `14` reads the member as fixed and `13`'s
   output 4 asks the same of the image tag; the lean is the member, one answer for both, and the
   kit reopens `14`'s reading by name.
3. What a domain rule means for TCP the proxy does not read; whether the host a push needs is on
   the list — the route half, with the credential half stated as `05` §1 wrote it and a
   credential the proxy holds refused and not an option; and whether the list would need the
   agent socket the template forwards, which is `01`'s to reopen and `14`'s kit to turn off until
   it does. (`10` §5 names the carrier of *a pull request is the user's* from this and `05` §1
   together.)
4. Whether the fetch's transport is a network the list sees — the one question `05` hands here
   by name; the direction rule is `05` §1's and read as given. Measured *no* for the first
   engine's own remote (`research/08` §3), unmeasured for the transport `14` builds; and if that
   one crosses the proxy, whether it is a fixed entry or a host on the list, with the lean stated.
5. The honest statement of what the list does not do, for `09` §1 to place: TLS terminated at the
   proxy for allowed hosts — the record's reading of the CA, confirmed or not by one log line —
   and bypassed for the vendor's, no inspection of the rest, a broad allow an exfiltration route.
6. Whether the list is the user's to edit at all, against the map's *Out of scope* and first-demo
   14's *Fixed, not configurable* as its second 2026-08-30 amendment left it; if it is, per team
   or per agent (`01` point 3) and why the editor is not the console the map refuses; and where
   the list lives. Where it is said is `12`'s; whether a block line is a door to it is `09` §3's.
7. Whether an agent may ask for a hostname (the prior says no). `09` §3 reads this and 6 for the
   door and decides the door itself.
8. The block's carrier: the tool's `403`, the proxy's log, or both; whether the log is followed
   or read back per turn, and so what crosses `14`'s interface; how the agent's refusals are told
   from the image's boot noise; and the two-event constraint — a fence's refusal inside a box, if
   `04` keeps one on, is a permission request and the proxy's is a `403`, never one event — handed
   to `10` §3 as a constraint. *Not `waiting`* is `09` §3's and is read, not restated. (`16` item
   1's record, `research/08` §2.)
9. That the fifth level changes nothing here — `10` §3's hand-off, read as an input and
   conditional on `04`'s question 5: if prompting and reach are two controls, reach is per kind
   and a level widens no list; if `04` folds them, `10` re-says it and this outcome is re-read.
   Confirmed here, or refuted with the reason.
10. The mailbox door is one per-sandbox rule the kind carries, resolved on `02` and read as
    given; what is this ticket's is whether it is a fact `09` says or a row `12` draws.

## Not this ticket

The engine interface, the kit's declaration of the list, the fetch transport, initialising the
policy before a first start (blobot's act, run by `14`, with the preset from outcome 1), and
whether the proxy's log crosses the interface (`14`). The image and its base (`13` output 1);
what each CLI asks for at first start, per runtime, and that the image itself reaches nothing at
boot (`13` output 3, read here as the rows arrive). Whether a runtime's own fence runs inside a
box (`04`, question 3; `13` reads it only for `bwrap`). Login inside a box (`08`); the login
hosts the other four runtimes reach are read from the log when that runs, as a comment here, and
are provisional until then. The words of the block line and whether it carries a door — `09` §3
owns both, and this ticket hands it the mechanism and its two answers for the door and nothing
more; *not `waiting`*, the fold into no `StatusWord` and the silence are `09` §3's own. The rail,
a place: `12` §3 and `10` §3. The fifth level's name and sentence, and what a fence's refusal
becomes when the request channel is closed (`10`). Bringing the branch home (`05`), which hands
here only whether the fetch's transport is a network the list sees and the one fact about the
volumes. Where the list and the Machine are said on screen (`12`). `04` hands here *the egress
list and how a blocked request is said* and `12` hands *a blocked request in the transcript*:
both land on outcome 8, and the words go back to `09`. Whether the agent socket joins the closed
list is `01`'s; turning the engine's forward off is `14`'s kit; whether a credential ever sits in
the engine's store is the map's *Out of scope*, refused above and not a question here. `16` is a
record and not a gate: its item 1 is read (`research/08` §2), its 4b hands Claude's login hosts
here when it runs, and nothing of this ticket waits on it. A hosted box's proxy is not on this
computer — out of scope to build, in scope as a constraint by the map's *Reopened while working*:
the list has to be a thing that travels with the box, which the first engine already does for its
own rules (`research/06`, *A hosted kind exists*: *egress rules carried, secrets never*).

### Decided, 2026-09-05 — the engine's own store is the CLI's file, not blobot's database

The author, on the reading `08` tier 1 and `15` took opposite ways: **`08`'s.** If the engine's
proxy manages the CLI's OAuth sign-in, the token sits in the engine's own secret store **on the
user's machine**, put there by a tool the user installed and signed into, the way the CLI's own
credentials file or Keychain entry sits there today. blobot does not hold it, read it, move it or
proxy it. *No credential storage* was written against a credentials database of blobot's own, and
the engine's store is not that. So tier 1 is a legitimate product route once `16` measures that it
holds for blobot's image, and `15`'s sentence about a proxy-held credential applies to what
**blobot** would put there — a forge token, a key it found in the environment — and to nothing the
user's own tools keep for themselves.

## Note, 2026-09-05 (consistency pass)

`05` §10 decides `gh` is not in the image and that a vouch is about asking, never about reach, so
`api.github.com` is owed to the list on no vouched verb's account; this ticket reads that. The
forward off is `17`'s kit, and `01`'s amendment has refused the socket, so *whether it joins the
list* is moot. The rail is `12`'s. If `12` §7's door ever ships, Microsoft's update hosts are its
price and are named here then.

## Continuation, 2026-09-06

The current Workspace answer supersedes this ticket's historical clone, fetch-home and
no-origin questions. Worktrees already expose the shared Git metadata and origin; there is no
network transport to bring their branch home. The accepted SSH-forwarding exclusion stands.
The native boundary answer keeps box reach separate from approvals and turns off Claude's
optional inner fence inside a box. No choice already accepted in those tickets is reopened.

Claimed after the individual-Team entry point was completed in `1aa70a7`. The first pending
product choice is recorded in the [decision round](../egress-decision-round.md). Exact host
classification, release-artifact validation, policy enforcement and denial-event integration
remain implementation/research work. The ticket is not resolved and box activation is closed.
