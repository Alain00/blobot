Type: grilling
Status: open
Blocked by: 17

# Detection, and its remedies, when the runtime is not on this computer

## Question

Ticket 11's four honest states — and, since `runtime-readiness`, the way out of each — are
written as facts about **the app's machine**. `claude`, `opencode`, `cursor-agent` and `fx` are
looked for on `PATH`; `fx status --json` and `cursor-agent status --format json` are spawned
here; the remedy runs the vendor's own `auth login` or install command on a real pseudo-terminal
inside the app, and the CLI opens its own browser.

Every one of those sentences is about the wrong computer once a Machine is not this one.

## What to decide

- **Detection runs where the agent runs.** Which means a probe over the transport, a result that
  can be *stale* in a way a local probe never is, and a fifth state that is not one of the four:
  **we could not ask.** The four states were chosen to be honest and to gate nothing; a fifth
  must not quietly become a gate either.
- **What the remedy is off-machine.** `claude auth login` over ssh gets a pty and works; the
  browser it opens is on the far side, in front of nobody. The vendor's device-code flow may
  rescue this and may not, per vendor. Establish it rather than assuming, because
  `runtime-readiness` made a point of never concluding from an exit code and this is the same
  trap in a new place.
- **Where a credential ends up.** blobot stores none and proxies none, and that rule does not
  weaken by distance: a runtime signed in on a remote box is signed in **there**, in the user's
  own account on the user's own machine, exactly as `gh` is the user's own login spawned. What
  must be decided is whether blobot may *offer* to sign in over there, or whether that is a
  thing the user does themselves before handing blobot the box.
- **Caching.** Detection today is asked fresh and gates nothing. Over a network, asking fresh on
  every screen is a cost, and caching an answer is how a screen comes to assert something that
  stopped being true.
- **The refusal that already exists.** A launch whose agent's runtime is `not_installed` is
  refused by name rather than surfacing as `spawn opencode ENOENT`. The off-machine version of
  that error is worse and more varied, and it is the one the user will actually hit.

## Where the argument has already been had

`.scratch/runtime-readiness/` decided the local shape and its reasons are binding here: two ids
travel and the command is looked up on the far side, argv is core's and never the renderer's,
nothing concludes from an exit code, and the screen ends on detection asked again in the same
four words. All four survive the move in principle. Check each one rather than inheriting it.

## Amendment, 2026-09-04 — this computer only

The question above was written for a runtime on **another** computer, and that kind left the
map the same day: `remote` and `hosted` are fresh efforts, and ticket `01` decided the two kinds
in scope — `local`, and `box`: a microVM on this computer, blobot's own image per runtime inside
it, one instance per Agent with a *data* volume holding the CLI's own login and a *workspace*
volume holding the clone, `sbx` as the first engine behind a Machine interface. The title stays
as it is and is now wrong by one word, as `03`'s H1 is: the runtime is on this computer; it is in
a box on it.

Most of the body above dies with the distance. There is no transport to probe over and no browser
opening in front of nobody. What survives is the shape `runtime-readiness` fixed — two ids
travel, argv is core's, nothing concludes from an exit code, the screen ends on detection asked
again in the same four words — and it survives because the pty is still on this computer. And one
thing survives as a constraint rather than as work: the map's *Reopened while working* says every
ticket that fixes an interface, detection named among them, is answered with the `hosted` kind in
view. So the body's stale answer and its *we could not ask* are not discarded; they are the shape
a probe over a transport will have, and nothing written here may be a sentence that turns false
the day a third kind arrives. Where that bites is question 1's type and question 4's caching, and
each says so.

What is new is that **detection has two subjects where it had one**: the engine, which is the
Machine kind's and is one fact for the whole app; and the runtime inside a box, which is an
Agent's, because the data volume it is signed in on is that Agent's and no other's (`01`, point
4). A probe on the host says nothing about either — `claude auth status` here answers for
`~/.claude` here, and *"sandboxes don't pick up user-level configuration from your host"*
(`research/02` §4) — so the whole of today's `detectRuntimes` is the `local` kind's and nothing
more. A `local` agent is detected exactly as it is now; nothing here touches it.

