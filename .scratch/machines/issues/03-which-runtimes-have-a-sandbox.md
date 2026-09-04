Type: research
Status: open

# Does OpenCode have a sandbox

## Question

`opencode` 1.18.4 links the Landlock syscalls — `landlock_create_ruleset`, `landlock_add_rule`,
`landlock_restrict_self` — and carries a `"sandbox"` key, but a strings probe found **no
user-facing surface** (`research/01` §4). Claude and Codex both have one. Establish whether
OpenCode does.

This is unblocked and cheap, and it is the ticket that decides whether `04`'s inside option is
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

If OpenCode has no sandbox, `04`'s inside option gives blobot a real boundary on two runtimes
out of three and nothing on the third, and ticket 14's *"a guarantee that holds for Alice and
not for Bob is worse than no guarantee"* applies directly. The outer fence of `02` does not have
that problem — it is the same fence whatever is behind it — which is the strongest argument for
the outside option, and it only holds if `02` comes back yes.

## Amendment, 2026-09-04 — absorbed, and now about five runtimes

This was `.scratch/sandboxing/05`, retitled from *Does OpenCode have a sandbox* because the
question outgrew its subject. It was written when blobot had three runtimes. It has **five**, and
two of them arrived with answers already:

- **Cursor**: `adapters/cursor` already sets `sandbox` to `enabled` with network as a constant
  rather than a dial. That is a shipped sandbox blobot configures today, and nobody has asked
  what it is worth or what it actually confines. Start here, because it is the only one where
  the answer is already in production.
- **fx**: unexamined. `FX_PERMISSION_MODE` is the posture lever and the effort that built the
  adapter never asked whether a boundary exists beside it.

So the question is: **for each of the five, is there a sandbox of its own, what does it confine,
and can blobot reach it without writing a file into the AgentWorkspace?** The asymmetry argument
below is unchanged and gets sharper with five: a guarantee that holds for three runtimes and not
the other two is the same refusal ticket 14 made, at greater cost.
