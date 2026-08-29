# 02 — Is Claude Code's ACP support real?

Research findings for `issues/02-is-claude-codes-acp-support-real.md`.
Date: 2026-08-29.

Sources, in order of authority:

- The locally installed binary, `claude 2.1.251` at `/home/alain/.local/share/claude/versions/2.1.251` (`--help`, subcommand list, `strings` sweep).
- **A live ACP handshake I drove by hand** against `@agentclientprotocol/claude-agent-acp@0.70.0` over stdio — four scripted client runs covering prompt streaming, client-supplied MCP tools, cancellation, cross-process resume, and persona injection. Transcript excerpts below are real output, not documentation.
- Package sources unpacked from npm: `@agentclientprotocol/claude-agent-acp@0.70.0`, `@anthropic-ai/claude-agent-sdk@0.3.232` and `@0.3.251`, `@agentclientprotocol/sdk@1.4.0`.
- `agentclientprotocol.com` (spec + governance), the `agentclientprotocol/*` GitHub repos, `code.claude.com/docs`, and `support.claude.com`.

---

## Short answer

**Claude Code has no native ACP mode, and almost certainly never will — but the ACP path is still
the right one, and it is in far better shape than the ticket assumes.**

Two findings drive everything else:

1. **`claude 2.1.251` ships nothing ACP.** No `--acp` flag, no `acp` subcommand, no
   `agent-client-protocol` string anywhere in the 214 MB binary. `anthropics/claude-code#6686`
   ("Add support for ACP", 551 reactions) was **closed on 2026-02-09**. This is not a
   "not yet" — it is a decision.

2. **The bridge everyone still cites is dead, and its successor is excellent.**
   `@zed-industries/claude-code-acp` (the package named in the ticket and in ticket 01's
   findings) is **deprecated**. npm says so out loud:

   > `This package has been renamed to @agentclientprotocol/claude-agent-acp. Please migrate to continue receiving updates.`

   The live package is **`@agentclientprotocol/claude-agent-acp@0.70.0`**, published
   2026-08-18, ~64 releases since the March rename, last commit 2026-08-28, 2.4k stars.
   It wraps the **official** `@anthropic-ai/claude-agent-sdk@0.3.232` (one week behind the
   current 0.3.251).

I drove 0.70.0 end to end from a hand-written JSON-RPC client. Everything blobot needs works:
token-level streaming, client-injected custom tools, mid-turn cancellation, cross-process
session resume, per-session personas, and **zero credential handling** — it rode my existing
`~/.claude/.credentials.json` login with no `ANTHROPIC_API_KEY` anywhere in the environment.

**Recommendation: path (b), `@agentclientprotocol/claude-agent-acp`, invoked over stdio.**
Details and tradeoffs in §5.

---

## 1. Path (a) — native ACP in Claude Code: does not exist

`claude --help` on 2.1.251 lists 60-odd flags and 18 subcommands. There is no `acp` anywhere:

```
Commands:
  agents, attach, auth, auto-mode, doctor, gateway, import, install, logs, mcp,
  plugin, project, respawn, rm, setup-token, stop, ultrareview, update
```

The nearest neighbours are MCP-shaped, not ACP-shaped: `claude mcp`, `--mcp-config`,
`--strict-mcp-config`. The streaming surface is `--print` + `--output-format stream-json`,
which is Anthropic's own JSON dialect, not ACP.

A `strings` sweep of the binary returns **zero** occurrences of `agent-client-protocol` or
`agentclientprotocol`, and zero of the ACP method names (`session/new`, `session/prompt`,
`session/update`). The nine literal `acp` hits are noise from bundled numerical libraries
(`fracplot`, `lngammacplx`) and one bundler chunk filename.

**Verdict: no native ACP mode, under any flag. Verified against the installed binary, not inferred.**

---

## 2. Path (b) — `@agentclientprotocol/claude-agent-acp` (the live bridge)

### 2.1 Identity, governance, health

| Package | Latest | Published | Status |
|---|---|---|---|
| `@agentclientprotocol/claude-agent-acp` | **0.70.0** | 2026-08-18 | **canonical adapter** |
| `@zed-industries/claude-code-acp` | 0.16.2 | 2026-02-17 | **deprecated** (renamed) |
| `@agentclientprotocol/sdk` | **1.4.0** | 2026-08-20 | **canonical ACP SDK** |
| `@zed-industries/agent-client-protocol` | 0.4.5 | 2025-10-02 | **deprecated** (renamed) |
| `@anthropic-ai/claude-agent-sdk` | 0.3.251 | 2026-08-28 | official; 0.70.0 pins 0.3.232 |

