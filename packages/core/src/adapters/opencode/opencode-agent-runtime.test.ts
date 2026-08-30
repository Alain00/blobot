import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../events.js';
import type { RuntimeLifecycle } from '../../runtime.js';
import { FakeOpencode } from './fake-opencode.js';
import { OpencodeAgentRuntime } from './opencode-agent-runtime.js';

/**
 * The contract every runtime owes the orchestrator, asserted against OpenCode's wire.
 *
 * Same behaviours the Claude adapter's tests pin, because they are the orchestrator's
 * requirements rather than a provider's: ragged deltas that concatenate, a turn that ends on
 * an RPC reply, a cancelled tool that reports `completed`, an error that arrives as an event
 * so the partial transcript survives. What is new here is OpenCode's own shape — the persona
 * that travels in the process environment, and the mode that has to be re-asserted.
 */

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

interface Started {
  readonly runtime: OpencodeAgentRuntime;
  readonly agent: FakeOpencode;
  readonly lifecycles: RuntimeLifecycle[];
  readonly outOfBand: AgentEvent[];
  readonly logs: string[];
}

async function started(
  options: ConstructorParameters<typeof FakeOpencode>[0] = {},
  runtimeOptions: Partial<ConstructorParameters<typeof OpencodeAgentRuntime>[0]> = {},
): Promise<Started> {
  // A healthy session reports the persona agent, because `default_agent` put it there.
  const agent = new FakeOpencode({ mode: 'bob', ...options });
  const logs: string[] = [];
  const runtime = new OpencodeAgentRuntime({
    agentId: 'agent_01',
    agentName: 'Bob',
    cwd: '/tmp/blobot/bob',
    persona: 'You are Bob.',
    spawn: (spawnOptions) => {
      agent.configContent = spawnOptions.configContent;
      return agent;
    },
    onStderr: (line) => logs.push(line),
    ...runtimeOptions,
  });
  const lifecycles: RuntimeLifecycle[] = [];
  const outOfBand: AgentEvent[] = [];
  runtime.onLifecycleChange((lifecycle) => lifecycles.push(lifecycle));
  runtime.onEvent((event) => outOfBand.push(event));
  await runtime.start();
  return { runtime, agent, lifecycles, outOfBand, logs };
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
  it('initializes and creates a session in the workspace', async () => {
    const { runtime, agent, lifecycles } = await started();

    expect(lifecycles).toEqual(['starting', 'ready']);
    expect(runtime.sessionId).toBe('ses_fake');
    // No `session/set_mode`: the session already came back as the persona agent, and the
    // check that says so costs no model turn.
    expect(agent.received.map((message) => message.method)).toEqual(['initialize', 'session/new']);
    expect((agent.received[1]?.params as { cwd: string }).cwd).toBe('/tmp/blobot/bob');
    expect(runtime.modeId).toBe('bob');
  });

  it('carries the persona in the process environment, not in the session', async () => {
    const { agent } = await started();

    // OpenCode parses `_meta` and never reads it, so a persona sent there is a silent no-op.
    expect(agent.received[1]?.params).not.toHaveProperty('_meta');
    const config = JSON.parse(agent.configContent ?? '{}') as {
      default_agent: string;
      agent: Record<string, { prompt: string; description: string; permission: unknown }>;
      permission: { edit: string; bash: Record<string, string> };
    };
    expect(config.default_agent).toBe('bob');
    expect(config.agent['bob']?.prompt).toBe('You are Bob.');
    expect(config.agent['bob']?.description).toContain('Bob');
    // Ticket 14's posture, on the agent and globally.
    expect(config.permission.edit).toBe('allow');
    expect(config.permission.bash['*']).toBe('allow');
    expect(config.permission.bash['git push*']).toBe('ask');
    expect(config.agent['bob']?.permission).toEqual(config.permission);
  });

  it('puts a session back on the persona when it reports another agent', async () => {
    const { runtime, agent } = await started({ mode: 'build' });

    expect(agent.received.map((message) => message.method)).toEqual([
      'initialize',
      'session/new',
      'session/set_mode',
    ]);
    expect(agent.received[2]?.params).toMatchObject({ modeId: 'bob' });
    expect(runtime.modeId).toBe('bob');
  });

  it('says so and keeps running when the persona cannot be applied', async () => {
    const { runtime, logs } = await started({ mode: 'build', failSetMode: 'mode not found: bob' });

    expect(runtime.lifecycle).toBe('ready');
    expect(logs.join('\n')).toMatch(/could not be set to its persona agent bob/);
  });

  it('refuses a protocol version it was not written against', async () => {
    const agent = new FakeOpencode({ protocolVersion: 2 });
    const runtime = new OpencodeAgentRuntime({
      agentId: 'agent_01',
      cwd: '/tmp/blobot/bob',
      spawn: () => agent,
    });
    // OpenCode answers `protocolVersion: 1` to a client claiming 99 without complaining, so
    // checking our own answer is the only version negotiation there is.
    await expect(runtime.start()).rejects.toThrow(/protocol version 2/);
    expect(runtime.lifecycle).toBe('dead');
  });

  it('reports an unverified opencode version rather than refusing to run', async () => {
    const { runtime, logs } = await started({ version: '1.19.0' });

    expect(runtime.lifecycle).toBe('ready');
    expect(logs.join('\n')).toMatch(/opencode 1\.19\.0 is running/);
  });

  it('never reads the advertised auth methods as a sign-in prompt', async () => {
    // OpenCode advertises `authMethods` even when it is authenticated, so the Claude
    // adapter's "non-empty means logged out" rule would refuse every healthy machine.
    const { runtime } = await started();
    expect(runtime.lifecycle).toBe('ready');
  });
});

