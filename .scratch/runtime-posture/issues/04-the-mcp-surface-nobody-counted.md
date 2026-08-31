# Ticket 08: what an agent inherits, measured

Run 2026-08-30 on the author's machine, against the pinned bridge
`@agentclientprotocol/claude-agent-acp@0.70.0`, a real `claude`, and `opencode` 1.18.4. Numbers
first; the decision is not this ticket's and is not made here.

## 1. The population, exactly

From a **blobot-launched** probe agent's own session record — one of the three
`~/.claude/projects/-tmp-blobot-mcpprobe-*` transcripts left by earlier research, whose
`/context` attachment lists the session's tools by name:

| server | tools | where it comes from |
| --- | ---: | --- |
| `meta-ads` | 106 | user settings (`~/.claude.json`) |
| `plugin:linear:linear` | 57 | **a plugin** |
| `claude.ai Figma` | 33 | **a connector** |
| `posthog` | 1 | user settings |
| `blobot` | 1 | injected by blobot, in `session/new.mcpServers` |
| **total** | **198** | |

The probe ran in an empty `/tmp` directory with no `.mcp.json` and no project config of any kind.
**Everything above the last row is inherited**, and this repository's own working directory
inherits the same set: `claude mcp list` here reports exactly those four servers.

**Two observations that sharpen ADR-0003's argument rather than restating it.**

- **Ninety of the 198 come from a plugin and a connector.** `settingSources` — the lever ADR-0003
  settled on, and the lever whose amendment was fought over — **cannot reach either of them**. The
  ADR's separation was correct for *commands*; for *tools* it does not have a handle at all.
- **`posthog` is one tool for an entire product**, and `meta-ads` is a hundred and six. Server
  *design* is what costs context, not server count. Any control that is per server treats those
  two the same, which is a real argument against a per-server picker and for a single switch.

Token size was not re-measured here. The figure this ticket was written with — 197 tools at
**272.8k tokens** — came from a Claude Code session's own `/context` readout and is consistent
with the 198 names above. Against OpenCode's 200k window that is more than the whole of it.

## 2. `strictMcpConfig` works, and it works through blobot's adapter

The ticket's central question, answered against a real agent rather than by reading. Four runs,
each in a fresh empty directory.

**The CLI, directly:**

```
claude -p "how many of your tools start with mcp__ ?"                       → 197
claude --strict-mcp-config -p (same)                                        →   0
```

**Through blobot's own `ClaudeAgentRuntime`**, with blobot's loopback server passed in
`session/new.mcpServers`, `strictMcpConfig` added to `_meta.claudeCode.options` behind a
throwaway env flag since reverted:

```
no flag                       → 198
strictMcpConfig: true         → mcp__blobot__message_agent      (and nothing else)
```

That last line is the whole answer. **The flag is honoured through `_meta`, and blobot's own tool
survives it.** The bridge reading predicted both: at `acp-agent.js:4866` `...userProvidedOptions`
is spread wholesale, `strictMcpConfig` is not among the fields ACP overrides afterwards, and
`mcpServers` is *merged* with blobot's entries landing last:

```js
mcpServers: { ...(userProvidedOptions?.mcpServers || {}), ...mcpServers, ... }
```

**The `model` precedent did not repeat.** `_meta.claudeCode.options.model` was accepted and
ignored, which is why the runtime picker uses `session/set_config_option`. This one is not.

One probe that looks contradictory is recorded so nobody re-runs it: an earlier wording of the
question came back `101` through the adapter. That was the model estimating, not counting; the
exact transcript count for the same configuration is 198, and the `101` should be disregarded.
Where a number here is model-reported it is a count the model gave, and the two that carry the
finding — `0` and the single named tool — are not counts but observations.

## 3. OpenCode inherits too, and `OPENCODE_CONFIG_CONTENT` does not stop it

Measured, and the answer decides whether this is one adapter's problem or two. It is two.

```
opencode debug config                              → mcp: contapp-develop-mongodb, linear, paper, stitch
OPENCODE_CONFIG_CONTENT='{"agent":{...}}' \
opencode debug config                              → mcp: contapp-develop-mongodb, linear, paper, stitch
                                                     agent: blobot-alice
```

**It merges.** blobot's persona agent is added; the user's four MCP servers are untouched. So the
config channel blobot already owns on OpenCode is not, by itself, a way to bound anything — and
OpenCode has the smaller window of the two.

No `strictMcpConfig` equivalent was found for OpenCode. Whether one exists is the open half of
this question, and it is worth knowing before any decision is taken that would leave the two
runtimes under different rules.

## 4. Measuring without bounding: cheap, and incomplete on purpose

**blobot can count declared servers for nothing.** The config paths are known and readable:
`~/.claude.json`'s `mcpServers` plus its per-project entries, the workspace's `.mcp.json`, and
OpenCode's `~/.config/opencode/opencode.json` `mcp` block. That is a number the panel under the
context gauge could carry honestly today.

