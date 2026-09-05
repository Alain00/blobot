Type: grilling
Status: open
Blocked by: none

# Where a Workspace lives when the Machine is not this one

## Question

**Machine and Workspace are orthogonal axes and they fight.** An AgentWorkspace is a git worktree
of the user's own repository, on `blobot/<team>/<agent>`, under
`~/.local/share/blobot/worktrees/`. That construction assumes one filesystem. Off it, a worktree
of a local repository cannot exist on a remote box without one of:

- **A mount.** The remote box sees the user's disk. Keeps `git worktree list` true, keeps the
  branch where the user expects it, and makes every file operation an operation over a network,
  which is where a coding agent spends most of its time.
- **A clone.** The branch lives over there. The user's own `git worktree list` cannot see it,
  `WORKSPACE`'s ahead-count is measuring a different repository, and *publish* now has two hops
  rather than one. Something has to bring the work home, and that something is a push to a forge
  or a fetch from the remote — which crosses **"a pull request is the user's action"**.
- **A refusal.** Some Machine kinds do not take a `git` Workspace at all, and the flow says so
  where the Machine is chosen, the way the folder step already says a copy has no branch, no
  diff and no recovery.

## What to decide

- **Which of the three, per Machine kind.** The answer will not be the same for a container on
  this machine (which can bind-mount, and where the srt probe already measured that writes
  inside the workspace work and writes outside do not) as for a box across a network.
- **What happens to `nested` and `plain`.** A `plain` Workspace is already a copy per agent, so
  it is the kind that travels most easily and produces the least. A `nested` Workspace is a
  folder of repositories, of which the user picked some.
- **What `WORKSPACE` says when it cannot see the work.** *No pull request* and *we could not
  look* are already separate states in the type and never draw the same. This adds a third shape
  and it must not collapse into either.
- **What the launch reconcile does.** Today: repair a missing directory, report a missing
  branch. A Machine that is unreachable is a fourth outcome, and the ordinary reason to be
  unreachable is that a laptop is shut.
- **Whether purge still works.** Deleting a team removes every AgentWorkspace *before*
  tombstoning the rows, and the full clean is priced first with a measured figure. Both of those
  reach across the boundary now, and `measure` over a network is a figure that may not arrive.

## The thing this ticket is really protecting

The work product is a **branch in the user's repository**, and that is the whole reason blobot's
grain is the team rather than the bot. A Machine design that makes the branch hard to get back is
a Machine design that has traded away the product to gain the ergonomics. If none of the three
answers is acceptable for a kind, that kind does not ship — which is an answer.

## Amendment, 2026-09-04 — this computer only

Unblocked by ticket `01`'s answer, and narrowed with the map: the kinds are `local` and `box`, a
microVM on this computer, and `remote` is out of scope. The title stays as it is and is now wrong by
one word, the way `08` said of its own: a boxed agent's Machine is *a sandbox on this computer*
(`01` point 1), and its Workspace is inside that sandbox, on this computer's disk. Three of `01`'s
eight decisions land on this ticket directly. Point 4: one instance per Agent with two volumes, and
the *workspace* volume "holds the AgentWorkspace as a clone, brought home by fetch". Point 5: the
closed list of what a box gets, which includes the operator's `~/.claude/skills` read-only and
excludes the host home — and, read literally, excludes the user's repository, which is not on it.
Point 7: one image, many engines, `sbx` first, Apple `container` second, with "`--clone` and
ssh-agent forwarding already built" named as one of the four reasons `sbx` is first — one reason
with two halves, and this ticket spends both, in questions 6 and 1.

So the three-way choice above — mount, clone, refusal — is not this ticket's to make any more for
the one kind in scope: **`box` is a clone**. The first engine ships a shape for one: `sbx create
--clone` runs the agent "on a private in-container clone of the host Git repository (mounted
read-only) instead of bind-mounting the workspace; the agent's commits are accessible via the
`sandbox-<name>` git remote on the host" (`research/03`, *Addendum*), and it has been run on this
Mac since (`research/08` §3): the clone sits inside at the repository's own absolute path with
`origin` the read-only mount at `/run/sandbox/source`, a git daemon in the guest is published on a
host loopback port, and `git fetch sandbox-<name>` brings a branch committed inside home in 38 ms
under `refs/remotes/sandbox-<name>/…` and `refs/sandboxes/<name>/…`, with the host's own
`refs/heads` untouched. Whether blobot uses that shape or makes the clone itself is question 6,
because that shape is defined by a mount of the user's checkout and `01` point 5 has no such mount
on it. What is left to decide is what the clone **costs on this computer**, and what the screen has
to say once the work is not on the filesystem the user is looking at. Six items: five to decide, and
one — the third mount — recorded as given, with the one sentence about it that is not.

