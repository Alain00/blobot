import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../events.js';
import { FAKE_ADVERTISED_COMMANDS, FakeCursor } from './fake-cursor.js';
import { CursorAgentRuntime } from './cursor-agent-runtime.js';
import type { SpawnCursorOptions } from './stdio.js';

function dir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

interface Started {
  runtime: CursorAgentRuntime;
  cursor: FakeCursor;
  spawned: SpawnCursorOptions[];
  cwd: string;
  configDir: string;
}

async function start(
  options: Partial<ConstructorParameters<typeof CursorAgentRuntime>[0]> = {},
  cursor = new FakeCursor(),
): Promise<Started> {
  const cwd = dir('blobot-cursor-ws-');
  const configDir = options.configDir ?? dir('blobot-cursor-cfg-');
  const spawned: SpawnCursorOptions[] = [];
  const runtime = new CursorAgentRuntime({
    agentId: 'alice',
    cwd,
    configDir,
    spawn: (spawnOptions) => {
      spawned.push(spawnOptions);
      return cursor;
    },
    ...options,
  });
  await runtime.start();
  return { runtime, cursor, spawned, cwd, configDir };
}

/** Drain a turn to completion, ending it on the fake once the prompt is in flight. */
async function turn(started: Started, text: string, stopReason = 'end_turn'): Promise<void> {
  const events = started.runtime.sendPrompt({ text, from: 'user' });
  const drained = (async () => {
    for await (const _ of events) void _;
  })();
  await waitFor(() => started.cursor.promptInFlight);
  started.cursor.endTurn(stopReason);
  await drained;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('timed out');
}

