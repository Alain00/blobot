Type: prototype
Status: open
Blocked by: 05, 09

# A Machine on screen, and where a profile is addressed from

## Current inputs, 2026-09-06

[What a sandbox lets blobot say](09-what-a-machine-lets-blobot-say.md#answer--2026-09-06)
is resolved and owns the current words. Its Answer supersedes the historical guest-clone,
sole-host-port, destination-list and box-only withheld-approval premises below. Both kinds use
host working folders; a box has open Internet and host/local-network reach while preserving
its runtime's selected approval policy. No network list/editor is in scope. Profile contact is
already implemented by [Where a profile is addressed from, on screen](18-the-profile-conversation-on-screen.md).
Machine placement/setup controls still must respect the image/runtime activation gates.

## Question

Two surfaces do not exist and both are governed by `DESIGN.md`.

**Where you talk to an agent outside a team.** *Your agents* is a screen over the working
surface, reached from the rail's foot, and nothing on it starts anything. A profile-grain
conversation would be the first thing there that does. The naive move is to reuse the team pane,
and it is wrong for a reason worth seeing at full size: `WORKSPACE` is false, the roster is
empty, `@mention` addresses nobody, `handbook` is team-scoped and false, and the composer's
fan-out cost line has nothing to fan out to. **A pane whose furniture is mostly absent is a pane
that lies by arrangement.** Draw what is actually true instead.

**Where a Machine is said.** An agent executing somewhere the user cannot see is a fact, and
`DESIGN.md`'s standing constraint is that no channel may be the only carrier of its fact. A
machine is not a blobatar and gets no colour. Candidates: a line beside `WORKSPACE`, which is
already per agent and already the answer to *where is the work*; a figure in the activity column;
something on the rail row, which is already folding four statuses into one word and has no room.

## What to make

Rough and cheap, to react to rather than to ship. `--screenshot=<path>` renders without a human
at the screen and is how every other interface decision here has been judged.

1. The profile conversation, in the two arrangements worth comparing: **a pane on the agents
   screen**, and **a dialog from the agent's own row** — the shape the Handbook took after the
   first real one proved a panel under the composer could not hold it.
2. The Machine said in the two or three places above, with a `local` agent and a non-local one
   side by side, because the whole question is whether the difference reads at a glance.

## What it is not

Not the composer, not the transcript voices, not a new status word. `waiting` already covers a
blocked agent and a fourth voice was refused for the Routines firing, which is the closest prior:
a firing draws in the user's voice under a `system` line, and no new voice was invented for it.

## Amendment, 2026-09-04 — this computer only

Narrowed with the map: the kinds this prototype draws are `local` and `box`, and nothing here is
drawn for a Machine over ssh, a hosted one, or a second client. **The profile-conversation half
above is unchanged**, still blocked on `07`, and still one of the two things to make. What this
amendment adds is the **Machine half**, which ticket `01` made drawable: the noun is said by kind
and in plain words (point 1), placement is per Agent with a Team default asked once in the folder
step (point 3), `local` stays the default and `box` is offered with its cost beside it (point 6),
and the account and the proprietary engine are costs that go on screen (point 7). The copy is
`09`'s: the prototype prints the two phrases `01` point 1 fixed, *this computer* and *a sandbox on
this computer*, and `09` decides what each is allowed to sit next to — it adds sentences and
renames nothing. **`09` decides words and this ticket decides places**, which is `09`'s own rule
and the rule every paragraph below is read under: where a sentence a neighbour owns is drawn here,
it is drawn as a stand-in in the slot the place gives it, and the sentence is read from its owner
before the screenshot is judged. Point 7's two costs are not both on these screens, and that is
said rather than assumed: the account reaches the folder step only as `needs sign-in`, and whose
account that is, is `09` §2's to name; the licence is on no figure here, and whether it is a fact
for that sentence or is not said at all is `09` §2's to place — and not saying it is a reopen of
`01` point 7's second half, which `09` §2 already says, and never a refusal this ticket can offer.

The vocabulary the prototype uses: **this computer** and **a sandbox on this computer**. Never
the engine and never the mechanism, in any pixel a user reads — and a `title`, a popover and a
menu row are pixels a user reads. The first draft of this paragraph said a vendor would appear
anyway in two places, the install confirm and the pty under it, and had `08` §2 wrong on both.
`08` §2 proposes that **the engine has no install remedy blobot runs**: the install is a Docker
command, and CLAUDE.md's *the user never sees or types a Docker command* leaves no shape in which
blobot shows one, while `runtime-readiness`'s install confirm is exactly a command shown in full
and agreed to — DESIGN.md quotes it in mono *because it is the sentence being agreed to*. The two
rules meet and neither gives, so the engine's `not installed` carries a sentence and no door, and
the one thing `08` §2 puts to the author is whether a kind with no install door is acceptable, or
whether the permanent rule is amended for this one command. The prototype draws `08`'s proposal,
a sentence and no door, because a prototype draws what a ticket proposes and not the shape a
permanent rule forbids. `sbx login` is not put to the author at all: `08` §2 sends it to `14` as
*driven invisibly*, `14`'s item 2 sends it back to `08` on a pty, and `09`'s *Not this ticket*
names the loop so that one of them takes it and withdraws its own pty pointer. Both readings agree
on the one thing this prototype needs — no pixel here is the vendor's — so `needs sign-in` is drawn
as a state word with nothing running under it; if `14`'s reading wins, the pty is the runtime
picker's existing shape and no new pixel of this ticket's. The vendor's own browser page, when a
sign-in opens one, is outside blobot's mouth the way `claude auth login`'s is.

One rule for the pieces drawn, taken from the options menu: **the renderer is handed words and
draws them, and has no list of kinds in it.** Core hands it `{label, cost}` per Machine the way a
runtime hands the form `{id, label, choices}`, so a third kind is a row and not a branch. That is
`01` point 6's *the interface must not preclude them* seen from the screen, and it is what keeps
the UI Machine-agnostic the way it is already provider-agnostic.

### 1. The folder step offers the box, with its cost beside it

Step 02, *the folder they work in*, gains a second question under the folder and above the icon:
**where they work**. Not a step of its own, because `01` says the Team default is asked once in
the folder step, and a fifth numeral for a question most people answer by doing nothing would be
the wizard the page is not. Two `.listrow.pick` rows: *this computer*, on at rest, and *a sandbox
on this computer*. The default is the chosen row and not an empty pick, so a user who never reads
the question gets what every team has always got.

The box row carries its cost as its second line, in the mono voice, the way the runtime picker's
row carries its readiness line: a fact about the machine and not a gloss on a word, which is the
one exemption DESIGN.md gives to *a pick's sentence is on its menu row*. Three figures, in the
order they are paid, every one a stand-in with its source named, so that `13` and `14` inherit
no number nobody derived:

- **The engine's state**, in ticket 11's four words as `08` §1 maps them onto an engine:
  `not installed`, `needs sign-in`, `ready`, `status unknown`. The line is a readiness and not a
  remedy. `not installed` carries `09` §2's sentence and no door, on `08` §2's proposal above;
  `needs sign-in` carries the state and the account sentence `09` §2 owns, and nothing runs under
  it — no pty on this row, whichever of `08` and `14` takes the login. Nothing concludes from an
  exit code and the row ends on detection asked again, which is the part of the runtime picker's
  shape that survives the move. `08` owns whether these four are the right four for an engine.
  Whether the row is drawn at all when the engine is absent — with its sentence and unpickable,
  or hidden until detected — is `09` §2's question, asked there already, and the prototype draws
  `09`'s answer rather than carrying the question twice.
- **Disk, per agent**: `up to 4 GB on disk per agent`. That figure is Docker's own Claude kit's
  five data volumes, `2g` plus four at `512m` (`research/06`, *Volumes are a kit's*), and it is a
  figure for the data volume alone: it excludes the workspace clone, which for a real repository
  may be the larger of the two, and blobot's own volumes are `13`'s to size. What the row keeps
  from it is the grain: a box is per Agent, so a four-agent team is four times whatever the
  figure turns out to be, and the row says *per agent* rather than pretending to a team total it
  cannot know before step 03.
- **The first download**: `downloads about 600 MB the first time`. That is the size of Docker's
  own kit images as their Hub listing reads them — 300 to 1011 MB compressed, `research/06`'s
  table of the market's images, read and not measured — and not of any image blobot has built;
  what `research/06` measured on this machine is the CLI binaries on arm64, which bound the image
  from below. The real figure is `13`'s. While it runs it is the one figure on screen that knows
  its end, `downloading · 412 MB of 574 MB`, no bar, under DESIGN.md's rule for a download. It is
  drawn at *create* as a stand-in, because the screenshot needs a moment and a pick is not a
  commitment; who pulls — `sbx -t` on first run, or blobot ahead of it — and how the pull is
  drawn are both `13`'s item 6, so the moment is `13`'s to move and this figure pins nothing.

Chosen, the step folds to `02 · ~/code/checkout · git · clean · a sandbox on this computer`. Left
at the default it folds as it does today and the Machine is not mentioned: a constant on every
team is the `checkout` the tray was cleared of.

Two sentences `05` §2 raised and `09` §6 holds are **placed** here and not worded. A `plain`
Workspace in a box is still *their own copy*, moved off the disk the user can open: its place is
the folder step's row that already says `their own copy` where a git Workspace's says `their own
copy, on their own branch`. A `nested` Workspace in a box costs a fetch per repository per turn,
the price of having picked N repositories: its place is where scope is chosen. Neither is in a
screenshot, because the demo team's Workspace is `git`; the places are named so `09`'s two
sentences have somewhere to land.

The disclosure at the foot still ends *blobot is not a sandbox*, unchanged in the prototype on
purpose. Once one agent is on a box that sentence is per agent and half false, and rewriting it
is the first thing `09` exists to do.

### 2. The per-agent override is on the agent's own row

Step 03, *who joins*: a chosen roster row gains one more thing at its tail, beside the tick, a
mono word at `--muted` reading the resolved Machine and following the row's ink on hover the way
the twisty does. It opens a `.selectmenu` of the two kinds with the cost on each row and a
`default` badge on the team's own, borrowed outright from the *how it answers* menu, because a
second menu that looked different would be claiming the two are different kinds of thing. A row
not on the team has no Machine and draws nothing there: placement is an Agent's and never an
AgentProfile's, so it never appears on the hire dialog or on *your agents*. Mara on this computer
for the simulator while the team is boxed, and Bob on a box while the team is local, are the same
control pointed either way.

The trigger says the resolved answer, so a control nobody touched still says what will happen,
which is the rule the options menu shipped with. What that rule costs on a roster is a column of
identical words on the ordinary team, and the alternative is put to the author below. This is the
one place besides the folder step's pick row where *this computer* is printed, and it is printed
because the word is a control and not a description; §3 says where the default is silent.

The edit-roster dialog draws the same word on a joiner's row, since joiners are instantiated as
creation does. On a member already on the team the word is drawn and not offered: whether an
Agent may be moved between Machines is `14`'s — `05` made the move survivable and hands the offer
there — restarting a box is `14`'s too, and the prototype asserts nothing about either.

### 3. Where the pane says it, and what the rail does

**Per agent and never per team**, for the reason `WORKSPACE` is drawn twice: a Machine is per
Agent (ADR-0001, extended by `01`), so one word under a team composer would be false about the
other members. Two places, and the reason is not the one the Question above gives. *No channel
may be the only carrier of its fact* is not a rule DESIGN.md states. What it states is per
channel — colour is never the only channel for anything, a mark is never the only one beside its
label, and *no sound may be the only carrier of its fact*, which is specific to sound and reasoned
from there being no `prefers-reduced-sound` — and the generalisation is this map's own, which `09`
§5 records and the Question above made too. DESIGN.md's rule for a fact drawn in words runs the
other way: a shape or a word, **never both at once**, never the same claim twice in the narrowest
place in the app. The two places here do not break it, because they are in two panes that are
never on screen together, and each pane has exactly one surface on which a per-agent description
is allowed at all. That is the reason for two, and neither surface is the tray:

- **The pane's one mono hairline row**, which already carries *where it is working*: in the
  agent's pane the folder gains the kind, `~/code/checkout · in a sandbox on this computer`. That
  row is the one description the transcript allows above itself and it is per agent there.
- **The team pane's `WORKSPACE` block** in the activity column, one row per member: a mono
  segment in the words above, drawn only for a box. The block is where a per-member description
  is allowed — DESIGN.md kept `checkout` and `3 changed` there when it cleared them from the
  tray, *where they vary from member to member and are worth comparing* — and a Machine varies
  from member to member by `01`'s own grain.

**Not the tray.** The tray's rule is that everything on it is a live number or a door and nothing
on it is a description, and `checkout` was removed from it on that rule. A kind word is a
description. The first draft of this amendment put it on the tray as the label of a door — *open
in VS Code*, §5 — and then labelled the door with the door's own name, which left the kind as a
description beside it in every branch of the argument, not only the one where the door was
refused. So the tray carries nothing about the Machine, in either pane, and the tray's rule is not
amended by a prototype. Put to the author below, because the case for the exception is real: the
tray is the only per-agent surface under the composer, and a person typing to Alice looks there
and not at the header. In the team pane this means a pane with the activity column hidden says
nothing about a boxed member; the agent's own pane is one click away and says it in its header
row.

**What the block carries for a box is `05`'s, states and sentences both, and this ticket is
blocked on it.** `05` §1 fixes two new absences in `WORKSPACE`'s type — *we could not fetch*, a
fact about the branch that must not borrow the forge's *we could not look* (`asked: false`), which
is a fact about `gh`; and the loose-files figure when the box cannot be asked, *absent and said,
never `clean`* — and owns the state and the sentence of each, which `09`'s *Not this ticket* says
too. What is this ticket's is where they draw, tray or activity block, and the answer is the
block, by the rule above. An earlier line of `05` §1 read *the words are `12`'s*, and the first
draft of this section took it; `05` has since withdrawn that line by name, and this section reads
`05` as it stands. The stand-ins on Alice's row are two **slots** with placeholder text, one each,
apart from each other and from *no pull request*, so that a `WORKSPACE` screenshot is judged
against the right block and not against a block that folds a missing fetch into a clean tree. The
sentences are `05`'s and are read from there before any screenshot is called final — which is why
`05` is on the *Blocked by* line, and `05` says so itself: *`12`, blocked on this ticket, reads
the sentences from here before it draws them.*

**`local` is silent in the header row and in the block.** Not everywhere: the folder step's pick
row and the roster row's resolved word print *this computer*, because a control nobody touched
still says what will happen, which is the options-menu rule §2 borrows. Where the kind is a
description rather than a control it is drawn only for a box. That is the question this prototype
exists to answer — whether the difference reads — and the stance is that on a mixed team one row
saying *a sandbox on this computer* among three saying nothing is the difference, and four rows
saying *this computer* is `WORKING` printed beside dots that already say so. Put to the author,
because the opposite reading has a case: the disclosure's last sentence is about the absence of a
box, and an absence nobody prints is an absence nobody notices. If that question is read as
whether the default kind is *said* rather than where, it is `09`'s under its own rule, with this
ticket's stance as the input; the prototype draws silent either way until it is answered.

**The rail does nothing new, and one of the two things it could be asked to carry is decided
here.** A Machine is not a Status: it is placement, chosen when the team is formed and constant
while you watch, and a rail row is one small line carrying a mark, a name and a folded status or a
recency, with an unread mark earned by origin and nothing else let onto it since. **A request the
box refused is not on the rail.** That is a place question, and `09` §3 says a place question and
not a words question closes it; `10` §3 already reads *not on the rail* from here, so the first
draft's *`10` §3's open bullet* pointed at a bullet that does not exist, and the loop `15` → `10`
→ `12` → `10` ends on this sentence. The reasons: `09` §3 has the event fold into no `StatusWord`
and not sound, because it is not an activity and asks nothing; the rail's two channels are the
folded status and the unread mark, the mark is earned by origin — a Routine's run, never a turn
the user started — so a refusal inside a turn the user started has no channel on the rail that
would not be a new one; and the sound effort's rule holds here word for word: the one
notification bought was `waiting`, because silence there loses work nobody chose, and a refused
request loses nothing the transcript does not already say. The transcript is where it is said
(`01` point 5), its carrier is `15`'s, and its words are `09` §3's. What the rail could still be
asked to carry stays with its owner: an engine absent or stopped at launch is not a reconcile
outcome (`05` §3), it is refused by name at launch, `14`'s with `08`'s detection (`08` §3), and
whether the team starts three of four and what the rail row says while it does is `09` §4's
fourth bullet, with the row drawn unchanged here pending it. Whether a box earns a **mark**, the
map's fog item on a Machine's identity on screen, the prototype answers by drawing none: the mark
slot on the rail is the project's, a Machine is not a blobatar, and a glyph in the roster or on
the `WORKSPACE` row would be a second channel where words already are. Asked below rather than
closed.

### 4. Where the engine's readiness lives, and where the refusal points

`08` §3 requires a door from the refusal and does not choose it; `09` §4 names it *a door `08` §3
requires and `12` places*; and `09` §2 reads the engine's readiness as living *wherever `12` puts
the Machine registry*. The first draft drew the engine's four words only on the folder step's box
row, which a running team cannot reach, and placed nothing else, so a box refused at launch would
have ended with no door where today's `refuseMissingRuntimes` ends with one — *Install it from the
runtime picker on the agents screen* — which is a regression in shape and not a prototype's to
leave. Placed, and put to the author:

**Settings, as a second section.** Settings is the rail's third door and holds the machine:
ticket 11's four states with ticket 11's remedies, one section, *because a sidebar with one true
item is more honest than four invented ones*. An engine's readiness is a fact about this computer
of exactly that kind, and it is neither the roster nor standing work, so it lives behind the
settings door without making the door the lid it was refused as. The section draws `01` point 3's
registry — places set up once: *this computer*, always, and *a sandbox on this computer*, with the
engine's four words beside it and `09` §2's sentence under them, in the row shape the runtimes use
above it. Not a screen over the working surface: *your agents* is a place because what you do
there changes the roster, and a registry of two places, one of which is always present, is a
section with one true item. A third kind is a third row, by the options-menu rule above.

**The refusal's door points there.** The sentence is `09` §4's; what this ticket places is its
end. The door is Settings' machine section, the way today's refusal ends on the runtime picker,
and it is one door for every cause `08` §1 lists, because each of them is a fact about the engine
and not about the team. A refusal is not a dialog, so the prototype draws the door as the place
named in the sentence and not as a control on it; which of the two is put to the author.

One screenshot more: Settings with the second section, the engine `not installed` in it, and no
door under the word.

### 5. The user's door into an AgentWorkspace is `14`'s as a property, and nobody's as a control

`research/03`'s addendum: `sbx setup ssh` writes a `Host *.sbx` block into the user's own ssh
config with a managed `known_hosts`, and `ssh <name>.sbx` reaches a sandbox through the daemon's
embedded SSH server, no client key to manage, documented for VS Code Remote-SSH. It is **the
user's door and not blobot's**, since blobot drives the bridge over `sbx exec -i`, and the
addendum suggested *open in VS Code* on the `WORKSPACE` line as one line away.

The first draft of this amendment specified it: a control on every agent's tray, `code` on `PATH`
detected, a `VS Code not found` sentence, `sbx setup ssh` offered on the first click, spawned as
`gh` is spawned, and the ssh command on the control's `title`. That was three mistakes in one
section, recorded so the next draft does not repeat them.

- **It is a feature and not a Machine question**, and the map never graduated it. The
  destination is the object, the kinds and the channel; the fog lists whether a Machine has an
  identity on screen and says nothing about a person's way into an AgentWorkspace. A door with
  behaviour — detection, a sentence, a confirm, a spawn — specified inside a prototype ticket is
  a ticket written in the wrong place, and it made this one two prototypes and a feature, which
  is not one session.
- **It put the mechanism in user copy.** `ssh blobot-<team>-<agent>.sbx` on a `title` is the
  engine's host suffix on a pixel the user reads, which the second paragraph of this amendment
  forbids, `01` point 1 forbids, and `CONTEXT.md`'s Machine entry forbids. If the door is ever
  drawn, the control says *open in VS Code* and nothing about the carrier — no command on a
  `title`, no popover — and VS Code's own status bar printing the host is outside blobot's mouth,
  as the browser is.
- **It said `14` did not hold the question, and `14` does.** The first draft counted `14`'s
  outcomes wrong — it split output 6 in two and dropped output 7 — and concluded the door was on
  no ticket. `14` accepted it by name under *What the neighbours have handed here*: *whether a
  Machine kind carries a door for the user beside the mailbox carrier — a path for `local`,
  `ssh <name>.sbx` for `box` … it is the carrier's shape again, and is either on the kind or
  nowhere*, and its output 7 lists *the user's door* among the six delegated questions it answers
  or refuses back. So whether the **kind** carries a door is `14`'s and is not re-asked here.
  What `14` does not hold, and no ticket does, is the **control** that would use it — *open in
  VS Code*, with its detection, its sentence, its confirm and its spawn — which is the feature
  the first bullet describes.

What is left is a note for the author and not a design. Whether the control is wanted at all is a
map question — fog, or a ticket of its own — and the map is not this ticket's to edit. Two things
that ticket would meet are named here so they are not rediscovered. The `sbx setup ssh` confirm
meets the same two rules `08` §2 found meeting over the install: DESIGN.md's install confirm
quotes the command *because it is the sentence being agreed to*, which puts the engine's command
on screen, and a plain-words confirm — *write a block into your ssh config* — keeps the mechanism
unnamed while agreeing to a change in the user's own files without showing it; blobot running the
command unseen is what the rule permits, and the user reading one is its clause. And it is a door
the engine can shut: the addendum reads `checkLoggedIn` beside `startSSHServerIfEnabled` in the
daemon's own symbols — read from the binary and inferred, never documented and never run — and a
sandbox can refuse sftp and port forwarding. Whether a `local` agent would get the same control,
opening its worktree path so the two kinds look alike, is a symmetry preference and not first-demo
14's rule — that rule is about a posture guarantee the user generalises, not a convenience — and
the first draft borrowed the rule for it and should not have. **Not drawn.** The tray in every
screenshot carries what it carries today.

### What the prototype is, and how it is judged

On the mock, with no engine installed, started or signed in: the demo team's roster is handed a
stand-in Machine per agent, one of them `box`, and the cost line is handed the stand-in figures
above, with their sources. Eight screenshots by `--screenshot`, nine if `09` §2 keeps the box row
on screen when the engine is absent, which is how every interface decision here has been judged:
step 02 with the box row at rest, and chosen, and the conditional third with its engine
`not installed`; step 03 with four agents and one overridden; Alice's pane on a box and Bob's on
this computer, each its own `--pane=<agentId>` capture, the header row saying it and the tray
saying nothing; the team pane's `WORKSPACE` block on the mixed team, with `05`'s two absences on
Alice's row as slots; Settings with its second section; and the rail, unchanged, taken to prove
it.

Two prototypes, and the halves have disjoint blockers: the profile conversation waits on `07`,
which waits on `01` and `06`; the Machine half waits on `05` and `09`, both takeable now. One
*Blocked by* line makes the Machine screenshots wait on the DM ticket. If the map splits this
ticket, the split falls between the two numbered items under *What to make*, and nothing in this
amendment crosses it; the map is not this ticket's to edit, so it is said here for the author.

### Priors

ADR-0001, as `01` extended it and did not amend: a Machine is per Agent, which is why it is said
in the agent's pane and per member in the block, never as one word for the team, and why the
roster row and never the profile carries the placement. ADR-0003: the `/` menu on a box is a
palette question and not a screen, taken whole by `13`'s output 10, and nothing drawn here offers
what a person did not author. ADR-0004: attachments cross a box unchanged as embedded bytes, and
no control in this prototype hands an agent a path; the user's door in §5 was refused a `title`
carrying a host for the same reason it was refused the mechanism. First-demo ticket 14's rule —
*a guarantee that holds for Alice and not for Bob is worse than no guarantee* — is why the Machine
is drawn per agent and never folded into one word, and why `WORKSPACE`'s two absences are drawn
apart rather than as `clean`; it is not the reason for a symmetric control on `local`, which §5
says.

### Put to the author

1. Whether *this computer* is ever printed where the kind is a description — the pane's header
   row and the `WORKSPACE` block — or only a box is said. Drawn silent there; the pick row and
   the roster word print it as controls.
2. Whether a chosen roster row prints the resolved Machine on every row (the options-menu rule,
   drawn), or only the exception, with the control reached on hover and `:focus-within` like the
   rail's edit and delete.
3. Whether a box earns a mark anywhere, or stays words. Drawn words only.
4. Whether the disclosure's last sentence stands in the prototype until `09` rewrites it (it
   does), or is left out of the screenshot so it is not judged against a box.
5. Whether the kind may stand on the tray as the one description it carries — an amendment to
   the tray's rule, argued in §3 — or stays in the header row and the tray keeps its rule.
   Drawn in the header row.
6. Whether the control *open in VS Code* is graduated onto the map as fog or as a ticket of its
   own. Not drawn. Whether the kind carries a door at all is `14`'s output 7 and is not asked
   here.
7. Whether the engine's readiness and `01` point 3's registry live in Settings as a second
   section, and whether the refusal's door is the place named in the sentence or a control on it.
   Drawn as a section and a sentence.

### Not this ticket

Every word: whether *sandbox* appears at all, the disclosure once one agent is boxed, whether the
box row is offered when the engine is absent, whose account `needs sign-in` names, the two
folder-step sentences for a copy and for scope, and what the permission block says inside a box
(`09`). `WORKSPACE`'s two new absences, states and sentences both, and what `WORKSPACE` says when
the branch is in a box and the ahead-count is against a fetched branch (`05`, which this ticket is
blocked on because it draws them and `05` says so itself); this ticket places them and words
nothing. The engine's four states and its remedies, and whether a kind with no install door is
acceptable (`08` §2, put to the author there); how `sbx login` is driven, a loop between `08` §2
and `14` item 2 that `09` names. Whether the team starts three of four and what the rail says
while it does (`09` §4). The fifth trust level and where it is offered; if `10` puts it on the
roster row beside the Machine word, this row is redrawn (`10`). What the image holds, what the
first download really weighs, who pulls and how the pull is drawn (`13`). The engine interface,
the box lifecycle, whether the kind carries a door for the user, moving an Agent between Machines,
and the memory a box takes (`14`). A blocked request in the transcript (`15`), and two places `15`
hands here by name that arrive after it resolves — where the egress list is said, if anywhere
(its output 6), and whether the mailbox door is a fact `09` says or a row this ticket draws (its
output 10): this ticket is not blocked on `15`, draws neither, and if it resolves first the places
land here as a comment. The DM's verbs and transcript (`07`), and the home (`06`). The control
that opens an AgentWorkspace in an editor (no ticket; put to the author, 6). What the `/` menu
offers on a box, where ADR-0003's three scopes are not all present (`research/02` §4; `01` point
5's read-only skills mount): a palette question `13`'s output 10 has taken whole, not a screen.
Attachments are unchanged on a box, ADR-0004's bytes crossing the same pipe; the two ceilings
across a network are the map's fog, and no kind here has a network.

## Amendment, 2026-09-05 — split, and four things this ticket now owns

The map split this ticket where the 2026-09-04 amendment said the seam was: between the two
numbered items under *What to make*. **The profile conversation is `18` now**, blocked on `07`,
and takes with it the Question's first paragraph, item 1 of *What to make*, and the two
arrangements it was to compare. **This ticket is the Machine half**, and its *Blocked by* line
reads `05, 09` — both of which it was already reading and neither of which the DM ticket had any
claim on. The title keeps its second clause and is wrong by it now, as `08`'s is by a word; it is
said rather than renamed, because a rename is a map edit. Nothing above this line moves, and where
this amendment overrules a sentence above it, it names the section.

Three decisions taken on `08` the same day change what the 2026-09-04 amendment drew (`08`,
*Decided, 2026-09-05*, and `01`'s amendment to point 1). The engine has an install door after
all — one click, a progress line, never a terminal. One Docker sign-in is the floor, delivered as
onboarding with a button that opens the browser. And Docker is named **once, as an account** —
on the onboarding screen and where a sandbox is offered — and nowhere else, which `CONTEXT.md`'s
Avoid entry now says in those words. So §1's *`not installed` carries a sentence and no door* is
withdrawn, §4's screenshot *no door under the word* is withdrawn with it, and the two paragraphs of
the 2026-09-04 amendment that argued the no-door shape are history: they read the rule as it stood,
and the author moved the rule for this one account. `08` owns the **experience** — the screen, the
buttons, the words, the four facts and their remedies — and `17` (the engine, split from `14` on
`08`'s ownership note) owns the **mechanism**. What is this ticket's is **where each thing sits**,
on `09`'s rule that words are decided there and places here, and four places are decided below.

### 6. The rail is owned here, and the answer is nothing

§3 above decided it — *a request the box refused is not on the rail* — and named `10` §3 as
reading it from here. `10` §3, written after, took *whether* for itself on the grounds that §3 had
*declined* the question, and leaned the same way: nothing. Two owners with one answer is still two
owners, so it is settled here at the map's direction. **The rail is this ticket's**, because it is
a place and `09`'s rule sends a place here, which `09` §3 already reads; `10` §3 reads it from here
from now on, and the sentence in `10` that takes it is `10`'s owner's to strike, not this
ticket's — noted so the next reader of `10` is not sent round the loop §3 already closed once.

The decision, restated with `10`'s case against it answered rather than passed over. A rail row
has two channels, the folded status and the unread mark, and a refused request has a claim on
neither. It is not an activity, so it folds into no `StatusWord` (`09` §3). It is not something
the user did not start, so it earns no unread mark: the mark is earned by origin, a Routine's run
and nothing else. And it is not `waiting`: `waiting` bought the rail's one inversion and the sound
effort's one notification because *silence there loses work nobody chose to lose*, and a refused
request loses nothing — measured on the first engine, the proxy answers a synthesized `403` and the
turn goes on (`research/08` §2). `10`'s case is that at the fifth level the block line is the only
channel a backgrounded box team has left. True, and it is not a reason for a rail channel: what the
user would learn by opening the team is what the transcript already holds, and nothing was waiting
on them while they did not. If a block ever turns out to stop a turn, the sentence is `turn
stopped`'s shape (`09` §3), and a stopped turn folds to `idle` on the rail today, which is
unchanged. Two things this does not touch. A refusal on Claude's **own** fence is a
`session/request_permission` and draws as ticket 14's block with the agent `waiting`
(`research/07` (5)), so it reaches the rail by the inversion it already has; whether inside a box
the proxy's refusal and a fence's are one event or two is `10`'s constraint from `15`, and not a
rail question. And whether a box earns a **mark** stays put to the author (3), drawn none.

### 7. The user's door: *open in VS Code* on the `WORKSPACE` line

§5 above refused to draw *open in VS Code* on three grounds, and `14` refused it back the same day
as *not an output*: a kind carries no second door for the user, and *nothing here takes
`ssh <name>.sbx` onto the kind*. So the control was on no ticket, which is the one outcome §5 asked
the author to end. It ends here: **the control is this ticket's, as a screen affordance and never
a property of the kind.** The map graduated it onto this ticket rather than as fog or as a ticket
of its own, which answers item 6 under *Put to the author*. The three grounds are met one by one.

- *It is a feature and not a Machine question.* It stays one, and it is small: a door on a line
  that already carries a door. `WORKSPACE` is the one place blobot writes to a forge and it shows
  the pull request there; a way into the folder is the same kind of thing — a person's act on the
  work, drawn beside the facts about it. It fits a prototype by being **one control with one
  sentence**, and everything with behaviour behind it is named for `17` below.
- *It put the mechanism in user copy.* The control says **open in VS Code** and nothing else: no
  command on a `title`, no popover, no host. On a `local` agent it opens the worktree path. On a
  box it opens the same folder through VS Code's own Remote-SSH, over the door `sbx setup ssh`
  writes — a `Host *.sbx` block in the user's own ssh config, a managed `known_hosts`, no client
  key to manage, sandboxd's embedded SSH server behind it (`research/03`, *Addendum*). The host
  name VS Code prints in its own status bar is outside blobot's mouth, as the browser page is.
- *`14` holds it.* It does not: `14` refused it back as not an output and holds the mailbox's
  carrier only. What `14`'s refusal fixes is the line this section keeps — the door is not on the
  kind, so `Machine` gains no method for it and a third kind is never asked to have one. The
  renderer is handed it per Agent, `{label, available}` beside the `WORKSPACE` facts, by the rule
  above that the renderer draws words and holds no list of kinds; an Agent whose Machine has no
  such way in is handed nothing and draws nothing.

Placed **per agent and never per team**, on the two surfaces `WORKSPACE` is already drawn on:
under the composer in the agent's pane, at the tail of the `WORKSPACE` line, and on the member's
row in the team pane's block. The tray keeps its rule. A door is what the tray is for, but the
`WORKSPACE` line is where *where the work is* is said, and a door into the work belongs beside
that sentence and not on a strip that says nothing about where. Whether `local` gets the same
control is decided **yes**, and not on first-demo 14's rule, which §5 was right to refuse
borrowing: a `local` AgentWorkspace lives under `~/.local/share/blobot/worktrees/`, outside the
repository the user can see, so a person's way in is no more obvious there than into a box, and a
door drawn only on a box would say the box is the more reachable kind, which is backwards. Same
word, same place, both kinds, and the difference is never on screen.

What runs behind it is `17`'s, named here so it is not rediscovered. `code` on `PATH`, by the
cascade that finds `claude`; absent, the control is drawn with `VS Code not found` under it and
not hidden — *make one for me* was disabled rather than hidden because a door that is not there
teaches nobody it exists. The first click on a box runs `sbx setup ssh` once per machine, unseen,
behind a **plain-words confirm** — *blobot will add a line to your ssh config so VS Code can reach
a sandbox* — which is the shape `08` decided for `sbx login`: a Docker command blobot runs and the
user reads no part of, and a sentence about a change to their own files. It is a door the engine
can shut — sftp and port forwarding a sandbox can refuse, `checkLoggedIn` beside the server in the
daemon's own symbols, read from the binary and never run (`research/03`, *Addendum*) — and what
VS Code says then is VS Code's, not the transcript's and not blobot's. Nothing concludes from an
exit code; the control ends where it began.

### 8. The onboarding screen: where it sits, and what it says

`08` decided the screen: *Set up sandboxes*, which runs Docker's installer behind a progress
line, and *Sign in to Docker*, which runs `sbx login` and lets it open the browser on its own; no
command shown, no keystroke read, the pty as mechanism and never as experience. Three places were
candidates: first launch, the folder step's first offer of a box, and Settings' machine section.

**Not first launch.** The standing preference reads *install the app, use it, create an agent,
done*, and every team is `local` until somebody picks otherwise. A screen at first launch that
names Docker puts the one account the app ever asks for in front of a person who came to form a
team of two agents on this computer and may never want a box; *no cloud dependencies* means the
app runs with no account, and a first launch that mentions one is the sentence saying otherwise.
Invisible means not met until it is needed.

**So it lives in one place and is reached from two doors.** The first is the **folder step's box
row, on first offer**: picking *a sandbox on this computer* while the engine is not `ready` opens
the onboarding over the flow. It is a **dialog**, because the flow is what is being onboarded
into and a screen over the working surface would drop a half-formed team — the Handbook's shape,
for the Handbook's reason. The pick stays on *this computer* until the dialog ends on `ready`, so
a person who closes it has what every team has always got and has agreed to nothing. This answers
by placement the question `09` §2 held about an absent engine: the row is drawn with its state
when the engine is absent, because a row that is the door to setting the kind up has to be on
screen to be one. The second door is **Settings' machine section**, §4's second section, where
the two buttons sit as rows under the engine's state — because a running team's refusal points
there (§4), and because a person who set the box up last month and has since signed out of the
account finds the way back where the machine is. Never on a rail row and never a card in a pane:
the engine is one fact for the app and not one Agent's (`08` §1, *two subjects*).

**What it says**, as stand-ins in the slots the place gives them, `09` §2's words to hold or
replace, with the account named as `01`'s amendment allows. A title, *A sandbox on this
computer*. One paragraph: *An agent in a sandbox works in its own small machine on this computer,
with its own copy of the folder and its own sign-in. Setting it up needs a Docker account, which is
not blobot's, and a sign-in in your browser, once.* Then the two buttons in the order they are
paid, each with the engine's word under it in ticket 11's four words. **Set up sandboxes**, with
`not installed` under it before, and the download's figure while it runs — `downloading · 412 MB
of 574 MB`, no bar, DESIGN.md's rule for a download. **Sign in to Docker**, with `needs sign-in`
under it and *opens your browser* as its muted line. Each ends on detection asked again in the same
four words, because nothing concludes from an exit code, and the dialog ends when the engine reads
`ready` — with `ready` printed, never the dialog vanishing on its own. Two sentences are not on it,
and that is said: the licence, which `09` §2 places or refuses, and the daemon's own reporting
home, which `09` §2 decides with the account sentence. Whether the paragraph names the account and
the button names it again, or the button is the one appearance, is a count `09` §2 owns; the
stand-in prints both and expects to lose one.

### 9. The sign-in card above the composer, for an agent that is not signed in

`08`'s door, decided there: the first turn of an unsigned agent does not fail into a terminal; the
pane carries a card above the composer, *this agent needs to sign in to Claude, once*, and the turn
resumes when the sign-in is done. `08` left one thing to draw here — whether the card is the only
door, or the folder step also offers the sign-in before the first turn.

**The card is the only door, and it is in the agent's pane and nowhere else.** The folder step
cannot offer it: a data volume exists once the Agent has a box, and the box comes to exist when the
team is formed, so at step 02 there is nothing to sign in to (`08` §2, *when the remedy is
reachable*). Settings cannot hold it: the engine is one fact for the app and the login inside is
one Agent's, and a per-Agent remedy in a section about the machine would be a row per agent per
team behind the settings door. The Handbook's precedent is exact — a fact about one agent that a
person acts on is met in that agent's pane, above the composer, in the notice card's shape:
`--raised` ground, a `--line` hairline, 12px radius, the control at `margin-left:auto`, no icon,
the composer's own width — and **one card at a time**. An agent that is both unsigned and
unbriefed gets the sign-in card, because briefing is a turn and a turn needs a signed-in CLI; the
brief card returns when the sign-in is done.

What it says: `Alice needs to sign in to Claude Code, once`, the runtime named as the hire dialog
already names it and never the mechanism, and a muted line, `in her sandbox · opens your
browser`. The control is **sign in**, pushed right. What runs behind it is `17`'s: tier 1 if `16`
measures that it holds for blobot's image — one browser round-trip per machine and runtime, no
token ever in a box — and tier 2 otherwise, the vendor's own login inside over the transport, the
pty kept out of sight the way `08` kept it out of `sbx login`. Which tier is never on the card,
because a person is asked for the same thing either way. A message sent while the card is up is
**neither lost nor a turn**: it goes to the Agent's mailbox, which already delivers what it holds
when the Agent is next free, and the card's muted line says `your message is waiting` while it
holds one — put to the author below, against disabling the composer. What the launch does with a
signed-out CLI stays each adapter's own sentence (`08` §2's table), unchanged and not refused.

In the team pane the same fact is a **segment on the member's row of `WORKSPACE`**,
`needs sign-in`, where per-member facts are allowed, and nothing under the team composer, which
would be false about the other members. The rail carries nothing, on §6's grounds: nobody started
anything, and the mailbox holds what was sent. If tier 1 holds, one more thing is true and is
placed now so `16`'s answer has somewhere to land: the sign-in is per machine and runtime, so the
second Claude agent on any team meets no card, and Settings' machine section lists the runtimes
signed in for sandboxes as rows under the engine's — a fact about the machine, which is that
section's subject.

### 10. The folder step's row: four figures, and memory is the one that recurs

§1 drew three figures on the box row, in the order they are paid: the engine's state, disk per
agent, the first download. Four now, and two of the stand-ins are checked against a measurement.

- **The engine's state**, in the four words. `needs sign-in` may say whose — `needs sign-in ·
  a Docker account` — because the row is *where a sandbox is offered*, the second of the two
  places `01`'s amendment allows. `not installed` carries a door now, §8's, and §1's
  sentence-and-no-door shape is withdrawn.
- **The first download**: `research/08` §4 measured the engine's own templates — 586 MB for
  `shell`, 937 MB for the `claude` kit, a 1.96 GB snapshot of a box after one `npm install` — so
  *about 600 MB* stays the stand-in for an image blobot has not yet built and `13` owns, and a
  figure that knows its end while it runs.
- **Disk, per agent**: `up to 4 GB` stands. `research/08` §4 saw the engine's data directory go
  from 2.1 GB to 3.3 GB across one box's `npm install`, so the order of magnitude is right and the
  figure is `13`'s.
- **Memory, per agent, while it runs** — the figure that was missing, and the only one that
  recurs: `about 1 to 2 GB of memory while it runs, per agent`. `research/08` §4: a `shell` box
  holds 782 to 968 MB of host RAM running, a `claude` box 1.50 to 1.68 GB after `npm install` and
  `session/new`, and a stopped box holds none — the shim process is gone, and a box stops itself
  30 s after its last session. The row says *while it runs* because of that last fact, and *per
  agent* because a box is per Agent, so a four-agent team is four of them at once during a turn
  on all four. `17` gives the figure for blobot's own image; the row is handed it and prints it.

The order on the row: state, download, disk, memory — once; once per agent; standing per agent;
per agent while running — so the recurring cost is read last. Chosen, the fold is unchanged. Four
lines under a pick row is the most any row in the app carries, and it is this row's job to say
what the pick costs before the pick, which is `01` point 6's *with its cost beside it*.

### What the prototype is now, and how it is judged

The profile-conversation screenshots go to `18`. What stays, with the additions: step 02 with the
four figures at rest, and chosen; the same step with the engine `not installed` and the onboarding
dialog open over it, and again after *Set up sandboxes* at `needs sign-in`; step 03 with four
agents and one overridden; Alice's pane on a box with the sign-in card above the composer and
*open in VS Code* at the tail of its `WORKSPACE` line, and Bob's pane on this computer with the
same control and no card, each its own `--pane=<agentId>` capture; the team pane's `WORKSPACE`
block on the mixed team, with `05`'s two absences as slots and Alice's `needs sign-in` segment;
Settings with its machine section, the two rows under the engine's word; and the rail, unchanged,
taken to prove it. Eleven, on the mock, with no engine installed, started or signed in.

### Priors, added

ADR-0001, as `01` extended it: the login inside is the data volume's and the data volume is per
Agent (point 4), which is why the card is in one agent's pane and never a team's. ADR-0003: what
an agent in a box inherits as *user* scope is the data volume's and not this computer's, so a host
sign-in vouches for nothing inside (`08` §1) — the card exists because of that. ADR-0004: §7 hands
no agent a path; VS Code opens what the user already owns, and the ssh config change is the user's
own file, agreed to in words and never shown as a command. First-demo ticket 14's asymmetry rule:
a card saying *needs sign-in* for Alice on a box and nothing for Bob on `local` is not the refused
shape, because the fact differs and not the guarantee; and §7's symmetric control is not that
rule's either, which §5 said and this amendment keeps.

### Put to the author, revised

Items 1 to 5 stand as they are. Item 6 is answered: the control is graduated onto this ticket, and
drawn. Item 7 stands and the section gains the two rows §8 puts under the engine's word. Three
more:

8. Whether the onboarding paragraph names the account and the button names it again, or the
   button is the one appearance. Drawn with both; `09` §2 counts.
9. Whether a message sent while the sign-in card is up goes to the mailbox and the card says so,
   or the composer is disabled with the card as its reason. Drawn as the mailbox.
10. Whether *open in VS Code* is drawn on `local` as well as on a box (drawn on both), and whether
    a first-click confirm is wanted for the change to `~/.ssh/config` at all, or `17` runs
    `sbx setup ssh` at engine setup with the onboarding's own agreement covering it. Drawn as a
    confirm on the first click.

### Not this ticket, revised

The mechanism behind every button and control above: how the installer and `sbx login` run with
no terminal, whether the daemon is started, how `sbx setup ssh` and VS Code's remote open are
run, and the memory figure for blobot's own image (`17`). The words: the account sentence and how
many times the account is named, the licence, the daemon's reporting, the sentence under each of
the four states (`09` §2); whether the team starts three of four and what a refused member's row
says (`09` §4). The four facts, their remedies, the refusal by name, caching, and which tier the
sign-in inside is (`08`); whether tier 1 holds for blobot's image (`16`). What the image holds and
what the first download really weighs (`13`). Whether the proxy's refusal and a fence's inside a
box are one event or two (`10`, from `15`). The profile conversation, the pane or dialog it draws
in, and everything the Question's first paragraph asked (`18`).

## Corrections, 2026-09-05 (consistency pass)

- **§8 and Settings.** Naming the account in Settings' machine section is allowed: `01`'s
  amendment to point 1 now lists three places — onboarding, the folder step, Settings — and
  `CONTEXT.md` says so. Whether the row is drawn when the engine is absent stays `09` §2's, as this
  ticket's 2026-09-04 text already sent it; §8 draws `09`'s answer.
- **§7, the user's door.** `sbx setup ssh` is the subcommand that writes an ssh config block and is
  fine; bare `sbx setup` imports API keys and stays refused (`08`, `17`). VS Code's Remote-SSH
  installs its server into the remote home — the data volume — and downloads it from Microsoft's
  update hosts, which are on no list `15` has; under deny-all the door opens onto a VS Code that
  cannot connect. So the door is **not in the first build** unless `15` admits those hosts and `05`
  accepts that write; §7 holds it as an offer with that price, and `09` §7 reads it.
- **§6, the 403**: `research/08` §2 measured the synthesized 403 with `curl` at zero tokens; no turn
  ran. Say *measured on the proxy*, not *the turn goes on*.
- §7's *first click confirm* cites a shape `08` replaced; `08`'s *Decided* is a button that opens
  the browser, and that is the shape.
