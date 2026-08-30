Type: grilling
Status: resolved
Blocked by: 01 (resolved)

# Which commands may blobot advertise?

## The uncomfortable part

The list is not the agent's. It is scraped from the **user's own** global Claude Code config —
skills, plugins, personal commands. Research measured 48 entries from the author's setup
(`.scratch/first-demo/research/02-claude-code-acp.md:341`), with full multi-sentence
descriptions, and found that `settingSources: []` did not fully suppress them: plugin-sourced
skills leaked through, and that was left explicitly unverified
(`research/02-claude-code-acp.md:580`).

So the naive version of this feature is: *the composer shows you your own Claude Code skills*.
Some of those are meaningful to an agent on a team. Many are not, and a few are about the
terminal session the user is not in.

## Questions to answer, in order

**Is a 48-item menu the feature, or the failure?** Argue both. A palette that surfaces the
user's real skills is the honest local-first answer and costs nothing to build. A palette of 48
personal entries in the one control the app funnels through is noise that makes the composer
worse than it is today. Do not resolve this by adding a search box and calling it handled.

**Which entries actively fight blobot?** The bridge already filters the terminal-bound ones —
`clear`, `cost`, `login`, `logout`, `keybindings-help` and friends (`acp-agent.js:6051`). It does
not filter `/compact`, and compaction on a session that `TeamPool` resumes with `session/load` is
exactly the interaction the pool assumes away. Go through what a real agent advertises and find
the rest of that class: anything that mutates session state blobot models somewhere else
(status, resume, the turn budget, the workspace).

**Is hiding them honest?** A hidden command still works if typed — the CLI parses the text, we
do not. So a filter is a menu decision, not an enforcement. If something is genuinely dangerous
for us, the answer is not to leave it off a list; say what it is and decide separately.

**Should a blobot agent inherit the user's config at all?** This is the bigger version of the
question and it reaches past the palette. `settingSources` is already hardcoded by the bridge
before user options are spread (`research/02-claude-code-acp.md:330`). A clean-room agent is a
different product from an agent that is the user's own Claude with a persona. That choice was
never made explicitly; the palette is just the first place it becomes visible.

## Why a grilling and not a task

Every answer here is a product decision with a defensible opposite, and the cheap one (ship the
list as it arrives) is the one that quietly decides the last question above. Take the author
through it before issue 02 is built.

## Input needed

Issue 01's live-run answer: the actual command count and names from a real `claude` in an agent
workspace. Argue against the real list, not the remembered one.

## The measured list, 2026-08-29

Issue 01's live run, which is the input this ticket was waiting on. Argue against these numbers,
not the remembered ones. Full reasoning in `01`'s answer.

- **223 commands, 97 KB, on every turn.** The research's 48 is stale by 175 entries.
- **140 of the 223 are one plugin's skills** (`posthog:`). "The composer shows you your own
  Claude Code skills" is really "the composer shows you whichever plugin you installed most
  recently", which weakens the honest-local-first argument considerably.
- **Sixteen built-ins fight something blobot owns**, listed by class in `01`'s answer:
  `/compact` and `/autocompact` against the pool's resume; `/config`, `/model`, `/effort`,
  `/fast`, `/auto-mode-setup` against the forced permission mode; `/mcp disable all` against the
  loopback server that is the agent's only way to reach a teammate; `/agents`, `/list-agents`
  and `/rename` against blobot's own roster and naming.

`/mcp disable all` is the one worth deciding separately from the menu, on this ticket's own
"is hiding them honest?" question: leaving it off a list does not stop it working when typed,
and what it breaks is agent-to-agent communication, which the orchestrator owns.

## Answer

Grilled with the author, 2026-08-29, in eight questions over three rounds. Every measurement
below is from a real `claude` in an agent workspace on this machine that day.

### Should a blobot agent inherit the user's config at all?

**No, not the operator's.** It loads `project` and `local`, never `user`. This is
**ADR-0003**, because it reaches far past the palette and a future session would otherwise flip
it back to fix a bug without knowing it was chosen.

The ticket asked this last and it turned out to be first: every other answer here depends on it.
The feasibility question research left open is closed — `settingSources: []` reaches the SDK
(the bridge sets its own before spreading ours, `acp-agent.js:4868`), it **fully** isolates, and
no plugin-sourced skill leaks. Verified separately: `["project","local"]` still reads a
workspace's CLAUDE.md and still advertises the repository's own `.claude/skills`.

The persona is untouched and was never in question. This decides what an agent *has*, not who it
*is*; if anything the persona argues for it, since 140 entries of one plugin's skills are a
second and louder set of instructions arriving underneath the one ticket 06 composed.

### Is a 223-item menu the feature, or the failure?

**The failure, and so is the 48-item one, and so was the 12.** Argued both ways across the
round, and what settled it was not the count:

| | commands | payload |
| --- | --- | --- |
| as shipped before this ticket | 223 | 97 KB |
| `user` scope dropped | 48 | 11.7 KB |
| after every filter agreed here | **5** | **1.9 KB** |

The 223 was never "your own skills": **140 came from one plugin** installed for unrelated
reasons, so the menu's size was a property of what the operator installed most recently.

