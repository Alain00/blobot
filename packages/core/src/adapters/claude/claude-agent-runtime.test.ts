import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../events.js';
import type { RuntimeLifecycle } from '../../runtime.js';
import type { TrustLevel } from '../../trust.js';
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

interface SessionParams {
  readonly _meta: { readonly claudeCode: { readonly options: { readonly allowedTools: string[] } } };
}

interface Started {
  readonly runtime: ClaudeAgentRuntime;
  readonly bridge: FakeBridge;
  readonly lifecycles: RuntimeLifecycle[];
  readonly outOfBand: AgentEvent[];
}

async function started(
  options: ConstructorParameters<typeof FakeBridge>[0] = {},
  extra: { trust?: TrustLevel; onStderr?: (line: string) => void } = {},
): Promise<Started> {
  const bridge = new FakeBridge(options);
  const runtime = new ClaudeAgentRuntime({
    agentId: 'bob',
    cwd: '/tmp/blobot/bob',
    persona: 'You are Bob.',
    claudeExecutable: '/usr/bin/true',
    spawn: () => bridge,
    ...(extra.trust === undefined ? {} : { trust: extra.trust }),
    ...(extra.onStderr === undefined ? {} : { onStderr: extra.onStderr }),
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

  it('vouches for editing and ordinary commands, so `default` mode stops asking about them', async () => {
    // Ticket 14, 2026-08-30: `default` prompts on every Edit and Write whatever the path, so
    // without this an agent stopped to ask permission to write a file in its own worktree.
    const { bridge } = await started();
    const options = (bridge.received[1]?.params as SessionParams)._meta.claudeCode.options;

    expect(options.allowedTools).toContain('Edit');
    expect(options.allowedTools).toContain('Write');
    expect(options.allowedTools).toContain('Bash(npm test:*)');
    expect(options.allowedTools).toContain('Bash(git commit:*)');
  });

  it('vouches for nothing that reaches the network, changes permissions or publishes', async () => {
    const { bridge } = await started();
    const options = (bridge.received[1]?.params as SessionParams)._meta.claudeCode.options;

    // The list is closed, so this is the whole of the check: a prefix that is not here is a
    // prompt the user still gets. `git` bare would swallow `git push`, which is why it is absent.
    for (const forbidden of ['rm', 'sudo', 'chmod', 'chown', 'curl', 'wget', 'ssh', 'scp',
      'docker', 'git push', 'git remote', 'gh', 'gh pr create', 'gh pr merge', 'gh api',
      'npm install', 'npx', 'pnpm add', 'yarn add', 'bun add', 'git']) {
      expect(options.allowedTools).not.toContain(`Bash(${forbidden}:*)`);
    }
  });

  it('vouches for reading GitHub, on the verb and never on the transport', async () => {
    const { bridge } = await started();
    const options = (bridge.received[1]?.params as SessionParams)._meta.claudeCode.options;

    // `git fetch` was always vouched and is a network read; `gh pr view` is the same act
    // against the same host. The rule that decides is the verb (2026-08-31).
    expect(options.allowedTools).toContain('Bash(git fetch:*)');
    expect(options.allowedTools).toContain('Bash(gh pr view:*)');
    expect(options.allowedTools).toContain('Bash(gh issue list:*)');
    expect(options.allowedTools).toContain('Bash(gh run view:*)');
    // Bare `gh` would swallow `gh pr create`, exactly as bare `git` would swallow `git push`.
    expect(options.allowedTools).not.toContain('Bash(gh:*)');
  });

  it('keeps pre-approving the mailbox blobot injected, beside the posture', async () => {
    const bridge = new FakeBridge();
    const runtime = new ClaudeAgentRuntime({
      agentId: 'bob',
      cwd: '/tmp/blobot/bob',
      claudeExecutable: '/usr/bin/true',
      mcpServers: [{ type: 'http', name: 'blobot', url: 'http://127.0.0.1:1/' }],
      spawn: () => bridge,
    });
    await runtime.start();
    const options = (bridge.received[1]?.params as SessionParams)._meta.claudeCode.options;

    // Ticket 15's: an unattended Alice stalls forever on a permission request for the mailbox.
    expect(options.allowedTools).toContain('mcp__blobot');
    expect(options.allowedTools).toContain('Write');
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

describe('resuming', () => {
  /** As `startTeam` does it: the provider's own session id, read back out of the store. */
  async function resuming(
    bridgeOptions: ConstructorParameters<typeof FakeBridge>[0] = {},
  ): Promise<Started> {
    const bridge = new FakeBridge(bridgeOptions);
    const runtime = new ClaudeAgentRuntime({
      agentId: 'bob',
      cwd: '/tmp/blobot/bob',
      persona: 'You are Bob.',
      resumeSessionId: 'session_yesterday',
      mcpServers: [{ type: 'http', name: 'blobot', url: 'http://127.0.0.1:41234/agents/bob/mcp' }],
      spawn: () => bridge,
    });
    const lifecycles: RuntimeLifecycle[] = [];
    const outOfBand: AgentEvent[] = [];
    runtime.onLifecycleChange((lifecycle) => lifecycles.push(lifecycle));
    runtime.onEvent((event) => outOfBand.push(event));
    await runtime.start();
    return { runtime, bridge, lifecycles, outOfBand };
  }

  it('loads the stored session and re-supplies the MCP servers', async () => {
    const { runtime, bridge } = await resuming();

    const methods = bridge.received.map((message) => message.method);
    expect(methods).toEqual(['initialize', 'session/load', 'session/set_mode']);
    expect(runtime.resumed).toBe(true);
    expect(runtime.sessionId).toBe('session_yesterday');

    // Research 15 §7: omit these and `message_agent` is gone, while the replayed transcript
    // still shows the agent using it a moment ago.
    const load = bridge.received[1]?.params as {
      sessionId: string;
      cwd: string;
      mcpServers: { name: string; url: string }[];
      _meta: { systemPrompt: string };
    };
    expect(load.sessionId).toBe('session_yesterday');
    expect(load.cwd).toBe('/tmp/blobot/bob');
    expect(load.mcpServers).toHaveLength(1);
    expect(load.mcpServers[0]?.url).toBe('http://127.0.0.1:41234/agents/bob/mcp');
    expect(load._meta.systemPrompt).toBe('You are Bob.');
  });

  it('re-forces the permission mode, because a session comes back in the mode it was saved in', async () => {
    const { runtime, bridge } = await resuming();
    const setMode = bridge.received[2]?.params as { modeId: string };
    expect(setMode.modeId).toBe('default');
    expect(runtime.permissionMode).toBe('default');
  });

  it('swallows the replayed transcript, so a restored team is not said twice', async () => {
    const { outOfBand } = await resuming({
      replayOnLoad: [
        { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'said yesterday' } },
        { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'asked yesterday' } },
      ],
    });
    expect(outOfBand).toEqual([]);
  });

  it('hears the agent again once the replay is over', async () => {
    const { runtime, bridge } = await resuming({
      replayOnLoad: [
        { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'said yesterday' } },
      ],
    });
    const { events, done } = consume(runtime.sendPrompt({ text: 'ping', from: 'user' }));
    await tick();
    bridge.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'today' } });
    bridge.endTurn('end_turn');
    await done;

    const completed = events.filter((event) => event.type === 'agent_message_completed');
    expect(completed.map((event) => (event as { text: string }).text)).toEqual(['today']);
  });

  it('keeps a menu advertised during the replay, because a menu is not transcript', async () => {
    const { runtime } = await resuming({
      replayOnLoad: [
        { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'said yesterday' } },
        {
          sessionUpdate: 'available_commands_update',
          availableCommands: [{ name: 'code-review', description: 'Review the changes' }],
        },
      ],
    });

    // The replay is swallowed because every listener already has it. Commands are the
    // exception: they describe the session we are about to use, not what was said in it, and
    // `#sessionId` is not even assigned until `session/load` returns.
    expect(runtime.availableCommands).toEqual([
      { name: 'code-review', description: 'Review the changes' },
    ]);
  });

  it('starts a new session when the provider has forgotten the old one', async () => {
    const { runtime, bridge } = await resuming({ failLoad: 'no conversation found with session ID' });

    const methods = bridge.received.map((message) => message.method);
    expect(methods).toEqual(['initialize', 'session/load', 'session/new', 'session/set_mode']);
    // The team launches. It launches without its memory, and `resumed` is how the app knows.
    expect(runtime.lifecycle).toBe('ready');
    expect(runtime.resumed).toBe(false);
    expect(runtime.sessionId).toBe('session_fake');
  });

  it('starts a new session against a bridge that cannot load one', async () => {
    const { runtime, bridge } = await resuming({ loadSession: false });
    expect(bridge.received.map((message) => message.method)).toEqual([
      'initialize',
      'session/new',
      'session/set_mode',
    ]);
    expect(runtime.resumed).toBe(false);
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

  it('keeps the reusable option identity with its measured settings explanation', async () => {
    const { runtime, bridge } = await started();
    runtime.setPermissionHandler(async (request) => {
      const option = request.options.find((option) => option.kind === 'allow_always');
      expect(option?.name).toBe('Always allow this tool');
      expect(option?.description).toContain('.claude/settings.local.json');
      expect(request.options.find((option) => option.kind === 'allow_once')?.description).toBeUndefined();
      return option?.optionId ?? null;
    });
    const reply = await bridge.requestPermission({
      toolCall: { toolCallId: 'mcp_1', title: 'mcp__example__create_issue' },
      options: [
        { optionId: 'once', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'always', name: 'Always allow this tool', kind: 'allow_always' },
      ],
    });
    expect(reply.result).toEqual({ outcome: { outcome: 'selected', optionId: 'always' } });
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

describe('the command menu', () => {
  // The palette reads `~/.claude/skills` off disk, so every test here points that at a
  // directory it controls. Otherwise the suite would pass or fail on what the developer
  // running it happens to have installed.
  const configDir = mkdtempSync(join(tmpdir(), 'blobot-config-'));
  beforeEach(() => {
    process.env.CLAUDE_CONFIG_DIR = configDir;
  });
  afterEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR;
  });

  // Vouched built-ins, so these survive the palette filter. See `palette.ts`.
  const MENU = [
    { name: 'code-review', description: 'Review the changes', input: { hint: '[path]' } },
    { name: 'simplify', description: 'Simplify the changes' },
  ];

  it('knows no commands before the provider advertises any', async () => {
    const { runtime } = await started();

    // Not a placeholder for "still loading". On OpenCode the first advertisement lands after
    // `session/prompt`, so a session that has never held a turn genuinely has no menu, and a
    // consumer must be able to say so.
    expect(runtime.availableCommands).toEqual([]);
  });

  it('caches the first advertisement and normalizes it away from the wire shape', async () => {
    const { runtime, bridge, outOfBand } = await started();
    const seen: (readonly { name: string }[])[] = [];
    runtime.onCommandsChange((commands) => seen.push(commands));

    bridge.update({ sessionUpdate: 'available_commands_update', availableCommands: MENU });
    await tick();

    expect(runtime.availableCommands).toEqual([
      { name: 'code-review', description: 'Review the changes', hint: '[path]' },
      { name: 'simplify', description: 'Simplify the changes' },
    ]);
    expect(seen).toHaveLength(1);
    // The menu is not agent state, so nothing about it may reach the stream or the recorder.
    expect(outOfBand).toEqual([]);
  });

  it('replaces the list rather than merging into it', async () => {
    const { runtime, bridge } = await started();
    bridge.update({ sessionUpdate: 'available_commands_update', availableCommands: MENU });
    await tick();

    bridge.update({
      sessionUpdate: 'available_commands_update',
      availableCommands: [{ name: 'verify', description: 'Verify the change' }],
    });
    await tick();

    // Merging would keep advertising commands from a directory the agent has left.
    expect(runtime.availableCommands).toEqual([
      { name: 'verify', description: 'Verify the change' },
    ]);
  });

  it('notifies nobody when the same list is advertised again', async () => {
    const { runtime, bridge } = await started();
    let notifications = 0;
    runtime.onCommandsChange(() => (notifications += 1));

    bridge.update({ sessionUpdate: 'available_commands_update', availableCommands: MENU });
    await tick();
    // OpenCode resends the identical array after every prompt. Without the comparison, every
    // turn would wake the renderer for nothing.
    bridge.update({ sessionUpdate: 'available_commands_update', availableCommands: MENU });
    await tick();

    expect(notifications).toBe(1);
  });

  it('takes an empty advertisement as a real answer', async () => {
    const { runtime, bridge } = await started();
    bridge.update({ sessionUpdate: 'available_commands_update', availableCommands: MENU });
    await tick();
    let notifications = 0;
    runtime.onCommandsChange(() => (notifications += 1));

    bridge.update({ sessionUpdate: 'available_commands_update', availableCommands: [] });
    await tick();

    expect(runtime.availableCommands).toEqual([]);
    expect(notifications).toBe(1);
  });

  it('offers nothing the repo did not ship and blobot did not vouch for', async () => {
    const { runtime, bridge } = await started();
    let notifications = 0;
    runtime.onCommandsChange(() => (notifications += 1));

    bridge.update({
      sessionUpdate: 'available_commands_update',
      availableCommands: [
        // One agent quietly becoming thirty, and the per-team turn budget defeated.
        { name: 'batch', description: 'Execute across 5-30 isolated agents' },
        { name: 'loop', description: 'Run a prompt on a recurring interval' },
        // A cloud agent, against a permanent local-first rule.
        { name: 'schedule', description: 'Create scheduled cloud agents' },
        // Ticket 14's posture, and the disclosure that promised it.
        { name: 'config', description: 'Set a setting by key' },
        { name: 'fewer-permission-prompts', description: 'Add an allowlist to settings.json' },
        // The agent's only route to a teammate.
        { name: 'mcp', description: 'Manage MCP servers' },
        // A second, competing roster.
        { name: 'list-agents', description: 'List subagents and teammates' },
      ],
    });
    await tick();

    expect(runtime.availableCommands).toEqual([]);
    // Filtered to nothing is not a change from nothing, so nobody is woken.
    expect(notifications).toBe(0);
  });

  it("offers the operator's own skills, and not a plugin's", async () => {
    const config = mkdtempSync(join(tmpdir(), 'blobot-personal-'));
    mkdirSync(join(config, 'skills', 'grilling'), { recursive: true });
    writeFileSync(join(config, 'skills', 'grilling', 'SKILL.md'), 'x');
    process.env.CLAUDE_CONFIG_DIR = config;

    const { runtime, bridge } = await started();
    bridge.update({
      sessionUpdate: 'available_commands_update',
      availableCommands: [
        { name: 'grilling', description: 'Something the operator wrote' },
        // A plugin installs outside `~/.claude/skills`, which is the only thing that tells it
        // apart from the line above: the wire says nothing about where either came from.
        { name: 'posthog:building-workflows', description: "A plugin's skill" },
        { name: 'deep-research', description: 'A built-in nobody vouched for' },
      ],
    });
    await tick();

    expect(runtime.availableCommands.map((command) => command.name)).toEqual(['grilling']);
  });

  it('finds a skill whose directory is a symlink', async () => {
    // Not hypothetical: 36 of the author's 37 personal skills are symlinks into a shared
    // `~/.agents/skills`. `readdirSync` calls every one of them a symlink and not a directory,
    // so a membership test written on `Dirent.isDirectory` finds none of them, which is
    // exactly the bug this pins.
    const real = mkdtempSync(join(tmpdir(), 'blobot-real-'));
    mkdirSync(join(real, 'grilling'), { recursive: true });
    writeFileSync(join(real, 'grilling', 'SKILL.md'), 'x');
    const config = mkdtempSync(join(tmpdir(), 'blobot-linked-'));
    mkdirSync(join(config, 'skills'), { recursive: true });
    symlinkSync(join(real, 'grilling'), join(config, 'skills', 'grilling'));
    process.env.CLAUDE_CONFIG_DIR = config;

    const { runtime, bridge } = await started();
    bridge.update({
      sessionUpdate: 'available_commands_update',
      availableCommands: [{ name: 'grilling', description: 'Through the linked directory' }],
    });
    await tick();

    expect(runtime.availableCommands.map((command) => command.name)).toEqual(['grilling']);
  });

  it("offers the workspace's own skills and commands", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'blobot-palette-'));
    mkdirSync(join(dir, '.claude', 'skills', 'house-style'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'skills', 'house-style', 'SKILL.md'), 'x');
    mkdirSync(join(dir, '.claude', 'commands', 'db'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'commands', 'ship.md'), 'x');
    writeFileSync(join(dir, '.claude', 'commands', 'db', 'migrate.md'), 'x');

    const bridge = new FakeBridge();
    const runtime = new ClaudeAgentRuntime({
      agentId: 'bob',
      cwd: dir,
      persona: 'You are Bob.',
      claudeExecutable: '/usr/bin/true',
      spawn: () => bridge,
    });
    await runtime.start();

    bridge.update({
      sessionUpdate: 'available_commands_update',
      availableCommands: [
        { name: 'house-style', description: "This repo's house style" },
        { name: 'ship', description: 'Ship it' },
        { name: 'db:migrate', description: 'Run migrations' },
        // Advertised, but neither the repo's nor vouched for.
        { name: 'heapdump', description: 'Dump the JS heap to ~/Desktop' },
      ],
    });
    await tick();

    // Someone wrote these three for this repository, which is what makes them relevant to
    // every teammate on the team. A nested command namespaces as `dir:name`.
    expect(runtime.availableCommands.map((command) => command.name)).toEqual([
      'house-style',
      'ship',
      'db:migrate',
    ]);
  });

  it('offers nothing extra for a workspace that ships no .claude at all', async () => {
    const { runtime, bridge } = await started();
    bridge.update({
      sessionUpdate: 'available_commands_update',
      availableCommands: [{ name: 'house-style', description: 'not this repo' }],
    });
    await tick();

    // The ordinary case, and not an error: most workspaces have no `.claude/`.
    expect(runtime.availableCommands).toEqual([]);
  });
});

