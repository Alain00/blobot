/**
 * Which of an fx session's advertised commands blobot is willing to put in front of a user.
 *
 * ADR-0003's rule on the fourth runtime, and the simplest instance of it so far. fx advertised
 * **eighteen** commands on a real session (2026-08-31), and every one of them is a built-in:
 * unlike Claude and Codex, fx does not surface a person's skills as slash commands, so there is
 * no authored directory to read and nothing to intersect. The allowlist is therefore the whole
 * of the decision, which makes each exclusion worth a sentence rather than a category.
 *
 * The eighteen: `allowlist`, `changes`, `clear`, `compact`, `credits`, `fast`, `fx`, `help`,
 * `mcp`, `model`, `permissions`, `reset`, `review`, `rules`, `settings`, `skills`, `status`,
 * `undo`.
 *
 * Four are offered and the reasons the other fourteen are not fall into four groups:
 *
 * - **`allowlist` is the sharp one, and it is refused on principle.** Its own hint is
 *   `add command "git *"`, and it writes a persistent allow rule into `~/.fx/settings.json`.
 *   That is ticket 14's posture being edited from inside the composer, by prose, permanently,
 *   in the user's own file — the exact thing `trusting` is capped to prevent. It would also be
 *   the only path in the app by which an agent's own turn could widen what the next agent is
 *   allowed to do. It is not offered at any trust level and there is no argument for it.
 * - **`settings`, `permissions`, `rules`, `mcp`, `skills`, `credits`, `fx`, `help`** are
 *   introspection of the machine rather than work on the repository. blobot has a Settings door
 *   for the machine, and none of these tell a teammate anything about the code.
 * - **`clear` and `reset`** throw away the session. blobot owns the session boundary
 *   (`.scratch/transcript-scale/10`) and a command that silently ends a conversation the
 *   transcript is still showing is that decision being taken by somebody else.
 * - **`model` and `fast`** are the option picker's decision, offered once already by ADR-0002's
 *   option groups. A menu with two ways to say the same thing is worse than a menu with one.
 * - **`review`** toggles post-edit review for the session. It changes how fx works rather than
 *   doing anything, and a toggle whose state nothing in blobot displays is a switch in the dark.
 */

/**
 * The built-ins blobot vouches for. Four, each something a teammate on a coding team does.
 *
 * `compact` is here for the reason `.scratch/transcript-scale/10` gives: blobot does not reach
 * for a runtime's own compaction, and it stays in the palette for a person to type.
 */
export const VOUCHED_BUILT_INS: readonly string[] = ['status', 'changes', 'undo', 'compact'];

/** Everything blobot is willing to offer. Takes `cwd` for the shape the other adapters have,
 *  and ignores it: fx advertises no per-workspace authored commands to intersect with. */
export function offerableNames(_cwd: string): Set<string> {
  return new Set(VOUCHED_BUILT_INS);
}
