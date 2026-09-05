Type: grilling
Status: resolved

# Whose tree, in the team pane

## Question

In an agent's pane the sidebar's folder is not a question: it is that agent's worktree. In the
team pane there are N worktrees and the tree can only draw one, which is the same problem
`WORKSPACE` met and solved by being drawn **twice** — under the composer in an agent's pane, and
as a per-agent block in the details popover, *"where a single branch name would be false about the
other members"*.

The tree cannot take that answer, because a tree per agent is four trees. So the team pane needs a
chooser, and it needs to be impossible to misread which agent is on screen. Open:

- **What it is.** A row of the members' faces at the head of the tree, selecting one? A path line
  that names the agent? The tray's own `WORKSPACE` line already names a branch, and a branch name
  is `blobot/<team>/<agent>`, which contains the answer.
- **What it defaults to.** The lead? The last agent whose turn settled? Nothing at all until the
  reader picks, which is the only option that never lies but leaves the sidebar empty in the pane
  most people open first.
- **Whether it follows.** If an agent starts working, does the tree move to it? Following is
  useful and is also a surface that changes under the reader's hand for reasons they did not
  cause — `DESIGN.md` has refused that shape before.
- **Whether it is remembered.** *Already decided* 10 remembers expansion per `<team>/<agent>`;
  this asks whether the team pane remembers *which* agent it was showing.

Same grain as everything else: `<team>/<agent>`. The answer must make the agent's identity legible
without a second glance, because every changed-file mark under it is a claim about one specific
checkout.

## Answer

Resolved 2026-09-05. The map chartered this as *the team pane needs a chooser*. It does not, and
the reason is one line of the codebase this ticket was written without: the tray's `WORKSPACE`
line is already agent-pane-only, and `App.tsx:520` says why. *"There it is one branch and one
possible pull request, which is a sentence that can be true. The team pane's answer is N of
them."* The sidebar has the same problem and takes the same answer, one step further.

### The sidebar has no idea of its own whose files these are

**It draws the pane's agent. That is the whole rule.** `Pane` is already
`{kind:'team'} | {kind:'agent', agentId}`, and the rail expands the open team into a row per
agent, so an agent pane is one click away and the app already has a selection model for exactly
this.

Rejected: a selection of its own, so Bob's tree could sit beside Alice's transcript. It creates
the failure the map warns about in `Already decided` 2 — a tree quietly showing a different
checkout than the line above it — and it buys a second thing to remember.

**Following the pane deletes three of this ticket's four sub-questions.** *What does it default
to*, *does it follow when an agent starts working*, and *is the choice remembered* are all
answered by the pane, which has argued positions on each already: the pane resets on a team
change because the agent it was showing belongs to the team that went away, and `--pane=<agentId>`
survives the first snapshot so a screenshot can open one. None of that is re-decided here, and
`Already decided` 10's per-`<team>/<agent>` expansion memory is unaffected, since it is keyed on
the agent and not on a selection.

### In the team pane the empty state is the chooser

The faces, and a short line above them. The chooser exists only while nothing is chosen, which is
why it is not a control anybody has to learn.

Rejected: **nothing at all**, with the toggle disabled or absent as the tray is. A control that
appears and disappears as you move between panes is worse than a panel that says what it needs.

Rejected: **the team's own Workspace**, the folder the team was made from. Refused on a stronger
ground than taste: that is **the one folder no agent is working in**, so it would be the only
tree in the app guaranteed to show nobody's work, drawn in the pane where a reader would most
expect to see some.

**Clicking a face opens that agent's pane**, which is the same act as clicking the agent's row in
the rail. It makes the sidebar the third place that can change panes, after the rail and the
navigator, and that is accepted: it is the shortest path from *I want to see her files* to seeing
them, and the alternative is the independent selection already rejected.

### The head is the face and the name

Not the branch. The tray under the composer in that same pane already says it, and `DESIGN.md`
has twice refused the same claim twice. The face is the carrier that works at a glance, is not
already spent forty pixels away, and is what makes two agents' trees impossible to confuse.

### The copy is short, and that is a rule now

The author's instruction while resolving this, 2026-09-05: **reduced text and verbosity in the
UI.** It is the general rule behind `DESIGN.md`'s **Words** section rather than a new one, and it
lands on this ticket first because the invitation is the only thing here made of words.

So the empty state is the faces with a label over them, not a sentence explaining the situation.
Something on the order of `whose files` as a mono label, or the members' faces alone if the
surrounding chrome already makes it obvious. **Try the version with no line at all first**, and
keep the line only if something is actually lost without it. The same test applies to every other
string this map produces, ticket 05's empty and broken states most of all, where there are four
of them and each is a sentence today.
