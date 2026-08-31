Type: research
Status: open

# Does OpenCode have a sandbox

## Question

`opencode` 1.18.4 links the Landlock syscalls — `landlock_create_ruleset`, `landlock_add_rule`,
`landlock_restrict_self` — and carries a `"sandbox"` key, but a strings probe found **no
user-facing surface** (`research/01` §4). Claude and Codex both have one. Establish whether
OpenCode does.

This is unblocked and cheap, and it is the ticket that decides whether `02`'s inside option is
symmetric or is the asymmetric guarantee ticket 14 spent a section refusing.

## What to establish

- Whether those symbols are OpenCode's own or arrive with its runtime — Bun links plenty that
  Bun's embedder never calls. A linked syscall is not a feature.
- Whether the `"sandbox"` key is config, telemetry, or a leftover. `opencode debug agent` prints
  the fully resolved agent, and it is already this repo's verification tool for the permission
  posture, so ask it the same way.
- Whether the config schema at `https://opencode.ai/config.json`, which blobot already writes
  against in `OPENCODE_CONFIG_CONTENT`, carries anything for it. If it does, the delivery route
  is one blobot already owns and needs no new mechanism at all — which would make OpenCode the
  *easiest* of the three rather than the gap.
- If there is nothing: whether `codex sandbox <command>`, which is a standalone Linux sandbox
  launcher that will wrap any command, could wrap an OpenCode bridge. Note carefully that this
  is a vendor's internal tool being used on another vendor's binary. Cheap to test, and record
  the reason it is a bad idea if it is one.

## Why the answer matters more than it looks

If OpenCode has no sandbox, `02`'s inside option gives blobot a real boundary on two runtimes
out of three and nothing on the third, and ticket 14's *"a guarantee that holds for Alice and
not for Bob is worse than no guarantee"* applies directly. The outer fence of `01` does not have
that problem — it is the same fence whatever is behind it — which is the strongest argument for
the outside option, and it only holds if `01` comes back yes.
