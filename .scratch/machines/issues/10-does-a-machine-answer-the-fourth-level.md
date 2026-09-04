Type: grilling
Status: open
Blocked by: 04, 09

# Does a sandbox answer the fourth trust level

## Question

Ticket 14 of `first-demo` is **reopened** on whether `trusting` should be the ceiling, from the
author: *"the cli has an auto mode, or allow everything, how we don't have that?"* It was left
open on purpose. This ticket is the reason it might now be answerable.

The case against a fourth level is that `bypassPermissions` makes blobot's disclosure false and
releases the four operations that are unrecoverable outside the worktree — `rm`, `sudo`, `chmod`,
`git push`. **Inside a fence, three of those four stop being unrecoverable outside the
worktree**, because there is no outside they can reach. Claude's own help draws the same line
unprompted: bypass is *"recommended only for sandboxes with no internet access."*

## What to establish

- **Does the fence actually cover what the ceiling was protecting?** Go through ticket 14's
  refused list one at a time against a real policy. `rm` inside a bind-mounted workspace is a
  worktree the user can recover with git. `sudo` inside a userns is not the host's root.
  `git push` is a network operation and dies to an egress allowlist. `chmod` is contained.
  Somewhere in that list is one that is still real, and finding it is the work.
- **Whether the level is per agent, and what happens when the fence is unavailable.** A trust
  level is stored on the profile and taken at next start. A sandbox can fail to engage — no
  `bwrap`, a kernel without userns, a platform srt does not cover. An agent whose posture is
  *bypass, because it is fenced* must not start unfenced. That is the same fatal-assert shape
  as `09`.
- **Whether it is one control or two.** See `04`. If the fence is a separate control, then the
  fourth level is *conditional on it*, and a form that offers a position the user cannot select
  without the other is a form that needs to say why.

## The honest failure mode

That a fence makes the loosest level *defensible* is not the same as it being *wanted*. The
argument that shipped for three levels was that a default made choosable is not a permissions
system. Four levels where the fourth is only valid in one configuration is closer to a
permissions system than three ever was, and this ticket should say so if it concludes yes.

## Amendment, 2026-09-04 — absorbed

This was `.scratch/sandboxing/04`, and it is the ticket four places in the codebase point at:
`packages/core/src/trust.ts:46`, `packages/core/src/adapters/claude/permissions.ts:162`,
`.scratch/mcp-permissions/spec.md`, and ticket 14 of `first-demo`. Those pointers have been
updated to `.scratch/machines/10`; the question is unchanged.

One addition from the wider destination. The argument above is that inside a fence, three of the
four unrecoverable operations stop being unrecoverable *because there is no outside they can
reach*. On a **machine that is not the user's own** — a container, a VM, a box kept for this —
that argument gets stronger still, and for a plainer reason: the blast radius is a thing the user
provisioned for exactly this and can destroy. But it also acquires a cost the fence does not
have, because the work is over there too. Establish whether the fourth level is conditional on a
*kind* of Machine rather than on a fence being engaged.
