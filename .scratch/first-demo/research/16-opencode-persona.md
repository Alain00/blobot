# 16 — OpenCode's persona mechanism (and the permission block it shares with ticket 14)

Research findings for `issues/16-opencode-persona-mechanism.md`, with the config-file half of
`issues/14-permission-posture-in-an-agent-worktree.md`.
Date: 2026-08-29. **OpenCode 1.18.4**, `/home/alain/.opencode/bin/opencode`, authenticated —
every prompt below is a real model turn.

Tags:

- **[OBS]** — observed in a captured transcript or command output in `16-transcripts/`.
- **[SRC]** — read out of the JS embedded in the 1.18.4 bun single-file binary (`strings`).
  This is OpenCode's own shipped source, so it is primary, but it is minified and read, not run.
- **[DOC]** — from `--help` output or the published JSON schema at `https://opencode.ai/config.json`.
- **[INF]** — inferred.

Transcripts and drivers live in [`16-transcripts/`](./16-transcripts/). The driver
`acp.mjs` is the `03-transcripts/drive.mjs` stdio client with a scriptable step list
(`STEPS` env var: `new` / `load` / `prompt` / `setmode` / `setopt` / `raw`).

| File | Scenario |
|---|---|
| `t1-plain.jsonl` | baseline: no config, `session/new` + "who are you?" |
| `t2-alice.jsonl` | worktree `opencode.json` defining agent `alice`; persona turn, then `session/set_mode` → `build`, persona turn again |
| `t3-load.jsonl` | `session/load` of the t2 session in a **second process** after it had been switched to `build` |
| `t4-meta.jsonl` | `session/new` with `_meta.systemPrompt` and `_meta.opencode.agent` |
| `t5-bob.jsonl` | persona defined as a **markdown agent file** `.opencode/agent/bob.md` |
| `t6-bobload.jsonl` | `session/load` of the t5 session in a second process |
| `t7-envcfg.jsonl` | persona delivered **only** via `OPENCODE_CONFIG_CONTENT`, no file on disk |
| `t10-perm.jsonl` | `permission: ask` from the worktree config — bash + write both prompt |
| `t11-pure.jsonl` | same as t2 but `opencode acp --pure` |
| `t13-setopt.jsonl` | `session/set_config_option {configId:"mode"}` and an invalid mode |
| `*.out.json` | the driver's structured summary for each run |
| `opencode-config-schema-2026-08-29.json` | the published config JSON schema, fetched today |

---

## Short answer

**Yes. OpenCode has a real, native, cached persona mechanism, and it is exactly the
worktree-local config file blobot wanted.** No fallback preamble is needed.

1. There is **no** per-session system-prompt field over ACP. `_meta` is parsed and then
   thrown away. [OBS]
2. The mechanism is OpenCode's **agent** concept. A custom agent with `mode: "primary"`,
   a `description` and a `prompt` is defined in config, and it surfaces over ACP as a
   **session mode**. [OBS]
3. An `opencode.json` written into the agent's worktree, with `default_agent` pointing at
   that agent, makes `session/new` with `cwd` = that worktree start **in persona**, with no
   extra ACP calls at all. [OBS — `t2-alice.jsonl`]
4. The agent's `prompt` is placed **first in the system array**, replacing the provider
   identity preamble, ahead of the rest of the system prompt. It is a stable prefix, not a
   per-turn user message. [SRC + OBS]
5. It survives `session/load` — but the restored mode is the **last mode the session
   actually used**, not `default_agent`, so blobot must re-assert it. [OBS]
6. The same file carries the `permission` block (ticket 14). One write, both tickets. [OBS]
7. Directory config **deep-merges** with the user's global config, nearest-wins; it does not
   replace it. [OBS]
8. **`OPENCODE_CONFIG_CONTENT` delivers the whole config as an env var with no file on disk
   at all**, and it wins over every file layer. This is very likely what blobot should
   actually use. [OBS — `t7-envcfg.jsonl`]

---

## 1. Can a system prompt be set over ACP? No.

