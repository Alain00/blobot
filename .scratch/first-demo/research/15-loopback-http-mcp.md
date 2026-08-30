# 15 — Loopback HTTP MCP, verified end to end on both runtimes

Research findings for `issues/15-verify-loopback-http-mcp.md`.
Date: 2026-08-29.
Transcripts and driver scripts: `15-transcripts/` (see its `README.md` for the run index).

Every claim below is tagged **OBSERVED** (I ran it and read the bytes), **DOCUMENTED**
(read from schema/source), or **INFERRED**.

---

## VERDICT

> ### Loopback HTTP MCP is VIABLE on both runtimes. Ticket 05's transport decision stands — do not invert to stdio.

**OBSERVED**, on both OpenCode 1.18.4 and `@agentclientprotocol/claude-agent-acp@0.70.0`
driving the local `claude 2.1.251`, in a single unmodified `session/new` → `session/prompt`
round trip against a plain Node HTTP server bound to `127.0.0.1`:

| | OpenCode 1.18.4 | claude-agent-acp 0.70.0 |
|---|---|---|
| `{type:"http", url, headers}` accepted at `session/new` | ✅ | ✅ |
| MCP handshake + `tools/list` against the loopback URL | ✅ | ✅ |
| **Tool actually invoked by the model in a real prompt turn** | ✅ | ✅ |
| Tool result fed back into the model's context | ✅ | ✅ |
| `Authorization: Bearer …` from `headers` sent on **every** request | ✅ 6/6 | ✅ 6/6 |
| HTTP entry survives `session/load` (re-supplied) | ✅ | ✅ |

There are **four operational hazards** that change what the orchestrator must implement.
They do not change the transport choice. In descending order of how much they will hurt:

1. **A dead or auth-rejecting MCP server fails SILENTLY at `session/new` on both runtimes.**
   `session/new` returns `ok` with a normal `sessionId`, no error, no warning, no ACP-level
   diagnostic — the agent simply has no `messageAgent` tool and behaves as if it never
   existed. §4.
2. **Neither runtime re-runs the MCP `initialize` handshake after a transport drop.** After
   the orchestrator restarts, the agent POSTs `tools/call` straight at the new process. The
   blobot HTTP server must therefore be **stateless** — it must answer a `tools/call` from a
   connection that never handshook. A stock MCP SDK server with `Mcp-Session-Id` validation
   would 404 here. §6.
3. **A mid-turn drop stalls the turn for the full MCP request timeout: 60 s on OpenCode,
   120 s on Claude.** Neither notices the closed socket. §5.
4. **`mcpServers` must be re-supplied on `session/load`, and omitting it silently strips the
   tool** while the replayed history still shows the model using it. §7.

---

## 1. Method

I wrote `15-transcripts/httpmcp.mjs`: ~130 lines of `node:http`, no MCP SDK, bound to
`127.0.0.1` on an ephemeral port. It speaks Streamable HTTP (POST `/mcp` → JSON response,
`202` for notification-only bodies, GET `/mcp` → a kept-alive `text/event-stream`), logs every
request line, header set and body, and exposes exactly one tool:

```json
{"name":"message_agent",
 "description":"Send an asynchronous message to a teammate agent. …",
 "inputSchema":{"type":"object","properties":{"agent":{"type":"string"},"message":{"type":"string"}},
                "required":["agent","message"],"additionalProperties":false}}
```

`15-transcripts/drive-http.mjs` is the ACP client — the ticket-03 `drive.mjs` generalised over
the two agent binaries, passing the server as

```json
{"type":"http","name":"blobot","url":"http://127.0.0.1:<port>/mcp",
 "headers":[{"name":"Authorization","value":"Bearer <token>"}]}
```

Binaries: `/home/alain/.opencode/bin/opencode acp` (1.18.4) and
`/home/alain/.npm/_npx/fca12915ff656968/node_modules/.bin/claude-agent-acp` (0.70.0) with
`CLAUDE_CODE_EXECUTABLE=/home/alain/.local/bin/claude` (2.1.251) — the user's own binary, not
the bundled one, confirmed by the `user-agent` the MCP server logged:
`claude-code/2.1.251 (sdk-cli, agent-sdk/0.3.232)`. **OBSERVED.**

