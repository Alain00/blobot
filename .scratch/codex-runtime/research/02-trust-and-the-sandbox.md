# 02 — Trust, approval, and a sandbox the other runtimes do not have

Measurements behind `issues/02-trust-approval-and-a-sandbox.md`.
Date: 2026-08-30. **codex-cli 0.148.0** behind **`@agentclientprotocol/codex-acp` 1.7.0**, real
turns on the author's own account. Driver and transcripts in `02-transcripts/`; the driver is
`01-transcripts/acp.mjs` with `PERM=reject` added, so a request that fires is refused rather than
answered.

Every claim below is **[OBS]** unless marked otherwise. The client answered no `fs/` requests in
any of these runs, so every write was the agent's own tool inside its own sandbox, not a write
handed through the client.

| Run | Setup | Asked? | Effect |
|---|---|---|---|
| `e1-agent-write` | default mode | no | wrote `e1.txt` in the workspace |
| `e4-readonly-write` | `INITIAL_AGENT_MODE=read-only` | no | wrote `e4.txt` in the workspace |
| `e5-agent-boundaries` | default mode | **no, three times** | wrote `/tmp/...`, ran `chmod 777`, ran `curl` |
| `e6-readonly-boundaries` | `read-only` | only on `curl` | `/tmp` write and `chmod` ran; network asked |
| `e7-readonly-escape` | `read-only` | **yes** | `~` write asked, rejected, no file |
| `e8-agent-escape` | default mode | **no** | `~` write happened |
| `e9-untrusted-config` | `CODEX_CONFIG.approval_policy=untrusted` | no | ordinary command ran |
| `e10-config-vs-mode` | `read-only` + config `never` / `danger-full-access` | **yes** | `~` write asked, rejected, no file |
| `e11-network-config` | `read-only` + config `network_access=true` | **yes** | `curl` asked |

## The four results

**1. `read-only` is not read-only.** The ticket expected `careful → read-only` to produce an agent
that cannot edit a file in its own worktree, and called that a broken agent. It is not what the
mode does. Under `read-only` an agent created files, edited files and ran commands inside its
workspace with no permission request at all, and asked only when the work left: a write to `~`,
and a command reaching the network. Codex's own screen name for it is *"Ask for approval"*,
described as *"Always ask to edit external files and use the internet"*, and that description is
exact. It is ticket 14's posture reached from the other end, with a kernel behind it instead of
a promise.

**2. `agent`, the bridge's default, is below blobot's floor.** With `INITIAL_AGENT_MODE` unset,
an agent **wrote a file into the user's home directory without asking once** (`e8`). Not the
worktree, not `/tmp`: `~`. Leaving the variable off would ship the posture ticket 14 exists to
refuse, silently, with nothing in the UI ever mentioning it. This is the single most important
line of the whole effort so far.

**3. The mode wins over `CODEX_CONFIG`.** `approval_policy: "never"` and
`sandbox_mode: "danger-full-access"` together, under `INITIAL_AGENT_MODE=read-only`, changed
nothing: the home-directory write still asked and the rejection still held (`e10`).
`sandbox_workspace_write.network_access: true` is inert the same way (`e11`), and
`approval_policy: "untrusted"` alone changed nothing either (`e9`). So the posture is an
environment variable on the spawn and never a config key. blobot writes none of those keys: a
value that does nothing is a claim the next reader will believe.

**4. Codex's axis is location and network, not the name of the command.** `chmod 777` on a file
inside the workspace ran with no prompt under `read-only` (`e6`), and `/tmp` writes ran too,
because `/tmp` is inside the workspace-write sandbox's own writable roots. The closed list that
asks at every level on the other two runtimes — `rm`, `sudo`, `chmod`, `chown`, `ssh`, `scp`,
`docker`, `git push`, `git remote` — **cannot be expressed on this runtime at all.** The ticket
asked for that to be stated rather than quietly dropped, so here it is stated.

## The mapping, and the two refusals

- **`sandbox_mode` is not a trust level. It is a constant**, as the ticket expected — but blobot
  never sets the key. `INITIAL_AGENT_MODE=read-only`, on every agent, is the whole posture. It
  implements ticket 10, not ticket 14.
- **`approval_policy` is not the trust level either**, which the ticket did expect it to be. It
  is inert under a mode, so there is nothing to map onto it.
- **All three trust words answer `read-only`.** Three modes exist, one is under the floor and one
  is over the ceiling, so exactly one position is left. `careful`, `normal` and `trusting` are the
  same posture on Codex, and `adapters/codex/permissions.ts` says so in a constant
  (`CODEX_EXPRESSES_TRUST = false`) rather than leaving three words to imply otherwise.
- **Faking the difference on blobot's side is refused.** A permission request does carry
  `rawInput.command`, so auto-answering the ones blobot vouches for looked possible. Every command
  arrives as `/usr/bin/zsh -lc "<the real command>"`, so a prefix rule would be matching the
  inside of a shell string — which is exactly why `bash` and `sh` are absent from Claude's
  allowlist. A rule that vouches for a shell vouches for everything the shell can reach. [OBS + INF]
- **`allow_always` still has no path to the UI.** Codex offers it in two spellings,
  `accept_execpolicy_amendment` on a command and `allow_for_session` on an edit. Both are dropped
  the way ticket 14 already drops the option kind.

## What the picker shows

ADR-0002's rule: blobot subtracts the options it decides itself. `mode` comes out, since it *is*
the posture and a user who could pick `agent-full-access` from a dropdown would have gone around
ticket 14 without ever seeing the word. `model`, `reasoning_effort` and `fast-mode` stay, and are
the same three ADR-0002 already reads off Claude. `collaboration_mode` (`default` / `plan`) stays
too: blobot does not decide it, and it changes how Codex works *within* the posture rather than
changing the posture.

## The one thing this leaves open

The trust picker is per agent, in blobot's own three words, and on a Codex agent it will change
nothing. The renderer cannot be told which runtime it is looking at, so the honest answer has the
shape `AgentRuntime.accepts` already has: a runtime says, in blobot's vocabulary, what it can
express, and the dialog names the decision without knowing whose it is. `CODEX_EXPRESSES_TRUST`
is that fact today; wiring it to the hire and edit dialogs is ticket 05's work, and it may reopen
a line of ticket 14's UI.
