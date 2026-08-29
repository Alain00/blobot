Type: research
Status: open

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
