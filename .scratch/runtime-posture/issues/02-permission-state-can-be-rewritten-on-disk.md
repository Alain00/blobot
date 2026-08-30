Type: task
Status: needs-triage

# Permission state can be rewritten on disk, and it outlives the session

## Problem

Two built-ins observed on a real `claude`, 2026-08-29:

- `/fewer-permission-prompts` — "Scan your transcripts for common read-only Bash and MCP tool
  calls, then add a prioritized allowlist to **project** `.claude/settings.json`."
- `/update-config` — configures the harness via `settings.json`, including **hooks**, which are
  arbitrary command execution on tool events.

Both are off the palette. Both still work when typed.

## Why this is worse than mode drift

Mode drift dies with the session. This does not. An allowlist written to `.claude/settings.json`
lands in an AgentWorkspace, which is a **git worktree of the user's own repository**, on
`blobot/<team>/<agent>`. It survives the turn, the session, the team, and it can be committed
and merged back into the branch the user actually works on.

And ADR-0003 means the file it writes is one blobot now deliberately loads: `project` scope is
in `SETTING_SCOPES`. So an agent can widen its own permissions, permanently, in a file every
future agent on that repository will read.

## What to settle

Whether an AgentWorkspace's `.claude/settings.json` is something blobot should be watching, and
what it does when it changes. Options worth arguing: leave it, on the grounds that an agent
editing files in its own worktree is the entire product; refuse to load `project` scope's
permission keys specifically, if the SDK allows that granularity; or notice the write and
surface it, which is the same shape as issue 01 and probably wants the same answer.

Do not resolve this by disallowing the Write tool on a path. An agent that can run `sh` can
write any file, and a check that can be walked around is worse than none because it reads as
protection.

## Done when

There is a decided answer, written down, for what a blobot agent may do to the permission
settings of the repository it is working in.
