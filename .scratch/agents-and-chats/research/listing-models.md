# Listing models before a session exists

Research for `.scratch/agents-and-chats/issues/07-listing-models-before-a-session.md`,
2026-09-03, on this machine. Every probe below was zero-token: `initialize` and `session/new` over
ACP, `--help`, `status` and list subcommands. **No `session/prompt` was sent to any runtime.**
Token cost is therefore argued from the protocol (no turn was started), not read off a usage
counter — see *What a throwaway session costs*.

Tags: **[OBS]** observed here; **[SRC]** read in the pinned bridge or the schema; **[PRIOR]** an
earlier research file on this repo; **[UNVERIFIED]** a claim nobody has measured.

Versions: `claude` 2.1.259, `@agentclientprotocol/claude-agent-acp` 0.70.0 (pinned);
`codex` 0.151.0, `@agentclientprotocol/codex-acp` 1.7.0 (pinned); `opencode` 1.17.9 (adapter
verified against 1.18.4); `fx` 0.0.7; `cursor-agent` 2026.09.02-c22c1a3;
`@agentclientprotocol/sdk` 1.4.0 schema.

## The table

| Runtime | Does `initialize` carry models? | First method that does | Zero-cost CLI list | Needs sign-in? | Throwaway `session/new` (time, tokens, residue) | A model the runtime refuses on `set_config_option` |
|---|---|---|---|---|---|---|
| **Claude** (bridge 0.70.0) | No. `protocolVersion`, `agentCapabilities`, `authMethods: []`, `agentInfo`, `_meta` (jetbrains/steering/goal) [OBS] | `session/new` → `configOptions` (`mode`, `model` ×5, `effort` ×6, `agent` ×5) [OBS]. No `models` key. | **None.** No `models` subcommand; `--model` takes an alias or a full id [OBS `claude --help`]. The list lives in the SDK's control `initialize` reply (`initializationResult.models`) [SRC] | Yes: the bridge throws `authRequired` when the account is not usable [SRC]; `claude auth status` is a free check [OBS] | 128 ms + 753 ms = **0.9 s** [OBS]. No turn started [SRC]. Nothing under `~/.claude/projects/` for the scratch cwd afterwards [OBS] | Unknown value → JSON-RPC error `Invalid value for config option model: …`, session unchanged; **but aliases are fuzzy-resolved first** (`opus` → `opus[1m]`), so a near-miss becomes a substitution, not a refusal [SRC] |
| **Codex** (bridge 1.7.0) | No. Same five keys; `authMethods: ["api-key"]` under `NO_BROWSER=1` [OBS] | `session/new` → `models` (33 `model[effort]` ids) **and** `configOptions` (`model` ×7, `reasoning_effort` ×6, `fast-mode`, `mode`, `collaboration_mode`) [OBS]. Bridge calls app-server `model/list` inside `session/new` [SRC] | **`codex debug models`** — raw catalog JSON, 9 models (7 `visibility: list`, 2 `hide`) with effort levels, 0.5 s [OBS]. Also **`codex app-server` → `initialize` + `model/list`, no thread: 47 ms + 1 ms** [OBS]. No `codex models` subcommand [OBS] | `codex debug models` refreshed `~/.codex/models_cache.json` from the network (`fetched_at`, `etag`) [OBS]; signed-out behaviour [UNVERIFIED] | 123 ms + 176 ms = **0.3 s** [OBS]. `thread/start`, no turn [SRC]. No rollout file appeared under `~/.codex/sessions/` [OBS] | `RequestError.invalidParams()` (-32602) unless the value equals the current model; session unchanged [SRC] |
| **OpenCode** 1.17.9 | No. `authMethods: ["opencode-login"]` [OBS] | `session/new` → `configOptions` (`model` ×44, `mode` ×2) [OBS] | **`opencode models [provider]`**, `--verbose` for cost/limits JSON, `--refresh` to hit models.dev. **Identical to the ACP list, 44 = 44** [OBS]. ~1 s | The list is the models.dev catalog filtered to providers with credentials or config (`opencode providers list`: OpenAI, GitHub Copilot, Anthropic here) [OBS]; signed-out output [UNVERIFIED] | 735 ms + 931 ms = **1.7 s** [OBS]. No turn. `~/.local/share/opencode/opencode.db` mtime changed — a session row, presumably [OBS, row unverified] | `-32602 "Invalid params: model not found: …"` with `data: {providerId, modelId}`; session keeps its model [PRIOR 03 §2.4] |
| **fx** 0.0.7 | No. `authMethods: []` even with an expired token — initialize **refreshed the Grok token itself** (`~/.fx/grok-auth.json` rewritten) [OBS] | `session/new` → `configOptions` (`provider` ×3, `model` **×2 for the current provider**, `mode` ×2) [OBS]; 234 entries under `gateway` [PRIOR fx-01] | **`fx models [--json]`**: ids + source, **for the current provider only** [OBS] | Yes, per provider: `AuthenticationRejected` with an expired login, 2 models once refreshed [OBS] | 565 ms + 15 ms = **0.6 s** [OBS]. No turn. Residue: the token refresh above; no session file looked for | Provider not logged in → `-32600 "fx needs a Codex subscription login for this model. Run fx login codex."` [PRIOR fx-01 §5b]. An unknown model id [UNVERIFIED] |
| **Cursor** 2026.09.02 | No. `authMethods: ["cursor_login"]`, no `agentInfo` at all [OBS] | `session/new` → `models` (37) and `configOptions` (`model` ×37, `mode` ×3), saying the same thing twice [OBS] | **`cursor-agent models`** / `--list-models`: **219 flattened variants** (`claude-opus-5-thinking-high`), 0.9–1.5 s [OBS] — **a different vocabulary from the 37 parameterised ACP values** (`claude-opus-5[thinking=true,context=300k,effort=high,fast=false]`) | "for this account" [OBS help]; `status --format json` is the free check; signed-out [UNVERIFIED] | 301–326 ms + **2.5–4.3 s** [OBS, two runs]. No turn. Residue: `acp-sessions/<id>/` per run plus a 760 KB `statsig-cache.json` in `CURSOR_CONFIG_DIR`; whether a chat is created server-side [UNVERIFIED] | [UNVERIFIED] — never measured on this runtime |

