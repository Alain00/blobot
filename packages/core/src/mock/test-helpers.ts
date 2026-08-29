import type { AgentEvent } from '../events.js';
import type { VirtualClock } from '../clock.js';
import type { Prompt } from '../runtime.js';
import type { MockAgentRuntime } from './mock-agent-runtime.js';

export const userPrompt: Prompt = { text: 'go', from: 'user' };

/** Drain a turn under a virtual clock, so a ninety-second scenario costs no wall time. */
export async function runTurn(
  runtime: MockAgentRuntime,
  clock: VirtualClock,
  prompt: Prompt = userPrompt,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  const drained = (async () => {
    for await (const event of runtime.sendPrompt(prompt)) events.push(event);
  })();
  await clock.runAll();
  await drained;
  return events;
}

/** Start a turn without draining it, so a test can cancel or kill halfway through. */
export function startTurn(
  runtime: MockAgentRuntime,
  prompt: Prompt = userPrompt,
): { events: AgentEvent[]; drained: Promise<void> } {
  const events: AgentEvent[] = [];
  const drained = (async () => {
    for await (const event of runtime.sendPrompt(prompt)) events.push(event);
  })();
  return { events, drained };
}

export function types(events: readonly AgentEvent[]): string[] {
  return events.map((event) => event.type);
}