The GitHub repo was **transferred**, not forked: `zed-industries/claude-code-acp` →
`github.com/agentclientprotocol/claude-agent-acp`, same repo id, created 2025-08-27,
`pushed_at` 2026-08-28, 2439 stars, 147 open issues, Apache-2.0.

Governance, from `agentclientprotocol.com/community/governance`:

> "ACP is jointly governed by Zed and JetBrains, who collaborate to ensure the protocol serves
> the broader ecosystem."

Lead maintainers with veto: Ben Brandt (Zed), Sergey Ignatov (JetBrains). The site says they
are "working toward transitioning to an independent foundation" — **that has not happened**.

**Anthropic is not involved.** Not in governance, not in the maintainer list, not among the
npm owners (benbrandt, aguzubiaga, cirwin — all Zed). The package's `author` field still reads
"Zed Industries" and its own README calls it "ACP adapter for the Claude Agent SDK", never
official. Treat this as **a well-maintained third-party bridge over Anthropic's official SDK** —
which is a materially different risk profile from "a community hack".

### 2.2 How you launch it

```
npx -y @agentclientprotocol/claude-agent-acp@0.70.0     # no arguments
```

- `bin`: `claude-agent-acp` → `dist/index.js`. ESM, `engines.node >= 22`.
- Speaks newline-delimited JSON-RPC on **stdin/stdout**. `index.js` remaps
  `console.log/info/warn/debug` onto stderr so nothing pollutes the channel — stderr is
  free for us to log from.
- Two non-ACP flags: `--cli` (proxies remaining args to the wrapped native `claude` binary
  with `stdio: "inherit"`) and `--version`.
- Env knobs: `CLAUDE_CODE_EXECUTABLE` (pin the `claude` binary), `CLAUDE_AGENT_LOGS` (log dir).
- Exits cleanly on stdin EOF (`connection.closed.then(shutdown)`) — so `stop()` in
  `AgentRuntime` can just close stdin, no SIGKILL dance.

### 2.3 What it advertises — real `initialize` response

Sent `{"protocolVersion":1,...}`, got back:

```json
{
  "protocolVersion": 1,
  "agentCapabilities": {
    "promptCapabilities": { "image": true, "embeddedContext": true },
    "mcpCapabilities": { "http": true, "sse": true },
    "auth": { "logout": {} },
    "loadSession": true,
    "sessionCapabilities": {
      "additionalDirectories": {}, "close": {}, "delete": {},
      "fork": {}, "list": {}, "resume": {}
    },
    "_meta": { "claudeCode": { "promptQueueing": true } }
  },
  "agentInfo": { "name": "@agentclientprotocol/claude-agent-acp",
                 "title": "Claude Agent", "version": "0.70.0" },
  "authMethods": [],
  "_meta": { "steering": { "supported": true },
             "goal": { "version": 1, "controlMethod": "_session/goal" } }
}
```

Note `"authMethods": []` — **because I was already logged in locally, it asks for nothing.**
That empty array is the whole credential story (see §2.9).

I probed version negotiation by sending `protocolVersion: 99`; it answered `1`. The wire
protocol is integer `1` and has been since the beginning — `@agentclientprotocol/sdk`
exports `PROTOCOL_VERSION = 1` in both 0.14.1 and 1.4.0. The SDKs went 1.0 on 2026-06-24;
a **v2 draft exists** (`schema/v2/schema.unstable.json`, tag `schema-v2.0.0-alpha.3`,
2026-08-20) but is a draft — do not target it.

### 2.4 Methods implemented

| Registered by the adapter | Notably absent |
|---|---|
| `initialize`, `authenticate`, `logout` | `terminal/*` (removed in 0.70.0 — see below) |
| `session/new`, `session/load`, `session/fork`, `session/list`, `session/delete`, `session/resume`, `session/close` | `mcp/message`, `nes/*`, `document/did*` |
| `session/set_mode`, `session/set_config_option`, `session/prompt`, `session/cancel` | |
| `providers/list`, `providers/set`, `providers/disable` | |
| Extensions `_session/steering`, `_session/goal` | |