describe('what the user may choose', () => {
  it('offers the runtime\'s own groups and withholds the two blobot decides', async () => {
    const { runtime } = await started();

    // Advertised: mode, model, effort, fast, agent. `mode` is ticket 14's posture and would
    // put `bypassPermissions` in a dropdown; `agent` picks a persona core composes.
    expect(runtime.optionGroups.map((group) => group.id)).toEqual(['model', 'effort', 'fast']);
    const effort = runtime.optionGroups.find((group) => group.id === 'effort');
    expect(effort?.choices.map((choice) => choice.value)).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(effort?.choices.find((choice) => choice.isDefault)?.value).toBe('medium');
  });

  it('applies the choices onto the session, because the session is the only lever', async () => {
    const bridge = new FakeBridge();
    const runtime = new ClaudeAgentRuntime({
      agentId: 'bob',
      cwd: '/tmp/blobot/bob',
      persona: 'You are Bob.',
      options: { effort: 'max', model: 'sonnet' },
      spawn: () => bridge,
    });
    await runtime.start();

    // `_meta.claudeCode.options.model` is accepted and then ignored by the real bridge:
    // measured asking for `sonnet` at `session/new` and getting `opus[1m]` back.
    const newSession = bridge.received[1]?.params as { _meta: { claudeCode: { options: Record<string, unknown> } } };
    expect(newSession._meta.claudeCode.options).not.toHaveProperty('model');

    expect(bridge.options['model']).toBe('sonnet');
    expect(bridge.options['effort']).toBe('max');
    expect(runtime.optionGroups.find((group) => group.id === 'model')?.current).toBe('sonnet');
    // And the posture is still what ticket 14 forced, after all that setting.
    expect(runtime.permissionMode).toBe('default');
  });

  it('starts anyway when the runtime refuses one, and says so', async () => {
    const bridge = new FakeBridge();
    bridge.refuse['fast'] = 'on';
    const logs: string[] = [];
    const runtime = new ClaudeAgentRuntime({
      agentId: 'bob',
      cwd: '/tmp/blobot/bob',
      options: { fast: 'on', effort: 'high' },
      spawn: () => bridge,
      onStderr: (line) => logs.push(line),
    });
    await runtime.start();

    expect(runtime.lifecycle).toBe('ready');
    expect(logs.join('\n')).toMatch(/fast=on was refused/);
    // The rest of the choices still land: one refusal is not the whole set.
    expect(bridge.options['effort']).toBe('high');
  });
});

