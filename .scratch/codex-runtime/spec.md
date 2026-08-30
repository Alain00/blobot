# Codex as a fourth runtime

Raised by the author, 2026-08-30, straight after the fx investigation. Codex is the last of the
four runtimes `CLAUDE.md` names in its opening sentence and the only one still unbuilt.

Not observed: `codex` is not installed on this machine (`which codex` finds nothing). Everything
here is read out of the published documentation, the adapter's README and the npm registry, and
none of it has been run.

## The finding

**Yes, and it is the closest analogue blobot has.** Codex has no ACP server of its own -- issue
[openai/codex#9085](https://github.com/openai/codex/issues/9085) is still the open request -- but
`@agentclientprotocol/codex-acp` is exactly the same shape of thing as the bridge the Claude
adapter already spawns: a published stdio ACP server that starts Codex's App Server and
translates in both directions. It is the ACP org's own package, Apache-2.0, at 1.7.0.

So the integration is not a new pattern. It is `adapters/claude` with three names changed, plus
one genuinely better mechanism and one genuinely harder problem.

## What lines up

- **The bridge is spawned exactly as Claude's is.** `stdio-bridge.ts` already resolves a pinned
  npm dependency's `dist/index.js`, spawns it under `process.execPath` with
  `ELECTRON_RUN_AS_NODE=1`, one process per agent, and points the bridge at **the user's own
  binary** rather than its bundled copy. Codex's bridge takes `CODEX_PATH` where Claude's takes
  `CLAUDE_CODE_EXECUTABLE`, and it bundles `@openai/codex ^0.148.0` -- a caret range, so setting
  `CODEX_PATH` is not an optimisation, it is the only way to know which Codex is running.
  Ticket 03.
- **The persona has a per-process channel, and it is the good kind.** `CODEX_CONFIG` is "a JSON
  object merged into the Codex session config", and the config reference carries
  `developer_instructions`: "additional developer instructions injected into the session". That
  is OpenCode's `OPENCODE_CONFIG_CONTENT` again -- an environment variable that dies with the
  process, writes nothing into the user's repository, and needs no `AGENTS.md` anywhere. If it
  works. Ticket 01.
- **Permission requests are standard ACP.** `session/request_permission`, with an optional
  `_meta.permission` block that carries display text only and "never changes which actions a
  client may approve". A client that ignores the extension still renders every option correctly.
  Ticket 14's inline **Allow once** / **Reject** block works unchanged, and `allow_always`
  arrives as an option blobot drops, which is already its rule.
- **The loopback MCP server works.** The bridge takes client-provided MCP servers over both
  command-based stdio and HTTP transport, so ticket 15's per-agent bearer token travels.
- **Model, effort and fast mode are advertised**, the same three groups Claude offers, which
  ADR-0002's option machinery already reads. Approval and sandbox mode are advertised too, and
  those are blobot's to subtract. Ticket 02.
- **Detection fits ticket 11.** `codex login status` for the state, `codex login` for the remedy,
  `npm install -g @openai/codex` for the install. Ticket 04.

## What is harder than it looks

**Codex has a sandbox, and the other two do not.** `sandbox_mode` is `read-only`,
`workspace-write` or `danger-full-access`, and it is a real OS-level confinement rather than a
prompt-time allowlist. It is a second axis crossing `approval_policy`, and the bridge collapses
both into three mode ids -- `read-only`, `agent`, `agent-full-access`. blobot's three words of
trust are about **what blobot vouches for**, not about what the OS permits, and the two are not
the same question. Getting this mapping wrong is either an agent that cannot write in its own
worktree or `danger-full-access`, which is ticket 14's refusal wearing a different name. Ticket 02.

**Auth is advertised over the protocol.** The bridge offers ACP auth methods at `initialize`:
ChatGPT login, an API key from `CODEX_API_KEY` or `OPENAI_API_KEY`, and a custom gateway. blobot's
answer to a signed-out runtime is the CLI's own `codex login` in a PTY, and it must stay that
answer: the API-key path would put a provider credential in blobot's process environment, which
the no-credential-storage rule forbids outright. Ticket 04.

## Tickets

- `01` Is the persona an environment variable? (research) **Resolved 2026-08-30: yes, `CODEX_CONFIG.developer_instructions`, and it survives a resume and a compaction.** `research/01-codex-persona.md`.
- `02` Trust, approval and a sandbox that the other runtimes do not have. **Resolved 2026-08-30: one mode, `INITIAL_AGENT_MODE=read-only`, at every trust level; the bridge's default mode writes to `~` without asking.** `research/02-trust-and-the-sandbox.md`.
- `03` A second pinned bridge, and the part of `stdio-bridge.ts` that was never Claude's. **Resolved 2026-08-30**: `adapters/acp/npm-bridge.ts`, and the codex-acp pin is in both manifests.
- `04` Detection, `codex login`, and the auth method blobot must not take. **Resolved 2026-08-30: `codex login status` exits 0 / 1, the probe is in, `supported` is false until 05.**
- `05` The adapter itself. Blocked by all four.

## Out of scope

- **The bridge's subagent sessions and its goal extension.** Both are real and both are somebody
  else's orchestrator. blobot owns agent-to-agent communication; a second one underneath ours is
  not something to reach for. Negotiated capabilities are opt-in, so declining them is the
  default and costs nothing.
- **`.codex/config.toml` in the workspace.** Ticket 14's reason applies unchanged: an
  AgentWorkspace is a checkout of the user's repository and a file left there can be committed
  home. Codex agrees by accident -- `approval_policy` and `sandbox_mode` are among the keys it
  deliberately ignores in project-local config -- so this door is closed at both ends.
