/**
 * How much of an agent's own work blobot vouches for, before the runtime starts asking.
 *
 * One decision, four positions, provider-agnostic on purpose: each adapter owns the
 * translation into whatever its runtime can express, and they cannot express the same things.
 * See `adapters/claude/permissions.ts` and `adapters/opencode/config.ts`.
 *
 * It is a property of the *agent*, not of the team or the machine. An AgentWorkspace is per
 * agent, so trusting Alice says nothing about Bob, and that is the granularity the user asked
 * for. It rides the same path as the model and the effort: chosen on the profile, copied onto
 * the Agent at team creation, taken by a running team at its next start (ADR-0002).
 *
 * ## The fourth position, 2026-08-31
 *
 * This file used to end: *"There is no fourth position above `trusting`, and there will not be
 * one."* There is now, and it is `unattended`. The reversal is the author's, asked twice, and
 * `first-demo/14`'s reopened section is the record of the argument on both sides.
 *
 * **It is not the position that file refused.** The step ticket 14 declined was Claude's
 * `bypassPermissions` and OpenCode's unqualified allow: nothing asks, nothing decides, and
 * blobot's disclosure becomes false with no one to notice. `unattended` is a different thing on
 * the same axis. Claude's `auto` mode hands each request blobot has not already vouched for to
 * **the provider's own classifier**, which approves or denies it. Something still decides; it is
 * simply no longer the user. That is a real cost and the copy says so in those words rather than
 * in softer ones.
 *
 * Three properties keep it inside the rules the other three levels are held to.
 *
 * - **It composes rather than replaces.** `vouchedTools('unattended')` is `trusting`'s list
 *   unchanged, because `allowedTools` is consulted *before* the permission path, so a vouched
 *   call never reaches the classifier and never costs an inference call. The fourth level adds a
 *   decider for the tail; it does not widen the list.
 * - **The refusals survive, and they had to be made to.** This bullet first read *"absent from
 *   every list at every level; what changes is who answers"* -- and that was **false**, measured
 *   the day it shipped. Absent from an allowlist is not refused: under `auto` a real `claude` ran
 *   `chmod 777`, pushed a branch to a remote and reached for `sudo`, with no permission request
 *   reaching blobot at all. The classifier does not consult blobot's list; it decided yes. The
 *   nine verbs are a **deny list** now, at this level only, and `adapters/claude/permissions.ts`
 *   carries the runs. At the three attended levels they still ask, because there somebody can
 *   answer.
 * - **Only one runtime can express it, and the other three say so** rather than accepting the
 *   word and silently doing something else. `trustLevelsFor` is how a runtime declares which
 *   positions are real on it, and the agent form draws only those.
 *
 * There is no fifth position. `bypassPermissions`, `acceptEdits`, `dontAsk` and OpenCode's
 * `'*': allow` remain unoffered, and `.scratch/sandboxing/04` is where that would be reopened.
 */
export type TrustLevel = 'careful' | 'normal' | 'trusting' | 'unattended';

/**
 * What an agent is when nobody has chosen. Stored as nothing: an absent column is `normal`, so
 * every agent hired before this existed already has the posture it was running under.
 */
export const DEFAULT_TRUST: TrustLevel = 'normal';

/** Every position, weakest first. The order the picker draws and the order the scale reads in. */
export const TRUST_LEVELS: readonly TrustLevel[] = [
  'careful',
  'normal',
  'trusting',
  'unattended',
];

/**
 * The three positions every runtime can express, which is what a runtime declares when it has
 * no classifier of its own. Codex, fx and OpenCode all answer this.
 */
export const ATTENDED_TRUST_LEVELS: readonly TrustLevel[] = ['careful', 'normal', 'trusting'];

/**
 * A stored string that is no longer a level blobot knows is `normal`, never a guess upward.
 *
 * This is also what protects an agent whose runtime stopped expressing `unattended` — a model
 * change, a bridge upgrade, a machine where the classifier is not offered. The stored word is
 * still `unattended`; what it *does* is decided at launch by `claudeModeFor` and the adapter's
 * fallback, which reports rather than assumes.
 */
export function trustLevelOf(value: string | null | undefined): TrustLevel {
  return TRUST_LEVELS.includes(value as TrustLevel) ? (value as TrustLevel) : DEFAULT_TRUST;
}