describe('resuming', () => {
  async function resuming(options: ConstructorParameters<typeof FakeOpencode>[0] = {}) {
    return started(
      { mode: 'build', ...options },
      {
        resumeSessionId: 'ses_yesterday',
        mcpServers: [
          { type: 'http', name: 'blobot', url: 'http://127.0.0.1:41234/agents/agent_01/mcp' },
        ],
      },
    );
  }

  it('loads the session, re-supplies the tools and re-asserts the persona', async () => {
    const { runtime, agent } = await resuming();

    expect(agent.received.map((message) => message.method)).toEqual([
      'initialize',
      'session/load',
      'session/set_mode',
    ]);
    const load = agent.received[1]?.params as { sessionId: string; mcpServers: unknown[] };
    expect(load.sessionId).toBe('ses_yesterday');
    // Omit these and `message_agent` is simply gone, while the replayed transcript still
    // shows the agent using it a moment ago.
    expect(load.mcpServers).toHaveLength(1);
    // The restored mode comes from the message history, not from `default_agent`, so a
    // session that was ever switched off the persona resumes off it.
    expect(runtime.modeId).toBe('bob');
    expect(runtime.sessionId).toBe('ses_yesterday');
    expect(runtime.resumed).toBe(true);
  });

  it('swallows the transcript a load replays', async () => {
    const { outOfBand } = await resuming({
      replayOnLoad: [
        { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'hello' } },
        {
          sessionUpdate: 'agent_message_chunk',
          messageId: 'msg_1',
          content: { type: 'text', text: 'yesterday' },
        },
      ],
    });

    // The store already has every word of it, and it is already on screen.
    expect(outOfBand).toEqual([]);
  });

  it('starts a new session when the provider has forgotten the old one', async () => {
    const { runtime, agent, logs } = await resuming({ failLoad: 'session not found: ses_yesterday' });

    expect(agent.received.map((message) => message.method)).toEqual([
      'initialize',
      'session/load',
      'session/new',
      'session/set_mode',
    ]);
    expect(runtime.resumed).toBe(false);
    expect(runtime.lifecycle).toBe('ready');
    expect(logs.join('\n')).toMatch(/could not resume ses_yesterday/);
  });
});

