import { ROUTINE_NAME_LIMIT } from '../orchestrator/bounds.js';
import { PEER_MESSAGE_LIMIT } from '../orchestrator/bounds.js';
import type { Schedule } from './domain.js';

/**
 * What an agent hands `propose_routine`, turned into a {@link Schedule} or into a sentence
 * saying why not.
 *
 * The schedule is a **closed set of three shapes** and this is where that closure is enforced
 * against a model: there is no expression to parse, no cron string to accept by accident, and
 * anything outside the set is refused at the tool boundary rather than rounded to the nearest
 * thing blobot can do. A Routine blobot invented from a request it did not understand is worse
 * than a refusal the model can read and correct.
 */
export function parseProposedSchedule(input: unknown): { schedule: Schedule } | { error: string } {
  if (typeof input !== 'object' || input === null) {
    return { error: 'schedule must be an object, for example {"every":"day","hour":9,"minute":0}' };
  }
  const raw = input as Record<string, unknown>;
  const every = raw['every'];
  const minute = whole(raw['minute'], 0, 59);
  if (minute === undefined) return { error: 'schedule.minute must be a whole number from 0 to 59' };

  if (every === 'hour') return { schedule: { kind: 'hourly', minute } };

  const hour = whole(raw['hour'], 0, 23);
  if (every === 'day') {
    if (hour === undefined) return { error: 'schedule.hour must be a whole number from 0 to 23' };
    return { schedule: { kind: 'daily', hour, minute } };
  }
  if (every === 'week') {
    if (hour === undefined) return { error: 'schedule.hour must be a whole number from 0 to 23' };
    const weekday = whole(raw['weekday'], 0, 6);
    if (weekday === undefined) {
      return { error: 'schedule.weekday must be a whole number from 0 (Sunday) to 6 (Saturday)' };
    }
    return { schedule: { kind: 'weekly', weekday, hour, minute } };
  }
  return {
    error:
      'schedule.every must be "hour", "day" or "week". blobot offers nothing finer than hourly ' +
      'and takes no schedule expressions.',
  };
}

/** The name and the prompt, refused rather than truncated, the way a peer message already is. */
export function checkProposalText(name: string, prompt: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed === '') return 'A Routine needs a name: a few words a person will read in a list.';
  if (trimmed.length > ROUTINE_NAME_LIMIT) {
    return `That name is ${trimmed.length} characters. A name is a label on a row, under ${ROUTINE_NAME_LIMIT}; the instruction goes in the prompt.`;
  }
  if (prompt.trim() === '') return 'A Routine needs a prompt: what you would be asked to do.';
  if (prompt.length > PEER_MESSAGE_LIMIT) {
    return `That prompt is ${prompt.length} characters, over the ${PEER_MESSAGE_LIMIT} blobot injects on a schedule. Say the short version.`;
  }
  return undefined;
}

function whole(value: unknown, low: number, high: number): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined;
  return value < low || value > high ? undefined : value;
}
