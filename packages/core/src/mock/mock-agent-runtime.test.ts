import { describe, expect, it, vi } from 'vitest';
import { VirtualClock } from '../clock.js';
import type { AgentEvent, ToolCallUpdated, TurnEnded, UsageUpdated } from '../events.js';
import type { PeerMessageCall } from '../runtime.js';
import { MockAgentRuntime } from './mock-agent-runtime.js';
import { scenario } from './scenario.js';
import { scenarios } from './scenarios/index.js';
import { runTurn, startTurn, types, userPrompt } from './test-helpers.js';

function make(
  options: Partial<ConstructorParameters<typeof MockAgentRuntime>[0]> & {
    script: ConstructorParameters<typeof MockAgentRuntime>[0]['script'];
  },
): { runtime: MockAgentRuntime; clock: VirtualClock } {
  const clock = new VirtualClock();
  const runtime = new MockAgentRuntime({
    agentId: 'alice',
    clock,
    startupMs: 0,
    ...options,
  });
  return { runtime, clock };
}

function last<T>(items: readonly T[]): T {
  const item = items[items.length - 1];
  if (item === undefined) throw new Error('expected a last item');
  return item;
}

describe('lifecycle', () => {
  it('reports starting, then ready', async () => {
    const clock = new VirtualClock();
    const runtime = new MockAgentRuntime({
      agentId: 'alice',
      clock,
      startupMs: 400,
      script: scenarios['alice-asks-bob'],
    });
    const seen: string[] = [];
    runtime.onLifecycleChange((lifecycle) => seen.push(lifecycle));

    const started = runtime.start();
    expect(runtime.lifecycle).toBe('starting');
    await clock.runAll();
    await started;

    expect(runtime.lifecycle).toBe('ready');
    expect(seen).toEqual(['starting', 'ready']);
  });

  it('fails to spawn, loudly', async () => {
    const { runtime, clock } = make({
      script: scenarios['alice-asks-bob'],
      spawnFailure: 'opencode: command not found',
    });
    // Attach the expectation before advancing, or the rejection lands unhandled.
    const started = expect(runtime.start()).rejects.toThrow('opencode: command not found');
    await clock.runAll();
    await started;
    expect(runtime.lifecycle).toBe('dead');
    expect(() => runtime.sendPrompt(userPrompt)).toThrow(/cannot prompt/);
  });

  it('refuses a second prompt while a turn is in flight', async () => {
    const { runtime, clock } = make({ script: scenarios['long-running-tool'] });
    await runtime.start();
    const { drained } = startTurn(runtime);

    expect(() => runtime.sendPrompt(userPrompt)).toThrow(/already in flight/);

    await clock.runAll();
    await drained;
  });
});

describe('the event vocabulary', () => {
  it('emits a whole turn for alice-asks-bob, ending with turn_ended', async () => {
    const { runtime, clock } = make({
      script: scenarios['alice-asks-bob'],
      peerMessageHandler: async (call) => ({
        delivered: true,
        recipient: call.agent,
        status: 'started',
      }),
    });
    await runtime.start();
    const events = await runTurn(runtime, clock);

    expect(new Set(types(events))).toEqual(
      new Set([
        'agent_thought_delta',
        'agent_message_delta',
        'agent_message_completed',
        'tool_call_started',
        'tool_call_updated',
        'usage_updated',
        'turn_ended',
      ]),
    );
    const ended = last(events) as TurnEnded;
    expect(ended.type).toBe('turn_ended');
    expect(ended.stopReason).toBe('end_turn');
  });

  it('never emits agent_message_sent — that belongs to the orchestrator', async () => {
    const { runtime, clock } = make({
      script: scenarios['alice-asks-bob'],
      peerMessageHandler: async (call) => ({
        delivered: true,
        recipient: call.agent,
        status: 'started',
      }),
    });
    await runtime.start();
    const events = await runTurn(runtime, clock);
    expect(types(events)).not.toContain('agent_message_sent');
  });

  it('stamps every event with agent and session identity', async () => {
    const { runtime, clock } = make({ script: scenario('t').say('hi').end() });
    await runtime.start();
    const events = await runTurn(runtime, clock);
    for (const event of events) {
      expect(event.agentId).toBe('alice');
      expect(event.sessionId).toBe('session_alice');
      expect(typeof event.at).toBe('number');
    }
  });

  it('shares one messageId between thinking and answer', async () => {
    const { runtime, clock } = make({ script: scenario('t').think('mm').say('hi').end() });
    await runtime.start();
    const events = await runTurn(runtime, clock);

    const thought = events.find((event) => event.type === 'agent_thought_delta');
    const answer = events.find((event) => event.type === 'agent_message_delta');
    expect(thought).toBeDefined();
    expect(answer).toBeDefined();
    // The trap: a thinking pane keyed on messageId would swallow the answer.
    expect((thought as { messageId: string }).messageId).toBe(
      (answer as { messageId: string }).messageId,
    );
  });

  it('ends a refusal as a stop reason, not as an error', async () => {
    const { runtime, clock } = make({ script: scenarios.refuses });
    await runtime.start();
    const events = await runTurn(runtime, clock);

    expect(types(events)).not.toContain('error');
    expect((last(events) as TurnEnded).stopReason).toBe('refusal');
    expect(runtime.lifecycle).toBe('ready');
  });
});

