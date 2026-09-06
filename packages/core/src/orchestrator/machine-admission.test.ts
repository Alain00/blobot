import { describe, expect, it, vi } from 'vitest';
import { VirtualClock } from '../clock.js';
import { LocalMachine } from '../machines/local-machine.js';
import type { Machine } from '../machines/machine.js';
import { SleepingRuntime } from '../machines/sleeping-runtime.js';
import { MockAgentRuntime } from '../mock/mock-agent-runtime.js';
import { scenario } from '../mock/scenario.js';
import type { Agent, AttachmentContent, Team } from './domain.js';
import { InMemoryMessageStore } from './message-store.js';
import { Orchestrator } from './orchestrator.js';

const team: Team = { id: 'team', name: 'Team', workspaceKind: 'git', workspacePath: '/repo', turnBudget: 10 };
const agents: Agent[] = ['Alice', 'Bob'].map((name) => ({
  id: name, name, role: 'developer', teamId: team.id, workspacePath: `/repo/${name}`,
}));
const attachment: AttachmentContent = {
  id: 'image', kind: 'image', mimeType: 'image/png', bytes: 4,
  data: new Uint8Array([1, 2, 3, 4]), at: 0,
};

function fixture(turnBudget = 10) {
  const clock = new VirtualClock();
  const store = new InMemoryMessageStore();
  const mocks: Record<string, MockAgentRuntime[]> = { Alice: [], Bob: [] };
  const machines = new Map<string, Machine>();
  const runtimes = new Map<string, SleepingRuntime>();
  for (const agent of agents) {
    const machine = new LocalMachine({ agentId: agent.id, workspacePath: agent.workspacePath });
    machines.set(agent.id, machine);
    runtimes.set(agent.id, new SleepingRuntime({
      clock, machine, startRequest: { mailboxPort: 4321 }, idleAfterMs: 0, canSleep: () => true,
      create: (resumeSessionId) => {
        const runtime = new MockAgentRuntime({
          agentId: agent.id, clock, startupMs: 0, sessionId: resumeSessionId ?? `${agent.id}-session`,
          script: scenario('answer').wait(100).say('ok', { overMs: 0 }).end(),
        });
        mocks[agent.id]!.push(runtime);
        return runtime;
      },
    }));
  }
  const orchestrator = new Orchestrator({ team: { ...team, turnBudget }, agents, runtimes, store, clock });
  const drain = async (work: Promise<unknown>) => { await clock.runAll(); await work; await orchestrator.settled(); };
  return { clock, store, mocks, machines, runtimes, orchestrator, drain };
}

