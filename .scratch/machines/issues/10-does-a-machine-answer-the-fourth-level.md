Type: grilling
Status: open
Blocked by: 04, 05, 09, 13

# Does a sandbox answer the fourth trust level

## Current network amendment, 2026-09-06

Guillermo accepted open Internet and host/local-network services with the same selected harness
approval policy, and deferred network restrictions to another effort. The Machine's network
choice does not grant additional tool approvals or justify a trust level by a domain boundary.
The historical fixed-egress/host-service-isolation premises below are superseded by
[Egress from a box](15-egress-from-a-box.md). Guest files, credentials and native-fence behavior
still differ from local execution; do not infer identical effective capabilities.

## Question

Ticket 14 of `first-demo` is **reopened** on whether `trusting` should be the ceiling, from the
author: *"the cli has an auto mode, or allow everything, how we don't have that?"* It was left
open on purpose. This ticket is the reason it might now be answerable.

The case against a fourth level is that `bypassPermissions` makes blobot's disclosure false and
releases the four operations that are unrecoverable outside the worktree — `rm`, `sudo`, `chmod`,
`git push`. **Inside a fence, three of those four stop being unrecoverable outside the
worktree**, because there is no outside they can reach. Claude's own help draws the same line
unprompted: bypass is *"recommended only for sandboxes with no internet access."*

## What to establish

- **Does the fence actually cover what the ceiling was protecting?** Go through `first-demo` ticket 14's
  refused list one at a time against a real policy. `rm` inside a bind-mounted workspace is a
  worktree the user can recover with git. `sudo` inside a userns is not the host's root.
  `git push` is a network operation and dies to an egress allowlist. `chmod` is contained.
  Somewhere in that list is one that is still real, and finding it is the work.
- **Whether the level is per agent, and what happens when the fence is unavailable.** A trust
  level is stored on the profile and taken at next start. A sandbox can fail to engage — no
  `bwrap`, a kernel without userns, a platform srt does not cover. An agent whose posture is
  *bypass, because it is fenced* must not start unfenced. That is the same fatal-assert shape
  as `09`.
- **Whether it is one control or two.** See `04`. If the fence is a separate control, then the
  fourth level is *conditional on it*, and a form that offers a position the user cannot select
  without the other is a form that needs to say why.

## The honest failure mode

That a fence makes the loosest level *defensible* is not the same as it being *wanted*. The
argument that shipped for three levels was that a default made choosable is not a permissions
system. Four levels where the fourth is only valid in one configuration is closer to a
permissions system than three ever was, and this ticket should say so if it concludes yes.

## Amendment, 2026-09-04 — absorbed

This was `.scratch/sandboxing/04`, and it is the ticket four places in the codebase point at:
`packages/core/src/trust.ts:46`, `packages/core/src/adapters/claude/permissions.ts:162`,
`.scratch/mcp-permissions/spec.md`, and `first-demo` ticket 14. Those pointers have been
updated to `.scratch/machines/10`; the question is unchanged.

One addition from the wider destination. The argument above is that inside a fence, three of the
four unrecoverable operations stop being unrecoverable *because there is no outside they can
reach*. On a **machine that is not the user's own** — a container, a VM, a box kept for this —
that argument gets stronger still, and for a plainer reason: the blast radius is a thing the user
provisioned for exactly this and can destroy. But it also acquires a cost the fence does not
have, because the work is over there too. Establish whether the fourth level is conditional on a
*kind* of Machine rather than on a fence being engaged.

## Note, 2026-09-04

