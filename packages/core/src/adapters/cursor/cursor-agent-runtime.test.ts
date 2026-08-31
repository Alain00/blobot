import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../events.js';
import type { RuntimeLifecycle } from '../../runtime.js';
import { CursorAgentRuntime } from './cursor-agent-runtime.js';
import { FakeCursor } from './fake-cursor.js';
import { ALWAYS_DENY, CURSOR_APPROVAL_MODE } from './permissions.js';
import { FORBIDDEN_CURSOR_ARGS, childEnv } from './stdio.js';

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

interface Started {
  readonly runtime: CursorAgentRuntime;
  readonly agent: FakeCursor;
  readonly lifecycles: RuntimeLifecycle[];
  readonly outOfBand: AgentEvent[];
  readonly logs: string[];
  readonly configDir: string;
}

async function started(
  options: ConstructorParameters<typeof FakeCursor>[0] = {},
  runtimeOptions: Partial<ConstructorParameters<typeof CursorAgentRuntime>[0]> = {},
): Promise<Started> {
  const agent = new FakeCursor(options);
  const logs: string[] = [];
  const configDir = mkdtempSync(join(tmpdir(), 'blobot-cursor-cfg-'));
  const runtime = new CursorAgentRuntime({
    agentId: 'agent_01',
    agentName: 'Bob',
    cwd: '/tmp/blobot/bob',
    persona: 'You are Bob.',
    configDir,
    mcpServers: [
      {
        type: 'http',
        name: 'blobot',
        url: 'http://127.0.0.1:41234/agents/agent_01/mcp',
        headers: [{ name: 'Authorization', value: 'Bearer secret-token' }],
      },
    ],
    spawn: (spawnOptions) => {
      agent.configDir = spawnOptions.configDir;
      agent.cwd = spawnOptions.cwd;
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
  return { runtime, agent, lifecycles, outOfBand, logs, configDir: runtime.configDir };
}

function consume(iterable: AsyncIterable<AgentEvent>): { events: AgentEvent[]; done: Promise<void> } {
  const events: AgentEvent[] = [];
  const done = (async () => {
    for await (const event of iterable) events.push(event);
  })();
  return { events, done };
}

describe('starting', () => {
  it('initializes, authenticates, and creates a session in the workspace', async () => {
    const { runtime, agent, lifecycles } = await started();

    expect(lifecycles).toEqual(['starting', 'ready']);
    expect(runtime.sessionId).toBe('ses_cursor');
    expect(agent.received.map((message) => message.method)).toEqual([
      'initialize',
      'authenticate',
      'session/new',
      'session/set_mode',
    ]);
    expect(agent.received[1]?.params).toEqual({ methodId: 'cursor_login' });
    expect((agent.received[2]?.params as { cwd: string }).cwd).toBe('/tmp/blobot/bob');
    expect(runtime.modeId).toBe('agent');
  });

  it('writes a per-agent config dir and never a file in the workspace', async () => {
    const { agent, configDir } = await started();

    expect(agent.configDir).toBe(configDir);
    expect(configDir).not.toContain('/tmp/blobot/bob');
    const mcp = JSON.parse(readFileSync(join(configDir, 'mcp.json'), 'utf8')) as {
      mcpServers: { blobot: { url: string; headers: { Authorization: string } } };
    };
    expect(mcp.mcpServers.blobot.url).toContain('127.0.0.1');
    expect(mcp.mcpServers.blobot.headers.Authorization).toBe('Bearer secret-token');
    const cli = JSON.parse(readFileSync(join(configDir, 'cli-config.json'), 'utf8')) as {
      approvalMode: string;
      permissions: { allow: string[]; deny: string[] };
    };
    expect(cli.approvalMode).toBe(CURSOR_APPROVAL_MODE);
    expect(cli.permissions.deny).toEqual([...ALWAYS_DENY]);
    expect(cli.permissions.allow).toContain('Mcp(blobot:*)');
    const persona = readFileSync(join(configDir, 'rules', 'blobot-persona.mdc'), 'utf8');
    expect(persona).toContain('alwaysApply: true');
    expect(persona).toContain('You are Bob.');
  });

  it('still sends mcpServers on session/new, which is the cheap measurement', async () => {
    const { agent } = await started();
    const created = agent.received.find((message) => message.method === 'session/new');
    expect((created?.params as { mcpServers: unknown[] }).mcpServers).toHaveLength(1);
  });

  it('pins agent mode even when the session reports plan', async () => {
    const { runtime, agent } = await started({ mode: 'plan' });
    expect(agent.mode).toBe('agent');
    expect(runtime.modeId).toBe('agent');
  });

  it('refuses a protocol version it was not written against', async () => {
    const agent = new FakeCursor({ protocolVersion: 2 });
    const runtime = new CursorAgentRuntime({
      agentId: 'agent_01',
      cwd: '/tmp/blobot/bob',
      configDir: mkdtempSync(join(tmpdir(), 'blobot-cursor-cfg-')),
      spawn: () => agent,
    });
    await expect(runtime.start()).rejects.toThrow(/protocol version 2/);
    expect(runtime.lifecycle).toBe('dead');
  });

  it('names cursor-agent login when authenticate fails, and never carries a key', async () => {
    const agent = new FakeCursor({ failAuth: 'login required' });
    const runtime = new CursorAgentRuntime({
      agentId: 'agent_01',
      cwd: '/tmp/blobot/bob',
      configDir: mkdtempSync(join(tmpdir(), 'blobot-cursor-cfg-')),
      spawn: () => agent,
    });
    await expect(runtime.start()).rejects.toThrow(/cursor-agent login/);
    expect(runtime.lifecycle).toBe('dead');
  });
});

describe('the child must not carry a credential or a Cursor worktree', () => {
  it('strips CURSOR_API_KEY and CURSOR_AUTH_TOKEN from the process environment', () => {
    const env = childEnv({
      cwd: '/tmp/ws',
      configDir: '/tmp/cfg',
      env: { CURSOR_API_KEY: 'sk-test', CURSOR_AUTH_TOKEN: 'tok', KEEP: 'yes' },
    });
    expect(env['CURSOR_API_KEY']).toBeUndefined();
    expect(env['CURSOR_AUTH_TOKEN']).toBeUndefined();
    expect(env['CURSOR_CONFIG_DIR']).toBe('/tmp/cfg');
    expect(env['KEEP']).toBe('yes');
  });

  it('names the flags that must never appear on the argv', () => {
    expect(FORBIDDEN_CURSOR_ARGS).toEqual(['--worktree', '--force', '--yolo', '--api-key']);
  });
});

describe('resuming', () => {
  async function resuming(options: ConstructorParameters<typeof FakeCursor>[0] = {}) {
    return started({ ...options }, { resumeSessionId: 'ses_yesterday' });
  }

  it('loads the session, re-supplies the tools and re-pins agent mode', async () => {
    const { runtime, agent } = await resuming();
    expect(agent.received.map((message) => message.method)).toEqual([
      'initialize',
      'authenticate',
      'session/load',
      'session/set_mode',
    ]);
    const load = agent.received[2]?.params as { sessionId: string; mcpServers: unknown[] };
    expect(load.sessionId).toBe('ses_yesterday');
    expect(load.mcpServers).toHaveLength(1);
    expect(runtime.resumed).toBe(true);
    expect(runtime.modeId).toBe('agent');
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
    expect(outOfBand).toEqual([]);
  });

  it('starts a new session when the provider has forgotten the old one', async () => {
    const { runtime, agent, logs } = await resuming({ failLoad: 'session not found' });
    expect(agent.received.map((message) => message.method)).toEqual([
      'initialize',
      'authenticate',
      'session/load',
      'session/new',
      'session/set_mode',
    ]);
    expect(runtime.resumed).toBe(false);
    expect(logs.join('\n')).toMatch(/could not resume ses_yesterday/);
  });
});

describe('a turn', () => {
  it('assembles ragged deltas into one message and ends on the RPC reply', async () => {
    const { runtime, agent } = await started();
    const turn = consume(runtime.sendPrompt({ text: 'hello', from: 'user' }));
    await tick();
    for (const text of ['Hello there', ',', ' friend.']) {
      agent.update({
        sessionUpdate: 'agent_message_chunk',
        messageId: 'msg_1',
        content: { type: 'text', text },
      });
    }
    agent.endTurn('end_turn');
    await turn.done;
    const completed = turn.events.filter((event) => event.type === 'agent_message_completed');
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ text: 'Hello there, friend.' });
    expect(turn.events.at(-1)).toMatchObject({ type: 'turn_ended', stopReason: 'end_turn' });
  });

  it('refuses a second prompt while one is in flight', async () => {
    const { runtime, agent } = await started();
    const turn = consume(runtime.sendPrompt({ text: 'first', from: 'user' }));
    await tick();
    expect(() => runtime.sendPrompt({ text: 'second', from: 'user' })).toThrow(/already in flight/);
    agent.endTurn('end_turn');
    await turn.done;
  });

  it('turns a failed prompt into an event, so the partial transcript survives', async () => {
    const { runtime, agent } = await started();
    const turn = consume(runtime.sendPrompt({ text: 'hello', from: 'user' }));
    await tick();
    agent.update({
      sessionUpdate: 'agent_message_chunk',
      messageId: 'msg_1',
      content: { type: 'text', text: 'half' },
    });
    agent.failPrompt('the provider returned 500');
    await turn.done;
    expect(turn.events.at(-1)).toMatchObject({
      type: 'error',
      fatal: true,
      message: 'the provider returned 500',
    });
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
  it('maps hyphenated Cursor kinds onto blobot’s three words', async () => {
    const { runtime, agent } = await started();
    runtime.setPermissionHandler(async (request) => {
      expect(request.options.map((option) => option.kind)).toEqual([
        'allow_once',
        'allow_always',
        'reject_once',
      ]);
      return request.options.find((option) => option.kind === 'allow_once')?.optionId ?? null;
    });
    const turn = consume(runtime.sendPrompt({ text: 'run it', from: 'user' }));
    await tick();
    const reply = await agent.requestPermission({
      sessionId: agent.sessionId,
      toolCall: { toolCallId: 'call_1', title: 'echo PERMTEST', kind: 'execute' },
      options: [
        { optionId: 'allow-once', kind: 'allow-once', name: 'Allow once' },
        { optionId: 'allow-always', kind: 'allow-always', name: 'Always allow' },
        { optionId: 'reject-once', kind: 'reject-once', name: 'Reject' },
      ],
    });
    expect(reply.result).toEqual({ outcome: { outcome: 'selected', optionId: 'allow-once' } });
    agent.endTurn('end_turn');
    await turn.done;
  });

  it('cancels rather than allows when nobody is listening', async () => {
    const { agent } = await started();
    const reply = await agent.requestPermission({
      toolCall: { toolCallId: 'call_1', title: 'rm -rf /' },
      options: [{ optionId: 'allow-once', kind: 'allow-once', name: 'Allow once' }],
    });
    expect(reply.result).toEqual({ outcome: { outcome: 'cancelled' } });
  });
});

describe('the two extension methods that block the turn', () => {
  it('skips ask_question rather than hanging or inventing a Cursor widget', async () => {
    const { agent } = await started();
    const reply = await agent.askQuestion({
      toolCallId: 'call_q',
      questions: [{ id: 'q1', prompt: 'Which mode?', options: [{ id: 'agent', label: 'Agent' }] }],
    });
    expect(reply.result).toEqual({
      outcome: { outcome: 'skipped', reason: 'no user is available; continue with what you have' },
    });
  });

  it('rejects a plan rather than approving it in silence', async () => {
    const { agent } = await started();
    const reply = await agent.createPlan({
      toolCallId: 'call_p',
      plan: '1. rewrite everything',
      todos: [],
    });
    expect(reply.result).toEqual({
      outcome: { outcome: 'rejected', reason: 'blobot never approves a plan silently' },
    });
  });

  it('answers an unknown blocking method with an error, not with silence', async () => {
    const { agent } = await started();
    const reply = await agent.sendUnknownBlocking('cursor/future_block', { toolCallId: 'x' });
    expect(reply.error?.code).toBe(-32601);
    expect(reply.error?.message).toMatch(/cursor\/future_block/);
  });
});

describe('the command menu', () => {
  function workspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'blobot-cursor-palette-'));
    mkdirSync(join(dir, '.cursor', 'commands'), { recursive: true });
    writeFileSync(join(dir, '.cursor', 'commands', 'ship.md'), '# ship it\n');
    return dir;
  }

  it('offers what a person authored in this workspace and nothing else', async () => {
    const { runtime, agent } = await started({}, { cwd: workspace() });
    agent.update({
      sessionUpdate: 'available_commands_update',
      availableCommands: [
        { name: 'ship', description: 'Ship it' },
        { name: 'mcp', description: 'A built-in' },
      ],
    });
    await tick();
    expect(runtime.availableCommands.map((command) => command.name)).toEqual(['ship']);
  });
});

describe('what the user may choose', () => {
  it('offers the models and withholds the mode, which is read-only on this runtime', async () => {
    const { runtime } = await started();
    expect(runtime.optionGroups.map((group) => group.id)).toEqual(['model']);
    expect(runtime.optionGroups[0]?.choices.map((choice) => choice.value)).toEqual([
      'composer-2',
      'gpt-5',
    ]);
  });
});
