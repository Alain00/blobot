Type: grilling
Status: resolved

# The permission posture in an agent worktree

## Question

Surfaced by the OpenCode research: **default permissions auto-allow everything**, including
`bash` and `write`. Implementing `session/request_permission` buys nothing unless blobot
writes an `opencode.json` with `permission: ask` into each worktree.

An approvals *UI* is out of scope for this map, but the posture is not — worktrees are in
scope and they contain the user's real code, so on night one two agents will be running with
unrestricted shell and write access in a real repository.

Decide the demo's posture: what each runtime is configured to allow by default; whether
blobot writes runtime config into a worktree (and how that interacts with a repo that already
has an `opencode.json` the user owns); which operations are hard-blocked regardless of
runtime rather than merely prompted; and what the user is told about the trust boundary they
are accepting.

This is a decision about defaults and honesty, not an approvals feature. Do not let it grow
into one — that is the out-of-scope line.

## Corrections to this ticket's premise (from ticket 16)

Research since this ticket was written changes two of its assumptions:

- **`edit` gates `write`** — there is no separate `write` permission key.
- **`external_directory` already defaults to `ask`.** So the uncontrolled default surface is *not*
  access outside the worktree, as this ticket assumed. It is **bash, and edits inside the
  worktree**.
- Scalar `"permission": "ask"` is a trap — it makes `read` ask too, which would make every agent
  unusable.
- The mechanism is **`OPENCODE_CONFIG_CONTENT`** (inline JSON in an env var), not a file written
  into the workspace — so this ticket no longer shares a file write with ticket 16, and blobot
  writes nothing into the user's repo.
- `opencode debug agent <name>` prints the resolved permission list, which is the verification tool
  for whatever this ticket decides.

## Answer

**Each runtime gets the best posture it can express, the difference is stated rather than
smoothed over, and blobot claims only prompting — because prompting is the one thing that is
true on both.**

### The finding that reframes the ticket

The two runtimes cannot be given the same posture, and this is not a configuration detail.

**OpenCode is fully expressible.** Permissions resolve to a flat ordered rule list, later rules
win, patterns are matched against the bash command itself, and `opencode debug agent <name>`
prints the fully resolved list — which is the verification tool.

**Claude Code is not ours to configure.** The bridge (`@agentclientprotocol/claude-agent-acp@0.70.0`)
**forcibly overrides `permissionMode`, `canUseTool` and `allowDangerouslySkipPermissions`** —
anything passed in `_meta.claudeCode.options` for those keys is discarded. The only lever is
`session/set_mode`, choosing from a fixed list read out of `dist/acp-agent.js`:

| mode | description (verbatim) | availability |
|---|---|---|
| `auto` | "Use a model classifier to approve/deny permission prompts" | only when the model supports it |
| `default` (name: *Manual*) | "Standard behavior, prompts for dangerous operations" | always |
| `acceptEdits` | "Auto-accept file edit operations" | always |
| `plan` | "Planning mode, no actual tool execution" | always |
| `dontAsk` | deny if not pre-approved | always |
| `bypassPermissions` | "Bypass all permission checks" | gated on `ALLOW_BYPASS = !IS_ROOT \|\| !!process.env.IS_SANDBOX` |

Beyond the mode, what decides is the **user's own `settings.json`**, because the bridge hardcodes
`settingSources: ["user","project","local"]` (ticket 07). Research 02 observed live sessions
landing in `auto`.

### The posture

**OpenCode** — injected via `OPENCODE_CONFIG_CONTENT`:

```json
{"permission": {
  "edit": "allow",
  "bash": {
    "*": "allow",
    "rm *": "ask", "sudo *": "ask", "chmod *": "ask", "chown *": "ask",
    "curl *": "ask", "wget *": "ask", "ssh *": "ask", "scp *": "ask",
    "docker *": "ask",
    "git push*": "ask", "git remote*": "ask", "gh *": "ask",
    "npm install*": "ask", "npx *": "ask", "pnpm add*": "ask",
    "yarn add*": "ask", "bun add*": "ask"
  }
}}
```

