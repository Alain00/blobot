# 03 — OpenCode's ACP session and event surface

Research findings for `issues/03-opencodes-acp-session-and-event-surface.md`.
Date: 2026-08-29.

**Primary source: the installed binary, driven live.** OpenCode **1.18.4**, ELF x86-64
single-file bun build at `/home/alain/.opencode/bin/opencode` (171 MB, not stripped — it
embeds its own JS chunks). It was **authenticated** (GitHub Copilot, OpenAI, Anthropic
oauth credentials present), so every transcript below is a *real* model turn, not a
handshake-only stub. No credentials were touched, read, or modified.

Everything is tagged:

- **[OBS]** — observed in a captured transcript in `03-transcripts/`.
- **[DOC]** — from `opencode --help` / `opencode acp --help` output.
- **[INF]** — inferred from binary strings or from the ACP spec, not directly exercised.

Raw transcripts and the driver scripts that produced them live in
[`03-transcripts/`](./03-transcripts/). Each `.jsonl` line is
`{t, dir, note?, msg}` where `dir` is `out` (client→agent), `in` (agent→client),
`stderr`, or `exit`, and `t` is ms since driver start.

| File | Scenario |
|---|---|
| `t1-basic.jsonl` | initialize → session/new → one text-only prompt turn |
| `t2-tools.jsonl` | read + bash + write, default (auto-allow) permissions |
| `t3-perm-allow.jsonl` | same with `permission: ask`, client approves |
| `t4-perm-deny.jsonl` | `permission: ask`, client rejects |
| `t5-cancel.jsonl` | `session/cancel` mid-turn during a `sleep 60` |
| `t6-errors.jsonl` | unknown method, unknown session |
| `t7-resume.log` | session created in process A, `session/load`ed in process B |
| `t8-mcp.log` | client-supplied MCP server exposing a custom tool |
| `drive.mjs`, `probe.mjs`, `resume.mjs`, `mcptest.mjs`, `mcpsrv.mjs`, `errtest.mjs`, `final.mjs` | the drivers |

---

## Short answer

OpenCode's ACP mode is **clean, complete, and well-behaved** — a good choice for blobot's
first runtime. It is `opencode acp` on stdio, newline-delimited JSON-RPC 2.0, no framing
headers, no banner pollution on stdout. One prompt turn emits exactly **six** session
update kinds, all of which map cleanly onto a normalized event vocabulary. Tool calls are
fully visible (name, kind, arguments, streaming output, result, failure reason) and fully
approvable. Cancellation is a notification that resolves the in-flight prompt with
`stopReason: "cancelled"`. Sessions are persisted to a local SQLite DB and survive process
death, so resumption is real.

