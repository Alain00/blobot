Type: grilling
Status: open

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
