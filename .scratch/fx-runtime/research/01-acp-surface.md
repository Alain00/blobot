# fx's ACP surface, measured

**fx 0.0.7**, installed 2026-08-31 with the vendor's own `curl -fsSL https://fx.sh/setup.sh | bash`,
landing at `~/.local/bin/fx`. Everything below was **run**, not read. The spec was written from
published documentation and the Zig source; where the two disagree, this file wins and the
disagreement is called out.

Probe harness: a 40-line newline-delimited JSON-RPC client over `fx acp` stdio, plus a minimal
HTTP MCP server standing in for ticket 15's loopback. Both in the session scratchpad, not checked
in; every frame quoted below came off the wire.

## 1. `initialize` is refused when fx is unauthenticated

With no credential at all, `initialize` itself fails:

    {"code": -32600, "message": "fx needs access to Vercel AI Gateway. Run fx login to sign in,
     fx setup to use an API key, or set AI_GATEWAY_API_KEY."}

and every later call answers `Not initialized. Call initialize first.`

This is **a divergence from how Claude, Codex and OpenCode behave**, and from ACP's own shape:
the protocol has an `authMethods` array and an `authenticate` method precisely so a client can
handshake first and authenticate second. fx advertises `"authMethods": []` and puts the gate in
front of the handshake instead.

Consequences for blobot, both good:

- **Detection is not optional, it is load-bearing.** A launch against an unauthenticated fx dies
  at `initialize` rather than at the first turn. blobot's existing rule -- a launch whose agent's
  runtime is not ready is refused by name rather than surfacing a raw spawn error -- covers this
  exactly, and here it is the only thing standing between the user and `-32600`.
- **The error is already a good sentence.** It names three remedies in the user's own vocabulary.
  blobot should quote it rather than write its own.

Everything below was measured with `AI_GATEWAY_API_KEY` set to a **deliberately invalid** value,
which gets past the handshake and fails only at the model call. That is what made the whole
structural surface measurable at zero cost, and it is worth remembering for the live suite: the
structural half of an fx test needs no credential.

## 2. `initialize` result

    "agentCapabilities": {
      "loadSession": true,
      "promptCapabilities": { "image": false, "audio": false, "embeddedContext": true },
      "mcpCapabilities": { "http": true, "sse": true },
      "sessionCapabilities": { "list": {}, "resume": {}, "close": {} }
    },
    "agentInfo": { "name": "fx", "title": "fx", "version": "0.0.7" },
    "authMethods": []

**`image: false`.** fx does not take images. This is the first real runtime that refuses a kind of
attachment ADR-0004 supports -- until now `MockAgentRuntime` was the only runtime that said no, and
the refusal path existed to be exercised rather than because anything needed it. `AgentRuntime.accepts`
must say text-yes, image-no for fx, and the composer will refuse a screenshot **at pickup**, before
the user writes, which is what ADR-0004 built that path for.

**`embeddedContext: true`.** A text attachment travels as an embedded `resource` block, which is
already how blobot sends one.

**No `fork`.** `sessionCapabilities` has `list`, `resume` and `close`, and `loadSession` sits at the
top level. blobot uses none of fork.

## 3. The loopback MCP server works, and the header travels

This is the ticket that decided the whole effort, and the answer is yes.

Handed an HTTP server on `session/new`:

    { "type": "http", "name": "blobot", "url": "http://127.0.0.1:45999/mcp",
      "headers": [ { "name": "Authorization", "value": "Bearer alice-token-abc123" } ] }

the server observed, on **every** request:

    POST /mcp auth="Bearer alice-token-abc123" accept=application/json, text/event-stream

So ticket 15's per-agent bearer token, which *is* the caller's identity, travels unchanged. No
file is written anywhere, nothing lands in the AgentWorkspace, and two fx agents on one team
cannot be confused for each other.

### 3a. But fx opens with `server/discover`, not `initialize`

fx speaks a newer MCP draft first. Its first call is

    {"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion": ...,
      "io.modelcontextprotocol/clientInfo":{"name":"fx", ...}}}}

and what happens next depends on how the server answers:

| The server answers `server/discover` with | fx does |
| --- | --- |
| a **result** it cannot type (e.g. `{}`) | **fails the whole session**: `-32602 Required MCP server 'blobot' failed to start: McpMissingResultType` |
| a JSON-RPC **error** (`-32601 method not found`) | **falls back to classic MCP**: `initialize` -> `notifications/initialized` -> `tools/list`, and `session/new` succeeds |