Client-side calls it makes back at us: `session/update`, `session/request_permission`,
`fs/read_text_file`, `fs/write_text_file`, `elicitation/create`, `elicitation/complete`.

**Regression worth knowing:** 0.16.2 injected an in-process MCP server (`mcp__acp__Read/Write/
Edit/Bash/…`) that proxied Claude's own file and shell tools onto the *client's* `fs/*` and
`terminal/*` methods. 0.70.0 deleted that entirely. Bash now runs inside Claude's own process;
output surfaces as `{"type":"terminal","terminalId":…}` content blocks in `tool_call` updates,
gated on `clientCapabilities._meta["terminal_output"] === true`. **Practically for blobot: the
client no longer owns the terminals, and cannot serve unsaved-buffer reads.** Given that blobot
runs agents in real git worktrees on disk rather than in an editor with dirty buffers, this
costs us nothing.

### 2.5 Streaming granularity — token-level, verified

`agent_message_chunk` deltas are genuinely sub-message. Real capture, prompt "Reply with
exactly the word: PONG":

```
[U] agent_message_chunk {"content":{"type":"text","text":"P"},   "messageId":"msg_011CeX2fGNuUUBawYCfV3oL1"}
[U] agent_message_chunk {"content":{"type":"text","text":"ONG"}, "messageId":"msg_011CeX2fGNuUUBawYCfV3oL1"}
```

The mechanism: the adapter forces `options.includePartialMessages: true` on the Agent SDK,
which makes the SDK emit `stream_event` messages carrying raw Anthropic SSE deltas.
`content_block_delta`/`text_delta` → `agent_message_chunk`; `thinking_delta` →
`agent_thought_chunk`. There is a dedup layer: streamed blocks are accumulated per
`(index, type)` and the later consolidated `assistant` message is diffed against what already
went out, so you never see the same text twice.

Thinking is separately streamed. Real capture:

```
[U] agent_thought_chunk {"content":{"type":"text","text":"The user is asking"},...}
[U] agent_thought_chunk {"content":{"type":"text","text":" me to identify myself in one short sentence..."},...}
```

**The 11 `sessionUpdate` variants this adapter actually emits** (grepped from `acp-agent.js`
and cross-checked against live traffic):

`agent_message_chunk`, `user_message_chunk`, `agent_thought_chunk`, `tool_call`,
`tool_call_update`, `plan`, `available_commands_update`, `current_mode_update`,
`usage_update`, `session_info_update`, `config_option_update`.

Not emitted, though the 1.4.0 schema defines them: `plan_update`, `plan_removed`,
`compaction_update`, `compaction_summary_chunk`. (Schema 1.4.0 defines 15 variants total;
the published docs page lists only 5 — **trust the schema, not the docs page**.)

Extras: `TodoWrite` maps to `plan`; every tool call carries `_meta.claudeCode.toolName`;
subagent nesting arrives via `_meta.claudeCode.parentToolUseId` + `subagent: true`, opt-in
through `clientCapabilities._meta["subagent-transcript"] = true`.

`usage_update` gives us a live context meter and running cost for free:

```json
{"sessionUpdate":"usage_update","used":36785,"size":1000000,
 "cost":{"amount":0.232279,"currency":"USD"}}
```

### 2.6 Tool-call visibility — start, streaming args, and finish

Full observability, including **incrementally streamed tool arguments**. Real capture of the
custom tool described in §2.7:

```
[U] tool_call        {"toolCallId":"toolu_0188Mj…","status":"pending","title":"mcp__blobot__blobot_mailbox_send","kind":"other","rawInput":{}}
[U] tool_call_update {"toolCallId":"toolu_0188Mj…","rawInput":{"to":"Bob"}}
[U] tool_call_update {"toolCallId":"toolu_0188Mj…","rawInput":{"to":"Bob","body":"hello from Alice"}}
[U] tool_call_update {"toolCallId":"toolu_0188Mj…","_meta":{"claudeCode":{"toolResponse":[{"type":"text","text":"delivered to Bob"}]}}}
[U] tool_call_update {"toolCallId":"toolu_0188Mj…","status":"completed","rawOutput":[{"type":"text","text":"delivered to Bob"}],
                      "content":[{"type":"content","content":{"type":"text","text":"delivered to Bob"}}]}
```

