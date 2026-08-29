# 01 — Can an ACP client give an agent a tool?

Research findings for `issues/01-can-an-acp-client-give-an-agent-a-tool.md`.
Date: 2026-08-29. Sources: `zed-industries/agent-client-protocol` @ `main` (JSON Schema +
RFDs + protocol docs), `zed-industries/claude-code-acp` @ `main` (v0.16.2), and a live
handshake against locally installed OpenCode 1.18.4.

---

## Short answer

**Yes — but not with a bespoke "client tool" primitive.** ACP has no method for the client
to declare a tool schema directly. What it has instead is a first-class, spec-blessed hole:
the client hands the agent **MCP server configurations** at session creation, via
`session/new.mcpServers`. The agent connects to those servers and their tools become
ordinary tools in the agent's tool list.

So option (a) from the ticket — "blobot spawns a local MCP server the agent connects to" —
is not an escape hatch or a workaround. **It is the mechanism the protocol prescribes.** The
ACP v2 migration document states this in as many words:

> Clients that want to expose file access, unsaved editor state, or command execution to
> agents should do so by providing an **MCP server** to the session (via `mcpServers` on
> `session/new` / `session/resume`), which puts those tools on the same footing as every
> other tool the Agent uses.
>
> — `docs/protocol/v2/migration.mdx`, § "Client file system and terminal execution removed"

That sentence is load-bearing for blobot: in v2 the ACP working group *deleted* the
purpose-built client-side capability surface (`fs/*`, `terminal/*`) and told clients to
express client-side capabilities as MCP servers instead. Client-provided MCP is the
direction the protocol is moving toward, not away from.

Empirically confirmed against real OpenCode below.

---

## 1. Direction of tool traffic in ACP

Definitive source: the generated method manifests, `schema/v1/meta.json` and
`schema/v2/meta.json`, which enumerate every method and which side implements it.

**v1 stable (`schema/v1/meta.json`)**

```json
"agentMethods": {
  "initialize": "initialize", "authenticate": "authenticate",
  "session_new": "session/new", "session_load": "session/load",
  "session_set_mode": "session/set_mode",
  "session_set_config_option": "session/set_config_option",
  "session_prompt": "session/prompt", "session_cancel": "session/cancel",
  "session_list": "session/list", "session_delete": "session/delete",
  "session_resume": "session/resume", "session_close": "session/close",
  "logout": "logout"
},
"clientMethods": {
  "session_request_permission": "session/request_permission",
  "session_update": "session/update",
  "fs_write_text_file": "fs/write_text_file", "fs_read_text_file": "fs/read_text_file",
  "terminal_create": "terminal/create", "terminal_output": "terminal/output",
  "terminal_release": "terminal/release", "terminal_wait_for_exit": "terminal/wait_for_exit",
  "terminal_kill": "terminal/kill",
  "elicitation_create": "elicitation/create", "elicitation_complete": "elicitation/complete"
}
```

**v2 stable (`schema/v2/meta.json`)** — `clientMethods` shrinks to exactly four:
`session/request_permission`, `session/update`, `elicitation/create`,
`elicitation/complete`. All `fs/*` and `terminal/*` are gone.

Reading off that manifest:

- **Neither version has any method by which the client declares a tool, its name, or its
  JSON input schema to the agent.** There is no `tools/list`, no `session/register_tool`,
  no `tools` field anywhere in `NewSessionRequest` or `PromptRequest`. I checked the
  `$defs` of both stable schemas; the only tool-shaped types are `ToolCall`,
  `ToolCallUpdate`, `ToolCallId`, `ToolCallStatus`, `ToolCallContent`, `ToolCallLocation`,
  `ToolKind` — all *reporting* types.
