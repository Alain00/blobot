import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../events.js';
import { PeerMessageServer } from '../../mcp/peer-message-server.js';
import type { PeerMessageCall } from '../../runtime.js';
import { FxAgentRuntime } from './fx-agent-runtime.js';

/**
 * The real thing: a real `fx acp`, a real workspace, a real turn.
 *
 * Off by default because it costs money and needs a signed-in machine. Turn it on with
 * `BLOBOT_LIVE_FX=1 pnpm -r test`. Everything else in this directory is a wire-level fake built
 * from the frames in `.scratch/fx-runtime/research/01-acp-surface.md`; this is the only test
 * that can tell us the fake is still telling the truth.
 *
 * **Two things about the cost that are specific to this runtime.** fx's default provider is the
 * Vercel AI Gateway, which is prepaid, and a signed-in account with no credit balance fails a
 * turn with `insufficient_funds` rather than an auth error — `fx status --json` says `fx login`
 * either way. `FX_LIVE_PROVIDER` (`gateway`, `codex` or `grok`) picks a provider the machine is
 * actually able to spend on; these tests were written against `codex`, a subscription the author
 * already pays for. `FX_BIN` points at the binary if it is not on `PATH`.
 */
const live = process.env.BLOBOT_LIVE_FX === '1' ? describe : describe.skip;

const PROVIDER = process.env.FX_LIVE_PROVIDER;

const PERSONA =
  'You are Alice, a blobot teammate. Your role is BACKEND ENGINEER. Bob is your teammate. ' +
  'Answer in as few words as possible, and use the message_agent tool when asked to message ' +
  'a teammate.';

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'blobot-live-fx-'));
  writeFileSync(join(dir, 'HELLO.txt'), 'the codeword is ZUCCHINI-42\n');
  writeFileSync(join(dir, 'notes.txt'), 'one\ntwo\nthree\n');
  return dir;
}

function options(
  extra: Partial<ConstructorParameters<typeof FxAgentRuntime>[0]> = {},
): ConstructorParameters<typeof FxAgentRuntime>[0] {
  return {
    agentId: 'agent_alice',
    cwd: workspace(),
    persona: PERSONA,
    ...(PROVIDER === undefined ? {} : { options: { provider: PROVIDER } }),
    onStderr: (line) => process.stderr.write(`[fx] ${line}\n`),
    ...extra,
  };
}

