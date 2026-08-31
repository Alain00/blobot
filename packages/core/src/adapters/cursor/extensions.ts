/**
 * Cursor's ACP extension methods.
 *
 * Two of them block the turn: a client that stays silent leaves the agent waiting forever,
 * and the transcript would show an agent that simply stopped. Ticket 14 already answered
 * the same hazard for permission requests — with nobody listening, cancel, never allow —
 * and that is the answer here too.
 *
 * `cursor/ask_question` is a genuine question to the user, which this product has an opinion
 * about. Rendering it as a Cursor-shaped widget would be provider-specific UI, which the
 * permanent rule forbids. A provider-agnostic block (*blobot asks a question*) is a later
 * effort, raised if the refusal turns out to be common. Until then the agent is told no
 * user is available and decides with what it has.
 *
 * `cursor/create_plan` must not become an approved plan. blobot never approves a plan silently.
 *
 * An unknown blocking `cursor/*` method is left to JSON-RPC `method not found`, so a future
 * release adding a sixth method degrades into a visible refusal instead of a hang. The three
 * notification methods are free to ignore.
 */

export const ASK_QUESTION_METHOD = 'cursor/ask_question';
export const CREATE_PLAN_METHOD = 'cursor/create_plan';

export const BLOCKING_CURSOR_METHODS = [ASK_QUESTION_METHOD, CREATE_PLAN_METHOD] as const;

export function askQuestionRefusal(): { outcome: { outcome: 'skipped'; reason: string } } {
  return {
    outcome: {
      outcome: 'skipped',
      reason: 'no user is available; continue with what you have',
    },
  };
}

export function createPlanRefusal(): { outcome: { outcome: 'rejected'; reason: string } } {
  return {
    outcome: {
      outcome: 'rejected',
      reason: 'blobot never approves a plan silently',
    },
  };
}
