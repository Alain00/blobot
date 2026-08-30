import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexAgentRuntime } from './codex-agent-runtime.js';
import { FakeCodex } from './fake-codex.js';
import type { SpawnCodexBridgeOptions } from './stdio-bridge.js';

/** A workspace with one authored skill in it, so the palette has something real to allow. */
function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'blobot-codex-'));
  mkdirSync(join(dir, '.codex', 'skills', 'research'), { recursive: true });
  writeFileSync(join(dir, '.codex', 'skills', 'research', 'SKILL.md'), '# research\n');
  return dir;
}

interface Started {
  runtime: CodexAgentRuntime;
  bridge: FakeCodex;
  spawned: SpawnCodexBridgeOptions[];
  cwd: string;
}

async function start(
  options: Partial<ConstructorParameters<typeof CodexAgentRuntime>[0]> = {},
  bridge = new FakeCodex(),
): Promise<Started> {
  const cwd = workspace();
  const spawned: SpawnCodexBridgeOptions[] = [];
  const runtime = new CodexAgentRuntime({
    agentId: 'alice',
    cwd,
    spawn: (spawnOptions) => {
      spawned.push(spawnOptions);
      return bridge;
    },
    ...options,
  });
  await runtime.start();
  return { runtime, bridge, spawned, cwd };
}

