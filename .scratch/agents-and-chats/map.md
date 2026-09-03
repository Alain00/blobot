Label: wayfinder:map

# Agents and chats: the agent stops belonging to a team

## Destination

A **spec for blobot v2**, buildable in later sessions, in which an **Agent** is the thing you
create, define by talking to it, and anchor to a place to work (a repository, a folder, or a
folder blobot makes for it); a **Chat** is where you talk to one Agent or to several; the
interface is far more minimal than today's; and *what an agent can access* has a decided shape.
The spec includes the amendments to the three binding documents (`CONTEXT.md`, `docs/adr/`,
`DESIGN.md`) and names every earlier decision it reopens.

The map plans; it does not build. It is done when nothing is left to *decide* before someone
writes that code. Execution is for later sessions, effort by effort.

Raised by the author, 2026-09-03, by voice: *"un cambio de paradigma en cuanto al modelo que
puede no necesariamente estar anclado a un proyecto. Los teams vendrían siendo más bien group
chats, interfaz mucho más minimalista, cambios importantes en cuanto a qué puede acceder qué
modelo."* The reference is Grok's bots and group chats; screenshots arrive on the design ticket.

## Notes

**Language.** Talk to the author in Spanish. Write the tickets, the glossary and the ADRs in
English, like everything else under `.scratch/` and `docs/`.

**Skills.** `domain-modeling` on every ticket that touches a word; `grilling` for the HITL
tickets; `prototype` for the screens; `research` for the AFK ones. Read `CONTEXT.md` and
`DESIGN.md` before any ticket; both are being amended by this effort and both are binding until
their amendment is written.

