Type: research
Status: open

# Which `HERMES_HOME` does an agent get?

## Problem

This is the linchpin, and it is the same shape as the Cursor effort's ticket 01 with a worse
tail. Hermes has one isolation unit -- `HERMES_HOME` -- and **everything** lives in it at once:

| What blobot needs | Where Hermes keeps it |
| --- | --- |
| The persona | `<home>/config.yaml`, `agent.system_prompt` |
| Provider credentials | `<home>/.env` |
| The agent's memory | `<home>/MEMORY.md`, `<home>/USER.md` |
| Agent-created skills | `<home>/skills/`, with `.usage.json` and a curator that ages them |
| The session database | `<home>/`, which is also where `session/load` finds a session |
| Cron jobs | `<home>/cron/`, with a tick lock at `<home>/cron/.tick.lock` |

`hermes_constants.get_hermes_home()` reads the `HERMES_HOME` process environment variable and
every path in the codebase is expected to route through it (`AGENTS.md`, *Profiles:
Multi-Instance Support*, rule 1). So the variable is real, it is per-process, it dies with the
child, and it writes nothing into the user's repository. That is the shape blobot wants.

The problem is what comes with it. **Credentials live in the profile.** A fresh
`HERMES_HOME` has no `.env`, so `detect_provider()` returns `None`, `initialize` advertises only
the `TerminalAuthMethod`, and the agent cannot answer a single prompt. blobot must not fix that
by copying a key, because it must not hold one.

Neither of the two obvious answers is good:

- **A profile per agent.** Clean isolation of memory, skills, sessions and cron. But hiring an
  agent now means the user configuring a provider for that agent, once per agent per team, and
  the only honest way blobot can help is ticket 11's remedy shape: spawn `hermes --setup` in a
  PTY and watch. That is a hire flow with a terminal in it.
- **One shared `~/.hermes` for every agent.** Nothing to configure, the user's existing login
  just works. But two teammates then share one `MEMORY.md`, one `USER.md`, one skill store and
  one session database. Alice writing a memory changes Bob's system prompt at his next start.
  That is not a runtime quirk, it is two agents with one mind, and blobot's whole model says an
  Agent's state is its own.

## What to do

Hermes is installed. Measure, do not reason.

1. **Does a fresh `HERMES_HOME` inherit anything?** Point it at a scratch directory, run
   `hermes-acp`, and read what `initialize` advertises in `auth_methods`. Confirm `detect_provider()`
   returns nothing and record exactly what the failure looks like on a `session/prompt`.
2. **Does `~/.hermes/.env` get read when `HERMES_HOME` is elsewhere?** `hermes_cli/env_loader.py`
   has a profile-scoped read that is meant to fail closed. If a secondary profile can reach the
   default profile's credentials, note it as a finding about Hermes rather than a door blobot
   uses: borrowing another profile's key is exactly what that module forbids.
3. **What is the smallest profile that works?** If a `.env` with one provider entry plus a
   `config.yaml` is enough, then the per-agent profile is a directory blobot creates under
   `~/.local/share/blobot/` beside the worktrees, and the only thing the user supplies is the
   credential, once, through Hermes' own setup.
4. **Is a shared home actually unsafe, or only untidy?** Check whether two `hermes-acp` processes
   against one home contend: the session DB, the cron tick lock, `.usage.json`, and the curator's
   background pass. If they corrupt each other the shared answer is dead on arrival and the
   decision is made for us.

## What this blocks

02 (the persona is a file in this directory), 04 (so is the posture), 05 (so is the compressor
config), 06 (so is cron and the skill store). 03 and 07 and 08 are independent.
