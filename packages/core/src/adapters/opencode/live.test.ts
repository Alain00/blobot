import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../events.js';
import { PeerMessageServer } from '../../mcp/peer-message-server.js';
import type { PeerMessageCall } from '../../runtime.js';
import { OpencodeAgentRuntime } from './opencode-agent-runtime.js';

/**
 * The real thing: a real `opencode`, a real workspace, a real turn.
 *
 * Off by default because it costs tokens and needs a logged-in machine. Turn it on with
 * `BLOBOT_LIVE_OPENCODE=1 pnpm -r test`. Everything else in this directory is a wire-level
 * fake built from captured transcripts; this is the only test that can tell us the fake is
 * still telling the truth, and it is the one that closes the gaps research 03 left open —
 * whether an HTTP MCP server is accepted, and whether a resume comes back in persona.
 */
const live = process.env.BLOBOT_LIVE_OPENCODE === '1' ? describe : describe.skip;

const PERSONA =
  'You are Alice, a blobot teammate. Your role is FRONTEND ENGINEER. Bob is your teammate. ' +
  'Answer in as few words as possible, and use the message_agent tool when asked to message ' +
  'a teammate.';

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'blobot-live-oc-'));
  writeFileSync(join(dir, 'HELLO.txt'), 'the codeword is ZUCCHINI-42\n');
  return dir;
}