Timings are single samples on a warm machine (second run of each), `cwd` a plain scratch folder,
`mcpServers: []`, the adapter's own posture env set (`INITIAL_AGENT_MODE=read-only`,
`FX_PERMISSION_MODE=ask`, a scratch `CURSOR_CONFIG_DIR`). The probe script is
`acp-probe.mjs` in the session scratchpad; it is thirty lines of JSON-RPC and is not worth
checking in.

## 1. What ACP itself says

- The `initialize` response is `protocolVersion`, `agentCapabilities`, `authMethods`,
  `agentInfo`, `_meta` — **no model field** (`schema.json` 1.4.0, `InitializeResponse`) [SRC].
- There is **no `models/list` method** in the schema. The agent-side methods are `initialize`,
  `authenticate`, `providers/list|set|disable`, `logout`, `session/new|load|list|delete|fork|
  resume|close|set_mode|set_config_option|prompt`, and the `nes/*` and `mcp/*` extensions [SRC].
- `providers/list` is **unstable** and is about *LLM providers with routing info*
  (`providerId`, `supported`, `required`, `current`), not models [SRC]. Claude's and Codex's
  bridges advertise `providers: {}`; the other three do not. Not probed.
- `session/new` is the first message that carries `configOptions` (`SessionConfigOption`, the
  `select` type with `options[]`), which is the block `adapters/acp/config-options.ts` already
  parses [SRC]. Codex and Cursor also send the older `models: {availableModels, currentModelId}`
  beside it; Claude, OpenCode and fx send only `configOptions` [OBS].