All runs are real authenticated model turns. Both runtimes reported the capability first:

```
OpenCode  agentCapabilities.mcpCapabilities = {"http":true,"sse":true}
Claude    agentCapabilities.mcpCapabilities = {"http":true,"sse":true}
```

---

## 2. Happy path — discovery **and invocation** (`oc1`, `cc1`)

### OpenCode 1.18.4

Server-side, verbatim (`oc1-server.log`), one session, elapsed ms from server start:

```
3810  POST /mcp  user-agent: opencode/1.18.4  authorization: Bearer tok-opencode-abc123
      {"method":"initialize","params":{"protocolVersion":"2025-11-25",
       "capabilities":{"roots":{}},"clientInfo":{"name":"opencode","version":"1.18.4"}},"id":0}
3817  POST /mcp  {"method":"notifications/initialized"}
3819  GET  /mcp  accept: text/event-stream          ← opens the server→client stream
3906  POST /mcp  {"method":"tools/list","id":1}
6510  POST /mcp  {"method":"tools/call","params":{"name":"message_agent",
       "arguments":{"agent":"Bob","message":"hello from Alice"},"_meta":{"progressToken":2}},"id":2}
6510  !!! TOOL CALLED #1
```

Client-side (`oc1.jsonl`), the ACP view:

```json
{"sessionUpdate":"tool_call","toolCallId":"chatcmpl-tool-8e3d…","title":"blobot_message_agent","kind":"other","status":"pending","rawInput":{}}
{"sessionUpdate":"tool_call_update","status":"in_progress","title":"blobot_message_agent","rawInput":{"agent":"Bob","message":"hello from Alice"}}
{"sessionUpdate":"tool_call_update","status":"completed",
 "content":[{"type":"content","content":{"type":"text","text":"BLOBOT-ACK: queued message for Bob: \"hello from Alice\""}}],
 "rawOutput":{"output":"BLOBOT-ACK: queued message for Bob: \"hello from Alice\"","metadata":{"truncated":false}}}
```

…and the model's reply: *"The tool returned: `BLOBOT-ACK: queued message for Bob: "hello from
Alice"`"*. **OBSERVED. Full round trip: discovery, invocation, result back into context.**

### claude-agent-acp 0.70.0 → claude 2.1.251

Same shape (`cc1-server.log`), with three Claude-specific differences:

- **A pre-flight probe.** Before `initialize`, Claude Code POSTs a
  `{"method":"server/discover","id":"server-discover-probe-1"}` carrying
  `MCP-Protocol-Version: 2026-07-28` and `mcp-method: server/discover`. My server answered
  `-32601 Method not found`; **Claude fell straight through to a normal `initialize` at
  protocol `2025-11-25` and everything worked.** **OBSERVED.** A blobot server that returns an
  HTTP-level error (rather than a JSON-RPC error) to an unknown method would be riskier here —
  return `-32601`, not 400/500. **INFERRED.**
- **`accept-encoding: identity`** (OpenCode sends `gzip, deflate, br, zstd`). **OBSERVED.**
- **The MCP tool arrived deferred.** The model had to run `ToolSearch`
  (`{"query":"select:mcp__blobot__message_agent"}`, `"total_deferred_tools":218`) to load the
  schema before it could call it — one extra model round trip. **OBSERVED.** That 218 is this
  machine's ambient tool population (see §9); a clean blobot agent will have far fewer, and
  deferral may not trigger at all. Do not rely on either behaviour. **INFERRED.**

The call itself:

```
14720  POST /mcp  authorization: Bearer tok-claude-xyz789
       {"method":"tools/call","params":{"name":"message_agent",
        "arguments":{"agent":"Bob","message":"hello from Alice"},
        "_meta":{"claudecode/toolUseId":"toolu_01RvaGxLFdwA6ATGnuxnpLCt","progressToken":2}},"id":2}
14720  !!! TOOL CALLED #1
```

ACP view — note the incrementally streamed `rawInput`, same as the stdio finding in `02`:

```json
{"sessionUpdate":"tool_call","toolCallId":"toolu_01Rva…","title":"mcp__blobot__message_agent","status":"pending","rawInput":{}}
{"sessionUpdate":"tool_call_update","rawInput":{"agent":"Bob"}}
{"sessionUpdate":"tool_call_update","rawInput":{"agent":"Bob","message":"hello from Alice"}}
{"sessionUpdate":"tool_call_update","status":"completed",
 "rawOutput":[{"type":"text","text":"BLOBOT-ACK: queued message for Bob: \"hello from Alice\""}]}
```

**OBSERVED.**

---

## 3. Bearer token in `headers` — honoured, and sent on every request

**OBSERVED.** `headers: [{name:"Authorization", value:"Bearer …"}]` is forwarded verbatim on
**100 % of HTTP requests both runtimes make**, including the ones you might not expect:

| run | HTTP requests | carrying `authorization` |
|---|---|---|
| `oc1` (OpenCode) | 6 | 6 |
| `cc1` (Claude) | 6 | 6 |

The six on each side are: (Claude only) `server/discover`; `initialize`;
`notifications/initialized`; the **GET SSE stream**; `tools/list`; `tools/call`; (OpenCode
only) `notifications/cancelled`. The GET is the one that matters — a naive server that only
guards POST leaves the event stream open to any local process. **OBSERVED.**

Negative test (`oc6-badtoken`, `cc6-badtoken`): server requires `the-right-token`, client sends
`WRONG-TOKEN`, server answers `401` with `WWW-Authenticate: Bearer`.

- **OpenCode**: 6 rejected attempts (it retries), then `session/new` returns **ok**. No error,
  no stderr, nothing in the ACP stream. The model spent the turn grepping the filesystem for a
  messaging tool and concluded *"I don't see any tool available to me for sending a message to
  an agent named 'Bob'."* **OBSERVED.**
- **Claude**: 2 rejected attempts, `session/new` returns **ok**, no ACP-level error — **but the
  failure is injected into the model's own context.** The model said, unprompted:
  > "The `blobot` MCP server is configured, but it failed to connect this session — it returned
  > HTTP 401 (`AUTH_HEADER_REJECTED`) […] none of its `mcp__blobot__*` tools loaded."

  That string appears in the transcript **only inside `agent_message_chunk`** — there is no
  structured ACP signal carrying it. **OBSERVED.**

**Conclusion: a per-agent bearer token in `headers` is a workable auth mechanism on both
runtimes** (and is required — the port is otherwise reachable by any local process). Enforce it
on GET as well as POST.

---

## 4. Unreachable at `session/new` — SILENT SUCCESS on both. This is the hazard.

**OBSERVED.** Driver pointed at `http://127.0.0.1:45999/mcp` with nothing listening
(`oc2-unreachable`, `cc2-unreachable`):

| | `session/new` | ACP error/warning | stderr | model's view |
|---|---|---|---|---|
| OpenCode | **ok**, normal `sessionId` + `configOptions` | none | **empty** | tool absent, no idea why |
| Claude | **ok**, normal `sessionId` + `modes` | none | only `[session/query] sessionId=… resume=none` | tool absent |

I grepped both transcripts for `ECONNREFUSED`, `401`, `failed to connect`, MCP error strings:
**zero hits on the OpenCode side, and on the Claude side only inside the model's own prose**
(§3). `NewSessionResponse` has no field for it — it carries `sessionId`, `modes`,
`configOptions`, `_meta` and nothing else (**DOCUMENTED**, ticket 01 §2.3), so there is nowhere
in the protocol for this to be reported even in principle.

**Implication for blobot.** The orchestrator cannot learn from ACP whether `messageAgent` is
live for an agent. It must instrument its own MCP server: **treat the inbound MCP `initialize`
(or the first `tools/list`) from an agent as the readiness signal for that session, and mark
the agent degraded if it does not arrive within a few seconds of `session/new` returning.**
This is the same advice ticket 01 §2.3 gave for stdio, and it is now load-bearing rather than
prudent. **INFERRED from OBSERVED behaviour.**

The failure mode this prevents is nasty and quiet: an agent that looks healthy, answers
prompts, and simply never messages its teammates — while telling the user, plausibly, that it
has no such tool.

---

## 5. Unreachable mid-turn — no silent success, but a long stall

