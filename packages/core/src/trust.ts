/**
 * How much of an agent's own work blobot vouches for, before the runtime starts asking.
 *
 * One decision, three positions, provider-agnostic on purpose: each adapter owns the
 * translation into whatever its runtime can express, and they cannot express the same things.
 * See `adapters/claude/permissions.ts` and `adapters/opencode/config.ts`.
 *
 * It is a property of the *agent*, not of the team or the machine. An AgentWorkspace is per
 * agent, so trusting Alice says nothing about Bob, and that is the granularity the user asked
 * for. It rides the same path as the model and the effort: chosen on the profile, copied onto
 * the Agent at team creation, taken by a running team at its next start (ADR-0002).
 *
 * There is no fourth position above `trusting`, and there will not be one: the next step up is
 * Claude's `bypassPermissions` or OpenCode's unqualified allow, and ticket 14 refuses both.
 * What blobot claims is prompting, on both runtimes, at every level.
 */
export type TrustLevel = 'careful' | 'normal' | 'trusting';

/**
 * What an agent is when nobody has chosen. Stored as nothing: an absent column is `normal`, so
 * every agent hired before this existed already has the posture it was running under.
 */
export const DEFAULT_TRUST: TrustLevel = 'normal';

const LEVELS: readonly TrustLevel[] = ['careful', 'normal', 'trusting'];

/** A stored string that is no longer a level blobot knows is `normal`, never a guess upward. */
export function trustLevelOf(value: string | null | undefined): TrustLevel {
  return LEVELS.includes(value as TrustLevel) ? (value as TrustLevel) : DEFAULT_TRUST;
}