One rule governs every remedy below, and the first version of this amendment cited the wrong
one. `CONTEXT.md`'s *Avoid* is a list of words; the permanent rule is `CLAUDE.md`'s **Docker is
invisible infrastructure: the user never sees or types a Docker command.** `runtime-readiness`'s
remedy shape is a command *shown in full and confirmed* — `shown` is user copy, and the confirm is
the user agreeing to the command they would have pasted — so that shape is **unavailable for the
engine**, on the rule and not on a style. The second version then sent `sbx login` to `14` as a
thing *driven invisibly*, citing words `14` never wrote. `14` says the opposite in three places:
its body sends the login here, *on the pty `main/runtime-step.ts` holds, shown in full and
confirmed* — the shape the previous sentence rules out — its output 2 reads *not how login
is driven (`08`)*, and its *Not this ticket* says the same. `09`'s *Not this ticket* names the
loop, withdraws its own pointer, and asks that one of the two take it. **This ticket takes it**,
because the reasoning the login needs is the install's, and the install is already here. What is
this ticket's is then: **which state calls for which remedy, how the engine's own sign-in is
driven and what the rule leaves of it, what the runtime's own sign-in inside a box shows, and what
detection hands the launch refusal.** Four questions.

### 1. What is detected for `box`, and in which of the four words

Three layers, from the outside in, each with something to run and a way it fails:

- **The engine.** `sbx` on `PATH`, by the same cascade that finds `claude`. Its own daemon —
  `sandboxd`, the process behind the ssh door (`research/03`, *Addendum*; which process answers
  `sbx exec` is read from nothing and not assumed), and not Docker Desktop's, which `sbx` does not
  need (`research/06`, *Docker Sandboxes*, [DOC]) — if a daemon is a condition the CLI does not
  clear for itself, which is `14`'s question (*`sbx`'s on demand, or blobot's?*). `sbx login`
  done, which the binary carries a string for, *"cannot access credential store (run 'sbx
  login')"* (`research/06`, *Login* — [OBS] from the binary's strings, never from a run). And the
  network policy initialised: `sbx policy init` *"must be run before … starting a sandbox for the
  first time"* (`research/06`, *Network and credentials*, [OBS]), which `09` §4 already lists
  among the ways a box fails to start and which the first version of this layer had no readiness
  for. Which command answers each is read from `sbx --help` and measured, never assumed, and `14`
  owns the engine interface those answers sit behind.
- **The image.** blobot's own, per runtime, at the pinned tag (`01` point 7; `13`). Asked of the
  engine rather than remembered from blobot's own pull, because a user can remove what the engine
  holds, and a memo of a pull is the confident false tick ticket 11 refuses. **Whether this layer
  exists at all is `13`'s item 6** — *who pulls, `sbx -t` on first run or blobot ahead of it* —
  and everything here that touches it is written on both branches, which is why `13` is a peer of
  this ticket and not a blocker: if blobot pulls ahead, at *create* as `12` §1 draws it, an image
  the engine no longer holds is a state to detect before a launch; if the engine pulls at first
  run, there is no such state, the first launch carries the download with `12`'s figure, and this
  layer is struck. `13` item 6 already reads this ticket's word for that state as given, so the
  two resolve side by side and neither waits on the other.
- **The login inside the data volume.** The five probes that exist — `claude auth status`,
  `codex login status`, `opencode auth list`, `fx status --json`,
  `cursor-agent status --format json` — run **inside**, per Agent, over whatever transport `14`
  gives a command into a box (`sbx exec -i` is `14`'s candidate on the first engine, settled only
  when `16` item 4 has carried JSON-RPC over it), read by the parsers already pinned to captured
  samples. The same asymmetry holds: a negative is reliable, a positive is not. The new cost is
  that it needs a box that is up, which question 4 returns to.

The mapping proposed, to be argued with: **engine absent → Not installed; engine present and not
logged in → Needs sign-in; the policy never initialised → never a state the user meets, because
initialising it is blobot's act before a first start (proposed here, run by `14`, with the preset
`15`'s), and a launch that finds it undone is refused by name and never left to the engine's own
error; image not pulled → Not installed, if `13` says blobot pulls; the CLI inside not signed in
→ Needs sign-in; any probe that could not run → Status unknown, with the reason in the detail
line**; everything present → Ready. The four hold because each is a fact about *a subject*, and
the subject is now stated: on the engine the words are about *a sandbox on this computer*, on the
runtime they are about *Alice's Claude Code, in her sandbox*, and a Ready on one says nothing
about the other. Two candidate fifth words are refused on this reading, and the author should say
if either is wanted back:

