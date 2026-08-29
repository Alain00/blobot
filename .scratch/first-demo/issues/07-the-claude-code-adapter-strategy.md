Type: grilling
Status: resolved
Blocked by: 02, 04

# The Claude Code adapter strategy

## Question

Choose Claude Code's integration path — ACP, Agent SDK, or CLI wrapper — and name what the
adapter has to absorb so that nothing outside it knows Alice is Claude.

Enumerate the specific mismatches against the normalized vocabulary and say how each is
handled. Where Claude cannot produce an event the vocabulary has, decide whether the adapter
synthesises it, omits it, or the vocabulary changes.

A path that works but leaks provider knowledge into the orchestrator fails this ticket.

## Answer

**Path:** `@agentclientprotocol/claude-agent-acp@0.70.0` over stdio, settled by ticket 02. This
ticket covers what the adapter absorbs so that nothing outside it knows Alice is Claude.

### Claude's own subagents run, and we do not look inside

Claude Code's `Task` tool spawns nested agents. The bridge can surface them via
`_meta.claudeCode.parentToolUseId` + `subagent: true`, opt-in through
`clientCapabilities._meta["subagent-transcript"]`.

**We do not subscribe.** Subagents run; blobot sees the parent tool call and nothing more.

Subscribing would put a Claude-only concept into the event stream — the exact leak the
vocabulary exists to prevent — and render as a hierarchy the UI has no counterpart for on
OpenCode. Disabling `Task` was the other tempting option and is worse: subagents are much of why
Claude Code is good at real work, and crippling the runtime to tidy our model makes Bob worse at
his job for no user-visible gain.

Bob's internals are his own business. That is the adapter boundary working as intended.

### Bob inherits the user's entire Claude Code configuration

The bridge merges the user's own settings (`{...userProvidedOptions?.mcpServers, ...mcpServers}`)
and a `SettingsManager` merges user and project settings. Bob therefore gets the user's global MCP
servers, hooks and skills, plus any `CLAUDE.md` in his AgentWorkspace.

**We inherit all of it.** It is the honest reading of "agents use the user's existing local
setup" — those MCP servers were installed because the user wants their agents to have them, and a
Bob who cannot use their tooling is a worse Bob than the `claude` in their terminal.

Three consequences, stated rather than discovered later:

- The repo's own `CLAUDE.md` applies to Bob. This is **good** — blobot inherits project
  conventions for free.
- The user's global **hooks fire on Bob's turns, unwatched**. A genuine surprise vector.
- Bob and OpenCode-Alice become **meaningfully unequal in capability**. That is real, it is a
  property of the user's machine, and blobot should not paper over it.

### Dependency posture

Exact-pinned normal dependency — `0.70.0`, no caret — plus a version-compat check at startup that
**fails loudly with a useful message**, never falling through to a degraded path. The package
renamed once already and ships ~64 releases in five months.

Rejected: requiring the user to install it adds a manual step to a zero-setup product, for a
component they have no reason to know exists. Vendoring means owning a 2.4k-star codebase we
cannot maintain, and losing upstream fixes.

**Pin `CLAUDE_CODE_EXECUTABLE` to the user's own binary**, or the bridge silently runs its own
bundled ~200MB Claude, version-drifted from what the user has installed.

### One bridge process per agent

Uniformly, regardless of what each runtime supports — even though OpenCode binds `cwd` per session
and could serve several AgentWorkspaces from one process.

Sharing is a premature optimisation that buys memory we are not short of and costs the thing we
can least afford: a shared process is a shared blast radius, so one agent's crash takes out three,
and per-agent cancellation becomes bookkeeping instead of a `kill`. One process per agent makes
`stop()` honest, `failed` genuinely per-agent, and the two runtimes behave identically.

Revisit if someone runs ten agents and notices.

### Carried forward

The bridge is a third party on the critical path with no Anthropic involvement, and Anthropic's
Pro/Max coverage of Agent SDK usage was announced-then-paused. Both belong in the README as
honesty, not in the architecture as a hedge.

## Amendment (observed while building, 2026-08-29)

**Two inherited tools are disallowed: `SendMessage` and `ListAgents`.**

"We inherit all of it" holds for MCP servers, hooks, skills and `CLAUDE.md`. It does not hold
for these two, which are Claude Code's *own* inter-session messaging — they reach other Claude
sessions on the machine.

Observed live, before the exclusion: asked to message Bob, Alice ignored blobot's
`message_agent` entirely, called `ListAgents`, found three unrelated Claude sessions belonging
to the user, and told the user Bob was unreachable. Not a near-miss — a confident wrong answer
produced by a tool that looked more native than ours.

The permanent rule in `CLAUDE.md` decides it: **the orchestrator owns agent-to-agent
communication.** These two are a second, unowned channel for exactly that — messages that never
reach the mailbox, never persist, never appear in the UI, and are invisible to the turn budget.
Passed as `disallowedTools` in `_meta.claudeCode.options`. Nothing else is excluded.
