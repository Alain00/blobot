import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FakeFx, FAKE_COMMANDS } from './fake-fx.js';
import { FxAgentRuntime } from './fx-agent-runtime.js';
import type { SpawnFxOptions } from './stdio.js';

function workspace(): string {
  return mkdtempSync(join(tmpdir(), 'blobot-fx-'));
}

interface Started {
  runtime: FxAgentRuntime;
  fx: FakeFx;
  spawned: SpawnFxOptions[];
  cwd: string;
}

async function start(
  options: Partial<ConstructorParameters<typeof FxAgentRuntime>[0]> = {},
  fx = new FakeFx(),
): Promise<Started> {
  const cwd = workspace();
  const spawned: SpawnFxOptions[] = [];
  const runtime = new FxAgentRuntime({
    agentId: 'alice',
    cwd,
    spawn: (spawnOptions) => {
      spawned.push(spawnOptions);
      return fx;
    },
    ...options,
  });
  await runtime.start();
  return { runtime, fx, spawned, cwd };
}

/** Drain a turn to completion, ending it on the fake once the prompt is in flight. */
async function turn(started: Started, text: string, stopReason = 'end_turn'): Promise<void> {
  const events = started.runtime.sendPrompt({ text, from: 'user' });
  const drained = (async () => {
    for await (const _ of events) void _;
  })();
  await waitFor(() => started.fx.promptInFlight);
  started.fx.endTurn(stopReason);
  await drained;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('timed out');
}

