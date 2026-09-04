# MCP permissions

Raised by the author, 2026-08-31: *"getting back on permissions, there is anything a config, an
auto mode, something we can do? cuz it's really annoying, for example i was auditing a meta
campaign, it asked for every mcp call"*.

## The finding

**This is already broken in blobot, on Claude agents, today.** It was raised as a Claude Code
annoyance and it reproduces here in a worse form.

`first-demo/07` decided that a blobot Claude agent **inherits the user's entire Claude Code
configuration**, MCP servers included: the bridge merges `{...userProvidedOptions?.mcpServers,
...mcpServers}` and hardcodes `settingSources: ["user","project","local"]`. That decision is
sound and is not what this effort reopens -- those servers were installed because the user wants
their agents to have them.

`first-demo/14`'s 2026-08-29 amendment then established that under the `default` mode blobot
forces, **Claude prompts for every MCP tool call**, and pre-approved exactly the servers blobot
injected itself: `allowedTools: ['mcp__<server>']` for each entry in `session/new.mcpServers`,
*"the user's own inherited MCP servers are untouched and keep prompting exactly as this ticket
describes."*

Both halves are individually correct. Together they mean: **a Claude agent in blobot has the
user's MCP servers and cannot use any of them without a human answering a prompt per call, at
every trust level, with no way to ever stop being asked.**

Three things make it worse here than in the user's own terminal.

- **There is no "don't ask again".** `first-demo/14` shipped the permission block with *exactly*
  **Allow once** and **Reject**, and `allow_always` has no path to the UI. The terminal's escape
  hatch does not exist.
- **Unattended, it does not degrade -- it fails.** With nobody listening a request is
  **cancelled, never allowed**, and a permission raised by a Routine **expires**. An agent asked
  to audit an ads account on a schedule dies on its first tool call, having done nothing.
- **`careful` and `trusting` are indistinguishable here.** `trust.ts` is Bash prefixes plus four
  editing tools. It has no MCP axis at all, so the control the user was given does not reach the
  surface they are complaining about.

## Why the fix is soundly available here and not for Bash

`codex/permissions.ts` refuses to vouch for a command by prefix, and says why:

> vouching by prefix would be prefix-matching the inside of a shell string. That is precisely why
> `bash` and `sh` are absent from Claude's list: a rule that vouches for a shell vouches for
> everything the shell can reach.

**An MCP call is not a shell string.** It arrives structured -- `rawInput.{server, tool}` -- which
is exactly the fact `#isOwnMailboxCall` already relies on, in three adapters, to answer the
mailbox on blobot's own behalf. Deciding on structure rather than prose is a technique this
codebase has already committed to and tested.

So MCP is the one surface where a **name-based allowlist is honest at blobot's own standard**.
That is the whole opportunity, and it does not generalise to anything else.

## What this effort is not

- **Not a fourth trust level, and not `auto`.** `first-demo/14` is reopened on the ceiling and
  `.scratch/machines/10` is where that gets answered. Nothing here depends on it. Claude's
  `auto` mode stays refused on its own terms: it is availability-gated (*"only when the model
  supports it"*), no other runtime has a classifier, and it hands the decision to an inference
  call blobot does not control on behalf of an unattended agent. Measured on the author's own
  machine 2026-08-31: `defaultMode: "auto"` was already on and **still prompted for every
  meta-ads call**, because auto carries its own allowlist and MCP is not in `$defaults`. Auto is
  not the lever; the allowlist is.
- **Not an approvals administration screen.** `first-demo/14`'s out-of-scope line still holds and
  `sandboxing/spec.md` restates it. A per-tool list the user fills by answering is a different
  thing from a console listing what every agent may currently do, and the second is not in scope.

## The constraints anything here must hold

- **No credential storage.** Permanent rule. This is load-bearing and ticket 02 is about nothing
  else: an MCP server config commonly carries an API key in `env`, and blobot must not become the
  place that lives.
- **The UI is provider-agnostic.** Whatever the renderer names, it must not be able to tell which
  runtime is behind it -- the `careful`/`normal`/`trusting` standard, and `AgentRuntime.accepts`
  as the precedent for a capability blobot words itself.
- **A claim that holds on one runtime and not the other is worse than no claim.**
  `first-demo/14`'s rule. The four runtimes currently disagree about both halves of this: whether
  a user's servers are inherited at all, and whether an MCP call prompts. Ticket 04 owns that.
- **blobot writes nothing into the user's repository.** Already decided `OPENCODE_CONFIG_CONTENT`
  over a file and `allowedTools` over `settings.local.json`. It decides how a vouch list travels
  too.
- **Never from a vendor's advertised surface.** `docs/adr/0003` refused building the palette from
  what a plugin advertises. MCP's `annotations.readOnlyHint` is the same class of input -- the
  server asserting a property about itself -- so the read/write split cannot be inferred from it.

## Frontier

Nothing is claimed. `01` and `04` are research and unblocked; start there.