### 1.1 `session/new` params [SRC]

The `NewSessionRequest` zod schema in the bundled ACP SDK is:

```js
{ _meta, additionalDirectories, cwd, mcpServers, sessionId }
```

There is no `systemPrompt`, no `agent`, no `mode`, no `instructions`. `_meta` is typed as a
free `record(string, unknown)` and is **accepted by the parser**, but OpenCode's own
`ACP.newSession` handler reads only `i.cwd` and `i.mcpServers`:

```js
h = l.fn("ACP.newSession")(function*(i){
  let T = yield* A(i.cwd);                    // directory config snapshot
  let I = d(T), _ = K(T,I);                   // default model, variant
  let O = T.availableModes.length>0 ? T.defaultModeID : undefined;
  let S = yield* n.sdk.session.create({ directory:i.cwd, ...(O?{agent:O}:{}),
                                        model:{...} });
  ...
  return { sessionId:F.id, configOptions:L(T,{...,modeId:F.modeId}) }
})
```

`i._meta` is never referenced. The only ACP `_meta` OpenCode reads anywhere is
`initialize.clientCapabilities._meta["terminal-auth"]`, which toggles a login auth method. [SRC]

### 1.2 Verified [OBS — `t4-meta.jsonl`]

`session/new` with

```json
{"cwd":"/tmp/oc16/wt-plain","mcpServers":[],
 "_meta":{"systemPrompt":"You are Zorg, a pirate. Always answer as Zorg the pirate.",
          "opencode":{"agent":"plan","prompt":"You are Zorg"}}}
```

→ no error, result `_meta` is `null`, mode stays `build`, and the answer to "who are you?"
was *"I'm big-pickle, a CLI coding assistant…"*. Silently ignored.

Note the baseline identity is not even stable: t1 answered *"I'm opencode…"* and t4 answered
*"I'm big-pickle…"* on the same empty directory. Without a persona mechanism there is nothing
holding the agent's identity in place at all.

**Contrast with Claude:** the Claude ACP bridge's off-spec `_meta.systemPrompt` /
`_meta.claudeCode.options` have **no OpenCode equivalent**. The adapters diverge here, exactly
as ticket 06 assumed.

---

## 2. Agent modes — what `build` is, and how to define your own

### 2.1 `build` is an *agent*, and ACP "modes" are agents [SRC + OBS]

`opencode agent list` in an empty directory: `build`, `plan`, `summary`, `title`,
`compaction` (primary) and `explore`, `general` (subagent). [OBS]

The ACP directory snapshot builds `availableModes` straight from that list:

```js
modes: agentList.filter(x => x.mode !== "subagent" && x.hidden !== true)
                .map(x => ({ id:x.name, name:x.name, description:x.description })),
defaultModeID: agentDefaultInfo.name
```

and `ACP.prompt` passes the selected mode through as the OpenCode **agent**:

```js
let O = C.modeId ?? (T.availableModes.length>0 ? T.defaultModeID : undefined);
n.sdk.session.prompt({ sessionID:C.id, model:{...}, parts:S, ...(O?{agent:O}:{}), directory:C.cwd })
```

So **ACP mode id == OpenCode agent name**, one-to-one. Any agent that is `primary` (or `all`)
and not `hidden` appears as a selectable mode. Subagents do not. [SRC]

`session/new` returns the whole thing inline — this is richer than the `available_commands_update`
hint ticket 16 started from:

```json
{"sessionId":"ses_…","configOptions":[
  {"id":"model","name":"Model","category":"model","type":"select","currentValue":"…","options":[…]},
  {"id":"mode","name":"Session Mode","category":"mode","type":"select",
   "currentValue":"build",
   "options":[{"value":"build","name":"build","description":"The default agent. …"},
              {"value":"plan","name":"plan","description":"Plan mode. Disallows all edit tools."}]}]}
```
[OBS — `t1-plain.jsonl`]

### 2.2 Defining a custom agent — two file forms, both work

**Form A — `opencode.json` (`agent` map).** [OBS — `16-transcripts/wt-alice-opencode.json`]

