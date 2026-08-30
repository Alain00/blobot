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
