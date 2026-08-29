import { describe, expect, it } from 'vitest';
import { VirtualClock } from './clock.js';
import type { AgentEvent } from './events.js';
import { MockAgentRuntime } from './mock/mock-agent-runtime.js';
import type { Scenario } from './mock/scenario.js';
import { scenarios } from './mock/scenarios/index.js';
import { runTurn, startTurn } from './mock/test-helpers.js';
import { AgentStatusTracker, type AgentStatus } from './status.js';

const identity = { agentId: 'bob', sessionId: 'session_bob', at: 0 } as const;

/**
 * Headless status testing, which falls out free once status is a pure fold: play a checked-in
 * scenario through the mock and record the statuses a watcher would have seen.
 */
async function timeline(
  scenario: Scenario,
  options: { cancelAfterMs?: number } = {},
): Promise<{ seen: AgentStatus[]; tracker: AgentStatusTracker }> {
  const clock = new VirtualClock();
  const runtime = new MockAgentRuntime({
    agentId: 'bob',
    clock,
    startupMs: 0,
    script: scenario,
    peerMessageHandler: async (call) => ({
      delivered: true,
      recipient: call.agent,
      status: 'started',
    }),
  });
  const tracker = new AgentStatusTracker('bob');
  const seen: AgentStatus[] = [];
  tracker.onChange((status) => seen.push(status));

  runtime.onLifecycleChange((lifecycle) => tracker.lifecycleChanged(lifecycle));
  await runtime.start();

  let events: AgentEvent[];
  if (options.cancelAfterMs === undefined) {
    tracker.turnStarted();
    events = await runTurn(runtime, clock);
  } else {
    tracker.turnStarted();
    const turn = startTurn(runtime);
    await clock.advance(options.cancelAfterMs);
    await runtime.cancel();
    await clock.runAll();
    await turn.drained;
    events = turn.events;
  }
  for (const event of events) tracker.apply(event);
  return { seen, tracker };
}

describe('the status a watcher sees', () => {
  it('walks a real scenario, tool calls included, and lands back on idle', async () => {
    const { seen, tracker } = await timeline(scenarios['alice-asks-bob']);
    // Note the second `working`: sending Bob a message is an MCP tool call like any other,
    // and `thinking` after each tool is the gap before the next thing is said.
    expect(seen).toEqual([
      'starting',
      'idle',
      'thinking',
      'working',
      'thinking',
      'responding',
      'working',
      'thinking',
      'responding',
      'idle',
    ]);
    expect(tracker.status).toBe('idle');
  });

  it('is thinking, not idle, through ninety seconds of silence', async () => {
    const tracker = new AgentStatusTracker('bob');
    tracker.turnStarted();
    // No events have arrived at all. `idle` would be a lie for a minute and a half.
    expect(tracker.status).toBe('thinking');
  });

  it('comes back idle after a cancel — that was the user pressing stop', async () => {
    const { tracker } = await timeline(scenarios['long-running-tool'], { cancelAfterMs: 1_000 });
    expect(tracker.status).toBe('idle');
  });

  it('comes back idle after a refusal — the agent is alive and answerable', async () => {
    const { tracker } = await timeline(scenarios.refuses);
    expect(tracker.status).toBe('idle');
  });

  it('is failed and sticky when the process dies', async () => {
    const { tracker } = await timeline(scenarios['runtime-dies-midturn']);
    expect(tracker.status).toBe('failed');
    expect(tracker.failure).toContain('SIGKILL');

    // Nothing in the event stream clears it: only a restart does.
    tracker.apply({ type: 'turn_ended', turnId: 'turn_2', stopReason: 'end_turn', ...identity });
    expect(tracker.status).toBe('failed');
  });

  it('is failed after a fatal mid-turn error, even with the process still up', async () => {
    const { tracker } = await timeline(scenarios['bob-fails-midturn']);
    expect(tracker.status).toBe('failed');
  });
});

describe('precedence', () => {
  const tracker = (): AgentStatusTracker => {
    const next = new AgentStatusTracker('bob');
    next.turnStarted();
    return next;
  };

  it('puts working above responding while both signals are live', () => {
    const status = tracker();
    status.apply({ type: 'agent_message_delta', messageId: 'm1', text: 'on it', ...identity });
    expect(status.status).toBe('responding');

    status.apply({
      type: 'tool_call_started',
      toolCallId: 'call_1',
      title: 'bash',
      kind: 'execute',
      ...identity,
    });
    status.apply({ type: 'agent_message_delta', messageId: 'm1', text: ' — running', ...identity });
    expect(status.status).toBe('working');

    status.apply({
      type: 'tool_call_updated',
      toolCallId: 'call_1',
      status: 'completed',
      ...identity,
    });
    expect(status.status).toBe('responding');
  });

  it('puts waiting above everything but failure', () => {
    const status = tracker();
    status.apply({
      type: 'tool_call_started',
      toolCallId: 'call_1',
      title: 'bash',
      kind: 'execute',
      ...identity,
    });
    expect(status.status).toBe('working');

    status.permissionRequested();
    expect(status.status).toBe('waiting');

    status.permissionResolved();
    expect(status.status).toBe('working');
  });

  it('keeps working while one of two tools is still in flight', () => {
    const status = tracker();
    for (const toolCallId of ['call_1', 'call_2']) {
      status.apply({
        type: 'tool_call_started',
        toolCallId,
        title: 'bash',
        kind: 'execute',
        ...identity,
      });
    }
    status.apply({
      type: 'tool_call_updated',
      toolCallId: 'call_1',
      status: 'completed',
      ...identity,
    });
    // Tools interleave; a serial timeline would report idle-ish here.
    expect(status.status).toBe('working');
  });

  it('ignores usage and peer-message events', () => {
    const status = tracker();
    status.apply({ type: 'usage_updated', used: 4_200, size: 200_000, ...identity });
    status.apply({ type: 'agent_message_sent', to: 'Alice', message: 'done', ...identity });
    expect(status.status).toBe('thinking');
  });
});

describe('across a relaunch', () => {
  it('starts idle, because nothing is running', () => {
    expect(new AgentStatusTracker('bob').status).toBe('idle');
  });

  it('is failed when reconcile finds the AgentWorkspace gone', () => {
    const status = new AgentStatusTracker('bob');
    status.markFailed('the worktree at .agents/bob is missing its branch');
    expect(status.status).toBe('failed');
    expect(status.failure).toContain('missing its branch');
  });

  it('clears a failure when the runtime restarts', () => {
    const status = new AgentStatusTracker('bob');
    status.markFailed('process died');
    status.lifecycleChanged('starting');
    expect(status.status).toBe('starting');
    status.lifecycleChanged('ready');
    expect(status.status).toBe('idle');
    expect(status.failure).toBeUndefined();
  });
});