**It cannot count their tools, and should not try.** ACP advertises *commands*
(`available_commands_update`) and never tools, which is why the palette could be built and this
cannot. Counting tools means connecting to each server and calling `tools/list` — a side effect
blobot has no other reason to cause, against services the user may be paying for. The panel's
existing note is the honest form of this and stays: the gauge above "includes tools and files
blobot did not put there".

**One caution about counting servers.** A server count would have reported **two** for this
machine — the two in user settings — and missed the plugin's 57 tools and the connector's 33. A
number that is wrong by 90 tools in the direction of reassurance is worse than no number. If
anything is drawn, it should be the servers blobot can name *and* say plainly that plugins and
connectors are not among them.

## 5. What the author is being asked, with no preference attached

The decision is ADR-0003's territory and is not this ticket's. The three honest options, with
what each now costs given the numbers above:

1. **A blanket `strictMcpConfig`.** Verified to work and to keep blobot's own tool. It reaches
   the plugin and connector tools that `settingSources` cannot, which is 90 of the 198. It also
   removes capability an agent may have been hired for: a repository whose `.mcp.json` provides
   its database is exactly the case ADR-0003 protected. The first symptom of getting this wrong
   is an agent failing at something it did yesterday, which is why this ticket says not to flip
   it quietly.
2. **A per-agent choice at hire time**, beside the runtime options and `trust`. Fits the shape
   the app already has — `compaction` and `trust` are both blobot's own words on that form — and
   it is per agent, which is right, because an AgentWorkspace is. It is one more decision to put
   in front of somebody hiring their first agent, and the honest label for it is hard to write
   without naming MCP.
3. **A measurement and nothing else.** Cheapest, changes no behaviour, and leaves an agent on a
   200k window carrying more tool schema than window on a bad day.

No option is recommended here. What the numbers say without taking sides: the lever exists and
works, the population is much larger than the servers a person would say they had installed, and
the half of it that `settingSources` cannot reach is the half nobody chose per project.

## Where this belongs

`.scratch/runtime-posture/`, beside the three hazards a menu filter cannot fix. This is a fourth
of the same family and it is filed under `transcript-scale` only because the author reached it
through the context gauge.

## The decision, taken 2026-08-30: a per-agent choice at hire time

**Option 2.** blobot names the decision in its own vocabulary, on the hire and edit dialogs
beside `trust` and `compaction`, and each adapter translates it from its own end. Per agent and
never per team, for the reason everything else on that form is: an AgentWorkspace is per agent,
and so is a session.

**Why not the blanket flag.** It is verified to work and it reaches the 90 tools `settingSources`
cannot, which is the strongest argument available for it. It is still a capability blobot would be
removing on the user's behalf from an agent that may have been hired *for* that capability — a
repository whose `.mcp.json` provides its database is the exact case ADR-0003 protected, and the
first symptom of getting it wrong is an agent failing at something it did yesterday, silently and
somewhere else. This repository's answer to *"blobot decides, or the user decides?"* has been the
user every time it mattered: `trust`, `compaction`, the model, the effort. There is no reason this
one is different, and one strong reason it is not — it costs capability rather than tokens, and
blobot cannot see which agents need it.

**Why not measurement alone.** It was the honest floor and the numbers argue past it. 198 tools
and 272.8k of schema against OpenCode's 200k window is not a thing to draw a number about; and
§4's own caution says the number blobot can honestly draw would have read **two** on this machine
and missed 90 tools. A figure wrong by 90 in the direction of reassurance is worse than no figure.
The measurement is not dropped — it is what the choice is *explained with*, not a substitute for
having one.

## What this now needs, and the one question it does not answer

Building it is ordinary work with one genuinely open half, and the research already flagged it:
**no `strictMcpConfig` equivalent was found for OpenCode**, and `OPENCODE_CONFIG_CONTENT` was
measured merging rather than replacing, so the config channel blobot already owns there does not
bound anything by itself. Codex was never probed at all.

That is the `trust.ts` situation exactly, and it has a precedent to follow rather than a new
problem to solve. Three trust words answer one Codex mode, and `CODEX_EXPRESSES_TRUST` says so in
the code rather than letting three words imply a distinction the runtime cannot make. **The same
shape applies here: blobot's word is blobot's, and an adapter that cannot express it says so** —
what must not happen is a control on the hire dialog that silently does nothing on two runtimes
out of three. Which way each adapter answers is a question for the build, and it should be
answered by probing `opencode` and `codex` the way §2 probed `claude`, not by reading.

**The label is the other real difficulty**, and §5 named it: it is hard to write honestly without
saying MCP. `trust` had the same problem and solved it by naming the *consequence* rather than the
mechanism — *how it answers* — which is the direction to try first.