`toolCallId` is stable across the whole lifecycle, and `status` moves `pending → completed`.
This is exactly the shape ticket 04's `AgentEvent` vocabulary needs — a start with an id, zero
or more argument refinements, and a terminal update.

Permissions: the adapter maps the Agent SDK's `canUseTool` onto ACP
`session/request_permission`, offering `allow_always` / `allow_once` / `reject_once`, honouring
`bypassPermissions` / `acceptEdits` modes and a `SettingsManager` that merges user/project/
local/managed `settings.json` rules. In my runs the session defaulted to mode `auto` (a model
classifier approves/denies) and never prompted me for the MCP tool.

### 2.7 Custom tool injection — works, and this is the load-bearing result

Ticket 01 established that ACP's prescribed mechanism is `session/new.mcpServers`. **I
confirmed it end to end against Claude.** I wrote a 20-line stdio MCP server exposing one tool
`blobot_mailbox_send({to, body})`, passed it in `session/new`:

```json
{"method":"session/new","params":{
  "cwd":"…",
  "mcpServers":[{"name":"blobot","command":"node","args":["…/mcpserver.mjs"],"env":[]}]}}
```

…then prompted: *"Use the blobot_mailbox_send tool to send Bob the message 'hello from
Alice'."* Claude found it as `mcp__blobot__blobot_mailbox_send`, called it, my server logged
`[mcp] TOOL CALLED: {"to":"Bob","body":"hello from Alice"}`, and the result flowed back into
the turn. **Alice→Bob async messaging can be a real tool that blobot owns.**

The translation in `createSession()` is a straight passthrough into the Agent SDK's
`options.mcpServers`:

```js
if (server.type === "http" || server.type === "sse")
  mcpServers[server.name] = { type, url, headers: fromEntries(headers.map(e => [e.name, e.value])) };
else  // absent `type` == stdio
  mcpServers[server.name] = { type: "stdio", command, args, env: fromEntries(env.map(e => [e.name, e.value])) };
```

Two notes:

- **Ticket 01's trap does not apply to 0.70.0.** Ticket 01 warns that omitting `type` for stdio
  makes `claude-code-acp` silently drop the server. In 0.70.0 the branch above treats *absent*
  `type` as the stdio case, and my live test omitted `type` and worked. Ticket 01 tested 0.16.2.
  Safest posture: **omit `type` for stdio** against 0.70.0, and re-verify if we ever pin an
  older adapter.
- `mcpServers` is forwarded by `session/new`, `session/load`, `session/fork` and
  `session/resume` alike — so a resumed session keeps its tools. But it is still
  **session-creation-time only**: no mid-session tool registration.

### 2.8 Sessions — creation, resumption, and personas

**The ACP `sessionId` *is* the Claude Code session id.** `session/new` returned
`a3035e3d-fa62-4b4d-bcc4-aea97ecbc95e`, a plain UUID, alongside the available permission modes
and a rich `configOptions` array (mode, model, effort, fast-mode, agent persona) that we can
surface directly in blobot's UI.

`session/load` genuinely resumes **across process boundaries**. I proved it the hard way:
process A created a session and told Claude a codeword, I killed A, a *brand-new* process B
called `session/load` with the same id, and:

```
[B U] user_message_chunk  {"content":{"type":"text","text":"Remember the codeword: ZUCCHINI-42. Just say OK."}}
[B U] agent_message_chunk {"content":{"type":"text","text":"OK — codeword ZUCCHINI-42 noted."}}
LOAD RESULT: {"sessionId":"b1db01c3-…","modes":{…}}
[B U] agent_message_chunk {"content":{"type":"text","text":"ZUCCHINI-"}}
[B U] agent_message_chunk {"content":{"type":"text","text":"42"}}
```

`session/load` **replays the entire prior transcript** back as `session/update` notifications
before signalling readiness (`replaySessionHistory()`), then the new prompt answers correctly
from restored context. Under the hood `{resume: params.sessionId}` becomes the CLI's
`--resume <id>`; `session/fork` uses `--fork-session`. It also uses the SDK's `listSessions()`
/ `getSessionInfo()` helpers and pushes an auto-generated title as `session_info_update`:

```json
{"sessionUpdate":"session_info_update","title":"Send message to Bob via mailbox","updatedAt":"2026-08-29T12:21:19.324Z"}
```