`external_directory` is **left at its default `ask`** — it already defaults to `ask` in 1.18.4,
which is the correction ticket 16 made to this ticket's premise. `npm test`, `npm run`, `pnpm
test` and friends are deliberately **not** in the list: that is how an agent does its job.

**Claude Code** — `session/set_mode("default")`, explicitly, on every session. Never
`bypassPermissions`. Never `acceptEdits`, despite the symmetry with OpenCode's `edit: allow`,
because on Claude that pairs with the user's settings rather than with our rules.

Forcing `default` overrides the user's `defaultMode` on purpose. Inheriting `auto` means **an
inference call we do not control makes safety decisions for an unattended teammate**. A user
opting into a classifier for themselves in an interactive terminal is not the same act as
opting into it for Bob at 2am while they are watching Alice.

**Ticket 16's trap generalises: re-send `session/set_mode` after every `session/load` or
resume, on both runtimes.**

### Why not match at the coarsest level both can express

Rejected: giving OpenCode `{bash: "ask", edit: "ask"}` so both agents behave identically. It
declines a real safety mechanism on one runtime to preserve a symmetry **the user cannot
perceive**, and it makes every `ls` and `npm test` a prompt — with two agents running at once
that is two blocking queues, and ticket 09's `waiting` stops carrying information because it is
the normal state.

The cost of asymmetry is real and is paid in the disclosure below, not hidden.

Consequence for ticket 09: under this posture `waiting` is entered **rarely but genuinely**,
which is what 09 designed it for and what ticket 12 spent its only contrast inversion on.

### Nothing is hard-blocked, and that is a claim we can keep

We could express `deny` on OpenCode (per key, per pattern, per path) and cannot on Claude —
`dontAsk` denies everything not pre-approved, which is blunter and is not a rule we author.

Rejected: blocking on OpenCode where we can and accepting it is advisory on Claude. **A guarantee
that holds for Alice and not for Bob is worse than no guarantee**, because the user will
generalise it, and the first time it does not hold is the moment the entire posture loses
credibility. Enforcing outside the runtimes — blobot inspecting and refusing at a shared layer —
is the correct long-term answer and is an approvals feature, which this ticket is explicitly told
not to become.

So blobot claims **prompting only**, which is true on both.

### The pattern list is a speed bump, not a boundary

Stated plainly because the alternative is a false guarantee: `bash -c "rm -rf …"`, `$(echo rm)`,
or writing a shell script and then executing it all sail straight past a command-string pattern.
It raises the cost of an **accident** — the realistic night-one failure — and does approximately
nothing against an adversary. Ticket 06 already established that a peer message is a
prompt-injection path with extra steps; this posture does not close it, it makes it *refusable*,
which together with 06's trust framing is as far as an MVP can honestly go.

### blobot writes nothing into the user's repository

`OPENCODE_CONFIG_CONTENT` (inline JSON on the spawned process) sits at **layer 6 of 7** in
OpenCode's config chain, so blobot's keys beat a repo's own `opencode.json` at layer 4 while
**deep-merging key-by-key** — the user's plugins, MCP servers, model choices and unrelated
permission keys all survive. Verified in research 16: a plugin and four MCP servers came through
the merge intact.

Rejected: `OPENCODE_DISABLE_PROJECT_CONFIG=1`, which discards the repo's config wholesale to
solve a permissions problem and would break agents that work fine in the user's own terminal.
Also rejected: letting the project file win, which makes the posture decorative — a repo could
silently disable it.

### The minimum thing that answers a prompt

Both runtimes offer three options over ACP (`allow_once` / `allow_always` / `reject_once`).
**blobot surfaces two: Allow once, Reject.**

`allow_always` persists for the session — that is a *rule the user is authoring* with nowhere to
see or revoke it, and it is the first brick of an approvals system. Rendered **inline in the
transcript**, not as a modal: two agents can be waiting simultaneously and a modal serialises
them into whichever arrived first, while ticket 12's `waiting` inversion in the rail already says
which agent needs a human.

**This is an amendment to ticket 12** — its transcript gains a permission block. It is small and
fits the existing vocabulary, since the in-flight tool line already renders in that position.

### What the user is told, and when

At **team creation**, once, before the first agent is spawned — the moment they point two
autonomous processes at a real repository. **Stated, not consented to: no checkbox.** A checkbox
implies the risk has been discharged onto the user; a plain statement admits blobot chose a
default and is telling them what it is.

> **Before you create this team**
>
> Alice and Bob each get their own copy of `<repo>` on their own branch. Inside that copy they
> can edit files and run shell commands without asking you. They will ask before touching
> anything outside it, and before a short list of commands that reach the network, change
> permissions, or publish — `rm`, `sudo`, `curl`, `git push`, package installs.
>
> They also have whatever tools your own MCP servers provide, and blobot does not prompt for
> those.
>
> The two agents are not protected identically: OpenCode lets blobot name specific commands,
> Claude Code does not, so Bob prompts on what Claude itself considers dangerous.
>
> blobot is not a sandbox.

Plus one quiet permanent affordance: a small posture indicator in ticket 12's conversation
header, beside the branch. Costs nothing and stops the disclosure from being a thing that was
clicked past in week one.

Rejected: first-run onboarding, which lands before the user has a repo in mind and while the
words are still abstract.

### MCP tools are outside all of this

Ticket 03 observed that **MCP tools are not permission-gated** by the `bash`/`edit` keys, and the
user's own servers survive the merge on OpenCode and are inherited wholesale on Claude (ticket
07). None of them pass through this posture.

Decision: **leave them ungated on both, and name the gap in the disclosure.** Gating them by name
pattern on OpenCode only would reintroduce the asymmetric guarantee rejected above, with a worse
failure mode — the tools most likely to do something irreversible outward (a tracker, a deploy
hook) would be gated for Alice and silent for Bob. Stripping them breaks agents that work in the
user's own terminal.

This is also load-bearing in our favour: `message_agent` rides the same ungated path, which is
why peer messaging works without a prompt on every hop.

### Fixed, not configurable

One posture, shipped, not surfaced as a setting. A permissions settings screen is an approvals
feature wearing a smaller hat, and its first version is a text field holding a `deny` list nobody
maintains. If the default is wrong, the fix is to change it for everyone rather than hand the
user a dial they must understand in order to be safe.

### Verification

`opencode debug agent <name>` prints the fully resolved rule list, so the OpenCode half of this
posture is assertable in a test rather than assumed. The Claude half is verified by reading back
`currentModeId` from `session/new` and after each `set_mode`.

## Amendment (observed while building the Claude adapter, 2026-08-29)

**"MCP tools are outside all of this" is false on Claude under the mode this ticket forces.**

The claim above — *"MCP tools are not permission-gated … this is also load-bearing in our
favour: `message_agent` rides the same ungated path, which is why peer messaging works without
a prompt on every hop"* — rests on ticket 03's OpenCode observation and on research 02, which
watched Claude in `auto` mode, where a classifier silently approved the MCP tool.

Under `session/set_mode("default")`, which this ticket requires, **Claude prompts for
`mcp__blobot__message_agent` like any other tool.** Observed live: Alice called it, the bridge
raised `session/request_permission`, and with no human attached the call came back
`Tool use aborted`. Unattended peer messaging — the entire product — does not work.

**Decision: blobot pre-approves the MCP servers it injected itself, and only those.** The
adapter passes `allowedTools: ['mcp__<server>']` for each entry it put in
`session/new.mcpServers`. The user's own inherited MCP servers are untouched and keep prompting
exactly as this ticket describes.

This does not weaken the posture. The prompt it removes is blobot asking the user for
permission to use blobot's own mailbox — a channel the user was already told about at team
creation, in the disclosure above, and which the orchestrator owns end to end. Prompting on
every hop would not make anyone safer; it would make `waiting` the normal state and destroy the
signal ticket 09 and ticket 12 both spent real design on.

The Agent SDK is explicit that this is a genuine bypass rather than a default we could tighten:

> `canUseTool will not be invoked for: mcp__blobot`. Bare allowedTools entries auto-approve the
> whole tool before the callback is consulted.

So this is a real hole if a server we inject is ever one we do not own. Today the only one is
ticket 15's loopback endpoint, whose handler is a function in our own process.

## Amendment (building the disclosure and the block, 2026-08-29)

**The disclosure's verbatim text names commands blobot cannot name.** Its second paragraph
promises a prompt before "a short list of commands that reach the network, change permissions,
or publish — `rm`, `sudo`, `curl`, `git push`, package installs". That list is
`OPENCODE_CONFIG_CONTENT`'s, and OpenCode is deferred (author, 2026-08-29). On the one runtime
that ships, blobot's only lever is `session/set_mode("default")` and what counts as dangerous is
Claude's own judgment. Printing the list would be blobot claiming a rule it did not write.

The same sentence had already shipped as the conversation header's posture indicator, reading
`asks before rm, git push, curl` over an agent none of it was true of. It now reads **asks
before dangerous commands**, and the disclosure says the weaker thing in full:

> Alice and Bob each get their own copy of `<folder>`, on their own branch. Inside that copy
> they can read, edit and run commands without asking you.
>
> They ask before things that reach outside that copy or cannot be undone. blobot sets each
> agent's runtime to prompt, and on Claude Code it is the CLI that decides what counts, not a
> list blobot wrote. When you are asked, the question appears in the conversation and the agent
> waits for you.
>
> They also have whatever tools your own MCP servers provide, and blobot does not prompt for
> those.
>
> blobot is not a sandbox.

Everything else this ticket decided stands: stated rather than consented to, no checkbox, at
team creation before the first agent is spawned, and exactly **Allow once** and **Reject** on
the block itself. The asymmetry paragraph comes back the day a second runtime does, and the
list with it.

## Amendment (reopened by the author, 2026-08-29): the block offers **Allow always**

The reason this ticket gave for withholding it was that `allow_always` is *"a rule the user is
authoring with nowhere to see or revoke it"*. That was an assumption about where the rule goes,
and it has now been measured rather than assumed.

Observed against a real `claude` through the pinned bridge, with an MCP server declared in the
workspace's own `.mcp.json` (`scratchpad/probe3.mts`, this session):

- The bridge offers all three on every ordinary tool call, MCP tools included:
  `{reject, reject_once} {allow, allow_once} {allow_always, allow_always}`.
- Answering `allow_always` allows the call **and writes**
  `<workspace>/.claude/settings.local.json` with `{"permissions":{"allow":["mcp__probe__blobot_ping"]}}`.
- The next call to the same tool in the same turn raised **no second request**.

So the rule has a location, in a file, in **this one agent's workspace**, and the user can read
it and delete it. It is per agent, because an AgentWorkspace is per agent: allowing something
for Alice says nothing about Bob. That is a narrower blast radius than the ticket feared, and it
is a place to point at, which is what the objection actually asked for.

**Decision: three answers on the block — allow once, allow always, reject.** `reject_always`
stays unoffered; refusing forever is the same standing rule pointed the other way and nobody has
asked for it. Neither the second nor the third button is armed, for the reason the first one
never was.

The block says where an *always* goes, in the same sentence that offers it. A standing rule the
user cannot find is the whole objection; naming the file answers it where it is being made.

`PermissionOutcome` gains `allowed_always`, because "you allowed this once" and "you allowed
this, and it stops asking" are not the same record of what happened.

### The disclosure was also wrong about MCP, and is fixed here

> They also have whatever tools your own MCP servers provide, and blobot does not prompt for
> those.

That sentence survived from this ticket's original *"MCP tools are outside all of this"*, which
the first 2026-08-29 amendment already found false under `default` mode — and it is exactly the
sentence a user would have read while watching an agent stop on an MCP call. It now says the
true thing: the user's own MCP tools are asked about like anything else, and the mailbox blobot
injects is the one exception.

## Amendment, 2026-08-30: the header's posture indicator is cut

By the author, on the working surface as built. *"Plus one quiet permanent affordance"* above is
withdrawn: `asks before dangerous commands` is gone from ticket 12's conversation header.

The reason it was there was that a disclosure gets clicked past in week one. The reason it is
gone is that the fix did not work: a sentence printed over every pane, every session, all day is
a sentence nobody reads by the second day either, and it was spending a third of the header's
one line on a fact that never changes and that nothing in the app branches on. Permanence is not
attention.

Nothing else in this ticket moves. The disclosure still carries the posture in full, stated and
not consented to, in the creation flow where it is read once before any agent exists — and the
posture itself is unchanged, since it was always a property of what blobot arranges with the
runtime and never of what the header said about it. The permission block is still where a user
meets the posture in practice: it is the one moment the sentence is about something.

## Amendment, 2026-08-30: Claude gets an allowlist too, and *"not ours to configure"* was too strong

Reopened by the author, from the working surface: an agent asked to allow `Write
src/components/desk/desk-items.ts` — a file **inside its own worktree**, on its own branch,
recoverable by git. Nothing about that call is dangerous, outside the copy, or irreversible.

### What was wrong

This ticket read `default` as *"Standard behavior, prompts for dangerous operations"*, which is
the bridge's own description of the mode, and took it at its word. It is not what the mode does.
`default` prompts on **every** `Edit`, `Write` and every `Bash` that is not already pre-approved,
regardless of path. The word *dangerous* in that table is marketing, not semantics.

Two consequences the ticket argued itself into and then failed to notice it had:

- **`waiting` became the normal state on Claude.** The ticket rejected coarse symmetry
  (`{bash: ask, edit: ask}` on OpenCode) precisely because *"every `ls` and `npm test` a prompt"*
  would spend ticket 09's only contrast inversion on the ordinary case. `default` on Claude is
  that rejected posture, arrived at by accident, on one of the two runtimes.
- **Two pieces of shipped copy were false.** The permission block said *"this reaches outside its
  own workspace or cannot be undone"* over a call that did neither, and the creation flow's
  disclosure promised *"inside that copy they can read, edit and run commands without asking
  you"* — true of an OpenCode agent, untrue of a Claude one, in the same product, at the same
  time. A disclosure that overstates protection is the failure this ticket named; one that
  overstates *freedom* is the same defect, and it is the one that shipped.

### The finding

*"Claude Code is not ours to configure"* was inferred from the bridge discarding `permissionMode`,
`canUseTool` and `allowDangerouslySkipPermissions`. But the bridge passes **`allowedTools`**
straight through, and this repo has been relying on that since ticket 15: `preApprovedTools`
pre-approves `mcp__blobot` by exactly this route, and it works. `allowedTools` takes the same rule
strings as `permissions.allow` in settings — `Edit`, `Write`, `Bash(git status:*)`.

So there was a lever all along. It is narrower than OpenCode's, and it is enough.

### Decision

**Claude sessions are handed a vouched allowlist through `_meta.claudeCode.options.allowedTools`,
alongside the `mcp__blobot` entry already there. The mode stays `default`.**

`adapters/claude/permissions.ts`, the counterpart to OpenCode's `PERMISSION_POSTURE`:

- the editing tools — `Edit`, `Write`, `MultiEdit`, `NotebookEdit` — unconditionally, because an
  AgentWorkspace is the agent's own copy in all three workspace kinds, and nothing it writes
  there is the user's working tree;
- a closed list of `Bash(<prefix>:*)` rules for the commands that are how an agent does its job:
  inspection, local git, test and build runners, ordinary file moves.

Everything else keeps prompting.

### Why an allowlist, and not the settings file this was first going to be

The obvious route was seeding `<workspace>/.claude/settings.local.json`, which the bridge already
reads (`settingSources` includes `local`) and which `allow always` already writes to. It was
rejected: an AgentWorkspace is a **checkout of the user's repository on a blobot branch**, so a
file blobot puts there is a file the agent can stage, commit and merge back. That breaks the rule
ticket 16 kept on the other runtime — *blobot writes nothing into the user's repository* — and it
breaks it in the one place where the user's own tooling would carry the leak home. `allowedTools`
is per session, in memory, and leaves nothing on disk.

It also costs something and the cost is stated: an allowlist cannot express *allow everything
except these*, so OpenCode's `bash {'*': allow}` minus seventeen patterns has no equivalent. The
Claude list is closed and enumerated, so an unlisted-but-harmless command still prompts. That is
an asymmetry in the safe direction, and it fails closed, which is the same instinct ADR-0003 used
for the palette.

**The pattern list is still a speed bump and not a boundary.** `npm run` executes a script the
agent may have just written; `sed` can write anything. That was already true of the OpenCode list
and this ticket already says so out loud. Nothing here is a guarantee, and nothing here changes
what blobot claims: **prompting only, on both runtimes.**

### The copy is corrected, not the disclosure's posture

- The permission block stops asserting a reason it cannot know. It named the two things `default`
  supposedly gates and named them wrongly; it now says what is actually true of a request that
  reached the user — blobot did not pre-approve it, and the agent is stopped until an answer.
- The disclosure keeps its shape and loses one clause. *"It is the runtime that decides what
  counts, not a list blobot wrote"* is now false on both runtimes rather than one, since blobot
  writes a list for each. It says the true thing instead, without naming commands: blobot
  vouches for the ordinary work, and the runtime asks about the rest.

Nothing else in this ticket moves. `bypassPermissions`, `acceptEdits`, `dontAsk` and `auto` remain
unoffered and unset, and `mode` stays out of `SURFACED_OPTIONS`.

## Amendment, 2026-08-30 (second): the posture is the user's, per agent, in three words

Raised by the author on reading the first amendment: *"that settings should be per
workspace/agent. we need a ui for this. a simple selector or a friendly UX for noobs."*

Both halves are granted, and the second one is the part this ticket had actually got wrong. It
decided a posture and defended it well; what it never asked is **whose decision it is.** Everything
above reads as blobot choosing on the user's behalf and then disclosing the choice — which is the
right default and a poor ceiling, because the two people this posture is wrong for are opposite:
somebody pointing agents at a repository they cannot afford to have touched, and somebody who
wants the thing to get on with it. Neither was reachable except by hand-editing a settings file
the app never mentions.

### The decision

**Three levels, on the agent, in the hire and edit dialogs:** `careful`, `normal`, `trusting`.
`normal` is what this ticket decided and stays the default, stored as nothing.

| | Claude | OpenCode |
|---|---|---|
| `careful` | `allowedTools` is empty, so `default` mode asks about every edit and command | `{edit: 'ask', bash: {'*': 'ask'}}`, the object form and never the scalar |
| `normal` | this ticket's vouched list | this ticket's rule list, verbatim |
| `trusting` | the vouched list plus the network and the installers | the same rules with those patterns flipped to `allow` |

The two adapters translate the same three words from opposite ends — Claude adds to an
allow-nothing, OpenCode subtracts from an allow-all — which is why the vocabulary is in
`core/trust.ts` and not in either of them.

### Where the ceiling is, and why the control has three rows and not four

There is no position above `trusting`, and there will not be one. The next step up is Claude's
`bypassPermissions` or OpenCode's unqualified allow, and this ticket refuses both, so the
selector ends where the refusal starts. **`rm`, `sudo`, `chmod`, `chown`, `ssh`, `scp`,
`docker`, `git push` and `git remote` ask at every level, on both runtimes**, and the copy for
`trusting` says so in the same sentence that offers it. That sentence is the ceiling made
visible: a user reading the loosest option is entitled to know it is the loosest one.

### Per agent, and deliberately not per team

An AgentWorkspace is per agent. Trusting Alice has never said anything about Bob, and a
team-wide control would say it does. So the control sits in the agent form under *how it
answers*, which is the other half of the same question about the same agent: that one is what it
says, this one is what it does. The creation flow's disclosure names the three levels and says
where they live; it does not offer them, because the screen where a consequence is taken on is
not always the screen where it is chosen.

### What this costs the block

The permission block can no longer explain itself by naming what blobot vouched for: that
sentence is false for a `careful` agent, which it vouches for nothing for. It says the thing
that is true at all three levels instead — blobot did not vouch for this one, so the runtime is
asking, and what it vouches for is what this agent is set to.

### Still not an approvals feature

The out-of-scope line above holds. This is a default made choosable, not a permissions system:
there is still no screen listing what an agent may currently do, nothing showing the
`settings.local.json` that **allow always** accumulates, and no way to revoke a standing rule
except by opening that file. And the user's own settings still outrank all three levels, which is
asserted live rather than assumed: `ask` and `deny` sit above `allow`, and every level is built
out of `allow`.
