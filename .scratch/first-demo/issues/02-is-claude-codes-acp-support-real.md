Type: research
Status: resolved
Findings: ../research/02-claude-code-acp.md

# Is Claude Code's ACP support real?

## Question

The plan prefers ACP everywhere and treats a Claude CLI adapter as a fallback. Which is it
actually, as of now?

Establish: does Claude Code ship a usable ACP mode (and under what command/flag), or is the
practical integration path the Agent SDK / a CLI wrapper? What does each path give and cost
— streaming granularity, session resumption, cancellation, tool visibility, custom tool
injection, and whether it can use the user's existing local authentication without any
credential handling by us.

Version on the dev machine is `claude 2.1.251`.

## Answer

**Claude Code has no native ACP mode — but ACP is still the right path, via the official
bridge.**

`claude 2.1.251` ships nothing ACP: no flag, no subcommand, and zero `agent-client-protocol`
strings in the 214MB binary (verified by `strings` sweep, not inference).
`anthropics/claude-code#6686` ("Add support for ACP", 551 reactions) was **closed 2026-02-09**.
No native ACP is coming.

**Decision: `@agentclientprotocol/claude-agent-acp@0.70.0` over stdio, with
`CLAUDE_CODE_EXECUTABLE` pinned to the user's own binary.** By default the package runs the
SDK's *own* bundled Claude — ~200MB and version-drifted from the user's install — which
violates "agents use the user's existing local authentication" in spirit. Pin it.

Note the rename: `@zed-industries/claude-code-acp` is **deprecated** in favour of this
package (published 2026-08-18, ~64 releases since March, 2.4k stars), wrapping the official
`@anthropic-ai/claude-agent-sdk@0.3.232`.

### Verified live against 0.70.0, hand-driven over stdio

- **Token-level deltas** — `agent_message_chunk` arrived as `"P"` then `"ONG"`. Thinking
  streams separately as `agent_thought_chunk`.
- **Custom tool injection works** — a stdio MCP server exposing `blobot_mailbox_send`, passed
  in `session/new.mcpServers`, was called by Claude. Alice→Bob messaging can be a real tool
  blobot owns, on both runtimes.
- **Tool-call lifecycle is first-class** — `tool_call` (pending) → `tool_call_update` with
  *incrementally streamed* `rawInput` → `tool_call_update` (completed), stable `toolCallId`.
- **Cancellation** — `session/cancel` mid-stream resolved the prompt with
  `stopReason: "cancelled"`; process stayed alive.
- **Cross-process resume** — process A stored a codeword, was killed; process B `session/load`'d
  the same id, got the transcript replayed, and answered correctly.
- **Per-session personas** — `_meta.systemPrompt` plus `_meta.claudeCode.options`.
- **Auth: nothing for us to hold.** No `ANTHROPIC_*` env vars; it rode
  `~/.claude/.credentials.json`. `initialize` returned `"authMethods": []`.

### Tradeoffs, named

A Zed/JetBrains-governed third party now sits between us and Anthropic, with no Anthropic
involvement and no native ACP coming. The package renamed once already — **pin an exact
version**. Persona injection is off-spec `_meta`, so it stays inside the adapter and out of
the shared interface. One extra Node 22+ process hop per agent.

**Fallback is the Agent SDK, not the CLI.** `claude -p` has **no in-turn cancellation** —
killing the process is the only option — which disqualifies it for a multi-agent app.

### Commercial risk to carry in the README

Anthropic announced Pro/Max would stop covering Agent SDK usage from 2026-06-15, then
**paused it**; the support article currently says "nothing has changed." This hits every
Claude path equally, so it is an honesty issue, not a path-selection one.

Full findings: `../research/02-claude-code-acp.md`
