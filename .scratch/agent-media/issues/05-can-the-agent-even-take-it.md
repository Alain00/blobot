Type: grilling
Status: open
Blocked by: 04

# Can the agent take the picture at all, and who says so?

## Question

Half of this feature is invisible from the transcript: before blobot can show a screenshot, the
agent has to be allowed to produce one, and nothing in ticket 14's posture has ever considered it.

The current state is half right by accident and half wrong by accident. `import`, `scrot`, `grim`
and `screencapture` are on no list, so they prompt at every level: the correct outcome, arrived at
by omission, which means it is not a decision and will not survive the first person who finds it
annoying. But `npx` **is** on `TRUSTING_BASH` (`adapters/claude/permissions.ts:102`), so at
`trusting` and `unattended` an agent already runs `npx playwright screenshot ...` unprompted. A
prefix rule that hides an arbitrary verb is the exact defect `gh api` was pulled from the list for
on 2026-08-31, and this one is live today.

The question is whether taking a picture is ordinary work blobot vouches for, and the answer
splits hard depending on **what is being photographed**:

- A **browser under the agent's control**, rendering the app the agent just built in its own
  worktree, is as ordinary as running the test suite.
- The **user's screen** is not ordinary at any level. It photographs whatever is in front of the
  person, including windows that have nothing to do with this team, and there is no trust word in
  blobot's vocabulary that should reach it.

Those are different verbs wearing the same word, which is exactly the split ticket 14 made for
`git` and had to make again for `gh` on 2026-08-31.

## What it has to settle

- **Whether the screen is off limits at every level, permanently**, the way `rm`, `sudo` and
  `git push` are. The case for yes is strong and should be written down as an argument rather than
  a preference, because it is the first entry on that list that is about *privacy* rather than
  destructiveness or reach.
- **Whether a browser screenshot is vouched, and from which level** — and, separately, **whether
  `npx` should stay on `TRUSTING_BASH` at all**. That is a live defect this ticket found rather
  than a hypothetical, it is not this feature's to fix quietly, and if it is not fixed here it
  needs its own ticket rather than a mention.
- **What an MCP browser server means for all of this.** `Mcp(blobot:*)` is vouched at every level
  so a peer message never waits on a human. A browser server is the operator's own and is not
  blobot's to vouch for, so a screenshot arriving through option 1 of ticket 04 asks a permission
  question every time — which is correct, and is also the reason this feature may feel broken.
- **Whether that prompt should be answerable once and remembered.** `allow_always` exists and
  writes into this one agent's own workspace. A screenshot loop that prompts on every frame is the
  case that makes it obvious, and it should be reasoned about here rather than met live.
- **What happens in a Routine run**, where a permission expires because nobody is watching. A
  screenshot Routine is the most attractive version of this feature and the one most likely to
  produce nothing at all.

## What is binding

- `bypassPermissions` and its equivalents stay unoffered. There are **four** levels, not three —
  `careful`, `normal`, `trusting`, `unattended` (`core/trust.ts`) — and `unattended` takes
  `trusting`'s list unchanged on purpose. Anything this ticket adds to a list is therefore added to
  the unattended case too, where nobody is watching, and it has to be argued in that light.
- Four words of blobot's own, translated by each adapter from its own end. Nothing added to
  `core/trust.ts` may only make sense on one runtime, and two of the five runtimes answer every
  word with one mode (`CODEX_EXPRESSES_TRUST`, `FX_EXPRESSES_TRUST`) rather than pretending to a
  gradation they do not have.
- Per agent and never per team. An AgentWorkspace is per agent.
- blobot never widens what an agent may do as a side effect of a turn — the `/allowlist` refusal.