describe('Codex behind AgentRuntime', () => {
  it('starts, and does not read the advertised api-key method as being signed out', async () => {
    // The Claude adapter refuses a launch when `authMethods` is non-empty, because there an
    // empty list is the proof of a login. Codex advertises `api-key` on a machine that is
    // signed in, so the same check here would refuse every launch there is.
    const { runtime } = await start();
    expect(runtime.lifecycle).toBe('ready');
    expect(runtime.sessionId).toBe('session_fake_codex');
  });

  it('refuses a bridge that is not the pin, because the bridge is ours and not the user’s', async () => {
    const runtime = new CodexAgentRuntime({
      agentId: 'alice',
      cwd: workspace(),
      spawn: () => new FakeCodex({ version: '1.6.0' }),
    });
    await expect(runtime.start()).rejects.toThrow(/pins 1\.7\.0/);
  });

  it('sends the persona in CODEX_CONFIG, told that it has no subagents', async () => {
    const { spawned } = await start({ persona: 'You are Alice.' });
    const env = spawned[0]?.env ?? {};
    const config = JSON.parse(env['CODEX_CONFIG'] ?? '{}') as { developer_instructions?: string };
    expect(Object.keys(config)).toEqual(['developer_instructions']);
    expect(config.developer_instructions).toContain('You are Alice.');
    // Asked to message a teammate, a real Codex started a subagent called `bob` and reported
    // the message sent. blobot owns agent-to-agent communication.
    expect(config.developer_instructions).toContain('message_agent');
    // `features` is not written: a partial map replaces the defaults and cost a session its
    // MCP tooling.
    expect(env['CODEX_CONFIG']).not.toContain('features');
    // The posture is not in there: it is inert against the mode, and a config key that does
    // nothing reads as a decision that was taken.
    expect(env['CODEX_CONFIG']).not.toContain('sandbox_mode');
    expect(env['CODEX_CONFIG']).not.toContain('approval_policy');
  });

  it('hands the trust level to the spawn, which is where the posture lives', async () => {
    const { spawned } = await start({ trust: 'trusting' });
    expect(spawned[0]?.trust).toBe('trusting');
  });

  describe('the posture, checked against what came back', () => {
    it('says nothing when the session is already in it', async () => {
      const { bridge, runtime } = await start();
      expect(runtime.modeId).toBe('read-only');
      expect(bridge.received.some((message) => message.method === 'session/set_mode')).toBe(false);
    });

    it('repairs a session that came up in the mode that writes to a home directory', async () => {
      const { bridge, runtime } = await start({}, new FakeCodex({ currentModeId: 'agent' }));
      expect(runtime.modeId).toBe('read-only');
      expect(bridge.received.some((message) => message.method === 'session/set_mode')).toBe(true);
    });

    it('refuses to run at all when it could not be confirmed', async () => {
      const bridge = new FakeCodex({ currentModeId: 'agent-full-access' });
      bridge.refuseSetMode = true;
      const runtime = new CodexAgentRuntime({
        agentId: 'alice',
        cwd: workspace(),
        spawn: () => bridge,
      });
      await expect(runtime.start()).rejects.toThrow(/permission posture it could not confirm/);
      expect(runtime.lifecycle).toBe('dead');
    });
  });

  describe('resuming', () => {
    const replay = [
      { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'hello' } },
      { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hi' } },
    ] as const;

    it('mutes the transcript the bridge replays before it answers', async () => {
      const events: unknown[] = [];
      const bridge = new FakeCodex({ replayOnLoad: replay });
      const cwd = workspace();
      const runtime = new CodexAgentRuntime({
        agentId: 'alice',
        cwd,
        resumeSessionId: 'session_old',
        spawn: () => bridge,
      });
      runtime.onEvent((event) => events.push(event));
      await runtime.start();
      expect(runtime.resumed).toBe(true);
      expect(runtime.sessionId).toBe('session_old');
      expect(events).toEqual([]);
    });

    it('re-supplies the MCP servers, or the mailbox is gone from under the transcript', async () => {
      const bridge = new FakeCodex();
      const runtime = new CodexAgentRuntime({
        agentId: 'alice',
        cwd: workspace(),
        resumeSessionId: 'session_old',
        mcpServers: [{ type: 'http', name: 'blobot', url: 'http://127.0.0.1:1/mcp' }],
        spawn: () => bridge,
      });
      await runtime.start();
      const load = bridge.received.find((message) => message.method === 'session/load');
      expect((load?.params as { mcpServers?: unknown[] }).mcpServers).toHaveLength(1);
    });

    it('starts a new session when the provider has forgotten the old one', async () => {
      const bridge = new FakeCodex({ failLoad: 'no such session' });
      const lines: string[] = [];
      const runtime = new CodexAgentRuntime({
        agentId: 'alice',
        cwd: workspace(),
        resumeSessionId: 'session_gone',
        spawn: () => bridge,
        onStderr: (line) => lines.push(line),
      });
      await runtime.start();
      expect(runtime.lifecycle).toBe('ready');
      expect(runtime.resumed).toBe(false);
      expect(runtime.sessionId).toBe('session_fake_codex');
      expect(lines.join(' ')).toContain('starting a new session');
    });
  });

  it('offers the authored skills and the vouched built-ins, and nothing else', async () => {
    const { bridge, runtime } = await start();
    bridge.advertiseCommands();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const offered = runtime.availableCommands.map((command) => command.name);
    expect(offered).toContain('status');
    expect(offered).toContain('compact');
    // The workspace authored this one, and the `$` is the runtime's spelling rather than a name.
    expect(offered).toContain('$research');
    // Signing the machine out of Codex from a composer, an extension this effort declines, and
    // a skill that could only have come from a plugin.
    expect(offered).not.toContain('logout');
    expect(offered).not.toContain('goal');
    expect(offered).not.toContain('$yeet-from-a-plugin');
  });

  it('offers the four option groups and never the one that is the posture', async () => {
    const { runtime } = await start();
    const ids = runtime.optionGroups.map((group) => group.id);
    expect(ids).toEqual(['model', 'reasoning_effort', 'fast-mode', 'collaboration_mode']);
    expect(ids).not.toContain('mode');
  });

  it('takes an image and an embedded file, because the bridge says it does', async () => {
    const { runtime } = await start();
    expect(runtime.accepts).toEqual({ images: true, textFiles: true });
  });

  describe('the mailbox, which Codex asks about like any other MCP tool', () => {
    const call = (server: string) => ({
      sessionUpdate: 'tool_call',
      toolCallId: 'exec-1',
      kind: 'execute',
      title: `mcp.${server}.message_agent`,
      status: 'in_progress',
      rawInput: { server, tool: 'message_agent' },
    });
    const ask = {
      toolCall: { toolCallId: 'exec-1' },
      _meta: { is_mcp_tool_approval: true },
      options: [
        { optionId: 'allow_once', kind: 'allow_once', name: 'Allow' },
        { optionId: 'allow_always', kind: 'allow_always', name: 'Always allow' },
        { optionId: 'cancel', kind: 'reject_once', name: 'Cancel' },
      ],
    };

    it('answers for blobot own loopback tool, so a peer message never waits on a human', async () => {
      const { bridge } = await start({
        mcpServers: [{ type: 'http', name: 'blobot', url: 'http://127.0.0.1:1/mcp' }],
      });
      bridge.update(call('blobot') as never);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const reply = await bridge.requestPermission(ask);
      expect(reply.result).toEqual({ outcome: { outcome: 'selected', optionId: 'allow_once' } });
    });

    it('still asks about a server the user configured, which blobot did not inject', async () => {
      const { bridge } = await start({
        mcpServers: [{ type: 'http', name: 'blobot', url: 'http://127.0.0.1:1/mcp' }],
      });
      bridge.update(call('someone-elses-server') as never);
      await new Promise((resolve) => setTimeout(resolve, 5));
      // Nobody is listening, so it is cancelled — never allowed.
      const reply = await bridge.requestPermission(ask);
      expect(reply.result).toEqual({ outcome: { outcome: 'cancelled' } });
    });
  });

  /**
   * DESIGN.md: an MCP tool carries no verb, because its name is its server's and not ours to
   * paraphrase. Codex types every MCP call `execute`, so the transcript drew `run` beside
   * `mcp.blobot.message_agent` until the adapter took it off.
   */
  it('draws no verb beside an MCP tool, whatever kind the runtime typed it', async () => {
    const { bridge, runtime } = await start();
    const seen: { kind?: string; title?: string }[] = [];
    runtime.onEvent((event) => {
      if (event.type === 'tool_call_started') seen.push({ kind: event.kind, title: event.title });
    });
    bridge.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'exec-9',
      kind: 'execute',
      title: 'mcp.blobot.message_agent',
      status: 'in_progress',
      rawInput: { server: 'blobot', tool: 'message_agent' },
    } as never);
    bridge.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'exec-10',
      kind: 'execute',
      title: 'npm test',
      status: 'in_progress',
      rawInput: { command: 'npm test' },
    } as never);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(seen).toEqual([
      { kind: 'other', title: 'mcp.blobot.message_agent' },
      { kind: 'execute', title: 'npm test' },
    ]);
  });

  it('cancels nothing when nobody is listening to a permission request', async () => {
    const { bridge } = await start();
    const reply = await bridge.requestPermission({
      toolCall: { toolCallId: 'exec-1', title: 'Run command' },
      options: [
        { optionId: 'allow_once', kind: 'allow_once', name: 'Yes, proceed' },
        { optionId: 'accept_execpolicy_amendment', kind: 'allow_always', name: 'Do not ask again' },
        { optionId: 'cancel', kind: 'reject_once', name: 'No' },
      ],
    });
    expect(reply.result).toEqual({ outcome: { outcome: 'cancelled' } });
  });

  it('hands the handler every option, including the one the UI will drop', async () => {
    const { runtime, bridge } = await start();
    let seen: string[] = [];
    runtime.setPermissionHandler(async (request) => {
      seen = request.options.map((option) => `${option.optionId}:${option.kind}`);
      return 'allow_once';
    });
    const reply = await bridge.requestPermission({
      toolCall: { toolCallId: 'exec-1', title: 'Run command' },
      options: [
        { optionId: 'allow_once', kind: 'allow_once', name: 'Yes, proceed' },
        { optionId: 'allow_for_session', kind: 'allow_always', name: 'Not again for these files' },
        { optionId: 'cancel', kind: 'reject_once', name: 'No' },
      ],
    });
    expect(seen).toEqual([
      'allow_once:allow_once',
      'allow_for_session:allow_always',
      'cancel:reject_once',
    ]);
    expect(reply.result).toEqual({ outcome: { outcome: 'selected', optionId: 'allow_once' } });
  });

  it('ends a turn on the reply, cancelled included', async () => {
    const { runtime, bridge } = await start();
    const events: string[] = [];
    const turn = (async () => {
      for await (const event of runtime.sendPrompt({ from: 'user', text: 'hello' })) events.push(event.type);
    })();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await runtime.cancel();
    expect(bridge.cancelled).toBe(true);
    bridge.endTurn('cancelled');
    await turn;
    expect(events).toContain('turn_ended');
  });
});
