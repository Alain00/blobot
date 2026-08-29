Type: research
Status: resolved

# OpenCode's persona mechanism

## Question

Ticket 06 made persona injection **per-provider and adapter-owned**: each adapter must set an
agent's identity and role by whatever native mechanism its runtime offers, so a system prompt is
a cached, pinned prefix rather than a preamble repeated on every turn.

The Claude bridge's mechanism is known — off-spec `_meta.systemPrompt`, plus
`_meta.claudeCode.options` for arbitrary Agent SDK passthrough, both observed working.

**OpenCode's is unverified.** `_meta` came back empty in every captured OpenCode transcript. The
`available_commands_update` payload hints at an agent-mode concept (`{"value":"build","name":"build",
"description":"The default agent. Executes tools based on configured permissions."}`), which may
or may not be a persona surface.

Establish for `opencode` 1.18.4: whether a per-session system prompt or persona can be set over
ACP at all; whether agent modes are definable per-session or only via config files; whether an
`opencode.json` written into the agent's worktree can carry a custom agent definition with its own
prompt; and whether any of it survives `session/load`.

If no mechanism exists, ticket 06's fallback applies — the adapter prepends a first-prompt
preamble itself — but that is a materially worse position for role adherence and context cost, so
it should be a finding rather than an assumption.

Note this ticket overlaps ticket 14: an `opencode.json` in the worktree is also the mechanism for
setting `permission: ask`. If both land in the same file, the two tickets share one write.

## Answer

**OpenCode has a real native persona mechanism. The fallback preamble from ticket 06 is not
needed.**

### There is no ACP system-prompt field

`session/new`'s `_meta` is parsed by the zod schema and then **never read** — `ACP.newSession`
touches only `cwd` and `mcpServers`. Verified: `_meta.systemPrompt` changed nothing. The Claude
bridge's `_meta.systemPrompt` trick has zero OpenCode equivalent.

### The mechanism is OpenCode's *agent* concept — and ACP "modes" **are** agents

Any agent with `mode: "primary"` and not `hidden` appears in `configOptions[id=="mode"]`, and the
selected mode is passed as the `agent` parameter on every prompt. Defined either in the `agent` map
of `opencode.json`, or as a markdown file at `.opencode/agent/<name>.md`. **Both verified working
over real ACP turns.**

### It is a genuine cached prefix, not a user message

`agent.prompt` becomes element 0 of the system array, *replacing* the provider identity preamble,
and the array is coalesced to two system blocks. Token delta confirms it (+88 tokens = the persona
text). This is exactly what the cached-prefix argument in ticket 06 was asking for.

Observed: `"I am Alice, the frontend engineer."` against a baseline of `"I'm opencode…"`, with a
switch back to `build` mid-session reverting it.

### Use `OPENCODE_CONFIG_CONTENT`, not a file in the workspace

The whole config as inline JSON in an environment variable. **Zero files written into the user's
repo**, wins over every file layer, still merges. Verified end-to-end.

This is strictly better than the worktree-local `opencode.json` the ticket anticipated, and it is
the same instinct as ticket 10's decision to keep AgentWorkspaces outside the user's repo: blobot
does not write into places the user owns.

Config layers deep-merge — global → `$OPENCODE_CONFIG` → project findUp (root-first, nearest wins)
→ `.opencode/` dirs → `$OPENCODE_CONFIG_CONTENT`. The user's global plugins and MCP servers survive
intact. The risk a file-based approach would have carried is **overwriting a repo's own
`opencode.json`**, not merge loss — and the env var avoids it entirely.

### Trap: the restored mode comes from message history, not `default_agent`

Persona survives `session/load` in a fresh process, but the restored mode is the **last used** mode
in the message history. A session that was ever switched off the persona resumes off it.

**The adapter must re-send `session/set_mode` after every load, resume and fork.**

### Corrections handed to ticket 14

The `permission` schema is documented in the findings — keys, pattern-ability, `ask|allow|deny`, an
ordered last-wins rule list, and `opencode debug agent <name>` to print the resolved list. Two
corrections to that ticket's premise:

- **`edit` gates `write` too** — there is no separate `write` key.
- **`external_directory` already defaults to `ask`.** The genuinely uncontrolled default surface is
  bash, and edits *inside* the worktree — not access outside it, as assumed.
- Scalar `"permission": "ask"` is a **trap**: it makes `read` ask too.

Full findings: `../research/16-opencode-persona.md`