But dropping `user` does not rescue it, because all 48 survivors are the provider's own
built-ins, and hand-filtering those is **a denylist against a vendor's release cadence**. A
denylist fails open. The churn is visible in the data itself — `/extra-usage` is described as
"Renamed to /usage-credits", `/fast` names Opus 5 — so the next release puts a built-in in front
of a user unreviewed, exactly as `/batch` ("execute in parallel across 5-30 isolated agents")
would have.

**So the palette is an allowlist, and the repo owns it.** The workspace's own `.claude/skills`
and `.claude/commands`, plus five built-ins blobot vouches for by name: `/code-review`,
`/security-review`, `/verify`, `/simplify`, `/compact`. It fails closed on every future release.
Someone wrote a project's commands *for this repository*, which makes them relevant by
construction and shared by every teammate — the same argument that decided ADR-0003.

The mechanism has a constraint worth recording: the wire carries `{name, description, input}`
and **no source field** (`acp-agent.js:6075`), so an advertisement cannot say whether it came
from the repository or the provider. blobot reads `<workspace>/.claude/` itself and
**intersects** with what was advertised, so drift in our reading of the CLI's resolution costs a
command we failed to offer, never one we offered that does not exist.

### Which entries actively fight blobot?

Sixteen, and they survive any scope choice because they are the provider's, not the operator's.
The ticket named the class correctly and undercounted it; two groups were missed entirely.

- **Spawn work the orchestrator does not own.** `/batch` is one Agent silently becoming thirty,
  which routes around both AgentWorkspace isolation and "the orchestrator owns agent-to-agent
  communication". `/loop` and `/goal` ("keep working until the condition is met") defeat ticket
  06's per-team turn budget by design. `/schedule` creates **cloud** agents and `/ultrareview`
  starts one at "$5-$25 USD", against a permanent local-first rule.
- **Write permission state, durably and on disk.** `/fewer-permission-prompts` adds an allowlist
  to the *project's* `.claude/settings.json`; `/update-config` configures hooks, which are
  arbitrary command execution on tool events. ADR-0003 makes this worse rather than better: the
  file they write is one blobot now deliberately loads.
- **Mutate the posture ticket 14 forces.** `/config`, `/model`, `/effort`, `/fast`,
  `/auto-mode-setup`, `/autocompact`.
- **Present a competing roster.** `/agents`, `/rename`, and `/list-agents`, which is literally
  "List subagents, teammates, and other Claude sessions you can message" inside an app whose
  premise is blobot's roster.
- **Are private or terminal-bound and slipped the bridge's own filter.** `/__remote-workflow`,
  `/workflow-launch-exec`, `/heapdump` (writes to `~/Desktop`), `/color` (sets the prompt bar
  colour), `/doctor`, `/context`, `/usage`, `/import`, `/reload-skills`.

**`/compact` was argued and kept.** The spec singled it out as fighting `TeamPool`'s resume;
having looked, that overstates it. Compaction does not invalidate the session id, so
`session/load` still works. What it does is make the agent's memory diverge from blobot's
transcript, and that divergence already exists and is already recorded — `build.md` has Mara
silently starting fresh under a transcript she could not remember, which is the same class and
worse. The context gauge is on screen, so refusing the user the obvious remedy while showing
them the problem is the worse trade.

### Is hiding them honest?

**Only as a menu decision, which is all it is.** A hidden command still runs when typed; we do
not parse the text, the CLI does. So the three that are genuinely load-bearing were taken out of
the palette entirely and given their own effort, `.scratch/runtime-posture/`: mode drift the
adapter already watches and ignores, permission state rewritten into the user's repository, and
a loopback server that can be switched off from inside the session, leaving an agent unable to
reach its teammates with no sign of why.

That last one is the ticket's own question answered on its own terms: blobot cannot block
`/mcp disable all`, so it will not pretend to. It will notice and say so.

### What this changes about issue 02

The composer half is now the easy half, and it is not this effort's to build: another session is
integrating cmdk into the `@` suggestion list and the same control serves `/`. What they receive
from `AgentRuntime.availableCommands` is **already curated** — the filter runs inside the
adapter, because a list of one provider's command names is provider-specific knowledge and the
permanent rule puts that behind `AgentRuntime`. No component ever sees an unfiltered list, so no
component can tell which provider produced it.

## Correction, same day: the scope half of this answer was wrong

The author, on using the palette: *global claude code skills are not present why?*

Because this answer conflated a plugin with a person. It argued from "140 of 223 came from one
plugin" to dropping the entire `user` scope, when of that scope's 175 entries **140 were the
plugin's and 37 were skills the author had written**. The property this answer used to justify
keeping `project` scope — authored deliberately, by a person, for a reason — was just as true of
the 37, and the argument simply failed to look at them separately.

**What changed:** all three settings scopes load again. **What did not:** the palette is still an
allowlist and still fails closed. It gained a third source, `~/.claude/skills`, read from disk
for the one reason that matters — a plugin does not install into it, and the wire carries no
field that would say so.

Live after the change: **40 offered**, zero plugin entries, out of 223 advertised.

The distinction worth keeping, which this answer did not have: **the settings scope decides what
an agent can do; the palette decides what blobot offers.** Everything above about *which
commands fight blobot* stands unchanged, because those are the provider's built-ins and were
never in the scope's gift.

Full reasoning in ADR-0003's amendment.
