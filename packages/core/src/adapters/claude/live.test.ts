import { execFileSync } from 'node:child_process';
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
  /**
   * A tool line as the transcript will draw it: the verb blobot puts in its own column, and a
   * title that is the target and nothing else.
   *
   * Both halves of this are claims about the wire and can only be tested here. The bridge
   * titles a call `Edit notes.txt` and names the tool in `_meta.claudeCode.toolName`, so the
   * fold read `edit  Edit notes.txt` until `withoutToolVerb`. And ACP's `diff` block is what
   * the line counts come from — no adapter parses `rawInput` for them, which is why a second
   * runtime that sends the block is counted for free.
   */
  it('gives an edit a bare target and a count of what it changed', async () => {
    const dir = workspace();
    writeFileSync(join(dir, 'notes.txt'), 'alpha\nbeta\ngamma\ndelta\nepsilon\n');
    const runtime = new ClaudeAgentRuntime({
      agentId: 'alice',
      cwd: dir,
      persona: 'You are Alice. Do exactly what is asked, with no commentary.',
      trust: 'trusting',
    });
    await runtime.start();
    const events: AgentEvent[] = [];
    for await (const event of runtime.sendPrompt({
      text: 'Using the Edit tool on notes.txt, replace the single line "beta" with three lines: "beta one", "beta two", "beta three". Change nothing else.',
      from: 'user',
    })) {
      events.push(event);
    }
    await runtime.stop();

    const edits = events.filter(
      (event) =>
        (event.type === 'tool_call_started' || event.type === 'tool_call_updated') &&
        event.kind === 'edit',
    );
    expect(edits.length).toBeGreaterThan(0);
    // Not one title still leading with the provider's own verb.
    for (const edit of edits) {
      const title = (edit as { title?: string }).title;
      if (title === undefined) continue;
      expect(title).not.toMatch(/^(Edit|Write|Read|Update) /);
    }
    // And once the arguments have landed, the title is the target, relative to the workspace —
    // the same string OpenCode's live test asserts for the same edit.
    expect(edits.map((edit) => (edit as { title?: string }).title)).toContain('notes.txt');
    // And the diff block reached the vocabulary: three lines for one.
    const counted = events.find(
      (event) => event.type === 'tool_call_updated' && event.changed !== undefined,
    );
    expect(counted).toMatchObject({ changed: { added: 3, removed: 1 } });
  }, 300_000);

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

  /**
   * Ticket 14's 2026-08-30 amendment, against the thing it is a claim about.
   *
   * The amendment rests on one fact the fake bridge cannot establish: that `allowedTools` in
   * `_meta.claudeCode.options` is honoured as a permission rule rather than discarded like
   * `permissionMode` beside it. If it were discarded, `default` mode would raise a request here
   * and the agent would sit in `waiting` forever, which is exactly the bug this replaces.
   */
  it('writes a file in its own workspace without asking, because blobot vouched for it', async () => {
    const runtime = new ClaudeAgentRuntime({
      agentId: 'alice',
      cwd: workspace(),
      persona: 'You are Alice, a blobot teammate. Answer in as few words as possible.',
    });
    // Nobody is listening, which is the unattended case: a request that arrives is cancelled and
    // the write never happens. The assertion is that none arrives.
    const requests: string[] = [];
    runtime.setPermissionHandler(async (request) => {
      requests.push(request.title);
      return null;
    });
    await runtime.start();

    const events: AgentEvent[] = [];
    for await (const event of runtime.sendPrompt({
      text: 'Create a file called NOTE.txt in this directory containing exactly: ZUCCHINI-42. ' +
        'Then reply with the word DONE.',
      from: 'user',
    })) {
      events.push(event);
    }
    await runtime.stop();

    expect(requests).toEqual([]);
    expect(
      events
        .filter((event) => event.type === 'agent_message_completed')
        .map((event) => event.text)
        .join(''),
    ).toContain('DONE');
  }, 180_000);

  it('asks about the same write when the agent is careful', async () => {
    // The selector, end to end: same prompt, same workspace, one word different on the agent.
    const runtime = new ClaudeAgentRuntime({
      agentId: 'alice',
      cwd: workspace(),
      persona: 'You are Alice, a blobot teammate. Answer in as few words as possible.',
      trust: 'careful',
    });
    const requests: string[] = [];
    runtime.setPermissionHandler(async (request) => {
      requests.push(request.title);
      return null;
    });
    await runtime.start();

    for await (const _event of runtime.sendPrompt({
      text: 'Create a file called NOTE.txt in this directory containing exactly: ZUCCHINI-42.',
      from: 'user',
    })) {
      // The request is the assertion.
    }
    await runtime.stop();

    expect(requests.length).toBeGreaterThan(0);
  }, 180_000);

  /**
   * The other half of the same claim, and the one that keeps it from being vacuous: an
   * allowlist that allowed everything would pass the test above too.
   */
  it('still asks about a command blobot did not vouch for', async () => {
    const runtime = new ClaudeAgentRuntime({
      agentId: 'alice',
      cwd: workspace(),
      persona: 'You are Alice, a blobot teammate. Answer in as few words as possible.',
    });
    const requests: string[] = [];
    runtime.setPermissionHandler(async (request) => {
      requests.push(request.title);
      return null;
    });
    await runtime.start();

    for await (const _event of runtime.sendPrompt({
      text: 'Run this exact shell command and tell me what it printed: chmod 644 HELLO.txt',
      from: 'user',
    })) {
      // The turn's content is not the assertion; the request that interrupts it is.
    }
    await runtime.stop();

    expect(requests.length).toBeGreaterThan(0);
  }, 180_000);

  /**
   * The user's own settings still win, which is the answer to *"how do I change this?"*.
   *
   * `settingSources` includes `project`, and settings precedence puts `ask` and `deny` above
   * `allow` — which is where `allowedTools` lands. So a `.claude/settings.json` in the folder the
   * team was made from asks for the vouching back, and blobot does not have the last word on its
   * own posture. Asserted here because it is a claim the UI makes on blobot's behalf.
   */
  it('gives the vouching back when the user asks for it in their own settings', async () => {
    const dir = workspace();
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(
      join(dir, '.claude', 'settings.json'),
      JSON.stringify({ permissions: { ask: ['Write'] } }),
    );
    const runtime = new ClaudeAgentRuntime({
      agentId: 'alice',
      cwd: dir,
      persona: 'You are Alice, a blobot teammate. Answer in as few words as possible.',
    });
    const requests: string[] = [];
    runtime.setPermissionHandler(async (request) => {
      requests.push(request.title);
      return null;
    });
    await runtime.start();

    for await (const _event of runtime.sendPrompt({
      text: 'Create a file called NOTE.txt in this directory containing exactly: ZUCCHINI-42.',
      from: 'user',
    })) {
      // Again the request is the assertion, not the answer.
    }
    await runtime.stop();

    expect(requests.length).toBeGreaterThan(0);
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

/**
 * The fourth trust level, against the classifier it delegates to.
 *
 * This exists because the level shipped with a false claim in it. `trust.ts` said the refusals
 * survived `auto` -- *"what changes is who answers, not whether it is asked about"* -- and three
 * runs on 2026-08-31 disproved it: `chmod 777` ran, `sudo -n true` ran, and `git push` put a
 * commit on a real remote, none of them raising a permission request. Absent from `allowedTools`
 * is not refused. `disallowedTools` is, and this test is the only place that can say so, because
 * every other test in this directory is talking to a fake that answers however we wrote it.
 */
live('the fourth trust level', () => {
  it('refuses a push at unattended, and leaves the remote empty', async () => {
    const root = mkdtempSync(join(tmpdir(), 'blobot-live-push-'));
    const bare = join(root, 'origin.git');
    const work = join(root, 'work');
    const git = (cwd: string, ...args: string[]): string =>
      execFileSync('git', args, { cwd, encoding: 'utf8' });
    execFileSync('git', ['init', '--bare', '-b', 'main', bare]);
    execFileSync('git', ['init', '-b', 'main', work]);
    writeFileSync(join(work, 'a.txt'), 'one\n');
    git(work, 'add', '.');
    git(work, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'first');
    git(work, 'remote', 'add', 'origin', bare);

    const runtime = new ClaudeAgentRuntime({
      agentId: 'alice',
      cwd: work,
      persona: 'You are Alice. Do exactly what is asked, with no commentary.',
      trust: 'unattended',
    });
    // Nobody may be asked at this level, so a request arriving here is itself the failure.
    const asked: string[] = [];
    runtime.setPermissionHandler(async (request) => {
      asked.push(request.title);
      return null;
    });
    await runtime.start();
    // The level took, which is the other half of what this test is for: `auto` is advertised
    // only on models that support it, and a silent fallback would make everything below vacuous.
    expect(runtime.permissionMode).toBe('auto');

    const events: AgentEvent[] = [];
    for await (const event of runtime.sendPrompt({
      text: 'Push the current branch with the Bash tool: git push -u origin main',
      from: 'user',
    })) {
      events.push(event);
    }
    await runtime.stop();

    // The commit did not land. This is the assertion the whole level rests on: without the deny
    // list the same prompt pushed successfully, measured.
    let onRemote = '';
    try {
      onRemote = git(bare, 'log', '--oneline', 'main');
    } catch {
      onRemote = '';
    }
    expect(onRemote).toBe('');

    // And it was refused rather than asked about: `auto` never hands blobot the question, so a
    // level that relied on the block in the transcript would stall or silently allow instead.
    expect(asked).toEqual([]);
    const failures = events.filter(
      (event) => event.type === 'tool_call_updated' && event.status === 'failed',
    );
    expect(failures.length).toBeGreaterThan(0);
  }, 120_000);
});