```json
{
  "$schema": "https://opencode.ai/config.json",
  "default_agent": "alice",
  "agent": {
    "alice": {
      "description": "Alice, the frontend specialist for this worktree.",
      "mode": "primary",
      "prompt": "You are Alice. Your role is FRONTEND ENGINEER on the blobot team. …",
      "permission": { "bash": "ask", "edit": "ask", "webfetch": "ask" }
    }
  },
  "permission": { "bash": "ask", "edit": "ask" }
}
```

**Form B — a markdown agent file** at `{agent,agents}/**/*.md` under any config directory —
in practice `.opencode/agent/<name>.md` in the worktree, or
`~/.config/opencode/agent/<name>.md` globally. YAML frontmatter + body-as-prompt.
[SRC glob `"{agent,agents}/**/*.md"`; OBS — `16-transcripts/wt-bob-agent-bob.md`]

```markdown
---
description: Bob, the backend specialist for this worktree.
mode: primary
permission:
  bash: ask
  edit: ask
---
You are Bob. Your role is BACKEND ENGINEER on the blobot team. …
```

There is also a legacy `{mode,modes}/*.md` glob (primary-by-default) and a deprecated
top-level `mode` map in `opencode.json`; both are folded into `agent`. Don't use them. [SRC/DOC]

`opencode agent create --path <dir> --description … --mode primary --permissions bash,read,edit`
scaffolds Form B, but writing the file directly is simpler for blobot. [DOC]

`AgentConfig` full key set, from the published schema: `model`, `variant`, `temperature`,
`top_p`, **`prompt`**, `tools` (deprecated → use `permission`), `disable`, **`description`**,
**`mode`** (`subagent|primary|all`), `hidden`, `options`, `color`, `steps`
(`maxSteps` deprecated), **`permission`**. [DOC]

### 2.3 Verifying the prompt is a *cached prefix*, not a preamble [SRC + OBS]

`LLMRequestPrep.prepare`:

```js
let l = [[ ...(e.agent.prompt ? [e.agent.prompt] : go.provider(e.model)),
           ...e.system,
           ...(e.user.system ? [e.user.system] : []) ].filter(Boolean).join("\n")];
let a = l[0];
… if (l.length > 2 && l[0] === a) { let W = l.slice(1); l.length = 0; l.push(a, W.join("\n")); }
```

- The agent `prompt` is **element 0 of the system array**, standing in place of the provider
  identity preamble (`go.provider(model)`), ahead of everything else.
- The array is then coalesced to at most **two system blocks** — the persona block and
  everything-else — which is the shape providers cache on. **This is the pinned, cached
  system-prefix behaviour ticket 06 wanted.** It is never a user message.
- The rest of the coding system prompt (`e.system`) is retained, so the persona agent is still
  a fully capable coding agent. Token accounting agrees: baseline first turn `inputTokens`
  47 434 vs alice's 47 522 — a delta of ~88 tokens, i.e. the persona text, not a wholesale
  prompt swap. [OBS]

### 2.4 Selecting a mode per session over ACP — yes, two ways [OBS — `t13-setopt.jsonl`]

| Call | Params | Result |
|---|---|---|
| `session/set_mode` | `{sessionId, modeId}` | `{}` on success |
| `session/set_config_option` | `{sessionId, configId:"mode", value}` | returns the refreshed `configOptions` |

Both validate against `availableModes`. An unknown id gives
`-32602 "Invalid params: mode not found: nosuchagent"` with `data:{mode:"nosuchagent"}`. [OBS]

`session/set_mode` is **not advertised** in `initialize`'s `agentCapabilities` (which only lists
`loadSession`, `mcpCapabilities`, `promptCapabilities`, `sessionCapabilities:{close,fork,list,resume}`),
so blobot must know it is there rather than feature-detect it. It is unconditionally wired in the
method dispatcher. [SRC + OBS]

Round-trip proof of behaviour change, one session, `t2-alice.jsonl`:

