# ADR-0003 — What an agent inherits, and what blobot offers

- **Status:** accepted, **amended the same day** — see the amendment at the foot, which
  reverses the settings-scope half of the original decision. The palette half stands.
- **Date:** 2026-08-29
- **Decided by:** the author, grilled through `.scratch/command-palette/issues/03-which-commands-may-be-advertised.md`
- **Touches:** `packages/core/src/adapters/claude/claude-agent-runtime.ts` (`SETTING_SCOPES`),
  `packages/core/src/adapters/claude/palette.ts`, ticket 07's "inherit the user's whole setup",
  ticket 14's permission posture, ticket 06's turn budget, ticket 15's loopback server

## Context

Claude Code sessions load settings from three scopes: `user` (the operator's personal skills,
plugins and global commands), `project` (the repository's own CLAUDE.md and `.claude/`) and
`local`. The bridge sets all three before spreading our options (`acp-agent.js:4868`), so until
now a blobot agent was the operator's own Claude with a persona bolted on.

Nobody chose that. It was the default, and it stayed invisible until the command palette went
looking for something to put in a menu.

Measured against a real `claude` in an agent workspace on this machine, 2026-08-29:

| scopes | commands | payload |
| --- | --- | --- |
| `["user","project","local"]` (the default) | 223 | 97 KB |
| `["project","local"]` | 48 | 11.7 KB |

**140 of the 223 came from a single plugin** the author had installed for unrelated reasons. The
size of an agent's inherited surface was therefore a function of what the operator installed
most recently, which is not a property anyone would choose for a teammate. Research had left
"whether `settingSources: []` fully isolates a session" explicitly unverified
(`.scratch/first-demo/research/02-claude-code-acp.md:580`); it does, and no plugin-sourced skill
leaks through.

## Decision (original, superseded in part by the amendment)

**A blobot agent loads `project` and `local`. It does not load `user`.**

The persona is untouched by this and is not part of the trade: it is blobot's own string,
composed by `composePersona` and passed as `_meta.systemPrompt`, and no settings scope can
affect it. This decides what an agent *has available*, never who it *is*.

Verified live rather than assumed: with `["project","local"]` a workspace's CLAUDE.md is read
and the repository's own `.claude/skills` are advertised; with `[]` neither is.

## Why the project scope is the point, not a concession

The argument that removed `user` is the same argument that keeps `project`. A teammate should
work from instructions **somebody wrote for this repository**, because every teammate on the
team reads the same ones and shared instructions are most of what makes them a team. The
operator's personal setup fails that test twice: nobody wrote it for this agent, and it is not
shared with the agent's teammates.

It is also what makes the palette honest. A repository's `.claude/` is relevant by construction;
a vendor's built-in list is relevant by coincidence.

## Consequences

- ~~**A user's own skill does not work inside blobot.**~~ Reversed by the amendment: it works,
  and it is offered.
- **The palette becomes an allowlist.** With `user` gone, all 48 survivors are the provider's
  own built-ins, and hand-filtering those is a denylist against a vendor's release cadence that
  **fails open** — the next Claude release would put a new built-in in front of a user
  unreviewed, the way `/batch` (thirty parallel agents) would have. So the menu offers the
  repository's own commands plus a short list blobot vouches for, and fails closed. See
  `palette.ts`.
- **Sixteen built-ins survive any scope choice**, because they are the provider's own rather
  than the operator's. Several fight things blobot owns: `/batch`, `/loop`, `/goal` against
  ticket 06's turn budget; `/schedule` and `/ultrareview` against the permanent local-first
  rule; `/fewer-permission-prompts` and `/update-config` against ticket 14's posture, durably
  and on disk; `/mcp disable all` against ticket 15's loopback server, which is an agent's only
  route to a teammate. Keeping them off a menu is not enforcement — they still work when typed —
  which is why the ones that matter are being handled where they actually live.
- **Ticket 07's "inherit the user's whole setup" is superseded**, and the note in
  `SHADOWING_TOOLS` that called itself "not a retreat" from it has been corrected.

## Not decided here

Whether blobot should ever offer to load `user` scope for an operator who wants it. Nobody has
asked, the flag is one option away, and adding it before anyone wants it would re-open every
question above for a hypothetical.

## Amendment, 2026-08-29: the operator's own skills come back

Raised by the author on using the palette: *global claude code skills are not present why?*

**The measurement was read wrong.** The original decision rested on "140 of the 223 came from a
single plugin", and then treated the whole `user` scope as if it were that plugin. It is not. Of
the 175 entries that scope contributed, **140 were an installed plugin's and 37 were skills the
author had written**. Those two populations share a settings scope and nothing else. Dropping
the scope to be rid of the first also threw away the second, and `settingSources` is far too
coarse to tell them apart.

The property that justified keeping `project` scope — authored deliberately, for a reason, by a
person — is just as true of `~/.claude/skills` as it is of a repository's `.claude/`. The
original decision asserted otherwise on the strength of a number that belonged to something else.

**Amended decision.** An agent loads **`user`, `project` and `local`** — all three, which is also
the bridge's default, chosen here rather than inherited.

The separation moves to where it can actually be made. `palette.ts` enumerates
`~/.claude/skills` and the workspace's `.claude/` **from disk**, and a plugin installs into
neither, so the menu offers the operator's 37 and the repository's own and never the plugin's
140. Measured live after the change: **40 offered** — 36 personal skills the session advertised,
plus the four vouched built-ins — and **zero namespaced plugin entries**.

**The distinction the original decision missed**, and the one worth carrying forward:

> The settings scope decides what an agent **can do**. The palette decides what blobot
> **offers**. Conflating them is what made a menu problem look like a capability problem.

A plugin's skills now load and work when typed. They are simply never advertised, which is the
correct place for that judgement, and it fails closed on every future plugin the author installs.

**What this costs, and where it is tracked.** `user` scope also restores the operator's global
CLAUDE.md, settings and hooks for every agent. That is a real widening of the surface the
`.scratch/runtime-posture/` effort exists to worry about, and issue 02 there — permission state
rewritten on disk — now has a second route into an agent that did not exist an hour ago.

**A bug this uncovered, worth remembering.** A skill directory is very often a **symlink**: 36 of
the author's 37 are links into a shared `~/.agents/skills`. `readdirSync` reports each as a
symlink and not as a directory, so the first implementation found exactly one skill. Membership
is now decided by `statSync` on the `SKILL.md`, which follows links, and the case is pinned by a
test.


## Second amendment, 2026-09-05: inheritance inside a box

Accepted by Guillermo in [Where a Workspace lives when the Machine is not this one](../../.scratch/machines/issues/05-where-a-workspace-lives.md).
On `local`, the previous amendment stands. Inside a box, `project` and `local` refer to
its mounted AgentWorkspace, and `user` refers to that Agent's private home. The operator's
skills are shared read-only; their global CLAUDE.md, settings, hooks and user MCP server
configuration are not imported. Sharing skills does not require sharing a settings file
whose permissions merge into a session.

The palette reads the same host AgentWorkspace that the guest mounts, including loose
files. Its only operator scope is the explicitly mounted skills directory. It excludes
links that resolve outside the relevant mount and intersects these names with the runtime's
advertisement. Adding a second host skills directory requires a separate decision.
The image supplies each runtime's native skills lookup paths; initialization links those
paths to the mount after the Agent's home is attached, refusing conflicting existing data.

The box worktree also shares its repository's Git metadata, explicitly accepted on
[What a Machine is, and what grain it hangs at](../../.scratch/machines/issues/01-what-a-machine-is.md).
That includes its Git configuration and hooks; it is not an isolated Git database. No host
credential file or signing socket is imported separately. Commits in an AgentWorkspace
use the Agent's author and committer identity, with signing disabled in the launch
configuration. This is a default for ordinary commits, not an enforcement boundary against
an explicit Git command that overrides it. The user's Git configuration is never rewritten.

## Third amendment, 2026-09-06: composition stays with the Agent and adapter

[A per-agent composition root](../../.scratch/machines/issues/24-a-per-agent-composition-root.md)
resolves the question imported from the earlier server fork. The Agent's launch
composition is identity, workspace, instructions, runtime options, posture and
named MCP servers. It does not introduce a second Machine-like object or relocate
local authentication to create a synthetic config root. Local inheritance remains
unchanged; the accepted box home owns that Agent's native user scope and login.

Each adapter applies its own supported configuration mechanism. The pinned CLIs
do not expose a uniform way to separate credentials from all settings and inherited
MCP/skills. A selectable inheritance editor is a separate capability effort,
deferred under the author's completion delegation; no generic loader or additional
profile control is added now. This neither changes the accepted skills mount nor
makes the palette an enforcement boundary.

## Fourth amendment, 2026-09-06: portable personal skills

The separately authorized [skills MVP](../../.scratch/skills/spec.md) adds management of an
AgentProfile's personal skills. `.agents/skills` inside the existing personal volume is the
canonical store. Claude owns its internal `.claude/skills` alias and refuses to replace other
content there; that conflict does not prevent another adapter from using the kit. Claude and
Codex receive the personal root on both new and resumed ACP sessions. OpenCode receives an
additional native skills path in its session configuration. No HOME or authentication root is
rewritten. Existing local inheritance and the sandbox's readonly operator mount remain.

The manager reads complete, bounded packages, preserves license notices and source metadata,
and stages changes outside native discovery. Publication uses a durable journal and recovery
copies. An execution lease starts before Machine startup and ends only after provider process
and Machine shutdown. Local runtimes have their own POSIX process group; closing a bridge also
closes remaining processes in that group and verifies exit. Failed cleanup retains the lease.
Direct user edits retain their native runtime semantics and cannot be deferred by the manager.

The desktop inventory distinguishes personal, project and computer ownership. Native labels
such as Claude's “project” description or Codex's “user” scope do not override filesystem
ownership. Palette entries still require both authored files and runtime advertisement; a
duplicate name across scopes is displayed as a conflict with no claimed universal precedence.
Cursor and fx have no personal native integration in this cut. MCPs, private remote Git auth,
plugin management and project installation remain separate work.
