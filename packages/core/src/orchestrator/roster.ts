import type { Agent } from './domain.js';

/**
 * Resolve a free-form name to a teammate.
 *
 * Ticket 12 makes `@mention` the human's addressing gesture and ticket 05 makes
 * `message_agent(agent)` the agent's. They are the same rule on two surfaces, so they share
 * this function: the composer's unresolved-mention state is the human-facing twin of the
 * orchestrator's "no such teammate" error.
 */
export function findAgentByName(roster: readonly Agent[], name: string): Agent | undefined {
  const wanted = name.trim().toLowerCase();
  return roster.find(
    (candidate) => candidate.name.toLowerCase() === wanted || candidate.id === name.trim(),
  );
}

/**
 * Which teammates a piece of prose *names*. Lexical, and deliberately nothing more.
 *
 * This is the whole of blobot's reading of an agent's answer: a name is a fact and its absence
 * is a fact, where "did she promise to message him?" is a reading of intent, and blobot
 * provides no inference. See
 * `.scratch/team-addressing/issues/05-mock-a-coordinator-that-forgets-to-route.md`.
 *
 * Word boundaries, case-insensitively, with an optional `@` in front so the composer's gesture
 * and plain prose count the same. A name inside a longer word does not count: `Bobbin` is not
 * Bob.
 */
export function namesMentioned(text: string, roster: readonly Agent[]): Agent[] {
  return roster.filter((candidate) => {
    const name = candidate.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\w@])@?${name}(?![\\w@])`, 'i').test(text);
  });
}