`getOrCreateSession()` fingerprints the session-defining params (cwd, mcpServers) and tears
down + recreates the underlying query if they changed — so changing our MCP server config
silently restarts the backing process. Worth knowing when debugging.

**Personas.** blobot needs Alice and Bob to be distinguishable. There is a `_meta` escape
hatch on `session/new` and I verified it:

```json
{"method":"session/new","params":{"cwd":"…","mcpServers":[],
  "_meta":{
    "systemPrompt":"You are Alice, a blobot teammate. Always begin every reply with the literal token [ALICE].",
    "claudeCode":{"options":{"settingSources":[],"model":"haiku"}}}}}
```

Result: `[ALICE] I'm Alice, your blobot teammate…`, on Haiku. Two mechanisms here:

- `_meta.systemPrompt` — a string replaces the `{type:"preset",preset:"claude_code"}` default;
  an object form is also accepted (preset + append).
- `_meta.claudeCode.options` — **spread into the Agent SDK `Options` object wholesale.** Hooks,
  extra `mcpServers`, `disallowedTools`, `settingSources`, `agents`, `model` all get through.
  The adapter forcibly overrides `cwd`, `includePartialMessages`,
  `allowDangerouslySkipPermissions`, `permissionMode`, `canUseTool` and `executable`.

Both are **non-standard ACP `_meta` extensions**, not spec surface. They will work against
`claude-agent-acp` and be ignored by OpenCode. That is an argument for keeping persona
injection behind a per-provider capability in `AgentRuntimeConfig` rather than in the shared
`AgentRuntime` interface.

Also note the adapter hardcodes `settingSources: ["user","project","local"]` before spreading
`userProvidedOptions`. So **by default an ACP session inherits the user's own `CLAUDE.md`,
skills, plugins and settings** — in my first run the agent had 48 slash commands from my
personal setup. Pass `settingSources: []` via `_meta.claudeCode.options` if blobot wants a
clean-room agent. (In my test it still listed 48 commands, so the isolation is partial —
plugin-sourced skills appear to leak. Unverified where exactly; flag it if clean-room matters.)

### 2.9 Authentication — nothing for us to handle. Verified.

This is the constraint the whole project hangs on, so I tested it rather than reading about it.

My environment during the live runs contained **no `ANTHROPIC_API_KEY`, no
`ANTHROPIC_AUTH_TOKEN`, no `CLAUDE_CODE_OAUTH_TOKEN`** — `env | grep -i ANTHROPIC` returned
nothing. The only credential on the machine is `~/.claude/.credentials.json` (mode `0600`),
written by the user's own `claude` login. Every prompt succeeded, and the adapter's own stderr
confirms which path it took:

```
[session/query] sessionId=a3035e3d-… resume=none apiType=native baseUrl=native
```

`apiType=native baseUrl=native` — the user's local login, direct to Anthropic. `initialize`
returned `"authMethods": []` because there was nothing left to authenticate.

Nothing in the adapter reads `ANTHROPIC_API_KEY` for the normal path. `authenticate` is a stub
that **throws `"Method not implemented."`** unless `methodId` is `gateway`/`gateway-bedrock`.
When the user is *not* logged in, the adapter instead advertises `authMethods` entries of
`type: "terminal"` telling the client to run a command in a terminal:

| `methodId` | command |
|---|---|
| `claude-ai-login` | `claude-agent-acp --cli auth login --claudeai` (subscription) |
| `console-login` | `claude-agent-acp --cli auth login --console` (API billing) |
| `claude-login` | `claude-agent-acp --cli` (TUI `/login`), only when remote is detected |

**This is exactly blobot's model:** if the user is not authenticated, we surface a terminal
command; we never touch a token. Ticket 11 (detecting installed and authenticated agents) can
use `authMethods.length === 0` from `initialize` as its authenticated-or-not signal — that is
a clean, protocol-level probe that costs one process spawn and no inference.

**One live commercial risk, currently dormant.** Adapter issue #658 flagged that Anthropic
announced Pro/Max subscription usage would stop covering Agent SDK / third-party clients from
2026-06-15. As of the current
`support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan`:

> "We're pausing the changes to Claude Agent SDK usage described below. For now, nothing has
> changed: Claude Agent SDK, `claude -p`, and third-party app usage still draw from your
> subscription's usage limits."

