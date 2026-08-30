/**
 * The fold against a scripted turn, driven by the mock rather than by hand-built items.
 *
 * The unit tests in `model.test.ts` build the item list directly, which proves the grouping and
 * proves nothing about whether a real turn produces that shape. This runs `works-through-a-list`
 * through `MockAgentRuntime` and reduces the events it actually emits, because the first review
 * of the fold in the running app counted three calls where the scenario has six, and no
 * hand-built fixture could have said why.
 */
import { expect, it } from 'vitest';
import { MockAgentRuntime, VirtualClock, scenarios } from '@blobot/core';
import type { AgentEvent } from '@blobot/core/domain';
import { initialState, itemsFor, reduce, rowsOf, toolsIn, type AppState, type Row } from './model.js';

it('folds a whole scripted turn into one block, and leaves the answer under it', async () => {
  const clock = new VirtualClock();
  const runtime = new MockAgentRuntime({
    agentId: 'alice',
    script: scenarios['works-through-a-list'],
    startupMs: 0,
    clock,
  });
  // Off the iterable, not off `onEvent`: a turn's events belong to the stream `sendPrompt`
  // returns, which is the same thing the main process forwards to the renderer.
  const events: AgentEvent[] = [];
  await runtime.start();
  const drained = (async () => {
    for await (const event of runtime.sendPrompt({ text: 'go', from: 'user' })) events.push(event);
  })();
  await clock.runAll();
  await drained;

  let state: AppState = initialState;
  for (const event of events) state = reduce(state, { type: 'event', event });

  const rows = rowsOf(itemsFor(state.items, { kind: 'agent', agentId: 'alice' }));
  const steps = rows.filter((row): row is Extract<Row, { kind: 'steps' }> => row.kind === 'steps');
  expect(steps).toHaveLength(1);
  expect(toolsIn(steps[0]!.items)).toBe(6);
  // And the paragraph the six steps were leading to is a row of its own, under the fold.
  expect(rows.at(-1)).toMatchObject({ kind: 'item', item: { kind: 'agent' } });
});