**OBSERVED.** Server answered `tools/call` #1 and then `process.exit(0)` on #2 without
responding, closing the TCP connection under the agent (`oc3-midturn`, `cc3-midturn`).

**Neither runtime notices the closed socket. Both sit on the dead request until their MCP
request timeout fires.**

**OpenCode — 60 s** (`tool_call_update` `in_progress` at t=6553 ms, `failed` at t=66562 ms):

```json
{"sessionUpdate":"tool_call_update","toolCallId":"call_2f14…","status":"failed",
 "title":"blobot_message_agent","rawInput":{"agent":"Carol","message":"two"},
 "content":[{"type":"content","content":{"type":"text","text":"MCP error -32001: Request timed out"}}],
 "rawOutput":{"error":"MCP error -32001: Request timed out"}}
```

**Claude — 120 s**, with `elapsedTimeSeconds` heartbeats at 30/60/90/120 s, then a notably
precise error:

```json
{"sessionUpdate":"tool_call_update","toolCallId":"toolu_018U…","status":"failed",
 "rawOutput":"MCP server \"blobot\" transport dropped mid-call; response for tool \"message_agent\" was lost"}
```

Good news, on both: **the turn is not killed**, `stopReason` is still `end_turn`, the error
reaches the model as the tool result, and the model reports it accurately and — unprompted —
correctly flags the at-most-once/at-least-once ambiguity:

> Claude: *"the transport dropped after the call was dispatched, so the outcome is genuinely
> unknown […] I did not retry, since a blind retry could deliver "two" twice."*

**Implication.** Blobot's `messageAgent` should be **idempotent on a caller-supplied key**, so
a retry after a lost ack cannot double-deliver. And the orchestrator's HTTP handler must never
block: a 60–120 s stall is a wedged agent, and the agent will not abandon the call earlier.
**INFERRED.**

`status: "failed"` on `tool_call_update` is a distinguishable signal — this also answers ticket
01 §6's open question about whether MCP tool errors are distinguishable from ordinary results.
They are, on both runtimes. **OBSERVED.**

---

## 6. Recovery after an orchestrator restart — works, but only for a *stateless* server

**OBSERVED**, and this is the finding most likely to break an implementation that uses the
official MCP SDK server.

Setup (`oc7-restart`, `cc7-restart`): fixed port, server exits mid-call on turn 1, a supervisor
restarts a **fresh process on the same port**, then turn 2 runs **in the same ACP session**
with no `session/load` and no new `mcpServers`.

Full method sequence the two server processes saw, OpenCode:

```
--- process 1 ---
initialize / notifications/initialized / tools/list / tools/call   → dies
--- process 2 (same port) ---
notifications/cancelled / notifications/cancelled / tools/call     ← turn 2, answered
```

Claude, identically:

```
--- process 1 ---
server/discover / initialize / notifications/initialized / tools/list / tools/call → dies
--- process 2 ---
tools/call   ← turn 2, answered: "BLOBOT-ACK: queued message for Carol: \"retry\""
```

Two things follow:

- **Both runtimes reconnect at the TCP level transparently.** No session teardown, no error to
  the client, the tool stays in the model's tool list, and the next turn just works. Claude's
  model even called it out: *"That one succeeded."* An orchestrator restart is therefore
  survivable without touching ACP sessions.
- **Neither re-runs `initialize`, `notifications/initialized`, or `tools/list` against the new
  process.** They fire `tools/call` at a process that has never seen a handshake and holds no
  session state. My hand-rolled server tolerated this because it is stateless. **A server built
  on `@modelcontextprotocol/sdk`'s `StreamableHTTPServerTransport` with session management
  enabled would reject that request** (unknown/absent `Mcp-Session-Id` → 404) and the tool
  would break after every restart, in a way that only shows up in production. **DOCUMENTED**
  (the MCP Streamable HTTP session-id rules) + **INFERRED** from the OBSERVED sequence.

  **Requirement: blobot's HTTP MCP endpoint must be stateless** — no `Mcp-Session-Id`
  enforcement, no requirement that `initialize` precede `tools/call`. Derive the caller's
  identity from the bearer token or URL path, never from MCP session state.

---

## 7. `session/load` — `mcpServers` must be re-supplied; the HTTP entry survives