- *We could not ask* — the fifth state the body above proposed. Inside this computer it is a
  reason for **Status unknown** and not a state of its own: `unknown` already means *we could
  not tell*, its detail line already carries why (`Installed; sign-in state could not be read`),
  and a stopped daemon or a failed `exec` is one more why. A fifth word for the same fact is a
  word the user has to learn. Refused as a word and kept as a fact: the constraint above means
  the type below has to be able to carry *could not ask*, and it does, as a reason.
- *Not pulled* — refused because **Not installed** is the exact truth: there is nothing to
  spawn, which is the one definition the launch refusal has ever used. What differs is the
  remedy, and remedies are already looked up by kind rather than read off the state word
  (`remediesFor`); a `pull` beside `install` and `sign_in` would be a `RemedyKind`, not a
  readiness — and only if `13` gives it a state to answer.

What this does change is the type. `RuntimeDetection` is keyed by `runtimeId` and is a claim
about this computer. A box detection is keyed by the Machine's *engine* for the engine and the
image — whether that is one engine per kind or several is `14`'s output 6, an amendment on `02`
if the answer is *per engine*, and this reads it — and by Agent for the login. Whether that is
one type with its subject on it or two types is the decision, and it is the one the picker, the
folder step and the agent's row all read. The constraint above puts one requirement on either
shape, stated so it is not discovered later: the type has to have room for a subject that is not
this computer and for an answer that has an age. On this computer the age is zero and unprinted,
which is why question 4's second shape is not refused on its face.

### 2. The remedies

Four remedies where the first version listed three, and the first of them may not exist.

- **Installing the engine.** `research/03` (c) read `brew trust docker/tap && brew install
  docker/tap/sbx` for macOS; it is a Docker command, and the permanent rule leaves no shape in
  which blobot shows it, while `runtime-readiness`'s rule leaves no shape in which blobot runs an
  install unshown — an install is *the user agreeing to the command they would have pasted*. The
  two rules meet and neither gives. The first version of this bullet also counted a proprietary
  licence among what the install accepts, and that was the wrong command: the cask ships a
  `LICENSE` file (`research/06`, *Docker Sandboxes*, [OBS]), and the step at which the vendor's
  agreement is met is the login's, weighed in the next bullet. Proposed: **the engine has no
  install remedy blobot runs.** The map's settled premise is that the user brings the box,
  narrowed the same day to *blobot never requires one*, and `01` point 6 already says the kind is
  *offered when its engine is detected*, which reads as the user having brought it. The engine's
  `Not installed` then carries a sentence and not a door, and what that sentence may say — where
  the engine is found, and whether the vendor is named as a vendor — is `09` §2's *The name*,
  asked once there and not again here. `remediesFor` returning nothing on Windows becomes the
  same absence on every platform for the engine, stated. Put to the author: whether a kind with
  no install door is acceptable, or whether the permanent rule is to be amended for this one
  command, which is not a thing this ticket can do.
