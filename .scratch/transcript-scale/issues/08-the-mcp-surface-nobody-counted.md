Type: research
Status: answered, awaiting the author's decision

# The MCP surface nobody counted

## The question, asked by the author 2026-08-30

Ticket 07 bounded what blobot injects into a turn and drew it under the gauge: persona,
standing instructions, wake prompt, queue. The author then asked the obvious next question:
**and what about injected MCP?**

## What is true today

**blobot's own server is tiny and now measured.** `MESSAGE_AGENT_TOOL` is one tool, and the
definition on the wire is **956 characters, about 240 tokens**, sent on every turn. It is a row
in the panel.

**What the agent inherits is not measured, and is very much larger.** ADR-0003's amendment set
`SETTING_SCOPES = ['user', 'project', 'local']` (`adapters/claude/claude-agent-runtime.ts:99`),
so an agent loads the operator's own MCP servers, the project's `.mcp.json`, and local settings.
Every one of those servers puts its full tool schemas into the agent's context on **every turn**.

The shape of the hazard is the same one ADR-0003 already fought and it is bigger here. The
command palette was 223 entries and 97 KB, and `palette.ts` was built to fail closed against it.
Tool schemas are the same vector with none of the defence: nothing filters them, nothing counts
them, and there is no equivalent of the palette's allowlist. For scale, the Claude Code session
this ticket was written in reports **197 MCP tools at 272.8k tokens** from three installed
servers. Against OpenCode's 200k window that is not a fraction of the context, it is more than
the whole of it.

**blobot cannot see the list.** ACP advertises *commands* (`available_commands_update`), which
is why the palette could be built at all. It does not advertise the agent's tools. So the
number cannot be shown in the panel the way the persona can, and this is the reason the panel's
note says the gauge above "includes tools and files blobot did not put there" rather than
pretending the breakdown is complete.

## What to answer

1. **Can it be bounded?** The pinned SDK has `strictMcpConfig` (`sdk.d.ts:2038`): *"Only use MCP
   servers passed via the `mcpServers` option ... ignoring all other MCP configurations: project
   `.mcp.json`, user settings, plugins, and on-disk agent frontmatter"*. That is exactly the
   palette's fail-closed shape, applied to tools. Reading the bridge, `_meta.claudeCode.options`
   is spread wholesale into the SDK options (`acp-agent.js:4866`) and `strictMcpConfig` is *not*
   in the list of fields ACP overrides afterwards, while blobot's own server is merged into
   `mcpServers` regardless, so it would survive. **Unverified against a real agent**, and the
   precedent is not encouraging: `_meta.claudeCode.options.model` turned out to be accepted and
   ignored, which is why the runtime picker uses `session/set_config_option` instead.
2. **What does OpenCode do?** Its config already comes from blobot through
   `OPENCODE_CONFIG_CONTENT`. Whether that displaces or merges with the user's own MCP config is
   not known, and the answer decides whether this is one adapter's problem or two.
3. **Should it be bounded at all?** This is ADR-0003 territory and therefore **not this
   ticket's to decide**: the settings scope decides what an agent *can do*, and turning off
   inherited MCP servers takes capability away, not just context. An agent hired to work a repo
   whose `.mcp.json` provides its database may need exactly that server. The honest options are
   a blanket `strictMcpConfig`, a per-agent choice at hire time beside the runtime options, or
   nothing but a measurement. Take it to the author with numbers, not with a preference.
4. **Can it be measured without being bounded?** blobot knows the config paths. Counting
   declared *servers* is cheap and reading `.mcp.json` is honest; counting their *tools* means
   connecting to each one, which is a side effect blobot has no other reason to cause.

## Not to do

Do not quietly flip `strictMcpConfig`. It would silently remove tools an agent was working with,
and the first symptom would be an agent that fails at something it did yesterday.

## Where this belongs

Adjacent to `.scratch/runtime-posture/`, which holds the three hazards a menu filter cannot fix.
This is a fourth of the same family, and it is filed here only because the author reached it
through the context gauge.

## Answer

Researched 2026-08-30. Numbers in `.scratch/transcript-scale/prototype/08-mcp-surface.md`,
measured against a real `claude`, the pinned bridge 0.70.0 and a real `opencode` 1.18.4. **No
preference is attached and nothing was changed**, which is what this ticket asked for.

**1. It can be bounded, and this was verified against a real agent rather than read.** Through
blobot's own `ClaudeAgentRuntime`, with `strictMcpConfig` in `_meta.claudeCode.options` and
blobot's loopback server passed in `session/new.mcpServers`, the agent came up with exactly one
MCP tool: `mcp__blobot__message_agent`. The same runtime without the flag reports 198. The `model`
precedent did not repeat — this one is honoured — and the bridge reading explains why:
`...userProvidedOptions` is spread wholesale at `acp-agent.js:4866`, `strictMcpConfig` is not
among the fields ACP overrides afterwards, and `mcpServers` is merged with blobot's entries
landing last.

**2. OpenCode inherits too, so this is two adapters' problem.** `OPENCODE_CONFIG_CONTENT`
**merges**: blobot's persona agent is added and the user's four MCP servers survive untouched,
measured with `opencode debug config` with and without it. OpenCode has the smaller window of the
two and no `strictMcpConfig` equivalent was found.

**3. The population is larger than anyone would say they had installed, and the shape of it
matters more than the size.** 198 tools in a blobot-launched probe running in an empty `/tmp`
directory: meta-ads 106, a **plugin** 57, a **connector** 33, posthog 1, blobot 1. **Ninety of
those come from a plugin and a connector, which `settingSources` cannot reach at all** — the
lever ADR-0003 settled on is the right one for commands and has no handle on tools. And `posthog`
is one tool for an entire product while `meta-ads` is a hundred and six, which is an argument
against any control that is per server.

**4. It can be measured cheaply and only partly.** The config paths are readable, so counting
declared *servers* costs nothing. Counting their *tools* means connecting to each and calling
`tools/list`, which is a side effect blobot has no other reason to cause. The caution is that a
server count for this machine would have said **two** and missed 90 tools — wrong in the
direction of reassurance, which is worse than silent. The panel's existing note stays.

**What is left is the decision**, and it is ADR-0003's rather than this effort's: a blanket
`strictMcpConfig`, a per-agent choice at hire time beside `trust`, or a measurement and nothing
else. The write-up states what each now costs and recommends none. Moving to
`.scratch/runtime-posture/` is the right home once it is taken.

## Taken, 2026-08-30, and gone

**A per-agent choice at hire time**, beside `trust` and `compaction`. This ticket is closed here
and continues at `.scratch/runtime-posture/issues/04-the-mcp-surface-nobody-counted.md`, which is
the write-up with the decision and its reasons on the end of it. Nothing further is decided in
this effort; the remaining work is a build with one open half, because no equivalent lever is
known on OpenCode and Codex was never probed.