**OBSERVED**, four runs, each killing the agent process after turn 1 and doing `session/load`
from a **brand-new** agent process.

**Re-supplied identically (`oc4-load-with`, `cc4-load-with`)** — works on both. The second
process performs a complete fresh MCP handshake against the loopback URL (`initialize` count in
the server log: 2) and the model invokes the tool in turn 2:

```
OpenCode  !!! TOOL CALLED #2 {"name":"message_agent","arguments":{"agent":"Carol","message":"second message"}}
Claude    !!! TOOL CALLED #2 {"name":"message_agent","arguments":{"agent":"Carol","message":"second message"}}
```

**Omitted / `[]` (`oc5-load-without`, `cc5-load-without`)** — tool is gone on both. `initialize`
count stays at 1; no second `tools/call` ever reaches the server. What the user sees is
confusing, because `session/load` **replays the earlier successful tool call into the
transcript** before the model discovers the tool is missing:

- OpenCode: the model tries anyway and gets an agent-side stub error —
  `title: "Invalid Tool"`, `"Model tried to call unavailable tool 'blobot_message_agent'."` —
  then: *"The tool `blobot_message_agent` … is **not available** in my current toolset."*
- Claude: *"The tool is not available — the blobot MCP server has disconnected since the
  previous call, so `mcp__blobot__message_agent` no longer exists in this session."*

**"Identically" — what I actually tested.** I tested *present and identical* vs *absent*. I did
**not** test supplying a **different** URL, port, name or token on `session/load`; on both
runtimes the load path re-runs a full MCP connect from the supplied config, so a changed URL is
very likely to be honoured rather than rejected — but that is **INFERRED, not observed.** Since
blobot's port may change across orchestrator restarts, verify this before relying on it. The
`session/load` request never echoes the server set back, so a mismatch would be silent (§4
again).

### 7a. A *changed* URL and token on `session/load` — now OBSERVED, on Claude

**OBSERVED, 2026-08-29**, and it is what the inference above expected. The live test is
`packages/core/src/adapters/claude/live.test.ts`, *"resumes across processes onto a new
loopback port, keeping both memory and its tool"*, so this stays honest as the bridge moves.

A first `PeerMessageServer` on an ephemeral port minted a token for `alice`; the agent was told
a codeword; then **`stop()` and the process both went away** — the same shutdown a team switch
performs, `session/close` included. A second server came up on a **different port with a
different token**, and a brand-new bridge process did `session/load` with that new entry:

```
[session/query] sessionId=bfe9921f-… resume=bfe9921f-… apiType=native baseUrl=native
```

Three things fall out of one run:

1. **A changed HTTP entry is honoured, not rejected or ignored.** The resumed agent called
   `message_agent` and the call arrived at the *second* server. So the ephemeral port is not a
   reason to avoid resuming, which is what §7 left open.
2. **`session/close` does not end a session for good.** Resume works after a clean shutdown,
   so blobot need not choose between a tidy stop and a resumable one.
3. **The transcript replay must be muted by the client.** The load replays the whole prior
   conversation as `session/update` notifications before it answers; the adapter drops them
   (`#replaying`), or every relaunch would repeat everything the agent has ever said.

Still **not** observed: a changed *server name*, and any of this against OpenCode.

---

## 8. Namespacing — identical to stdio, no HTTP-specific difference

**OBSERVED**, server named `blobot`, tool named `message_agent`:

| runtime | name the model sees / ACP `title` |
|---|---|
| OpenCode 1.18.4 | `blobot_message_agent`  (`<server>_<tool>`) |
| claude-agent-acp 0.70.0 | `mcp__blobot__message_agent`  (`mcp__<server>__<tool>`) |

Byte-for-byte the same convention ticket 03 §MCP and ticket 02 §2.7 recorded over stdio
(`blobot` + `blobot_ping` → `blobot_blobot_ping`; `mcp__blobot__blobot_mailbox_send`).
**Transport does not affect namespacing.**

Two consequences:

- Name the MCP server `blobot` and the tool `message_agent`, **not** `blobot_message_agent` —
  otherwise OpenCode renders `blobot_blobot_message_agent`. The naming used in this test gives
  exactly the ticket's desired `blobot_message_agent` on OpenCode.