- **`sbx login`.** This ticket's, and the one remedy that meets the permanent rule head-on, since
  it is the only Docker command in the app that needs a person at the far end of it. The state
  that calls for it is `Needs sign-in` on the engine, from the string the binary carries. What
  the command does: it *"opens a browser for Docker OAuth"* (`research/06`, *Login*, [DOC]), and
  *"by logging in, you agree to our Subscription Service Agreement"* (same section, [OBS] from the
  binary's strings) — so this, and not the install, is where the vendor's agreement is met, which
  is how `09` §2 already reads it. Three shapes, and what the rule leaves of each:

  - *Shown in full and confirmed* — `runtime-readiness`'s shape, and the one `14`'s body assumed
    when it sent the login here. `shown` reads `sbx login`, a Docker command on a pixel the user
    reads. Unavailable, as above.
  - *Run unseen, on the pty.* blobot spawns the command through `main/runtime-step.ts` and never
    prints it; the confirm is in plain words, the account sentence `09` §2 writes; and the pty
    under it shows what the vendor's own program prints once it runs, which is outside blobot's
    mouth the way `claude auth login`'s output is — `12`'s reading of the rule, that blobot
    running the engine's command unseen is what it permits and the user reading one is its
    clause. The browser it opens is the vendor's own page, where the user signs in and meets the
    agreement; blobot accepts nothing on anyone's behalf, because it reads none of the stream and
    answers nothing in it, the same absence that keeps *no credential storage* true of
    `claude auth login`. The pty stays because nothing concludes from an exit code, and a login
    that prints a URL instead of opening a browser has to print it somewhere a person can read.
  - *Run unseen, headless.* No pty: the browser opens or it does not. Refused — it is the second
    shape with its one honest channel removed, and it concludes from the exit code by having
    nothing else to conclude from.

  The proposal is the second, and its cost is said rather than absorbed: `runtime-readiness`'s
  confirm was the user agreeing to *the command they would have pasted*, and here they agree to a
  sign-in whose command they never see, so the confirm is a sentence about an account and not
  about a command — the first of that kind in the app, for the first account in the app that is
  not a runtime's. Two facts go to `09` §2 for the words: that, and that the browser it opens is
  the vendor's own page. **Put to the author, for `sbx login` and the install together**, which
  is what `12`'s amendment expects of this section: whether a plain-words confirm over an unseen
  command satisfies the rule, or the rule is to be amended for this one command — not a thing
  this ticket can do. Whether the vendor is named in that sentence is `09` §2's *The name*, asked
  there and not again here. Nothing concludes from the exit; the screen ends on the engine asked
  again.
- **The daemon.** Whether it is a condition at all — `sbx`'s own, started on demand, or a thing
  blobot must see up before `spawn` — is `14`'s and stays there. If `14` says it is one, its
  remedy is this ticket's by the same rule and is the short case of it: `sbx daemon start` is a
  Docker command, it opens no browser and asks nothing of a person, so there is nothing for a pty
  to carry and nothing for a confirm to say, and it runs unseen the way `sbx policy init` is
  proposed to in question 1, as blobot's act before a start. Until it has run, the engine's word
  is *Status unknown* with the reason, never *Not installed*, because the binary is there.
- **The CLI's own sign-in, inside the box**: this ticket's. Per Agent, the vendor's own command
  from the table in `remedies.ts` — `claude auth login`, `codex login`, `opencode auth login`,
  `fx login`, `cursor-agent login` — carried into the box over `14`'s transport. What is **shown**
  is the vendor's command and nothing of the carrier: `shown` reads `claude auth login`, the note
  says *inside Alice's sandbox*, and the wrapper is argv's and never printed, which is the
  permanent rule and `runtime-readiness`'s *argv is core's* meeting in one field. It is offered
  only when the engine is Ready and the box is up, so the engine's own failures are met by
  detection before the pty opens and never in it as a sentence the user reads. The browser that
  command would open is inside the box, where there is none, so every vendor's flow has to fall
  back to **printing a URL or a device code that the user opens on the host**. What each vendor's
  command does with no browser to open — prints a URL, prints a device code, or waits for a
  browser that never comes — is **read from the vendor's own docs, per vendor, Claude included,
  and marked read**: a run is a box with that runtime's image in it, which exists for none of the
  five yet (`13`, output 8), and five sign-in flows on the user's real accounts are not a grilling
  ticket's to spend. One point is measured, by `16` item 4b: Claude's `/login` inside an
  interactive `sbx exec -it`, the URL carried to a host browser by hand, which is `research/02`
  §4's route and the one Docker's docs assume. That is the interactive flow, and `claude auth
  login` under a non-interactive `exec` is not known to be the same one. Three lines are left for
  `16` to take as comments, the way `05` left it one: whether `claude auth login` under `exec`
  prints what `/login` printed (its item 4b); whether the transport prints a word of its own
  before the CLI's first byte, since that word would be the vendor's on the user's screen (its
  item 4a); and the other four vendors, one each, when `13` has an image for them. Where the
  login inside came to rest is what 4b already hands here. A vendor with no such flow has no
  sign-in remedy on `box`, reported as an absence and never worked around by pasting anything
  through the pty on the user's behalf.

