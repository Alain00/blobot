Type: grilling
Status: open
Blocked by: 01

# Can blobot hold an MCP server without holding a credential

## Question

**No credential storage** is a permanent architectural rule: *"We do not build a credentials
database and we do not persist API keys. The underlying CLI owns its own login."*

A great many MCP servers are configured as a command plus an `env` block carrying a token. If
blobot ever grows a *"add an MCP server to this agent"* form, that form is a credentials
database with a different name, and the rule is broken by the feature rather than by an
oversight.

## What to establish

- **Whether blobot needs to offer adding a server at all.** The user's servers are already
  inherited on Claude (`first-demo/07`). If the answer to *"how do I give my agent meta-ads"* is
  *"you already did, in `claude mcp add`"*, then blobot stores nothing, the rule is untouched,
  and this effort collapses to vouching only. **That is the cheap and probably correct answer,
  and this ticket should try hard to take it** before designing a form.
- **What that costs.** It makes MCP a Claude-only capability if ticket 01 confirms fx does not
  inherit -- blobot would be declining to level a field it could level. Name that price rather
  than discovering it.
- **Whether the vouch list is itself sensitive.** A list of `<server>/<tool>` names is not a
  credential. But `mcp__meta-ads__ads_get_ad_accounts` names an account the user works on, and
  it would live in the SQLite file under `userData` beside the transcript, which already holds
  more than that. Probably fine; say so deliberately.
- **The `stdio` variant already in the type.** `McpServerConfig` has `McpStdioServer` *"because
  ACP offers it and someone will want it"* (`claude-agent-runtime.ts:130`). Nothing constructs
  one. If this effort declines to add a server form, that type stays unconstructed and should
  say why in a comment rather than sit there as an invitation.

## The honest failure mode

That "you already configured it in the CLI" is a true answer that reads as a dodge on a screen.
The user hires an agent, picks a model, picks an effort, picks a trust level, and then finds
that the tools it can reach are decided somewhere else entirely, invisibly, by a file blobot
never mentions. Ticket 03's list is the one place that could be made visible without storing
anything -- it names servers the user already has.