- The tool's user-visible name **differs per runtime**, so any prompt text, persona, or
  documentation that names the tool literally must be templated by the adapter. Claude's model
  also matched on the `mcp__blobot__` form when I named it in the prompt. **OBSERVED.**
- Both runtimes surface it as ACP `kind: "other"`. **OBSERVED.**

---

## 9. Confounds and caveats in these runs

Stated plainly, because two of them shaped what I saw:

- **Both agents inherited the user's own ambient configuration.** The Claude runs had
  `ListAgents` / `SendMessage` tools and 218 deferred tools from the user's installed MCP
  servers and plugins; the OpenCode runs had Linear / MongoDB / Stitch MCP servers. In
  `cc2-unreachable` the model, denied the blobot tool, fell back to the ambient `SendMessage`
  tool — which is *why* that transcript shows a message being attempted at all. This does not
  affect any HTTP-transport conclusion (the server logs are unambiguous about what did and did
  not reach the port), but it means **ACP `mcpServers` is merged with the user's own MCP
  config, not a replacement for it.** **OBSERVED**; consistent with ticket 01 §4's reading of
  the source (`{...userProvidedOptions?.mcpServers, ...mcpServers}`). Blobot will want the
  provider's strict-config equivalent (`--strict-mcp-config` for Claude Code) so agents get
  *only* blobot's tools. **Not tested.**
- These are real model turns, so wording varies run to run; only the server-side HTTP logs and
  the ACP `tool_call` frames are treated as evidence here.
- Ports were ephemeral except in §6.

---

## 10. What I could not test

- **`type: "sse"`** (the legacy HTTP+SSE transport). Both runtimes advertise `sse: true`; I
  only exercised `type: "http"`. Not needed — `http` works — but unverified.
- **SSE-framed POST responses.** My server answered `Content-Type: application/json`. Both
  runtimes sent `Accept: application/json, text/event-stream`, so `text/event-stream` framing
  is presumably accepted (my server supports it via `MODE=sse`), but I did not run it.
  **INFERRED.**
- **A *changed* HTTP entry on `session/load`** (different port/URL/token) — see §7.
- **`notifications/tools/list_changed`** — still open from ticket 01 §6. My server advertises
  `tools.listChanged: true` and both runtimes accepted that, but I never emitted the
  notification, so whether either picks up a mid-session tool-set change is still unknown.
- **A slow-but-alive server** (responds after 30 s). I tested *dead* and *fast*, not *slow*.
  The 60 s / 120 s ceilings in §5 are the only timing data I have.
- **Concurrent sessions against one port.** Blobot will have N agents hitting one endpoint
  simultaneously; I only ever ran one agent at a time.
- **`--strict-mcp-config`-style isolation** (§9).
- Claude was driven only via `claude-agent-acp` 0.70.0 with `CLAUDE_CODE_EXECUTABLE` pointed at
  `claude 2.1.251`; no other version combination was exercised.

---

## 11. Implementation checklist this produces

For the orchestrator's MCP endpoint, all derived from OBSERVED behaviour above:

1. Bind `127.0.0.1` only. Require `Authorization: Bearer <per-agent token>` on **every** method
   including GET; the header is reliably forwarded (§3).
2. **Stateless.** Answer `tools/call` with no prior `initialize` and no `Mcp-Session-Id`
   (§6). Identity comes from the token (or a per-agent URL path), never from MCP session state
   — and, per ticket 01 §5, never from a model-supplied "sender" field.
3. Answer unknown methods with JSON-RPC `-32601`, not an HTTP error — Claude probes
   `server/discover` first (§2).
4. **Confirm readiness out of band.** `session/new` succeeding proves nothing; wait for the
   agent's inbound `initialize`/`tools/list` before considering that agent able to message
   anyone (§4).
5. **Never block the handler.** A stalled response wedges the agent for 60 s (OpenCode) or
   120 s (Claude) (§5).
6. **Idempotent `messageAgent`** on a caller-supplied key — a dropped ack leaves genuinely
   ambiguous delivery (§5).
7. **Re-supply `mcpServers` on every `session/load`** (§7).
8. Server name `blobot`, tool name `message_agent`; template the tool's literal name per
   runtime in any prompt text (§8).
