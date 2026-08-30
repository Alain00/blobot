# fx as a third runtime

Raised by the author, 2026-08-30: *"investigate if we can incorporate fx by vercel as a runtime"*.

**fx** is Vercel Labs' coding agent: a ~7 MiB native binary written in Zig, Apache-2.0, open
sourced 2026-08-17 at [fx.sh](https://fx.sh) and [vercel-labs/fx](https://github.com/vercel-labs/fx).
It is model and provider agnostic, keeps sessions and usage local, and ships an ACP server.

## The finding

**Yes, and it is the cheapest of the three adapters**, because `fx acp` is real ACP over stdio
and `packages/core/src/adapters/acp` already holds the whole shared half: JSON-RPC, the child
transport, the wire shapes, the `session/update` translation and the config-option reader. Most
of what the Claude and OpenCode adapters had to invent, fx hands over on the protocol.

Not observed: fx is not installed on this machine (`which fx` finds nothing). Everything below
is read out of the published documentation and the Zig source, and none of it has been run.

## What lines up, with no new machinery

- **`fx acp`** speaks newline-delimited JSON-RPC 2.0 on stdio, protocol version 1, stdout
  reserved for the protocol and diagnostics to `--log-file`. Input messages are capped at 8 MiB.
- **One process per agent, cwd is the workspace.** The client process's working directory *is*
  the primary workspace, and the docs say to launch one server per workspace. That is already
  blobot's shape: an AgentWorkspace per agent, a runtime per agent.
- **Resume is better than Claude's.** `session/load` replays history; **`session/resume`
  reconnects without replaying it**. The transcript-muting the Claude adapter needs on resume
  has no counterpart here.
- **The loopback MCP server works as it stands.** "ACP sessions use only the `mcpServers`
  supplied by the client. They do not inherit servers from `~/.fx/mcp.json`." HTTP servers carry
  a `headers` array (`src/acp/sessions.zig:1822`), so ticket 15's per-agent bearer token, which
  *is* the caller's identity, travels unchanged.
- **Model choice has a home.** `session/new` answers with `configOptions` (provider, model, mode)
  and a `modes` block, applied through `session/set_config_option`, which is what
  `adapters/acp/config-options.ts` already reads. Reasoning effort exists inside fx but is not
  advertised over ACP, so ADR-0002's option groups would show two entries here, not three.
- **Detection and its remedies fit ticket 11 exactly.** `fx status --json` and `fx doctor --json`
  for state, `fx login` (or `fx login codex` / `fx login grok`) for the sign-in, and the vendor's
  own published installer, `curl -fsSL https://fx.sh/setup.sh | bash`, which lands in
  `~/.local/bin` -- already in the cascade `detectRuntimes` searches.

**The permanent rules survive.** fx reaches models through the user's own login: a Vercel AI
Gateway credential in `~/.fx/auth.json`, or a ChatGPT or Grok subscription they already pay for.
blobot provides no inference and proxies no credential, exactly as with Claude's subscription.
Vercel is in the name and not in the data path.

## What does not line up

Two things, and they are the whole of the design work.

**There is no per-session system prompt.** Claude takes one in `_meta`
(`claude-agent-runtime.ts:359`); OpenCode takes an agent definition through
`OPENCODE_CONFIG_CONTENT`. fx has neither. Its system prompt is `cfg.prompt_policy.system_prompt`,
compiled in (`src/core/config/prompt_policy.zig`), and the docs say plainly that fx "does not
expose the exact internal system prompt as a user setting". `session/new` accepts `cwd` and
`mcpServers` and nothing persona-shaped; the only `_meta` its ACP layer reads is
`_meta.fx.continueRecovery`. **A persona is how blobot makes an agent a member of a team**, so
this is not a nicety. Ticket 01.

**Ticket 14's posture translates coarsely.** fx has three modes -- `ask`, `auto` (the default)
and `yolo` -- and `FX_PERMISSION_MODE` sets the mode per process, which is clean. Rules are a
different matter: wildcard allow/deny lists that live only in `~/.fx/settings.json`, globally or
under a workspace profile, and project `.fx.json` files are explicitly forbidden from defining
them. There is no per-process equivalent of Claude's `allowedTools` or OpenCode's config posture,
so blobot cannot vouch for the ordinary work without touching a file that is the user's.
`auto` is not the way out: it spends a second, billed model request per unresolved call, on a
reviewer model that is fixed by the provider and not configurable. Tickets 02 and 03.

## Tickets

- `01` The persona has no channel.
- `02` Three words of trust, three modes of fx.
- `03` May blobot write to `~/.fx/settings.json`?
- `04` Provider is a config option, and it is account-wide.
- `05` The adapter itself. Blocked by all four.

## Out of scope

- **The WebAssembly SDK.** fx builds `fx-core.wasm` and `fx-term.wasm` for JavaScript hosts, and
  a host can supply its own network transport, session storage, configuration and permission
  handling -- which would answer 01, 02 and 03 at once. It is also a completely different
  integration from `AgentRuntime` over a child process, it would make blobot the thing running
  inference rather than the thing watching a CLI, and the permanent rule says ACP first and CLI
  adapters as the fallback. Revisit only if 01 has no acceptable answer.
- **fx's own subagents.** fx can spawn and manage child sessions. blobot owns agent-to-agent
  communication; a second orchestrator underneath ours is not something to reach for.