**What this reopens.** The following stand until the ticket named here rewrites them, and each
rewrite must say on the old ticket that it did: first-demo tickets **10** (AgentWorkspace grain),
**11** (team creation) and **12** (the UI); **ADR-0001** (agents exist independently of teams:
kept, and extended: now they *work* independently of teams too), **ADR-0002** (editing a
definition: the agent can now edit part of its own), **ADR-0003** (what an agent inherits: the
anchor's scope is the project scope now); `.scratch/handbooks/` (the Handbook's grain moves);
`.scratch/routines/` (the Routine's grain moves); and the permanent rule *"Git-aware: agents are
isolated by AgentWorkspace... never a shared directory"* in `CLAUDE.md`, whose wording assumed a
shared repository. The rest of `CLAUDE.md`'s permanent rules stand untouched: local-first, no
hosted inference, no credential storage, ACP preferred, providers behind `AgentRuntime`, the UI
provider-agnostic, Docker invisible, the orchestrator owns agent-to-agent communication. The
five adapters, the orchestrator, the mailbox, dictation and sound are kept and built on.

**Settled while charting, 2026-09-03.** These were decided in the charting conversation and are
binding the way a resolved ticket is; ticket 01 writes them into the glossary and stress-tests
them against the code. Reopen here, not by drifting.

- An **Agent** is today's AgentProfile with an **anchor**: a name, a face, a runtime, a model and
  effort, a role, standing instructions, a Handbook, and *where it works*. It is the unit a person
  creates. The word on screen and in the glossary is **agent**, never *bot*; the author says
  *bot* and that is fine in their mouth.
- The **anchor** is the Agent's Workspace, moved off the Team: any of today's three kinds
  (`git`, `nested`, `plain`), inspected as today. A **generalist** has an anchor blobot makes,
  a `plain` folder under `~/.local/share/blobot/agents/<agent>/`, persistent, its own, holding
  what the runtime reads as project scope and what the Agent accumulates; deleted with the
  Agent. Not a fourth kind: a different owner of the folder.
- The **purpose** (generalist, a project, code and repositories, research, day-to-day
  operations) is a small closed set, chosen in the chat, and changes exactly two things: the
  anchor and the opening frame of the Persona. It does not change access.
- A **Chat** is where you talk to one Agent or to several. It is one aggregate: the **DM** is the
  Chat blobot makes with each Agent, undeletable while the Agent exists, where the Agent is
  defined and its history with you lives; a **group chat** is a named Chat with a description
  and an editable roster. A Routine may have a Chat of its own (ticket 04). The Chat owns what
  the Team owned: the session, the mailbox, the turn budget, the lead. The Team is gone as a
  word and as a thing.
- One Agent, many Chats: **one AgentWorkspace per Chat** for an anchored Agent, branch
  `blobot/<chat>/<agent>`, because two chats writing one tree are two agents sharing a
  directory. A generalist's folder is one and its own; nothing there to isolate.
- Agents in a Chat **never see each other's anchor**; the compact peer message through the
  orchestrator is the only bridge. The user and every agent can address anyone in the Chat; the
  lead is defined and mediates nothing.
- The **Handbook belongs to the Agent**, not to a Chat: the work is the anchor now, and the
  anchor is the Agent's. Standing instructions and Handbook stay two things with today's
  precedence. The group chat's **description** enters the Persona beside the roster, before the
  Handbook, as the frame the Team used to give.
- An Agent may **rewrite its own identity by talking**: role, standing instructions, purpose,
  anchor if asked. Never runtime, model, trust or compaction. Every write is disclosed inline
  and reversible from the definition.
- **Creation is a chat**: name, runtime and model are the whole form; the DM opens with a
  **card** in which the rest is defined quickly, and then you talk. Trust starts at `normal` and
  the first permission card offers to raise it *from the next session*, said in those words.
  The card is a closed set of blobot's own inline blocks (ticket 06), called **card** so the
  word never collides with an agent-authored artifact.
- **Compaction** stays occupancy-triggered and stays a handoff; the threshold moves from 80% to
  **70%** of the runtime's working ceiling and is exposed in config with a per-agent override.
  The DM compacts on its own; the Handbook is what survives.
- **Clean break** on data: a new schema, no migration of existing teams.

## Decisions so far

<!-- one line per resolved ticket: gist, then the link that holds the reasoning -->

- [What fx loads from a folder, and what it can be denied](issues/12-access-channels-fx.md):
  project scope is the cwd exactly, never an ancestor; a project file can deny nothing but
  `AGENTS.md` wholesale; posture is `FX_PERMISSION_MODE` and the user's own
  `~/.fx/settings.json`, which blobot never writes; no per-agent home (moving `HOME` loses the
  sign-in); `session/new` `mcpServers` honoured, `~/.fx/mcp.json` never inherited over ACP;
  skills are the open door with no deny of any kind. Research at
  `research/access-fx.md`.
- [What OpenCode loads from a folder, and what it can be denied](issues/11-access-channels-opencode.md):
  the richest deny surface of the five. A project file *or* `OPENCODE_CONFIG_CONTENT` (which
  merges, never replaces) can disable a global MCP server, a global agent, any tool by pattern
  and skills by pattern; config is read from the git root down to the cwd, nearest wins.
  Two hazards for 14: a `plain` anchor with no `.git` is **not sealed from above** (the walk
  climbs into ancestors unless `OPENCODE_DISABLE_PROJECT_CONFIG=1`), and a folder rule
  `"blobot_*": "deny"` would silence the mailbox. `XDG_CONFIG_HOME` gives a per-agent config
  dir without losing the sign-in (`auth.json` lives in the data dir). Measured on 1.17.9, the
  only copy here; the adapter pins 1.18.4, so `OPENCODE_CONFIG_DIR` needs re-measuring.
  Research at `research/access-opencode.md`.
- [What Claude Code loads from a folder, and what it can be denied](issues/09-access-channels-claude.md):
  a project file can **deny anything user scope allows and grant nothing** (deny → ask → allow
  across scopes; a project `allow` waits on a trust dialog an SDK session never shows).
  Settings and hooks come from the cwd's `.claude/` only; `CLAUDE.md`, rules, skills and
  `.mcp.json` walk the ancestors, so a generalist folder under `~/.local/share` inherits a
  `~/CLAUDE.md` or `~/.mcp.json` through the *project* walk. Everything a file says has a
  `session/new` twin through `_meta.claudeCode.options` (`mcpServers` + `strictMcpConfig`,
  `disallowedTools`, `settingSources`, `skills`, `agents`, an inline `settings` object), which
  is the committable-file problem's way out. `CLAUDE_CONFIG_DIR` isolates user scope fully but
  **takes the login with it**, so it is not Cursor's per-agent dir. Auto memory is keyed on the
  git repo and shared by every worktree. Research at `research/access-claude.md`.
- [Can each runtime list its models before a session exists?](issues/07-listing-models-before-a-session.md):
  no, and that is ACP's shape: `initialize` carries no model list and `session/new` is the
  first message with `configOptions`, on all five. Four CLIs have a free list subcommand but
  each speaks a different vocabulary, and Cursor's prints 219 flat ids where ACP accepts 37
  bracketed ones, so a CLI-fed picker would store values `set_config_option` refuses.
  Recommendation: a **throwaway ACP session through the adapter's own spawn path** in a scratch
  cwd, `mcpServers: []`, read `configOptions`, kill; one `AgentRuntime` method, cached per
  runtime. No inference by construction; 0.3 s to 4.6 s measured. A stale choice is already
  skipped with a warning, so a refused model never fails a launch. Research at
  `research/listing-models.md`.
- [What Cursor loads from a folder, and what it can be denied](issues/13-access-channels-cursor.md):
  a project file can only **add**: `.cursor/mcp.json` adds servers that wait on an approval an
  ACP session cannot grant, and `.cursor/cli.json` denies only as a silent block **while
  replacing blobot's whole `allow` list**, a committed file widening what runs unasked. The
  right lever for *this agent may not use the operator's server* is not a call-time deny but
  **not loading it**: `mcp-disabled.json` in `projects/<slug>/`, the vendor's own `mcp disable`
  shape, which becomes per-agent once an undocumented `CURSOR_DATA_DIR` is relocated beside
  `CURSOR_CONFIG_DIR`; the login survives both. `~/.cursor/mcp.json` is `homedir()`-hard-coded
  in every loader and always loads. `.cursor/rules` and `AGENTS.md` are read from every
  ancestor to `/`; skills and User Rules have no per-agent switch at all. Measured on
  2026.09.02 (the vendor auto-updated past the adapter's verified 08.25); the `session/new`
  `mcpServers` door is still in the code. Research at `research/access-cursor.md`.
- [What Codex loads from a folder, and what it can be denied](issues/10-access-channels-codex.md):
  one layer stack, and both candidate mechanisms sit on it: the workspace's `.codex/config.toml`
  (project layer) and `CODEX_CONFIG` (runtime layer, above it, already blobot's channel) each
  **deny an operator MCP server by name**, measured with a process-tree check. A project file
  cannot deny a skill; `CODEX_CONFIG` can. The project layer is live only because **the bridge
  injects `trust_level = "trusted"` for the cwd** on every thread, so a repository's committed
  `.codex/config.toml` (hooks, rules, extra servers) configures the agent with no prompt;
  ancestors are not read, trust being an exact-path match. `CODEX_HOME` relocates everything
  **including the login**, so no per-agent home. `session/new` `mcpServers` coexists with file
  servers, with one bridge rule to guard: a client server whose name any config layer already
  uses is **silently dropped**, so an operator server named `blobot` would take the mailbox.
  Research at `research/access-codex.md`.

## Not yet specified

- **Environments per agent.** The author named "definir environments" as part of access and
  deferred what the word means (env vars, a container, the runtime). Graduates after ticket 14.
- **Access beyond the roster.** "A qué agent puede acceder": whether an Agent can address anyone
  outside its Chat. Today the answer is *no* by construction. Graduates after ticket 01 says
  what a Chat's roster is.
- **Grouping agents and chats** in the rail, the way Grok folders them. Waits on the Grok
  reference at ticket 15.
- **Resetting a DM**: whether a person can clear an Agent's DM history without deleting the
  Agent, and what that does to the Handbook (nothing) and the session (a fresh one).
- **Exposing model and effort in the chat**: the author wants them settable "in the UI in a way
  I imagine but do not want to address now". Waits on ticket 15.
- **What each purpose says** in the Persona's opening frame: the five sentences. Waits on 01
  and 05.
- **Whether `trusting` stays the ceiling** is still reopened and open on first-demo ticket 14;
  the trust card (ticket 06) must not answer it by accident.

## Out of scope

- **Migrating existing data.** Clean break decided while charting: one user, and a migration
  would have to invent an anchor for a profile that sat on two teams with two repositories.
- **Agent-authored artifacts** (HTML, previews, documents rendered from what an agent wrote).
  A separate effort with its own sandbox and ADR; this map's cards are blobot's own closed set.
- **Several conversations per Agent** (threads). "Está bien así por ahora": one DM per Agent.
  What matters lands in the Handbook and the rest compacts.
