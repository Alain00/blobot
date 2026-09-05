Type: research
Status: resolved

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

## Answer, 2026-09-04

Measured on Guillermo's Mac at zero token cost; the evidence, the table and the three tests that
would each cost a turn are in `research/04-what-each-runtime-confines.md`.

**Three of the five have a sandbox of their own and two have none.** Claude (srt itself:
Seatbelt on macOS, bubblewrap on Linux), Codex (Seatbelt / Landlock, and a standalone
`codex sandbox` launcher) and Cursor (`cursorsandbox` over `sandbox-exec`, bubblewrap and
Landlock on Linux). OpenCode has none — the Landlock symbols research/01 saw are the Bun runtime's,
its schema and docs carry no `sandbox` key, and `OPENCODE_CONFIG_CONTENT` has nothing to put in
it. fx has none and never says the word; `FX_PERMISSION_MODE` is the whole lever.

**What every one of the three confines is the shell tool, never the CLI.** The process holding the
login, the `Read`/`Write` tools and the MCP client sit outside the fence by design on all of them.
Two consequences. The mailbox survives everywhere with no exemption, because `message_agent` is an
in-process MCP call and not a shell command. And what the *outside* option (a fence around the
bridge, ticket 02) can promise — *the agent cannot read what the CLI must send* — no inside fence
promises at all. That is this ticket's contribution to ticket 04.

**The three fences disagree about what a fence is.** None confines reads by default and all three
leave `~/.ssh` readable; only Claude can be told otherwise (`denyRead`). A shell reaching
`127.0.0.1` is blocked on Codex with no exemption, blocked on Cursor in every mode except
`allow_all` (which fences nothing), and behind a key on Claude (`allowLocalBinding`). A blobot
word meaning *confined* would be true on Claude, narrower on Codex, false on OpenCode and fx —
ticket 14's refused shape at greater cost, which is the argument for the boundary being the
Machine rather than the runtime.

**Reach without a file in the AgentWorkspace**: Claude through `_meta.claudeCode.options.sandbox`
(by source; unverified live) or user/managed settings — with the trap that `sandbox.enabled`,
`excludedCommands` and `allowRead` are any-scope arrays that **merge**, so a repository's own
`.claude/settings.json` can widen a fence blobot set; Codex through `INITIAL_AGENT_MODE` only,
since `CODEX_CONFIG` merges `writable_roots` and nothing else; Cursor through `cli-config.json`
in blobot's own `CURSOR_CONFIG_DIR`, already shipped.

**Two findings about shipped code, relayed and not fixed here.** (1) `codex-acp` 1.7.0 defines
its `read-only` mode with a `workspaceWrite` sandbox and `networkAccess: false`; Codex's real
read-only sandbox is unreachable through the bridge, so the adapter's asserted mode name is true
and the fence behind it is workspace-write. (2) Cursor's `allow_all` is the mode with **no**
network fence; `adapters/cursor/permissions.ts` reads it as *network on inside the sandbox*, and
`live.test.ts`'s sandbox-versus-loopback check exercises an in-process MCP path the sandbox never
touches (`sandbox_mcp_servers: false`), so it would pass at any `networkAccess`. Both belong to
their own efforts (`.scratch/codex-runtime/`, `.scratch/cursor-runtime/`).
