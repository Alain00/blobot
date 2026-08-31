Type: task
Status: resolved
Blocked by: 01

# Trust, `approvalMode`, and a second sandbox

## Problem

Cursor is the second runtime with a real sandbox and the second where blobot's three words have
to be split across more than one axis. Ticket 02 of the Codex effort works the same ground, and
its answer -- *the sandbox is not a trust level, it is a constant* -- is the starting position
here rather than something to rederive.

What Cursor offers:

| Lever | Values |
| --- | --- |
| `approvalMode` | `allowlist`, `auto-review`, `unrestricted` |
| `permissions.allow` / `permissions.deny` | entries like `Shell(ls)`, in `cli-config.json` |
| `sandbox.mode`, `sandbox.networkAccess` | config, or `--sandbox enabled\|disabled` |
| modes | `agent`, `plan`, `ask` |

Three traps:

- **The modes are not trust levels.** `plan` and `ask` are read-only, so an agent in either cannot
  do the work a team member exists to do. `agent` is the only mode a blobot agent runs in, and
  the picker never offers the other two, however tempting the word *ask* looks next to *careful*.
- **`unrestricted`, `--force` and `--yolo` are the same refusal ticket 14 makes every time.** Not
  at `trusting`, not anywhere.
- **`auto-review` is worth reading before assuming it is the middle.** If it means a model reviews
  the call, it has fx's problem: blobot would be delegating the decision it claims to be making,
  and paying for it. Find out what it actually does before mapping anything onto it.

## What to do

Write `adapters/cursor/permissions.ts`, the counterpart to `adapters/claude/permissions.ts`, with
the reason beside the mapping.

Expected shape, to be argued with:

- `approvalMode: allowlist` at every trust level, with `permissions.allow` widening as trust
  widens and `permissions.deny` holding the closed list that asks at every level: `rm`, `sudo`,
  `chmod`, `chown`, `ssh`, `scp`, `docker`, `git push`, `git remote`. Check what Cursor's entry
  syntax can express -- `Shell(ls)` is a name, not obviously a prefix pattern, and if it cannot
  say `git push *` then the deny list has to be built some other way and this ticket says so.
- The sandbox on, scoped to the AgentWorkspace, at every level, as ticket 10's enforcement rather
  than ticket 14's dial. Decide `networkAccess` once, deliberately, and write down why: an agent
  that cannot reach the network cannot install a dependency, and one that can is a different blast
  radius.
- The editor's own `.cursor/rules` and the repository's `AGENTS.md` keep working, because ADR-0003
  says the settings scope decides what an agent can do and the repository's instructions still
  apply. blobot narrows nothing there.

All of it has to travel through the config directory from ticket 01. If that directory turns out
not to be per agent, then trust is per machine on this runtime, which would be a reason not to
ship it rather than a thing to paper over.

## Answer

Decided with the author, 2026-08-31, on ticket 01's measurements. The three attended trust words
each get a **real, distinct** Cursor translation — genuine equivalence with the other runtimes,
not nomenclature parity, which is the author's stated bar. Cursor is the second runtime after
Claude that can express the gradation at all.

- **`approvalMode: allowlist` at every level, ACP mode pinned to `agent`.** `plan` and `ask` are
  read-only and never offered; `unrestricted` / `--force` / `--yolo` are ticket 14's refusal.
  Re-assert the mode after `session/load` (the OpenCode lesson) — `availableModes` was observed
  on `session/new`, so the assertion has something to check against.
- **`permissions.allow` widens as trust widens**, mirroring `adapters/claude/permissions.ts`'s
  verbs in Cursor's own syntax: `Shell(cmd)` / `Shell(cmd:args*)`, `Read(**)` and `Write(**)`
  (workspace-scoped per the docs) from `normal`, network and installers at `trusting`, `git`
  split by verb (`Shell(git:status*)` and the other reading verbs vouched from `normal`; `push`
  and `remote` in no list, so they prompt). The `command:args` matching semantics are documented
  but unmeasured — **live-verify the git split during the build** before believing it, and fall
  back to leaving `git` wholly unlisted (safe: everything prompts) if the syntax cannot express
  the split.
- **`permissions.deny` stays empty at every attended level — the PR is refuted here.** Measured:
  a denied command is a *silent hard block* whose `tool_call` reports `completed`; no
  `session/request_permission` is sent. blobot's dangerous verbs (`rm`, `sudo`, `chmod`, `chown`,
  `ssh`, `scp`, `docker`, `git push`, `git remote`) **ask at every level** — the user may still
  say yes — so on Cursor they are simply *unlisted*, which measured as a prompt ("Shell allowlist
  is empty"), never denied, which would take the decision away from the user. The PR's
  `ALWAYS_DENY` list implements the wrong semantics with the right names.
- **`Mcp(blobot:*)` in `allow` at every level, `careful` included.** Measured: MCP tool calls
  prompt. A peer message must never wait on a human — the Codex lesson, solved in config instead
  of by answering requests. At `careful` it is the *only* allow entry.
- **An `allow-always` answer persists in the session store under `CURSOR_CONFIG_DIR`**, not in
  `cli-config.json` — per agent, readable and deletable as a directory blobot owns, dead with it.
  The inline permission block's *where an always goes* sentence names that, the way it names
  `settings.local.json` on Claude.
- **The sandbox is a constant, not a dial** (the Codex effort's answer, adopted):
  `sandbox.mode: enabled`, `networkAccess` allowed, at every trust level — more containment than
  the vendor's measured default (`disabled`), chosen deliberately: an agent that cannot install
  a dependency is hobbled, and the AgentWorkspace scoping is ticket 10's enforcement, not
  ticket 14's dial. **The build must verify the sandbox does not break the loopback to
  `127.0.0.1`** before this ships; if it does, that is a reopened ticket, never a silent
  `disabled`.
- **`unattended` is not declared by Cursor yet.** `--auto-review` is the same shape as Claude's
  `auto` — a server classifier deciding the unvouched tail — and is the measured-in-shape
  candidate for Cursor's fourth position. It waits on its own measurement effort (does the
  classifier consult `deny`? do the nine verbs hold under it?), the same dedicated measurement
  Claude's `unattended` got the day it shipped. `trustLevelsFor` declares the three attended
  levels; the author wants the full set eventually, on real measurement.

All of it travels in `cli-config.json` inside the per-agent `CURSOR_CONFIG_DIR`, which ticket 01
measured as both relocated and enforced. The editor's own rules and the repository's `AGENTS.md`
keep working untouched (ADR-0003); blobot narrows nothing there.
