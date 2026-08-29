Type: research
Status: claimed

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
