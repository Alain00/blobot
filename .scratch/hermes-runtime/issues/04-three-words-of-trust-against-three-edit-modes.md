Type: task
Status: open
Blocked by: 01

# Three words of trust against three edit modes, and an approval path that is not a mode

## Problem

Hermes advertises exactly three ACP modes (`acp_adapter/server.py:680`):

| id | name | description |
| --- | --- | --- |
| default | Default | Ask before edits. |
| accept-edits | Accept Edits | Auto-allow workspace and `/tmp` edits; still asks for sensitive paths. |
| dont-ask | Don't Ask | Auto-allow file edits for this session except sensitive paths. |

Two things about that list matter more than the mapping.

**First, there is no bypass.** The list stops at "except sensitive paths". Nothing here is
`bypassPermissions` and nothing here is Codex's `danger-full-access`, so for once blobot's ceiling
is above the runtime's rather than below it. `trusting` is not straining against anything.

**Second, and this is the trap: these modes are edit-approval only.** The comment says so, and
`_MODE_TO_EDIT_APPROVAL_POLICY` is the whole of what a mode does. Shell command approval is a
different path entirely -- `tools/approval.py`, reached through `make_approval_callback` in
`acp_adapter/permissions.py`, which raises a `session/request_permission` carrying
`{command, description}` and a `kind="execute"` tool call. Setting the mode to `dont-ask` does not
touch it, and there is no mode that does.

So blobot's three words split across two mechanisms here, where on Claude they were one
`allowedTools` list and on OpenCode one config block.

## What to decide

- **The mapping.** `careful` and `normal` to `default` is nearly forced. Whether `trusting` reaches
  `accept-edits` is the real question, and the argument for it is the same one the Claude adapter
  made: an AgentWorkspace is the agent's own worktree and asking permission to write inside it is
  a prompt the user cannot act on usefully. The argument against is that Hermes' notion of
  "workspace" is its own and blobot has not read what `sensitive paths` covers. Read
  `acp_adapter/edit_approval.py` before choosing; it is 338 lines and it is the whole policy.
- **Whether `dont-ask` is ever offered.** Provisionally no. It is a session-wide auto-allow and
  blobot's ceiling has always been the level below the one that stops asking.
- **What happens to shell commands at every level.** They come through as permission requests and
  blobot's inline block already draws them. That is the correct answer and it needs stating rather
  than discovering: on Hermes, `trusting` still asks before every command, because there is no
  lever that says otherwise and blobot is not going to build one.
- **The option set blobot answers with.** Hermes offers up to five (`allow_once`, `allow_session`,
  `allow_always`, `deny`, `deny_always`). blobot draws two. Answer with `allow_once` and `deny`
  and never surface the rest, which is ticket 14 unchanged.
- **A per-agent posture needs a per-agent home** if it is expressed in config rather than by
  `session/set_mode`. Since `set_mode` exists and is per session, prefer it: it is the
  `session/new` parameter shape blobot already treats as *taken at the team's next start*.

## Already ours

`make_approval_callback` denies when the client answers nothing and returns a distinct `timeout`
after 60 seconds rather than an allow. blobot's rule is *with nobody listening a request is
cancelled, never allowed*. Nothing to build; note the agreement so nobody re-litigates it.
