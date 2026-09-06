import { afterEach, expect, it, vi } from 'vitest';
import { MachineLogin, MockAgentRuntime, SleepingRuntime, SystemClock, scenario, type AgentRecord } from '@blobot/core';
import { MachineLogins } from './machine-login.js';
import { DesktopBoxMachine, DesktopMachines } from './machines.js';

afterEach(() => vi.restoreAllMocks());
async function fixture() {
  const record: AgentRecord = { id: 'alice', teamId: 'team', name: 'Alice', role: 'Engineer', runtimeId: 'claude-code',
    workspacePath: '/fixture', createdAt: 0, machine: { kind: 'box', limits: { maxCpus: 2, maxMemoryBytes: 4 * 1024 ** 3 } } };
  const team = { id: 'team', name: 'Team', workspacePath: '/fixture', workspaceKind: 'plain', turnBudget: 10, createdAt: 0 } as const;
  const machine = new DesktopBoxMachine(new DesktopMachines('/unused-test-fixture'), record, team);
  vi.spyOn(machine, 'start').mockResolvedValue(machine.location());
  vi.spyOn(machine, 'stop').mockResolvedValue();
  vi.spyOn(machine, 'checkRuntime').mockResolvedValue({ subject: { kind: 'agent', agentId: record.id }, readiness: 'ready', detail: 'Ready in this Agent’s Machine.' });
  const clock = new SystemClock();
  const execution = new SleepingRuntime({ machine, clock, startRequest: { mailboxPort: 12345 }, canSleep: () => true,
    create: (sessionId) => new MockAgentRuntime({ agentId: record.id, sessionId: sessionId ?? 'conversation', clock, startupMs: 0, script: scenario('empty').end() }) });
  await execution.start();
  const retry = vi.fn(async () => execution.retryStart());
  const open = vi.fn(async () => {});
  const logins = new MachineLogins((teamId, agentId) => {
    if (teamId !== 'team' || agentId !== 'alice') throw new Error('Wrong agent');
    return { record, machine, execution, retry };
  }, () => {}, open);
  return { machine, execution, retry, open, logins };
}

it('keeps browser challenges ephemeral, scopes inputs to an attempt and resumes only after a fresh probe', async () => {
  const f = await fixture();
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => { finish = resolve; });
  vi.spyOn(MachineLogin.prototype, 'run').mockImplementation(async (_signal, emit) => {
    await emit({ kind: 'browser', url: 'https://claude.com/cai/oauth/authorize?state=fixture', input: 'Paste code',
      callback: { port: 1455, path: '/auth/callback', state: 'private-fixture-state' } });
    await waiting;
  });
  const respond = vi.spyOn(MachineLogin.prototype, 'respond').mockImplementation(() => finish());
  try {
    const id = f.logins.start('team', 'alice', 'subscription');
    await expect.poll(() => f.logins.view('team', 'alice').challenge?.kind).toBe('browser');
    expect(f.execution.lifecycle).toBe('starting');
    expect(f.logins.view('team', 'alice').challenge).not.toHaveProperty('callback');
    expect(() => f.logins.start('team', 'alice', 'subscription')).toThrow('in progress');
    await expect(f.logins.open('team', 'alice', 'stale')).rejects.toThrow('no longer active');
    expect(() => f.logins.respond('team', 'alice', 'stale', 'secret')).toThrow('no longer active');
    expect(respond).not.toHaveBeenCalled();
    await f.logins.open('team', 'alice', id);
    expect(f.open).toHaveBeenCalledWith('https://claude.com/cai/oauth/authorize?state=fixture');
    f.logins.respond('team', 'alice', id, 'one-use');
    await expect.poll(() => f.logins.view('team', 'alice').operation?.phase).toBe('done');
    expect(f.retry).toHaveBeenCalledTimes(1);
    expect(f.machine.checkRuntime).toHaveBeenCalledTimes(1);
    expect(f.execution.sessionId).toBe('conversation');
    expect(f.logins.view('team', 'alice').challenge).toBeUndefined();
  } finally { finish(); await f.logins.close(); await f.execution.stop(); }
});

it('cancels a waiting login without retrying or retaining its code', async () => {
  const f = await fixture();
  vi.spyOn(MachineLogin.prototype, 'run').mockImplementation(async (signal, emit) => {
    await emit({ kind: 'browser', url: 'https://example.com/login', code: 'one-use' });
    await new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
      if (signal.aborted) reject(new Error('cancelled'));
    });
  });
  try {
    const id = f.logins.start('team', 'alice', 'subscription');
    await expect.poll(() => f.logins.view('team', 'alice').challenge?.kind).toBe('browser');
    f.logins.cancel('team', 'alice', id);
    await expect.poll(() => f.logins.view('team', 'alice').operation?.phase).toBe('cancelled');
    expect(f.logins.view('team', 'alice').challenge).toBeUndefined();
    expect(f.retry).not.toHaveBeenCalled();
    expect(f.execution.power).toBe('asleep');
  } finally { await f.logins.close(); await f.execution.stop(); }
});
