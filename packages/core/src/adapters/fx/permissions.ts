import type { TrustLevel } from '../../trust.js';

/**
 * Ticket 14's posture on fx, which has two rungs and needs both of them held down.
 *
 * fx exposes the question twice, and the two levers are not the same lever:
 *
 * - **`FX_PERMISSION_MODE`**, a process environment variable, is the one that decides.
 * - **The ACP session's `mode`** (`code` or `ask`, a `session/set_config_option`) is what the
 *   protocol shows, and on its own it decides nothing.
 *
 * Measured against a real `fx` 0.0.7 on 2026-08-31 (`.scratch/fx-runtime/research/01`): a
 * session whose ACP mode was `ask` — the default a fresh `session/new` reports — **wrote a file
 * without asking once**, because the process's own permission mode was `auto`. With
 * `FX_PERMISSION_MODE=ask` set on the child, the same prompt raised a proper
 * `session/request_permission` carrying `allow_once`, `allow_always` and `reject_once`.
 *
 * That is the Codex lesson word for word — there, `INITIAL_AGENT_MODE` was not optional
 * because the bridge's default wrote into the user's home directory — and it is why the
 * environment variable is set at every level rather than only at the careful one.
 */
export const FX_PERMISSION_MODE_ENV = 'FX_PERMISSION_MODE';

/** The two modes fx advertises over ACP. `auto` and `yolo` exist in the CLI and have no ACP
 *  door at all, so ticket 14's usual refusal costs nothing here: there is nothing to refuse. */
export const FX_MODE_ASK = 'ask';
export const FX_MODE_CODE = 'code';

/**
 * One posture on this runtime at every trust level, and this is the constant that says so.
 *
 * The same shape as `CODEX_EXPRESSES_TRUST`, and for a sharper reason. fx has exactly two
 * rungs, and the upper one is described as *"Write and modify code with full tool access"* —
 * no carve-out for `rm`, `sudo`, `chmod`, `ssh`, `docker`, `git push` or `git remote`, all of
 * which `CLAUDE.md` says must ask at every level. So `code` sits **above blobot's ceiling**,
 * exactly as `bypassPermissions` and `danger-full-access` do, and the fact that fx calls it the
 * ordinary working mode does not move the ceiling.
 *
 * That leaves one rung blobot may use, so all three words answer `ask`. Declaring it here is
 * the point: three words in the hire dialog that quietly mean the same thing on this runtime
 * would be the renderer implying a difference the adapter cannot deliver. A caller that wants
 * to tell the user how much their choice bought on this runtime reads this.
 */
export const FX_EXPRESSES_TRUST = false;

/**
 * The ACP mode blobot puts an fx session in, whatever the user chose.
 *
 * Takes the level so the signature does not have to change on the day fx grows a middle rung,
 * and ignores it for the reason above. The argument is not unused: it is the record of a
 * decision that was made rather than a parameter nobody thought about.
 */
export function fxModeFor(_trust: TrustLevel): string {
  return FX_MODE_ASK;
}

/** What goes in the child's environment. Same answer, and the same reason it is not optional. */
export function fxPermissionEnv(trust: TrustLevel): Record<string, string> {
  return { [FX_PERMISSION_MODE_ENV]: fxModeFor(trust) };
}