describe('a turn', () => {
  it('assembles ragged deltas into one message and ends on the RPC reply', async () => {
    const { runtime, agent } = await started();
    const turn = consume(runtime.sendPrompt({ text: 'hello', from: 'user' }));
    await tick();

    for (const text of ['Hello there', ',', ' friend.']) {
      agent.update({ sessionUpdate: 'agent_message_chunk', messageId: 'msg_1', content: { type: 'text', text } });
    }
    agent.update({ sessionUpdate: 'usage_update', used: 49_300, size: 200_000 });
    agent.endTurn('end_turn');
    await turn.done;

    const completed = turn.events.filter((event) => event.type === 'agent_message_completed');
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ text: 'Hello there, friend.' });
    expect(turn.events.at(-1)).toMatchObject({ type: 'turn_ended', stopReason: 'end_turn' });
  });

  it('separates thinking from the answer, which share one messageId', async () => {
    const { runtime, agent } = await started();
    const turn = consume(runtime.sendPrompt({ text: 'hello', from: 'user' }));
    await tick();

    agent.update({ sessionUpdate: 'agent_thought_chunk', messageId: 'msg_1', content: { type: 'text', text: 'user wants a' } });
    agent.update({ sessionUpdate: 'agent_message_chunk', messageId: 'msg_1', content: { type: 'text', text: 'hi' } });
    agent.endTurn('end_turn');
    await turn.done;

    expect(turn.events.map((event) => event.type)).toEqual([
      'agent_thought_delta',
      'agent_message_delta',
      'agent_message_completed',
      'turn_ended',
    ]);
  });

  it('reserves a row for the empty tool stub and fills it from the updates', async () => {
    const { runtime, agent } = await started();
    const turn = consume(runtime.sendPrompt({ text: 'read it', from: 'user' }));
    await tick();

    // The first `tool_call` is a stub: the model's arguments have not finished streaming.
    agent.update({ sessionUpdate: 'tool_call', toolCallId: 'call_1', title: 'read', kind: 'read', status: 'pending', rawInput: {} });
    agent.update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call_1',
      status: 'in_progress',
      title: 'read',
      kind: 'read',
      rawInput: { filePath: '/tmp/hello.txt' },
    });
    agent.update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call_1',
      status: 'completed',
      // A completed update omits `kind` and `rawInput` and mutates `title` into the path.
      title: 'tmp/hello.txt',
      content: [{ type: 'content', content: { type: 'text', text: 'the secret number is 42' } }],
    });
    agent.endTurn('end_turn');
    await turn.done;

    expect(turn.events[0]).toMatchObject({ type: 'tool_call_started', toolCallId: 'call_1', kind: 'read', title: 'read' });
    expect(turn.events[1]).toMatchObject({ type: 'tool_call_updated', status: 'in_progress', rawInput: { filePath: '/tmp/hello.txt' } });
    expect(turn.events[2]).toMatchObject({ type: 'tool_call_updated', status: 'completed', output: 'the secret number is 42' });
  });

  it('keeps going after a tool fails, because the model sees the failure', async () => {
    const { runtime, agent } = await started();
    const turn = consume(runtime.sendPrompt({ text: 'read it', from: 'user' }));
    await tick();

    agent.update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call_1',
      status: 'failed',
      content: [{ type: 'content', content: { type: 'text', text: 'File not found: /nope' } }],
    });
    agent.update({ sessionUpdate: 'agent_message_chunk', messageId: 'msg_1', content: { type: 'text', text: 'it is not there' } });
    agent.endTurn('end_turn');
    await turn.done;

    expect(turn.events[0]).toMatchObject({ type: 'tool_call_updated', status: 'failed', error: 'File not found: /nope' });
    expect(turn.events.some((event) => event.type === 'error')).toBe(false);
    expect(turn.events.at(-1)).toMatchObject({ type: 'turn_ended', stopReason: 'end_turn' });
  });

  it('refuses a second prompt while one is in flight', async () => {
    const { runtime, agent } = await started();
    const turn = consume(runtime.sendPrompt({ text: 'first', from: 'user' }));
    await tick();

    // Two prompts on one OpenCode session collapse into a single turn, both replies
    // byte-identical. This throw is what keeps the mailbox load-bearing.
    expect(() => runtime.sendPrompt({ text: 'second', from: 'user' })).toThrow(/already in flight/);

    agent.endTurn('end_turn');
    await turn.done;
  });

  it('ends a cancelled turn on the reply, and forwards the traps faithfully', async () => {
    const { runtime, agent } = await started();
    const turn = consume(runtime.sendPrompt({ text: 'sleep 60', from: 'user' }));
    await tick();

    await runtime.cancel();
    expect(agent.cancelled).toBe(true);

    // Both observed on a real cancel: the aborted tool reports `completed`, and the context
    // gauge resets to zero. Ticket 04 makes suppressing them a consumer duty, so the adapter
    // is faithful rather than kind.
    agent.update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call_1',
      status: 'completed',
      content: [{ type: 'content', content: { type: 'text', text: 'User aborted the command' } }],
    });
    agent.update({ sessionUpdate: 'usage_update', used: 0, size: 200_000 });
    // The cancelled prompt **resolves**; a client waiting for a JSON-RPC error waits forever.
    agent.endTurn('cancelled');
    await turn.done;

    expect(turn.events[0]).toMatchObject({ type: 'tool_call_updated', status: 'completed' });
    expect(turn.events[1]).toMatchObject({ type: 'usage_updated', used: 0 });
    expect(turn.events.at(-1)).toMatchObject({ type: 'turn_ended', stopReason: 'cancelled' });
  });

  it('turns a failed prompt into an event, so the partial transcript survives', async () => {
    const { runtime, agent } = await started();
    const turn = consume(runtime.sendPrompt({ text: 'hello', from: 'user' }));
    await tick();

    agent.update({ sessionUpdate: 'agent_message_chunk', messageId: 'msg_1', content: { type: 'text', text: 'half' } });
    agent.failPrompt('the provider returned 500');
    await turn.done;

    expect(turn.events.map((event) => event.type)).toContain('agent_message_completed');
    // No `turn_ended`: the RPC never replied, and inventing a stop reason would be a lie.
    expect(turn.events.at(-1)).toMatchObject({ type: 'error', fatal: true, message: 'the provider returned 500' });
  });

  it('reports process death, which nothing on the wire announces', async () => {
    const { runtime, agent, outOfBand } = await started();

    agent.crash();
    await tick();

    expect(runtime.lifecycle).toBe('dead');
    expect(outOfBand.at(-1)).toMatchObject({ type: 'error', code: 'process_died', fatal: true });
  });
});