So it works today, and Anthropic says "when we have an update, we'll share it before anything
takes effect." **But this risk is identical across paths (b), (c) and (d)** — all three are
"Agent SDK / third-party client" usage. It is not a reason to prefer one over another; it is a
reason for blobot's README to be honest that it depends on a policy that has already wobbled once.

### 2.10 Cancellation — clean, verified

`session/cancel` is a **notification** (no id, no response). I started a long generation,
waited 4 s, sent the notification mid-stream, and the in-flight `session/prompt` resolved:

```
[U] agent_message_chunk {"text":"\n190\n191\n192\n193"}
>> sending session/cancel
CANCELLED PROMPT RESULT: {"stopReason":"cancelled","usage":{"inputTokens":0,…}}
```

The process stayed alive and the session stayed usable. Internally `agent.cancel()` sets
`session.cancelled` and calls the Agent SDK's `query.interrupt()`; 0.70.0 additionally skips
already-closed streams, settles queued-but-unstarted turns immediately, and reconciles
message-lifecycle accounting. `session/prompt` is also wrapped in
`runPromptWithCancellation(…, ctx.signal)`, so JSON-RPC `$/cancel_request` works as an
alternative.

`stopReason` is one of `end_turn | max_tokens | max_turn_requests | refusal | cancelled` —
a ready-made terminal state for ticket 09's status machine.

### 2.11 Process model

`claudeCliPath()` resolves, in order:

1. `process.env.CLAUDE_CODE_EXECUTABLE`, if set;
2. otherwise the **native `claude` binary shipped as a platform-specific optional dependency of
   the Agent SDK** — `@anthropic-ai/claude-agent-sdk-linux-x64/claude` (with musl/glibc detection),
   and equivalents for darwin-arm64, win32-x64, etc.

So **by default the adapter does not use the user's installed `claude` at all** — it downloads
and runs the SDK's own bundled copy (0.3.232 ≈ Claude Code 2.1.232, vs the user's 2.1.251).
For blobot this matters twice over: it means an extra ~200 MB download, and it means version
drift from what the user tested in their terminal.

**Set `CLAUDE_CODE_EXECUTABLE` to the user's own binary.** I ran with
`CLAUDE_CODE_EXECUTABLE=/home/alain/.local/bin/claude` and it worked. This also lets ticket 11's
detection and the runtime agree on exactly one binary.

---

## 3. Path (c) — the Claude Agent SDK directly

`@anthropic-ai/claude-agent-sdk@0.3.251`, official Anthropic, npm-installable, TypeScript,
`engines.node >= 18`. Everything path (b) does, it does through this — because the adapter is a
thin ACP skin over it. Going direct removes a hop.

- **Auth:** same as (b). Reads the user's local OAuth credentials; no API key required.
  Precedence: cloud providers > `ANTHROPIC_AUTH_TOKEN` > `ANTHROPIC_API_KEY` > `apiKeyHelper` >
  `CLAUDE_CODE_OAUTH_TOKEN` > OAuth profiles > `/login`. (`code.claude.com/docs/en/authentication`.)
  The CLI's `--bare` mode is the *only* thing that refuses OAuth — irrelevant here, the SDK has
  no equivalent.
- **Streaming:** `query()` returns an async iterator of `SDKMessage`. Message types
  `system` (subtype `init` | `api_retry`), `assistant`, `user`, `stream_event`, `result`,
  `rate_limit_event`. Token deltas come from `SDKPartialAssistantMessage` (`type: "stream_event"`,
  carrying a raw `BetaRawMessageStreamEvent` with `text_delta` / `thinking_delta` /
  `input_json_delta`) — **only when `includePartialMessages: true`.** This is precisely what
  the adapter turns on for us.
- **Sessions:** `session_id` arrives in the `system`/`init` message; transcripts live at
  `~/.claude/projects/<encoded-cwd>/<session_id>.jsonl`. Options `resume`, `continue`,
  `forkSession`. A `startup()` helper pre-warms a process; `query()` also accepts an
  `AsyncIterable<SDKUserMessage>` for streaming input.
- **Cancellation:** `Query.interrupt(): Promise<SDKControlInterruptResponse | undefined>`
  (verified at `sdk.d.ts:2372`) stops the turn without killing the subprocess. An
  `options.abortController` is the harder hammer.
