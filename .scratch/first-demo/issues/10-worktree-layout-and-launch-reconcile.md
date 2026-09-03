Type: grilling
Status: resolved

# Worktree layout and launch reconcile

## Question

Each agent gets a git worktree bound to its agent record — created with the agent, destroyed
with it, reattached on reopen.

Decide: the on-disk layout and whether `.agents/` lives inside the repo or outside it; the
branch naming scheme; what happens when the user's repo already has uncommitted changes, is
not a git repo, or is a bare/shallow clone; whether the app ever commits on an agent's
behalf; and how a worktree is cleaned up when an agent is deleted while its branch has
unmerged work.

Then decide the launch reconcile: on startup, verify each agent's worktree still exists and
its branch still resolves, and define the state an agent enters when it does not. This is the
only piece of restart handling in scope.

## Answer

### Scope correction made while resolving this ticket

blobot is **not only for code**. An agent owns an isolated directory and does whatever it likes
in it — code, documents, anything. A git worktree is the *mechanism* when the workspace happens
to be a git repo; it is not the concept.

Docker remains **out of scope**, but a non-code workspace must stay **plausible** — nothing here
may hardcode "git repo" in a way that is painful to widen.

### Domain terms

- **`Workspace`** — the location the *team* points at. One per team.
- **`AgentWorkspace`** — the per-agent isolated copy of it. One per agent.

Neither word promises git or Docker, so `DockerAgentWorkspace` slots in later without renaming
anything. Rejected: `Sandbox` overpromises isolation we do not have; `Checkout` and `WorkingCopy`
are git vocabulary in disguise; reusing "worktree" as the concept would hardcode git into the
ubiquitous language.

### AgentWorkspaces live outside the user's repo

`~/.local/share/blobot/worktrees/<team>/<agent>/`, **not** `repo/.agents/<agent>/`.

`git worktree add` accepts any path. Putting them inside the user's project violates the
zero-setup promise in the most annoying possible way: a `.gitignore` edit to a file the user owns,
permanent `git status` noise for the life of the project, and the genuine footgun of nested working
trees confusing any tool that walks upward looking for `.git`. Outside, **the user's repo is
untouched** — the only honest position for a tool about to let four agents loose in it.

Cost: less discoverable. `git worktree list` still finds them and the UI shows the path.

### Branches: `blobot/<team>/<agent>`, branched from `HEAD`

The `blobot/` prefix makes everything we create identifiable and bulk-deletable, which matters
most when cleanup goes wrong. Team scoping prevents the collision that appears the moment someone
tries a second team on the same repo — the obvious second thing anyone does.

No id suffix: human-readable branch names beat collision-proofing against deleting and recreating
an agent of the same name in the same team, which is handled by refusing or reusing.

`HEAD` rather than `main`, because a team is created while sitting on the branch you care about,
and branching from `main` would silently discard that.

### Refuse narrowly, warn loudly