Three things the inside sign-in has to decide:

- **Whose exit is the exit.** The transport's exit code is the transport's, and the login's is
  behind it. *Nothing concludes from an exit code* was already the rule; here it is not even the
  right process's code. The screen ends on detection asked again, of the box, which costs
  question 4's probe.
- **The grant crossing the boundary by hand.** `runtime-readiness` refuses to read the pty stream
  at all — *the moment blobot reads that stream it is in the credential business* (its `spec.md`,
  where the rule lives) — and the honest consequence is that a device-code URL printed in a
  monochrome terminal is copied by the user, by hand, into a browser. What that URL is should be
  said plainly before the author is asked: a device-code URL carries the user code, so what would
  be matched and opened is **a one-time authorisation grant**, which is the reason the rule
  refused the stream in the first place. Put to the author: **does the rule hold at that cost,
  or is a URL in the stream a narrow exception** — matched by shape, offered to open, never
  stored? A yes is an **amendment to `runtime-readiness`'s spec** and is recorded there, not
  here. The case for holding: a rule with one exception is how the next one gets drawn. The case
  for the exception: a device code is designed to be shown to a person, and a person copying
  `https://` out of xterm is the flow at its least helpful, not its most honest.
- **When the remedy is reachable.** A data volume exists only once an Agent has a box, so the
  sign-in inside is not reachable before the box exists, wherever it is drawn — today's remedies
  are reached at hire time, before any team exists, and there is nothing to exec into then. When
  a box comes to exist is `14`'s lifecycle question; if it is provisioned when the team is formed,
  the order is *form the team → the box exists → sign in inside it*, and the remedy is offered
  **wherever `12` draws the Agent's readiness**. The order is this ticket's and the place is
  `12`'s, on `09`'s reading rule — a word is decided here and a place is not — and on this
  ticket's own §3, which requires a door and does not choose one. A fresh team of three agents on
  `box` is **three browser round-trips**, one per data volume. Seeding a data volume from a
  template so that N logins become one is on the map's *Not yet specified* and is not decided
  here; this ticket states the cost and leaves it.

And one sentence the first version got wrong, because question 4 was built on it: *a signed-out
CLI in a box says so itself over ACP, the same honest sentence in the same place.* It is not the
same sentence, and it is not even the same place. Per runtime, read from the adapters, and
measured for three of the five:

| runtime | what a signed-out CLI does at launch | where |
|---|---|---|
| Claude | answers `initialize`; an empty `authMethods` is the proof of a login, a non-empty one is refused by name with the vendor's command | `claude-agent-runtime.ts`, `assertAuthenticated` |
| fx | fails `initialize` itself with `-32600` and advertises `authMethods: []`; the adapter quotes fx's own sentence, and detection is *load-bearing rather than a courtesy* | `fx-agent-runtime.ts`, `#initialize`; `.scratch/fx-runtime/research/01` §1 |
| Codex | advertises `api-key` signed in or not, so the adapter deliberately never reads it; a session that cannot authenticate fails at `session/new` | `codex-agent-runtime.ts`, `#assertBridgeVersion` |
| OpenCode | advertises `authMethods` even when signed in, so the adapter never reads it as a prompt; what a signed-out `session/new` says is unmeasured | `opencode-agent-runtime.test.ts`, *never reads the advertised auth methods* |
| Cursor | the in-protocol `authenticate` is never used; a `session/new` that will not open is refused with a sentence carrying the vendor's remedy | `cursor-agent-runtime.ts`, `#newSession` — the catch-all around any failed `session/new`, read from the code and never measured against a signed-out `cursor-agent` |

Two say so at the handshake and one at `session/new`, measured; one at `session/new` is the
adapter's catch-all read from code; one is unmeasured; and the sentences differ. What the same
handshake answers with the CLI signed out *inside a box* is `16` item 4a's, and the Claude row is
`local`'s until that lands. That is already `local`'s condition today and is not this ticket's to
level; what it settles here is that *the launch is the probe* is not a uniform probe — a
guarantee that holds for Alice and not for Bob — and question 4 no longer rests on it.

### 3. What detection hands the refusal

