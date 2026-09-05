/**
 * A batch of calls in flight at the same time.
 *
 * Until this existed the player was a `for…await` over the steps and every scenario in the
 * repo was a queue, so the one shape a real turn has that a queue does not — several calls
 * open at once, returning in whatever order their durations put them — had never been through
 * the event stream, let alone through the transcript that reduces it.
 * `.scratch/live-steps/issues/02`.
 */
import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../clock.js';
import type { AgentEvent } from '../events.js';
import { MockAgentRuntime } from './mock-agent-runtime.js';
import { scenario, tool } from './scenario.js';
import { scenarios } from './scenarios/index.js';
import { runTurn } from './test-helpers.js';

const batch = scenario('batch')
  .parallel([
    tool('read a.ts', 'read', { durationMs: 300, outcome: { status: 'completed', exit: 0 } }),
    tool('read b.ts', 'read', { durationMs: 100, outcome: { status: 'completed', exit: 0 } }),
    tool('read c.ts', 'read', { durationMs: 200, outcome: { status: 'failed', error: 'ENOENT' } }),
  ])
  .say('Read them.')
  .end();

async function play(script: typeof batch): Promise<AgentEvent[]> {
  const clock = new VirtualClock();
  const runtime = new MockAgentRuntime({ agentId: 'alice', clock, startupMs: 0, script });
  await runtime.start();
  return runTurn(runtime, clock);
}

/** Every call is open before any of them returns, which is what makes it a batch. */
it('starts every call before the first one finishes', async () => {
  const events = await play(batch);
  const firstTerminal = events.findIndex(
    (event) =>
      event.type === 'tool_call_updated' &&
      (event.status === 'completed' || event.status === 'failed'),
  );
  const startsBefore = events
    .slice(0, firstTerminal)
    .filter((event) => event.type === 'tool_call_started');
  expect(startsBefore).toHaveLength(3);
});

/**
 * The trap the batch exists for. Started a, b, c and they return b, c, a — so anything that
 * reads completion order as call order is wrong here and was right in every serial scenario
 * this repo had.
 */
it('finishes them out of the order they were called in', async () => {
  const events = await play(batch);
  const started = events
    .filter((event): event is Extract<AgentEvent, { type: 'tool_call_started' }> =>
      event.type === 'tool_call_started',
    )
    .map((event) => event.toolCallId);
  const finished = events
    .filter(
      (event): event is Extract<AgentEvent, { type: 'tool_call_updated' }> =>
        event.type === 'tool_call_updated' &&
        (event.status === 'completed' || event.status === 'failed'),
    )
    .map((event) => event.toolCallId);

  expect(finished).toHaveLength(3);
  expect(new Set(finished)).toEqual(new Set(started));
  expect(finished).not.toEqual(started);
  // b (100ms), c (200ms), a (300ms).
  expect(finished).toEqual([started[1], started[2], started[0]]);
});

/** A failure inside a batch is still a failure the turn survives. */
it('lets one call in a batch fail without ending the turn', async () => {
  const events = await play(batch);
  expect(
    events.filter((event) => event.type === 'tool_call_updated' && event.status === 'failed'),
  ).toHaveLength(1);
  expect(events.at(-1)).toMatchObject({ type: 'turn_ended', stopReason: 'end_turn' });
});

describe('the checked-in scenario', () => {
  it('puts three reads in flight at once', async () => {
    const events = await play(scenarios['works-through-a-list'] as typeof batch);
    // The first three starts are the opening batch, and none of them has returned yet.
    const firstTerminal = events.findIndex(
      (event) =>
        event.type === 'tool_call_updated' &&
        (event.status === 'completed' || event.status === 'failed'),
    );
    const open = events
      .slice(0, firstTerminal)
      .filter((event): event is Extract<AgentEvent, { type: 'tool_call_started' }> =>
        event.type === 'tool_call_started',
      );
    expect(open.map((event) => event.title)).toEqual([
      'ls src/scene',
      'read src/scene/Desk.tsx',
      'read src/scene/objects.tsx',
    ]);
  });
});
