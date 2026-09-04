Type: grilling
Status: open
Blocked by: 01, 13

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

## Amendment, 2026-09-04 — conditional on `13`

This ticket largely dissolves if `13` answers *instance*: the repository is on the server, so worktrees, `git worktree list`, the ahead-count, publish, purge and `measure` all run local to it exactly as today. What survives is that the client no longer has the files, which nobody has priced.