describe('the traps it reproduces on purpose', () => {
  it('delivers deltas ragged: bursts in one millisecond, then a gap', async () => {
    const { runtime, clock } = make({
      script: scenario('t').say('one two three four five six seven').end(),
    });
    await runtime.start();
    const events = await runTurn(runtime, clock);

    const deltas = events.filter((event) => event.type === 'agent_message_delta');
    expect(deltas.length).toBeGreaterThan(4);
    const stamps = deltas.map((event) => event.at);
    const gaps = stamps.slice(1).map((at, index) => at - (stamps[index] as number));
    expect(gaps.filter((gap) => gap === 0).length).toBeGreaterThan(0);
    expect(Math.max(...gaps)).toBeGreaterThanOrEqual(100);
  });

  it('reports a cancelled tool as completed, with exit null', async () => {
    const { runtime, clock } = make({ script: scenarios['long-running-tool'] });
    await runtime.start();
    const { events, drained } = startTurn(runtime);

    await clock.advance(1_000); // inside the 30s build
    await runtime.cancel();
    await clock.runAll();
    await drained;

    const terminal = last(
      events.filter((event): event is ToolCallUpdated => event.type === 'tool_call_updated'),
    );
    expect(terminal.status).toBe('completed');
    // The only signal that "completed" is a lie. Never infer success from status.
    expect(terminal.exit).toBeNull();
    expect(terminal.output).toContain('User aborted the command');
  });

  it('resets the context gauge to 0 on cancel', async () => {
    const { runtime, clock } = make({ script: scenarios['long-running-tool'] });
    await runtime.start();
    const { events, drained } = startTurn(runtime);

    await clock.advance(1_000);
    await runtime.cancel();
    await clock.runAll();
    await drained;

    const usage = last(
      events.filter((event): event is UsageUpdated => event.type === 'usage_updated'),
    );
    expect(usage.used).toBe(0);
    expect((last(events) as TurnEnded).stopReason).toBe('cancelled');
  });

  it('continues the turn after a tool fails', async () => {
    const { runtime, clock } = make({ script: scenarios['tool-failure-continues'] });
    await runtime.start();
    const events = await runTurn(runtime, clock);

    const failed = events.filter(
      (event): event is ToolCallUpdated =>
        event.type === 'tool_call_updated' && event.status === 'failed',
    );
    expect(failed).toHaveLength(1);
    // A failed tool is not an `error`, and the agent kept talking afterwards.
    expect(types(events)).not.toContain('error');
    expect((last(events) as TurnEnded).stopReason).toBe('end_turn');
    const spoken = events.filter((event) => event.type === 'agent_message_delta');
    expect(spoken.length).toBeGreaterThan(0);
  });

  it('lands a cancellation late, after more events have already arrived', async () => {
    const { runtime, clock } = make({
      script: scenarios['long-running-tool'],
      cancelLatencyMs: 5_000,
    });
    await runtime.start();
    const { events, drained } = startTurn(runtime);

    await clock.advance(1_000);
    await runtime.cancel();
    const beforeLanding = events.length;
    await clock.advance(2_000);
    expect(events.length).toBe(beforeLanding); // the tool is still running
    await clock.runAll();
    await drained;

    expect((last(events) as TurnEnded).stopReason).toBe('cancelled');
  });

  it('says nothing at all for ninety seconds', async () => {
    const { runtime, clock } = make({ script: scenarios['slow-to-first-token'] });
    await runtime.start();
    const { events, drained } = startTurn(runtime);

    await clock.advance(89_000);
    expect(events).toHaveLength(0);
    await clock.runAll();
    await drained;

    expect(types(events)).toContain('agent_thought_delta');
    expect((last(events) as TurnEnded).stopReason).toBe('end_turn');
  });

  it('errors halfway without a turn_ended, and stays answerable', async () => {
    const { runtime, clock } = make({ script: scenarios['bob-fails-midturn'] });
    await runtime.start();
    const events = await runTurn(runtime, clock);

    expect(types(events)).toContain('error');
    // The RPC never replied, so there is no stop reason to synthesize.
    expect(types(events)).not.toContain('turn_ended');
    // The partial transcript survives: the error is an event, not a rejection.
    expect(types(events)).toContain('agent_message_completed');
    expect(runtime.lifecycle).toBe('ready');
  });

  it('dies mid-turn and stays dead', async () => {
    const { runtime, clock } = make({ script: scenarios['runtime-dies-midturn'] });
    await runtime.start();
    const events = await runTurn(runtime, clock);

    expect(last(events).type).toBe('error');
    expect(runtime.lifecycle).toBe('dead');
    expect(() => runtime.sendPrompt(userPrompt)).toThrow(/cannot prompt/);
  });

  it('dies between turns, out of band', async () => {
    const { runtime, clock } = make({ script: scenario('t').say('done').end() });
    await runtime.start();
    await runTurn(runtime, clock);

    const outOfBand: AgentEvent[] = [];
    runtime.onEvent((event) => outOfBand.push(event));
    runtime.killProcess();

    expect(outOfBand).toHaveLength(1);
    expect(outOfBand[0]?.type).toBe('error');
    expect(runtime.lifecycle).toBe('dead');
  });
});