So the protocol's answer to "before a session" is *no*: the list is a property of a session,
and every runtime honours that literally.

## 2. Per runtime

### Claude

- The bridge's `initialize` is local (capabilities, auth method detection) and spawns nothing
  [SRC `acp-agent.js` ~L592]. `session/new` spawns `claude` through the Agent SDK's `query()`,
  awaits `q.initializationResult()` — the SDK's control-channel `initialize`, which returns
  `commands`, `models`, `agents`, `account` — and builds `configOptions` from
  `initializationResult.models` filtered by `settings.availableModels` [SRC ~L4990–5120].
- The model list is the CLI's own five aliases (`default`, `opus[1m]`, `claude-fable-5-1[1m]`,
  `sonnet`, `haiku`) plus `effort` ×6, `fast` when the model supports it [OBS]. **It depends on
  `cwd`**: `SettingsManager(params.cwd)` reads the project's `.claude/settings.json`, whose
  `availableModels` allowlist narrows the picker [SRC]. A list read in a scratch folder is the
  user-scope list, not the project's.
- No CLI subcommand lists models; the SDK exposes `supportedModels()` and a `list_models`
  control request, both of which need the spawned CLI [SRC `sdk.d.ts` L2490, L3751]. The
  bridge's `session/new` *is* the cheapest path to that reply.
- Refusal: `setSessionConfigOption` validates against `option.options`, then the current value,
  then `resolveModelPreference` (alias/fuzzy match), and only then throws. A user-picked value
  that is not in the list is an error and the session keeps its model [SRC ~L3751–3810]. Separately,
  a model the *API* refuses mid-turn becomes an SDK "refusal fallback" dialog, which the bridge
  forwards as an elicitation and cancels by default — *keep the refusal rather than switch
  models without consent* [SRC ~L4340–4370].

### Codex

- The bridge's ACP `initialize` forwards to app-server `initialize` and returns capabilities
  [SRC L27821, L31320]. `session/new` calls `thread/start` and then `fetchAvailableModels()` =
  paginated `model/list` [SRC L28121–28174, L28643].
- `model/list` **does not need a thread**: `codex app-server` + `initialize` + `model/list`
  answered in 48 ms total with 9 models, each with `hidden`, `isDefault`,
  `supportedReasoningEfforts`, `defaultReasoningEffort`, `additionalSpeedTiers` [OBS]. The same
  catalog `codex debug models` prints [OBS], and the `visibility: list` seven are exactly the
  bridge's `model` option [OBS].
- The bridge composes `model[effort]` ids for `models` and splits them into `model` +
  `reasoning_effort` config options, which is the shape the adapter surfaces
  (`SURFACED_OPTIONS = ['model','reasoning_effort','fast-mode','collaboration_mode']`) [SRC].
- Refusal: `applyModelChange` throws `invalidParams` for an unknown id (except re-asserting the
  current one); `applyReasoningEffortChange` the same for an unsupported effort [SRC L32040–32060].

### OpenCode

- `opencode models` and the ACP `model` option are the same 44 ids, `provider/model`. A first
  run of the CLI printed 30 lines and a later run 44 [OBS, unexplained — possibly a stale
  models.dev cache warmed by the ACP session; single observation]. `--verbose` adds cost,
  limits and `status` per model.
- Refusal measured on 2026-08-29: `-32602 model not found` with structured `data` [PRIOR].

### fx

- The list is **per provider** and `provider` is itself a config option (`gateway`, `codex`,
  `grok`); the current provider here is Grok with 2 models, while research 01 saw 234 under
  `gateway` [OBS + PRIOR]. `fx models` answers only for the current provider and fails outright
  on an expired login (`AuthenticationRejected`) [OBS].
- `fx acp` `initialize` refreshed the expired Grok token on its own (`auth_refreshable: true`
  in `fx status --json`, `grok-auth.json` mtime) [OBS]. That is the CLI's own login doing its
  own thing, but it means a "free" probe can touch the network and rewrite `~/.fx/`.

