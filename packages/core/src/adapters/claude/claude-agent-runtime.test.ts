import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../events.js';
import type { RuntimeLifecycle } from '../../runtime.js';
import { ClaudeAgentRuntime } from './claude-agent-runtime.js';
import { FakeBridge } from './fake-bridge.js';

/**
 * The contract every runtime owes the orchestrator, asserted against the wire.
 *
 * These are the behaviours `MockAgentRuntime`'s own tests pin — ragged deltas concatenating,
 * a cancelled tool reporting `completed`, a tool failure that does not end the turn,
 * `turn_ended` synthesized from the RPC reply — because a runtime that only satisfies the
 * type is not a runtime the UI survives.
 */

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

interface Started {
  readonly runtime: ClaudeAgentRuntime;
  readonly bridge: FakeBridge;
  readonly lifecycles: RuntimeLifecycle[];
  readonly outOfBand: AgentEvent[];
}

async function started(options: ConstructorParameters<typeof FakeBridge>[0] = {}): Promise<Started> {
  const bridge = new FakeBridge(options);
  const runtime = new ClaudeAgentRuntime({
    agentId: 'bob',
    cwd: '/tmp/blobot/bob',
    persona: 'You are Bob.',
    claudeExecutable: '/usr/bin/true',
    spawn: () => bridge,
  });
  const lifecycles: RuntimeLifecycle[] = [];
  const outOfBand: AgentEvent[] = [];
  runtime.onLifecycleChange((lifecycle) => lifecycles.push(lifecycle));
  runtime.onEvent((event) => outOfBand.push(event));
  await runtime.start();
  return { runtime, bridge, lifecycles, outOfBand };
}

/** Consume a turn in the background, the way the orchestrator does. */
function consume(iterable: AsyncIterable<AgentEvent>): { events: AgentEvent[]; done: Promise<void> } {
  const events: AgentEvent[] = [];
  const done = (async () => {
    for await (const event of iterable) events.push(event);
  })();
  return { events, done };
}

describe('starting', () => {
  it('initializes, creates a session and forces the default permission mode', async () => {
    const { runtime, bridge, lifecycles } = await started();

    expect(lifecycles).toEqual(['starting', 'ready']);
    expect(runtime.sessionId).toBe('session_fake');
    const methods = bridge.received.map((message) => message.method);
    expect(methods).toEqual(['initialize', 'session/new', 'session/set_mode']);

    const setMode = bridge.received[2]?.params as { modeId: string };
    // Never `auto`: a classifier we do not control must not make safety decisions for an
    // unattended teammate. Ticket 14.
    expect(setMode.modeId).toBe('default');
    expect(runtime.permissionMode).toBe('default');
  });

  it('injects the persona and the workspace through the session, not the prompt', async () => {
    const { bridge } = await started();
    const newSession = bridge.received[1]?.params as {
      cwd: string;
      _meta: { systemPrompt: string };
    };
    expect(newSession.cwd).toBe('/tmp/blobot/bob');
    expect(newSession._meta.systemPrompt).toBe('You are Bob.');
  });

  it('fails loudly on a bridge version it was not written against', async () => {
    const bridge = new FakeBridge({ version: '0.71.0' });
    const runtime = new ClaudeAgentRuntime({
      agentId: 'bob',
      cwd: '/tmp/blobot/bob',
      spawn: () => bridge,
    });
    await expect(runtime.start()).rejects.toThrow(/reports version 0\.71\.0.*pins 0\.70\.0/s);
    expect(runtime.lifecycle).toBe('dead');
  });

  it('tells the user how to log in rather than touching a credential', async () => {
    const bridge = new FakeBridge({
      authMethods: [
        {
          id: 'claude-ai-login',
          _meta: { terminal: { command: 'claude-agent-acp --cli auth login --claudeai' } },
        },
      ],
    });
    const runtime = new ClaudeAgentRuntime({ agentId: 'bob', cwd: '/tmp', spawn: () => bridge });
    await expect(runtime.start()).rejects.toThrow(/claude-agent-acp --cli auth login --claudeai/);
  });
});