describe('fx behind AgentRuntime', () => {
  it('starts against an empty authMethods, which on fx means nothing at all', async () => {
    // The Claude adapter reads an empty list as proof of a login and Codex advertises `api-key`
    // whether or not anyone is signed in. fx advertises nothing in either state, so the field
    // carries no signal here and the adapter must not read one into it.
    const { runtime } = await start();
    expect(runtime.lifecycle).toBe('ready');
    expect(runtime.sessionId).toBe('session_fake_fx');
  });

  it('turns a refused handshake into a sentence naming fx’s own remedies', async () => {
    // Measured: an unauthenticated fx fails `initialize` itself rather than advertising a way
    // in, and every later call answers "Not initialized". Without this the user sees -32600.
    const message =
      'fx needs access to Vercel AI Gateway. Run fx login to sign in, fx setup to use an ' +
      'API key, or set AI_GATEWAY_API_KEY.';
    const runtime = new FxAgentRuntime({
      agentId: 'alice',
      cwd: workspace(),
      spawn: () => new FakeFx({ failInitialize: message }),
    });
    await expect(runtime.start()).rejects.toThrow(/fx would not start a session/);
    await expect(runtime.start()).rejects.toThrow(/Run fx login to sign in/);
  });

  it('reports an unverified version instead of refusing it, because fx is the user’s binary', async () => {
    const lines: string[] = [];
    const { runtime } = await start(
      { onStderr: (line) => lines.push(line) },
      new FakeFx({ version: '0.9.9' }),
    );
    expect(runtime.lifecycle).toBe('ready');
    expect(lines.join('\n')).toContain('verified against 0.0.7');
  });

  it('says fx takes text and refuses images, which no other real runtime does', async () => {
    const { runtime } = await start();
    expect(runtime.accepts).toEqual({ images: false, textFiles: true });
  });

  it('puts the posture in the process environment at every trust level', async () => {
    for (const trust of ['careful', 'normal', 'trusting'] as const) {
      const { spawned } = await start({ trust });
      expect(spawned[0]?.trust).toBe(trust);
    }
  });

  it('sends the persona on every turn, above the user’s words and never inside them', async () => {
    // fx has no persona channel at all, so it rides the prompt. Sending it once would not
    // survive fx compacting its own history, which blobot neither controls nor observes.
    const started = await start({ persona: 'You are Alice.' });
    await turn(started, 'first');
    const first = started.fx.lastPromptBlocks;
    expect(first).toHaveLength(2);
    expect(first[0]?.text).toContain('You are Alice.');
    expect(first[0]?.text).toContain('every turn in this session');
    expect(first[1]?.text).toBe('first');

    await turn(started, 'second');
    const second = started.fx.lastPromptBlocks;
    expect(second[0]?.text).toContain('You are Alice.');
    expect(second[1]?.text).toBe('second');
  });

  it('sends no persona block when there is no persona', async () => {
    const started = await start();
    await turn(started, 'hello');
    expect(started.fx.lastPromptBlocks).toHaveLength(1);
    expect(started.fx.lastPromptBlocks[0]?.text).toBe('hello');
  });

  it('is not persona-bound to its session, because the persona is not stored anywhere', async () => {
    const { runtime } = await start({ persona: 'You are Alice.' });
    expect(runtime.personaIsSessionBound).toBe(false);
  });

  it('asserts the posture through set_config_option, not set_mode', async () => {
    const { fx } = await start({ trust: 'trusting' }, new FakeFx({ currentModeId: 'code' }));
    expect(fx.options['mode']).toBe('ask');
    const methods = fx.received.map((message) => message.method);
    expect(methods).toContain('session/set_config_option');
    expect(methods).not.toContain('session/set_mode');
  });

  it('re-asserts the posture after a resume, because fx forgets it', async () => {
    // Measured: a session set to `code` and then loaded comes back reporting `ask`. The fake
    // reproduces that, so a resume that skipped the assertion would show up here.
    const fx = new FakeFx({ currentModeId: 'code' });
    const { runtime } = await start({ resumeSessionId: 'session_earlier', trust: 'trusting' }, fx);
    expect(runtime.resumed).toBe(true);
    expect(fx.options['mode']).toBe('ask');
  });

  it('does not fail the launch when the mode will not take', async () => {
    // The opposite of the Codex adapter, and deliberately: there the mode *is* the posture, so
    // an unconfirmed one is fatal. Here the posture is an environment variable that was set
    // before the child existed, and the ACP mode is the visible half.
    const lines: string[] = [];
    const fx = new FakeFx({ currentModeId: 'code' });
    fx.refuseSetMode = true;
    const { runtime } = await start({ onStderr: (line) => lines.push(line) }, fx);
    expect(runtime.lifecycle).toBe('ready');
    expect(lines.join('\n')).toContain('FX_PERMISSION_MODE=ask');
  });

  it('offers provider and model, and never the mode', async () => {
    const { runtime } = await start();
    expect(runtime.optionGroups.map((group) => group.id)).toEqual(['provider', 'model']);
  });

  it('applies the user’s option choices to the session', async () => {
    const { fx } = await start({ options: { model: 'anthropic/claude-sonnet-4.5' } });
    expect(fx.options['model']).toBe('anthropic/claude-sonnet-4.5');
  });

  it('re-supplies the loopback server on a resume, or message_agent is gone', async () => {
    const fx = new FakeFx();
    await start(
      {
        resumeSessionId: 'session_earlier',
        mcpServers: [
          {
            type: 'http',
            name: 'blobot',
            url: 'http://127.0.0.1:1/mcp',
            headers: [{ name: 'Authorization', value: 'Bearer alice' }],
          },
        ],
      },
      fx,
    );
    const load = fx.received.find((message) => message.method === 'session/load');
    const params = load?.params as { mcpServers?: { name?: string; headers?: unknown[] }[] };
    expect(params?.mcpServers?.[0]?.name).toBe('blobot');
    expect(params?.mcpServers?.[0]?.headers).toHaveLength(1);
  });

  it('falls back to a new session when fx has forgotten the old one', async () => {
    const lines: string[] = [];
    const { runtime } = await start(
      { resumeSessionId: 'gone', onStderr: (line) => lines.push(line) },
      new FakeFx({ failLoad: 'no such session' }),
    );
    expect(runtime.lifecycle).toBe('ready');
    expect(runtime.resumed).toBe(false);
    expect(lines.join('\n')).toContain('starting a new session');
  });

  it('offers four built-ins and never allowlist, which would edit the posture by prose', async () => {
    const started = await start();
    started.fx.advertiseCommands(FAKE_COMMANDS);
    await waitFor(() => started.runtime.availableCommands.length > 0);
    const names = started.runtime.availableCommands.map((command) => command.name);
    expect(names).toEqual(['status', 'compact']);
    expect(names).not.toContain('allowlist');
  });

  it('cancels the turn in flight', async () => {
    const started = await start();
    const events = started.runtime.sendPrompt({ text: 'go', from: 'user' });
    const drained = (async () => {
      for await (const _ of events) void _;
    })();
    await waitFor(() => started.fx.promptInFlight);
    await started.runtime.cancel();
    expect(started.fx.cancelled).toBe(true);
    started.fx.endTurn('cancelled');
    await drained;
  });

  it('reports a dead process as a fatal event rather than a rejection', async () => {
    const started = await start();
    const seen: string[] = [];
    started.runtime.onEvent((event) => seen.push(event.type));
    started.fx.crash();
    await waitFor(() => seen.includes('error'));
    expect(started.runtime.lifecycle).toBe('dead');
  });

  it('answers its own loopback tool without waiting for a human', async () => {
    // Measured live: fx asks about `mcp_blobot_message_agent` under the posture, so without
    // this every peer message on a team would stop and wait for a person. Decided on fx's own
    // generated identifier -- `mcp_<server>_<tool>`, where the server name is one blobot itself
    // supplied -- rather than on the request's `rawInput`, which on fx holds the tool's
    // arguments (`{to, body}`) and never `{server, tool}` the way Codex's does.
    const started = await start({
      mcpServers: [{ type: 'http', name: 'blobot', url: 'http://127.0.0.1:1/mcp' }],
    });
    const reply = await started.fx.requestPermission({
      toolCall: {
        toolCallId: 'call_1',
        title: 'mcp_blobot_message_agent',
        rawInput: { to: 'Bob', body: 'the retry loop needs a backoff' },
      },
      options: [
        { optionId: 'allow_once', kind: 'allow_once', name: 'Allow once' },
        { optionId: 'reject_once', kind: 'reject_once', name: 'Reject' },
      ],
    });
    expect(reply.result).toEqual({ outcome: { outcome: 'selected', optionId: 'allow_once' } });
  });

  it('does not answer for a server the user configured, only for its own', async () => {
    const started = await start({
      mcpServers: [{ type: 'http', name: 'blobot', url: 'http://127.0.0.1:1/mcp' }],
    });
    const reply = await started.fx.requestPermission({
      toolCall: { toolCallId: 'call_x', title: 'mcp_someone_else_message_agent' },
      options: [{ optionId: 'allow_once', kind: 'allow_once', name: 'Allow once' }],
    });
    // No handler is set, so an unanswered request is cancelled and never allowed.
    expect(reply.result).toEqual({ outcome: { outcome: 'cancelled' } });
  });

  it('names the edited file from the permission request, which is the only place fx says it', async () => {
    // fx's `tool_call` carries `title: "Writing"` and no `locations` and no diff block, so the
    // shared layer finds no target at all. The path is on the permission request's `rawInput`.
    const started = await start();
    started.runtime.setPermissionHandler(async (request) => request.options[0]?.optionId ?? null);
    const seen: { type: string; title?: string }[] = [];
    started.runtime.onEvent((event) => seen.push(event as never));

    started.fx.update({ sessionUpdate: 'tool_call', toolCallId: 'c1', title: 'Writing', kind: 'edit' } as never);
    await started.fx.requestPermission({
      toolCall: { toolCallId: 'c1', title: 'file_mutation', kind: 'edit', rawInput: { path: 'notes.txt' } },
      options: [{ optionId: 'allow_once', kind: 'allow_once', name: 'Allow once' }],
    });
    started.fx.update({ sessionUpdate: 'tool_call_update', toolCallId: 'c1', status: 'completed' } as never);
    await waitFor(() => seen.some((event) => event.title === 'notes.txt'));

    // The pending call keeps fx's own word, because at that moment blobot had not been told.
    expect(seen.find((event) => event.type === 'tool_call_started')?.title).toBe('Writing');
  });

  it('cancels a permission request nobody is listening to, and never allows it', async () => {
    const started = await start();
    const reply = await started.fx.requestPermission({
      toolCall: { toolCallId: 'call_2', title: 'rm -rf /' },
      options: [
        { optionId: 'allow_once', kind: 'allow_once', name: 'Allow once' },
        { optionId: 'reject_once', kind: 'reject_once', name: 'Reject' },
      ],
    });
    expect(reply.result).toEqual({ outcome: { outcome: 'cancelled' } });
  });

  it('explains a reusable approval as a live grant and sends the selected option unchanged', async () => {
    const started = await start();
    started.runtime.setPermissionHandler(async (request) => {
      const option = request.options.find((option) => option.kind === 'allow_always');
      expect(option?.description).toContain('not saved in settings or restored');
      return option?.optionId ?? null;
    });
    const reply = await started.fx.requestPermission({
      toolCall: { toolCallId: 'call_1', title: 'git push' },
      options: [{ optionId: 'always', kind: 'allow_always', name: 'Yes, and do not ask again' }],
    });
    expect(reply.result).toEqual({ outcome: { outcome: 'selected', optionId: 'always' } });
  });
});
