import type { TrustLevel } from '../../trust.js';

export const CODEX_LOCAL_PROTECTION =
  'Local execution keeps native shell write and network restrictions. These remain tied to its approval mode.';

/**
 * What blobot vouches for on a Codex session, and the two things it refuses to pretend.
 *
 * The counterpart to `adapters/claude/permissions.ts` and OpenCode's `PERMISSION_POSTURE`, and
 * the shortest of the three, because Codex does not take a posture from its client. Everything
 * below was measured 2026-08-30 against codex-cli 0.148.0 behind codex-acp 1.7.0; the
 * transcripts are in `.scratch/codex-runtime/research/02-transcripts/`.
 *
 * ## The one lever is the mode, and it is not `CODEX_CONFIG`
 *
 * The bridge collapses Codex's two axes -- `approval_policy` and `sandbox_mode` -- into three
 * mode ids, and **the mode wins over the config.** A session started with
 * `CODEX_CONFIG={"approval_policy":"never","sandbox_mode":"danger-full-access"}` under
 * `INITIAL_AGENT_MODE=read-only` still asked before writing to the home directory, and the
 * rejection held. `sandbox_workspace_write.network_access` is inert the same way. So the posture
 * is an environment variable on the spawn, beside `NO_BROWSER`, and never a config key -- which
 * is also why blobot writes none of those keys: a value that does nothing is a claim that will
 * be believed by the next reader.
 *
 * ## `read-only` does not mean what it is called
 *
 * This ticket expected `read-only` to produce an agent that cannot edit a file in its own
 * worktree. **It does not.** Under `read-only` an agent created a file, edited files and ran
 * commands inside its workspace with no permission request at all, and asked only when it left:
 * a write to `~`, and any command reaching the network. Codex's own name for the mode on screen
 * is *"Ask for approval"*, described as *"Always ask to edit external files and use the
 * internet"*, and that description is exactly accurate. It is ticket 14's posture, arrived at
 * from the other end, and it is a **kernel boundary rather than a promise** -- better isolation
 * than either other runtime can offer for ticket 10.
 *
 * ## `agent`, the bridge's default, is below blobot's floor
 *
 * With `INITIAL_AGENT_MODE` unset the session runs as `agent`, and an agent in that mode
 * **wrote a file into the user's home directory without asking once**. Not a worktree, not
 * `/tmp`: `~`. So this file's most important line is that the variable is always set. Shipping
 * the bridge's default would be shipping the posture ticket 14 exists to refuse, silently, with
 * no UI ever mentioning it. `agent-full-access` is `bypassPermissions` in another spelling and
 * stays unoffered, which is the same decision on the other side.
 */
export type CodexMode = 'read-only' | 'agent' | 'agent-full-access';

/**
 * The posture, for every agent at every trust level.
 *
 * Not a trust level: a constant. It implements ticket 10, not ticket 14 -- the workspace is
 * where the work happens and everything outside it asks -- and the trust word does not reach it,
 * because the two neighbouring modes are the two blobot refuses.
 */
export const CODEX_POSTURE_MODE: CodexMode = 'read-only';

/**
 * `careful`, `normal` and `trusting` all answer `read-only`, and that is a finding rather than
 * an oversight.
 *
 * The three modes are the whole of what the runtime accepts, one of them is under blobot's floor
 * and one is over its ceiling, so there is exactly one position left. The closed list that asks
 * at every level on the other two runtimes -- `rm`, `sudo`, `chmod`, `chown`, `ssh`, `scp`,
 * `docker`, `git push`, `git remote` -- **cannot be expressed here at all**, and this ticket said
 * to state that rather than quietly drop it. Measured: `chmod 777` inside the workspace ran
 * without a prompt under `read-only`, because Codex's axis is *where the work lands and whether
 * it reaches the network*, not *what the command is called*.
 *
 * Faking the difference by answering permission requests on blobot's own side was considered and
 * is refused. A request carries `rawInput.command`, but every one of them arrives as
 * `/usr/bin/zsh -lc "<the real command>"`, so vouching by prefix would be prefix-matching the
 * inside of a shell string. That is precisely why `bash` and `sh` are absent from Claude's list:
 * a rule that vouches for a shell vouches for everything the shell can reach.
 */
export function codexModeFor(_trust: TrustLevel): CodexMode {
  return CODEX_POSTURE_MODE;
}

/**
 * Whether the trust word changes anything on this runtime. `false` here, and the reason the
 * adapter has to say so out loud rather than let the picker imply otherwise.
 *
 * `AgentRuntime.accepts` is the precedent: blobot's own word for what a runtime takes, so the
 * composer can refuse an attachment before the user writes one, with the renderer naming the
 * decision and still not knowing which runtime is behind it. The same shape answers this. Wiring
 * it to the hire and edit dialogs is ticket 05's, not this file's.
 */
export const CODEX_EXPRESSES_TRUST = false;

/**
 * The posture as the child's environment, which is where it lives on this runtime the way
 * OpenCode's lives in `OPENCODE_CONFIG_CONTENT`.
 */
export function codexPostureEnv(trust: TrustLevel): Readonly<Record<string, string>> {
  return { INITIAL_AGENT_MODE: codexModeFor(trust) };
}
