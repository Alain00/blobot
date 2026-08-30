import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../events.js';
import { PeerMessageServer } from '../../mcp/peer-message-server.js';
import type { PeerMessageCall } from '../../runtime.js';
import { ClaudeAgentRuntime } from './claude-agent-runtime.js';
import { personalSkillNames, VOUCHED_BUILT_INS } from './palette.js';

/**
 * The real thing: a real `claude`, a real workspace, a real turn.
 *
 * Off by default because it costs tokens and needs a logged-in machine — the suite has to run
 * on a laptop with no Claude install. Turn it on with `BLOBOT_LIVE_CLAUDE=1 pnpm -r test`.
 * Everything else in this directory is a wire-level fake; this is the only test that can tell
 * us the wire-level fake is telling the truth.
 */
const live = process.env.BLOBOT_LIVE_CLAUDE === '1' ? describe : describe.skip;

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'blobot-live-'));
  writeFileSync(join(dir, 'HELLO.txt'), 'the codeword is ZUCCHINI-42\n');
  return dir;
}

live('against a real claude', () => {
  it('answers a prompt, streaming deltas that assemble into one message', async () => {
    const runtime = new ClaudeAgentRuntime({
      agentId: 'alice',
      cwd: workspace(),
      persona: 'You are Alice, a blobot teammate. Answer in as few words as possible.',
      onStderr: (line) => process.stderr.write(`[bridge] ${line}\n`),
    });

    await runtime.start();
    expect(runtime.sessionId).not.toBe('');
    expect(runtime.permissionMode).toBe('default');

    const events: AgentEvent[] = [];
    for await (const event of runtime.sendPrompt({
      text: 'Reply with exactly the word: PONG',
      from: 'user',
    })) {
      events.push(event);
    }
    await runtime.stop();

    const completed = events.filter((event) => event.type === 'agent_message_completed');
    expect(completed.map((event) => event.text).join('')).toContain('PONG');
    expect(events.some((event) => event.type === 'agent_message_delta')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'turn_ended', stopReason: 'end_turn' });
    expect(events.some((event) => event.type === 'error')).toBe(false);
  }, 180_000);

  /**
   * The palette, end to end: `settingSources` without `user`, then the allowlist.
   *
   * A fresh workspace ships no `.claude/`, so what survives here is exactly the built-ins
   * blobot vouches for. The measurement that produced these rules — 223 commands and 97 KB
   * unfiltered, 48 with `user` dropped — is on issue 03 and in ADR-0003.
   */
  it('offers a palette of the repo\'s commands and the vouched built-ins', async () => {
    const runtime = new ClaudeAgentRuntime({
      agentId: 'alice',
      cwd: workspace(),
      persona: 'You are Alice, a blobot teammate. Answer in as few words as possible.',
    });

    await runtime.start();
    // Claude advertises during startup rather than after the first prompt, which is the
    // opposite of what OpenCode was observed doing. Give it a beat rather than assuming.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const commands = runtime.availableCommands;
    await runtime.stop();

    process.stderr.write(
      `[palette] ${commands.length} offered, ${JSON.stringify(commands).length} bytes\n`,
    );
    for (const command of commands) {
      process.stderr.write(`[palette]   /${command.name}\n`);
    }

    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every((command) => command.name.length > 0)).toBe(true);
    // This workspace ships no `.claude/`, so what is left is the vouched built-ins plus
    // whatever the operator has written in `~/.claude/skills`.
    const personal = personalSkillNames();
    expect(
      commands.every(
        (command) => VOUCHED_BUILT_INS.includes(command.name) || personal.has(command.name),
      ),
    ).toBe(true);
    // A plugin's skills load, and are never offered: they are in nobody's authored directory.
    expect(commands.some((command) => command.name.includes(':'))).toBe(false);
    // The ones that would have fought something blobot owns are gone.
    for (const forbidden of ['batch', 'loop', 'schedule', 'mcp', 'config', 'list-agents']) {
      expect(commands.some((command) => command.name === forbidden)).toBe(false);
    }
  }, 180_000);

  /**
   * The half the allowlist exists for: a skill the *repository* ships.
   *
   * ADR-0003 keeps `project` scope precisely so this works, and the palette's rule is that the
   * repo owns the menu. Everything else in the list is five built-ins blobot happens to vouch
   * for; this is the population that is supposed to grow.
   */
  it("offers a skill the workspace itself ships", async () => {
    const dir = workspace();
    mkdirSync(join(dir, '.claude', 'skills', 'house-style'), { recursive: true });
    writeFileSync(
      join(dir, '.claude', 'skills', 'house-style', 'SKILL.md'),
      '---\nname: house-style\ndescription: How this repository writes things.\n---\n\nBe brief.\n',
    );
    mkdirSync(join(dir, '.claude', 'commands'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'commands', 'ship.md'), 'Open a pull request.\n');

    const runtime = new ClaudeAgentRuntime({
      agentId: 'alice',
      cwd: dir,
      persona: 'You are Alice, a blobot teammate.',
    });
    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const offered = runtime.availableCommands.map((command) => command.name);
    await runtime.stop();

    process.stderr.write(`[project] ${offered.join(' ')}\n`);
    expect(offered).toContain('house-style');
    expect(offered).toContain('ship');
  }, 180_000);

  it('runs a tool in its own workspace and reports the lifecycle', async () => {
    const runtime = new ClaudeAgentRuntime({
      agentId: 'alice',
      cwd: workspace(),
      persona: 'You are Alice, a blobot teammate. Answer in as few words as possible.',
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
    expect(started[0]).toMatchObject({ toolCallId: expect.any(String) });
    // A stable id across the lifecycle is the whole reason the adapter can be trusted with
    // interleaved tools.
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

  it('finds and calls blobot own message_agent tool over loopback HTTP', async () => {
    // Ticket 15's actual claim, against the real thing: invocation, not just discovery.
    const calls: PeerMessageCall[] = [];
    const mcp = new PeerMessageServer({
      handler: async (call) => {
        calls.push(call);
        return { delivered: true, recipient: 'Bob', status: 'started' };
      },
    });
    await mcp.start();
    const endpoint = mcp.endpointFor('alice');

    const runtime = new ClaudeAgentRuntime({
      agentId: 'alice',
      cwd: workspace(),
      persona:
        'You are Alice, a blobot teammate. Bob is your teammate. Answer in as few words as ' +
        'possible, and use the message_agent tool when asked to message a teammate.',
      mcpServers: [
        {
          type: 'http',
          name: 'blobot',
          url: endpoint.url,
          headers: [{ name: 'Authorization', value: `Bearer ${endpoint.token}` }],
        },
      ],
    });
    await runtime.start();

    const events: AgentEvent[] = [];
    for await (const event of runtime.sendPrompt({
      text: "Send Bob this message, exactly: the retry loop needs a backoff",
      from: 'user',
    })) {
      events.push(event);
    }
    await runtime.stop();
    // The handshake reached us, which is the only honest readiness signal there is.
    expect(mcp.isReady('alice')).toBe(true);
    await mcp.stop();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ from: 'alice', agent: 'Bob' });
    expect(calls[0]?.message).toContain('backoff');
    // The tool surfaces as an ordinary tool call, prefixed by the server name.
    const tool = events.find(
      (event) => event.type === 'tool_call_started' && event.title.includes('message_agent'),
    );
    expect(tool).toBeDefined();
    expect(events.at(-1)).toMatchObject({ type: 'turn_ended' });
  }, 180_000);

  /**
   * The question the whole "keep a team alive, or bring it back" design rests on, and the one
   * research 15 §7 explicitly left INFERRED: **a resumed session is handed a *different*
   * loopback URL and a different bearer token.** It has to be different — the port is
   * ephemeral and the token is minted per process, so every relaunch changes both.
   *
   * §7 proved that re-supplying the *identical* entry works and that omitting it strips the
   * tool. If a changed entry were instead ignored or rejected, resume would give us an agent
   * who remembers the conversation and can no longer answer anyone in it, which is worse than
   * the amnesia it replaces.
   *
   * This also settles the second unknown for free: whether `stop()`'s `session/close` ends a
   * session for good. The first runtime here shuts down exactly as a team switch shuts it down.
   */
  it('resumes across processes onto a new loopback port, keeping both memory and its tool', async () => {
    const dir = workspace();
    const persona =
      'You are Alice, a blobot teammate. Bob is your teammate. Answer in as few words as ' +
      'possible, and use the message_agent tool when asked to message a teammate.';

    const first = new PeerMessageServer({
      handler: async () => ({ delivered: true, recipient: 'Bob', status: 'started' }),
    });
    await first.start();
    const firstEndpoint = first.endpointFor('alice');
    const before = new ClaudeAgentRuntime({
      agentId: 'alice',
      cwd: dir,
      persona,
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
    // The team switch, exactly as the app performs it: the session is closed and the bridge
    // process goes away, and so does the port its agent was told to call.
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
    const secondEndpoint = second.endpointFor('alice');
    expect(secondEndpoint.url).not.toBe(firstEndpoint.url);
    expect(secondEndpoint.token).not.toBe(firstEndpoint.token);

    const after = new ClaudeAgentRuntime({
      agentId: 'alice',
      cwd: dir,
      persona,
      resumeSessionId: sessionId,
      mcpServers: [
        {
          type: 'http',
          name: 'blobot',
          url: secondEndpoint.url,
          headers: [{ name: 'Authorization', value: `Bearer ${secondEndpoint.token}` }],
        },
      ],
      onStderr: (line) => process.stderr.write(`[bridge] ${line}\n`),
    });
    const replayed: AgentEvent[] = [];
    after.onEvent((event) => replayed.push(event));
    await after.start();
    expect(after.resumed).toBe(true);
    // The load replays the whole prior transcript. None of it reaches the app, or every
    // launch would say everything the agent has ever said over again.
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

    // It remembered, which is the point of resuming at all.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.message.toUpperCase()).toContain('CHARTREUSE');
    // And it reached the *new* server, which is what §7 could not say.
    expect(events.some((event) => event.type === 'turn_ended')).toBe(true);
  }, 300_000);

  it('cancels a turn mid-flight and leaves the session usable', async () => {
    const runtime = new ClaudeAgentRuntime({
      agentId: 'alice',
      cwd: workspace(),
      persona: 'You are Alice, a blobot teammate.',
    });
    await runtime.start();

    const events: AgentEvent[] = [];
    const turn = (async () => {
      for await (const event of runtime.sendPrompt({
        text: 'Count from 1 to 500, one number per line, with no other text.',
        from: 'user',
      })) {
        events.push(event);
        if (events.filter((candidate) => candidate.type === 'agent_message_delta').length === 5) {
          void runtime.cancel();
        }
      }
    })();
    await turn;

    expect(events.at(-1)).toMatchObject({ type: 'turn_ended', stopReason: 'cancelled' });
    expect(runtime.lifecycle).toBe('ready');

    // The process is still alive and the session still answers — cancel is not a kill.
    const after: AgentEvent[] = [];
    for await (const event of runtime.sendPrompt({ text: 'Say OK.', from: 'user' })) {
      after.push(event);
    }
    await runtime.stop();
    expect(after.at(-1)).toMatchObject({ type: 'turn_ended' });
  }, 240_000);
});
