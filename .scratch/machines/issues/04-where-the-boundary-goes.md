Type: grilling
Status: open
Blocked by: 01, 02, 03

# Where the boundary goes: around the bridge, or inside the runtime

## Question

Two layers are available and they fail in opposite places.

**Outside** — srt around `spawnNpmBridge` (`adapters/acp/npm-bridge.ts:62`), which is one spawn
site for all three runtimes. Provider-agnostic by construction, which is exactly the shape the
architectural rules ask for, and it confines node, the bridge, the CLI and every tool at once.
It severs the mailbox (`02`) and it cannot hide the CLI's own credential from the CLI's own
`Read` tool, because they are the same process.

**Inside** — Claude's `sandbox.*` settings and Codex's `--sandbox` mode, translated per adapter
from one blobot word, exactly as `careful`/`normal`/`trusting` already are. Keeps the mailbox,
because the CLI is managing its own connections. Draws the one seam blobot cannot draw: the
CLI's process may read the credential, the bash subprocesses it spawns may not. Costs an
asymmetry (`03`) and costs configuration reach.

Decide which, or in what order, or both.

## What makes this hard

- **The delivery route on Claude is not obvious.** The sandbox is a *settings* surface, and
  ticket 14 refused seeding `<workspace>/.claude/settings.local.json` because an AgentWorkspace
  is a checkout that can be committed home. The lever that unlocked ticket 14's 2026-08-30
  amendment was discovering the bridge passes `allowedTools` through `_meta.claudeCode.options`
  untouched. **Establish whether it passes a `sandbox` object the same way.** If it does this is
  cheap; if it does not, the honest options are an env var, user-scope settings, or nothing.
- **"Both" is not free.** Two fences whose policies disagree produce a failure nobody can read
  from the transcript, and the app has exactly one word for it (`waiting`). If both, one of them
  owns the policy and the other is fixed.
- **The trust selector may not be the right control.** `careful`/`normal`/`trusting` is about
  *prompting*. A sandbox is about *reach*. Folding a boundary into the same three words makes
  the middle position mean two unrelated things; a second control is honest and is one more
  thing on a form ADR-0002 already keeps deliberately short.

## The prior this must not quietly break

*"A guarantee that holds for Alice and not for Bob is worse than no guarantee"* — ticket 14, on
refusing to hard-block on OpenCode where it could. That is exactly the trade the inside option
offers, and it is the same argument turned up one level, because a sandbox is a much bigger
claim than a `deny` rule. Either answer it or overturn it explicitly.

## Amendment, 2026-09-04 — absorbed, and a third layer exists

This was `.scratch/sandboxing/02`. Two things change.

**Five runtimes, not three.** `spawnNpmBridge` is still one spawn site, but Cursor already runs
with its own sandbox enabled by blobot, so the *inside* option is not hypothetical on every
runtime — it is partly shipped, unexamined, on one.

**There is a third layer now, and it is the reason the effort was widened.** Outside-the-bridge
and inside-the-runtime were the only two options while the machine was a given. If the Machine
is itself a choice, the boundary can be **the machine**: a container, a VM, another box. That
layer has properties neither of the other two has — it is runtime-agnostic like the outer fence,
it does not have to fight the CLI for its own credential like the inner line, and it costs the
mailbox and the worktree in ways `02` and `05` are the tickets for.

This ticket now decides between **three** layers, or an order among them, not two.