`unattended` shipped on 2026-08-31 as the **fourth** position (`packages/core/src/trust.ts`,
Claude's `auto` classifier with a nine-verb deny list). The level this ticket argues is therefore
the **fifth** — `bypassPermissions` and OpenCode's `'*': allow` — and the question is unchanged:
whether a Machine kind, rather than a fence being engaged, is what makes it answerable. Docker
Sandboxes runs Claude with `--dangerously-skip-permissions` by default because *the VM is the
boundary* (`research/02` §4), which is the vendor answering yes for the `box` kind.

## Amendment, 2026-09-04 — this computer only

The map was narrowed the same day to two kinds, `local` and `box`, and ticket `01` took the one
thing this ticket had been holding: **the fifth level, *everything*, is choosable only for an
Agent whose Machine is a `box`** (`01`, point 6). That answers the question the absorbed
amendment above asked — it is conditional on a *kind* of Machine, not on a fence being engaged —
and it makes the vendor's answer blobot's: Docker Sandboxes runs Claude with
`--dangerously-skip-permissions` by default because *the VM is the boundary* (`research/02` §4).
What `01` did not decide is everything that follows from that one sentence, and that is what this
ticket now is. Five questions, in the order they have to be answered. The title stays as it is and
is now wrong by two words, the way `08`'s is wrong by one: the level is the fifth, and the
condition is a Machine kind rather than a sandbox engaging. The map indexes by title, and its
entry is corrected when this ticket resolves.

**Blocked on `13` and `05` as well as `04` and `09`, added 2026-09-04 — and the line is wider than
the two the frontier was charted with, said here rather than left to be noticed.** The image
decides whether the mechanism takes at all (§4) and answers two of the nine verbs (§5); the `rm`
bound, the credential a push would need, and the ADR-0003 narrowing `05` §5 raises for `13` to
carry all read `05` (§5). Both are takeable and neither blocks on anything, so no cycle results and
the map's frontier line is unchanged: this ticket was blocked before and is blocked now, and `13`'s
own *Not this ticket* already reads the block. Resolving ahead of them would leave those answers
conditional on a ticket that may decide otherwise. The map's index is corrected when this ticket
resolves, as the title is. `16` is **not** on the line, on its own amendment — it is a record that
decides nothing and blocks nobody — and what the two measurements below need of it is said where
they are spent (§4, §5).

What a `box` is, for every one of them, is `01`'s closed list (point 5): a *data* volume holding
the CLI's own login, a *workspace* volume holding the AgentWorkspace as a clone, the operator's
`~/.claude/skills` read-only, one door to the mailbox, egress through a host-side proxy with a
domain allowlist, and nothing else — no host home, no host socket, no host network, no other
agent's volumes. Deleting the Agent deletes the box and both volumes (point 4). One thing about
that list has to be said exactly, because §5 leans on it and it was measured the other way: **no
ssh agent is on the list, and the first engine forwards the host's agent in by default** —
`SSH_AUTH_SOCK=/run/ssh-agent.sock`, carried to the gateway by `socat`, in the template's own
environment (`research/08` §2, [OBS]). `01` point 7 counts that forwarding among the engine's
merits, and it is a merit blobot does not use: the user's own agent answering from inside a box is
a credential handed across a boundary, which *no credential storage* and ADR-0005's one exception
do not cover. So the absence is not a property of a box; it is an act **blobot's kit performs** —
`14`'s kit turns the forward off to stay true to the list, which `15` has already read the same
way and routed: the socket *joining* the list is `01`'s to reopen and nobody else's to add. Every
sentence below that says *no credential inside* means *none once the kit has done that*, and if
`01` admits the socket, §5's two egress bullets are the ones that move. Every argument below is
made against that list and not against a fence policy, which is the difference between this
amendment and the ticket's first section.

### 1. Its name, and its sentence — both this ticket's

`01` wrote *everything* in italics and did not defend it. Ticket 14's condition stands: *a name
that is not `trusting`'s neighbour but visibly the end of the scale.* The four words on the scale
are all adjectives of the agent, under *how it answers* — `careful`, `normal`, `trusting`,
`unattended` — and *everything* is the first that is not. That may be exactly what makes it read
as the end, or it may be a word from a different axis sitting on this one; decide which.

Then the sentence under it, and it is **this ticket's and not `09`'s**. `09` §6 holds the
disclosure's third clause and assigns *the level's name and the sentence under it* to this section
by number, and its *Not this ticket* repeats the split; an earlier draft of this section handed the
sentence back, so it had no owner and the blocking order made sure of it. It reads `09`'s shape
for the disclosure and adds the one line, and the line has three things to get right at once. It
says what the *agent* does — asks about nothing, and nothing decides — rather than what the box
does, because overstating protection is the failure `09` names first and the one a user cannot
detect. It names the condition in the Machine's own words, *a sandbox on this computer*, never
the mechanism, which is `CONTEXT.md`'s Avoid list. And it names the **acts** the box does not
answer, if §5 finds any, in the picker's own register — *deleting*, *publishing*, *changing who
can do what* — and never a command, because first-demo 14's 2026-08-29 amendment took the command
names out of the disclosure on purpose and the picker's four sentences never had them.

### 2. The form, and the grain

A trust level lives on the AgentProfile and is copied onto the Agent at team creation — ADR-0001's
grain, an Agent being a profile instantiated on a Team and given what no profile can hold; a
Machine is per Agent, chosen when the Team is formed, with a Team default in the folder step
(`01`, point 3). A profile has no Machine, so a profile cannot honestly hold a level that only
means something on one. Three shapes were on the table: one is closed, one is open on a blocker,
and one is what is left — named here so nobody re-derives them:

- **On the profile beside the four**, with an Agent of that profile on `local` running lower and
  said at launch — **foreclosed by `01` point 6.** A level on a profile is chosen for every Agent
  of that profile on every Machine, which is exactly what *choosable only for an Agent on a
  `box`* rules out, and `08` §3's *never silently local* and `04` (c)'s *one dependency between
  them that is not a fold* are both built on that point. Picking it reopens `01` by name; it is
  not an option here.
- **The level and the Machine as one control**, a box implying *everything* — **open on `04`
  (c), its question 5**: *are they two controls, refused to fold in either direction?*, put to the
  author there and not decided. This ticket's lean, for `04` to take or refuse: two. `04`'s reason
  is that *prompting* and *reach* are different axes, and it is right here for a plainer one: a
  box is also chosen for reach — an agent that must not read the host — and a `careful` agent in
  a box is coherent. So this shape is closed when `04` answers and not before, which is why this
  ticket stays blocked on it. If `04` folds them, the fifth level becomes a property of the kind,
  the row below is said rather than chosen, and §3's hand-off to `15` is re-said.
- **Chosen where the box is** — on the agent's row in the team flow and in the roster edit, beside
  the Machine word `12` draws there — which is the shape left, and what this ticket decides is how
  it is built. It is the first piece of trust that is per Agent rather than per profile, and it has
  to be argued against ADR-0002's *an edit restates the whole definition* rather than around it:
  what a profile edit restates on an Agent already holding the fifth, and what the Agent holds when
  its Machine stops being a box. The lean: the profile's word is the four-position scale and is
  restated as it is today; the fifth is the Agent's alone, sits above the profile's word only while
  the Machine is a `box`, and a Machine moved off a box — if `14` offers the move — drops the
  Agent to the profile's word, said. Whether that is a column on the Agent or a fifth value in the
  profile's own column that only an Agent may hold is the decision.

Then the row when the Machine is not a box, which is **this ticket's to decide and `12`'s to
draw** — `12` declined the behaviour by name, and `04` (c) hands the question here undecided and
leaning neither way, in its own words: *absent, as `trustLevelsFor` draws a level a runtime lacks,
or the one row that is drawn and says why — is `10` §2's question and is not decided here.* The
rule for a level a runtime lacks is *absent, not disabled* (`levelsFor` in `TrustPick.tsx`;
`trustLevelsFor` in main is only the per-runtime list), because a greyed row invites *why not* and
the honest answer names a provider the form may not know. A Machine is a thing the form **is**
allowed to name, on `01`'s own terms, so the reason that rule was written does not apply here.
Decide whether it holds anyway, or whether this is the one row that is drawn and says why — at the
cost of being the only row on the form that advertises a Machine kind, and of being read by every
user who will never open a box. Whichever it is, `12` redraws the row and decides nothing about it.

And the failure: an Agent at the fifth level whose box cannot be had — engine absent, `sbx login`
not done — is refused by name and is never started on `local` at a level it was not given. That
is decided, and not here: `08` §3 refuses the silent fallback for every box agent and gives this
level as its first reason, and `09` §4 makes it *a `box` that cannot start is a refusal to start,
never a silent `local`*, both on the fatal-assert shape of Codex's `#assertPosture`. This ticket
reads both and adds nothing to them.

### 3. The block is the only channel left, and what that costs

At this level `session/request_permission` never arrives. The permission block never draws,
`waiting` is never entered, the rail never inverts for this agent, and the one notification sound
never fires. That is the point of the level. What remains is an event already decided elsewhere
and read here rather than re-decided: a request the *Machine* refused is said in the transcript
and never lost in silence (`01` point 5); it is not `waiting`, folds into no status word and does
not sound (`09` §3, the first of the three read there from `15`); and its carrier — blobot's own
line from the proxy's log, or the vendor's tool error left as it is — is `15`'s output 8.

**The rail is this ticket's, taken here.** Three neighbours route *whether a refused request earns
anything on the rail* to this section by name — `09` §3, `12` §3 and `15`'s output 8 — and an
earlier draft read *not on the rail* from `12` §3, which is the ticket that declined it, so the
question had no owner. It is taken because it is the fold's consequence at this level, and it
splits as §2 does: **whether** is decided here, and how a row draws it, if it draws anything, is
`12`'s. The lean is nothing: a rail row carries a folded status and an unread mark earned by
origin, and a refusal that stopped nothing is neither an activity nor a thing the user started.
The case against the lean is the paragraph below — at this level the block line is the *only*
channel a backgrounded box team has, so a refusal on a team not on screen is unseen until the user
opens it, which is the condition `waiting` bought its inversion and its sound for. Decide which, in
words that stay true when `12` draws the answer. And one constraint from `15`'s output 8, taken
rather than answered: whether a refusal by the proxy and a refusal by a runtime's own fence inside
the box are one event or two. On Claude's fence a domain refusal *is* a `session/request_permission`
(`research/07` §5) — the exact channel this level closes — so what that refusal becomes under
`bypassPermissions` is unmeasured, and reads `04`'s question 3 first, since a fence that is off
inside a box raises nothing.

What is this ticket's is narrower. For every other level the permission block is how a
backgrounded team reaches the user; at this one, that line is the **only** channel left, and it
carries a fact of a different shape — *refused, and continued*, where the block says *unvouched,
and stopped*. Two things follow, and naming them is this ticket's. The disclosure: *everything
blobot has not vouched for, they ask about* is unqualified for three levels and `unattended` got
its own sentence; the fifth needs a third clause, true standing beside the Machine's sentence
rather than borrowing from it, and it has to say that nothing asks and that the transcript is
where a refusal shows. That the clause exists is decided here; its words are `09`'s. And a Routine
at this level on a box runs its three turns with no gate but the box — a permission cannot expire
because none is raised — which is the exact case the level exists for, and the one the clause has
to say plainly, since a run is where nobody is watching. What this ticket hands `15` for its
output 9, conditional on `04`'s question 5: if prompting and reach are two controls, the fifth
level changes nothing about the egress list, because reach is per kind and prompting is per agent,
and a level that widened the allowlist would be the fold `04` asks whether to refuse; if `04`
folds them, this hand-off is re-said. On either answer this ticket widens no list.

### 4. Whether `unattended` and the fifth collapse on a box

`unattended` is Claude's `auto` classifier over `trusting`'s list with the nine verbs denied
through `disallowedTools` (`packages/core/src/trust.ts`), and it is the one level a single runtime
expresses and four do not. The fifth is the opposite: **every runtime can express it** — Claude's
`bypassPermissions`, OpenCode's `'*': allow` with no `ask` beneath it, Codex's mode over blobot's
ceiling, fx's *full tool access*, Cursor's `approvalMode: unrestricted`. So on a box the form
would draw five rows for Claude and four for the rest, with the gap between `trusting` and
*everything* unbridged on four of five, and ticket 14's asymmetry moves up one rung rather than
going away.

The classifier's case is that it is a second decider that can refuse. The live run
(`first-demo/14`, 2026-08-31) never saw it refuse anything: three attempts to provoke a denial
failed, and it approved `chmod 777`, a push to a real remote and `sudo`. What it buys inside a box
is therefore unmeasured, and its cost is an inference call per unvouched request. Decide whether
`unattended` is offered on a box at all, or whether on a box the scale is four rungs on every
runtime and the classifier is what `unattended` was for `local` only.

The mechanism that delivers the fifth on Claude is not free either. The bridge discards
`permissionMode`, so the mode is `session/set_mode` against the `availableModes` the adapter
already probes for `auto`, and `bypassPermissions` is gated on `!IS_ROOT || IS_SANDBOX` in **the
bridge's** fixed list, read out of `dist/acp-agent.js` (first-demo 14's table) — and the CLI keeps
a refusal of its own beside it, since the vendor's install documentation says it *rejects
`--dangerously-skip-permissions` when launched as root* (`research/06`, *How the market builds the
per-agent image* — [DOC], read and not measured on this map). So the image decides whether the
mechanism takes at all: `13` takes a non-root `agent` at uid 1000 from the engine's kit contract,
and at that uid the bridge's gate is open on `!IS_ROOT` alone, so `IS_SANDBOX` matters only to a
root image the contract rules out — whether the image sets it at all stays `13`'s output 2 item,
decided with this ticket, and is moot for the bridge's gate. The advertised half is on disk: in
Docker's own claude template at uid 1000, `session/new` through the pinned bridge answered six
modes — the bridge's whole list, `bypassPermissions` among them — with `currentModeId: default`,
although the template's own `~/.claude/settings.json` says `defaultMode: bypassPermissions`
(`research/08` §5, [OBS]); so on the bridge the mode is `set_mode`'s and not a file's, as far as
`session/new` shows. What is unspent is narrower than *the mechanism*: whether
`session/set_mode("bypassPermissions")` **takes** on that session, and whether a turn then runs a
verb without asking — `research/08`'s own *still unmeasured* list names exactly that. It is on no
other ticket's line — `16` has no item for it and blocks nobody — and is this ticket's own spend,
in a box one `sbx create` away: the templates are kept and `sbx` is signed in (`research/08` §7,
§1), and `session/new` answered signed out, so the `set_mode` half costs no tokens and may need no
login inside; the turn needs one, which is `16`'s item 4b and the author's act, and is spent after
it and never before. If the mode does not take, the fallback is `default`, which is stricter and
the safe direction, and it has to be said and never assumed — the same sentence ticket 14 wrote
for `auto`.