The mount deserves one sentence on its way out, because the reason above for refusing it was the
network hop and on this computer there is no network hop. It is refused anyway. One fact is
measured: a worktree mounted alone has no git, because its `.git` points into the main repository's
`.git/worktrees/`, and the first engine refuses clone mode from any worktree but the main one, with
or without the repository beside it (`research/03` (c) read it; `research/08` §3 ran it, twice). The
rest is this ticket's own inference from how git works, and is in no research file: a commit made in
a worktree writes its objects and its ref into the main repository's `.git`, so for the agent to
commit the mount would have to bring the user's whole repository in **read-write**. The first engine
supports that refusal by a different route — the primary workspace is mounted read-write
(`research/02` §4; measured `rw` at the host's own path, `research/08` §2) and every extra workspace
is read-only (`research/03`, *Addendum*; `research/06`, the table) — so the writable repository
would have to be *the* workspace, the user's checkout itself. A box that can write the user's
checkout is not a box. `01` point 5's list has no host home on it for the same reason.

**Blocked by nothing, on purpose.** Every question here closes on paper, on a principle. Part of
what `16` was to measure has already run, as `research/08`, and is cited where it lands —
`--clone`'s refusal from a worktree, where its fetch lands and what it keeps on `rm`, what a stopped
box costs — and none of it moved a shape. What `16` still owes this ticket is one comparison, and it
has taken it as item 2 re-aimed in its own amendment: the item as written measured `--clone` *with*
its read-only mount, which is the shape question 6 refuses, and what this ticket needs beside it is
a clone populated on the host into the workspace volume and a fetch home from it — the branch's name
after the fetch in both shapes, what the narrow clone cost, and what the read-only mount let a shell
read. That lands here as a comment and moves a figure, never a shape.

**Sizing.** At the top of the one-session range, and the spine is severable from the rest. The spine
is questions 6, 1 and 3 in that order — the clone, the fetch, and the reconcile the host branch
keeps honest — and is one session on its own. Questions 2, 4 and 5 each stand on a principle already
given and close in a paragraph; a resolver who runs out of room resolves the spine and leaves those
three for a second session, and what waits on them by name is small: `09`'s two folder-step
sentences (question 2), `14`'s half of the *unknown* (question 4), and `13`'s output 9 (question 5).

### What to decide

**1. The clone, the fetch, and what `WORKSPACE` then says.** The workspace volume holds a clone of
the user's repository; `blobot/<team>/<agent>` is made inside it, as it is made in a worktree today;
and blobot **fetches** that branch from the box as turns finish, at the moment `workspace/status.ts`
re-reads local git today, over the transport `14` builds. The first engine's `sandbox-<name>` remote
is one candidate for that transport, measured in `research/08` §3, and a git remote helper or a
bundle over the engine's exec is another; neither name appears anywhere a user reads.

Three sentences meet here, and three tickets have been writing them, so each is given one owner.
**(i) The branch comes home by a fetch and never by a push** — this ticket's, because it is the
Workspace's shape. A fetch is blobot's act on the user's own machine, reading a volume on this
computer through the engine and never a forge, so it needs no credential; a push would be the
agent's act, and nothing here changes what it meets today: `git push` and `git remote` prompt at
every attended level, and *a pull request is the user's action* is about who acts, not about where
the bytes go, so a remote that is a box on the same laptop earns no exception. Whether a deny on the
verb survives the fifth level is `10`'s, and that sentence does not decide it. **(ii) What a push
from inside meets** — `15`'s outcome 3, to which this ticket contributes the one fact that is the
Workspace's to state: **nothing blobot puts in either volume is a push credential.** The data volume
holds the CLI's own login and nothing else (`01` point 4), and the user's `gh` login is not on point
5's list. That is a fact about the volumes and not about the box, and a box has more in it than its
volumes: the first engine forwards the host's ssh agent by default —
`SSH_AUTH_SOCK=/run/ssh-agent.sock`, a socket carried to the gateway (`research/08` §2;
`research/03`, *Addendum*, reads it as the engine's design) — which is no key inside but a signing
socket behind the gateway, and is wider than point 5's list; and the proxy can hold a token and
inject it (`research/02` §2, srt's credential masking; `research/06`, *Network and credentials*, the engine's `sbx secret set`). So the sentence `10` §5 reads from here is not *no
credential*. It is *no credential in the volumes, and a socket the engine forwards that blobot's kit
turns off*: the kit is `14`'s, and it turns the forward off to stay true to point 5's list until
`01` reopens that point and adds the socket — `01`'s to do, `15`'s to say whether the list would
need it, and never this ticket's to take. **(iii) What carries *a pull request is the user's* on a
box at the fifth level** — `10` §5's. And the fetch as a rule for the egress list — the host's act,
inward, never a box's egress, a fixed entry rather than a host if a transport ever crossed the proxy
— is `15`'s outcome 4, written there and not restated here.

Then the thing the original question worried about — that a clone makes *the branch is in your
repository* false — turns on one decision: **where the fetch lands.**

- *(a)* Into `refs/heads/blobot/<team>/<agent>` in the user's repository, fast-forward only. The
  branch is then literally in the user's repository after every turn: `git log` sees it, `git
  branch` lists it, `publish.ts` pushes it from the host with the same two commands and the same one
  hop, and the `-d`-versus-`-D` rule on deleting an agent carries unchanged because the ref it
  protects is still on the host. What is no longer true is narrower than the question feared: the
  branch is **checked out nowhere on this computer**, so `git worktree list` does not show it, and a
  person who runs that command to find Alice's work finds nothing. A history the agent rewrote
  inside — a non-fast-forward — is **reported and never forced**, in the same voice as `lost`,
  because a force-update is a silent loss of what the host held.
- *(b)* Into `refs/remotes/<box>/…` only, with the local branch made at publish. This is what the
  first engine's own remote does, measured: two refspecs, `refs/remotes/sandbox-<name>/*` and
  `refs/sandboxes/<name>/*`, and `refs/heads` never moved (`research/08` §3). Cheaper to write and
  wrong for the same reason `--clone`'s docs stop at the remote: it makes *in your repository* true
  only once the user publishes, and a box that is gone before that has taken the work with it — the
  engine says the same thing in its own voice, warning on `rm` that commits are lost unless
  preserved first. The lean is *(a)*, and the sentence stays literally true.

`WORKSPACE`'s figures then split, and they must not be drawn as one. `ahead` is computed today in
the worktree against the Workspace repository's current branch; under *(a)* the same count runs in
the user's repository against the fetched branch and means the same thing, at most one turn stale,
which is what it is today. `changed` and `churn` — the paths with uncommitted work, and the same
work in lines, which `status.ts` calls *the figure a person decides on* — are figures that **live
only inside the box**. Decide whether blobot asks the box for them as turns finish (one more exec
per turn, and the engine's cost) or `WORKSPACE` on a box says `3 ahead` and nothing about loose
files. The second is cheaper and it is the failure the first demo was built to catch: an agent that
edits for four turns and never commits would draw as if nothing had happened, and a `WORKSPACE` that
means *committed and loose* for Alice on `local` and *committed* for Bob on a `box` is first-demo
ticket 14's refused shape — *a guarantee that holds for Alice and not for Bob is worse than no
guarantee*. So the lean is: asked of the box, and where the box cannot be asked the figure is
**absent and said**, never `clean`. That gives the original question's "third shape" its real name.
It is not *cannot see the work*: blobot sees the commits and cannot see the working tree, and *we
could not fetch* is a fact about the branch that must not borrow the forge's *we could not look*
(`asked: false`), which is a fact about `gh`. Two new absences in the type, drawn apart from each
other and from *no pull request*. **Their states and the sentence each draws are this ticket's;
where each draws, tray or activity block, is `12`'s.** That is `09`'s division — it sent *what
`WORKSPACE` says of a clone brought home by fetch* here by name, and its own rule is that it decides
words and `12` decides places. `12` drew its first stand-ins on an earlier line of this section
that read *the words are `12`'s*; that line is withdrawn here by name, and `12` has taken the
withdrawal — its section and its *Not this ticket* now read *states and sentences both* from here,
and it places them and words nothing. `12`, blocked on this ticket, reads the sentences from here
before it draws them.

**2. `nested` and `plain` in a box.** A `plain` Workspace is a copy into the workspace volume: no
branch, no diff, no recovery, and the folder step already says so — its sentence is `their own copy`
where a git Workspace's is `their own copy, on their own branch`, and `WORKSPACE` already draws `a
copy · no branch, no recovery`. Nothing is fetched because there is nothing to fetch; a box makes
the weakest sentence in the app no weaker, and only moves the copy off the disk the user can open,
which is a sentence for `09` and a place for `12`. `nested` is the one that costs: today it is a
mirrored tree of worktrees for the repositories in scope, one branch each. Decide whether in a box
it is **N clones in one volume, N fetches home**, keeping a `blobot/<team>/<agent>` in every
in-scope repository, or a copy of the folder that loses the branch on all of them. The lean is N
clones, each made the narrow way question 6 leans, because scope exists so that each repository gets
its branch, and a `nested` Workspace that becomes a copy on a box is a kind demoted by its Machine
without anybody choosing it. The price — a fetch per repository per turn — is the price of having
picked N repositories, and is a fact for `09` to place in the folder step, where scope is chosen.

**3. The launch reconcile.** Today `ReconcileOutcome` is `ok`, `absent` (never provisioned),
`repaired` (directory gone, branch intact: recreate) and `lost` (branch gone: say so), and the rule
is *repair the lossless case, report the lossy one*. A box has three parts where a worktree had two,
plus the host branch from question 1. The table below is for `git` and `nested`, where that host
branch is what keeps it honest — it is the thing that lets a caller tell *new agent* from *the work
is gone*, which is the confusion the `absent` state exists to prevent. A `plain` Workspace has no
host branch, in a box or out of one, and keeps telling new from gone the way it does today: by the
provisioned marker (`copied-directory.ts`, `reconcile`), so a copy whose workspace volume is gone is
`lost` and never `absent`.

- **Box gone, both volumes present** → `repaired`. A box is an engine object made from the image and
  two volumes, and remaking it loses nothing; this is the missing directory of `01`'s point 8 (iii),
  *sleep is stop-and-keep-volumes*, seen from the other end.
- **Workspace volume gone, host branch present** → **reported, never repaired silently**. It is not
  today's `lost`: the fetched commits are on the host, and only what was loose or unfetched is gone.
  Decide whether this is `lost` with a `detail` naming what survives, or a new outcome that says so
  **and offers** to clone again from `blobot/<team>/<agent>` at its last fetched commit — recovering
  with a named loss rather than none. The lean is the new outcome, because *the work is gone* would
  be false and `repaired` would be a lie about the loose files.
- **Data volume gone** → the CLI's login and state are gone; the reconcile reports it and the way
  out is `08`'s.
- **Nothing in the engine, host branch present** → the workspace-volume case above. **Nothing in the
  engine and no host branch** → `absent`.
- **The engine itself absent or stopped** is not a reconcile outcome, and a stopped *box* is not
  even a case: it restarts on the next exec in about a second (`research/08` §4). On this computer
  the ordinary reason a Machine is unreachable is not a shut laptop but an engine that is not
  running or was uninstalled, and that is refused by name at launch the way a runtime that is
  `not_installed` already is. What detection hands that refusal is `08` §3's, its sentence is `09`
  §4's, and the readiness it reads — whether it asks the engine fresh — is `14`'s, which has
  accepted it by name.

**4. Purge and measure.** `remove` today deletes the worktree and the branch only if merged,
reporting `kept` otherwise; `purge` is a second method and never a flag, so no caller reaches the
unrecoverable version by passing the wrong boolean. On a box: **`purge` is the box plus both volumes
plus the host branch with `-D`**, and `remove` is the box plus both volumes with the host branch
under the `-d` rule — one last fetch first, so `kept` means what it says. The image is neither: it
is shared by every agent on that runtime and is `13`'s to price and delete. Three things to decide.
First, the figure: today `measure` prices one directory per agent (`recovers about 3.1 GB · alice
2.9 GB · bob 180 MB`); a box's price is two volumes with different ceilings — the workspace volume
is one branch's history under question 6, N of them for `nested`, and the data volume is a login and
a cache — and whether the line names them apart (`alice 2.9 GB · 180 MB of it login and state`) or
folds them, given that the data volume is the part `08` might one day seed from a template. Second,
the failure: `measure` today is "never a refusal: a workspace that is gone measures 0", and a volume
that cannot be measured because the engine is stopped is **not 0**. Decide whether `measure` gains
an *unknown* that the purge tick is disabled on until the engine answers, or the dialog refuses to
offer the full clean at all while the engine is down. The lean is the first: a figure that cannot be
had is said, and a tick that could delete 3 GB priced at nothing is the number lying. **This ticket
owns the figure's shape on the purge line and what the full-clean dialog does with an *unknown*.**
What a stopped box costs is measured — the shim process is gone and the two volumes stay on disk
(`research/08` §4) — and is `14`'s to carry; whether *unknown* is the interface's own answer or a
caller's inference from a stopped engine is `14`'s, which has taken it by name **and built on the
lean**: `14` reads *`measure` gains an unknown* as this ticket's ask, so the lean is load-bearing,
and a resolver who picks the second option moves `14`'s premise and says so on `14`. So the figure
is decided once, here, and its mechanism once, there, and neither ticket decides the other's half.
Third, `remove` when the last fetch cannot happen. A stopped box is not that case, since it restarts
on exec; an engine that is absent is, and then blobot reaches neither the box nor its volumes
through the engine, only the host branch. Today `remove` is lossless for committed work — unmerged
commits stay on the branch (`git-worktrees.ts`, `removeWorktree`) — and on a box an unfetched commit
in a volume blobot cannot reach is the lossy case this ticket's own rule says must be reported,
while *a workspace it cannot reach is not a refusal* says it must not block, because the ordinary
reason to delete a team is that what it stood on is gone. Decide whether `remove` proceeds — the
host branch under the `-d` rule, the rows tombstoned, and `kept` naming what did not come home and
where it still is — or refuses until the engine answers. The lean is to proceed and report: a
refusal here is a team that can never be deleted.

**5. The third mount is given, and one sentence about it is not.** `01` point 5 mounts the
operator's `~/.claude/skills` read-only and nothing else of the operator's, so what crosses is
settled and not this ticket's: the palette's allowlist is built from the workspace's `.claude/` and
the operator's `~/.claude/skills`, the first travels in the clone and the second is the mount, and
read-only is what keeps the mount from becoming the path by which one agent's turn widens what the
next may do — the hazard `/allowlist` was refused for on fx. Where it lands is `13`'s per runtime,
as is why it is never baked in: the CLI inside reads `~/.claude/skills` relative to its own home,
which is the data volume's, and the research says where the first engine puts the *primary*
workspace — at the same absolute path as on the host (`research/02` §4; `research/03` (c) quotes the
docs, `research/08` §2 measured it) — and nothing about where an extra read-only one lands, so that
is unread and not to be assumed. One half of it has been read since: the engine's own Claude kit
lands its skills mount at `/home/agent/.claude/skills` (`research/08` §5), which is where that one
CLI looks and says nothing about the other four. The one thing this ticket says about it is
first-demo ticket 14's rule: it must land where **every** runtime that reads it looks — fx warns
about `~/.claude/skills` in its own diagnostics, Cursor loads the user's skills — or it is offered
on none.

The sentence that is not given: `01` point 5 says the mount is what keeps *ADR-0003 true*, and that
is true of skills and overstated of the scope. ADR-0003's amended decision loads `user`, `project`
and `local`, and says in its own words that `user` restores the operator's global CLAUDE.md,
settings and hooks for every agent. On `local` it does. In a box the user scope is the data volume's
— blobot's, per agent — and none of those three cross. Nor should the second: `settings.json` is the
file whose `sandbox.enabled` is an any-scope key and whose array keys, `excludedCommands` and
`allowRead` among them, merge across every scope a session loads (`research/04`, Claude Code), and a
merging file is exactly what must not cross a boundary that was built to be one. The lean is
**skills only, said** — the saying being `09`'s, in the folder step. But the lean is a narrowing of
ADR-0003's amended decision, and a Workspace ticket does not amend an ADR in passing: it is **raised
here and written elsewhere**, as a second amendment at ADR-0003's foot and a comment on `01` point 5
correcting *stays true* to *stays true of skills*. `13` is the ticket that meets it — its output 9
owns where the mount lands and its output 10 already reasons from the user scope's own commands
being absent on a box — so it is handed there by name. Seeding the data volume from the operator's
files instead is the map's *seeding the data volume from a template* fog and belongs to nobody yet.
What the disclosure's third paragraph — *whatever tools your own MCP servers provide* — may still
claim is `09` §1's.

**6. The host repository is not visible inside.** `sbx --clone` mounts the host repository
**read-only** and clones from it inside — measured: `origin` is the mount, at `/run/sandbox/source`
(`research/08` §3). The alternative is that blobot makes the clone **on the host, into the workspace
volume, before the box starts**, so the box sees no host checkout at all. The mount is convenient
and it is a read hole of the exact class ADR-0004 refuses: `Read`, `Glob` and `Grep` never prompt,
so a path handed to an agent is an ungated read outside its AgentWorkspace — and the user's checkout
is not the repository. It holds every gitignored file, `.env` among them, the reflog and the
stashes, and a clone carries none of those whatever it is made of.

So what is **given** is the principle and not the plumbing: **the box sees no host checkout**, which
is `01` point 5 read literally — the list is closed and the user's repository is not on it — and a
resolver has nothing to decide about that. What the resolver decides is **what the clone carries**,
and it has to be said because it sizes the volume. A plain clone brings every branch as a
remote-tracking ref with its objects, sibling agents' `blobot/<team>/*` included — which is not a
leak the current shape refuses, since a worktree sees every sibling branch through the shared `.git`
today. The lean is a clone made **narrow**: one branch, the one `HEAD` is on when the team is
formed, at its current commit — the base an AgentWorkspace is branched from today — with
`--single-branch` and `--no-tags`. The workspace volume is then the size of one branch's history,
and `nested` is N of those; that is question 4's figure. `16` item 2 measures that lean and not a
settled shape: a resolver who finds an agent needs more than one branch's history inside — the base
branch to rebase on, a tag a version script reads — widens the clone and says what the volume then
costs. Two flags do not move with it, because they are ADR-0004's and not a size: never `--shared`
or `--reference`, since an alternates file is a host path written into a box. Three more things push
toward the host-made clone: `01` point 7 is *one image, many engines* and `--clone` is one engine's
feature, where a volume populated on the host is any engine's; a clone made by blobot is the same
mechanism for `git`, `nested` and `plain`, one path into a volume for three kinds; and it removes
the *same absolute path as on the host* coupling, which is a host path written into a box.

What it costs is on `01` point 7, and is said rather than worked around. "`--clone` and ssh-agent
forwarding already built" is one of the four reasons `sbx` is first, and both halves of it are spent
here: `--clone` is defined by the mount — measured, `origin` *is* the mount — so unless `14` finds
the engine's remote can be had without it, `--clone` is not used and blobot brings the branch home
over a transport `14` builds and `16` measures; and the forwarding is the socket question 1 has the
kit turn off. That takes one whole reason from point 7 and leaves `sbx` first standing on the other
three; it is carried to `01` as **one comment naming both halves**, and not as a reopen, because the
principle *agrees* with point 5 and only a reason is touched. What this ticket does **not** do is
keep the mount as a fallback. A read-only mount of the user's checkout would be an addition to point
5's closed list, and adding to that list is `01`'s to do, never this ticket's to take conditionally
and price on `09`. If a resolver finds the first engine cannot be used without it, the move is to
reopen `01` point 5 and say so there; until then a `box` that cannot have its clone is a `box` that
does not start, in `09` §4's shape, and never a mount.

### What this ticket is really protecting, restated

Unchanged: the work product is a branch in the user's repository. Question 1 *(a)* is what makes
that true of a box after every turn rather than after every publish, and it is the reason the branch
on the host is the load-bearing thing in questions 3 and 4 — the ref that tells *new* from *gone*,
and the ref `-d` protects. It also happens to be what makes a Machine change survivable: an agent
moved from a box to this computer has a branch to make a worktree from. Whether that move is offered
is `14`'s, which has taken it by name with a lean to refuse on this map — a move is a new box or a
new worktree from the fetched branch and a restart, the roster edit's shape — and `12` points here
for it and finds it there.

### Priors

ADR-0001, as `01` extended it and did not amend: a box is per pair and joins the list of what a
working agent does not share, and a *host* was never on that list. Question 1 *(a)* lands every
agent's fetched branch in the one user repository, and question 6 says a clone made wide would see
its siblings' branches. Neither is the shared directory ticket 10 refused: what is shared today
through a worktree's `.git`, and under *(a)* through the host repository the fetch lands in, is an
object store and its refs and never a working tree, and no two agents ever write the same one.
ADR-0003: the scope narrowing is raised in question 5 and decided nowhere here. ADR-0004: the mount
refused in question 6 is that ADR's refusal applied to a checkout instead of an attachment, and the
branch travels home as fetched objects and never as a path. *No credential storage*: the one fact
question 1 (ii) states about the volumes is drawn from it, and the socket the engine forwards is the
case that rule and ADR-0005's one exception do not cover, which is why it is `01`'s to add and not
this ticket's. First-demo ticket 14's rule decides question 1's `changed` and `churn` figure,
question 5's landing on every runtime, and is why a `box` that cannot have its clone refuses rather
than falls back.

### Not this ticket

The engine interface, the box lifecycle, how engagement is confirmed, the fetch transport, and the
kit that turns the engine's ssh-agent forward off (`14`), with `16` measuring the transport,
re-aimed above. Whether that socket ever joins point 5's closed list (`01`). What a push from inside
meets and the fetch as a rule for the egress list (`15`, outcomes 3 and 4; this ticket hands `15`
only the one fact about the volumes, and whether the fetch's transport is a network the list sees).
What the image contains, where each runtime reads its skills, why they are never baked in, and the
ADR-0003 amendment the mount carries (`13`). The login in the data volume, detection inside a box,
and the launch refusal's pointer (`08`). The words — the folder step's sentences for a copy and for
scope, the disclosure's last line and its third paragraph, the account sentence, `placeWord`'s fifth
word for *a sandbox on this computer*, and a refusal's sentence (`09`); where the two new absences
draw (`12`). The fifth trust level, and whether a deny on a verb survives it (`10`; its §5 question
to this ticket is answered in question 1 (ii), in one sentence about the volumes). `remote` and
`hosted` are out of scope as work, and the four constraints `01` point 8 carries from them are the
only ones checked here — point 8 (iii) in question 3 — and none of the four names the forge. The
map's *blobot as a service* bullet records the forge becoming the branch's transport when the laptop
is off as one of the amendments that effort already knows it owes; it is not a constraint held here,
and question 1 makes the fetch the way home on this computer with that amendment left to the fork
that needs it, never to this map.

## Amendment, 2026-09-05 — what the first box taught, and four decisions the critic found missing

The first box has run (`research/08`, measured on this Mac, `sbx` v0.39.0, zero tokens), `01` has
amended its answer four times on the strength of it, and a review of this ticket against the code it
names found four questions the six above walk past: the path the agent is actually given inside, what
blobot does with a volume that already answers to an Agent's name, whose name goes on the commits
that come home, and what `origin` is inside a clone the host made. Each is decided below with its
reasons, numbered on from 6 so a neighbour can cite it. Two more things land here on the author's
routing: `13`'s outputs 9 and 10 — the skills mount and the second amendment ADR-0003 is owed — are
this ticket's now, because this ticket owns **what crosses**, and `13` keeps the image and reads from
here what the image has to link. And one citation above is corrected in place: question 1 (ii) cited
a `GH_TOKEN` sentinel through `15`, and `15` carries no such name — `research/08` §2 saw eight
`proxy-managed` sentinels and names none of them, as `15` itself says — so the sentence now cites the
two records that hold the mechanism, srt's credential masking (`research/02` §2) and the engine's own
`sbx secret set` (`research/06`, *Network and credentials*). `Blocked by: none` stays: every question
here closes on paper, and the record that would move a figure has already run.

### What the first box taught

Facts first, all `research/08` §3 unless marked, all [OBS].

- **`--clone` refuses a worktree outright**: `ERROR: --clone is not supported when run from a Git
  worktree (…/wt/alice); run from the main repository instead`, in 0.25 s, with the repository beside
  it or without. Question 6's mount paragraph read this from the docs; it is measured now, twice.
- **The working shape** is the repository as the primary path: `sbx create --clone` clones it
  *inside*, at the repository's own absolute path, with `origin` the read-only mount at
  `/run/sandbox/source`; `git checkout blobot/<team>/<agent>` inside makes the branch tracking
  `origin/…`; a commit inside; and on the host **`git fetch sandbox-<name>` in 38 ms** brings it home
  under `refs/remotes/sandbox-<name>/…` and `refs/sandboxes/<name>/…`, with the host's
  `refs/heads/blobot/<team>/<agent>` and its worktree **untouched**.
- **The mechanism** is a `git-daemon --export-all` running *in the guest* on 9418, published on a
  host loopback port (`127.0.0.1:49152`), and a remote the engine writes into the user's `.git/config`
  with two fetch refspecs. The host dials the box. `sbx rm` warns that commits are lost unless
  preserved first, deletes the remote, and **keeps `refs/sandboxes/*`** in the user's repository.
- **Inside, `git commit` refused until an identity was set by hand**: the probe script runs
  `git config user.email alice@blobot.local; git config user.name alice` before it can commit,
  because no `~/.gitconfig` crosses. That line is the whole of question 9.

What it moved on this ticket: nothing in shape, three things in standing. Question 1 *(b)* is exactly
what the engine's own remote does, measured — `refs/remotes` and a namespace of its own, `refs/heads`
never moved — so *(a)*'s lean is now a lean against a measured alternative rather than a read one.
Question 6's refusal of the mount is backed by the record's own words: `origin` *is* the mount, so
`--clone` cannot be had without it, and `01`'s 2026-09-05 amendment has withdrawn it as a reason for
`sbx` in those terms; what stands is the mechanism beneath it, a clone in a volume and a way to fetch
from it, which blobot drives itself. And question 4 gains one line: the engine leaves
`refs/sandboxes/<name>/*` behind on `rm`, a namespace of its own in the user's repository; under
*(a)* blobot's fetch lands in `refs/heads` and writes no namespace, and `remove` and `purge` leave no
ref but the one the `-d` rule keeps, so a user's `git for-each-ref` shows blobot's branch and nothing
of blobot's plumbing. One constraint for `14`, read from the mechanism and not decided here: the
engine's daemon is a port the host dials, the reverse of `01` point 8 (i)'s *the box dials blobot*;
harmless on this computer, and the reason the fetch transport `14` builds should ride the channel it
already has — the exec — rather than a second published port, so that `hosted` is not precluded by
the way the branch comes home.

### 7. The guest path, and what the persona says of the folder

Today an AgentWorkspace has one `path` (`workspace/workspace.ts`), and four things read it as a
directory on this computer: `start-team.ts` hands it to the runtime as `cwd`; `composePersona`
(`orchestrator/envelope.ts`) writes two lines from it — *The team works on `<team.workspacePath>`*
and *You work in your own copy of it at `<agent.workspacePath>`*; `status.ts` runs `existsSync` on it
and git inside it; and `commit.ts`, `branches.ts` (`currentBranch`, `switchBranch`) and `publish.ts`
run the user's own git there at the user's click. On a box every one of those is pointed at a
directory that is not there.

**No second path.** `AgentWorkspace.path` stays one field and is redefined by one clause: it is
*where the AgentWorkspace is, on the Agent's Machine*, and it is the `cwd` the runtime is given. On
`local` that is the worktree and nothing changes. On `box` it is the guest path, and **no host code
may open it**: a `hostPath` beside it would be a field waiting for an `existsSync` to lie to, and the
host's view of a box's work is not a directory at all. It is the pair the type already holds —
`team.workspacePath`, the Team's repository, and `branch` — which under question 1 *(a)* is where
`ahead`, `pushed`, the forge reading and `publish` already have everything they need. What changes is
the readers, sorted by what each reads: a figure **about the branch** (`ahead`, `pushed`, `gh pr
list`, `git push`, the `-d` rule) runs in the user's repository; a figure **about the working tree**
(`changed`, `churn`, `currentBranch`, `switchBranch`, `commitWorktree`) runs on the Machine, over the
transport `14` builds. That split is this ticket's; the seam it runs through — whether
`readAgentWorkspaceStatus` asks a provider or a Machine — is `14`'s. `present` today means *the
directory is where it was left*; on a box it means the box and its workspace volume answer, which is
question 3's `ok` restated, and a stopped box is present, since it restarts on the next exec.

**The guest path is a constant of blobot's own, the same on every box: `/home/agent/workspace`.**
Under the contract's one directory the image guarantees to `agent` (`13`, *The base*), beside the data
volume the CLI keys its project state on, and never the host's absolute path, which is what the first
engine does and question 6 already refused as a host path written into a box. Two more reasons, both
new. A Workspace the user moves (`requireWorkspaceExists` already says so on `local`) would strand a
CLI whose session state is keyed on the old path inside — Claude's `~/.claude/projects/<cwd>` is one —
where a constant path survives the move untouched, and point 8 (iii)'s wake by `session/load` needs
the cwd it was opened with. And a host path names where the user keeps things, which is the weaker
half of ADR-0004's *map of the user's filesystem* handed to an agent for no reason. One path for
three kinds, which is question 6's own sentence: `git` is the clone at it; `nested` is the mirrored
tree under it, `<guest path>/<repo-relative-path>` per repository in scope, the shape
`nested-repos.ts` builds today; `plain` is the copy at it. The string is the build's if `13`'s image
needs another; the three properties are this ticket's: not the host's path, the same on every box,
under the contract's home. **Never on screen**: a guest path is the mechanism (`CONTEXT.md`, *Avoid*),
and the tray's `WORKSPACE` line draws the branch and never drew the path, so `12` has nothing to add.

**The persona's host-folder line is dropped, on both kinds.** *The team works on
`/Users/…/repo`* hands the agent a path outside its AgentWorkspace, and `Read`, `Glob` and `Grep`
never prompt — it is ADR-0004's refusal word for word, an ungated read of the user's checkout with
`.env` and every gitignored file in it, and it has been true on `local` since the first demo, where
the persona was written against one directory and nobody chose it. It is also the ticket 06 trap from
the other side: `start-team.ts` warns that *the agents will not see* the user's uncommitted changes,
and with that path they can, reading the version the user is looking at while their own copy holds
another. On a box the line is merely false. What stays is the copy line, naming `agent.workspacePath`
— the cwd on both kinds, true on both — and `composePersona` stays pure and Machine-blind: the path
differs, the sentence does not, and the one sentence a box adds is question 10's, a Workspace fact.
This is a change to `local` that can ship before any box exists, since it is ADR-0004's on `local`
alone, and it is the first line of this ticket's build.

### 8. The name, and a volume that already answers to it

The box's name is `17`'s, shared with this ticket, and is read here as given: **by Agent id**. The
engine names volumes from the box's name deterministically — *the same sandbox name reattaches to the
same volumes* (`research/06`, *Volumes are a kit's*) — so the workspace volume is reached by that id
and never by the branch's slug. One sentence on why the volume half needs it to be the id and not
`blobot-<team>-<agent>` as `02` first wrote it: the slug is released when a team is deleted and
re-earned by the next team with those names, and question 4 already lets `remove` proceed with the
engine absent, so a slug-named volume could outlive its removal and be adopted by a stranger; an id
is minted once (`uuidv7`) and is reachable by no later Agent. The rest of the name — its form, and
what a stale *box object* under it does — is `17`'s.

So a box or a volume already under this Agent's id is **blobot's own, made for this Agent**, or the
store was rewritten under it, and the reconcile has to tell which without guessing. It tells by two
things: the host branch, which question 3 already leans on, and a **marker in the workspace volume**,
written at provision — `copied-directory.ts`'s precedent, the file whose existence is the evidence
that a workspace was ever provisioned and that deleting the workspace cannot erase — naming the team
id, the Agent id, the Workspace kind and, for `git` and each clone of `nested`, the repository's root
commit, which identifies the repository without a path and survives a moved folder. The row question
3's table lacked is **workspace volume present, host branch absent**, the mirror of its second row:

- **Marker matches** — same team, same Agent, same root commit: the volume is this Agent's and the
  host lost its branch. Today that cannot happen to a worktree, because git refuses to delete a branch
  that is checked out somewhere; on a box nothing is checked out on this computer, so a `git branch -D
  blobot/<team>/<agent>` in the user's repository succeeds silently and the next launch finds the
  volume intact. **Adopt, after one fetch home.** The fetch recreates `refs/heads/blobot/<team>/<agent>`
  — a create, never a force, since there is nothing to fast-forward — and the outcome is `repaired`
  with a `detail` naming what came home. Repair is the rule because the case is lossless, and it is
  not today's `lost` because the host branch on a box is a mirror and never the only copy. A person
  who meant to discard the work deletes the team; a person who deleted a branch they took for a
  leftover gets it back and is told.
- **Marker absent, or naming another team, Agent or repository**: something under this Agent's id is
  not this Agent's Workspace, which `uuidv7` makes a rewritten store and nothing else. **Refuse.** The
  box does not start, in `09` §4's shape — the same refusal as a box that cannot have its clone — and
  the sentence says that what is under this agent's name is not this team's work. Never adopted,
  because a fresh agent starting on a stranger's clone at an unknown commit is the confusion the
  `absent` state exists to prevent; never deleted silently, because the thing in the volume is
  somebody's commits. The one way out is the delete dialog's full clean, which removes the box and
  both volumes under that id (question 4), priced first, and never a Docker command.
- **Marker matches and host branch present**: `ok`, the ordinary relaunch, and the case deterministic
  naming exists for — question 3's first row, *box gone, both volumes present → `repaired`*, is this
  row with the box object missing.

### 9. Whose name is on the commits

No `~/.gitconfig` crosses (`01` point 5: no host home), so `git commit` inside a box refuses with
*Please tell me who you are* until `user.name` and `user.email` are set, which the probe did by hand.
`git commit` is vouched from `normal` on every runtime, so an agent in a box meets that refusal on its
first commit, as a tool error, and either stops or runs `git config` itself with whatever it invents.
On `local` today an agent's commits carry **the user's** name and email, read from the host's config
through the worktree; nobody chose that, it is the default the first demo inherited, the shape
ADR-0003 found once — *nobody chose that. It was the default* — and it means two agents' commits on
one team are indistinguishable in `git log`, which is the record `WORKSPACE`'s per-agent placement
exists to keep. The one identity blobot has of its own is `prepare.ts`'s, `-c user.name=blobot -c
user.email=blobot@localhost`, per invocation, only when the machine has none, and never written into
the user's config. The market: the human owns the branch, the agent authors the commit, and
authorship is selectable (Jules, Devin; `research/05` (c)).

Two candidates. **The user's**: two strings read from the host's config and handed in — not a file
crossing and not a credential, so no rule forbids it. But it makes every commit a claim the user did
not make about who wrote it; unsigned (below) under a name that may sign everything, it is what a
forge's vigilant mode flags; and it loses the per-agent record at the one place git keeps one. **The
agent's**: what a box can do with nothing crossing, the record naming who did the work, and the
user's own name kept for the acts that are theirs — the pull request and the merge, which is where a
person's name belongs in this app by the permanent rule.

**Decided: the agent's, on both kinds, for anything committed in an AgentWorkspace, and never
signed.** The name is the Agent's name; the address is a slug of it under a domain that is nobody's —
one of RFC 2606's reserved names, `.invalid`, which resolves nowhere and lands in no mailbox;
`research/08`'s `.local` is mDNS's and is not it; the exact string is the build's. Author and
committer both, whoever pressed the button: the tray's `commit.ts` commits the agent's loose work
under the agent's name too, because the work is the agent's and the click is not what authorship
records. Delivered where a file cannot come home: in a box, written into the clone's own `.git/config`
in the volume at provision — never in the tree, so never committed, the rule that put ticket 14's
posture on the wire; on `local`, as `GIT_AUTHOR_*` and `GIT_COMMITTER_*` in the runtime's child
environment, since a worktree shares its `.git/config` with the user's repository and blobot writes
nothing there, and `adapters/acp/child-env.ts` is already the one function every spawn passes
through. First-demo ticket 14's rule is what makes it both kinds: a `git log` where Alice's commits
say Guillermo and Bob's say Bob is a record that holds for one agent and not the other.

**Signing.** A host `commit.gpgsign`, `gpg.format = ssh` or `user.signingkey` does not cross, and
inside there is no key — `~/.ssh` counts zero, the forward off (`17`) — so a commit inside is
unsigned whatever the host says. On `local` the same config *does* reach the agent's `git commit`
through the worktree, and would sign Alice's commits with the user's key or stop on a passphrase
prompt no agent can answer. So blobot sets `commit.gpgsign=false` beside the identity, in the same
environment layer, and **every commit an agent makes is unsigned on both kinds**: a signature is a
person's assertion, and the person did not write it. What that costs is stated rather than managed: a
branch protection that requires signed commits will refuse the agent's branch as a pull request, and
the remedy is the person's — a squash merge signs the merge as theirs — not blobot's. The sentence is
`09`'s, said once where the identity is said.

**Not selectable on this map.** A person's own name on an agent's commits is the market's option and
nobody here has asked for it; if asked, it is a per-profile choice in the hire dialog beside trust, the
operator handing two strings and still no file crossing, and it is ADR-0003's *Not decided here*
shape — the flag is one option away and adding it before anyone wants it reopens the paragraph above
for a hypothetical. It is fog for the map, and the author's. What changes on `local` now is visible —
agents' commits stop carrying the user's name — and deliberate; the door to reverse it is this section.

### 10. What `origin` is inside, and what a vouched verb means on a box

A clone the host makes with `git clone <host path>` has `origin = /Users/…/repo`, a string that names
nothing inside. The vouched `git fetch` and `git pull` then fail as tool errors against a path that
is not there, and `gh pr view` cannot resolve a repository from a path remote — before which `gh` is
not in the image at all (`13`, *The contents*: node, the bridge, the CLI, git, nothing else), so on a
box it is `command not found` first. Two candidates were put: the forge URL copied from the host's
own `origin`, or none and said.

**Decided: none, and said.** Three reasons. First, question 6's own rule, *never a host path written
into a box*, refused `--shared` and `--reference` for an alternates file, and a remote URL of
`/Users/…` is the same thing in `.git/config`; so the clone is not made by `git clone` at all but by
`git init` in the volume, `git fetch <user's repository> <branch>` and a checkout — populated by a
fetch, which leaves no remote, no `origin/*` refs and no `branch.*.remote`, and gives question 6's
narrow shape for free, since one refspec is one branch at one commit and no tags. Second, the forge
URL is a promise the box cannot keep: a private repository needs a credential and (ii) says there is
none in either volume; an ssh-form `git@github.com:` URL is dead inside — no key, and port 22
admitted is anonymous ssh (`10` §5) — and rewriting it to https is guessing at what a forge serves; a
public repository is the one case it would work, and only if `15` admits the forge host for git,
which would decide `15` from here. A remote that exists and cannot be reached is retried; a remote
that does not exist is understood in one tool error. Third, `git push` inside then dies twice, no
remote and no credential, before any trust level is consulted — `10` §5's *the pair dies at least
once on either answer*, restated as the Workspace's fact — and `publish.ts` is untouched, because
under question 1 *(a)* it runs in the user's repository, where `origin` is the user's.

**A vouch is about asking and never about reach.** ADR-0003 drew the line for the palette — the
settings scope decides what an agent *can do*, the palette decides what blobot *offers* — and it holds
for trust: a level decides what blobot does not ask about, and the Machine decides what is there. So
on a box the vouched verbs mean exactly this: `git fetch` and `git pull` meet no remote and say so in
one line the agent reads; `gh pr view`, `gh pr list` and the rest are absent from the image; `git
push` and `git remote` still prompt at every attended level and, allowed once, fail on the credential.
That sentence is for `15` to read: its line that `api.github.com` has to be admitted *for `gh pr
view`'s promise to hold on a box* (`15`; `10` §5) rests on the vouch being a promise of reach, and it
is not, and `gh` is not inside — so no host is owed to the egress list on the vouched verbs' account,
and whether `15` admits the forge for anything else stays `15`'s. First-demo ticket 14's rule is met
rather than triggered: what `normal` *asks* is the same on both kinds, and what the place *has* was
never the level's to promise.

**What it costs, named.** The base branch does not move inside a box. An agent that must rebase on a
base that moved since the team was formed cannot fetch it; on `local` today it can. The way to hand
it a fresh base is the transport in reverse — the host pushing into the volume, blobot's act and never
the box's — and it is not on this map; until it is, the answer is the roster edit's shape, a new box
from the fetched branch, and `16` item 2's *an agent needs more than one branch's history* widens the
clone at provision, never the remote.

**Said.** To the agent, one sentence in the persona, only on a box: *your copy has no remote; commit
on your branch, and the operator brings your work home and opens any pull request*. A Machine kind is
a static fact per Agent (`01` point 3), in blobot's own word and never a provider's, so the persona
may carry it without becoming provider-aware; on `local` the worktree has the user's `origin` and the
sentence is not said. On screen, the words are `09`'s and the place `12`'s.

### 11. What crosses — `13`'s outputs 9 and 10, taken here

`01`'s 2026-09-05 amendment reads *`13` owes ADR-0003 a second amendment*; `13` holds the mount's
landing as its output 9 and the palette on a box as its output 10; the author has routed both here,
because this ticket owns what crosses and `13` owns what the image is. So question 5's *raised here
and written elsewhere* is superseded: it is decided here, and ADR-0003's foot and the comment on `01`
point 5 carry these words when the kind is built. `13` reads from here one thing, in (b).

**(a) The list, closed, as `01` amended it and this ticket fills it.** Crosses: the two volumes; the
operator's `~/.claude/skills`, read-only; the mailbox door; the hosts on the egress list. **Handed and
not crossing** — composed by blobot on the host and carried as text or as two strings, the way the
persona and the Handbook already are: the agent's git identity (question 9). **Not crossing, by
name**: the operator's global `CLAUDE.md`, `settings.json` and hooks, because the user scope inside is
the data volume's, blobot's and per agent; `~/.gitconfig` and any signing configuration (question 9);
`~/.ssh` and the agent socket (the forward off, `17`); the `gh` login (question 1 (ii)); the host's
`.env*` and every gitignored file, the reflog and the stashes (question 6: a clone carries none of
them); and any MCP server the operator named in their own user scope, which `09` §1's third paragraph
reads from here. ADR-0003's second amendment, in the words the ADR's foot will carry: *inside a box an
agent loads `project` and `local` from the clone and `user` from its own data volume; the operator's
skills reach it read-only and the operator's global CLAUDE.md, settings and hooks do not, because
`settings.json` is the file whose fence keys merge across every scope a session loads and a merging
file must not cross a boundary built to be one.* On `local` the ADR stands whole.

**(b) Where the mount lands: one mount, at every path the image's runtime reads, by symlinks the
image makes.** `13` offered three shapes and this is the second. Claude reads
`/home/agent/.claude/skills`, measured: Docker's own kit lands its skills store there (`research/08`
§5). fx reads the same directory — it warns about `~/.claude/skills` in its own diagnostics, the
first-demo's finding. Where Codex, OpenCode and Cursor look is **unread**, per runtime, and is a fact
of the image in the shape of `13`'s output 3: the image links its runtime's own lookup path to the one
mount, so *every runtime that reads it looks there* is satisfiable by construction and the mount is
offered — first-demo ticket 14's rule met, not tripped. Read-only survives the link, since the link
lives in the image's overlay and its target is the mount.

**(c) A hazard ADR-0003 already recorded, met again at the boundary.** A skill directory is very often
a **symlink** — 36 of the author's 37 point into `~/.agents/skills` — and a read-only mount of
`~/.claude/skills` carries those links **dangling** inside the box, because their targets are on no
list. So inside a box only a skill whose `SKILL.md` lies within the mounted directory exists. Two
consequences. The palette's allowlist is built on the host, by a `statSync` that follows links; on a
box it must instead refuse a skill whose resolved path leaves the mount, so that *the names blobot
offers are the names the CLI inside resolves*, which is `13`'s own constraint and now this ticket's
rule; a skill that lives outside the mount is absent on a box and said (`09`). And whether
`~/.agents/skills` joins the closed list — the directory the author's own links point into, and the
convention more than one runtime is converging on — is **raised here and is `01`'s to add**, never
this ticket's to take, the same door question 6 left for the mount.

**(d) The palette's other half, output 10.** The workspace's `.claude/` — each runtime's equivalent —
is enumerated today from the worktree on disk at `cwd`, and on a box the cwd is a clone in a volume
the host does not read. Decided: **from the user's repository at the fetched branch** — `git ls-tree`
against `blobot/<team>/<agent>` — never over the exec per turn, and never from the base branch.
Everything on the fetched branch is in the box, because it came from there, so the host never offers
a name the box lacks; what it misses is a loose file the agent has not committed, which is the same
one-fetch lag `ahead` already carries and is said as such. On `local` the worktree on disk is exactly
what the CLI resolves, and stays. Per runtime, each adapter's palette builder does the same against its
own directory. The user scope's own commands are absent for the reason (a) gives.

**(e) One need named and not met.** Conductor copies gitignored `.env*` into every worktree, which
`research/05` (c) records as *a need blobot has not met*. It is not met here either, and the two doors
that look open are both ADR-0004's refusals: a path handed in is the read hole, and an attachment is
embedded into the prompt, which puts a secret into the context window and the transcript in SQLite.
An untracked file never crosses into a box. *Seeding an AgentWorkspace with untracked files* is fog
for the map, beside *seeding the data volume from a template*, and belongs to nobody yet.

### Priors, added

ADR-0001, as `01` extended it: an identity string is per Agent and shared by nothing, and question 8's
marker names the pair. ADR-0003: its second amendment is written in question 11 (a); its
scope-versus-palette distinction is reused in question 10 for trust versus reach. ADR-0004: the
host-folder line in question 7, the remote URL in question 10 and the `.env*` in question 11 (e) are
one refusal met three times. *No credential storage*: a name and an address are not a credential,
and the `gh` login stays out; *a pull request is the user's action* is why the person's name is on the
merge and the request and not on the agent's commits. First-demo ticket 14's rule decides question 9
twice — the identity and the signature — and settles how question 10's vouch and question 11's mount
are read: what blobot promises is the same on both kinds, and what a place has was never the promise.

### Not this ticket, added

The box's name, its form, and what a stale box object under it does (`17`); the kit that writes the
marker's volume and turns the forward off, and the transport the branch and the working-tree figures
ride (`14`, `17`). The image's symlinks and where each of the other three runtimes looks for skills
(`13`, in its output 3's shape, read from here). The egress list — which reads question 10's sentence
about the vouch and owes nothing on its account (`15`). The words: the no-remote sentence, the identity
and unsigned sentence, the absent-skill sentence, and the refusal for a volume that is not this
team's (`09`); their places (`12`). The fifth level (`10`). Adding `~/.agents/skills`, or anything, to
the closed list (`01`). A selectable identity, and seeding untracked files: fog, and the author's.

## Note, 2026-09-05 (consistency pass)

§8 names by Agent id and decides adopt-or-refuse **for the volumes**, by marker; the box object
under an existing id and the orphan sweep are `17`'s, which says so. The name is amended on `02`.
On §9: `research/08` §3 set a git identity by hand *before* committing; that `git commit` refuses
without one is git's documented behaviour, not something the record measured. `.invalid` stands
over `research/08`'s `.local`, and `13` reads it.