describe('peer messages', () => {
  it('calls the orchestrator handler directly, with context and an idempotency key', async () => {
    const calls: PeerMessageCall[] = [];
    const { runtime, clock } = make({
      script: scenarios['alice-asks-bob'],
      peerMessageHandler: async (call) => {
        calls.push(call);
        return { delivered: true, recipient: call.agent, status: 'queued' };
      },
    });
    await runtime.start();
    const events = await runTurn(runtime, clock);

    expect(calls).toHaveLength(1);
    const call = calls[0] as PeerMessageCall;
    expect(call.from).toBe('alice');
    expect(call.agent).toBe('Bob');
    expect(call.context).toContain('committed on blobot/demo/alice');
    expect(call.idempotencyKey).toMatch(/^alice:turn_1:call_/);

    const ack = events.find(
      (event): event is ToolCallUpdated =>
        event.type === 'tool_call_updated' &&
        event.status === 'completed' &&
        event.output?.includes('"delivered"') === true,
    );
    expect(ack?.output).toContain('"status":"queued"');
  });

  it('turns a rejected peer message into a tool failure, not a dead turn', async () => {
    const { runtime, clock } = make({
      script: scenarios['alice-asks-bob'],
      peerMessageHandler: vi
        .fn()
        .mockRejectedValue(new Error("no agent named 'Bob' on this team; try: Reviewer")),
    });
    await runtime.start();
    const events = await runTurn(runtime, clock);

    const failed = events.find(
      (event): event is ToolCallUpdated =>
        event.type === 'tool_call_updated' && event.status === 'failed',
    );
    expect(failed?.error).toContain('no agent named');
    expect((last(events) as TurnEnded).stopReason).toBe('end_turn');
  });

  it('fails the tool when no handler is attached', async () => {
    const { runtime, clock } = make({ script: scenarios['alice-asks-bob'] });
    await runtime.start();
    const events = await runTurn(runtime, clock);

    const failed = events.find(
      (event): event is ToolCallUpdated =>
        event.type === 'tool_call_updated' && event.status === 'failed',
    );
    expect(failed?.error).toContain('no message_agent handler');
  });
});

describe('driving it by hand', () => {
  it('injects an event into a running turn — the dev control panel', async () => {
    const { runtime, clock } = make({ script: scenarios['long-running-tool'] });
    await runtime.start();
    const { events, drained } = startTurn(runtime);

    await clock.advance(500);
    runtime.pushEvent({
      type: 'tool_call_updated',
      toolCallId: 'call_by_hand',
      status: 'failed',
      error: 'pushed from the control panel',
    });
    await clock.runAll();
    await drained;

    expect(
      events.some(
        (event) => event.type === 'tool_call_updated' && event.toolCallId === 'call_by_hand',
      ),
    ).toBe(true);
  });

  it('plays a scenario per turn, repeating the last', async () => {
    const { runtime, clock } = make({
      script: [scenario('first').say('one').end(), scenario('second').say('two').end()],
    });
    await runtime.start();

    const one = await runTurn(runtime, clock);
    const two = await runTurn(runtime, clock);
    const three = await runTurn(runtime, clock);

    const said = (events: AgentEvent[]): string | undefined =>
      events.find((event) => event.type === 'agent_message_completed')?.text;
    expect(said(one)).toBe('one');
    expect(said(two)).toBe('two');
    expect(said(three)).toBe('two');
  });
});