**Refuse:** not a git repo *and* the user declined to initialise one; a repo with no commits at
all (`HEAD` does not resolve, so there is nothing to branch from — a real case on a freshly
`git init`'d project).

**Allow:** dirty working tree, detached HEAD, shallow clone, in-progress rebase or merge.
`git worktree add` is fine with all of them.

**Warn** at team creation on uncommitted changes, because of the ticket 06 trap: the user's
uncommitted work is in no agent's workspace, so agents will read a version of the file the user is
not looking at. The warning belongs at creation time, when it is actionable.

### A non-git workspace is offered `git init`

One mechanism then serves everything: agents get real isolation, the user gets a diff of what each
one changed, and "review Bob's work" means the same thing whether it is TypeScript or a folder of
markdown.

**Offered, never silent.** Creating a `.git` in someone's directory is a visible change to their
filesystem, and doing it unasked is what makes people distrust a tool. One dialog: *"this folder
isn't tracked by git; blobot needs version history to isolate agents. Initialise a repository
here?"*

Rejected: per-agent plain copies give isolation with no way to ever reconcile — three divergent
directories and a manual merge. A shared directory is the corruption problem rejected at charting.

### blobot never commits on an agent's behalf

Agents have shell access; `git commit` is something they can simply do. Alice's persona tells her
to commit before asking a peer to review — one line, no machinery.

Rejected: auto-committing at end of turn produces a garbage history of WIP noise on a branch the
user may want to keep, and makes blobot an actor in their version control — a trust boundary worth
not crossing in v0.1. A commit *tool* would duplicate a capability the agent already has.

### Reconcile: repair the lossless case, report the lossy one

| Found at launch | Action |
|---|---|
| Workspace directory gone, branch intact | **Repair silently**, log it. The branch holds the work; `git worktree add` recreates the directory. Prompting for something with one right answer is pestering. |
| Branch gone | **Report.** Mark the agent `failed` with what was lost. Data loss has already happened, and silently creating a fresh empty branch would hide it — Alice returning healthy with three commits missing is the worst outcome on this ticket. |

### Deleting an agent

Remove the AgentWorkspace. Then: **keep the branch only if it has unmerged commits, delete it if
it is untouched.** An agent that did nothing leaves nothing behind; an agent that produced commits
leaves them on a findable branch, with the UI saying so.

This is exactly git's own `git branch -d` versus `-D` distinction, so it is also the least
surprising. Rejected: always keeping branches accumulates `blobot/*` cruft from every experiment,
defeating the point of the prefix; always deleting puts unrecoverable work loss behind a dialog
people click through.

## Amendment — a Workspace need not be a git repository, 2026-08-29

Raised by the author on driving the app: *"agents should be able to work in a non-git folder,
and I could select a folder with nested folders where each of them is a git repo."*

The original answer already said blobot is not only for code and that git is the mechanism
rather than the concept — and then refused every workspace git could not hold. That is the
contradiction this amendment closes. The second case makes it sharper: offering `git init` on a
folder that *contains* repositories is not merely unhelpful, it is the wrong action, creating a
repository that wraps repositories.

`WorkspaceProvider` was written for exactly this and does not change shape.

### Three kinds of Workspace, decided by inspection

| Found at the path | Kind | AgentWorkspace |
|---|---|---|
| A git repository | `git` | A worktree on `blobot/<team>/<agent>`. Unchanged. |
| Not a repository, contains repositories | `nested` | The tree mirrored: a worktree per **chosen** repo, loose files copied. |
| No repository anywhere | `plain` | A copy of the folder per agent. |

Detection is one pass over the directory, and `kind` is stored on the team, because it decides
which provider brings the team back at launch.

### `plain`: a copy per agent, and the cost said out loud

`~/.local/share/blobot/copies/<team>/<agent>/`, alongside `worktrees/` and outside the user's
folder for the same reasons.

The isolation is real; the guarantees git gave are not. There is no branch, "review Bob's work"
is a directory comparison rather than a diff, and **the reconcile can never repair a lost
copy** — the copy *is* the work, so a missing directory is `lost`, not `repaired`. This
asymmetry with the git provider is the whole reason the two are separate classes.

The UI must state this where the folder is chosen, not in a manual. `git init` stays on offer
for anyone who wants the guarantees back, because it is now a real choice rather than a
gate.

**Telling `absent` from `lost` needs a marker.** The git provider distinguishes them by asking
git whether the branch exists; a copy has nothing to ask. So provisioning writes
`<root>/<team>/<agent>.json` *beside* the copy: no marker means never provisioned (`absent`),
a marker with no directory means the work is gone (`lost`). Without it a first run and a
destroyed workspace look identical, which is the failure the original ticket cares most about.

**Deleting an agent keeps the copy** and reports where it is. The `-d`-versus-`-D` rule asks
git whether the branch holds unmerged commits; nothing can ask that of a directory, and the
ticket's own reasoning — never put unrecoverable loss behind a dialog people click through —
decides the tie. Cost: copies accumulate until the user removes them, and the UI says the path.

### `nested`: the user picks which repositories are in scope

Every repository found is listed at team creation with all of them ticked. The chosen ones are
worktreed into a tree that mirrors their relative paths; files that belong to no repository are
copied; **repositories the user did not choose are absent from the agent's workspace.**

Why a picker rather than all of them silently: a `~/code` with twenty projects would put a
`blobot/<team>/<agent>` branch in twenty repositories, nineteen of which the agent never opens,
and worktree them all on disk for every agent. Out of scope should mean out of sight, and the
list has to be drawn anyway to be honest about what is about to be created.

Consequences worth stating rather than discovering:

- A change spanning two repositories lands on two branches. "Review Bob's work" is N diffs.
  This is inherent to the shape, not to the design.
- The loose files at the top of the tree are a copy, so they inherit the `plain` provider's
  weaknesses inside an otherwise git-backed workspace. A reconcile that recreates a missing
  agent directory restores the repositories from their branches and **re-copies the loose files
  from the Workspace**, discarding any agent edits to them. It says so.
- A repository with no commits is skipped with a reason, not a refusal for the whole team —
  one empty project in a folder of twenty must not block the team.

### What is still refused

Only two things now, and neither is "this is not a repository":

- A `git` workspace with no commits: `HEAD` does not resolve, so there is nothing to branch
  from. Unchanged.
- A `nested` workspace where the user unticked every repository *and* there are no loose files —
  an empty workspace is not a workspace.

## Amendment — the Workspace is the Agent's, 2026-09-03

`.scratch/agents-and-chats/issues/02-the-anchor-and-the-agentworkspace.md`, on
`docs/adr/0006-the-agent-is-the-unit.md`. The Team is retired; the Workspace is an Agent's
**anchor**, and an AgentWorkspace is per **Member** (an Agent in a Chat). What changes here:

- The branch is `blobot/<agent slug>/<chat slug>` and the directory
  `worktrees/<agent slug>/<chat slug>/`, on slugs fixed at creation, so Agents and Chats can be
  renamed without moving anything. Agent first, because the repository is the Agent's now.
- A **made** anchor — the folder blobot makes for an Agent with no folder of its own — is a
  repository with one empty commit at `~/blobot/agents/<agent slug>/`, worked **in place** with no
  worktree, the same tree in every Chat, safe because an Agent takes one Turn at a time.
- The reconcile is per Member, runs when a Chat opens, and reports in that Chat's transcript.
- `remove` and `purge` are unchanged in mechanism; who calls them is: deleting an Agent, deleting
  a group chat, or removing a Member from a roster.

Everything else above stands: outside the user's repository, branched from `HEAD`, the `-d`
versus `-D` rule, the three kinds and their providers.
