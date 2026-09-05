Type: grilling
Status: open
Blocked by: 04, 15

# What a sandbox lets blobot say

## Question

Everything the app tells the user is built to be true under *prompting only*. A sandbox changes
what is true, so it changes the copy, and the copy is the part this repo has got wrong twice
already.

The creation flow's disclosure ends: **blobot is not a sandbox.** If one ships, that sentence is
either false or is the most important sentence in the product, and which one it is depends on
answers that are not in yet.

## What to decide

- **The disclosure.** It has been rewritten twice for overstating — once for naming commands
  blobot could not name, once for promising freedom an agent did not have. A sandbox invites the
  third and worst version: overstating *protection*, which is the failure ticket 14 named first
  and the one users cannot detect. srt says of itself that domain filtering does not inspect
  traffic, that a broad allow is an exfiltration route, and that it is not a boundary against
  inherited descriptors. Whatever is claimed has to survive being read next to that.
- **Whether the word appears at all.** *Sandbox* is a word users arrive with a definition for,
  and theirs is stronger than ours would be. Describing what it does — *this agent can only read
  its own copy and reach these hosts* — may be both truer and more useful than the noun.
- **What the permission block says when it is inside one.** Today it says blobot did not vouch
  for this and the agent is stopped. Inside a fence, some of what it would have asked about is
  now impossible rather than unvouched, and those are different events.
- **Whether a failed fence is a refusal to start.** Codex's `INITIAL_AGENT_MODE=read-only` is
  already asserted and **fatal if it cannot be confirmed**, because the bridge's default wrote to
  the user's home once. A sandbox that silently did not engage is the same defect and should
  probably take the same answer.

## The rule that decides most of it

Ticket 14: blobot claims the thing that is true on both runtimes. If the fence is real on Claude
and absent on OpenCode, the claim is still *prompting*, and the sandbox is an unadvertised
improvement rather than a feature. That is an unsatisfying answer and it may well be the right
one.

## Amendment, 2026-09-04 — absorbed, and there is a second sentence to get right

This was `.scratch/sandboxing/03`. The disclosure problem is unchanged and the analysis above
still holds word for word. What the wider destination adds is a **second** claim that has to be
true at the same time, and it is louder than the first: *this agent is running on another
computer.*

Everything the app says today is built on an unstated premise that the agent is here — the
`WORKSPACE` line's branch and diff, the folder the user picked, the pty that runs
`claude auth login` and opens a browser, the attachment whose bytes were embedded rather than
linked. None of those sentences is false off-machine, but several of them stop being *the whole
truth*, and the copy has never had to say where anything is.

Add to what is decided here: whether the machine is named on screen at all, and where. The
governing rule cuts both ways — a machine is not a blobatar and gets no colour, but an agent
executing somewhere the user cannot see is exactly the kind of fact `DESIGN.md` says must not be
carried by a single channel.

## Amendment, 2026-09-04 — this computer only

The destination narrowed today (`map.md`, *Narrowed*): the kinds decided on this map are `local`
and `box`, a microVM on this computer, and a Machine that is somewhere else is a fresh effort. So
the second sentence the previous amendment added — *this agent is running on another computer* —
is withdrawn as work. It stays as the one constraint ticket 01's point 8 puts on copy: nothing
written here may be a sentence that turns false the day a third kind arrives. And the *where*
that amendment added — whether the machine is named on screen at all, and where — is `12`'s now.
This ticket decides words; `12` decides places. The title stays as it is and is now wrong by one
word, the way `05`, `08` and `10` say of their own: the subject is the Machine, and *sandbox* is
the name of one kind and may not stand for both, which is this ticket's own rule two paragraphs
down. The map indexes by title, and its entry is corrected when this ticket resolves.

Ticket 01's answer fixed the vocabulary this ticket writes in, and it settles the second bullet
above by half. A Machine is said **by kind and in plain words**: *this computer*, *a sandbox on
this computer*. The word *sandbox* is reserved for the kind that is one, so it may appear in copy
about a `box` and nowhere else; *this computer* is not a sandbox and is not to be called a weaker
one. *Docker*, *VM*, *container* and *image* appear nowhere a user reads (`CONTEXT.md`, *Avoid*).
What is left to decide is not whether the noun appears but what it is allowed to sit next to. Two
things 01 handed here by name: the costs of the first engine — a Docker account, a proprietary
VMM — *go on screen through 09* (point 7), and a blocked request is *said in the transcript and
never lost in silence* (point 5), with `15` deciding the mechanism and this ticket the words.

Six questions. Every one of them is per Agent and never per Team, because a Machine is per Agent
(01, extending ADR-0001): a roster with Alice on `local` and Bob in a sandbox is the ordinary
case and not the edge, and any sentence that cannot be true of a mixed roster is wrong. In this
ticket's own prose the kind is `local` and the copy for it is *this computer*, kept apart because
a box is also on this computer and the first draft used one phrase for both.

Two rules for reading what follows, because the first draft broke both. **A word is decided here
and a place is not**: where a sentence is read, and where a refusal points, is `12`'s (`08` §3
requires a door from the refusal and does not choose it), so a bullet below that says *and
nowhere else* is a bullet that has strayed. And **a resolved point is reopened by name or not at
all**: two bullets below can only be answered one way by amending `01`, and each says so where it
stands, because CLAUDE.md's rule is *say so and reopen its ticket*, never *decide it again under
another heading*.

This is over the map's range for one session as written, and the first version of this amendment
said otherwise on a ground that was false: *questions 1 to 4 are one disclosure read on one
screen*. They are three screens with three blockers — 1 and 2 are the creation flow's words, 3 is
the transcript's line and void until `15` returns a carrier, 4 is the launch refusal and reads
`08`'s states — and beside them the ticket carries two conditional reopens of `01` and a question
put to `14` by name. So the seams are the screens. **Questions 1 and 2, with the first bullet of
6 beside them, are one session**: the creation flow's words, blocked on `15` for one paragraph of
§1 and on `04` for §5's closing line, and holding both reopens of `01`, which are the author's to
take there. **Question 3 is a session after `15`**, sized by whether `15` leaves a line of
blobot's to word at all. **Question 4 is severable** and is written once `08` has fixed its
states, against them and not before. Question 5 goes with `04`. The rest of 6 goes with the
ticket that hands each word — `05` for the folder step and `placeWord`, `10` for the third
clause, `14` for the restart — and lands here as a comment.