describe('starting the session again', () => {
  it('closes the old session before opening a new one, and comes back on a different id', async () => {
    const { runtime, bridge } = await started();
    const before = runtime.sessionId;

    await runtime.restart();

    // Closed first. A bridge holding two live sessions for one agent is two sets of tools
    // pointed at one worktree, and the second would still be there after a failure that left
    // us reporting the session was kept.
    expect(bridge.closed).toEqual([before]);
    expect(runtime.sessionId).not.toBe(before);
    expect(runtime.lifecycle).toBe('ready');
    // The one thing a restart is for: the provider remembers nothing of what came before.
    expect(runtime.resumed).toBe(false);
  });

  it('re-asserts ticket 14’s permission mode on the session it just opened', async () => {
    const { runtime, bridge } = await started();
    await runtime.restart();

    // `session/new` reports whatever mode it likes and the fake reports `auto`, which is the
    // one ticket 14 refuses. The mode is a per-session setting, so a fresh session gets the
    // same forcing the first one did or the agent comes back under a posture nobody chose.
    expect(runtime.permissionMode).toBe('default');
    expect(bridge.sessionId).toBe(runtime.sessionId);
  });

  it('re-applies the user’s option choices, which are per session too', async () => {
    const bridge = new FakeBridge();
    const runtime = new ClaudeAgentRuntime({
      agentId: 'bob',
      cwd: '/tmp/blobot/bob',
      persona: 'You are Bob.',
      claudeExecutable: '/usr/bin/true',
      options: { effort: 'high' },
      spawn: () => bridge,
    });
    await runtime.start();
    expect(bridge.options['effort']).toBe('high');

    bridge.options['effort'] = 'medium';
    await runtime.restart();

    // `set_config_option` names a session id, so the choices do not travel: an agent set to
    // high effort that came back on the runtime's default would be a setting silently undone.
    expect(bridge.options['effort']).toBe('high');
  });

  it('refuses to restart mid-turn, because a session cannot be replaced under a prompt', async () => {
    const { runtime } = await started();
    const turn = runtime.sendPrompt({ text: 'hello', from: 'user' });
    const reading = (async () => {
      for await (const _event of turn) {
        // Drained so the iterator is live while the restart is attempted.
      }
    })();
    await tick();

    await expect(runtime.restart()).rejects.toThrow(/mid-turn/);
    await runtime.stop();
    await reading;
  });
});