### Cursor

- The CLI's `models` prints 219 ids like `claude-opus-5-thinking-high-fast`; ACP's 37 values are
  parameterised (`claude-opus-5[thinking=true,context=300k,effort=high,fast=false]`) and
  `--model` documents the bracket syntax [OBS]. **A picker fed from the CLI would store ids that
  `set_config_option` has never advertised**, which `applyOptionChoices` would then skip as
  *not offered by this session*.
- `session/new` is the slow one: 2.5–4.3 s, presumably a round trip to Cursor's backend for the
  account's model list [OBS; the round trip is inferred, not traced]. `sessionCapabilities` is
  `{list: {}}` only — no `close`, no `delete` [OBS].

## 3. What a throwaway session costs

- **Tokens: none started by us.** No `session/prompt` was sent; Claude's bridge only spawns the
  CLI and reads its control-channel init [SRC]; Codex's `thread/start` opens a thread and no
  turn [SRC]; OpenCode, fx and Cursor answered `session/new` with nothing in the notification
  stream except fx's `available_commands_update` [OBS]. No usage counter was read — the claim
  is structural. A CLI may still make **network calls that are not inference** (Claude's
  account state, Codex's catalog with an etag, fx's token refresh, Cursor's model list) [OBS/SRC].
- **Time**: 0.3 s (Codex), 0.6 s (fx), 0.9 s (Claude), 1.7 s (OpenCode), 2.8–4.6 s (Cursor).
- **Residue**: Cursor leaves `acp-sessions/<id>/` in whatever `CURSOR_CONFIG_DIR` it was given;
  OpenCode's db mtime moved; Claude and Codex left no session file; fx rewrote its auth file.
  `session/close` is advertised by Claude, Codex, OpenCode and fx; `session/delete` by Claude and
  Codex; Cursor advertises neither [OBS]. The probe killed the process instead of closing.

## 4. Recommendation: the cheapest honest picker with no session

**Open a throwaway ACP session through the adapter's own spawn path, read `configOptions`,
close or kill, and cache the groups per runtime.** Not the CLI subcommands.

Why the ACP session and not the CLIs:

1. It is the **only** list the runtime will later accept on `set_config_option`. Cursor's CLI
   vocabulary is not its ACP vocabulary; Codex's catalog is model slugs while the bridge wants
   `model` and `reasoning_effort` separately; fx's list changes with `provider`; Claude has no
   CLI list at all. Reading the list from the same door it is written through is what makes
   ticket 4's refusal case nearly disappear: a value from this list is valid by construction, and
   a stale one is already handled by `applyOptionChoices` (skipped with a warning line, the
   session keeps its default, the launch never fails).
2. It is already parsed: `optionGroupsFrom(configOptions, SURFACED_OPTIONS)` exists in every
   adapter. The new surface is one method on `AgentRuntime` (say `listOptionGroups(): Promise<
   RuntimeOptionGroup[]>`) that each adapter implements as spawn → `initialize` → `session/new`
   → `session/close` where advertised → kill. Nothing outside the adapter learns how.
3. It is cheap enough for a hire dialog: under a second on three runtimes, under two on
   OpenCode, three to five on Cursor. Show `looking…` in the mono line and let the user proceed
   without choosing — taking the runtime's default stores nothing, which is already the rule.

Constraints to write into the ticket that answers this:

- **`cwd` is blobot's, never the user's folder.** Use a scratch directory under
  `~/.local/share/blobot/` (or the generalist's own anchor once it exists). Claude's allowlist is
  per-cwd, so the list is the user-scope list; say so rather than pretending it is the project's.
  Pass `mcpServers: []` and no persona: nothing here is a turn.
- **Posture env still travels** (`INITIAL_AGENT_MODE`, `FX_PERMISSION_MODE`, a scratch
  `CURSOR_CONFIG_DIR` that is deleted afterwards). No prompt runs, but the spawn helpers require
  it and a throwaway with a weaker posture is a habit not worth forming.
- **Cache per runtime, refresh on demand**, invalidated by the runtime's version string from
  `agentInfo` (Cursor sends none — key on the detected binary version). Refresh on opening the
  hire dialog at most once per app run; never on a timer.
- **Detection gates the probe, not the hire.** A runtime that is `not_installed` or signed out
  gets no probe and an empty picker with ticket 11's remedy beside it; a probe that fails or
  times out (10 s) leaves the picker empty and the runtime's default in force. An empty picker
  is never a refusal to create the Agent.
- **fx needs the `provider` group in the same picker** (already in `SURFACED_OPTIONS`); a model
  chosen under one provider is meaningless under another, and the bridge says so with `-32600`.
- Codex has a cheaper door (`codex app-server` `model/list`, 48 ms, no thread). Not worth a
  second code path today: the bridge's `session/new` is 300 ms and yields blobot's shape
  directly. Note it on the ticket for the day the probe is on a hot path.

What would change this recommendation: an ACP release adding a pre-session model method (none
in 1.4.0), or Cursor's `session/new` growing past a few seconds, at which point the CLI list
could seed the picker *with a translation table into the bracket syntax* — a maintenance
burden the measured 37-vs-219 gap says to avoid for now.

## Sources

- ACP schema: `node_modules/.pnpm/@agentclientprotocol+sdk@1.4.0_zod@4.5.2/node_modules/@agentclientprotocol/sdk/schema/schema.json`
  (`InitializeResponse` ~L2525, `NewSessionResponse` ~L3704, `SessionConfigOption` ~L3812,
  `ProviderInfo` ~L3553, the `x-method` index).
- Claude bridge: `packages/core/node_modules/@agentclientprotocol/claude-agent-acp/dist/acp-agent.js`
  (`initialize` ~L592, `session/new` ~L4700–5200, `setSessionConfigOption` ~L3745, refusal
  dialog ~L4340, `getAvailableModels` L5958, `buildConfigOptions` L5578).
- Claude Agent SDK: `@anthropic-ai/claude-agent-sdk@0.3.232` `sdk.d.ts` (`initializationResult`
  L2461, `supportedModels` L2490, `list_models` L3751, `availableModels` L5363).
- Codex bridge: `packages/core/node_modules/@agentclientprotocol/codex-acp/dist/index.js`
  (`initialize` L27821/L31320, `newSession` L31794, `fetchAvailableModels` L28643,
  `createSessionConfigOptions` L32314, `setSessionConfigOption` L31974, `applyModelChange` ~L32040).
- Adapters: `packages/core/src/adapters/acp/config-options.ts`, `acp/wire.ts`, and each
  adapter's `SURFACED_OPTIONS`; spawn helpers `acp/npm-bridge.ts`, `opencode/stdio.ts`,
  `fx/stdio.ts`, `cursor/stdio.ts`, `claude/stdio-bridge.ts`, `codex/stdio-bridge.ts`.
- Prior research: `.scratch/first-demo/research/03-opencode-acp-surface.md` §2.2, §2.4;
  `.scratch/fx-runtime/research/01-acp-surface.md` §5b and the config-option table;
  `.scratch/cursor-runtime/issues/01-…` via `cursor-agent-runtime.ts` L45–57.
- CLI help and probes run 2026-09-03: `claude --help`, `claude auth status`, `codex --help`,
  `codex debug --help`, `codex debug models`, `codex app-server` (`initialize`, `model/list`),
  `codex login status`, `opencode --help`, `opencode models [--verbose]`, `opencode providers
  list`, `fx --help`, `fx models [--json]`, `fx status --json`, `cursor-agent --help`,
  `cursor-agent models`, `cursor-agent --list-models`, `cursor-agent status --format json`; and
  `initialize` + `session/new` over stdio against all five ACP servers.
