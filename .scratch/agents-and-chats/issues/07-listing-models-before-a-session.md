Type: research
Status: resolved
Blocked by: none

# Can each runtime list its models before a session exists?

## Question

Creation asks for **runtime and model** and nothing else before the DM opens. Today the model
and effort option groups reach the UI from what the adapter's runtime advertises on
`session/new` (`adapters/*/options` and `session/set_config_option`), which means a session had
to exist first. For a fresh Agent there is none.

For each of the five runtimes (Claude via `@agentclientprotocol/claude-agent-acp`, Codex via
`@agentclientprotocol/codex-acp`, OpenCode `opencode acp`, fx `fx acp`, Cursor `cursor-agent
acp`), find:

1. Whether the ACP `initialize` response, or any method before `session/new`, carries the model
   list, and what the pinned bridge versions in `packages/core/package.json` actually send.
2. Whether the CLI has a zero-cost, non-interactive way to list models (`claude --help`, `codex
   models`?, `opencode models`, `fx models`, `cursor-agent models`?), what it prints, and whether
   it needs the user to be signed in.
3. Whether opening a throwaway session (`session/new` then close, no prompt) costs tokens on
   any of them, and how long it takes on this machine.
4. What happens to a chosen model that the runtime later refuses on `set_config_option`.

Measure on this machine where a probe is free of tokens; read the bridge sources and the ACP
schema (`context7` or the package in `node_modules`) for the rest. Write the findings to
`.scratch/agents-and-chats/research/listing-models.md` with a table, one row per runtime, and a
recommendation: the cheapest honest way to offer a model picker with no session.

## Answer

No runtime lists models before a session: ACP 1.4.0's `initialize` carries no model field and
has no list method, and all five servers honour that literally — `session/new` is the first
message with `configOptions` (measured on every one, 2026-09-03). Four of the five CLIs have a
free list subcommand (`codex debug models`, `opencode models`, `fx models`, `cursor-agent
models`; Claude has none), but each prints a different vocabulary and Cursor's 219 flattened ids
are not the 37 bracketed values its `set_config_option` accepts. So the cheapest **honest**
picker is a **throwaway ACP session through the adapter's own spawn path** — `initialize`,
`session/new` in a scratch cwd of blobot's with `mcpServers: []`, read `configOptions`, close or
kill — cached per runtime and refreshed on demand. It costs no tokens by construction (no
prompt is ever sent) and 0.3 s (Codex) to 0.9 s (Claude), 1.7 s (OpenCode), 2.5–4.3 s (Cursor)
on this machine; a value from that list is valid by construction, and a stale one is already
skipped with a warning by `applyOptionChoices`, so a refused model never fails a launch. Empty
picker is never a refusal to create the Agent; taking the runtime's default stores nothing.
Unverified: signed-out behaviour of each CLI list, whether Cursor's `session/new` creates a chat
server-side, and Cursor's refusal shape.

Findings, table and sources: `.scratch/agents-and-chats/research/listing-models.md`.