`packages/core/src/mcp/peer-message-server.ts` returns exactly `-32601 method not found: <method>`
for anything it does not implement, so **blobot's loopback server works with fx as it stands**.

**This is now load-bearing behaviour of that file.** The fallback is triggered by the error, not by
the absence of a result. Anybody who "helpfully" makes unknown methods return `{}` instead of an
error breaks fx and nothing else, silently, at `session/new`. That deserves a test with this
paragraph next to it.

## 4. Modes: the docs say three, ACP offers two

The spec said `ask`, `auto` and `yolo` with `auto` as the default, read from the documentation.
Over ACP that is **wrong**:

    "modes": { "currentModeId": "ask", "availableModes": [
      { "id": "code", "name": "Code", "description": "Write and modify code with full tool access" },
      { "id": "ask",  "name": "Ask",  "description": "Request permission before making any changes" } ] }

Two modes, and the default on a fresh `session/new` is **`ask`**, the safe one. Meanwhile
`fx status --json` reports `"permission_mode": "auto"` for the CLI. **The CLI's permission mode and
the ACP session's mode are different things**, and the ACP one is the only one blobot is choosing.
`yolo` has no ACP door at all, which means ticket 14's usual refusal costs nothing here: there is
nothing to refuse.

## 5. Setting things: `set_config_option` is the lever

`session/new` answers with three config options, all `type: "select"`:

| id | category | default | options |
| --- | --- | --- | --- |
| `provider` | model | `gateway` | `gateway`, `codex`, `grok` |
| `model` | model | `moonshotai/kimi-k3` | 234 entries |
| `mode` | mode | `ask` | `code`, `ask` |

- `session/set_config_option` with `configId: "mode"` works and returns the updated set. This is
  the lever, and `adapters/acp/config-options.ts` already reads this shape.
- `session/set_mode` answers with neither a result nor an error. Do not rely on it.
- **`mode` is exposed twice** -- once in `modes` and once as a config option in category `mode`.
  Read one, write one, and say which in the adapter.

### 5a. Mode does not survive a resume

Set `mode` to `code`, then `session/resume` or `session/load`, and the session comes back with
`currentValue: "ask"`. This is **exactly the OpenCode lesson** -- OpenCode restores the last used
mode rather than the configured default, so the adapter re-asserts after a resume -- arrived at
independently by a second runtime. Whatever ticket 02 decides, the adapter re-asserts it on
`session/load` and `session/resume`, not only on `session/new`.

### 5b. Provider is per-session to *choose* and account-wide to *own*

Ticket 04 was charted as "provider is account-wide". Half of that is wrong and the half that is
right is sharper than expected. Setting `provider` to `codex` per session is accepted as a request
and refused on the credential:

    {"code": -32600, "message": "fx needs a Codex subscription login for this model.
     Run fx login codex."}

So the *choice* is per session, the *login* is account-wide, and fx names its own remedy. Setting
`model` per session works and is independent of `provider` (`anthropic/claude-sonnet-4.5` applied
while `provider` stayed `gateway`).

## 6. Two incidental findings

**fx reads the operator's Claude skills.** A prompt produced:

    skill discovery warning: candidate "/home/alain/.claude/skills/vercel-composition-patterns"
    was skipped because its metadata is invalid (unsupported_multiline)

fx loads `~/.claude/skills`. That is ADR-0003's territory arriving from an unexpected direction:
the settings scope decides what an agent can do, and here a third-party runtime has decided to
read another vendor's skill directory. Nothing to do about it, and worth knowing before somebody
is surprised by an fx agent citing a skill the operator wrote for Claude.

**A refused turn.** With a bad credential the turn ends `{"stopReason": "refused"}` after an
`agent_message_chunk` carrying `AI_GATEWAY_API_KEY authentication failed · HTTP 401`. `refused` is
a stop reason blobot's transcript should say something honest about rather than naming the enum,
the way `turn stopped · the context window is full` already does.

## Still unmeasured

Everything that needs a real model turn: whether an ancestor `AGENTS.md` reaches the model
(ticket 01, the persona), the shape of a `session/request_permission` from fx (ticket 02), whether
allow rules have any per-session door (ticket 03), and the two-agent proof. `/rules` is not
handled locally -- it goes to the model -- so even the cheap-looking probe costs a turn.
