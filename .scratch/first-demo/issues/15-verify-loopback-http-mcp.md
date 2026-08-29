Type: research
Status: resolved

# Verify loopback HTTP MCP against both runtimes

## Question

Ticket 05 chose **loopback HTTP** as the transport for blobot's MCP server — the orchestrator
listens on `127.0.0.1:<port>` and is itself the tool handler, rather than each agent spawning a
stdio child that has to forward calls back.

That decision rests on an untested capability. The earlier research verified **stdio**
end-to-end on both runtimes, but loopback HTTP is only *advertised* — both report
`mcpCapabilities: {http: true, sse: true}`, and neither was driven that way.

Verify end-to-end, on both OpenCode 1.18.4 and `@agentclientprotocol/claude-agent-acp@0.70.0`:
an HTTP MCP server passed via `session/new.mcpServers`, its tool discovered in `tools/list`,
and the tool actually **invoked** during a real prompt turn — invocation, not just discovery,
since the earlier work verified discovery only.

Establish also: whether a bearer token in `headers` is honoured; how the agent behaves when the
server is unreachable or slow; and whether `mcpServers` must be re-supplied identically on
`session/load`.

**If HTTP fails on either runtime, ticket 05's transport decision inverts to stdio** — and that
brings back the per-agent child process and the IPC channel it needs. This ticket is therefore
a gate on implementation, not a detail.

## Answer

**VIABLE on both runtimes. Ticket 05's transport decision stands.**

Verified end to end with real authenticated model turns against a plain `node:http` server on
`127.0.0.1` (no MCP SDK), on both OpenCode 1.18.4 and `claude-agent-acp@0.70.0` driving the user's
own `claude` 2.1.251 (confirmed via the `user-agent` the server logged). `{type:"http", url,
headers}` accepted at `session/new`, MCP handshake, `tools/list`, and **the model actually invoked
the tool and got the result back into context** — invocation, not merely discovery.

**Bearer token honoured on 6/6 requests on each runtime**, including the GET SSE stream, which a
naive server implementation would leave unguarded.

**Namespacing is transport-independent** — `blobot_message_agent` (OpenCode),
`mcp__blobot__message_agent` (Claude). Name the server `blobot` and the tool `message_agent`, not
`blobot_message_agent`, or OpenCode doubles the prefix.

### Four hazards — none threaten the transport, all change what the orchestrator must build

**1. Silent failure at `session/new`, on both.** A dead port or a 401 produces a normal `sessionId`
with no error, no warning, and nothing in the ACP stream. The agent simply has no tool and tells the
user it lacks the capability. `NewSessionResponse` has no field for this even in principle.

→ **The orchestrator must treat the inbound MCP `initialize`/`tools/list` as the readiness signal.**
An agent whose session was created but never handshaked back is misconfigured, and only we can know
it. (Claude at least injects `HTTP 401 AUTH_HEADER_REJECTED` into the model's own context — but only
there, never into ACP.)

**2. Neither runtime re-handshakes after a transport drop.** Following an orchestrator restart, both
POST `tools/call` straight at the new process with no `initialize` and no session id.

→ **Our endpoint must be stateless.** A stock `StreamableHTTPServerTransport` with session
management would 404 here and break after every restart.

**3. A mid-turn drop stalls the turn for the full timeout — 60s (OpenCode), 120s (Claude).** Neither
notices the closed socket. Both then report cleanly via `tool_call_update` `status: "failed"`
(`MCP error -32001: Request timed out`; `transport dropped mid-call; response … was lost`), the turn
survives, and both models flagged the at-most-once ambiguity unprompted.

→ **`messageAgent` needs an idempotency key, and the handler must never block.**

**4. `session/load` requires `mcpServers` to be re-supplied.** The HTTP entry survives fine when it
is — full fresh handshake, tool invoked in turn 2. Omit it and the tool vanishes while replayed
history still shows the model having used it.

### Confound worth acting on

Both agents **inherited the user's own MCP config** — ACP `mcpServers` merges rather than replaces.
Consistent with ticket 07's decision to inherit the user's setup, but we will want the
`--strict-mcp-config` equivalent available for the demo mode and for tests.

### Not tested

`type:"sse"`; SSE-framed responses; a *changed* HTTP entry on `session/load` (relevant because our
port may move between runs — likely fine, but inferred); `tools/list_changed`; slow-but-alive
servers; concurrent agents on one port.

Full findings and 14 transcript pairs: `../research/15-loopback-http-mcp.md`