The three things that will bite an implementer are all documented in
[§8 Gotchas](#8-gotchas--things-that-will-bite-you): **agent-originated request IDs start
at 0 and share no ID space with the client's**, a **cancelled tool reports
`status: "completed"`, not `cancelled`**, and **concurrent prompts on one session collapse
into one turn**.

---

## 1. Launching ACP mode

### Command [DOC][OBS]

```
opencode acp
```

`opencode --help` lists it as `opencode acp — start ACP (Agent Client Protocol) server`.
Flags from `opencode acp --help` [DOC]:

| Flag | Notes |
|---|---|
| `--cwd <path>` | working directory; **defaults to the process cwd**. Note this is the *process* cwd, distinct from the per-session `cwd` in `session/new` (see §2). |
| `--print-logs` | logs to stderr |
| `--log-level DEBUG\|INFO\|WARN\|ERROR` | |
| `--pure` | run without external plugins — **useful for blobot**: makes the agent's tool/command surface deterministic and independent of the user's global plugin config |
| `--port`, `--hostname`, `--mdns`, `--mdns-domain`, `--cors` | inherited global server flags; irrelevant to stdio ACP |

There is **no** `--model` / `--agent` flag on the `acp` subcommand (unlike the root
command). The model is selected per-session via `session/set_config_option` (§2.4).

### Transport [OBS]

- **stdin**: one JSON-RPC 2.0 message per line, `\n`-terminated. No `Content-Length`
  headers (this is ACP's line-delimited framing, not LSP framing).
- **stdout**: same. **Confirmed clean** — across every transcript, zero unparseable stdout
  lines were seen. No ASCII-art banner, no color codes (driver set `NO_COLOR=1`, but the
  banner is only printed by the TUI path). You can parse stdout naively from byte 0.
- **stderr**: human-readable diagnostics only, never protocol. Errors returned over the
  wire are *also* dumped to stderr in bun's inspect format (see `t6-errors.jsonl`
  `stderr` lines). Safe to log, never to parse.
- **stdin close → clean exit** [OBS]: ending stdin causes `exit code 0` within ~3s
  (`errtest.mjs`). This is blobot's graceful-shutdown lever; no signal required.
- **Malformed input is survivable** [OBS]: writing `this is not json\n` to stdin logs
  `Failed to parse JSON message` to stderr, the process **stays alive**, and the very next
  well-formed request (`session/list`) succeeds normally. OpenCode does not tear down the
  stream on a parse error.

### Handshake [OBS]

`initialize` is required first. Real exchange from `t1-basic.jsonl`:

```jsonc
// → client
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
  "protocolVersion":1,
  "clientCapabilities":{"fs":{"readTextFile":true,"writeTextFile":true},"terminal":false}}}

// ← agent  (834 ms later — cold start is ~0.8 s)
{"jsonrpc":"2.0","id":1,"result":{
  "protocolVersion":1,
  "agentCapabilities":{
    "loadSession":true,
    "mcpCapabilities":{"http":true,"sse":true},
    "promptCapabilities":{"embeddedContext":true,"image":true},
    "sessionCapabilities":{"close":{},"fork":{},"list":{},"resume":{}}
  },
  "authMethods":[{"id":"opencode-login","name":"Login with opencode",
                  "description":"Run `opencode auth login` in the terminal"}],
  "agentInfo":{"name":"OpenCode","version":"1.18.4"}}}
```

Notes:

- `agentInfo.name` / `.version` is a **reliable runtime-identification handle** for
  blobot — better than shelling out to `opencode --version` separately.
- **Version negotiation is not enforced** [OBS]: sending `protocolVersion: 99` returns the
  same result with `protocolVersion: 1` and **no error**. Do not rely on OpenCode to
  reject an unsupported client version; blobot must check the returned `protocolVersion`
  itself.
- `authMethods` is advertised even when the agent *is* authenticated. Its presence is
  **not** a signal that auth is required. The `authenticate` method exists and returns
  `{}` [OBS] but performs no visible action over ACP — real login is out-of-band
  (`opencode auth login` in a terminal).
- `initialize` can be called again mid-connection without error [OBS].
- **`agentCapabilities` has no `tools` or `custom tool` field.** Custom tools go through
  MCP (§7).

---

## 2. Session lifecycle

### 2.1 `session/new` [OBS]

```jsonc
// →
{"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"/abs/path","mcpServers":[]}}
// ←
{"jsonrpc":"2.0","id":2,"result":{"sessionId":"ses_fb28a14d3ffegAzP7VNKuquE3l","configOptions":[...]}}
```

- **`cwd` is required.** Omitting it → `-32602 Invalid params` with a Zod-shaped
  `data: {_errors:[], cwd:{_errors:["Invalid input: expected string, received undefined"]}}`
  [OBS].
- **`cwd` is NOT validated for existence.** `cwd: "/nonexistent/path/xyz"` and
  `cwd: "relative/path"` both return a **successful** session [OBS]. blobot must validate
  the worktree path itself before handing it over — OpenCode will happily create a session
  pointed at nowhere and only fail later, inside a tool.
- **cwd is bound per-session, not per-process** [OBS]. Two `session/new` calls in *one*
  `opencode acp` process with different `cwd` values both succeed, and `session/list`
  reports each session's own `cwd` correctly. **This is architecturally important for
  blobot: one OpenCode process can serve multiple agents in different worktrees.** Whether
  to do that or run process-per-agent is a blobot decision, not a protocol constraint.
- `session/new` takes ~1.4–1.6 s [OBS] (config load + provider/model enumeration).
- Session IDs are `ses_` + 26 chars.
- `mcpServers: []` is accepted; see §7 for the populated form.

### 2.2 `configOptions` — an OpenCode extension [OBS]

`session/new` returns a `configOptions` array not present in vanilla ACP. Exactly two
entries:

```jsonc
[
  {"id":"model","name":"Model","category":"model","type":"select",
   "currentValue":"opencode/big-pickle",
   "options":[{"value":"openai/gpt-5.4","name":"OpenAI/GPT-5.4"}, /* 35 total */]},

  {"id":"mode","name":"Session Mode","category":"mode","type":"select",
   "currentValue":"build",
   "options":[
     {"value":"build","name":"build","description":"The default agent. Executes tools based on configured permissions."},
     {"value":"plan","name":"plan","description":"Plan mode. Disallows all edit tools."}]}
]
```

This payload is **large** (35 models with display names) and is repeated on every
`session/new`, `session/load`, `session/resume`, `session/fork`, and
`session/set_config_option` response. Budget for it; don't log it verbatim.

The `mode` option maps onto OpenCode's *agent* concept (`build` / `plan`) — the closest
thing OpenCode exposes to blobot's per-teammate role, though only these two are offered
here. [INF] Custom agents defined in `opencode.json` may appear as additional `mode`
options; not tested.

### 2.3 Full method inventory [OBS]

Probed by calling each name against a live process and separating `-32601 Method not
found` from real responses (`probe.mjs`):

| Method | Result |
|---|---|
| `initialize` | ✅ |
| `authenticate` | ✅ returns `{}` |
| `session/new` | ✅ requires `cwd` |
| `session/prompt` | ✅ |
| `session/cancel` | ✅ **notification** (no `id`) |
| `session/list` | ✅ `{sessions:[{sessionId, cwd, title, updatedAt}]}` |
| `session/load` | ✅ requires `sessionId`, `cwd`, `mcpServers` |
| `session/resume` | ✅ requires `cwd` |
| `session/fork` | ✅ requires `cwd`; returns a **new** `sessionId` |
| `session/close` | ✅ returns `{}`; session becomes unusable afterwards |
| `session/set_mode` | ✅ `{sessionId, modeId}` → `{}` |
| `session/set_model` | ✅ exists |
| `session/set_config_option` | ✅ `{sessionId, configId, value}` — note **`configId`**, not `optionId` |
| `session/select_config_option` | ❌ `-32601` |
| `session/config` | ❌ `-32601` |
| `session/request_permission` | ❌ `-32601` — **agent→client only** |
| `fs/read_text_file`, `fs/write_text_file` | ❌ `-32601` — **agent→client only** |
| `terminal/create` | ❌ `-32601` — OpenCode does **not** implement the client-terminal extension inbound |

### 2.4 Changing model / mode [OBS]

```jsonc
{"method":"session/set_config_option","params":{"sessionId":"ses_…","configId":"mode","value":"plan"}}
// → returns the FULL refreshed configOptions array
```

- An invalid model is rejected up-front:
  `-32602 "Invalid params: model not found: notaprovider/notamodel"` with
  `data: {providerId, modelId}` [OBS]. The session keeps its previous model. This is a
  useful validation seam — blobot can offer a model picker and get a synchronous yes/no.
- **No `current_mode_update` session update is emitted** on either `session/set_mode` or
  `session/set_config_option` [OBS] — despite `current_mode_update` appearing once in the
  binary's strings. The client must track mode state from the method's return value; do
  not wait for a broadcast.

### 2.5 Resumption — real and cross-process [OBS]

`t7-resume.log` proves the full cycle:

1. Process **A**: `session/new`, prompt *"Remember the codeword ZEBRA"*, agent replies
   `OK`. Process A is **SIGTERM**ed.
2. Process **B** (fresh `opencode acp`): `initialize`, then
   `session/load {sessionId, cwd, mcpServers}` → `{configOptions:[…]}` (**no** `sessionId`
   in the result — you already have it).
3. **`session/load` replays the conversation history as `session/update` notifications**
   before returning:
   ```jsonc
   {"sessionUpdate":"user_message_chunk","messageId":"msg_04d78f6aa001…",
    "content":{"type":"text","text":"Remember the codeword ZEBRA. Just reply OK. Do not use tools."}}
   {"sessionUpdate":"agent_message_chunk","messageId":"msg_04d78f6b9001…",
    "content":{"type":"text","text":"OK"}}
   {"sessionUpdate":"available_commands_update","availableCommands":[…]}
   ```
   Replay chunks are **whole messages, not token deltas** — one update per message.
   `user_message_chunk` appears **only** during replay; it is never emitted during a live
   turn (the client already knows what it sent).
4. Prompt *"What codeword did I ask you to remember?"* → **`ZEBRA`**. Context genuinely
   survived.

Persistence is `~/.local/share/opencode/opencode.db` (SQLite; `-shm`/`-wal` siblings
present) [INF from file listing]. `session/list` in a fresh process returns sessions
created by *earlier, already-dead* processes [OBS] — confirming disk-backed, not
in-memory.

`session/fork` returns a new `sessionId` and copies history; the fork gets a title suffix
`(fork #1)` (seen in a later `session/list`) [OBS].

**Implication for blobot:** teammate sessions are durable. Restarting the Electron app —
or the OpenCode process behind a teammate — need not lose a conversation, provided blobot
persists the `sessionId` + `cwd` pair. The replay-on-load behaviour also gives blobot a
free "rehydrate the transcript" path.

---

## 3. The full event vocabulary of one prompt turn

`session/prompt` request:

```jsonc
{"jsonrpc":"2.0","id":3,"method":"session/prompt","params":{
  "sessionId":"ses_…",
  "prompt":[{"type":"text","text":"Say hello in exactly three words."}]}}
```

All streaming arrives as `session/update` **notifications** (no `id`), shaped
`{method:"session/update", params:{sessionId, update:{sessionUpdate:"<kind>", …}}}`.

**Exactly six `sessionUpdate` kinds were observed across every scenario:**

| kind | when |
|---|---|
| `available_commands_update` | once, immediately after `session/prompt` (and after `session/load`) |
| `agent_thought_chunk` | reasoning deltas |
| `agent_message_chunk` | assistant text deltas |
| `tool_call` | a tool call begins |
| `tool_call_update` | tool progress / completion / failure |
| `usage_update` | once, at end of turn |
| `user_message_chunk` | **replay only** (§2.5) — never during a live turn |

Binary strings also contain `current_mode_update` and `plan`, but **neither was ever
emitted** across all scenarios [OBS]. `plan` in particular appears 223× in the binary but
that is overwhelmingly OpenCode's own "plan mode" agent, not the ACP `plan` update kind.
[INF] blobot should tolerate but not depend on them.

### 3.1 `available_commands_update` [OBS]

Sent ~7 ms after `session/prompt`, before any model output:

```jsonc
{"sessionUpdate":"available_commands_update",
 "availableCommands":[{"name":"animation-vocabulary","description":"Reverse-lookup glossary…"}, …]}
```

**Warning:** in this environment this array carried **~40 entries scraped from the user's
global skill/command config**, with full multi-sentence descriptions — several KB on every
single turn. It is a *slash-command menu*, not agent state. blobot should capture it once
per session for a command palette and otherwise drop it, and should consider `--pure` to
suppress user-plugin-sourced entries.

### 3.2 `agent_thought_chunk` — reasoning [OBS]

```jsonc
{"sessionUpdate":"agent_thought_chunk",
 "messageId":"msg_04d75eb640010MUAjZGoNa40HT",
 "content":{"type":"text","text":" user wants a"}}
```

- Token-level deltas, arriving ~20–130 ms apart.
- `messageId` is **shared with the `agent_message_chunk`s of the same assistant message** —
  reasoning and answer are one message. blobot cannot key on `messageId` alone to separate
  the thinking pane from the answer pane; it must key on `sessionUpdate`.
- No explicit start/end marker. The transition to `agent_message_chunk` is the only signal
  that thinking ended.

### 3.3 `agent_message_chunk` — assistant text [OBS]

```jsonc
{"sessionUpdate":"agent_message_chunk",
 "messageId":"msg_04d75eb640010MUAjZGoNa40HT",
 "content":{"type":"text","text":"Hello there"}}
```

Identical shape to thought chunks. Deltas are ragged — `"Hello there"`, `","`,
`" friend."` all arrived in the **same millisecond** (t=5017), so they are flushed in
bursts, not paced. Concatenation of `content.text` in arrival order reconstructs the
message exactly (verified: `"OK"+"ZEBRA"` in `resume.mjs`).

`content` is a full ACP content block, so `type` may be something other than `"text"` for
image output [INF — only `text` observed].

### 3.4 `usage_update` [OBS]

```jsonc
{"sessionUpdate":"usage_update","used":49300,"size":200000,
 "cost":{"amount":0,"currency":"USD"}}
```

One per turn, just before the `session/prompt` result. `used`/`size` are **context-window**
occupancy, not cumulative billing tokens — this is the number to drive a "context full"
gauge. `cost.amount` was `0` throughout (subscription-billed provider).

### 3.5 Turn completion [OBS]

The `session/prompt` **response** is the turn terminator:

```jsonc
{"jsonrpc":"2.0","id":3,"result":{
  "stopReason":"end_turn",
  "usage":{"inputTokens":47508,"outputTokens":20,"totalTokens":49320,"cachedReadTokens":1792},
  "_meta":{}}}
```

Observed `stopReason` values: **`end_turn`** and **`cancelled`**. `usage` here is
per-turn model accounting (distinct from `usage_update`'s context gauge). `_meta` was
always `{}`.

**Note the asymmetry:** the streaming events are notifications, but the *end of turn* is a
response to the client's own request. A normalized `AgentEvent` stream must synthesize a
turn-ended event from the RPC reply — it does not arrive as a `session/update`.

### 3.6 Turn timing [OBS]

Cold start to first token, `t1-basic.jsonl`:

| t (ms) | |
|---|---|
| 2 | `initialize` sent |
| 834 | initialize result (**~0.8 s process warm-up**) |
| 2274 | `session/new` result (**~1.4 s**) |
| 2281 | `available_commands_update` |
| 4753 | first `agent_thought_chunk` (**~2.5 s to first token**) |
| 5017 | first `agent_message_chunk` |
| 5088 | `usage_update` + prompt result |

**~2.3 s of fixed startup cost before a prompt can even be sent.** For blobot this argues
for warming an OpenCode process (and its session) at teammate-creation time rather than at
first-message time.

---

## 4. Tool calls

**Yes — the client sees the tool name, its kind, its arguments, its streaming output, and
its result, and can approve or deny it.** `t2-tools.jsonl` (auto-allow) and
`t3-perm-allow.jsonl` (ask) are the evidence.

### 4.1 Lifecycle [OBS]

The pattern is consistently **`tool_call` (pending) → one or more `tool_call_update`
(in_progress) → one `tool_call_update` (completed | failed)**.

**The first `tool_call` is an empty stub.** This is the single most important shape detail:

```jsonc
{"sessionUpdate":"tool_call","toolCallId":"chatcmpl-tool-b9075274fc1667ae",
 "title":"read","kind":"read","status":"pending","locations":[],"rawInput":{}}
```

`rawInput` is `{}` and `locations` is `[]` because the model's arguments **have not
finished streaming yet**. `title` is the bare tool name. The *next* update fills them in:

```jsonc
{"sessionUpdate":"tool_call_update","toolCallId":"chatcmpl-tool-b9075274fc1667ae",
 "status":"in_progress","kind":"read","title":"read",
 "locations":[{"path":"/…/proj/hello.txt"}],
 "rawInput":{"filePath":"/…/proj/hello.txt"}}
```

**blobot must not render the `tool_call` stub as final** — it will show a nameless tool
with no arguments. Treat `tool_call` as "reserve a row", and populate from the first
`tool_call_update` that carries a non-empty `rawInput`.

### 4.2 `title` mutates across the lifecycle [OBS]

`title` is a **human display string that changes**, not a stable identifier:

| tool | `tool_call` | `in_progress` | `completed` |
|---|---|---|---|
| read | `"read"` | `"read"` | `"tmp/…/proj/hello.txt"` (the path, leading `/` stripped) |
| bash | `"bash"` | `"echo TOOLTEST"` (the command) | `"echo TOOLTEST"` |
| write | `"write"` | `"write"` | `"tmp/…/proj/out.txt"` |
| MCP | `"blobot_blobot_ping"` | same | *(absent on the completed update)* |

**`toolCallId` is the only stable key.** And note the completed update may **omit**
`title`, `kind`, `locations`, and `rawInput` entirely (see the MCP and bash completions) —
so blobot must *merge* updates into accumulated state, never replace.

### 4.3 `kind` — the normalizable tool taxonomy [OBS]

| OpenCode tool | `kind` |
|---|---|
| `read` | `read` |
| `write` | `edit` |
| `bash` | `execute` |
| MCP tool (`blobot_blobot_ping`) | `other` |

This is a small, stable, provider-agnostic enum and is a **strong candidate for blobot's
normalized tool-category vocabulary**. Note every MCP tool collapses to `other`, so
client-supplied tools are not distinguishable by `kind` — use the `<server>_` name prefix
(§7).

### 4.4 Arguments — `rawInput` [OBS]

Real, complete, un-redacted tool arguments:

```jsonc
"rawInput":{"command":"sleep 60 && echo LATE","timeout":90000,"cwd":"/…/proj"}
"rawInput":{"filePath":"/…/proj/out.txt","content":"DONE"}
"rawInput":{"filePath":"/…/proj/hello.txt"}
```

For a permission request on a **write**, `rawInput` is transformed into a **unified diff**
instead of raw content, and a parallel `content` array carries a structured diff block
(§5).

### 4.5 Streaming output [OBS]

`bash` emitted **three** `in_progress` updates. The first two carried no `content`; the
third carried partial stdout:

```jsonc
{"status":"in_progress", …, "content":[{"type":"content","content":{"type":"text","text":"TOOLTEST\n"}}]}
```

So **incremental tool output is available** — the `content` array is *cumulative*, not
delta (each update carries the full output so far). blobot can render live terminal
output; replace rather than append.

Note the double nesting: `content: [{ type: "content", content: {type:"text", text} }]`.

### 4.6 Results — `content` and `rawOutput` [OBS]

The completed update carries both a display form and a machine form:

```jsonc
{"sessionUpdate":"tool_call_update","toolCallId":"chatcmpl-tool-b9075274fc1667ae",
 "status":"completed",
 "title":"tmp/…/proj/hello.txt",
 "content":[{"type":"content","content":{"type":"text","text":"The secret number is 42."}}],
 "rawOutput":{
   "output":"<path>/…/hello.txt</path>\n<type>file</type>\n<content>\n1: The secret number is 42.\n\n(End of file - total 1 lines)\n</content>",
   "metadata":{
     "preview":"The secret number is 42.","truncated":false,"loaded":[],
     "display":{"type":"file","path":"/…/hello.txt","text":"The secret number is 42.",
                "lineStart":1,"lineEnd":1,"totalLines":1,"truncated":false}}}}
```

- `content[]` — the **clean, renderable** result. Use this.
- `rawOutput.output` — the **model-facing** string, XML-tagged and line-numbered. Do not
  show this to a human.
- `rawOutput.metadata` — **OpenCode-specific and tool-specific**. Rich but non-portable:
  `read` gives `display` with line ranges; `bash` gives `{output, exit, truncated}`;
  `write` gives `{diagnostics, filepath, exists, truncated}`. `metadata.truncated` and
  `metadata.outputPath` are the signal that output was elided to a file.
  **Recommendation: `rawOutput` should be an opaque `raw` passthrough in blobot's
  `AgentEvent`, not a normalized field.**

`bash` completion carries `metadata.exit` — the process exit code. This is the only place
an exit status appears.

### 4.7 Concurrency [OBS]

In `t2-tools.jsonl` the `read` and `bash` `tool_call` stubs both arrived at **t=6010**,
interleaved, before either completed. Tool calls **overlap**; blobot's UI must key strictly
on `toolCallId` and cannot assume a serial tool timeline.

### 4.8 Tool failure [OBS]

```jsonc
{"sessionUpdate":"tool_call_update","toolCallId":"call_320a…","status":"failed",
 "kind":"read","title":"read","locations":[{"path":"/definitely/does/not/exist.txt"}],
 "rawInput":{"filePath":"/definitely/does/not/exist.txt"},
 "content":[{"type":"content","content":{"type":"text","text":"File not found: /definitely/does/not/exist.txt"}}],
 "rawOutput":{"error":"File not found: /definitely/does/not/exist.txt"}}
```

`status: "failed"` + `rawOutput.error` (a *string*, and `rawOutput.output` is absent). The
turn continues normally — a failed tool is fed back to the model, not an abort.

---

## 5. Permissions

### 5.1 Defaults auto-allow [OBS]

With no project config, **`read`, `bash`, and `write` all executed with zero
`session/request_permission` calls** (`t2-tools.jsonl`). **This is a safety-critical
finding for blobot:** an ACP client that merely *implements* `session/request_permission`
gets no protection by default. OpenCode decides locally whether to ask.

Asking is enabled by an `opencode.json` in the session `cwd`:

```jsonc
{"$schema":"https://opencode.ai/config.json",
 "permission":{"edit":"ask","bash":"ask","webfetch":"ask"}}
```

**blobot should write this file into each managed worktree** if it wants approval control.
It is the only observed lever. (There is no ACP-level "always ask" toggle.)

### 5.2 The request [OBS]

```jsonc
{"jsonrpc":"2.0","id":0,"method":"session/request_permission","params":{
  "sessionId":"ses_fb2893d60ffeweJIWMUN71AfCS",
  "toolCall":{
    "toolCallId":"call_543b30b8ff4b4f03a92253b0",
    "title":"echo PERMTEST","kind":"execute","status":"pending",
    "locations":[],
    "rawInput":{"command":"echo PERMTEST"}},
  "options":[
    {"optionId":"once",   "kind":"allow_once",   "name":"Allow once"},
    {"optionId":"always", "kind":"allow_always", "name":"Always allow"},
    {"optionId":"reject", "kind":"reject_once",  "name":"Reject"}]}}
```

The three options were **identical in every observed request**. There is no
`reject_always`.

For an **edit**, the embedded `toolCall` is much richer — `rawInput` becomes a unified
diff and a structured diff block appears in `content`:

```jsonc
"rawInput":{"filepath":"/…/perm.txt",
            "diff":"Index: /…/perm.txt\n===…\n@@ -0,0 +1,1 @@\n+OK\n\\ No newline at end of file\n"},
"content":[{"type":"diff","path":"/…/perm.txt","oldText":"","newText":"OK"}]
```

Note the key is `filepath` here vs `filePath` in the tool's own `rawInput` — **OpenCode is
inconsistent about that casing across surfaces.**

**Ordering:** the permission request arrives *after* `tool_call` and after the
`in_progress` `tool_call_update`. blobot must be prepared to attach an approval prompt to
a tool row that is already rendered as running.

### 5.3 The response [OBS]

```jsonc
{"jsonrpc":"2.0","id":0,"result":{"outcome":{"outcome":"selected","optionId":"once"}}}
```

Approving `once` → tool proceeds, completes ~24 ms later.

**Rejecting** (`optionId: "reject"`, `t4-perm-deny.jsonl`) →

```jsonc
{"sessionUpdate":"tool_call_update","toolCallId":"call_4fb62d63869b46f6aa31c8a3",
 "status":"failed","kind":"execute","title":"echo DENYTEST",
 "content":[{"type":"content","content":{"type":"text","text":"The user rejected permission to use this specific tool call."}}],
 "rawOutput":{"error":"The user rejected permission to use this specific tool call."}}
```

— i.e. a rejection is surfaced as an ordinary **tool failure**, indistinguishable in shape
from "file not found". The only discriminator is the error *string*. The turn then ends
normally with `stopReason: "end_turn"`.

[INF] ACP also defines `{"outcome":{"outcome":"cancelled"}}` for the case where the client
cancels the turn while a permission prompt is open. Not exercised.

---

## 6. Cancellation

### 6.1 Request [OBS]

`session/cancel` is a **notification** — no `id`, no response:

```jsonc
{"jsonrpc":"2.0","method":"session/cancel","params":{"sessionId":"ses_fb2889306ffeGLAJTQfZ9ql4bF"}}
```

### 6.2 What arrives after [OBS]

From `t5-cancel.jsonl`, cancelling 4.4 s into a `sleep 60`:

| t (ms) | event |
|---|---|
| 9609 | client sends `session/cancel` |
| **9629** | `tool_call_update` — the in-flight bash goes **`status: "completed"`** with `content` = `"(no output)\n\n<shell_metadata>\nUser aborted the command\n</shell_metadata>"` and `rawOutput.metadata.exit = null` |
| 9640 | `usage_update` with **`used: 0`** |
| 9640 | `session/prompt` **resolves** (not errors) with `{"stopReason":"cancelled","usage":{"inputTokens":0,"outputTokens":0,"totalTokens":0}}` |

**Acknowledgement latency: ~20–31 ms.** Clean and fast.

Three things to encode in blobot's adapter:

1. **The cancelled prompt RESOLVES, it does not reject.** The `stopReason: "cancelled"` on
   the successful RPC reply is the acknowledgement. A client that only watches for a
   JSON-RPC error on cancel will hang forever.
2. **A cancelled tool reports `status: "completed"`, not `cancelled`.** The only signal
   that it was aborted is `exit: null` plus the `"User aborted the command"` text inside
   the output. blobot must **not** trust `status` alone to decide whether a tool
   succeeded; if the turn ended `cancelled`, mark every non-terminal tool as aborted.
3. `usage_update` reports `used: 0` on cancel — a **context gauge reset**, which will look
   like a bug in the UI if rendered naively. Suppress the final `usage_update` when the
   turn was cancelled.

---

## 7. Errors

### 7.1 Protocol errors [OBS]

Standard JSON-RPC error objects, with a useful `data` payload:

```jsonc
// unknown method
{"code":-32601,"message":"\"Method not found\": nonexistent/method","data":{"method":"nonexistent/method"}}

// unknown session
{"code":-32602,"message":"Invalid params: session not found: bogus-session","data":{"sessionId":"bogus-session"}}

// schema violation (Zod-shaped)
{"code":-32602,"message":"Invalid params",
 "data":{"_errors":[],"cwd":{"_errors":["Invalid input: expected string, received undefined"]}}}

// domain validation
{"code":-32602,"message":"Invalid params: model not found: notaprovider/notamodel",
 "data":{"providerId":"notaprovider","modelId":"notaprovider/notamodel"}}
```

Note the escaped quotes inside `"Method not found"` — a small formatting quirk; match on
`code`, never on `message`.

Every such error is **also** dumped to stderr in bun's inspect format. Harmless, but it
means stderr volume tracks error volume.

### 7.2 Tool / model errors [OBS]

Not protocol errors. They surface as `tool_call_update` with `status: "failed"` and
`rawOutput.error` (§4.8, §5.3) and the turn proceeds. blobot's normalized vocabulary
therefore needs **two distinct error channels**: a transport/protocol error attached to a
request, and a tool error attached to a `toolCallId`.

**Not observed:** a provider/API failure mid-turn (rate limit, 500, expired token). All
three configured providers were healthy and I did not touch credentials. [INF] Based on
the tool-error pattern I would *expect* it to surface as either a `-32603`-class error on
the `session/prompt` reply or a `stopReason` other than `end_turn`/`cancelled` — **but
this is unverified and is the single biggest gap in this document.** It should be
exercised before blobot ships error handling (easiest safe route: point a session at a
provider with a deliberately unreachable `baseURL` via `opencode.json`).

### 7.3 Process death [OBS]

- `stdin` closed → **exit 0** within ~3 s. Graceful.
- `SIGTERM` → process exits; no farewell message on stdout.
- Any in-flight `session/prompt` promise simply **never resolves**. blobot **must** treat
  child-process `exit`/`close` as a terminal event that fails every pending request —
  nothing on the protocol wire will tell it.
- Session state is already on disk, so a crashed teammate can be resumed with
  `session/load` (§2.5) rather than restarted from zero. **This is a real resilience win
  and should shape blobot's supervision strategy.**

---

## 8. Custom tools (client → agent)

**Confirmed working** (`t8-mcp.log`), consistent with the conclusion of research file 01.

Client passes MCP server configs on `session/new`:

```jsonc
{"method":"session/new","params":{
  "cwd":"/…/proj",
  "mcpServers":[{"name":"blobot","command":"/usr/bin/node","args":["/…/mcpsrv.mjs"],"env":[]}]}}
```

I wrote a 15-line stdio MCP server exposing one tool `blobot_ping`. Observed:

- The session was created without error; OpenCode spawned the server and called
  `initialize` + `tools/list` on it.
- The model called it, and the tool appeared in the ACP stream as an **ordinary tool call**:

```jsonc
{"sessionUpdate":"tool_call","toolCallId":"call_a27ed3382cb04dbda608099b",
 "title":"blobot_blobot_ping","kind":"other","status":"pending","locations":[],"rawInput":{}}
{"sessionUpdate":"tool_call_update","toolCallId":"call_a27ed…","status":"in_progress",
 "kind":"other","title":"blobot_blobot_ping","rawInput":{"who":"alain"}}
{"sessionUpdate":"tool_call_update","toolCallId":"call_a27ed…","status":"completed",
 "content":[{"type":"content","content":{"type":"text","text":"PONG-FROM-BLOBOT for alain"}}],
 "rawOutput":{"output":"PONG-FROM-BLOBOT for alain","metadata":{"truncated":false}}}
```

- The agent then reported ``It returned: `PONG-FROM-BLOBOT for alain` `` — round trip
  complete.

Key details for blobot:

- **Tool names are namespaced `<serverName>_<toolName>`** → `blobot` + `blobot_ping` =
  `blobot_blobot_ping`. Name your MCP server and tools so the concatenation reads well
  (e.g. server `blobot`, tool `ping` → `blobot_ping`).
- `env` is an **array** in the `session/new` schema, not an object.
- MCP tools get `kind: "other"` and **were not permission-gated** even with
  `permission: {bash:"ask", edit:"ask"}` set. blobot's own tools would run unprompted —
  fine if blobot owns them, but worth knowing.
- `agentCapabilities.mcpCapabilities` reported `{http:true, sse:true}`; stdio is the
  baseline and worked.

---

## 9. Gotchas — things that will bite you

Ranked by how much damage they do if missed.

1. **Agent-originated request IDs start at 0 and are a SEPARATE ID space.** [OBS] In
   `t3-perm-allow.jsonl` the client used ids 1, 2, 3 while OpenCode concurrently sent
   `session/request_permission` with **id 0**, then id 1, then `fs/write_text_file` with
   id 2. A naive client with one `Map` keyed by id **will cross-wire responses**. blobot
   must keep two independent tables, or key outbound by `("out", id)`.

2. **A cancelled tool says `status: "completed"`.** [OBS] §6.2. Do not infer success from
   `status`.

3. **The first `tool_call` has empty `rawInput` and `locations`, and `title` is just the
   tool name.** [OBS] §4.1. Rendering it as final shows a nameless argument-less tool.

4. **`tool_call_update` is a partial patch, not a snapshot.** [OBS] Completion updates
   frequently omit `kind`, `title`, `locations`, `rawInput`. Merge; never replace.

5. **Concurrent prompts on one session collapse into a single turn.** [OBS] Sending a
   second `session/prompt` 3 s into a running one caused **both** requests to resolve with
   byte-identical results (`inputTokens:98, outputTokens:3, totalTokens:49509`) — the
   second prompt appears to displace the first, and the first's reply is the second's
   result. **blobot must serialize prompts per session** and queue at the adapter layer.

6. **Default permissions auto-allow everything**, including `bash` and `write`. [OBS] §5.1.
   Implementing `session/request_permission` is not sufficient; blobot must write an
   `opencode.json` with `permission: ask` into the worktree.

7. **`cwd` is not validated.** [OBS] §2.1. A typo'd worktree yields a working session that
   fails mysteriously inside tools.

8. **`available_commands_update` can be multi-KB and is resent on every prompt.** [OBS]
   §3.1. It also leaks the user's *global* skill list into every session — consider
   `--pure`.

9. **Turn completion is an RPC reply, not an event.** [OBS] §3.5. Synthesize it.

10. **`usage_update` is a context gauge, not billing**, and resets to `0` on cancel. [OBS]

11. **`filePath` vs `filepath`** casing differs between a write tool's `rawInput` and the
    same write's permission-request `rawInput`. [OBS] §5.2.

12. **~2.3 s of startup latency** before the first prompt can be sent. [OBS] §3.6.

13. **No `protocolVersion` negotiation.** [OBS] §1. Check the returned value yourself.

---

## 10. Recommended mapping to blobot's `AgentEvent`

A first cut, derived from what was actually observed. Ticket 04 owns the final vocabulary;
this is input to it, not a decision.

| OpenCode | proposed `AgentEvent` | notes |
|---|---|---|
| `agent_message_chunk` | `message.delta` | `{text}`; concat in order |
| `agent_thought_chunk` | `reasoning.delta` | same shape, separate channel |
| `user_message_chunk` (replay) | `message.user` | replay only; whole messages |
| `tool_call` | `tool.started` | `{id, name: title, kind}`; **args not yet known** |
| `tool_call_update` w/ `in_progress` | `tool.progress` | `{id, args?, output?}`; output cumulative |
| `tool_call_update` w/ `completed` | `tool.completed` | `{id, content[], raw}` |
| `tool_call_update` w/ `failed` | `tool.failed` | `{id, error: rawOutput.error}` |
| `session/request_permission` | `permission.requested` | needs a reply channel, not fire-and-forget |
| `usage_update` | `context.usage` | `{used, size}`; suppress on cancel |
| `session/prompt` reply | `turn.ended` | `{reason: end_turn \| cancelled, usage}` |
| `available_commands_update` | `session.commands` | capture once, drop thereafter |
| JSON-RPC error | `protocol.error` | attached to a request |
| child `exit`/`close` | `runtime.exited` | must fail all pending requests |

The `kind` enum (`read` / `edit` / `execute` / `other`) is small and portable enough to
adopt as blobot's tool-category vocabulary directly.

---

## 11. Open questions for downstream tickets

- **Provider/model failure mid-turn is unobserved** (§7.2). Highest-value follow-up.
- Do custom `agent` definitions in `opencode.json` show up as extra `mode` options in
  `configOptions`? [not tested]
- Does `session/prompt` accept non-text content blocks in practice?
  `promptCapabilities` advertises `{embeddedContext:true, image:true}` [OBS from
  `initialize`] but only `{type:"text"}` was sent.
- Is `--pure` sufficient to make `available_commands_update` deterministic across machines?
- Multi-session-per-process is *possible* (§2.1) — is it *advisable*? Cancellation is
  per-session so isolation looks sound, but tool concurrency and the shared SQLite DB were
  not stress-tested.
- `session/set_model` exists but was only confirmed to exist, not exercised (§2.3);
  `session/set_config_option` with `configId:"model"` is the tested path.