- **Tool visibility:** `assistant` messages carry `tool_use` content blocks
  (`{type, id, name, input}`); the following `user` message carries `tool_result`
  (`{tool_use_id, content, is_error?}`). No dedicated start/finish events — **we would have to
  synthesise the `tool_call` / `tool_call_update` pair the adapter hands us for free.**
  `includeHookLifecycleEvents` adds `hook_started` / `hook_progress` / `hook_response`.
- **Custom tools:** `createSdkMcpServer({name, version, tools:[tool(name, desc, zodSchema, handler)]})`
  (`sdk.d.ts:484`) gives an **in-process** MCP server on the SDK's `"sdk"` transport — no
  subprocess, no stdio framing. This is genuinely nicer than (b)'s out-of-process server.
- **Permissions:** `canUseTool(toolName, input, opts)` callback, plus `permissionMode` and
  `allowedTools`.
- **Process model:** spawns the bundled native `claude` binary as a subprocess.
  `pathToClaudeCodeExecutable?: string` **does exist** (`sdk.d.ts:1756`) — contrary to what a
  first pass through the public docs suggests — so we can pin the user's own binary here too.

**The cost of (c) is architectural, not technical.** Every capability blobot needs exists. What
we lose is the abstraction: `AgentRuntime` has to grow a bespoke Claude-shaped adapter that
duplicates the normalisation work `claude-agent-acp` already does and maintains, and the
OpenCode side of the app keeps speaking ACP. We would own the tool-call lifecycle synthesis,
the delta dedup, and the transcript replay on resume — all three of which the adapter has
already got right and keeps fixing weekly.

---

## 4. Path (d) — wrapping `claude -p --output-format stream-json`

The floor, not the plan.

- **Auth:** fine. Default (non-`--bare`) `claude -p` uses the local login.
- **Streaming:** same message types as (c); `--include-partial-messages` gives token deltas;
  `--verbose` is required alongside `stream-json`.
- **Sessions:** `--session-id <uuid>` to pin one, `--resume <id>`, `--continue`,
  `--fork-session`. `session_id` surfaces in the `system`/`init` line.
- **Cancellation: this is where it breaks.** There is no in-turn cancel. No stdin control
  message, no signal that stops a turn and leaves the process usable. **Killing the process is
  the only option** (SIGINT is the cleaner of the two). For blobot — where "cancel Alice while
  Bob is working on her behalf" is an open design question on the map — starting from a runtime
  whose only cancel is a kill is a bad foundation.
- **One process, many prompts:** `--input-format stream-json` exists for realtime streaming
  input, but the exact stdin JSON envelope is **undocumented in `--help` and I did not verify
  it**. Treat multi-prompt-per-process as unproven on this path.
- **Tool visibility:** same raw `tool_use` / `tool_result` blocks as (c) — same synthesis work.
- **Custom tools:** `--mcp-config '<json>'` accepts an inline JSON string or a file and supports
  stdio/http/sse/ws. Works, but out-of-process only.

Path (d) is what you build if the SDK is unavailable. It has strictly less than (c) and
dramatically less than (b), and its cancellation story alone disqualifies it.

---

## 5. Comparison and recommendation

| | (a) native ACP | (b) `claude-agent-acp` 0.70.0 | (c) Agent SDK | (d) `claude -p` |
|---|---|---|---|---|
| Exists | **no** | yes | yes | yes |
| Official Anthropic | — | no (Zed/JetBrains) | **yes** | **yes** |
| Token-level deltas | — | **yes** (`agent_message_chunk`) | yes (`includePartialMessages`) | yes (`--include-partial-messages`) |
| Thinking stream | — | **yes** (`agent_thought_chunk`) | yes (`thinking_delta`) | yes |
| Tool start/finish events | — | **yes, first-class** (`tool_call` → `tool_call_update`, stable `toolCallId`) | raw blocks, synthesise it | raw blocks, synthesise it |
| Streaming tool args | — | **yes** (incremental `rawInput`) | `input_json_delta` | `input_json_delta` |
| Session id | — | ACP `sessionId` == CC session id | `system.init.session_id` | same |
| Resume across processes | — | **yes**, with full transcript replay | `resume` option, no replay | `--resume`, no replay |
| Cancel without killing | — | **yes** (`session/cancel` → `stopReason: "cancelled"`) | **yes** (`query.interrupt()`) | **no — kill only** |
| Client-injected custom tools | — | **yes** (`session/new.mcpServers`, out-of-process) | **yes** (`createSdkMcpServer`, in-process) | yes (`--mcp-config`, out-of-process) |
| Per-session persona | — | yes, via non-standard `_meta` | yes, first-class `systemPrompt` | `--system-prompt` |
| Uses local login, we hold no creds | — | **yes, verified live** | yes | yes |
| Shares an interface with OpenCode | — | **yes** | no | no |