### 5. Which of the nine verbs stay real inside a box

Go through the list against `01`'s closed list, one at a time:

- **`git push`, `git remote`** — egress, then a credential. A push dies to the domain allowlist
  *unless the forge is on it*, and `gh pr view` is vouched from `normal`, so `api.github.com` has
  to be reachable for that promise to hold on a box; whether that is the host a push needs is
  `15`'s output 3. Whether any credential to push with is inside the box, `05` §1 has answered for
  the list as written: none — the data volume holds the CLI's own login and nothing else, and the
  user's `gh` login is not on `01` point 5's list. Over ssh it is the kit's act and not the list's:
  the engine forwards the host's agent in by default (`research/08` §2), so a push to the forge on
  `:22` from inside would sign with the user's own keys until blobot's kit turns the forward off,
  and *no credential before no route* is true of the kit blobot ships and not of the engine's
  default — which is what the level's sentence has to be true of. What is neither's: *a pull
  request is the user's action and never an agent's* holds at every level on every Machine, and
  this ticket has to name what carries it here — the egress list, the absent credential, or both —
  because a deny rule on the verb is not available on every runtime.
- **`rm`** — the two volumes. On the workspace volume it is the agent's own clone, and what is
  lost is everything since `05` last fetched it home; on the data volume it is the CLI's login,
  which `08`'s sign-in inside the box replaces. Bounded rather than contained, and the bound is
  one fetch on `05` §1's cadence, a blocker now — a fact the level's sentence has to carry, in the
  register of acts: what has not come home yet.