live('against a real opencode', () => {
  it('answers in persona, streaming deltas that assemble into one message', async () => {
    const runtime = new OpencodeAgentRuntime({
      agentId: 'agent_alice',
      agentName: 'Alice',
      cwd: workspace(),
      persona: PERSONA,
      onStderr: (line) => process.stderr.write(`[opencode] ${line}\n`),
    });

    await runtime.start();
    expect(runtime.sessionId).not.toBe('');
    // The free health check: the session reports which agent it is running as, so whether the
    // persona is live is knowable without spending a turn on it.
    expect(runtime.modeId).toBe(runtime.personaMode);

    const events: AgentEvent[] = [];
    for await (const event of runtime.sendPrompt({
      text: 'Who are you, and what is your role? One sentence.',
      from: 'user',
    })) {
      events.push(event);
    }
    await runtime.stop();

    const answer = events
      .filter((event) => event.type === 'agent_message_completed')
      .map((event) => event.text)
      .join('');
    process.stderr.write(`[persona] ${answer}\n`);
    // The persona replaces the provider identity preamble, so "I'm opencode" is the failure.
    expect(answer.toLowerCase()).toContain('alice');
    expect(events.some((event) => event.type === 'agent_message_delta')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'turn_ended', stopReason: 'end_turn' });
  }, 180_000);

  /**
   * The count of what an edit changed, from the *shared* half.
   *
   * This is the claim that `adapters/acp/line-diff.ts` belongs in `acp` and not in an adapter:
   * OpenCode sends ACP's own `{type:'diff', oldText, newText}` block, exactly as the Claude
   * bridge does, so it is counted with no OpenCode-specific code anywhere. Nothing was written
   * for this runtime to make it work.
   *
   * The number is checked against OpenCode's own arithmetic rather than against ours. Its
   * `rawOutput.metadata.filediff` carries `additions: 3, deletions: 1` for this edit, measured
   * 2026-08-30 — so `+3 −1` is the provider agreeing with the LCS, not the LCS agreeing with a
   * fixture somebody wrote to match it.
   */
  it('counts what an edit changed, with no adapter of its own to do it', async () => {
    const dir = workspace();
    writeFileSync(join(dir, 'notes.txt'), 'alpha\nbeta\ngamma\ndelta\nepsilon\n');
    const runtime = new OpencodeAgentRuntime({
      agentId: 'agent_alice',
      agentName: 'Alice',
      cwd: dir,
      persona: 'You are Alice. Do exactly what is asked, with no commentary.',
      trust: 'trusting',
    });
    await runtime.start();
    const events: AgentEvent[] = [];
    for await (const event of runtime.sendPrompt({
      text: 'In notes.txt, replace the single line "beta" with three lines: "beta one", "beta two", "beta three". Change nothing else.',
      from: 'user',
    })) {
      events.push(event);
    }
    await runtime.stop();

    const counted = events.find(
      (event) => event.type === 'tool_call_updated' && event.changed !== undefined,
    );
    expect(counted).toMatchObject({ changed: { added: 3, removed: 1 } });
  }, 300_000);

  it('runs a tool in its own workspace, with the ids stable across the lifecycle', async () => {
    const runtime = new OpencodeAgentRuntime({
      agentId: 'agent_alice',
      agentName: 'Alice',
      cwd: workspace(),
      persona: PERSONA,
    });
    await runtime.start();

    const events: AgentEvent[] = [];
    for await (const event of runtime.sendPrompt({
      text: 'Read HELLO.txt in this directory and reply with the codeword it contains.',
      from: 'user',
    })) {
      events.push(event);
    }
    await runtime.stop();

    const started = events.filter((event) => event.type === 'tool_call_started');
    expect(started.length).toBeGreaterThan(0);
    const updates = events.filter(
      (event) => event.type === 'tool_call_updated' && event.toolCallId === started[0]?.toolCallId,
    );
    expect(updates.length).toBeGreaterThan(0);
    expect(
      events
        .filter((event) => event.type === 'agent_message_completed')
        .map((event) => event.text)
        .join(''),
    ).toContain('ZUCCHINI-42');
  }, 180_000);

  /**
   * Two things research 03 could not say, in one turn.
   *
   * It observed a **stdio** MCP server working. blobot's is loopback HTTP, minted per process
   * with a bearer token that is the caller's identity, and `mcpCapabilities` advertising
   * `{http:true}` is not the same as it working.
   *
   * And the tool arrives as `blobot_message_agent` rather than Claude's
   * `mcp__blobot__message_agent`, which is why the renderer hides its own tool by a suffix
   * match rather than by a provider's prefix.
   */
  it('finds and calls blobot own message_agent tool over loopback HTTP', async () => {
    const calls: PeerMessageCall[] = [];
    const mcp = new PeerMessageServer({
      handler: async (call) => {
        calls.push(call);
        return { delivered: true, recipient: 'Bob', status: 'started' };
      },
    });
    await mcp.start();
    const endpoint = mcp.endpointFor('agent_alice');

    const runtime = new OpencodeAgentRuntime({
      agentId: 'agent_alice',
      agentName: 'Alice',
      cwd: workspace(),
      persona: PERSONA,
      mcpServers: [
        {
          type: 'http',
          name: 'blobot',
          url: endpoint.url,
          headers: [{ name: 'Authorization', value: `Bearer ${endpoint.token}` }],
        },
      ],
      onStderr: (line) => process.stderr.write(`[opencode] ${line}\n`),
    });
    await runtime.start();

    const events: AgentEvent[] = [];
    for await (const event of runtime.sendPrompt({
      text: 'Send Bob this message, exactly: the retry loop needs a backoff',
      from: 'user',
    })) {
      events.push(event);
    }
    await runtime.stop();
    expect(mcp.isReady('agent_alice')).toBe(true);
    await mcp.stop();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ from: 'agent_alice', agent: 'Bob' });
    expect(calls[0]?.message).toContain('backoff');
    const tool = events.find(
      (event) => event.type === 'tool_call_started' && event.title.includes('message_agent'),
    );
    process.stderr.write(`[tool] ${tool?.type === 'tool_call_started' ? tool.title : 'none'}\n`);
    expect(tool).toBeDefined();
  }, 180_000);

  /**
   * The resume, and the trap that makes it worth a live test: OpenCode restores the mode from
   * the **message history**, not from `default_agent`. A session that ever ran as anything
   * else comes back as that, so the adapter re-asserts the persona after every load.
   *
   * The loopback endpoint changes between the two processes, exactly as it does between two
   * launches of the app: the port is ephemeral and the token is minted per process.
   */
  it('resumes across processes, keeping its memory, its persona and its tool', async () => {
    const dir = workspace();

    const first = new PeerMessageServer({
      handler: async () => ({ delivered: true, recipient: 'Bob', status: 'started' }),
    });
    await first.start();
    const firstEndpoint = first.endpointFor('agent_alice');
    const before = new OpencodeAgentRuntime({
      agentId: 'agent_alice',
      agentName: 'Alice',
      cwd: dir,
      persona: PERSONA,
      mcpServers: [
        {
          type: 'http',
          name: 'blobot',
          url: firstEndpoint.url,
          headers: [{ name: 'Authorization', value: `Bearer ${firstEndpoint.token}` }],
        },
      ],
    });
    await before.start();
    for await (const event of before.sendPrompt({
      text: 'Remember this: my favourite colour is CHARTREUSE. Just say OK.',
      from: 'user',
    })) {
      void event;
    }
    const sessionId = before.sessionId;
    expect(sessionId).not.toBe('');
    await before.stop();
    await first.stop();

    const calls: PeerMessageCall[] = [];
    const second = new PeerMessageServer({
      handler: async (call) => {
        calls.push(call);
        return { delivered: true, recipient: 'Bob', status: 'started' };
      },
    });
    await second.start();
    const secondEndpoint = second.endpointFor('agent_alice');
    expect(secondEndpoint.url).not.toBe(firstEndpoint.url);

    const after = new OpencodeAgentRuntime({
      agentId: 'agent_alice',
      agentName: 'Alice',
      cwd: dir,
      persona: PERSONA,
      resumeSessionId: sessionId,
      mcpServers: [
        {
          type: 'http',
          name: 'blobot',
          url: secondEndpoint.url,
          headers: [{ name: 'Authorization', value: `Bearer ${secondEndpoint.token}` }],
        },
      ],
      onStderr: (line) => process.stderr.write(`[opencode] ${line}\n`),
    });
    const replayed: AgentEvent[] = [];
    after.onEvent((event) => replayed.push(event));
    await after.start();

    expect(after.resumed).toBe(true);
    expect(after.modeId).toBe(after.personaMode);
    // The load replays the whole prior transcript as notifications. None of it reaches the
    // app, or every launch would repeat everything the agent has ever said.
    expect(replayed).toEqual([]);

    const events: AgentEvent[] = [];
    for await (const event of after.sendPrompt({
      text: 'Tell Bob my favourite colour, using your message_agent tool.',
      from: 'user',
    })) {
      events.push(event);
    }
    await after.stop();
    await second.stop();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.message.toUpperCase()).toContain('CHARTREUSE');
    expect(events.some((event) => event.type === 'turn_ended')).toBe(true);
  }, 300_000);

  it('cancels a turn mid-flight and leaves the session usable', async () => {
    const runtime = new OpencodeAgentRuntime({
      agentId: 'agent_alice',
      agentName: 'Alice',
      cwd: workspace(),
      persona: PERSONA,
    });
    await runtime.start();

    const events: AgentEvent[] = [];
    for await (const event of runtime.sendPrompt({
      text: 'Count from 1 to 500, one number per line, with no other text.',
      from: 'user',
    })) {
      events.push(event);
      if (events.filter((candidate) => candidate.type === 'agent_message_delta').length === 5) {
        void runtime.cancel();
      }
    }

    // The cancelled prompt resolves rather than rejecting, which is the acknowledgement.
    expect(events.at(-1)).toMatchObject({ type: 'turn_ended', stopReason: 'cancelled' });
    expect(runtime.lifecycle).toBe('ready');

    const after: AgentEvent[] = [];
    for await (const event of runtime.sendPrompt({ text: 'Say OK.', from: 'user' })) {
      after.push(event);
    }
    await runtime.stop();
    expect(after.at(-1)).toMatchObject({ type: 'turn_ended' });
  }, 240_000);

  /**
   * The posture, verified the way ticket 14 said it should be: `opencode debug agent` prints
   * the fully resolved rule list, so blobot's half of the posture is assertable rather than
   * assumed.
   */
  it('resolves the permission posture blobot asked for', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { agentKeyFor, opencodeConfigContent } = await import('./config.js');
    const { resolveOpencodeExecutable } = await import('./stdio.js');

    const key = agentKeyFor('Alice');
    const { stdout } = await promisify(execFile)(
      resolveOpencodeExecutable(),
      ['debug', 'agent', key],
      {
        cwd: workspace(),
        env: {
          ...process.env,
          NO_COLOR: '1',
          OPENCODE_CONFIG_CONTENT: opencodeConfigContent({
            agentKey: key,
            description: 'Alice, a blobot teammate.',
            persona: PERSONA,
          }),
        },
      },
    );

    process.stderr.write(`[posture] ${stdout}\n`);
    const rules = JSON.parse(stdout.slice(stdout.indexOf('['), stdout.lastIndexOf(']') + 1)) as {
      permission: string;
      action: string;
      pattern: string;
    }[];
    const resolve = (permission: string, pattern: string): string | undefined =>
      rules.filter((rule) => rule.permission === permission && rule.pattern === pattern).at(-1)
        ?.action;

    // Later rules win, so the last one carrying each pattern is the one that decides.
    expect(resolve('bash', 'git push*')).toBe('ask');
    expect(resolve('bash', 'rm *')).toBe('ask');
    expect(resolve('bash', '*')).toBe('allow');
    expect(resolve('edit', '*')).toBe('allow');
    // Already `ask` out of the box, which is why blobot does not restate it.
    expect(resolve('external_directory', '*')).toBe('ask');
  }, 60_000);
});