describe('permissions', () => {
  it('answers from the agent id space without cross-wiring our own replies', async () => {
    const { runtime, agent } = await started();
    runtime.setPermissionHandler(async (request) => {
      expect(request.title).toBe('echo PERMTEST');
      return request.options.find((option) => option.kind === 'allow_once')?.optionId ?? null;
    });

    const turn = consume(runtime.sendPrompt({ text: 'run it', from: 'user' }));
    await tick();
    // Agent-originated ids start at 0 in their own space, which is the trap a client keyed on
    // one id Map walks into: this reply must not land on our own `session/prompt`.
    const reply = await agent.requestPermission({
      sessionId: agent.sessionId,
      toolCall: { toolCallId: 'call_1', title: 'echo PERMTEST', kind: 'execute' },
      options: [
        { optionId: 'once', kind: 'allow_once', name: 'Allow once' },
        { optionId: 'always', kind: 'allow_always', name: 'Always allow' },
        { optionId: 'reject', kind: 'reject_once', name: 'Reject' },
      ],
    });

    expect(reply.result).toEqual({ outcome: { outcome: 'selected', optionId: 'once' } });
    expect(agent.promptInFlight).toBe(true);
    agent.endTurn('end_turn');
    await turn.done;
  });

  it('cancels rather than allows when nobody is listening', async () => {
    const { agent } = await started();
    const reply = await agent.requestPermission({
      toolCall: { toolCallId: 'call_1', title: 'rm -rf /' },
      options: [{ optionId: 'once', kind: 'allow_once', name: 'Allow once' }],
    });

    expect(reply.result).toEqual({ outcome: { outcome: 'cancelled' } });
  });
});