- **`sudo`** — the box's own root, which the market's kit grants without a password: the contract
  as read (`research/06`), and measured in Docker's own template — `agent` at uid 1000 in groups
  `sudo` and `docker`, `sudo -n true` answering (`research/08` §2, [OBS]) — and blobot's image
  grants or does not (`13`, a blocker now). Root reaches the same two volumes and nothing else: it
  cannot see the host, and it cannot reach past the proxy, since the box has no other network. It
  is real for exactly one thing — it can change what is on the data volume that the *next* start
  of this agent reads — and, until the kit turns the forward off, for a second: root reads the
  same forwarded socket the agent does.
- **`chmod`, `chown`** — the volumes again. A mode change on the clone is a diff that comes home
  by fetch and is reviewed as one.
- **`docker`** — the box's own daemon, if the image has one (`13`, output 2); Docker's own
  template does — its own `dockerd` inside, a socket owned by `root:docker`, and `agent` in that
  group (`research/08` §2, [OBS]). Nested, bounded by the box's resources, no host socket. The
  verb the deny list was written for reaches nothing of the user's here, and a project whose tests
  need a daemon is the case for having one.
- **`ssh`, `scp`** — egress, and then a key. Whether the forge on `:22` is admitted is `15`'s
  output 3, undecided; behind it there are no key files inside (`ls ~/.ssh` counts zero,
  `research/08` §2) and, once the kit has turned the forward off, no agent either — so the pair
  dies at least once on either answer from `15`, and if `15` admits the port it dies on the key
  alone. Until the kit has done that, the opposite is true and measured: port 22 admitted is the
  user's own agent signing from inside. `15`'s output 3 asks whether the list would need the
  socket; whether it joins the list is `01`'s to reopen; this ticket reads both and says only that
  the level's sentence is written against the kit blobot ships and never against the template.

