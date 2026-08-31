/**
 * Ticket 09's types for `.scratch/routines/`.
 *
 * A **Routine** is a named, repeatable instruction to one Agent, delivered on a schedule instead
 * of by a person. It is a prompt with a clock behind it: no steps, no branches, no output feeding
 * anything. Work that needs three agents in order is a prompt saying so, and `message_agent`.
 */

/**
 * The schedule, as a **closed set of three shapes rather than an expression**.
 *
 * This is issue 04's cost ceiling and it is deliberately a vocabulary rather than a number: the
 * runaway case is not bounded, it is *not offered*. Nothing finer than hourly exists, so the
 * maximum firings in a day is readable off the shape by looking at it, and there is no cron
 * string to store because there is none to enter. `cron` is on the glossary's Avoid list for the
 * same reason: it promises a guarantee blobot cannot keep.
 *
 * Every field is local time. A person writes "every day at 9am" meaning their own morning, and a
 * schedule that drifted an hour twice a year would be the app being clever about something the
 * user was not.
 */
export type Schedule =
  | { readonly kind: 'hourly'; readonly minute: number }
  | { readonly kind: 'daily'; readonly hour: number; readonly minute: number }
  /** `weekday` is 0 for Sunday, matching `Date.prototype.getDay`. */
  | { readonly kind: 'weekly'; readonly weekday: number; readonly hour: number; readonly minute: number };

export interface Routine {
  readonly id: string;
  /**
   * The Agent, and therefore `<team>/<agent>`: one agent on one team, the identity the
   * AgentWorkspace's branch is named for. Never the AgentProfile behind it — the same person
   * hired onto two teams has two sets of Routines and they do not travel. A turn needs an
   * AgentWorkspace, a session and a mailbox, and none of those are a Team's to lend.
   */
  readonly agentId: string;
  readonly name: string;
  readonly prompt: string;
  readonly schedule: Schedule;
  /**
   * Whether it fires. **Disarmed is the resting state and the default**, because an Agent may
   * propose a Routine and only a person may arm one.
   */
  readonly armed: boolean;
  /**
   * The Agent that asked for this, when an agent did. Not *who owns it* — who **asked** — and
   * that distinction is the whole of issue 05. An agent id, never free text.
   */
  readonly proposedBy?: string;
  /**
   * When a person answered a proposal, whatever they answered. Absent on a Routine the user made
   * themselves, where there was nothing to answer, and on a proposal still waiting.
   *
   * This is what makes *unanswered* a fact rather than an inference. It was read as *armed or
   * gone*, which is wrong in both directions: a proposal armed and later disarmed came back to
   * the top of the screen as though nobody had looked at it, and it went on counting against the
   * cap that stops an agent proposing again. A decision the user later reversed is still a
   * decision they made.
   */
  readonly reviewedAt?: number;
  /**
   * The last moment this Routine was **accounted for** — ran, or was noticed to have been
   * missed. Epoch millis from the injected clock, undefined until the first tick that sees it.
   *
   * Deliberately not `lastFiredAt`. A missed firing does not run, so it would never advance a
   * *fired* mark, and the scheduler would then report the same missed firing on every tick for
   * the rest of the Routine's life: `missed 4 firings` at breakfast and `missed 4 firings` again
   * a minute later, each one writing another `routine_runs` row. Settled is the honest word for
   * what the mark means, and it is what makes a skip recorded exactly once.
   *
   * *When it last ran* is a different question, and `routine_runs` answers it — which is also
   * where issue 06's screen gets its sort and issue 08's disarm-after-three gets its count.
   */
  readonly lastSettledAt?: number;
  /**
   * Firings nobody was there for, since the last one blobot was there for. Absent is none.
   *
   * A missed firing writes no `routine_runs` row, because no firing happened: blobot was not
   * running, so it neither ran the Routine nor decided not to. The count is kept here instead,
   * so that `missed 4 firings` survives the settling that stops the same moment being reported
   * forever, and it goes back to zero the next time a firing is actually decided on.
   *
   * It is deliberately **not** counted by issue 08's disarm rule. A laptop that was shut is the
   * ordinary condition of a laptop, not three failures in a row.
   */
  readonly missedFirings?: number;
  readonly createdAt: number;
}

/**
 * How a firing ended. Three, and the reason is prose for the user rather than an enum for us.
 *
 * - `ran` — a turn started and ended.
 * - `skipped` — no turn started. Nothing reaches the transcript, because nothing happened in the
 *   session.
 * - `stopped` — a turn started and did not finish. A permission expired, or the run budget did.
 *   This one *is* in the transcript, as the `system` line the stop reason already produces.
 */
export type RoutineOutcome = 'ran' | 'skipped' | 'stopped';

export interface RoutineRun {
  readonly id: string;
  readonly routineId: string;
  readonly firedAt: number;
  readonly outcome: RoutineOutcome;
  readonly reason?: string;
  /**
   * When the user looked at this run. Absent is issue 11's unread mark: a Routine whose value is
   * the *message* lands in a pane nobody has a reason to open, so the rail draws that agent's
   * preview line at full ink until it has been seen.
   *
   * Set at the moment the row is written for a run the user pressed `Run now` on, which is the
   * whole of how issue 11's rule that the mark is **never earned by a turn the user started**
   * survives the one firing a person asks for by hand.
   */
  readonly seenAt?: number;
}

/**
 * An agent put itself on a schedule, in this turn.
 *
 * Issue 05's 2026-08-30 amendment made `propose_routine` arm what it writes, and this is the
 * second of the four controls that pay for that: **a person is told, where it happened.** It
 * opens inline in the transcript rather than only appearing on a screen the user would have to
 * go and find, because an agent arming something silently is the version of this feature that
 * must not exist.
 *
 * Words rather than a `Routine`: the block says what it is, what shape it has and what that
 * shape costs, and the renderer must not have to do schedule arithmetic to draw a sentence.
 */
export interface ScheduledRoutine {
  readonly routineId: string;
  /** The agent that scheduled it, which is always the agent it is for. */
  readonly agentId: string;
  readonly name: string;
  /** The schedule in blobot's own words. There is no expression, because there is none to store. */
  readonly schedule: string;
  /** What the shape costs, as a count of firings. A count, never a price. */
  readonly frequency: string;
  readonly at: number;
}