- **Tools are declared and executed agent-side.** The agent tells the client what it is
  doing, after the fact or in progress, through `session/update` notifications carrying
  `ToolCall` / `ToolCallUpdate` payloads (`ToolCall` description: *"Represents a tool call
  that the language model has requested. Tool calls are actions that **the agent executes**
  on behalf of the language model"* — `schema/v1/schema.json`, `$defs.ToolCall`). That
  traffic is agent → client, display-only.
- **The client's only inbound authority over a tool call is veto.**
  `session/request_permission` (`"x-side": "client"`) lets the agent ask before doing
  something sensitive. See §3(b) for why that is not a tool-invocation channel.
- **The one client → agent channel that carries tool *capability* is `session/new`**, and
  it carries it indirectly, as MCP server configuration.

So: agent declares and executes; client observes, vetoes, and — via MCP — *supplies*.

---

## 2. The exact surface: `session/new.mcpServers`

### 2.1 Where it is declared

At **session creation**, not per prompt. `PromptRequest` (`session/prompt`) has exactly
three fields — `sessionId`, `prompt`, `_meta` — and no tool surface at all
(`schema/v1/schema.json`, `$defs.PromptRequest`). Tools are fixed for the life of a session
(modulo MCP's own `notifications/tools/list_changed`, see §2.5).

`NewSessionRequest` (`schema/v1/schema.json`, `"x-method": "session/new"`,
`"x-side": "agent"`):

| field | type | required (v1) | required (v2) |
|---|---|---|---|
| `cwd` | absolute path string | yes | yes |
| `additionalDirectories` | `string[]` | no | no |
| `mcpServers` | `McpServer[]` | **yes** (may be `[]`) | no (optional) |
| `_meta` | object/null | no | no |

`mcpServers` description, verbatim: *"List of MCP (Model Context Protocol) servers the
agent should connect to."* The v2 migration doc notes the change: *"`mcpServers` was
required (even if empty) on `session/new` in v1 and is now optional. Omitting it and
sending `[]` are equivalent."*

`session/resume` (and v1's `session/load`) take the same environment parameters, so the
server set must be re-supplied on resume — see §5.

### 2.2 The `McpServer` payload shapes

`McpServer` is a discriminated union on `type`. **v1 stable** (`$defs.McpServer`) has three
variants:

```jsonc
// stdio — "All Agents MUST support this transport."  (the `type` discriminator is
// OPTIONAL in v1: the stdio variant is the untagged fallback branch)
{
  "name": "blobot",                 // required, human-readable id for the server
  "command": "/abs/path/to/exe",    // required, ABSOLUTE path to the executable
  "args": ["--stdio"],              // required (may be [])
  "env": [{ "name": "FOO", "value": "bar" }],  // required (may be []); array of {name,value}
  "_meta": null
}

// http — only if agentCapabilities.mcpCapabilities.http === true
{ "type": "http", "name": "...", "url": "https://...", "headers": [{"name":"...","value":"..."}] }

// sse  — only if agentCapabilities.mcpCapabilities.sse === true
{ "type": "sse",  "name": "...", "url": "https://...", "headers": [...] }
```

Note `env` and `headers` are **arrays of `{name, value}` objects**, not maps. This trips
people up.

**v2 stable** drops `sse`, makes the `type` discriminator **required** on every variant
(including `"stdio"`), adds an open-ended `other` variant for forward compatibility, and
moves capability advertisement from `agentCapabilities.mcpCapabilities` to
`capabilities.session.mcp` with presence-objects instead of booleans
(`{"stdio": {}, "http": {}}`).

### 2.3 The result shape

`NewSessionResponse`: `{ sessionId, modes?, configOptions?, _meta? }`. **The agent does not
echo back the tools it discovered.** There is no protocol-level confirmation that your MCP
server was connected or that its tools were registered. The only signals available are
out-of-band: your own MCP server observing an `initialize` + `tools/list` from the agent
(this is what I used to verify, §4), and later `ToolCall` updates naming your tool.

This matters for blobot: **if you need to know whether `messageAgent` is actually live for
an agent, instrument the MCP server, not the ACP client.**

### 2.4 Capability gate

Read `initialize`'s response. v1 `AgentCapabilities.mcpCapabilities` is
`{ http: bool, sse: bool }` — note there is **no `stdio` flag in v1, because stdio is
mandatory**: the schema says of the stdio variant, *"All Agents MUST support this
transport."* In v2, stdio became an explicit opt-out capability
(`capabilities.session.mcp.stdio`) *"so agents that cannot launch subprocesses can opt
out"*. Practically: for v1 agents you may assume stdio; for v2 agents you must check.

### 2.5 Changing the tool set mid-session

There is no ACP method for it. But because the transport underneath is real MCP, the
standard MCP `notifications/tools/list_changed` notification is available to your server,
and `tools/call` results are ordinary MCP results. Whether a given agent honours
`list_changed` is an implementation question I did **not** verify for either provider —
treat it as unknown.

---

## 3. Evaluating the other candidate mechanisms

### (a) A local MCP server blobot spawns — **RECOMMENDED**

Covered above. Two sub-flavours:

1. **stdio (recommended).** blobot passes `{name, command, args, env}` in
   `session/new.mcpServers`; **the agent spawns the process**, not blobot. The tool handler
   therefore runs in a child of the agent CLI, not inside Electron's main process, so it
   needs a channel back to the orchestrator (a unix socket / named pipe / loopback HTTP
   port, whose address you inject via `env`). Universally supported.
2. **http.** blobot runs a loopback HTTP MCP endpoint inside the Electron main process and
   passes `{type:"http", url:"http://127.0.0.1:PORT/mcp", headers:[{name:"Authorization",…}]}`.
   No child process, no IPC hop — the tool handler *is* the orchestrator. Gated on
   `mcpCapabilities.http`, which **both** providers advertise as `true` (verified, §4).
   Bind to `127.0.0.1` and require a per-session bearer token in `headers`, since any local
   process could otherwise reach it.

For blobot's `messageAgent`, the HTTP variant is the better fit: the tool call needs to
reach the orchestrator's in-memory state and wake Bob, and stdio would force you to build a
second IPC hop to do it. Keep stdio as the fallback for any agent that only advertises
stdio.

### (b) Repurposing `session/request_permission` — **NO**

Ruled out by shape. `RequestPermissionRequest` = `{sessionId, toolCall: ToolCallUpdate,
options: PermissionOption[]}`; `RequestPermissionResponse` = `{outcome}` where
`RequestPermissionOutcome` is a two-variant union: `{outcome: "cancelled"}` or
`{outcome: "selected", optionId}`. **The client's response carries no payload** — only the
id of one of the options the *agent* offered. You cannot return data, and the flow only
ever fires for a tool the agent already has. It is a veto, not a call. Confirmed against
`schema/v1/schema.json` `$defs.RequestPermissionOutcome` and `$defs.SelectedPermissionOutcome`.

### (c) Prompt-level marker convention — **works, but strictly worse**

Nothing in the protocol forbids instructing the agent (via the system prompt or the user
message) to emit `<<<MESSAGE_AGENT>{"agent":"Bob",...}<<<` and parsing it out of the
`agent_message_chunk` stream. Costs: no schema validation, no structured arguments, no
result returned into the model's context (so Alice can't see "delivered"), the marker leaks
into rendered transcripts, and it depends on model compliance rather than tool-calling
machinery. Use only as a degradation path for a provider that supports neither stdio nor
HTTP MCP. No such provider is currently in scope.

### (d) MCP-over-ACP (`mcp/connect` / `mcp/message` / `mcp/disconnect`) — **the right answer, in the future**

The ACP working group has an accepted RFD, `docs/rfds/mcp-over-acp.mdx` (author:
nikomatsakis), adding `"acp"` as an MCP transport so the client can serve MCP **over the
existing ACP stdio channel** — no port, no child process, no side channel. Its motivation
is exactly blobot's use case:

> This would allow a client, for example, to create custom MCP tools that are tailored to a
> specific request and which live in the client's address space. […] The only way to combine
> ACP and MCP today is to use some sort of "backdoor", such as opening an HTTP port for the
> agent to connect to or providing a binary that communicates with IPC.

Surface (from `schema/v2/schema.unstable.json`; note the schema says `serverId`, while the
older RFD prose says `id`/`acpId` — **trust the schema**):

- Declared in `session/new.mcpServers` as `{"type":"acp", "name":"blobot", "serverId":"<uuid>"}`
  (`$defs.McpServerAcp`, required: `name`, `serverId`).
- Gated on `capabilities.session.mcp.acp` (v2) / `mcpCapabilities.acp` (v1 unstable).
- `mcp/connect` — **agent → client** (`"x-side": "client"`), params `{serverId}`, result
  `{connectionId}`.
- `mcp/message` — **bidirectional** (`"x-side": "both"`), params
  `{connectionId, method, params?}` where `method`/`params` are the *inner MCP* message
  flattened in; request vs notification is decided by presence of a JSON-RPC `id`; the
  result is the raw inner MCP result payload.
- `mcp/disconnect` — agent → client, params `{connectionId}`, result `{}`.

**Status: UNSTABLE.** Every one of these types is marked, verbatim, *"This capability is not
part of the spec yet, and may be removed or changed at any point."* They appear only in
`schema.unstable.json`; `schema/v1/schema.json` and `schema/v2/schema.json` (stable) contain
no `McpServerAcp`, no `mcp/*` methods. And neither OpenCode 1.18.4 nor claude-code-acp
0.16.2 advertises `mcpCapabilities.acp` (§4). **Do not build on it now.** Do design the
provider adapter so the transport choice (stdio / http / acp) is an adapter-internal detail,
so this becomes a one-adapter change when it stabilises.

### (e) Elicitation — **NO, wrong direction**

`elicitation/create` is a *client* method, i.e. **agent → client**: *"Request from the agent
to elicit structured user input"* (`$defs.CreateElicitationRequest`). It's the agent asking
the human a question via a form or a URL. It cannot originate a call from the agent's model
into blobot's logic with a result fed back to the model, and it is user-facing by
construction.

### (f) Provider-native MCP config files — **works, but violates blobot's architecture rule**

Both CLIs read MCP servers from their own config (`opencode mcp`, Claude Code's `.mcp.json`
/ `--mcp-config`). This would work, but it is provider-specific by definition and would put
provider knowledge outside the adapter. `session/new.mcpServers` gets the same result
provider-agnostically. Prefer it.

---

## 4. Provider parity: OpenCode vs Claude Code

### Method

Ran `opencode acp` (v1.18.4, installed at `/home/alain/.opencode/bin/opencode`) over stdio,
performed a real `initialize` + `session/new`, passing a hand-written stdio MCP server that
logs every byte it receives. For Claude Code I read the adapter source, since Claude Code
speaks ACP only through `@zed-industries/claude-code-acp` (npm v0.16.2, repo
`zed-industries/claude-code-acp`) — `claude` itself (v2.1.251 here) has no ACP mode.

### OpenCode 1.18.4 — verified live

`initialize` response, verbatim:

```json
{"protocolVersion":1,
 "agentCapabilities":{"loadSession":true,
   "mcpCapabilities":{"http":true,"sse":true},
   "promptCapabilities":{"embeddedContext":true,"image":true},
   "sessionCapabilities":{"close":{},"fork":{},"list":{},"resume":{}}},
 "agentInfo":{"name":"OpenCode","version":"1.18.4"}}
```

Then `session/new` with one stdio MCP server. My server's log:

```
SPAWNED 2026-08-29T12:18:14.119Z
IN  {"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{"roots":{}},"clientInfo":{"name":"opencode","version":"1.18.4"}},"jsonrpc":"2.0","id":0}
IN  {"method":"notifications/initialized","jsonrpc":"2.0"}
IN  {"method":"tools/list","jsonrpc":"2.0","id":1}
OUT {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"messageAgent","description":"Send an async message to another agent","inputSchema":{...}}]}}
```

**Confirmed: OpenCode spawns the client-provided MCP server during `session/new`, speaks MCP
`2025-11-25` to it, and enumerates its tools.** `messageAgent` was accepted with no
complaint. Both `{name, command, args, env}` **and** `{type:"stdio", ...}` worked
identically. `mcpCapabilities.http: true`, so the loopback-HTTP variant is available too.
No `acp` capability → no MCP-over-ACP.

### Claude Code (via claude-code-acp 0.16.2) — verified by source

Advertises (`src/acp-agent.ts` ~line 1704):

```ts
agentCapabilities: {
  promptCapabilities: { image: true, embeddedContext: true },
  mcpCapabilities: { http: true, sse: true },
  loadSession: true, sessionCapabilities, auth: { logout: {} }, providers: {},
}
```

and in `session/new` (`src/acp-agent.ts` ~line 6669) it translates ACP `mcpServers` into
the Claude Agent SDK's `mcpServers` option, merged with anything from the user's own
settings (`{...userProvidedOptions?.mcpServers, ...mcpServers}`, ~line 6854).

**So both providers implement the same mechanism at the same place with the same
capabilities (`http: true`, `sse: true`, stdio implicit).** For blobot's purposes,
client-provided MCP is provider-agnostic and belongs *above* the adapter boundary — the
adapter only needs to own transport selection and the quirk below.

### ⚠️ One concrete portability trap — do not send `type: "stdio"`

`claude-code-acp` 0.16.2 branches like this:

```ts
if ("type" in server && (server.type === "http" || server.type === "sse")) { …http/sse… }
else if (!("type" in server)) { …stdio… }
```

A server object carrying `{"type": "stdio", …}` matches **neither** branch and is
**silently dropped** — no error, no warning, and `session/new` still succeeds. OpenCode
accepts it fine (verified both ways), so this would look like a Claude-Code-only "my tool
isn't there" bug with no diagnostic.

**Rule: for stdio servers, omit `type` entirely.** That form is valid v1 (stdio is the
untagged fallback branch of the union) and works on both providers. When you move to ACP v2
— where `type` is *required* on every variant — this quirk inverts, so the transport-shape
decision must live inside the provider adapter, keyed on the negotiated protocol version.

---

## 5. Practical notes for the messaging design

- **`session/new` is the only place tools get attached, so session creation is where the
  orchestrator injects `messageAgent`.** Every agent gets the same server config; the
  *identity* of the calling agent must come from something blobot controls at spawn — a
  per-agent token in `headers` (http) or `env` (stdio), or a per-agent URL path. Do not
  trust an `agent` field the model fills in for the *sender*; only for the recipient.
- **Re-supply `mcpServers` on `session/resume` / `session/load`.** They take the same
  environment parameters as `session/new`, and claude-code-acp explicitly snapshots
  `{cwd, mcpServers}` as the session-defining params (`src/acp-agent.ts` ~line 963). An
  agent resumed without them loses `messageAgent`.
- **Waking Bob needs no new primitive.** `session/prompt` is a client → agent method, so the
  orchestrator delivering a stored Message to Bob is just another `session/prompt` on Bob's
  session. The asymmetry is intentional and fits the design: outbound (Alice → orchestrator)
  is an MCP tool call; inbound (orchestrator → Bob) is an ACP prompt.
- **The tool's MCP result is what Alice's model sees.** Return something meaningful
  (`"queued for Bob"`, or an error if Bob is unknown) — this is the confirmation loop that
  the prompt-marker approach (§3c) cannot provide.

---

## 6. What I could not determine

Stated explicitly rather than guessed:

- **Whether either provider honours MCP `notifications/tools/list_changed`** to add or
  remove tools mid-session. Not tested; not specified by ACP.
- **Whether either provider surfaces MCP tool-call errors distinguishably** from ordinary
  tool results in `session/update`. Not tested.
- **Whether OpenCode's HTTP MCP transport works against a loopback URL with custom auth
  headers.** `mcpCapabilities.http: true` is advertised, and the schema supports `headers`,
  but I only exercised stdio end-to-end. Worth a 20-minute spike before committing to the
  HTTP variant.
- **End-to-end tool *invocation*** (model actually calling `messageAgent` and the result
  returning). I verified discovery (`tools/list`) only; driving a real prompt turn needs a
  live model call. Discovery is the load-bearing half — a discovered tool is callable — but
  the round-trip is unproven here.
- **claude-code-acp behaviour was read, not run.** The `type: "stdio"` drop is clear from
  the source but was not observed live.

---

## Source index

Everything below was fetched from `main` on 2026-08-29.

| Claim | Source |
|---|---|
| Method inventory per side, v1 / v2 | `schema/v1/meta.json`, `schema/v2/meta.json` |
| `NewSessionRequest`, `PromptRequest`, `McpServer*`, `McpCapabilities`, `RequestPermission*`, `ToolCall`, `CreateElicitationRequest` | `schema/v1/schema.json`, `schema/v2/schema.json` (`$defs`) |
| MCP-over-ACP types, all marked UNSTABLE | `schema/v1/schema.unstable.json`, `schema/v2/schema.unstable.json` |
| "Clients … should do so by providing an MCP server"; v1→v2 MCP config changes | `docs/protocol/v2/migration.mdx` |
| `session/new` prose + example | `docs/protocol/v1/session-setup.mdx` |
| MCP-over-ACP rationale, message flow, bridging | `docs/rfds/mcp-over-acp.mdx` |
| Claude Code ACP capabilities + `mcpServers` translation + the `type:"stdio"` drop | `zed-industries/claude-code-acp` `src/acp-agent.ts` (v0.16.2) |
| OpenCode capabilities and live MCP spawn | `opencode acp` v1.18.4, local stdio handshake |
