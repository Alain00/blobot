Type: grilling
Status: resolved

# Is remoteness a place to execute, or a blobot instance?

## Question

Raised by the author, 2026-09-04, after this map was charted: *"blobot desktop app can run as a
server, and any client desktop can connect to a server or multiple servers and each server expose
the agents, so with this each server can have their runtimes and config, and u just control
them."*

This map was charted on the other answer, and the difference is not a variation. It is a fork,
and it decides six of the twelve tickets here.

- **A place to execute** (what `01` through `12` assume). blobot stays one app. It owns the
  store, the profiles, the teams, the orchestrator and the mailbox, and only *execution* moves —
  into a fence on this machine, or onto a box over ssh. A Machine is a resource blobot spawns
  into.
- **An instance** (the author's). blobot splits. A server is a full instance minus the UI, owning
  the runtimes, the config, and probably the store and the orchestrator with them. A client
  attaches to several and drives.

## Why it is the fork and not a detail

**The proxy moves execution and leaves state behind, so every stateful thing has to cross a
wire. The instance moves state with execution, so almost nothing crosses except the UI.** The two
hardest tickets on this map exist only because of that separation:

- **`02`, the mailbox.** `127.0.0.1` plus a per-agent bearer token dies off-machine, and srt
  blocked three attempts at getting it back. Under the instance model the orchestrator lives on
  the server, agents on one server talk over that server's own loopback, and ticket 15's three
  design constants survive untouched. **This is the biggest single thing the instance model buys,
  and it buys it for free.** The residue is a team that spans two servers, which puts the mailbox
  back on a network — so the likely constraint is *a team lives on one server*, and it should be
  stated rather than discovered.
- **`05`, the Workspace.** Mount, clone or refuse dissolves: the repository is *on the server*,
  checked out by whoever set that box up. Worktrees, `git worktree list`, `WORKSPACE`'s
  ahead-count, publish, purge and `measure` all run local to the repo exactly as today. What the
  client loses is the files — it cannot open the folder in an editor, and nobody has priced that.
- **`08`, detection.** Largely dissolves. A server answers about itself with the code that
  already exists, and the vendor's `auth login` opens a browser in front of the person who owns
  that box, rather than in front of nobody.
- **`11`, reaching it.** The answer transfers whole and should be reached for deliberately: the
  server **binds loopback only** and the client reaches it over the user's own ssh tunnel. blobot
  stores a hostname, the user's ssh config and agent do the work, no credential is held. Without
  that move, an instance model has to invent auth between client and server — a credential blobot
  itself owns, which is a far larger ADR-0005 exception than a hostname is.
- **`03`, `04`, `09`, `10`** are unaffected. A sandbox is a boundary around a process on the
  machine running it, and that is the server's problem under either model, decided identically.
- **`06`, `07`, `24`** are unaffected in substance and merely scoped per server.

## What the instance model costs

- **The store splits, and there is no comfortable middle.** One SQLite file holds profiles,
  teams, messages, events, handbooks, routines and attachments. If the server owns it,
  **AgentProfiles become per server** and ADR-0001's whole point — hired once, on no team, on
  several at a time — is scoped to a box. If the client owns it, the server is stateless and the
  proxy model has been rebuilt with extra hops. **This is the decision underneath the decision.**
- **Routines reopen, on honesty grounds.** *blobot runs these while it is open and never in the
  background* was chosen so that a machine that slept and a machine that was shut give the same
  answer, with `missed 4 firings` and `Run now` as the whole of the recovery. A server stays
  open. Background runs become possible, which is either the feature or a quiet betrayal of a
  rule that is currently stated on screen.
- **`first-demo` ticket 14's cancellation rule changes meaning.** *With nobody listening a permission request
  is cancelled, never allowed.* On a server with no client attached that is the normal state, not
  the edge case. Either the server holds requests open, which reverses the rule, or work is
  silently cancelled overnight.
- **Multi-user arrives structurally.** Two clients on one server, two people answering one
  permission block. This map rules sharing out of scope; an instance model invites it whether or
  not the answer is no.
- **blobot becomes a distributed system.** A listening port, a wire protocol, streaming deltas
  and attachment bytes over a network, and connection state in an interface whose entire design
  assumes what it draws is true now.

## What must come out of it

1. **Which model**, or whether they compose. They can: a client, servers, and a fence on each.
   Three layers of indirection is also how a failure becomes unreadable, and the app has one word
   for it.
2. **If instance: what the server owns**, which is the store question above and is the real work
   of this ticket.
3. **The rule check.** *Local-first, no cloud dependencies, no hosted service is required for the
   app to run.* A server the user runs on their own machine is not a cloud dependency, and it
   must be said explicitly that it is not, because the word *server* will be read as one.

## Not this ticket

The per-agent composition root (`24`). That axis is per agent under **both** models and does not
wait on this.

## Closed on integration, 2026-09-05 — already outside the destination

Imported from main's `a185df4`, where this was ticket 13. The current map already records
Guillermo's explicit narrowing to local and box execution on this computer, with remote
execution, a second client and a server/service as later efforts. Preserve this proposal for
that later effort, without reopening the resolved Machine, mailbox, Workspace or detection
answers. The per-agent composition question is now ticket 24; image remains ticket 13.