**Blocked by `04` and `15`, and by neither `08` nor `05`**, on one criterion, stated because the
first version of this amendment applied it once and not twice. This ticket blocks on a neighbour
whose answer decides what a section here is *about* — `04` decides what, if anything, is inside
`local` for §5 to be silent about, and `15` decides whether there is a line of blobot's for §3 to
word — and it reads a neighbour whose answer moves a sentence inside a subject already fixed,
writing the sentence against that ticket's proposal and marking it provisional, the way `13`
marks its output 1 on `16`. `08`'s states and `05`'s leans are the second kind: the refusal's
subject is this ticket's own (§4) and a struck state strikes its sentence and nothing else; a
`nested` Workspace that `05` demotes to a copy replaces one folder-step sentence with another
(§6). The first version blocked on `08` on the first ground, which it was not, and left `05` off
on the second, which it was; both are read now, neither blocks. The chain is no shorter for it —
`15` waits on `13`, `14` and `16`, and `08` on `13` and `14` — and the map's frontier line is
unchanged.

### 1. The disclosure sentence for a team with a box

Today the creation flow's disclosure ends **blobot is not a sandbox**, and for a team with a
`box` agent that sentence is either false or wants a second one beside it. Decide the second one.

What it must survive being read next to. srt says of itself (`research/01` §3) that domain
filtering does not inspect traffic, so domain fronting passes it; that a broad allow such as
`github.com` is an exfiltration route to any repository; that it is not a boundary against
inherited file descriptors or a program that ignores the proxy variables. Docker's own pages say
(`research/02` §4) that all outbound TCP goes through a host-side proxy, deny-by-default with
allow and deny lists, and that *the default allowed domains include broad wildcards*; that the
proxy is *a forward proxy for HTTP and HTTPS* and forwards other TCP transparently (`research/03`
(c)); that `sudo` works inside; and that with a subscription the CLI's own OAuth token lives in
the VM. What that proxy sees is neither srt's *does not inspect* nor its opposite, and the first
draft of this paragraph wrote each in turn. Measured (`research/08` §2, §5): the proxy holds a CA
of its own, handed into the box as `PROXY_CA_CERT_B64`, and **terminates TLS** for the hosts a
rule allows; the vendor's own hosts, which a kit brings, go `forward-bypass`, unread; and the
mailbox's bearer arrives at it in the clear, as it does at srt's (`research/03` (c)). Two facts
`15` hands here by name, placed in this paragraph: **the proxy reads what an agent sends to a
host a person allowed, and reads nothing of what it sends to the vendor** — and neither is
*safe*, because the vendor's host is on the list by necessity and is the one the proxy does not
read, so a credential inside the box can leave through it, which is ADR-0004's refusal of an
ungated read met again at the network. `15`'s item 5 is the honest statement of what the egress
list does not do, written there *for `09` to place*; it lands in this paragraph when `15`
resolves. So the word *safe* is unavailable (research/01's own conclusion), and a sentence about
*protection* is the third and worst overstatement this disclosure has been corrected for. What is
left to claim is **reach**: its own copy of the folder, its own login, the operator's skills to
read, and nothing else on this computer but the mailbox and the hosts it is allowed — 01 point
5's closed list in full, which is a list of what a box *gets*, not of what it cannot do.
`CONTEXT.md`'s *Machine* entry states that reach without the skills, so a sentence copied from it
would be false by one item. The entry is `01`'s deliverable (point 1) and the mismatch is `01`'s
to fix: it goes there as a comment on point 5, beside the one `05` §5 and `13` output 9 already
queue about the same mount, and this ticket edits neither the entry nor the ticket.

- **The place or the reach.** Whether the sentence says what a sandbox *is* (a place, with the
  closed list) or what it *stops* (a shell that cannot leave the folder). The second is the one
  users arrive with a definition for, and theirs is stronger than the true one.
- **Splitting, not weakening.** First-demo 14's `unattended` line split the claim rather than
  qualifying it: the sentence stayed unqualified for the levels it was true of and the fourth got
  its own. Whether the same shape holds here — the closing line kept, word for word, for the
  agents on `local`, and one sentence added naming the agent in a sandbox — or whether a kind
  that *is* a sandbox two sentences above makes the closing line read as a contradiction on the
  same screen.
- **The paragraph that stops being whole.** The disclosure's third paragraph says the agents
  *have whatever tools your own MCP servers provide*. Inside a box that is true of some of those
  servers and not others. A repository's own project-scope configuration — `.mcp.json` on Claude,
  each runtime's equivalent — travels in the clone, because a sandbox reads *the working
  directory's project-level config* (`research/02` §4, of Claude), and a `stdio` server named
  there runs inside if the image can run it, which is `13`'s. What does not arrive is a server
  running on this computer, or one the operator named in their own user scope: a sandbox picks up
  no user-level configuration from the host (`research/02` §4), the box gets the operator's
  `~/.claude/skills` read-only and nothing else of theirs (01 point 5, which is what keeps
  ADR-0003 true of skills), and `05` §5 has raised the narrowing of ADR-0003 that amounts to, for
  `13` to carry. Whether that paragraph forks per agent or is rewritten so it is true of both —
  written against `05` §5's lean, *skills only, said*, and provisional on it.
- **Read a second time.** Placement is chosen in the folder step with a per-agent exception on
  the agent's row (01 point 3), and the roster can be edited later, which restarts the team. The
  disclosure closes creation once, stated and not consented to. Whether a box joining an existing
  team re-states the sentence at all. Where, if it does, is `12`'s.

### 2. The account sentence

`sbx login` is a prerequisite — the vendor's OAuth in a browser, under its subscription
agreement, free with no per-seat fee (`research/02` §4, `research/06` *Login*, `research/03`
(c)). The proposition the user has to hear, worded here without the vendor so that the first
bullet stays a question rather than a decision taken in an example: *a sandbox on this computer
needs an account that is not blobot's, and a sign-in in your browser.* `08` §2 hands two facts
the words have to carry: it is the first sign-in in the app whose account is not a runtime's, and
the browser it opens is the vendor's own page, outside blobot's mouth the way `claude auth
login`'s is. Two of blobot's own rules meet in that sentence.

- **The name — a reopen of `01` point 1 if the answer is yes.** 01 point 1, resolved, says the
  word *Docker* never appears, by the permanent rule, and `CONTEXT.md`'s *Avoid* says the same.
  `08` (§2, the engine's `Not installed` and the note under its sign-in) and `12` (*Not this
  ticket*, whose account `needs sign-in` names) route the question here rather than answer it, so
  asking it is legitimate; answering it yes is not this ticket's alone. The case for one
  appearance: an account is not a mechanism, it is a thing the user has to go and get, from a
  vendor, and *sign in to the account this needs* cannot be said without saying whose. The case
  against is the rule's own: one sanctioned appearance is how the second gets drawn. If the
  answer is yes it is one appearance — the vendor named as the account's owner, never as the
  engine — and it **amends 01 point 1 and edits the Avoid entry**, said on `01` and taken by the
  author, not settled here. If the answer is no, say how the user learns whose account it is
  before the browser opens. The same question arrives from the other side if `08` §2's proposal
  holds that the engine has **no install door** blobot runs, because two rules meet there and
  neither gives: the engine's `Not installed` then carries a sentence and not a remedy, and a
  sentence saying where the engine is found is the vendor's name or nothing. One answer for both,
  here.
- **The places it is read, and whether one sentence survives them all.** The places are not this
  ticket's. 01 point 6 puts the cost beside the offer in the folder step, where `12` §1 draws the
  engine's four words on the box row; `12` §2 draws the cost on each row of the roster menu; `08`
  §2 puts the account in the note under the engine's sign-in, and `08` §3 points the refusal at
  wherever the engine's readiness is drawn, today Settings' machine section; and if the author
  answers `08` §2 the other way, an install confirm. What is here is whether one sentence is true
  in every one of those places without being told which — the options menu's rule, that the
  renderer is handed words and draws them — or whether a row gets a shorter form of the same
  sentence and never a different one. And one question `12` §1 sends here by name, because it is
  whether the kind is *said* and not where: when the engine is absent, is the box row drawn with
  its sentence and unpickable, so that this sentence is how a user learns the kind exists — *make
  one for me* was disabled rather than hidden because a door that is not there teaches nobody it
  exists — or is an absent engine silence, and the kind discovered wherever `12` puts the Machine
  registry. 01 point 6 says *offered when its engine is detected*, which reads either way.
- **Against *no cloud dependencies*.** The app runs with no account: a team on `local` never
  meets the sentence. The kind needs one. And a second fact rides with the account, measured and
  handed here by `15` by name: the engine's daemon sends its own event batches off this computer
  (`research/08` §1 — `uploaded event batch` in its log, before any box existed), which is not
  the box's egress, is on no list `15` writes, and is the vendor's act and not the agent's. The
  map's *Reopened* section already carries the account as a fact a ticket has to show rather than
  a reason to refuse the engine, which is the reading *a dependency of the kind, not of the app*;
  the daemon is the same reading only if it runs for nobody on `local`, and whether it starts on
  demand or is a thing blobot must see up is `14`'s (*whether the daemon is a condition*), read
  here. The two outcomes go to different places. If that reading is accepted, it is recorded on
  this ticket and not in the copy — the copy states a fact, and the rule's reasoning is not the
  user's to carry — and whether the account's sentence says the second fact beside the first,
  *and it reports to its vendor on its own*, or the fact is recorded here alone, is decided with
  it and the same way. If it is not — if the rule is read as admitting no kind-level dependency
  either — that is a permanent rule failing, which is CLAUDE.md's *stop and raise* and not a
  decision a ticket takes. Either way it is not ADR-0005's shape: blobot stores no key and calls
  no service; the login is `sbx`'s own, kept by `sbx`, the way `gh` and `claude auth login` are
  the user's own login spawned. Whether the engine checks that login on every start, and what the
  copy may therefore say about working offline, is **unmeasured** and is not to be asserted
  either way until it is.
- **The licence — a reopen of `01` point 7 if it is not said.** 01 point 7 puts two costs on
  screen through this ticket: the account, and that the VMM is proprietary. The account is above.
  The licence is on no figure `12` draws, and `12` sends it here *to place or refuse*. It has a
  case against being said at all — a user who installs the engine agrees to its terms in the
  engine's own flow, and blobot restating a vendor's licence is blobot speaking for a vendor —
  and if that case wins it is a reopen of point 7's second half on `01`, not an option this
  ticket lists as its own. Argue it there. Here, while the fact stands, decide the sentence it
  gets and what it sits next to.

### 3. What a blocked request says in the transcript — the words, given the inputs

01 point 5: a blocked request is said in the transcript and never lost in silence. The mechanism
is `15`'s and the words are this ticket's, and `15`'s *Not this ticket* draws the line in so many
words — *the words of the block line and whether it carries a door — `09` §3 owns both* — so
neither is sent back there. Two inputs, and one thing decided here that the first draft of this
section read from `15`, which does not hold it:

- **The carrier is `15`'s, item 8**: blobot's own line from the proxy's signal, the vendor's tool
  error left as it is, or both; whether the proxy's log is followed as it happens or read back
  per turn; and how the agent's refusals are told from the image's boot noise. If `15` keeps the
  vendor's text there is no line of blobot's to word, this section is empty, and it says so —
  filtering a vendor's text is the fx-diagnostics hazard, silence is what `01` forbids, and
  between the two `15` chooses. Everything below assumes blobot's line and is void otherwise.
- **Whether the list is anyone's to edit is `15`'s, item 6, and whether an agent may ask for a
  hostname is its item 7.** Both are read here for the door, below, and neither decides it.
- **Not `waiting` — decided here, because nobody else holds it.** `15` sends *the fold and the
  rail* to `10` §3; `10` §3 reads *not `waiting`, folds into no status word and does not sound*
  from this section; and the first draft of this section read it from `15`. So it is owned here,
  once, with its reason. A refusal by the proxy is not a permission request: nothing was asked,
  nobody can answer, and the agent is not stopped — the tool is handed a `403` and the turn goes
  on (below). `waiting` is the fold's word for an agent stopped on a question a person can
  answer, the one notification the sound effort bought, and the one inversion the rail draws; a
  block is none of those. So it folds into no `StatusWord`, because it is not an activity, and it
  does not sound, on the sound effort's own rule that a notification is bought and a block asks
  nothing. What is **not** decided here is the one thing `15` item 8 hands to `10`: on Claude's
  own fence a domain refusal *is* a `session/request_permission` (`research/07` (5)) and draws as
  ticket 14's inline block with the agent `waiting`, exactly as it does today; whether inside a
  box the proxy's refusal and a fence's are one event or two is `10`'s constraint, and this
  section's line is the proxy's only. Whether the line earns anything on the rail is a place and
  not a word: `12` §3 and `10` §3 point at each other for it, and this ticket reads it as `12`'s,
  because it is a place, and says so once.

What is left is the sentence, if there is one. The register exists and is not a fourth voice: a
`system` line, invented for a fact the three voices cannot say — `turn stopped · the context
window is full`, `routine · <name>` — that says what happened and nothing about what to do next.
A block differs from those in two ways the words have to carry. It is **expected not to be a
stop**. Measured on the first engine (`research/08` §2): a refused host is answered by the proxy
with a synthesized `403` and nothing times out — `curl` printed `403`, `npm install` printed `npm
ERR! 403` — so the tool sees an HTTP error and not a dead network, the model reads it in the tool
result, and the turn continues. The first draft had the tool seeing *a refused connection*, which
is wrong in kind and matters here, because a `403` is a server's *no* and reads as one. What is
unmeasured is narrower than the first draft claimed, and `15` names it: how a tool reports the
`403` inside a real turn, which `research/08` spent no token on, and whether the model's own
account of it is the transcript's line or blobot's reading of the log is. If a block turns out to
stop the turn after all, the sentence is `turn stopped`'s shape and not a new one. And it is
**blobot's doing**, not the network's and not the host's: *the agent could not reach* reads as an
outage, a `403` left in the host's voice reads as the host refusing, and both are false — the
proxy on this computer refused it, on the list blobot's kit declared, and the true sentence is
that blobot did not let it.

- **The noun and the host.** The line names the host, because the host is the only thing a person
  could act on, and never the mechanism — no *proxy*, no *policy*, nothing on `CONTEXT.md`'s
  Avoid list. Whether it says *blocked*, *refused* or *not allowed*, and whether it says who did
  it.
- **The same host twice.** An `npm install` against a host that is not on the list is hundreds of
  refused requests in one turn, each answered `403`, and a line per request is a transcript
  nobody reads, which is what refused the `@mention` list its animation. Whether the carrier is a
  line at all or a fold into the tool call that caused it is `15`'s, and the trap it has to weigh
  is on record from the Cursor effort: a deny that is a silent hard block whose `tool_call`
  reports `completed`. The proxy's own log already folds the repeat — `example.com:443 ×2`, per
  host with a count and a reason (`research/08` §2) — so a count is available whichever carrier
  `15` picks. What is this ticket's is narrower — given a line, whether the second block on the
  same host in the same turn says it again, or the one line carries a count. The lean is the
  count, for the reason the log already has one.
- **The door — decided here.** Two of `15`'s answers decide whether there is anything a door
  could open, and neither decides the door. If item 6 answers *nowhere, and not the user's* — the
  reading its own priors lean to — there is no add to offer, the line carries no door, and
  whether it says where the list lives instead is moot, because it lives nowhere a person edits.
  If `15` keeps an editor, whether this line is a door to it is this ticket's, and the lean is
  **no**, on the argument this ticket had already made: an *allow* for a host written from a
  block line is a standing rule the user authors from the transcript, and first-demo 14 withheld
  its third button on exactly that shape — a rule with nowhere to see or revoke it. That ticket
  then offered the button on a measurement of where the rule goes, and the same measurement
  exists here: a rule added with `--sandbox` is scoped to one box and dies with it (`research/08`
  §7), so an *allow* from the line would be per agent and gone with the box. So the lean is a
  lean and not a refusal, and a resolver who finds the editor `15` leaves is a place a person
  would see the rule reopens it here. An agent asking for the host from the line's own turn is
  item 7's, prior no, and the line offers nothing to the agent whatever it offers a person.
- **The permission block beside it.** The body's third bullet, which `04` and `12` both send here
  by name. Today the block says blobot did not vouch for this and the agent is stopped. Inside a
  box some of what it asks about is a thing the box would refuse anyway — a push at `normal`,
  prompting, against a host that is not on the list — and *unvouched, and stopped* and *refused,
  and continued* are different records of what happened. Whether the block says so, in the
  Machine's own words and never the mechanism's, or asks exactly as it does on `local` and lets
  the line above say the rest.

### 4. The refusal's sentence, when a box cannot start

**A `box` that cannot start is a refusal to start, never a silent `local`.** That sentence is
this ticket's, and four neighbours read it from here rather than deciding it — `08` §3 (*the
refusal itself is not this ticket's*; its half is detection), `10` §2, `05` §3 and `04` (a) — so
a resolver who finds against it reopens all four by name. The reasons: Codex's `#assertPosture`
is the precedent and the shape, the mode asserted against what the session reports and the launch
fatal if it cannot be confirmed — *blobot will not run an agent whose permission posture it could
not confirm* — because the bridge's default wrote to the user's home once; `10`'s fifth level
makes it load-bearing, since an agent set to *everything* because it is in a sandbox must never
start on `local`; the user chose the placement, and blobot moving where their code executes
without asking is not a convenience; and first-demo 14's rule, because a sandbox that silently is
not one on the days the engine is down is a guarantee the user will generalise.

The causes are `08` §1's states, which is why the first version of this amendment blocked on `08`
and why this one does not (above): the sentences below are written against `08`'s proposal and
each is provisional on its state surviving, so a struck state strikes its sentence and nothing
else. As `08` proposes them: the engine not installed; the engine not signed in (*cannot access
credential store*, `research/06`); the policy never initialised, which the engine requires before
a first start (`research/06`, *Network and credentials*; met once as the engine's own `global
network policy has not been initialized`, `research/08` §1) and which `08` proposes is never a
state the user meets — blobot's act before a first start, and a launch that finds it undone is
refused by name; blobot's own image not yet pulled, a state that exists only if `13` item 6 says
blobot pulls ahead of the engine; a pull that fails partway, whose precedent is the dictation
download's refusal (`13`, *Not this ticket*) and whose engine sentence is measured once — `403
Forbidden: pull failed` on a tag the store did not hold (`research/08` §6), the daemon's words
and never the user's; the microVM not booting; and the mailbox door not opened, which is a box
that starts with no mailbox and is fx's `server/discover` lesson again.

- **Refused by name, with the fix in it.** A launch whose runtime is `not_installed` is already
  refused by name rather than as `spawn opencode ENOENT`, and `DESIGN.md` says a refusal is not a
  dialog: what is wrong, where the user can act on it, in a sentence, with the fix in it. Decide
  what the sentence says for each cause without naming the engine — the agent, its sandbox in the
  Machine's own words (`08` §3's *Alice's sandbox on this computer is not set up* is the shape),
  the cause in plain words, and the way out, which is a door `08` §3 requires and `12` places,
  and is named here as a door and never placed. Nothing in the sentence is the engine's own
  error, because the permanent rule puts a daemon's words nowhere a user reads.
- **What the refusal claims.** *Could not start* and *could not confirm* are different claims,
  and which is available depends on whether `14`'s `start` hands back a confirmation that the box
  engaged — its door open, its posture as reported — or only that the engine returned. `08` §3
  and `05` §3 both send *how engagement is confirmed* to `14`, and `14`'s *What must come out of
  it* has no line for it in those words; its item 2, *whether readiness is a verb on the
  interface*, is the nearest. This ticket puts it to `14` by name as one more thing that crosses
  `spawn` (its item 1), and writes **both sentences**, so that whichever `14` returns has words.
  A box the engine reports as running, trusted on its word, is the fx case — nothing in this app
  concludes from an exit code — and *could not confirm* is the sentence for it.
- **Whether to say why there was no fallback.** A user who wants the team running would prefer it
  fell back to `local`. Whether the refusal spends a sentence on why it did not, or whether being
  a refusal is the whole of the statement.
- **One agent refused, four on the roster.** A Team is a unit and its other three agents can
  start. `08` §3 and `12` §3 both leave this bullet open here by name. Whether the team starts
  without the refused one, and what the folded status says of a member that was refused — a word,
  which `12` places on the rail row or does not. This is launch behaviour and not a word, and it
  is the one bullet on this ticket that breaks its own reading rule, knowingly: no other ticket
  holds it, so it is held here rather than orphaned, and a resolver who finds it belongs on `14`
  says so there and leaves the word here. A Routine whose Machine is unreachable is a new skipped
  reason on the map's fog, not a decision here; whether the run's recorded reason is this
  sentence shortened, or its own words.

### 5. Whether `local` says anything about an inner fence

`04` decides whether a fence exists inside `local` at all (`fenced` is defence in depth, not a
kind: 01 point 6). If it does, `03` has already measured its shape: three runtimes have one and
two do not; all three fence the shell and never the CLI; they disagree about reads and about
loopback. And `research/02` §1 adds a second asymmetry, per platform rather than per runtime: an
outer srt fence keeps the mailbox on macOS and not, by the same route, on Linux.

First-demo 14's rule decides most of this: blobot claims the thing that is true on both, *a
guarantee that holds for Alice and not for Bob is worse than no guarantee*, and an improvement
that does not hold everywhere is an **unadvertised** one. `04` takes the rule as a given and says
in so many words that whether the author accepts it is this question. Under it, whatever `04`
puts inside `local`, the copy for an agent on `local` does not change, and *blobot is not a
sandbox* stays true of it word for word. Two things are left.

- **Whether the author accepts that.** It is an unsatisfying answer and this ticket said so
  before the narrowing. The case for breaking the rule is that the `unattended` line already
  admits *on some runtimes*; the case against is that *on some runtimes fenced* names a
  protection the user will generalise, and the first time it does not hold is the moment the
  whole posture loses credibility, which is the rule's own reasoning.
- **The closing line's tense.** *blobot is not a sandbox* was written when nothing was. Whether
  it survives as the last line of a disclosure that names a sandbox above it, or becomes a
  sentence about the agents on `local`.

The cost that travels with an unadvertised fence — srt with `allowLocalBinding` on macOS admits
every loopback service on the host (`02`'s table) — is `04` (b)'s to accept or refuse when it
chooses the fence, where it already stands as one of that ticket's four grounds, and it is not
this ticket's to say. What this ticket reads from `04` is its list and its answer on the door.
The first draft called that cost *a fact with no carrier, which DESIGN.md forbids*, and DESIGN.md
states no such rule: what it states is per channel — colour is never the only channel for
anything, a mark is never the only one beside its label, no sound may be the only carrier of its
fact — and the generalisation is this map's own, which `12` makes too. `04` reads it as it will.

### 6. The words the neighbours hand here

Handed by name, and held here so that resolving those tickets leaves nobody waiting on a sentence
with no owner. The split with each neighbour is stated, and a sentence written against a lean
says so.

- **The disclosure's third clause, for the fifth level.** `10` §1 holds the level's name and the
  sentence under it, and says so; `10` §3 decides that a third clause of the disclosure exists —
  *everything blobot has not vouched for, they ask about* is unqualified for three levels and
  `unattended` got its own — and hands its words here. It has to say that nothing asks and that
  the transcript is where a refusal shows, standing beside the Machine's sentence from question 1
  rather than borrowing from it, and it has to carry the Routine case plainly, since a run is
  where nobody is watching: a Routine at this level on a box runs its three turns with no gate
  but the box, because a permission cannot expire when none is raised. Written against `01`'s
  undefended *everything*; `10` renaming the level does not reopen this ticket.
- **`placeWord`'s fifth word.** `WORKSPACE` says what kind of place the work is in, in blobot's
  own words rather than git's — `checkout`, `a copy`, `repositories`, `workspace not found` — and
  a clone in a box is a fifth kind of place. `05` sends the word here. Whether it is *a sandbox
  on this computer*, as `12` §1 folded the step, or shorter, and whether it says *checkout* about
  what is inside, given that the user's `git worktree list` cannot see it (`05` §1). Written
  against `05` §1's lean — the fetch lands in the user's repository, fast-forward only, and the
  branch is checked out nowhere on this computer — and provisional on it.
- **Two folder-step sentences from `05` §2.** A `plain` Workspace in a box is still *their own
  copy* — no branch, no diff, no recovery, the weakest sentence in the app made no weaker — and
  only moved off the disk the user can open, which is one sentence, here. And a `nested`
  Workspace in a box is N clones and N fetches home, a fetch per repository per turn, which is
  the price of having picked N repositories and is a sentence for where scope is chosen. `12`
  places both. The second is written against `05` §2's lean and provisional on it: if `05`
  demotes `nested` to a copy in a box, that sentence is struck and a different one — a kind
  demoted by its Machine — takes its place, still here.
- **The transcript's line for a restart on a new image.** `13` output 4 decides when a new tag is
  owed, and `14` output 7 accepted what a bump does to a running box and a resumed session — a
  Session belongs to the runtime that opened it (ADR-0002), and the runtime is now a thing the
  image pins. Neither holds the transcript's sentence for it; the first version of this amendment
  sent it to `13`, which had already declined it, and by this ticket's rule it is here. If `14`'s
  answer is a restart, the line is in the `system` register and names the agent's sandbox and
  that it was updated — never the image, a tag or a version, on `CONTEXT.md`'s *Avoid* — and
  whether it is `turn stopped`'s shape or a line of its own is the decision. Whether it also says
  the session resumed or started fresh is the item `CLAUDE.md` already holds as next work, read
  and not decided here.

### Not this ticket

Whether a fence exists inside `local`, which layer owns the policy, and whether the loopback an
unadvertised fence opens is acceptable (`04`, (a) and (b)). The egress list, its rule and its
categories, where it lives and whether it is anyone's to edit (`15`, items 1 and 6); whether an
agent may ask for a hostname (item 7); the block's carrier, whether the log is followed or read
back, and how the agent's refusals are told from the image's boot noise (item 8); and whether the
mailbox door is a fixed entry, and a fact this ticket says or a row `12` draws (item 10, read
when it resolves). Whether the proxy's refusal and a fence's inside the box are one event or two
(`10`, from `15` item 8). The engine interface, and whether `start` confirms engagement — asked
of `14` by name in question 4. How `sbx login` is driven and by whom: `08` §2 sends it to `14`
and `14`'s item 2 sends it to `08`, named here so one of them takes it, and this ticket's earlier
pointer — *whether `sbx login` runs on a pty inside the app* — is withdrawn; only its words are
here (question 2). The detection half of the refusal, the states a box has and which of them
exist, and the fact that a signed-out CLI inside a box is not refused (`08`, read and not a
blocker, on the criterion above). The fifth level's name and its own sentence, and how a level
the Machine does not admit draws on the form (`10`, §1 and §2). Every place — the folder step,
the roster row, the header row, the `WORKSPACE` block, Settings, the refusal's door, and the
rail, where whether a refused request earns anything is read as `12`'s in question 3 (`12`).
`WORKSPACE`'s two new absences, states and sentences both, and where the fetch lands (`05` §1,
read and not a blocker, on the same criterion). What the image can run, `stdio` servers among it,
and how the pull is drawn (`13`); when a new tag is owed (`13`, output 4) and what a bump does to
a running box (`14`, output 7) — the transcript's line for it is question 6's. Attachments need
no sentence: ADR-0004 embeds bytes rather than paths, so an attachment reaches a box unchanged,
and a path, which a box could never resolve, was already refused.

## Amendment, 2026-09-05

Five things, none reopening a section above: a seventh question, found by a critic reading §3's
door beside first-demo 14's third button; the map's fog item on a Routine, folded into §4; the
rail, said once more so nothing on this ticket can be read as deciding it; the sign-in, whose name
`01` has since allowed and whose ownership `08` has since settled; and the blocking paragraph,
corrected to the edges on disk. Nothing above is struck. Where a sentence above is now moot, the
paragraph below says which and why, and leaves it standing.

### 7. Whether *Allow always* is offered to an agent on a box

First-demo 14 withheld the third button because `allow_always` was *a rule the user is authoring
with nowhere to see or revoke it*, and offered it on 2026-08-29 on one measurement: answering it
writes `permissions.allow` into `<workspace>/.claude/settings.local.json`, a file in this one
agent's own copy of the folder, which the user can open and delete and which says nothing about
any other agent. The block names that place in the sentence that offers the button — *it is a file
in this agent's own copy of the folder, so you can read it and delete it* (`Conversation.tsx`;
`DESIGN.md`, *A permission block is a transcript item*) — because naming the file is what answered
the objection. So the offer rests on the file having a place a person can go.

On a box it has none. The AgentWorkspace is a clone in the workspace volume, inside the guest
(`research/08` §3, §5): off the disk the user can open, in `05` §2's words, and checked out nowhere
on this computer, so `git worktree list` does not show it (`05` §1). What comes home is the branch
— commits, never the working tree — so a file the runtime writes beside the clone never arrives
here, and no Finder path, no editor and no `git` on this computer reaches it. The sentence the
block says today would name a place the user cannot go, and the reason for withholding returns
word for word. Its lifetime makes it worse rather than better: the file outlives sleep, which
keeps the volumes (`01` point 8 iii), and a restart on a new image, which replaces what the image
pins and not what the volumes hold (`01` points 4 and 7; `14` output 7), and dies only with the
agent (`01` point 4). A rule that can be ended only by deleting the agent that holds it is not
revocable; the engine's own scoped rules at least die with the box (`research/08` §7). The case
for offering it anyway — the box is the boundary, so a standing rule inside it has a blast radius
of one box — is answered by what the objection was about: not the radius but the sight of it. At
the three attended levels the user chose to be asked, and a rule they cannot see narrows that
choice without their seeing it narrow.

**Decided: on a box the block offers *Allow once* and *Reject*, the two first-demo 14 shipped,
and never *Allow always*.** Per kind and never per runtime: all five adapters pass `allow_always`
through as a kind and none has the file's place, so the withholding is where the choices are
already made, main's `permission-choices.ts`, whose type already carries this exact absence —
*absent on a runtime that cannot record a standing rule; the block then offers once only* — now
also for a kind that cannot show one, keyed on the Agent's Machine kind, which main holds and
which is blobot's own word. Nothing in the renderer learns the provider; it learns that the third
answer is absent. The seam exists; writing it is the build's. Whether the button draws disabled or
not at all is a draw and `12`'s; the shape the type already has is disabled, and *make one for me*
was disabled rather than hidden for a reason that holds here. The words are this ticket's: under
*why you are asked* the two sentences about the file are replaced, for an agent on a box, by one —
*Allow always is not offered here. The rule it would write would be a file inside Alice's sandbox,
which is not on a disk you can open, so there would be nowhere to see it or take it back.* The
Machine's own words, and nothing from the Avoid list. `PermissionOutcome` is unchanged and
`allowed_always` never occurs for an agent on a box; the whisper-repeat that means *a standing rule
was written* is never played for one, because none is.

What it costs, stated: an agent on a box asks again for the same unvouched thing every time it
comes up, which is what the third button existed to stop. At `trusting` the vouched list already
covers the ordinary work, so what asks again is what blobot never vouched for; and the step above
`trusting` on a box is `10` §1's fifth level, choosable only there (`01` point 6), which closes the
channel entirely. One door fewer at the attended levels and one level more is the same fact seen
from both ends — the box takes on the whole of the risk the file carried on `local` — and the
level is `10`'s, read here and not confirmed.

**Whether standing rules inside a box are visible anywhere: no, and nowhere.** A screen listing
them is the console the map's *Out of scope* refuses, and first-demo 14's *still not an approvals
feature* refuses in so many words — *nothing showing the `settings.local.json` that allow always
accumulates*; reading the file out of the box to draw it is the same console with a transport
under it. What makes *nowhere* honest is the decision above: with the button withheld, no such rule
is written by a person's hand in a box, so there is nothing of theirs to show. Two rules can still
arrive there, and neither is a person's: one the repository carries in its own `.claude/` into the
clone, which is `04`'s project-scope hazard and read from there; and one Claude's own fence writes
when *Always Allow* answers a `SandboxNetworkAccess` request, a `WebFetch(domain:…)` rule into
local settings (`research/07` (5), point 4), if `04` keeps that fence on inside a box. The second
is the same third option on a different request, and this decision covers it: inside a box that
request offers no *always* either. If `04` turns the fence off inside a box — its lean, and `10`'s
input to it — the second never exists.

Priors. First-demo 14's asymmetry rule is not broken: a button withheld is an offer and not a
guarantee, and a kind already differs in what it offers (`01` point 6: `box` offered when its
engine is detected, the fifth level choosable only on a box). ADR-0004: nothing here hands a box a
host path, and the refused sentence is the mirror of that refusal, a guest path handed to a person.
`01` point 8: *whether a standing rule inside it has a place a person can open* is a property of
the kind, the way `02` made the carrier one — `local` yes, `box` no, a `hosted` kind no — so no
sentence here turns false when a third kind arrives. Relayed and not fixed, because it is
`.scratch/first-demo/14`'s and the Codex effort's and not this map's: the shipped sentence names
Claude's file for all five runtimes, and Codex's `allow_always` is `allow_for_session` on an edit
and `accept_execpolicy_amendment` on a command (`codex-agent-runtime.ts`, read), so on `local` the
file is measured for one runtime of five and the second Codex kind lands somewhere no ticket has
measured; and two adapter comments (fx, Codex) still say ticket 14 gives `allow_always` no path to
the UI, stale since 2026-08-29.

### §4, folded: a Routine whose Machine is unreachable when it fires

The map's fog item, folded 2026-09-05 so nobody looks for it there; §4's fourth bullet called it
*a new skipped reason on the map's fog, not a decision here*, and it is a decision here now, a
small one. The mechanism already exists and is nobody's to build: `routine-runner.ts` opens the
team before it prompts, and a launch that throws is recorded as a **skipped** run whose reason is
the launch's own sentence — its comment says so, *the reconcile's own words for a Workspace that
moved or went, and the runtime picker's for a CLI that is no longer installed; neither is rephrased
here* — so §4's refusal, thrown from the same launch, lands on the run row verbatim with no new
code and no new kind of reason. What this ticket owns is the sentence, and the fold decides one
thing about it: **the skipped reason is §4's refusal sentence, unchanged — never shortened, never
its own words.** Two consequences for §4. The sentence has to read whole on a run row, away from
the team pane and with no transcript around it: it names the agent and its sandbox — *Alice's
sandbox on this computer is not set up*, `08` §3's shape — and never *this sandbox*; it is one
clause with a cause, the length of the runner's own (*the agent was busy for the whole run*); and
it carries the fix as words, since the door `08` §3 requires is a control `12` draws at the refusal
and a run row has none. The rest holds unchanged and is right: three firings in a row skipped
disarm the Routine, saying which reason, so a box that is not set up three nights running disarms
it, which is issue 08's rule doing what it was written for; it is *skipped* and never *missed*,
because blobot was there and decided; and it is never a silent `local`, least of all here, since a
Routine's run is exactly the moment nobody would see the fallback. `CONTEXT.md`'s Routine entry
lists four skipped reasons and is owed a fifth, *a sandbox that could not start*; owed from here,
and not edited in this session, which edits one file.

### §3, the rail: read from `12`, decided nowhere on this ticket

Said once more, plainly, because the loop has since closed elsewhere. `10` §3 said *the rail is
this ticket's, taken here* and has withdrawn it (its 2026-09-05 amendment); `12` §3 has drawn the
answer — **a request the box refused is not on the rail** — with its reasons, the rail's two
channels being the folded status and a mark earned by origin, and a refusal that stops nothing
being neither. The lean is shared by `10` and `12`; this ticket reads it from `12`, which owns the
screen, and decides nothing about it. §3's one *decided here* — not `waiting`, into no
`StatusWord`, and no sound — is the fold and is `12`'s input, not the rail's answer; and §3's
*door — decided here* is the block line's door and not the rail. No sentence on this ticket claims
the rail, so nothing is struck; if a reader finds one that reads as if it does, it is read as
`12`'s. The loop `15` → `10` → `12` ends on `12`'s sentence and not on a reading of this one.

### §2, the sign-in: the name is allowed, and the words are all that is here

Two of §2's questions are answered above this ticket, and one of its premises is gone.

- **The name.** §2's first bullet was a reopen of `01` point 1 if the answer was yes, to be taken
  by the author there. It was: `01`'s 2026-09-05 amendment to point 1 names Docker **once, as an
  account**, on the onboarding screen and where a sandbox is offered, because a sign-in page
  cannot be anonymous, and `CONTEXT.md`'s Avoid entry now says exactly that. So the reopen is
  spent and the rule is what §2 asked for — the vendor as the account's owner, never as the
  engine, never a command, a mechanism or a word anywhere else. The sentence, provisional on
  `08`'s screen: *A sandbox on this computer needs a Docker account, which is not blobot's. Sign
  in once, in your browser.* Never *Docker Sandboxes*, never *Docker Desktop*, never *install
  Docker*.
- **The install door.** §2's first bullet also answered the name *from the other side*, on `08`
  §2's proposal that the engine had no install door blobot runs. `08`'s *Decided, 2026-09-05*
  supersedes that: the floor is one Docker sign-in as **onboarding, with buttons** — *Set up
  sandboxes* runs the vendor's installer behind a progress line, *Sign in to Docker* runs the
  sign-in that opens the browser on its own — never a terminal and never a command shown or
  typed. So the sentence-and-not-a-remedy case is moot, and so is the plain-words confirm over an
  unseen command: nothing is confirmed, a button is pressed. What survives of §2 unchanged: the
  licence (`01` point 7's second half, still to place or refuse there), whether one sentence is
  true in every place it is read, the daemon's own reporting and whether the account sentence
  carries it, and offline, still unmeasured and still not to be asserted.
- **Ownership.** `08` owns the experience — the screen, the buttons, the four facts and their
  remedies; `17`, the engine split from `14`, owns the mechanism — how the installer and the
  sign-in run with no terminal, and whether the daemon is started at all; **this ticket owns the
  words only**: the onboarding screen's sentences, the account named once, the note under the
  sign-in button, the subject of the engine's four words, and the card's words when the CLI's own
  sign-in inside a box is offered in the chat (`08`'s *the chat as the door*), where the runtime's
  name is allowed as it is in the picker, because that account is the runtime's and not the
  engine's. `08`'s ownership paragraph lists *the words* among the experience, and its own *Not
  this ticket* sends the account sentence and the copy here; read together, `08` places the words
  on its screen and this ticket writes them. Said here rather than edited there.

### The blocking paragraph, corrected to the edges on disk

The 2026-09-04 paragraph above says *`15` waits on `13`, `14` and `16`, and `08` on `13` and
`14`*. Neither is what the files say. On disk today `15` is blocked by `14` alone — it struck `13`
and `16` on its own grounds and said so there rather than editing here — and `08` by `14` alone.
After this round, with `17` split from `14` (`08`, *Ownership, settled here*; `17`'s file arrived
during this round, itself `Blocked by: 14`), **`15` is blocked by `17`, and `08` by `17`.** This ticket stays
**Blocked by: 04, 15**, on the criterion the paragraph states and for the same two sections — `04`
for what §5 is silent about, `15` for whether §3 has a line to word — so its chain is `04`, and
`15` behind `17`. `08` and `05` are read and block nothing, as before; question 7 above reads `04`
and `10` and waits on neither.

## Note, 2026-09-05 (consistency pass)

§7's ground — *no editor on this computer reaches the file* — is provisional on `12` §7's door not
shipping in the first build, which `12` now says. If the door ships, §7 is re-argued on a
different ground (a rule revocable only through a door) rather than kept. The words are this
ticket's and `08`'s *Decided* now says so in as many words. The edges: `08` and `15` are blocked
by `17` on disk now.
