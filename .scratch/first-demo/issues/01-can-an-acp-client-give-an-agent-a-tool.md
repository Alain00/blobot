Type: research
Status: resolved
Findings: ../research/01-acp-client-tools.md

# Can an ACP client give an agent a tool?

## Question

Async agent-to-agent messaging requires Alice to be able to *call* something like
`messageAgent({ agent, message })`. The orchestrator owns that call — but the agent has to
be able to invoke it in the first place.

Does the Agent Client Protocol let the **client** (blobot) expose tools *to* the agent, or
does it only let the agent request permission for tools it already has? If it does, what is
the exact surface — declaration at session creation, per-prompt, JSON-RPC method names,
result shape? If it does not, what escape hatches exist (a locally-spawned MCP server the
agent is pointed at, prompt-level convention, something else)?

Answer with concrete protocol citations, not impressions. This is the single fact the
messaging design hangs on.

## Answer

**Yes — but not with an ACP tool primitive. Via MCP, and that is the protocol's prescribed
path rather than a workaround.**

ACP has no client-side tool declaration. The generated method manifests carry no
`tools/register`, and neither `NewSessionRequest` nor `PromptRequest` has a tools field. The
agent declares and executes tools; the client observes them (`session/update` carrying
`ToolCall`), vetoes them (`session/request_permission`), and **supplies** them through
`session/new`'s `mcpServers` field.

`mcpServers: McpServer[]` accepts stdio `{name, command, args, env}`, `{type:"http", url,
headers}` and `{type:"sse", ...}`. It is **session-creation-time only** — `session/prompt`
has no tool surface, so a team's roster is fixed for the life of a session unless we
re-create it. The response does not echo discovered tools, so the MCP server must be
instrumented if we want confirmation that the agent actually saw `messageAgent`.

This is the working group's explicit intent: ACP v2 *deleted* `fs/*` and `terminal/*` and
told clients to express client-side capabilities as MCP servers instead.

**Rejected alternatives.** The permission flow returns `{outcome, optionId}` with no payload
— a veto, not a call. Elicitation runs the wrong direction. Prompt markers work but are
strictly worse. `mcp/connect` over ACP is exactly our use case and has an accepted RFD, but
every type is marked removable, lives only in `schema.unstable.json`, and neither provider
advertises it — do not build on it.

**Provider parity is verified, not assumed.** A live `opencode acp` handshake showed
OpenCode 1.18.4 spawning a client-provided stdio MCP server during `session/new`, speaking
MCP `2025-11-25`, and calling `tools/list` with a `messageAgent` tool enumerated. Both
providers advertise `mcpCapabilities: {http: true, sse: true}`, stdio implicit. Client-provided
MCP therefore sits **above** the adapter boundary — the orchestrator can own it.

**One trap, worth acting on.** `claude-code-acp` 0.16.2 branches on `"type" in server` for
http/sse and `!("type" in server)` for stdio. A server sent as `{"type":"stdio", ...}` matches
neither branch and is **silently dropped** — no error, `session/new` still succeeds. OpenCode
accepts both forms. Rule: omit `type` for stdio under v1. This inverts under v2, where `type`
is required, so the shape decision stays inside the adapter, keyed on protocol version.

**Verified only to discovery.** The tool was enumerated, not invoked — driving a real prompt
turn needs a live model call. `tools/list_changed` support and loopback-HTTP MCP against
OpenCode remain untested.

Full findings: `../research/01-acp-client-tools.md`

### Correction (from ticket 02)

The stdio `type` trap above was observed in `@zed-industries/claude-code-acp@0.16.2`, which
is **deprecated**. The live package is `@agentclientprotocol/claude-agent-acp@0.70.0`, where
custom MCP tool injection was verified working. Do not carry the 0.16.2 workaround forward
without re-testing it against 0.70.0. The rest of this answer — MCP as the prescribed path,
`session/new.mcpServers` as the surface, session-creation-time only — stands.