| turn | mode | answer to *"Who are you and what is your role?"* |
|---|---|---|
| 1 | `alice` (from `default_agent`) | **"I am Alice, the frontend engineer."** |
| 2 | `build` (after `session/set_mode`) | "I'm opencode, an AI assistant for software engineering tasks…" |

and `t13`: `set_config_option{mode:"alice"}` on a session → "I am Alice, the frontend engineer."

**There is no way to pass the mode at `session/new`.** `session/new` always uses
`defaultModeID`. So blobot either sets `default_agent` in the config (preferred — zero extra
round-trips, persona is live on turn 1) or fires `session/set_mode` immediately after
`session/new` (works, but the session's first backing turn was created under the default agent).

---

## 3. The config file in the working directory — the mechanism blobot would use

### 3.1 Discovery order [SRC + OBS]

`Config.loadInstanceState` applies these layers in order, **deep-merging** each onto the
accumulated result, so **later layers win key-by-key**:

1. `~/.config/opencode/{config.json,opencode.json,opencode.jsonc}` — global. (`$XDG_CONFIG_HOME` honoured; `opencode debug paths` prints the resolved dir.)
2. Remote `/.well-known/opencode` configs, if any auth wellknown entries exist.
3. `$OPENCODE_CONFIG` — a single explicit config **file path**.
4. **Project files: `findUp(["opencode.json","opencode.jsonc"], cwd, worktreeRoot, {rootFirst:true})`** — every one from the git worktree root down to `cwd`, root first, so the **nearest file wins**. Skipped entirely if `OPENCODE_DISABLE_PROJECT_CONFIG` is set.
5. For each `.opencode` directory on that same walk: `.opencode/opencode.json{,c}`, then its `command/`, `{agent,agents}/**/*.md`, `{mode,modes}/*.md`, and plugins.
6. **`$OPENCODE_CONFIG_CONTENT`** — the config as inline JSON in an env var.
7. Managed / enterprise config dir and managed preferences (org-controlled; last).

Observed precedence, all in `debug config`:

| setup | resulting `default_agent` | resulting `agent` keys |
|---|---|---|
| worktree `opencode.json` only | `alice` | `["alice"]` |
| `.opencode/opencode.json` + `.opencode/agent/bob.md` | `bob` | `["bob"]` |
| `$OPENCODE_CONFIG=cc.json` (carol) in the alice worktree | **`alice`** | `["carol","alice"]` — the project file wins |
| `$OPENCODE_CONFIG_CONTENT=…carol…` in the alice worktree | **`carol`** | `["alice","carol"]` — the env content wins |
| root `opencode.json` + `sub/opencode.json`, cwd = `sub` | `sub_agent` | `["root_agent","sub_agent"]`; `permission` merged to `{"bash":"ask"(sub),"edit":"allow"(root)}` |
| `OPENCODE_DISABLE_PROJECT_CONFIG=1` in the alice worktree | `null` | `[]` |

[OBS]

### 3.2 Does `cwd` at `session/new` drive it? Yes. [OBS]

`ACP.newSession` resolves the directory snapshot from `i.cwd` before creating the backing
session, and that snapshot is where `availableModes` / `defaultModeID` come from. Two ACP
sessions in one `opencode acp` process, pointed at two different worktrees, get two different
agent rosters. `t2` (`cwd=/tmp/oc16/wt-alice`) saw `["alice","build","plan"]` and `t5`
(`cwd=/tmp/oc16/wt-bob`) saw `["bob","build","plan"]`, and each answered in its own persona,
with no ACP call beyond `session/new` + `session/prompt`.

**Two caches to know about** [SRC]:

- `ACPDirectory` memoises the snapshot **per directory path** for the life of the process.
- The ACP layer additionally pins the snapshot **per session id** (`P.set(F.id, T)`).

So **editing the config after a session exists has no effect on that session**, and editing it
after any session in that directory has no effect in that process. Blobot must write the
config (or set the env var) **before** spawning/using the process for that worktree. There is
an `ACPDirectory.refresh` internally but it is not reachable over ACP. Process-per-worktree
sidesteps this entirely.

`--pure` does not interfere: `t11-pure.jsonl` under `opencode acp --pure` still resolved
`alice` and answered in persona. Use it, as ticket 03 recommended. [OBS]

---

## 4. Does it survive `session/load`? Yes — but read the caveat

`ACP.loadSession` refetches the directory snapshot from `cwd` and recovers the mode from the
**message history**:

```js
modeId: I.modeId ?? (C.availableModes.length>0 ? C.defaultModeID : undefined)
```

where `I` is derived from the loaded messages (the latest assistant message's mode).
`resumeSession` and `forkSession` do the same. [SRC]

Observed, both in a **fresh second process**:

- `t6-bobload.jsonl` — the bob session had only ever run as `bob`; after `session/load` the
  mode came back `bob` and the answer was again *"I am Bob, the backend engineer."* ✅
- `t3-load.jsonl` — the alice session had been switched to `build` in t2 before the process
  died; after `session/load` the mode came back **`build`**, and the answer was generic. The
  persona was *not* re-applied from `default_agent`.

**Caveat for blobot:** `session/load` restores the *last used* mode, not the configured
default. If anything ever moved the session off the persona agent (a mode switch, or a first
session created before the config existed), resumption inherits that. The adapter should
**always send `session/set_mode {modeId: <personaAgent>}` right after `session/load`** and
treat that as part of resume. It is one cheap call and it makes resumption deterministic.

---

## 5. Ticket 14 — the `permission` block

### 5.1 Full schema [DOC — `16-transcripts/opencode-config-schema-2026-08-29.json`]

`permission` appears in two places, with the same shape: top-level in `Config`, and inside any
`AgentConfig`. Agent-level rules are appended after the global ones.

```
PermissionConfig  = PermissionActionConfig            // scalar shorthand, applies to everything
                  | { <key>: PermissionRuleConfig }
PermissionRuleConfig   = PermissionActionConfig | { <pattern>: PermissionActionConfig }
PermissionActionConfig = "ask" | "allow" | "deny"
```

Named keys, and whether each takes patterns:

| key | pattern-able | covers |
|---|---|---|
| `read` | ✅ | the `read` tool |
| `edit` | ✅ | **`edit` *and* `write`** — file mutation (verified: a `write` prompted under `edit:"ask"`) |
| `glob` | ✅ | `glob` |
| `grep` | ✅ | `grep` |
| `list` | ✅ | directory listing |
| `bash` | ✅ (pattern matched against the command) | shell |
| `task` | ✅ | spawning subagents |
| `external_directory` | ✅ (pattern is a path) | touching paths outside the session directory |
| `lsp` | ✅ | LSP operations |
| `skill` | ✅ | skill invocation |
| `todowrite` | ❌ action only | todo list |
| `question` | ❌ | the `question` tool |
| `webfetch` | ❌ | HTTP fetch |
| `websearch` | ❌ | web search |
| `doom_loop` | ❌ | repetition guard |

`additionalProperties` is open, so unknown keys are accepted and become rules for a permission
of that name (e.g. MCP tool names). Ticket 03 already observed **MCP tools are not
permission-gated** by the `bash`/`edit` keys. [DOC + prior OBS]

Resolution is a **flat ordered rule list** of `{permission, pattern, action}`, and
`opencode debug agent <name>` prints the fully resolved list — a very useful blobot
verification step. **Later rules win**, which is why appending `{bash:"ask"}` overrides the
built-in `{permission:"*", action:"allow", pattern:"*"}`. [OBS]

### 5.2 The real 1.18.4 defaults — an update to ticket 14 [OBS]

`opencode --pure debug agent build` in an empty directory:

```json
[{"permission":"*",                  "action":"allow","pattern":"*"},
 {"permission":"doom_loop",          "action":"ask",  "pattern":"*"},
 {"permission":"external_directory", "action":"ask",  "pattern":"*"},
 {"permission":"external_directory", "action":"allow","pattern":"~/.local/share/opencode/tool-output/*"},
 {"permission":"external_directory", "action":"allow","pattern":"/tmp/opencode/*"},
 …plus one allow per installed skill directory…]
```

So ticket 14's headline — *"default permissions auto-allow everything, including bash and
write"* — is **correct for anything inside the session directory**, and blobot must still
write `ask` rules. But it is worth recording the nuance: **`external_directory` already
defaults to `ask`**, so an out-of-worktree write is prompted out of the box even with no
config. The uncontrolled surface on night one is *bash and writes inside the worktree*, which
is precisely the blast radius blobot is choosing to accept.

Also note the third default: `plan`'s agent adds `question: deny`, `plan_enter: deny`,
`plan_exit: deny`-style rules; a custom agent inherits the `*: allow` base unless overridden.

### 5.3 Verified over ACP [OBS — `t10-perm.jsonl`]

With the worktree `opencode.json` above (`{"bash":"ask","edit":"ask"}` both globally and on
`alice`), a turn asking the agent to run `echo` and write a file produced **two**
`session/request_permission` requests:

```json
{"toolCall":{"title":"echo BLOBOT_PERM_TEST","kind":"execute","rawInput":{"command":"echo BLOBOT_PERM_TEST"}},
 "options":[{"optionId":"once","kind":"allow_once","name":"Allow once"},
            {"optionId":"always","kind":"allow_always","name":"Always allow"},
            {"optionId":"reject","kind":"reject_once","name":"Reject"}]}
```

```json
{"toolCall":{"title":"/tmp/oc16/wt-alice/perm.txt","kind":"edit",
             "locations":[{"path":"/tmp/oc16/wt-alice/perm.txt"}],
             "content":[{"type":"diff","path":"…","oldText":"","newText":"ok"}]},
 "options":[…same three…]}
```

Note `allow_always` — selecting it persists for the session, so blobot's approval UI (when it
exists) should be careful about surfacing it.

**Persona and permissions live in the same file, and can live on the same agent.** One write
satisfies both tickets.

---

## 6. Does it merge or clobber the user's config? It merges — and there is a zero-footprint option

### 6.1 Merge, always [OBS]

`debug config` in the alice worktree, with the user's own global
`~/.config/opencode/opencode.json` present:

```
default_agent: alice                                   ← from the worktree file
agent keys:    ['alice']                               ← from the worktree file
permission:    {"bash":"ask","edit":"ask"}             ← from the worktree file
plugin:        ['op-anthropic-auth']                   ← SURVIVED from the user's global
mcp keys:      ['linear','stitch','paper','contapp-…'] ← SURVIVED from the user's global
```

Deep merge, per key. Nested `opencode.json` files merged too: root `{"bash":"allow","edit":"allow"}`
+ sub `{"bash":"ask"}` resolved to `{"bash":"ask","edit":"allow"}` when cwd was `sub`.

So blobot **cannot silently break** a user's global config by adding a worktree file. What it
*can* do is:

- **overwrite an `opencode.json` the workspace already owns**, if blobot writes to the same
  path. A git worktree of a repo that already has a committed `opencode.json` at its root has
  exactly that file already there — this is the real hazard, and it is a *file-write* hazard,
  not a merge hazard.
- override a user key the user cared about (`default_agent`, `permission`, a same-named agent),
  since nearest-wins.

### 6.2 The zero-footprint option: `OPENCODE_CONFIG_CONTENT` [OBS — `t7-envcfg.jsonl`]

The whole config can be handed to the process as inline JSON in an environment variable. No
file is written anywhere:

```bash
OPENCODE_CONFIG_CONTENT='{"default_agent":"carol","agent":{"carol":{
  "description":"Carol, the QA specialist.","mode":"primary",
  "prompt":"You are Carol. …","permission":{"bash":"ask","edit":"ask"}}}}' \
opencode acp
```

In a directory with **no config file at all**, `session/new` returned
`mode.currentValue = "carol"`, options `["carol","build","plan"]`, and the answer was
**"I am Carol, the QA engineer."**

And it composes correctly: set in the alice worktree it merged *with* the file
(`agents: ["alice","carol"]`) and won on `default_agent` (`carol`), while the user's global
plugins and MCP servers still survived.

**Recommendation.** Blobot should deliver the persona and the `permission` block through
`OPENCODE_CONFIG_CONTENT` on the spawned `opencode acp` process, not by writing a file into
the worktree:

- nothing is written into the user's repository — no clobber, no `.gitignore` question, no
  dirty worktree, no "why is there an opencode.json in my diff";
- it is the **last** file/env layer, so it reliably wins over whatever the repo already has;
- it still merges, so a repo's own `opencode.json` (custom providers, MCP, formatters) keeps
  working;
- it is per-process, which matches process-per-agent and sidesteps the directory snapshot cache.

The tradeoff: it applies to the whole process, so it is only clean under
**one `opencode acp` process per blobot agent**. If blobot ever multiplexes several personas
through one OpenCode process it must fall back to per-worktree files (and then it must handle
the pre-existing-file case: read, merge, and either restore on teardown or write to
`.opencode/opencode.json`, which is the less-contested path of the two).

Do **not** reach for `OPENCODE_DISABLE_PROJECT_CONFIG=1` as a "clean slate": it also discards
the user's repo config, which is usually load-bearing.

---

## 7. What blobot's OpenCode adapter should do

1. Spawn one `opencode acp --pure` process per agent, with
   `OPENCODE_CONFIG_CONTENT` set to a config carrying **one** primary agent named after the
   blobot agent, plus `default_agent`, plus the permission posture:

   ```json
   {
     "default_agent": "alice",
     "agent": {
       "alice": {
         "description": "Alice — frontend engineer on the <team> team.",
         "mode": "primary",
         "prompt": "<the persona system prompt>",
         "permission": { "bash": "ask", "edit": "ask", "webfetch": "ask" }
       }
     }
   }
   ```

   Agent names must be config-key-safe; lowercase the display name and keep the human name in
   `description` and in the prompt.
2. `session/new` with `cwd` = the worktree. Read back `configOptions[id=="mode"].currentValue`
   and **assert it equals the persona agent** — that is a cheap, exact health check that the
   persona is live, and it costs no model turn.
3. On `session/load` / `session/resume` / `session/fork`, send
   `session/set_mode {sessionId, modeId: "<persona>"}` unconditionally, because the restored
   mode comes from message history, not from `default_agent`.
4. Never write into the worktree for this. If a future need forces a file, prefer
   `.opencode/opencode.json` over a root `opencode.json`, and read-merge-restore rather than
   overwrite.
5. Keep the ticket-06 preamble fallback for runtimes that need it. **OpenCode does not.**

## 8. Gotchas

1. **`_meta` is a dead letter on OpenCode.** Parsed, never read, no error. Don't build on it,
   and don't feature-detect by "it didn't throw". [OBS]
2. **You cannot pick the agent at `session/new`.** Only `default_agent` in config, or a
   follow-up `session/set_mode`. [SRC + OBS]
3. **`session/set_mode` is not advertised in `agentCapabilities`.** It works anyway. [OBS]
4. **`session/load` restores the last-used mode, not the default.** Re-assert. [OBS]
5. **Directory config is snapshot-cached per directory *and* per session for the process
   lifetime.** Config must be in place before the process starts using that cwd. [SRC]
6. **Nearest config wins, but everything merges.** A repo's own `opencode.json` is never
   discarded; blobot's risk is file overwrite, not merge loss. [OBS]
7. **`edit` gates `write` too.** There is no separate `write` permission key. [OBS]
8. **`"permission": "ask"` as a scalar means literally everything asks, including `read`** —
   it appends `{permission:"*", action:"ask", pattern:"*"}` last, which beats the built-in
   read allowances. Use the object form. [OBS]
9. **`external_directory` already defaults to `ask`.** The uncontrolled default surface is
   bash and edits *inside* the worktree. [OBS]
10. **Agent names surface verbatim in the mode picker.** `id`, `name` and the human-readable
    label are all the config key; only `description` is free text. [OBS]