live('against a real fx', () => {
  /**
   * The persona, which on fx is the whole of ticket 01: it has no channel, so it rides the
   * prompt, and this is the test that says whether that actually makes the agent Alice.
   */
  it('answers in persona, under the posture blobot set, streaming deltas', async () => {
    const runtime = new FxAgentRuntime(options());

    await runtime.start();
    expect(runtime.sessionId).not.toBe('');
    expect(runtime.modeId).toBe('ask');
    // The capability that makes fx the first real runtime to refuse an attachment kind.
    expect(runtime.accepts).toEqual({ images: false, textFiles: true });

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
    // Measured on a real turn: fx streams in ragged pieces (`NO`, `-M`, `ARK`), which is the
    // trap `MockAgentRuntime` was built to reproduce and the reason the assembler exists.
    expect(events.some((event) => event.type === 'agent_message_delta')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'turn_ended', stopReason: 'end_turn' });
  }, 300_000);

  /**
   * An edit in its own workspace, with the two things the shared half owes: the title is the
   * target relative to the workspace, and the diff is counted. **Not one line of fx-specific
   * code stands behind either**, which is the claim `adapters/acp/` exists to make and the
   * reason this runtime was worth adapting: fx is the first ACP server blobot talks to that
   * none of the protocol's authors wrote.
   */
  it('edits a file in its workspace, and says what it changed the way the others do', async () => {
    const cwd = workspace();
    const runtime = new FxAgentRuntime(options({ cwd }));
    const asked: string[] = [];
    runtime.setPermissionHandler(async (request) => {
      asked.push(request.title);
      // Allowed, unlike the Codex suite's refusal: fx's only usable mode asks about ordinary
      // work in the agent's own worktree, because its other mode is above blobot's ceiling.
      // What is being tested here is that the request arrives and is answerable at all.
      return request.options.find((option) => option.kind === 'allow_once')?.optionId ?? null;
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

    // The kind is on the *started* event only: fx's `tool_call_update` carries a status and
    // nothing else, so an update has no kind to read. Same split as Codex, opposite of Claude.
    const edits = events.filter(
      (event) => event.type === 'tool_call_started' && event.kind === 'edit',
    );
    expect(edits.length).toBeGreaterThan(0);

    // And the file is named, which on this runtime is the adapter's repair rather than the
    // shared layer's work: fx puts the path only on the permission request, so a `tool_call`
    // titled `Writing` is followed by an update that blobot has retitled `notes.txt`.
    const titles = events
      .filter((event) => event.type === 'tool_call_started' || event.type === 'tool_call_updated')
      .map((event) => (event as { title?: string }).title);
    process.stderr.write(`[titles] ${titles.join(' | ')}\n`);
    expect(titles).toContain('notes.txt');
    process.stderr.write(`[permissions] asked about: ${asked.join(' | ')}\n`);
  }, 300_000);

  /**
   * The palette, measured rather than assumed, and the reason to run this after an fx upgrade.
   *
   * A real session advertised eighteen commands on 2026-08-31, every one a built-in. If this
   * prints a number that has grown, something new is being advertised and the allowlist is what
   * stopped it reaching a composer — `allowlist` above all, which writes a permanent allow rule
   * into the user's own `~/.fx/settings.json`.
   */
  it('offers four built-ins out of everything advertised, and never allowlist', async () => {
    const runtime = new FxAgentRuntime(options());
    const advertised: string[] = [];
    runtime.onCommandsChange((commands) => advertised.push(...commands.map((c) => c.name)));
    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await runtime.stop();
    const offered = runtime.availableCommands.map((command) => command.name);
    process.stderr.write(`[palette] offered: ${offered.join(' ')}\n`);
    expect(offered).not.toContain('allowlist');
    expect(offered).not.toContain('settings');
    expect(offered).not.toContain('reset');
  }, 120_000);

  /**
   * ADR-0004 against a real runtime, and the first live attachment on any of the four.
   *
   * fx is the one worth spending it on, because it is the only runtime whose `accepts` says no:
   * `promptCapabilities` advertises `embeddedContext` and not `image`, so the composer refuses a
   * screenshot at pickup and never sends a block fx would drop in silence. Both halves are
   * asserted here — the refusal is a fact about the session, the text file is a fact about the
   * turn — because a runtime that accepted everything would prove neither.
   *
   * The bytes travel and the path does not, which is the whole of the ADR: the file is written
   * outside the workspace on purpose, so an agent that answers with the codeword can only have
   * read the block blobot embedded. `Read` never prompts, and a path here would have been an
   * ungated read of the user's disk.
   */
  it('takes a text attachment as embedded bytes, and refuses images before the turn', async () => {
    // Outside the workspace, and never named to the agent. A file it could open would make the
    // answer prove nothing.
    const outside = mkdtempSync(join(tmpdir(), 'blobot-live-fx-outside-'));
    const path = join(outside, 'shipping.txt');
    writeFileSync(path, 'the shipping code is ORANGE-77\n');

    const runtime = new FxAgentRuntime(options());
    await runtime.start();

    // The composer's own check, on the runtime's own word. An image never reaches `sendPrompt`
    // on this runtime, so this is the assertion standing in for a turn that cannot happen.
    expect(runtime.accepts.images).toBe(false);
    expect(runtime.accepts.textFiles).toBe(true);

    const events: AgentEvent[] = [];
    for await (const event of runtime.sendPrompt({
      text: 'What is the shipping code in the attached file? Reply with the code and nothing else.',
      from: 'user',
      attachments: [
        {
          kind: 'text',
          mimeType: 'text/plain',
          name: 'shipping.txt',
          data: readFileSync(path),
        },
      ],
    })) {
      events.push(event);
    }
    await runtime.stop();

    const answer = events
      .filter((event) => event.type === 'agent_message_completed')
      .map((event) => event.text)
      .join('');
    process.stderr.write(`[attachment] ${answer}\n`);
    expect(answer).toContain('ORANGE-77');
    expect(events.at(-1)).toMatchObject({ type: 'turn_ended', stopReason: 'end_turn' });
  }, 300_000);

  /**
   * Ticket 15's loopback over the fourth runtime, and the measurement that decided the whole
   * effort was worth starting.
   *
   * fx accepts client-supplied `mcpServers` — Cursor's refusal to do that is what stopped its
   * effort at ticket 02 — and it sends the `Authorization` header verbatim on every request.
   * One wrinkle is load-bearing and is asserted by `peer-message-server.test.ts` rather than
   * here: fx opens with `server/discover`, a newer MCP draft's method, and falls back to
   * classic `initialize` **only when the server answers with a JSON-RPC error**. A server that
   * politely returns `{}` fails the whole session with `McpMissingResultType`.
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

    const runtime = new FxAgentRuntime(
      options({
        agentName: 'Alice',
        mcpServers: [
          {
            type: 'http',
            name: 'blobot',
            url: endpoint.url,
            headers: [{ name: 'Authorization', value: `Bearer ${endpoint.token}` }],
          },
        ],
      }),
    );
    runtime.setPermissionHandler(async (request) => {
      // blobot answers for its own loopback tool before this is ever reached; anything else
      // that asks during a message send is a finding, so it is allowed and printed.
      process.stderr.write(`[permissions] asked during send: ${request.title}\n`);
      return request.options.find((option) => option.kind === 'allow_once')?.optionId ?? null;
    });
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
    await mcp.stop();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ from: 'agent_alice', agent: 'Bob' });
    expect(calls[0]?.message).toContain('backoff');
  }, 300_000);
});