Then the list itself. It is a deny list at `unattended` only, delivered as Claude's
`disallowedTools`, measured to hold under `auto` and **unmeasured under `bypassPermissions`** —
the second measurement this ticket owns, beside §4's, spent in the same box and after the same
login inside. OpenCode can express a deny above `'*': allow` because its rules are ordered;
Codex's full-access mode and fx's have no deny surface; Cursor's `permissions.deny` is a silent
hard block whose `tool_call` reports `completed`, which is why that adapter keeps it empty. A
nine-verb deny at the fifth level is therefore expressible on two runtimes, half-expressible on a
third and absent on two, and *a guarantee that holds for Alice and not for Bob is worse than no
guarantee* applies word for word. Decide whether the deny list survives at the fifth level at all,
or whether at this level **the Machine is the whole of the refusal** — egress for four of the
verbs, the volumes for three, the image for two — with the acts the box does not answer named in
the level's own sentence (§1).

One more input, read from `05` and not decided here. On `local` the operator's own
`~/.claude/settings.json` reaches the agent under ADR-0003's *all three scopes*, and any
`permissions.deny` the operator wrote there is theirs, for their own terminal — under `01` point 6
there is no bypass on `local` inside blobot, and whether such a rule holds under
`bypassPermissions` at all is unmeasured, on this map and elsewhere. Whether that file crosses into
the box is not open: `01` point 5 mounts the operator's `~/.claude/skills` read-only and nothing
else of the operator's, so the user scope inside is the data volume's and the settings file does
not cross — `05` §5 reads that as given, adds that a file whose arrays merge across scopes is
exactly what must not cross a boundary built to be one, and **raises** the narrowing of ADR-0003
this amounts to without deciding it, for `13` to carry as a second amendment at the ADR's foot and
a comment on `01` point 5. This ticket reads all of that and decides none of it. What follows for
this level is the one thing that is its own: nothing the operator wrote for their own terminal is
in the box, so the refusal here rests on the Machine and on whatever §4 and this paragraph measure
— which is the honest version of *the Machine is the whole of the refusal*, and the reason both
measurements are spent before the sentence is written.

