import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../events.js';
import { PeerMessageServer } from '../../mcp/peer-message-server.js';
import type { PeerMessageCall } from '../../runtime.js';
import { CodexAgentRuntime } from './codex-agent-runtime.js';

/**
 * The real thing: a real `codex` behind the pinned bridge, a real workspace, a real turn.
 *
 * Off by default because it costs tokens and needs a signed-in machine. Turn it on with
 * `BLOBOT_LIVE_CODEX=1 pnpm -r test`. Everything else in this directory is a wire-level fake
 * built from the transcripts in `.scratch/codex-runtime/research/`; this is the only test that
 * can tell us the fake is still telling the truth.
 *
 * `CODEX_PATH` is honoured: with none set the bridge runs its own bundled `@openai/codex`,
 * which is a caret range and therefore not necessarily the version anything was verified
 * against. Point it at the binary detection found.
 */
const live = process.env.BLOBOT_LIVE_CODEX === '1' ? describe : describe.skip;

const PERSONA =
  'You are Alice, a blobot teammate. Your role is BACKEND ENGINEER. Bob is your teammate. ' +
  'Answer in as few words as possible, and use the message_agent tool when asked to message ' +
  'a teammate.';

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'blobot-live-codex-'));
  writeFileSync(join(dir, 'HELLO.txt'), 'the codeword is ZUCCHINI-42\n');
  writeFileSync(join(dir, 'notes.txt'), 'one\ntwo\nthree\n');
  return dir;
}

live('against a real codex', () => {
  it('answers in persona, under the posture blobot set, streaming deltas', async () => {
    const cwd = workspace();
    const runtime = new CodexAgentRuntime({
      agentId: 'agent_alice',
      agentName: 'Alice',
      cwd,
      persona: PERSONA,
      onStderr: (line) => process.stderr.write(`[codex] ${line}\n`),
    });

    await runtime.start();
    expect(runtime.sessionId).not.toBe('');
    // The free health check, and the one that matters most: the mode blobot asked for is the
    // mode the session is in. `agent` here would be the posture that writes to a home
    // directory without asking (research 02).
    expect(runtime.modeId).toBe('read-only');

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
    expect(answer.toLowerCase()).toContain('alice');
    expect(events.some((event) => event.type === 'agent_message_delta')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'turn_ended', stopReason: 'end_turn' });
  }, 300_000);

  /**
   * An edit in its own workspace, with the two things the shared half owes: the title is the
   * target relative to the workspace, and the diff is counted. Neither has a line of
   * Codex-specific code behind it, which is the claim `adapters/acp/` exists to make.
   */
  it('edits a file in its workspace, and says what it changed the way the others do', async () => {
    const cwd = workspace();
    const runtime = new CodexAgentRuntime({
      agentId: 'agent_alice',
      cwd,
      persona: PERSONA,
      onStderr: (line) => process.stderr.write(`[codex] ${line}\n`),
    });
    // Anything that asks is a posture failure for this prompt, so it is refused and counted.
    const asked: string[] = [];
    runtime.setPermissionHandler(async (request) => {
      asked.push(request.title);
      return null;
    });
    await runtime.start();

    const events: AgentEvent[] = [];
    for await (const event of runtime.sendPrompt({
      text: 'In notes.txt, replace the three lines with the single line: four. Then reply: done',
      from: 'user',
    })) {
      events.push(event);
    }
    await runtime.stop();

    expect(readFileSync(join(cwd, 'notes.txt'), 'utf8').trim()).toBe('four');
    // Codex announces the edit on the `tool_call` and sends a bare status update after it, so
    // the kind is on the *started* event and never on the update.
    const edits = events.filter(
      (event) => event.type === 'tool_call_started' && event.kind === 'edit',
    );
    expect(edits.length).toBeGreaterThan(0);
    // The same string the other two live suites assert for the same edit.
    expect(edits.map((event) => (event as { title?: string }).title)).toContain('notes.txt');
    // And the posture held while it did ordinary work: a write inside the workspace never asks.
    expect(asked).toEqual([]);
  }, 300_000);

  /**
   * The palette, measured rather than assumed, and the reason to run this after a Codex update.
   *
   * A real session advertised 52 commands on 2026-08-30 and blobot offered the authored slice.
   * If this prints a number that has grown, something new is being advertised and the allowlist
   * is what stopped it reaching a composer.
   */
  it('offers only what a person authored, out of everything advertised', async () => {
    const cwd = workspace();
    const runtime = new CodexAgentRuntime({ agentId: 'agent_alice', cwd, persona: PERSONA });
    const advertised: string[] = [];
    runtime.onCommandsChange((commands) => advertised.push(...commands.map((c) => c.name)));
    await runtime.start();
    // The advertisement arrives as an update just after the session exists.
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await runtime.stop();
    process.stderr.write(`[palette] offered: ${runtime.availableCommands.map((c) => c.name).join(' ')}\n`);
    const offered = runtime.availableCommands.map((command) => command.name);
    expect(offered).not.toContain('logout');
    expect(offered).not.toContain('goal');
  }, 120_000);

  /**
   * Ticket 15's loopback over the third runtime, which is the half of *two Codex agents talk to
   * each other* that is worth a test: the mailbox is the orchestrator's, and what has never been
   * proven here is that a per-agent bearer token on `127.0.0.1` reaches a Codex session at all.
   * `initialize` advertises `mcpCapabilities: { http: true }`; this is that claim, spent.
   */
  it('reaches its teammate through the loopback MCP server, with its own token', async () => {
    const calls: PeerMessageCall[] = [];
    const mcp = new PeerMessageServer({
      handler: async (call) => {
        calls.push(call);
        return { delivered: true, recipient: 'Bob', status: 'started' };
      },
    });
    await mcp.start();
    const endpoint = mcp.endpointFor('agent_alice');

    const runtime = new CodexAgentRuntime({
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
      onStderr: (line) => process.stderr.write(`[codex] ${line}\n`),
    });
    // No permission handler on purpose: Codex asks about every MCP tool call, and blobot
    // answering for its own loopback tool is what keeps a mailbox usable on this runtime.
    await runtime.start();

    const events: AgentEvent[] = [];
    for await (const event of runtime.sendPrompt({
      text:
        'Use the message_agent tool to send Bob this message, exactly: ' +
        'the retry loop needs a backoff',
      from: 'user',
    })) {
      events.push(event);
    }
    await runtime.stop();
    expect(mcp.isReady('agent_alice')).toBe(true);
    expect(
      events.some(
        (event) => event.type === 'tool_call_started' && event.title === 'mcp.blobot.message_agent',
      ),
    ).toBe(true);
    await mcp.stop();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ from: 'agent_alice', agent: 'Bob' });
    expect(calls[0]?.message).toContain('backoff');
  }, 300_000);
});