The refusal itself is not this ticket's. **A `box` that cannot start is a refusal to start, never
a silent `local`** is `09` §4's sentence and `10` §2's, for reasons already on those tickets — the
fifth level's fatal-assert shape, the user's own choice of placement, and first-demo ticket 14's
rule that a guarantee holding for Alice and not for Bob is worse than none — and `05` §3 places
the engine-absent launch as *`14`'s, with `08`'s detection*. This section is the detection half.

- **What it reads.** The launch reads the engine's state, and the image's where `13` gives it
  one, at whatever age `14` decides the refusal reads them: `05` §3 sent *whether it asks the
  engine fresh* to `14`, `14` accepted it by name with this ticket's question 4 attached, and
  question 4 argues one side of it and does not decide it. It refuses on the engine's
  `not_installed`, which is `refuseMissingRuntimes`'s own ground — there is nothing to spawn —
  and on the engine's `needs_sign_in` and a policy blobot could not initialise, which are **a new
  ground and said as one**: the binary is there and the spawn would run, so *nothing to spawn* is
  false of them, and `runtime-readiness`'s spec confines the launch refusal to `not_installed`
  *only*. What refuses them is `09` §4's sentence, a box that cannot start is a refusal to start,
  because a first start without either is the engine's own error, in the vendor's words.
- **What it never reads.** The engine's own sentence. `refuseMissingRuntimes` exists because the
  only question was whether the user read `spawn opencode ENOENT`; the box version of that error
  is a daemon's, in the vendor's words, and the permanent rule puts it nowhere a user reads. So
  the refusal is in blobot's four words about a named subject — *Alice's sandbox on this computer
  is not set up* — with the words `09`'s and the confirmation that a box engaged `14`'s. A
  fallback to `local` would need detection to decide placement, which is a gate, and the four
  words were chosen never to be one; that is the detection-side reason beside `09`'s.
- **Where it points.** At wherever the engine's readiness is drawn, which is `12`'s: today the
  rail's foot puts ticket 11's states and remedies in Settings, and `12` §1 draws the engine's
  state on the folder step's box row, which a running team cannot reach. This ticket requires a
  door from the refusal and does not choose it.

What is **not** refused: the CLI inside the box not being signed in. Ticket 11's rule holds
inside a box for the reason it holds outside — the probe's negative is reliable but detection
gates nothing, and each adapter says what it already says on `local` (the table above). Whether
a team starts without the one refused agent is **`09` §4's fourth bullet and open there**, not
decided here. A Routine firing into a refused Machine is a new *skipped* reason and is on the
map's fog.

### 4. Caching

Today detection is a process-lifetime memo, refreshed on the surfaces that show it, and the
launch refusal reads the memo on the argument that a team is started often and the answer costs
a second and a half (`known-runtimes.ts`, `start-team.ts`). The three layers do not cache alike:

- **The engine** is a local call — `sbx` on `PATH`, and whatever its status command costs,
  measured by `14`. If it is milliseconds, the argument that let the refusal read the memo
  flips: a user signed out of the engine between app start and launch is refused for the right
  reason only if the refusal asks fresh, and reads a daemon's error otherwise. The lean: memoised
  per app start and refreshed where shown, like today, **and asked fresh at the launch refusal**,
  because the cost that justified the memo is not there. **The decision is `14`'s**, which
  accepted it by name from `05` §3 with this question attached and which measures the cost the
  lean rests on; §3 reads its answer, and this bullet is the argument for one side of it.
- **The image** is the same call to the same engine and rides with it, where `13` gives it a
  state.
- **The login inside the box cannot be asked fresh without a side effect.** Sleep is
  stop-and-keep-volumes (`01` point 8 iii), so a probe into a stopped box is a boot, and
  detection that starts virtual machines on the way to drawing a picker is detection with a cost
  nobody chose. Three shapes, put to the author: **ask only while the box is already up**, and
  say *Status unknown* otherwise, with the reason; **remember the last answer per Agent with the
  moment it was taken**, drawn dated — the remembered tick ticket 11 refuses, unless the date is
  what makes it honest, and the shape a hosted kind's stale answer will need anyway; or **do not
  probe it at all while the box sleeps** and let the launch say it. The first version proposed the
  third on the grounds that it added no new state and no new side effect, and the table in
  question 2 is why it is withdrawn as the proposal: the launch says five different things at
  three different moments, so it is not a probe, it is the absence of one. The proposal is now
  the **first**, because it adds no state and boots nothing, and the launch's sentence stays
  whatever each adapter already says. The second is kept on the table for the constraint's sake
  rather than for this computer's.