### Recommendation: path (b).

Run `@agentclientprotocol/claude-agent-acp` over stdio, with `CLAUDE_CODE_EXECUTABLE` pinned to
the user's own `claude` binary.

The premise on the map — "ACP is our preferred integration protocol, a CLI adapter is the
fallback" — **survives contact with reality**, just not the way the ticket framed it. ACP is not
real *in Claude Code*; it is real *around* Claude Code, and the thing that makes it real is
under weekly active maintenance by the people who define the protocol, sitting on top of
Anthropic's own SDK.

What (b) buys over (c), concretely: it is the **only** path where the Claude runtime and the
OpenCode runtime speak the same wire protocol, which is the entire reason `AgentRuntime` has
one shape. It hands us a normalised tool-call lifecycle with stable ids that we would otherwise
write and maintain ourselves. It replays transcripts on resume, which ticket 10's
worktree-reconcile flow wants. And its `authMethods` array is a clean protocol-level
authenticated/not probe for ticket 11.

**The tradeoffs, named:**

1. **A third party sits between us and Anthropic.** Zed/JetBrains-governed, no Anthropic
   involvement, and `anthropics/claude-code#6686` was closed — so no native ACP is coming to
   rescue us. If the adapter is abandoned, blobot's Claude support breaks. Mitigation: the
   adapter is a thin skin over the official SDK, so path (c) is a real escape hatch, and the
   `AgentRuntime` interface is precisely the seam that makes the swap survivable. **Do not let
   ACP concepts leak past `AgentRuntime` into the domain layer.**
2. **Version drift is a live hazard.** The package was renamed once already and ticket 01's
   findings are written against the dead name. **Pin an exact version** and re-verify on bumps;
   0.70.0 already removed the `terminal/*` surface that 0.16.2 had.
3. **Persona injection is off-spec.** `_meta.systemPrompt` and `_meta.claudeCode.options` are
   adapter extensions. Model them as a Claude-specific capability in `AgentRuntimeConfig`, not
   as part of the shared interface, or OpenCode will silently ignore them.
4. **An extra process hop and an extra Node runtime.** Electron main → `claude-agent-acp` (Node
   ≥ 22) → native `claude`. We need Node 22+ available, and `npx` on first run is slow. Consider
   vendoring the adapter rather than `npx`-ing it.
5. **The subscription-billing question is unresolved industry-wide** (§2.9) and hits (b), (c)
   and (d) equally. Not a path-selection input; is a README-honesty input.

**If (b) is ever ruled out, fall back to (c), not (d).** (c) is official, has real cancellation,
and offers in-process custom tools; (d)'s kill-only cancellation makes it unfit for a
multi-agent app.

---

## 6. What I could not verify

- Any Anthropic-published page asserting official ACP support. One search result implied it;
  tracing it back, it appears to be a summary of the third-party README. **No such statement found.**
- The closing comment on `anthropics/claude-code#6686` — I confirmed it is closed
  (2026-02-09) and its reaction count, but did not read the maintainer's stated reason.
- The exact stdin JSON envelope for `claude -p --input-format stream-json`. Undocumented in
  `--help`; not tested. Path (d)'s multi-prompt-per-process claim is therefore **unproven**.
- `--include-hook-events` message shapes beyond the `hook_started` / `hook_progress` /
  `hook_response` subtypes; not exercised.
- Whether `settingSources: []` fully isolates a session from the user's personal config. My test
  still saw 48 slash commands, suggesting plugin-sourced skills leak through. **Re-test if
  clean-room agents matter for the demo.**
- Whether the vestigial `readTextFile` / `writeTextFile` wrappers in 0.70.0 are reachable —
  nothing in the shipped `dist/` calls them.
- The ACP v2 draft's shape. It exists (`schema-v2.0.0-alpha.3`, 2026-08-20) and removes `fs/*`
  and `terminal/*` in favour of client MCP servers, per ticket 01. Not targeted here.