### Priors

ADR-0001, as `01` extended it: an Agent is a profile instantiated on a Team, and a Machine is one
of the things a Team gives an Agent, which is why §2's fifth position is the first piece of trust
held per Agent and never per profile — a level a profile held would be chosen for every Machine
that profile ever runs on. ADR-0002: a profile edit restates the whole definition, and §2 argues
the fifth against that sentence rather than around it. ADR-0003: the operator's `settings.json`
does not cross into a box, so nothing the operator wrote for their own terminal is part of the
refusal here; the narrowing is `05` §5's to raise and `13`'s to write, and §5 reads it. ADR-0004:
the level changes nothing about reads — `Read`, `Glob` and `Grep` never prompted at any level — so
the ungated read the ADR refuses is bounded by the box's reach and never by the level, and a fifth
level that widened reach would be the fold `04` (c) asks about. ADR-0005: its one exception is
transcription's key and does not stretch to an ssh agent forwarded into a box, which is why the
kit turns the forward off. First-demo 14's rule — *a guarantee that holds for Alice and not for Bob
is worse than no guarantee* — decides §4's asymmetry and §5's deny list, and is the reason both
measurements are spent before the sentence is written.

### The honest failure mode, restated

The section above says four levels where the fourth is only valid in one configuration is closer
to a permissions system than three ever was. It is five now, and the fifth is valid on one
Machine kind, and the form is where that becomes visible. If this ticket concludes yes, say so in
those words rather than softer ones.