describe('Machine admission and mailbox recovery', () => {
  it('keeps an unsigned member’s message and bytes while the other member answers; retries only that member', async () => {
    const f = fixture();
    vi.spyOn(f.mocks.Alice![0]!, 'start').mockRejectedValue(new Error('Sign in to continue.'));
    await f.drain(f.orchestrator.start());
    f.store.putAttachment(attachment);
    await f.drain(f.orchestrator.promptFromUser(['Alice', 'Bob'], 'Look at this', [attachment.id]));
    expect(f.orchestrator.mailbox('Alice')).toHaveLength(1);
    expect(f.orchestrator.mailbox('Bob')).toHaveLength(0);
    expect(f.mocks.Alice![0]!.prompts).toHaveLength(0);
    expect(f.mocks.Bob![0]!.prompts).toHaveLength(1);
    expect(f.orchestrator.injectionOf('Alice').attachmentCount).toBe(0);

    const retry = f.orchestrator.retryAgent('Alice');
    expect(f.orchestrator.retryAgent('Alice')).toBe(retry);
    await f.drain(retry);
    expect(f.mocks.Alice).toHaveLength(2);
    expect(f.mocks.Bob).toHaveLength(1);
    expect(f.mocks.Alice![1]!.sessionId).toBe('Alice-session');
    expect(f.mocks.Alice![1]!.prompts).toMatchObject([{
      from: 'user', text: 'Look at this', attachments: [{ data: attachment.data }],
    }]);
    expect(f.orchestrator.mailbox('Alice')).toHaveLength(0);
    expect(f.orchestrator.injectionOf('Alice')).toMatchObject({ attachmentCount: 1, attachmentBytes: 4 });
  });

  it('does not deliver or spend a turn when the final Machine check fails', async () => {
    const f = fixture(1);
    const check = vi.fn().mockRejectedValueOnce(new Error('Engine unavailable')).mockResolvedValue(undefined);
    f.machines.get('Alice')!.beforeWork = check;
    await f.drain(f.orchestrator.start());
    await f.drain(f.orchestrator.promptFromUser(['Alice'], 'Keep this message'));
    expect(f.orchestrator.mailbox('Alice')).toHaveLength(1);
    expect(f.mocks.Alice![0]!.prompts).toHaveLength(0);
    expect(check).toHaveBeenCalledTimes(1);
    expect(f.orchestrator.statusOf('Alice')).toBe('failed');
    const peer = await f.orchestrator.handleMessageAgent({
      from: 'Alice', agent: 'Bob', message: 'Can you help?', idempotencyKey: 'peer',
    });
    expect(peer.status).toBe('started');
    await f.drain(Promise.resolve());
    expect(f.mocks.Bob![0]!.prompts).toHaveLength(1);
    // Explicit budget release is still needed after Bob used the last slot.
    await f.drain(f.orchestrator.retryAgent('Alice'));
    expect(f.orchestrator.mailbox('Alice')).toHaveLength(1);
    f.orchestrator.resumeAfterBudget();
    await f.drain(Promise.resolve());
    expect(f.mocks.Alice![1]!.prompts).toHaveLength(1);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('reserves the last budget slot during wake, before accepting a second peer wake', async () => {
    const f = fixture(1);
    await f.drain(f.orchestrator.start());
    let release!: () => void;
    f.machines.get('Alice')!.beforeWork = () => new Promise<void>((resolve) => { release = resolve; });
    const first = await f.orchestrator.handleMessageAgent({
      from: 'Bob', agent: 'Alice', message: 'First', idempotencyKey: 'first',
    });
    await f.clock.advance(0);
    expect(first.status).toBe('started');
    const second = await f.orchestrator.handleMessageAgent({
      from: 'Alice', agent: 'Bob', message: 'Second', idempotencyKey: 'second',
    });
    expect(second.status).toBe('queued');
    expect(f.orchestrator.mailbox('Alice')).toHaveLength(1);
    release(); await f.drain(Promise.resolve());
    expect(f.mocks.Alice![0]!.prompts).toHaveLength(1);
    expect(f.mocks.Bob![0]!.prompts).toHaveLength(0);
  });

  it('delivers new arrivals after startup without automatically draining a persisted backlog', async () => {
    const f = fixture();
    f.store.commit({ id: 'old', teamId: team.id, fromAgentId: 'Alice', toAgentId: 'Bob', body: 'Old mail', at: 0 });
    const original = f.mocks.Alice![0]!.start.bind(f.mocks.Alice![0]!);
    vi.spyOn(f.mocks.Alice![0]!, 'start').mockImplementation(async () => { await f.clock.sleep(100); await original(); });
    const starting = f.orchestrator.start();
    await f.clock.advance(0);
    await f.orchestrator.promptFromUser(['Alice'], 'New mail');
    expect(f.orchestrator.mailbox('Alice')).toHaveLength(1);
    await f.drain(starting);
    expect(f.mocks.Alice![0]!.prompts).toHaveLength(1);
    expect(f.mocks.Bob![0]!.prompts).toHaveLength(0);
    expect(f.orchestrator.mailbox('Bob')).toHaveLength(1);
  });

  it('retains each queued user attachment with its message and preserves peer ordering', async () => {
    const f = fixture();
    await f.drain(f.orchestrator.start());
    f.store.putAttachment(attachment);
    const running = f.orchestrator.promptFromUser(['Alice'], 'First turn');
    await f.clock.advance(0);
    await f.orchestrator.handleMessageAgent({ from: 'Bob', agent: 'Alice', message: 'Before the image', idempotencyKey: 'before' });
    await f.orchestrator.promptFromUser(['Alice'], 'Explain this image', [attachment.id]);
    await f.orchestrator.handleMessageAgent({ from: 'Bob', agent: 'Alice', message: 'After the image', idempotencyKey: 'after' });
    expect(f.orchestrator.injectionOf('Alice').attachmentCount).toBe(0);
    await f.drain(running);
    const prompts = f.mocks.Alice![0]!.prompts;
    expect(prompts).toHaveLength(4);
    expect(prompts[1]).toMatchObject({ from: 'peer', text: expect.stringContaining('Before the image') });
    expect(prompts[2]).toMatchObject({ from: 'user', text: 'Explain this image', attachments: [{ data: attachment.data }] });
    expect(prompts[3]).toMatchObject({ from: 'peer', text: expect.stringContaining('After the image') });
    expect(f.orchestrator.injectionOf('Alice').attachmentCount).toBe(1);
  });

  it('reconstructs the adapter even when Machine startup failed before adapter startup', async () => {
    const f = fixture();
    vi.spyOn(f.machines.get('Alice')!, 'start').mockRejectedValueOnce(new Error('Unavailable'));
    await f.drain(f.orchestrator.start());
    await f.orchestrator.promptFromUser(['Alice'], 'Try after setup');
    await f.drain(f.orchestrator.retryAgent('Alice'));
    expect(f.mocks.Alice![0]!.prompts).toHaveLength(0);
    expect(f.mocks.Alice![1]!.prompts).toHaveLength(1);
  });

  it('submits nothing when recording admission fails', async () => {
    const f = fixture();
    await f.drain(f.orchestrator.start());
    vi.spyOn(f.store, 'markDelivered').mockImplementation(() => { throw new Error('Cannot record delivery'); });
    await f.drain(f.orchestrator.promptFromUser(['Alice'], 'Do not lose this'));
    expect(f.orchestrator.mailbox('Alice')).toHaveLength(1);
    expect(f.mocks.Alice![0]!.prompts).toHaveLength(0);
  });

  it('does not silently drop a missing attachment or retry it forever', async () => {
    const f = fixture();
    f.store.commit({ id: 'old', teamId: team.id, fromAgentId: null, toAgentId: 'Alice', body: 'Image', at: 0,
      attachments: [{ id: 'missing', kind: 'image', mimeType: 'image/png', bytes: 4 }] });
    await f.drain(f.orchestrator.start());
    await f.drain(f.orchestrator.retryAgent('Alice'));
    expect(f.orchestrator.mailbox('Alice')).toHaveLength(1);
    expect(f.orchestrator.statusOf('Alice')).toBe('failed');
    expect(f.mocks.Alice![0]!.prompts).toHaveLength(0);
  });
});
