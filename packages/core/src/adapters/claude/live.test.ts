import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../events.js';
import { ClaudeAgentRuntime } from './claude-agent-runtime.js';

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
