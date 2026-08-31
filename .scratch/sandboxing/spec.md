# Sandboxing

blobot claims **prompting**, and prompting only. Ticket 14 says so deliberately and says why:
the pattern lists on both runtimes are a **speed bump, not a boundary**, `bash -c "rm -rf …"`
sails through a command-string rule, and a guarantee that holds for Alice and not for Bob is
worse than no guarantee. Everything the app tells the user is built to be true under that
limitation.

A sandbox is the thing that would let blobot claim something else. This effort asks whether one
is available on the terms blobot already holds, and at what price.

Opened 2026-08-31, from the author: *"what is the easier way to provide sandbox? any vercel lib?
just exploring."* Nothing here is built, and nothing here has been decided.

## Why this is being asked now

Three things arrived at the same question from different sides.

- **Ticket 14 is reopened** on whether `trusting` should be the ceiling. The case against a
  fourth level is that `bypassPermissions` outside a sandbox makes blobot's disclosure false.
  Inside one it may not: Claude's own help says bypass is *"recommended only for sandboxes with
  no internet access"*, which is the vendor drawing exactly this line. **A sandbox may be what
  makes "allow everything" answerable rather than refusable**, and that is the most valuable
  thing it could buy.
- **Reads were never gated.** `Read`, `Glob` and `Grep` never prompt on Claude, which ADR-0004
  already had to reason about for attachments. The permission posture has nothing to say about
  an agent reading `~/.ssh`, and neither does the trust selector.
- **The posture is per agent but the machine is shared.** Three AgentWorkspaces isolate the
  *work*. They isolate nothing else.

## The constraints anything here must hold

These are not this effort's to relax.

- **Local-first, no cloud dependencies, no credential storage.** This rules out an entire product
  category on the rules rather than on the merits. See `research/01`.
- **Providers live behind `AgentRuntime`, and the UI is provider-agnostic.** Whatever this
  becomes, the renderer must not learn what a sandbox is made of, the same way it cannot tell
  which runtime is behind `careful`/`normal`/`trusting`.
- **blobot writes nothing into the user's repository.** An AgentWorkspace is a checkout on a
  blobot branch, so a config file left there can be staged, committed and merged home. This
  already decided `OPENCODE_CONFIG_CONTENT` over a file and `allowedTools` over
  `settings.local.json`, and it decides how a sandbox is configured too.
- **The mailbox is the product.** Ticket 15's loopback MCP server is how agents message each
  other. A sandbox that severs it has not made blobot safer, it has made it a single-agent app.
- **Honesty over capability.** Ticket 14's rule stands: a claim that holds on one runtime and not
  the other is worse than no claim. If a sandbox is real for a Claude agent and unavailable for
  an OpenCode one, that asymmetry has to be answered before it is shipped, not after.

## What is in scope

Whether blobot can impose a filesystem and network boundary on an agent's process subtree;
where that boundary goes; what it would then be entitled to say; and whether it changes ticket
14's reopened ceiling.

## What is not

An approvals system. Ticket 14's out-of-scope line still holds and this effort is a much better
excuse to cross it than that ticket ever had. A sandbox is a boundary the user does not
administer; a screen listing what each agent may currently do is the other thing, and it is
still not this.

Also not in scope: sandboxing blobot itself, or the Electron app. The subject is the agent's
process subtree and what it can reach.

## Decisions so far

None. The frontier is `01`.

## Notes

`research/01-external-sandbox-libraries.md` carries measurements taken on this machine against
real tools on 2026-08-31, including the one result that blocks the obvious approach. Read it
before any ticket here.