### Not this ticket

The disclosure's third clause, what a Machine's refusal says, and what a blocked request says —
`09`; the level's **name and sentence are this ticket's** (§1), which `09` §6 assigns here by
number. Whether the fifth-level row is absent or drawn on a Machine that is not a box is this
ticket's (§2); whether a refused request earns anything on the rail is this ticket's (§3); how a
row draws either, and where the Machine word sits beside it, is `12`. Detection of the engine and
the login inside the box is `08`, and the refusal of a box that cannot be had is `08` §3 and `09`
§4, read here. The egress allowlist, whether the forge on `:22` is admitted and whether the list
would need the agent socket (output 3), and the block's carrier (output 8) are `15`; whether the
socket joins `01` point 5's closed list is `01`'s to reopen; turning the engine's forward off is
`14`'s kit. What the image contains — which user, whether `sudo`, whether a daemon — is `13`, a
blocker now, and with it the ADR-0003 narrowing `05` §5 raises. The clone, when it is fetched
home, and that nothing inside can push are `05`, a blocker now. The box the two measurements are
spent in, and the login inside it, are `16`'s items 4a and 4b — a record and never a gate. Whether
a fence inside `local` earns anything is `04`, and whether prompting and reach are two controls is
`04` (c)'s question 5, open — read here when it is answered and never pre-empted; this ticket stays
blocked on it because *one control or two* has the same answer at the Machine layer as at the
fence. Whether a runtime's own fence runs inside a box is `04`'s question 3, which §3 reads.

## Amendment, 2026-09-05

Two corrections to §3.

**The rail is `12`'s.** §3 says *the rail is this ticket's, taken here*; that wording is withdrawn.
`12` §3 has drawn the answer — **a request the box refused is not on the rail** — with its reasons:
the rail's two channels are the folded status and a mark earned by origin, and a refusal that stops
nothing is neither. `09` §3 reads it as `12`'s because it is a place question. It is read from `12`
and not decided here; §3's *whether* and its lean are struck, and the loop `15` → `10` → `12` ends
on `12`'s sentence.

**"Nothing asks" is not true of the network wherever a runtime's fence is on.** On `local`,
`research/07` §5 measured Claude's own sandbox raising a `SandboxNetworkAccess` permission request
for an unlisted host, through `session/request_permission` — the fence asks, on the exact channel
the fifth level closes. On a box the engine's proxy answers an unlisted host with a synthesized
`403` and the turn goes on (`research/08` §2; `09` §3's *not `waiting`*). Decided: the level's
sentence is written against the proxy and never against a fence, so *nothing asks* survives on a
box exactly when no runtime fence is on inside it. That is `04`'s question 3, and this ticket's
input to it is *off at the fifth level*: a fence asking on a closed channel is a request nobody can
answer, and what `bypassPermissions` does with it is unmeasured.

## Note, 2026-09-05 (consistency pass)

*Not this ticket* still reads the rail as this ticket's; it is `12`'s, as the amendment above says.
And the `403` on a box is measured on the proxy with `curl`, not on a turn (`research/08` §2).
