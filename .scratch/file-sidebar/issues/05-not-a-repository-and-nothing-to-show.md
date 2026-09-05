Type: grilling
Status: resolved

# The tree that is not a repository, and the tree with nothing in it

## Question

*Already decided* 8 shows ignored files dimmed. That sentence assumes git, and ticket 10's
2026-08-29 amendment says a Workspace need not be a repository: there are three kinds, `git`,
`nested` (a folder of repositories, of which the user picked the ones in scope) and `plain` (a
copy per agent, with **no branch, no diff and no recovery**). Decide what the sidebar is in each,
and what it says when there is nothing to draw.

- **`plain`.** No git, so no changed set and no ignore list. The tree is a filesystem tree with no
  decoration — which is a *lesser* version of the panel, and the panel should say so rather than
  quietly drawing one. What sentence, and where? The flow that creates a copy already says the
  copy has no diff; this is the same admission at a different moment.
- **`nested`.** The root is a folder of repositories and only some of them are in scope. Does the
  tree root show the whole folder, or only the in-scope repositories? Does an out-of-scope sibling
  appear dimmed, hidden, or not at all? Is the changed set one read per in-scope repository, and
  what does 02's measurement say that costs?
- **A workspace that is not where it was left.** Moved or deleted. There is a sentence for this
  already — *a Workspace that has been moved or deleted says so instead of being called "not a git
  repository"* — and the sidebar must reuse it rather than write a second one.
- **A stopped team, and demo mode.** The mock agents have no worktree at all. An empty tree is a
  claim that the folder is empty; demo mode must say the demo has no folder.

The through-line is one rule: **the sidebar never draws an absence it did not verify.** Every one
of these cases is a different true sentence, and the failure mode is all four of them rendering as
the same blank panel.

## Answer

Resolved 2026-09-05. Two of the four cases this ticket was chartered with are not cases, and the
one it did not know about is the hard one.

### Struck: `nested` does not need an in-scope rule

The ticket asked whether an out-of-scope sibling should be dimmed, hidden or absent.
`nested-repos.ts` decided this when the amendment was built, and the sidebar inherits it without a
choice: *"A repository the user did not tick is absent, not present-and-ignored. Out of scope
should mean out of sight; an agent that can see a project can edit it."* The AgentWorkspace mirrors
only the ticked repositories, so **the tree has nothing to hide, dim or exclude.** It reads the
folder it is given.

### Struck: a stopped team is not an empty state

The worktrees are on disk and `git status` needs no running agent, so the tree draws normally for
a team that is not running. Only the refresh signal is idle, which is 03's territory and not a
state to render. The ticket listed this as a case; it is not one.

### `plain`: the column is absent, and the head says `a copy`

No git, so no changed set and no ignore list.

**The status column does not draw at all.** An empty column reads as *nothing has changed*, which
is the unverified absence this ticket exists to prevent; a missing column is legible where an
empty one is not. The head carries `a copy` — two words `Workspaces.tsx:580` already uses for
exactly this kind, so no new vocabulary is invented for it.

**No explanatory line.** Per the map's terseness rule, the version with no line is tried first,
and `no branch, no recovery` already exists in the tray beside it for a reader who wants the
consequence. The panel refusing to draw the tree at all is refused: the files are real and worth
seeing, and only the decoration is impossible.

### `nested`: the seam where git stops, which is the real question

The ticket missed this. In a nested AgentWorkspace the ticked repositories are worktrees with a
real changed set, and **the loose files beside them are a copy** — `nested-repos.ts` again:
*"The loose files are a copy, so they carry the copied provider's weakness inside an otherwise
git-backed workspace."* So one tree is part git-backed and part not, and the marks are possible in
some subtrees and impossible in others.

**The seam is marked, minimally, and probably for free.** A repository root is already the only
directory in this design whose row can carry a roll-up count, so it may be legible as a repository
root with no extra device at all. **Check that in the prototype before adding one.** If it is not
legible, the smallest thing that makes it so, and nothing more.

Rejected: **saying nothing**, which reproduces the `plain` failure inside a tree where the reader
has just seen marks two rows above and will read their absence as *clean*.

Rejected: **hiding the loose files**, which would make the tree lie about what the agent can
touch. They are in its workspace and it can edit them.

### Moved or deleted, and demo mode: the short form

Core already says it: *"blobot cannot find `<path>`. The folder this team points at has been
moved, renamed or deleted."* That sentence has a fix in it and belongs where the fix is, which is
the launch refusal, and it is too long for a flank.

**The same fact at two altitudes.** The panel says the short true thing — on the order of
`folder not found`, and `no folder` in demo mode, where the mock agents have no worktree at all.
The full sentence stays where the user can act on it.

Rejected: **drawing nothing**, in either case. A panel that draws nothing is indistinguishable
from a panel that has not finished reading.

### The one rule under all of it

**The sidebar never draws an absence it did not verify.** Four different states, four different
true things, and the failure mode this ticket was written against is all of them rendering as the
same blank panel. Two of the four turned out not to exist, which makes the remaining two cheaper
to get right rather than less important.