describe('a turn', () => {
  it('assembles ragged deltas and ends on the RPC reply', async () => {
    const { runtime, bridge } = await started();
    const { events, done } = consume(runtime.sendPrompt({ text: 'ping', from: 'user' }));
    await tick();

    for (const text of ['P', 'ONG', '!']) {
      bridge.update({
        sessionUpdate: 'agent_message_chunk',
        messageId: 'msg_1',
        content: { type: 'text', text },
      });
    }
    bridge.update({ sessionUpdate: 'usage_update', used: 36785, size: 1_000_000 });
    bridge.endTurn('end_turn');
    await done;

    expect(events.map((event) => event.type)).toEqual([
      'agent_message_delta',
      'agent_message_delta',
      'agent_message_delta',
      'usage_updated',
      'agent_message_completed',
      'turn_ended',
    ]);
    expect(events.find((event) => event.type === 'agent_message_completed')).toMatchObject({
      text: 'PONG!',
    });
    expect(events.at(-1)).toMatchObject({ type: 'turn_ended', stopReason: 'end_turn' });
  });

  it('stamps every event with agent and session identity', async () => {
    const { runtime, bridge } = await started();
    const { events, done } = consume(runtime.sendPrompt({ text: 'ping', from: 'user' }));
    await tick();
    bridge.update({
      sessionUpdate: 'agent_message_chunk',
      messageId: 'msg_1',
      content: { type: 'text', text: 'hi' },
    });
    bridge.endTurn('end_turn');
    await done;

    for (const event of events) {
      expect(event.agentId).toBe('bob');
      expect(event.sessionId).toBe('session_fake');
      expect(typeof event.at).toBe('number');
    }
  });

  it('refuses a second prompt while a turn is in flight', async () => {
    const { runtime, bridge } = await started();
    const first = consume(runtime.sendPrompt({ text: 'one', from: 'user' }));
    await tick();
    expect(() => runtime.sendPrompt({ text: 'two', from: 'user' })).toThrow(/already in flight/);
    bridge.endTurn('end_turn');
    await first.done;
  });

  it('surfaces a refusal as a stop reason, not as an error', async () => {
    const { runtime, bridge } = await started();
    const { events, done } = consume(runtime.sendPrompt({ text: 'no', from: 'user' }));
    await tick();
    bridge.endTurn('refusal');
    await done;
    expect(events).toEqual([expect.objectContaining({ type: 'turn_ended', stopReason: 'refusal' })]);
  });

  it('continues the turn after a tool fails', async () => {
    const { runtime, bridge } = await started();
    const { events, done } = consume(runtime.sendPrompt({ text: 'read it', from: 'user' }));
    await tick();
    bridge.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'toolu_1',
      status: 'pending',
      title: 'Read(missing.ts)',
      kind: 'read',
    });
    bridge.update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'toolu_1',
      status: 'failed',
      content: [{ type: 'content', content: { type: 'text', text: 'ENOENT' } }],
    });
    bridge.update({
      sessionUpdate: 'agent_message_chunk',
      messageId: 'msg_2',
      content: { type: 'text', text: 'That file is gone.' },
    });
    bridge.endTurn('end_turn');
    await done;

    expect(events.some((event) => event.type === 'error')).toBe(false);
    expect(events.map((event) => event.type)).toContain('agent_message_delta');
    expect(events.at(-1)).toMatchObject({ stopReason: 'end_turn' });
  });

  it('reports a cancelled tool as completed — never infer success from status', async () => {
    const { runtime, bridge } = await started();
    const { events, done } = consume(runtime.sendPrompt({ text: 'sleep 60', from: 'user' }));
    await tick();
    bridge.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'toolu_2',
      status: 'pending',
      title: 'Bash(sleep 60)',
      kind: 'execute',
    });
    await runtime.cancel();
    expect(bridge.cancelled).toBe(true);
    bridge.update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'toolu_2',
      status: 'completed',
      content: [{ type: 'content', content: { type: 'text', text: 'User aborted the command' } }],
    });
    bridge.endTurn('cancelled');
    await done;

    const tool = events.find((event) => event.type === 'tool_call_updated');
    expect(tool).toMatchObject({ status: 'completed', output: 'User aborted the command' });
    expect(events.at(-1)).toMatchObject({ type: 'turn_ended', stopReason: 'cancelled' });
    // Cancelling a turn does not kill the process: the session stays usable.
    expect(runtime.lifecycle).toBe('ready');
  });
});