### Priors

ADR-0001, extended by `01` rather than amended: the list of what a working agent does not share
gains a box, and with it a login — so a readiness about the runtime inside is per Agent, and one
Alice being Ready says nothing about a second Alice on another team. ADR-0003: on `local` the
*user* scope an agent inherits is this computer's `~/.claude`; in a box it is the data volume's,
and what of the operator's crosses is `05` §5's **proposed** narrowing — skills only, as the
closed list's read-only mount, raised there and handed to `13` to write as the ADR's second
amendment — and not the ADR as it stands, which loads the operator's global CLAUDE.md, settings
and hooks for every agent. This ticket reads the narrowing as proposed and depends on none of it:
the login crosses on neither reading, which is why a host probe answers for the wrong scope and
why the inside probe exists. ADR-0004: the remedy's pty carries bytes and never a path, and the
one thing that crosses the boundary — a one-time grant in a URL — is text the user carries out by
reading it; nothing here hands a box a host path. First-demo ticket 14's rule refuses the silent
fallback on `09`, and here refuses *the launch is the probe*.

### Not this ticket

The engine interface, whether its daemon is a condition at all, the box lifecycle and when a box
comes to exist, the transport a command takes into it, whether the carrier is per kind or per
engine (its output 6 — an amendment on `02` if so), how engagement is confirmed, and the age at
which the refusal reads the engine (`14`) — the blocker. What the image holds, who pulls, and how
the pull is drawn (`13`) — a peer, written on both branches here and never waited on. The copy
for every state and refusal, the account sentence and whether the vendor is named as a vendor,
the words a Docker account costs on screen, and what the plain-words confirm over `sbx login`
says (`09` §2); whether the team starts without the refused agent (`09` §4). Where a Machine's
readiness, the sign-in inside, and the refusal's door are drawn (`12`). The fifth level's launch
assert (`10`). Whether `runtime-readiness`'s stream rule gains an exception (its own `spec.md`,
if the author says yes). The measurement behind the transport, and the three lines on the sign-in
inside left as comments on its items 4a and 4b (`16`). Seeding the data volume so N logins become
one, a Routine's skipped reason, and Windows — the map's *Not yet specified*, and
`runtime-readiness`'s standing absence.

## Amendment, 2026-09-05 — the bar: invisible setup, a smooth first sign-in

The author's standing preference, now on the map: *for someone who has never had Docker, what they
see is install the app, use it, create an agent, done; what blobot does underneath is practically
invisible; and the sign-in inside a box happens smoothly through the interface or the chat.* This
ticket holds that bar, and `research/08` says what the engine allows today.

**What can be invisible with `sbx`, measured**: starting the daemon (`sbx ls` starts it), pulling
a template (586 MB, a figure that knows its end), initialising the policy baseline (`sbx policy
init deny-all`, once per machine), creating and naming a box, scoping its mailbox rule, starting
it, stopping it (it stops itself 30 s after its last session), restarting it in a second, and
every `sbx exec`. None of that needs a word on screen beyond the figure.

**What cannot be invisible with `sbx`**: two steps stand between a fresh machine and the first
box. (1) Installing `sbx` — Docker's own installer, run by blobot the way `runtime-readiness` runs
a vendor's install command, one click and no terminal, but a step. (2) **A Docker account sign-in
in the browser**, once per machine, because `sbx` refuses even `sbx ls` before `sbx login`
(`research/02` §4, measured). The permanent rule says the user never sees or types a Docker
command; a sign-in page is not a command, and it is not invisible either.

**The sign-in inside the box, three tiers, smoothest first**, and the measurement that decides
between them:

1. **Docker's proxy-managed OAuth, if it survives our image.** For its own `claude` kit, `sbx`
   opens the vendor's login URL in the **host** browser, catches the callback on the host, keeps
   the token host-side and injects it at the proxy — the strings are in the binary (`research/03`
   addendum; `mitm: started OAuth callback listener`, `proxy: opened URL in host browser`) and
   `research/06` records the vendor saying it is *not supported for third-party sandbox agents*.
   Unmeasured: whether a blobot image handed as `-t` to the `claude` **kit** keeps it, and whether
   the resulting credential is per host (the secret store) or per sandbox. If it holds, the user
   signs in **once per machine and runtime**, in the browser, from a card blobot shows, and no
   token ever enters a box — and `16` should spend its next login on exactly this. Whether the
   engine's own store holding that token on the user's machine is *blobot storing a credential*
   is a reading of a permanent rule that `15` takes the other way; the author settles it (`16`).
2. **The CLI's own login inside the box, driven by blobot.** `claude auth login` (and each
   vendor's equivalent) run inside via `sbx exec -it` on the pty screen blobot already has; blobot
   reads the URL the CLI prints, opens it on the host, and where the vendor's flow supports a
   device code the user pastes nothing. Once per box, and the token lives in the data volume —
   which `research/08` shows must be a **declared kit volume**, because `~/.claude` in Docker's
   template is overlay and a login there does not persist.
3. **A seeded data volume**: one login in a template box, cloned per agent; the refresh-token
   rotation risk in the map's fog.

**And the chat as the door**: the first turn of an unsigned agent does not fail into a terminal.
The pane carries a card above the composer, in the shape the Handbook's *brief them* card already
has — *this agent needs to sign in to Claude, once* — and the turn resumes when it is done.
Whether the card is the only door or the folder step also offers the sign-in before the first
turn is `12`'s to draw.

**Detection, restated for the box**: engine present, engine signed in, image present, agent signed
in — four facts, and whether they map onto the four words or need a fifth is unchanged from above.

### Decided, 2026-09-05 — the floor is one Docker sign-in, as onboarding, never a terminal

The author: *it is fine that it signs in to Docker, but as onboarding in the interface when you
install — easy, you press a button, it takes you to the login in the browser, and so on. Nothing
about copying commands into a terminal.* So `sbx` stays the first engine, and the two visible
steps become **one onboarding screen with buttons**: *Set up sandboxes* runs Docker's installer
itself, behind a progress line, and *Sign in to Docker* runs `sbx login`, which opens the browser
on its own (its only flags are `--username` and `--password-stdin` for a token, so the
interactive path is the browser); blobot reads no keystrokes and shows no command. The pty that
`runtime-readiness` built stays as the mechanism and stops being the experience: it is never the
thing the user is asked to type into for this. The same shape carries the CLI's own sign-in
inside a box — a card and a button, the browser, done — and tier 1 above is measured first
because it makes that one button per machine rather than one per box. Not to be run by blobot:
`sbx setup`, which imports API keys it finds in the user's environment into Docker's secret
store — a credential blobot does not hold must not be moved by blobot either.

**Ownership, settled here because two tickets claimed it**: this ticket owns the *experience* of
setup and sign-in — the screen, the buttons, the four facts and their remedies (the words are `09`'s); `17`
(the engine, split from `14`) owns the *mechanism* — how blobot runs the installer and `sbx login`
without a terminal, and whether it starts the daemon at all. What this ticket still decides is
the four facts, their words, the refusal by name, and caching.

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

### Note, 2026-09-05 (consistency pass)

- **Tier 2 and the stream.** *blobot reads the URL the CLI prints* is refused by
  `.scratch/runtime-readiness/spec.md` (*the moment blobot reads that stream it is in the credential
  business*), and that refusal stands. The smooth version of tier 2 that keeps it: the login runs
  on the pty **shown** in a dialog, the CLI opens the browser itself where it can, and where it
  prints a URL the pty view renders it as a link the user clicks — a terminal seen, never typed
  into, and never parsed by blobot. That is what *never a terminal* means here.
- **Tier 1 and the grain.** If `16` measures that the engine's proxy-managed sign-in holds for
  blobot's image, the login is per machine and runtime in the engine's store, and `01` point 4's
  *a data volume holds the CLI's own login, per agent* reopens by name that day (`01`,
  Amendments). Until then point 4 stands.
- **Caching** (§4) is this ticket's decision; `17` supplies the cost of asking the engine fresh.
