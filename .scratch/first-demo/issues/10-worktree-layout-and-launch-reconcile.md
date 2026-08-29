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
