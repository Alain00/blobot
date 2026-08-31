import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../events.js';
import { PeerMessageServer } from '../../mcp/peer-message-server.js';
import type { PeerMessageCall } from '../../runtime.js';
import { CursorAgentRuntime } from './cursor-agent-runtime.js';

/**
 * The real thing: a real `cursor-agent acp`, a real workspace, real turns.
 *
 * Off by default because it costs turns on the user's Cursor subscription and needs a
 * signed-in machine. Turn it on with `BLOBOT_LIVE_CURSOR=1 pnpm -r test`. Everything else in
 * this directory is a wire-level fake built from ticket 01's live frames; this is the only
 * suite that can tell us the fake is still telling the truth.
 *
 * Two of ticket 06's done-when items live here as **canaries**, not conveniences:
 *
 * - **The loopback door.** Cursor's published docs say ACP takes MCP servers only from
 *   `.cursor/mcp.json`; ticket 01 measured `session/new` accepting them. Because the door
 *   contradicts the docs, a release that closes it must fail here **by name** rather than
 *   shipping a team member that silently cannot address a teammate.
 * - **The sandbox versus the loopback.** The posture turns the sandbox on; the same test
 *   proves a call still reaches `127.0.0.1`, which ticket 03 requires before this ships.
 *
 * The extension reply shapes (ticket 04) get a dedicated turn that *invites* `create_plan`
 * and asserts the turn ends either way: a wrong reply shape hangs the turn into its timeout,
 * which is the measurable half. Nothing can force the model to raise the method on demand, so
 * the test prints whether it fired rather than pretending to control it.
 *
 * `CURSOR_AGENT_BIN` points at the binary if it is not on `PATH`.
 */
const live = process.env['BLOBOT_LIVE_CURSOR'] === '1' ? describe : describe.skip;

const PERSONA =
  'You are Alice, a blobot teammate. Your role is BACKEND ENGINEER. Bob is your teammate. ' +
  'Answer in as few words as possible, and use the message_agent tool when asked to message ' +
  'a teammate.';

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'blobot-live-cursor-'));
  writeFileSync(join(dir, 'HELLO.txt'), 'the codeword is ZUCCHINI-42\n');
  writeFileSync(join(dir, 'notes.txt'), 'one\ntwo\nthree\n');
  return dir;
}

function gitWorkspace(): string {
  const dir = workspace();
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  };
  git('init');
  git('-c', 'user.email=live@blobot.test', '-c', 'user.name=blobot live', 'add', '.');
  git('-c', 'user.email=live@blobot.test', '-c', 'user.name=blobot live', 'commit', '-m', 'seed');
  return dir;
}

function options(
  extra: Partial<ConstructorParameters<typeof CursorAgentRuntime>[0]> = {},
): ConstructorParameters<typeof CursorAgentRuntime>[0] {
  return {
    agentId: 'agent_alice',
    cwd: workspace(),
    configDir: mkdtempSync(join(tmpdir(), 'blobot-live-cursor-cfg-')),
    persona: PERSONA,
    onStderr: (line) => process.stderr.write(`[cursor] ${line}\n`),
    ...extra,
  };
}