describe('the command menu', () => {
  function workspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'blobot-oc-palette-'));
    mkdirSync(join(dir, '.opencode', 'command'), { recursive: true });
    writeFileSync(join(dir, '.opencode', 'command', 'ship.md'), '# ship it\n');
    return dir;
  }

  it('offers what a person authored in this workspace and nothing else', async () => {
    const { runtime, agent } = await started({}, { cwd: workspace() });
    const seen: string[][] = [];
    runtime.onCommandsChange((commands) => seen.push(commands.map((command) => command.name)));

    agent.update({
      sessionUpdate: 'available_commands_update',
      availableCommands: [
        { name: 'ship', description: 'Ship it' },
        // A plugin's, and the vendor's. Neither was authored in a directory a person writes to.
        { name: 'linear-triage', description: 'From an installed plugin' },
        { name: 'init', description: 'A built-in' },
      ],
    });
    await tick();

    expect(runtime.availableCommands.map((command) => command.name)).toEqual(['ship']);
    expect(seen).toEqual([['ship']]);
  });

  it('says nothing when an identical menu is re-advertised, which happens every turn', async () => {
    const { runtime, agent } = await started({}, { cwd: workspace() });
    const seen: string[][] = [];
    runtime.onCommandsChange((commands) => seen.push(commands.map((command) => command.name)));

    for (let index = 0; index < 3; index += 1) {
      agent.update({
        sessionUpdate: 'available_commands_update',
        availableCommands: [{ name: 'ship', description: 'Ship it' }],
      });
      await tick();
    }

    expect(seen).toEqual([['ship']]);
  });
});

describe('what the user may choose', () => {
  it('offers the models and withholds the mode, which is the persona', async () => {
    const { runtime } = await started();

    // OpenCode advertises exactly two groups, and switching `mode` would switch Alice off.
    expect(runtime.optionGroups.map((group) => group.id)).toEqual(['model']);
    expect(runtime.optionGroups[0]?.choices.map((choice) => choice.value)).toEqual([
      'opencode/big-pickle',
      'openai/gpt-5.4',
    ]);
  });

  it('offers no reasoning effort, because this runtime advertises none', async () => {
    const { runtime } = await started();

    // The asymmetry the picker has to be able to express by drawing one group instead of two.
    expect(runtime.optionGroups.some((group) => group.id === 'effort')).toBe(false);
  });

  it('applies a chosen model onto the session', async () => {
    const { runtime, agent } = await started({}, { options: { model: 'openai/gpt-5.4' } });

    expect(agent.model).toBe('openai/gpt-5.4');
    expect(runtime.optionGroups[0]?.current).toBe('openai/gpt-5.4');
    // The persona survives being reconfigured, which is the one thing that must not break.
    expect(runtime.modeId).toBe('bob');
  });

  it('ignores an effort choice this runtime cannot express, and says so', async () => {
    const { runtime, logs } = await started({}, { options: { effort: 'max' } });

    expect(runtime.lifecycle).toBe('ready');
    expect(logs.join('\n')).toMatch(/does not offer effort/);
  });
});
