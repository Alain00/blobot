Type: grilling
Status: resolved

# May blobot write to `~/.fx/settings.json`?

## Problem

fx permission rules live in exactly one file, `~/.fx/settings.json`, either globally or under a
workspace profile keyed by the workspace path. Project `.fx.json` files "cannot define them". So
the only way blobot can settle ordinary work for an fx agent -- an edit inside that agent's own
worktree, a `pnpm test` -- is to write a workspace-profile entry into a file that belongs to the
user and that their own interactive fx reads.

This is a new kind of act. Ticket 14 already refused writing a settings file **into the
AgentWorkspace**, and its reason was specific: an AgentWorkspace is a checkout of the user's
repository and a file left there can be committed home. `~/.fx/settings.json` does not have that
problem. It has a different one: it is the user's own configuration for a tool they use outside
blobot, and blobot would be editing it behind their back.

## The case for

- The entry is keyed by the agent's worktree path, which is under
  `~/.local/share/blobot/worktrees/`. It cannot affect the user's work in their own repository,
  because a workspace profile only applies in that workspace.
- It is the only mechanism fx offers. The alternatives are prompting for every ordinary edit
  (ticket 02's regression) or paying a reviewer model per call.
- OpenCode's posture also travels outside the repository, through `OPENCODE_CONFIG_CONTENT`. The
  difference is that an environment variable dies with the process and a file does not.

## The case against

- **Nothing else blobot does writes into a user's tool configuration.** The palette reads
  `~/.claude/skills`; it does not write there. Detection runs the vendor's own commands. The
  sign-in flow deliberately does not participate. This would be the first exception.
- **Cleanup is now blobot's problem, and it is the kind that rots.** Delete a team, delete an
  agent, the app crashes mid-write, two blobot processes write at once, the user hand-edits the
  file: every one of those leaves stale workspace profiles behind in a file blobot does not own,
  naming directories that no longer exist. Compare the `purge`-versus-`remove` decision on team
  deletion, which exists because leftovers nobody mentions again are unacceptable.
- **A malformed write breaks the user's fx**, not just blobot's agent.

## What to do

Grill it, and answer with one of three, in writing:

1. **Yes, scoped to workspace profiles**, with the write, the merge, the cleanup on delete and
   the behaviour on a hand-edited file all specified, and a line in the creation flow's
   disclosure saying blobot configures fx for the folders it made. Disclosure is stated rather
   than consented to, as ticket 14 has it.
2. **No.** Ticket 02 maps all three words to `ask`, blobot vouches for nothing on fx, and the
   picker says so.
3. **Ask fx for the lever.** A per-session or per-process rule set on `session/new`, or an
   `FX_PERMISSION_RULES`-shaped override, is a small ask against an Apache-2.0 project whose ACP
   layer already takes `mcpServers` from the client for exactly this reason. File it upstream and
   ship option 2 in the meantime.

If the answer is 1, it wants an ADR, not just a ticket answer: it is the sort of decision
ADR-0003 is, about what blobot may touch outside its own storage.


## Answer

**No, and it turned out not to be needed.** The ticket assumed the only way to express a posture
on fx was `~/.fx/settings.json`, which is the user's own file. Measured 2026-08-31, there is a
per-process lever and it is the one that decides:

- **`FX_PERMISSION_MODE`**, an environment variable on the child, is what gates tool calls.
- The ACP session's `mode` (`code` / `ask`) is the visible half and on its own decides nothing.

The measurement that settles it, and it is the Codex lesson word for word: a session whose ACP
mode was `ask` -- the default a fresh `session/new` reports -- **wrote a file without asking
once**, because the process's own permission mode was `auto`. With `FX_PERMISSION_MODE=ask` on the
child, the identical prompt raised a proper `session/request_permission` carrying `allow_once`,
`allow_always` and `reject_once`. So the variable is not optional, exactly as `INITIAL_AGENT_MODE`
was not on Codex, and `spawnFx` sets it at every trust level.

Nothing is written to `~/.fx/settings.json`, and one further consequence follows from that which
the ticket did not raise: **`/allowlist` is refused in the palette.** It is one of the eighteen
commands fx advertises, its own hint is `add command "git *"`, and it writes a persistent allow
rule into that file. That is ticket 14's posture being edited from inside the composer, by prose,
permanently, in the user's own file -- and it would be the only path in the app by which an
agent's turn could widen what the next agent may do. `adapters/fx/palette.ts` drops it by name.

**What is lost by not writing that file** is real and is recorded on ticket 02: fx's two modes are
`ask` and `code`, `code` is "full tool access" with no carve-out for `rm`, `sudo` or `git push`,
and blobot has no per-process way to narrow it. So `trusting` cannot buy what it buys on Claude,
and all three trust words answer `ask`. `FX_EXPRESSES_TRUST = false` says so in code rather than
letting three words in a dialog imply a difference the adapter cannot deliver.