describe('the fourth trust level', () => {
  const modeOf = (bridge: FakeBridge): string =>
    (bridge.received.find((message) => message.method === 'session/set_mode')?.params as {
      modeId: string;
    }).modeId;

  it('asks for auto when the model offers it', async () => {
    const { bridge, runtime } = await started(
      { availableModes: [{ id: 'default' }, { id: 'auto' }] },
      { trust: 'unattended' },
    );
    expect(modeOf(bridge)).toBe('auto');
    expect(runtime.permissionMode).toBe('auto');
  });

  it('keeps default at the three attended levels even where auto is offered', async () => {
    // The mode follows the trust word and never the model's capability list. A runtime that
    // took `auto` because it was on offer would be inheriting a posture nobody chose, which is
    // the exact thing ticket 14 forced `default` to prevent.
    const offered = { availableModes: [{ id: 'default' }, { id: 'auto' }] };
    expect(modeOf((await started(offered, { trust: 'trusting' })).bridge)).toBe('default');
    expect(modeOf((await started(offered, { trust: 'careful' })).bridge)).toBe('default');
    expect(modeOf((await started(offered)).bridge)).toBe('default');
  });

  it('falls back to default, and says so, on a model that does not offer auto', async () => {
    // `auto` is advertised "only when the model supports it". Silently asking for a mode that
    // is not there is what ticket 14 held against the fourth level; the probe is the answer to
    // it, so the fallback has to be observable or the answer is not real.
    const said: string[] = [];
    const { bridge, runtime } = await started(
      { availableModes: [{ id: 'default' }] },
      { trust: 'unattended', onStderr: (line) => said.push(line) },
    );
    expect(modeOf(bridge)).toBe('default');
    expect(runtime.permissionMode).toBe('default');
    expect(said.join('\n')).toContain('will ask you instead');
  });

  it('falls back rather than failing the launch, unlike Codex', async () => {
    // Deliberately not fatal: the fallback here is *stricter* than what was asked for, so the
    // failure `#assertPosture` exists to prevent cannot happen in this direction.
    const { lifecycles } = await started(
      { availableModes: [{ id: 'default' }] },
      { trust: 'unattended' },
    );
    expect(lifecycles).toEqual(['starting', 'ready']);
  });
});

describe('what the fourth level denies on the wire', () => {
  const optionsOf = (bridge: FakeBridge): { disallowedTools: string[] } =>
    (bridge.received[1]?.params as { _meta: { claudeCode: { options: { disallowedTools: string[] } } } })
      ._meta.claudeCode.options;

  it('sends the nine verbs as disallowedTools at unattended', async () => {
    const { bridge } = await started(
      { availableModes: [{ id: 'default' }, { id: 'auto' }] },
      { trust: 'unattended' },
    );
    const denied = optionsOf(bridge).disallowedTools;
    expect(denied).toContain('Bash(sudo:*)');
    expect(denied).toContain('Bash(git push:*)');
    expect(denied).toContain('Bash(rm:*)');
    // The two that are excluded at every level stay excluded beside them.
    expect(denied).toContain('SendMessage');
    expect(denied).toContain('ListAgents');
  });

  it('sends only the shadowing tools at the attended levels', async () => {
    const { bridge } = await started({}, { trust: 'trusting' });
    expect(optionsOf(bridge).disallowedTools).toEqual(['SendMessage', 'ListAgents']);
  });
});