live('against a real cursor-agent', () => {
  /**
   * The persona, which on Cursor rides the prompt because ticket 01 measured every other
   * channel dead. This is the test that says whether that actually makes the agent Alice —
   * under the posture, in `agent` mode, streaming.
   */
  it('answers in persona, in agent mode, streaming deltas', async () => {
    const runtime = new CursorAgentRuntime(options());

    await runtime.start();
    expect(runtime.sessionId).not.toBe('');
    expect(runtime.modeId).toBe('agent');
    // The mirror of fx: images yes, embedded text files no.
    expect(runtime.accepts).toEqual({ images: true, textFiles: false });

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
   * An edit in its own workspace, vouched by the posture so it never prompts, with the same
   * assertion the other four live suites make: the title names the target relative to the
   * workspace. Whether Cursor populates `locations` or a diff block was not among ticket 01's
   * turns, so this is also the measurement of whether the shared layer finds the target or an
   * fx-style repair is owed.
   */
  it('edits a file in its workspace without prompting, and says what it changed', async () => {
    const cwd = workspace();
    const runtime = new CursorAgentRuntime(options({ cwd, trust: 'normal' }));
    const asked: string[] = [];
    runtime.setPermissionHandler(async (request) => {
      asked.push(request.title);
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

    const titles = events
      .filter((event) => event.type === 'tool_call_started' || event.type === 'tool_call_updated')
      .map((event) => (event as { title?: string }).title);
    process.stderr.write(`[titles] ${titles.join(' | ')}\n`);
    expect(titles).toContain('notes.txt');
    // `Write(**)` is vouched at normal: an agent editing its own worktree does not ask.
    process.stderr.write(`[permissions] asked about: ${asked.join(' | ') || '(nothing)'}\n`);
    expect(asked).toEqual([]);
  }, 300_000);

  /**
   * Ticket 03's git split, live: the allow syntax `Shell(git:status*)` is documented but was
   * not among ticket 01's measurements, and this is the verification the ticket ordered before
   * believing it. `git status` must run without a permission request; `git push` must raise
   * one — the failure direction of a syntax that does not match is a prompt on `status`, which
   * this test surfaces as a finding rather than papering over. If the split cannot be
   * expressed, ticket 03 says the fallback is git wholly unlisted, and this test is what
   * reopens that conversation.
   */
  it('runs git status without asking, and still asks before git push', async () => {
    const cwd = gitWorkspace();
    const runtime = new CursorAgentRuntime(options({ cwd, trust: 'normal' }));
    const asked: string[] = [];
    runtime.setPermissionHandler(async (request) => {
      asked.push(request.title);
      // Nothing is granted: the push is refused, which is also the safe end state for a
      // repository with no remote configured.
      return request.options.find((option) => option.kind === 'reject_once')?.optionId ?? null;
    });
    await runtime.start();

    const events: AgentEvent[] = [];
    for await (const event of runtime.sendPrompt({
      text:
        'Run exactly `git status`, and tell me in one short line whether the tree is clean. ' +
        'Then run exactly `git push origin main`. If a command is not permitted, say so and stop.',
      from: 'user',
    })) {
      events.push(event);
    }
    await runtime.stop();

    process.stderr.write(`[permissions] asked about: ${asked.join(' | ') || '(nothing)'}\n`);
    expect(asked.some((title) => title.includes('git status'))).toBe(false);
    expect(asked.some((title) => title.includes('git push'))).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'turn_ended' });
  }, 300_000);

  /**
   * The canary (ticket 02) and the sandbox check (ticket 03) in one turn: a server supplied
   * only on `session/new` is offered, called through the enabled sandbox to `127.0.0.1`, and
   * arrives carrying this agent's own bearer token — with `Mcp(blobot:*)` vouched, no
   * permission request in the way.
   */
  it('reaches its teammate through a session/new-supplied loopback server', async () => {
    const calls: PeerMessageCall[] = [];
    const mcp = new PeerMessageServer({
      handler: async (call) => {
        calls.push(call);
        return { delivered: true, recipient: 'Bob', status: 'started' };
      },
    });
    await mcp.start();
    const endpoint = mcp.endpointFor('agent_alice');

    const runtime = new CursorAgentRuntime(
      options({
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
      // `Mcp(blobot:*)` is in the allowlist, so nothing should ask during a send; anything
      // that does is a finding, so it is allowed and printed.
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

  /**
   * The palette, measured rather than assumed, and the reason to re-run this after a Cursor
   * release. A real session advertised 130 commands on 2026-08-31; with nothing authored in
   * this scratch workspace the offer must stay empty — the vendor's surface, `worktree` and
   * `autopilot` included, never reaches a composer.
   */
  it('offers nothing from the vendor’s advertised surface in a bare workspace', async () => {
    const runtime = new CursorAgentRuntime(options());
    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await runtime.stop();
    const offered = runtime.availableCommands.map((command) => command.name);
    process.stderr.write(`[palette] offered: ${offered.join(' ') || '(empty)'}\n`);
    expect(offered.filter((name) => ['worktree', 'apply-worktree', 'autopilot', 'shell'].includes(name))).toEqual([]);
  }, 120_000);

  /**
   * ADR-0002's lever, live: ticket 06 ordered the setting mechanism verified rather than
   * assumed, because on Claude the option that looked right (`_meta` at session/new) measured
   * as silently ignored. Free of token cost — `session/set_config_option` runs at start and
   * no prompt is sent. The choice is read from what the session itself advertises, so a model
   * catalogue change cannot rot this test.
   */
  it('applies a model choice through session/set_config_option', async () => {
    const probe = new CursorAgentRuntime(options());
    await probe.start();
    const advertised = probe.optionGroups.find((group) => group.id === 'model');
    await probe.stop();
    const target = advertised?.choices.find((choice) => choice.isDefault !== true)?.value;
    if (target === undefined) throw new Error('the session advertised no non-default model');

    const runtime = new CursorAgentRuntime(options({ options: { model: target } }));
    await runtime.start();
    const model = runtime.optionGroups.find((group) => group.id === 'model');
    process.stderr.write(`[options] asked for ${target}, session reports ${model?.current}\n`);
    expect(model?.current).toBe(target);
    await runtime.stop();
  }, 120_000);

  /**
   * Ticket 04's reply shapes, against the real wire. The prompt invites `cursor/create_plan`;
   * whether the model reaches for it is its own decision, so the hard assertion is the one
   * that matters either way: the turn ends instead of hanging, which is exactly what a wrong
   * reply shape would break. Whether the method fired is printed so a run that never raises
   * it is legible as "still unmeasured" rather than as a pass.
   */
  it('survives a turn that invites plan approval, and never hangs on it', async () => {
    const runtime = new CursorAgentRuntime(options());
    await runtime.start();

    const events: AgentEvent[] = [];
    for await (const event of runtime.sendPrompt({
      text:
        'Propose a plan for renaming notes.txt to journal.txt and request explicit approval ' +
        'through your plan-approval facility before touching anything. Do not perform the ' +
        'rename unless the plan is approved.',
      from: 'user',
    })) {
      events.push(event);
    }
    await runtime.stop();

    expect(events.at(-1)).toMatchObject({ type: 'turn_ended' });
    const answer = events
      .filter((event) => event.type === 'agent_message_completed')
      .map((event) => event.text)
      .join('');
    process.stderr.write(`[create_plan turn] ${answer.slice(0, 300)}\n`);
  }, 300_000);
});