describe('when things break', () => {
  it('emits a fatal error with no turn_ended when the prompt RPC fails', async () => {
    const { runtime, bridge } = await started();
    const { events, done } = consume(runtime.sendPrompt({ text: 'hi', from: 'user' }));
    await tick();
    bridge.failPrompt('Session ended');
    await done;

    expect(events).toEqual([
      expect.objectContaining({ type: 'error', message: 'Session ended', fatal: true }),
    ]);
    expect(events.some((event) => event.type === 'turn_ended')).toBe(false);
  });

  it('dies mid-turn into the turn, and stays dead', async () => {
    const { runtime, bridge, lifecycles } = await started();
    const { events, done } = consume(runtime.sendPrompt({ text: 'hi', from: 'user' }));
    await tick();
    bridge.crash();
    await done;

    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'process_died', fatal: true });
    expect(runtime.lifecycle).toBe('dead');
    expect(lifecycles).toEqual(['starting', 'ready', 'dead']);
  });

  it('dies between turns, out of band', async () => {
    const { runtime, bridge, outOfBand } = await started();
    bridge.crash('the bridge process exited with code 1');
    await tick();

    expect(outOfBand).toEqual([
      expect.objectContaining({
        type: 'error',
        message: 'the bridge process exited with code 1',
        fatal: true,
      }),
    ]);
    expect(runtime.lifecycle).toBe('dead');
  });
});

describe('permission requests', () => {
  it('answers from the handler, and does not cross-wire the agent id space', async () => {
    const { runtime, bridge } = await started();
    const seen: string[] = [];
    runtime.setPermissionHandler(async (request) => {
      seen.push(request.title);
      return request.options.find((option) => option.kind === 'allow_once')?.optionId ?? null;
    });

    const { done } = consume(runtime.sendPrompt({ text: 'rm it', from: 'user' }));
    await tick();
    // Id 0, from the bridge's own space — the id our first request also used.
    const reply = await bridge.requestPermission({
      sessionId: bridge.sessionId,
      toolCall: { toolCallId: 'toolu_3', title: 'Bash(rm -rf build)' },
      options: [
        { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
      ],
    });

    expect(seen).toEqual(['Bash(rm -rf build)']);
    expect(reply.result).toEqual({ outcome: { outcome: 'selected', optionId: 'allow' } });
    expect(bridge.promptInFlight).toBe(true);
    bridge.endTurn('end_turn');
    await done;
  });

  it('cancels the request when the handler declines to answer', async () => {
    const { runtime, bridge } = await started();
    runtime.setPermissionHandler(async () => null);
    const reply = await bridge.requestPermission({
      toolCall: { toolCallId: 'toolu_4', title: 'Bash(curl example.com)' },
      options: [{ optionId: 'allow', name: 'Allow once', kind: 'allow_once' }],
    });
    expect(reply.result).toEqual({ outcome: { outcome: 'cancelled' } });
  });

  it('approves nothing when no handler is attached', async () => {
    const { bridge } = await started();
    const reply = await bridge.requestPermission({
      toolCall: { toolCallId: 'toolu_5', title: 'Bash(sudo rm)' },
      options: [{ optionId: 'allow', name: 'Allow once', kind: 'allow_once' }],
    });
    expect(reply.result).toEqual({ outcome: { outcome: 'cancelled' } });
  });
});

describe('stopping', () => {
  it('closes the connection and reports stopped, not dead', async () => {
    const { runtime, lifecycles } = await started();
    await runtime.stop();
    expect(runtime.lifecycle).toBe('stopped');
    expect(lifecycles).toEqual(['starting', 'ready', 'stopped']);
  });
});