describe('Cursor behind AgentRuntime', () => {
  it('starts, and never calls the in-protocol authenticate', async () => {
    // Ticket 05: the login is `cursor-agent login` on a PTY, run before this process exists.
    // The docs put `authenticate` between `initialize` and `session/new`; blobot does not.
    const { runtime, cursor } = await start();
    expect(runtime.lifecycle).toBe('ready');
    expect(runtime.sessionId).toBe('a252e6a7-fake-cursor');
    expect(cursor.received.map((message) => message.method)).not.toContain('authenticate');
  });

  it('writes the posture into cli-config.json, and nothing else into the config dir', async () => {
    // Ticket 01's refutation of the PR: no mcp.json (the loopback rides session/new) and no
    // rules/ (a rule there never reaches the model; the persona rides the prompt).
    const { configDir } = await start({ trust: 'normal' });
    const config = JSON.parse(readFileSync(join(configDir, 'cli-config.json'), 'utf8')) as {
      approvalMode: string;
      permissions: { allow: string[]; deny: string[] };
      sandbox: { mode: string; networkAccess: string };
    };
    expect(config.approvalMode).toBe('allowlist');
    expect(config.permissions.deny).toEqual([]);
    expect(config.permissions.allow).toContain('Mcp(blobot:*)');
    expect(config.sandbox).toEqual({ mode: 'enabled', networkAccess: 'allow_all' });
    expect(existsSync(join(configDir, 'mcp.json'))).toBe(false);
    expect(existsSync(join(configDir, 'rules'))).toBe(false);
  });

  it('preserves what the CLI keeps in cli-config.json for itself', async () => {
    // `cursor-agent` caches display settings and identity metadata into its own file; blobot
    // asserts its four fields over the top and leaves the vendor's alone.
    const configDir = dir('blobot-cursor-cfg-');
    const path = join(configDir, 'cli-config.json');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path, JSON.stringify({ hints: true, permissions: { allow: ['Shell(rm)'], deny: [] } }));
    await start({ configDir });
    const config = JSON.parse(readFileSync(path, 'utf8')) as {
      hints?: boolean;
      permissions: { allow: string[] };
    };
    expect(config.hints).toBe(true);
    // The permissions block is blobot's to assert whole: an allow-always lives in the session
    // store, never here, so overwriting cannot erase a rule the user made through the app.
    expect(config.permissions.allow).not.toContain('Shell(rm)');
  });

  it('hands the spawn the workspace and the config dir', async () => {
    const { spawned, cwd, configDir } = await start();
    expect(spawned[0]?.cwd).toBe(cwd);
    expect(spawned[0]?.configDir).toBe(configDir);
  });

  it('takes images and refuses embedded text files, the mirror of fx', async () => {
    // Measured: `promptCapabilities` says `image: true, embeddedContext: false`. The second
    // real runtime to refuse an attachment kind, and the opposite one.
    const { runtime } = await start();
    expect(runtime.accepts).toEqual({ images: true, textFiles: false });
  });

  it('sends the persona on every turn, above the user’s words and never inside them', async () => {
    const started = await start({ persona: 'You are Alice.' });
    await turn(started, 'first');
    const first = started.cursor.lastPromptBlocks;
    expect(first).toHaveLength(2);
    expect(first[0]?.text).toContain('You are Alice.');
    expect(first[0]?.text).toContain('every turn in this session');
    expect(first[1]?.text).toBe('first');

    await turn(started, 'second');
    const second = started.cursor.lastPromptBlocks;
    expect(second[0]?.text).toContain('You are Alice.');
    expect(second[1]?.text).toBe('second');
  });

  it('sends no persona block when there is no persona', async () => {
    const started = await start();
    await turn(started, 'hello');
    expect(started.cursor.lastPromptBlocks).toHaveLength(1);
  });

  it('is not persona-bound to its session, because the persona is not stored anywhere', async () => {
    const { runtime } = await start({ persona: 'You are Alice.' });
    expect(runtime.personaIsSessionBound).toBe(false);
  });

  it('confirms the measured default mode without asserting over it', async () => {
    const { runtime, cursor } = await start();
    expect(runtime.modeId).toBe('agent');
    expect(cursor.received.map((message) => message.method)).not.toContain('session/set_mode');
  });

  it('pins the mode back to agent when the session reports another', async () => {
    const { runtime, cursor } = await start({}, new FakeCursor({ currentModeId: 'plan' }));
    expect(cursor.options['mode']).toBe('agent');
    expect(runtime.modeId).toBe('agent');
  });

  it('re-asserts the mode after a resume rather than trusting it', async () => {
    // Whether a real `session/load` forgets the mode was not measured; OpenCode and fx both
    // do, so ticket 03 orders the assertion rather than the assumption.
    const cursor = new FakeCursor({ modeAfterLoad: 'plan' });
    const { runtime } = await start({ resumeSessionId: 'ses_earlier' }, cursor);
    expect(runtime.resumed).toBe(true);
    expect(cursor.options['mode']).toBe('agent');
  });

  it('re-supplies the loopback server on a resume, or message_agent is gone', async () => {
    const cursor = new FakeCursor();
    await start(
      {
        resumeSessionId: 'ses_earlier',
        mcpServers: [
          {
            type: 'http',
            name: 'blobot',
            url: 'http://127.0.0.1:1/mcp',
            headers: [{ name: 'Authorization', value: 'Bearer alice' }],
          },
        ],
      },
      cursor,
    );
    const load = cursor.received.find((message) => message.method === 'session/load');
    const params = load?.params as { mcpServers?: { name?: string; headers?: unknown[] }[] };
    expect(params?.mcpServers?.[0]?.name).toBe('blobot');
    expect(params?.mcpServers?.[0]?.headers).toHaveLength(1);
  });

  it('falls back to a new session when cursor-agent has forgotten the old one', async () => {
    const lines: string[] = [];
    const { runtime } = await start(
      { resumeSessionId: 'gone', onStderr: (line) => lines.push(line) },
      new FakeCursor({ failLoad: 'no such session' }),
    );
    expect(runtime.lifecycle).toBe('ready');
    expect(runtime.resumed).toBe(false);
    expect(lines.join('\n')).toContain('starting a new session');
  });

  it('names cursor-agent login when a session will not open', async () => {
    // Ticket 05: the in-protocol authenticate is never used, so a signed-out machine fails
    // the launch with the vendor's own remedy in the sentence, never a raw JSON-RPC error.
    const runtime = new CursorAgentRuntime({
      agentId: 'alice',
      cwd: dir('blobot-cursor-ws-'),
      configDir: dir('blobot-cursor-cfg-'),
      spawn: () => new FakeCursor({ failNewSession: 'not authenticated' }),
    });
    await expect(runtime.start()).rejects.toThrow(/cursor-agent login/);
  });

  it('offers the model group and never the mode', async () => {
    const { runtime } = await start();
    expect(runtime.optionGroups.map((group) => group.id)).toEqual(['model']);
  });

  it('applies the user’s model choice to the session', async () => {
    const { cursor } = await start({ options: { model: 'composer-2.5[fast=true]' } });
    expect(cursor.options['model']).toBe('composer-2.5[fast=true]');
  });

  it('offers none of the 130 vendor built-ins, because nothing there is vouched', async () => {
    // ADR-0003 with a zero vouched list: `worktree` and `autopilot` are somebody else's
    // version of things blobot owns, and nothing advertised is authored by a person.
    const started = await start();
    started.cursor.advertiseCommands(FAKE_ADVERTISED_COMMANDS);
    // The update must have been handled; commands stay empty rather than becoming the menu.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(started.runtime.availableCommands).toEqual([]);
  });

  it('passes a hyphenated optionId back verbatim when the handler picks it', async () => {
    // Measured: option ids come hyphenated (`allow-once`) while the kind is underscored.
    const started = await start();
    started.runtime.setPermissionHandler(async (request) => {
      expect(request.options[0]?.kind).toBe('allow_once');
      return request.options[0]?.optionId ?? null;
    });
    const reply = await started.cursor.requestPermission({
      toolCall: { toolCallId: 'call-1\nfc_1', title: '`mkdir hello`', kind: 'execute' },
      options: [
        { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'allow-always', name: 'Allow always', kind: 'allow_always' },
        { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
      ],
    });
    expect(reply.result).toEqual({ outcome: { outcome: 'selected', optionId: 'allow-once' } });
  });

  it('cancels a permission request nobody is listening to, and never allows it', async () => {
    const started = await start();
    const reply = await started.cursor.requestPermission({
      toolCall: { toolCallId: 'call-2', title: '`rm -rf /`', kind: 'execute' },
      options: [
        { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
      ],
    });
    expect(reply.result).toEqual({ outcome: { outcome: 'cancelled' } });
  });

  it('refuses a question in the agent’s channel rather than answering for the user', async () => {
    const started = await start();
    const reply = await started.cursor.askQuestion({
      sessionId: started.cursor.sessionId,
      question: 'Which database?',
      options: [{ id: 'a', label: 'Postgres' }],
    });
    expect(reply.result).toEqual({
      outcome: { outcome: 'skipped', reason: 'no user is available; continue with what you have' },
    });
  });

  it('rejects a plan, because blobot never approves one silently', async () => {
    const started = await start();
    const reply = await started.cursor.createPlan({ plan: 'step 1' });
    expect((reply.result as { outcome: { outcome: string } }).outcome.outcome).toBe('rejected');
  });

  it('answers an unknown blocking cursor method with an error, never silence', async () => {
    // Ticket 04: a future release's sixth method degrades into a visible refusal, not a hang.
    const started = await start();
    const reply = await started.cursor.sendBlocking('cursor/summon_intern', {});
    expect(reply.error).toMatchObject({ code: -32601 });
  });

  it('ignores the notification methods without breaking the stream', async () => {
    const started = await start();
    started.cursor.notify('cursor/update_todos', { todos: [] });
    started.cursor.notify('cursor/task', { status: 'done' });
    await turn(started, 'still alive');
    expect(started.runtime.lifecycle).toBe('ready');
  });

  it('passes a denied command through as the wire said it: completed', async () => {
    // The measured trap. blobot's own posture writes an empty deny list so this cannot happen
    // to a blobot agent, but a rule in the user's own ~/.cursor can still produce it, and
    // inventing a `failed` the wire never said would be editing the record.
    const started = await start();
    const seen: AgentEvent[] = [];
    started.runtime.onEvent((event) => seen.push(event));
    started.cursor.deniedShell('touch forbidden.txt');
    await waitFor(() =>
      seen.some((event) => event.type === 'tool_call_updated' && event.status === 'completed'),
    );
    expect(seen.some((event) => event.type === 'error')).toBe(false);
  });

  it('cancels the turn in flight', async () => {
    const started = await start();
    const events = started.runtime.sendPrompt({ text: 'go', from: 'user' });
    const drained = (async () => {
      for await (const _ of events) void _;
    })();
    await waitFor(() => started.cursor.promptInFlight);
    await started.runtime.cancel();
    expect(started.cursor.cancelled).toBe(true);
    started.cursor.endTurn('cancelled');
    await drained;
  });

  it('reports a dead process as a fatal event rather than a rejection', async () => {
    const started = await start();
    const seen: string[] = [];
    started.runtime.onEvent((event) => seen.push(event.type));
    started.cursor.crash();
    await waitFor(() => seen.includes('error'));
    expect(started.runtime.lifecycle).toBe('dead');
  });

  it('refuses a protocol version this adapter was not written against', async () => {
    const runtime = new CursorAgentRuntime({
      agentId: 'alice',
      cwd: dir('blobot-cursor-ws-'),
      configDir: dir('blobot-cursor-cfg-'),
      spawn: () => new FakeCursor({ protocolVersion: 2 }),
    });
    await expect(runtime.start()).rejects.toThrow(/protocol version 2/);
  });

  it('reports an unverified version instead of refusing it, when one is visible at all', async () => {
    // The measured initialize result carries no agentInfo, so the ordinary path says nothing;
    // a release that starts sending one is reported against the verified string.
    const lines: string[] = [];
    const { runtime } = await start(
      { onStderr: (line) => lines.push(line) },
      new FakeCursor({ agentInfo: { name: 'Cursor', version: '2027.01.01-abc' } }),
    );
    expect(runtime.lifecycle).toBe('ready');
    expect(lines.join('\n')).toContain('verified against 2026.08.25-3e8eec8');
  });

  it('restarts into a fresh session under the same persona and posture', async () => {
    const started = await start({ persona: 'You are Alice.' });
    started.cursor.sessionId = 'ses_fresh';
    await started.runtime.restart();
    expect(started.runtime.sessionId).toBe('ses_fresh');
    expect(started.runtime.resumed).toBe(false);
    await turn(started, 'again');
    expect(started.cursor.lastPromptBlocks[0]?.text).toContain('You are Alice.');
  });
});
