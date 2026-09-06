import { describe, expect, it, vi } from 'vitest';
import { VirtualClock } from '../clock.js';
import { MockAgentRuntime } from '../mock/mock-agent-runtime.js';
import { scenario } from '../mock/scenario.js';
import type { AgentEvent } from '../events.js';
import { LocalMachine } from './local-machine.js';
import { SleepingRuntime } from './sleeping-runtime.js';
import type { MachinePower } from './power.js';
import type { Machine } from './machine.js';

function fixture(script = scenario('reply').wait(100).say('hello', { overMs: 0 }).end()) {
  const clock = new VirtualClock();
  const machine = new LocalMachine({ agentId: 'alice', workspacePath: '/fixture' });
  const starts = vi.spyOn(machine, 'start');
  const stops = vi.spyOn(machine, 'stop');
  const runtimes: MockAgentRuntime[] = [];
  const resumes: (string | undefined)[] = [];
  const powers: MachinePower[] = [];
  const holds = { active: false };
  const runtime = new SleepingRuntime({
    machine, clock, startRequest: { mailboxPort: 3456 }, idleAfterMs: 1000,
    canSleep: () => !holds.active,
    onPowerChange: (value) => powers.push(value),
    create: (resumeSessionId) => {
      resumes.push(resumeSessionId);
      const one = new MockAgentRuntime({
        agentId: 'alice', sessionId: resumeSessionId ?? 'first-session', clock, startupMs: 0,
        script,
      });
      runtimes.push(one);
      return one;
    },
  });
  return { clock, machine, starts, stops, runtimes, resumes, powers, holds, runtime };
}

const consume = async (stream: AsyncIterable<AgentEvent>) => {
  const events: AgentEvent[] = []; for await (const event of stream) events.push(event); return events;
};

describe('sleeping Agent execution', () => {
  it('cancels a sign-in while preparing its Machine without entering the login', async () => {
    const f = fixture();
    await f.runtime.start();
    const abort = new AbortController();
    const login = vi.fn();
    f.starts.mockImplementationOnce(async ({ signal }) => {
      expect(signal).toBeDefined();
      abort.abort();
      signal!.throwIfAborted();
      return f.machine.location();
    });
    await expect(f.runtime.remedy(login, abort.signal)).rejects.toThrow();
    expect(login).not.toHaveBeenCalled();
    expect(f.stops).toHaveBeenCalledTimes(1);
    expect(f.runtime.power).toBe('asleep');
    await f.runtime.stop();
  });
  it('runs sign-in without an attached provider and retries the latest conversation afterward', async () => {
    const f = fixture();
    await f.runtime.start();
    await f.runtime.restart();
    const session = f.runtime.sessionId;
    const original = f.runtimes[0]!;
    expect(await f.runtime.remedy(async (signal) => {
      expect(signal.aborted).toBe(false);
      expect(original.lifecycle).toBe('stopped');
      expect(f.runtime.lifecycle).toBe('starting');
      expect(f.runtime.power).toBe('awake');
      await f.clock.advance(2000);
      expect(f.runtime.power).toBe('awake');
      return 'signed in';
    })).toBe('signed in');
    expect(f.runtime.power).toBe('asleep');
    expect(f.runtime.lifecycle).toBe('dead');
    await f.runtime.retryStart();
    expect(f.resumes.at(-1)).toBe(session);
    expect(f.runtime.lifecycle).toBe('ready');
    await f.runtime.stop();
  });

  it('stops the Machine after failed sign-in without losing the conversation', async () => {
    const f = fixture();
    await f.runtime.start();
    await expect(f.runtime.remedy(async () => { throw new Error('sign-in cancelled'); }))
      .rejects.toThrow('sign-in cancelled');
    expect(f.stops).toHaveBeenCalledTimes(1);
    expect(f.runtime.power).toBe('asleep');
    expect(f.runtime.lifecycle).toBe('dead');
    await f.runtime.retryStart();
    expect(f.resumes).toEqual([undefined, 'first-session']);
    await f.runtime.stop();
  });

  it('aborts sign-in on shutdown and serializes its Machine cleanup with shutdown', async () => {
    const f = fixture();
    await f.runtime.start();
    let entered!: () => void;
    const active = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void;
    const cleanup = new Promise<void>((resolve) => { release = resolve; });
    f.stops.mockImplementationOnce(() => cleanup);
    const signingIn = f.runtime.remedy((signal) => new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
      entered();
    }));
    const rejected = expect(signingIn).rejects.toThrow('cancelled');
    await active;
    const stopping = f.runtime.stop();
    await f.clock.advance(0);
    expect(f.stops).toHaveBeenCalledTimes(1);
    release();
    await rejected;
    await stopping;
    expect(f.stops).toHaveBeenCalledTimes(2);
    expect(f.runtime.power).toBe('asleep');
    expect(f.runtime.lifecycle).toBe('stopped');
    await expect(f.runtime.retryStart()).rejects.toThrow('closed');
  });

  it('preserves the adapter’s actionable launch refusal while marking power unknown', async () => {
    const f = fixture();
    vi.spyOn(f.runtimes[0]!, 'start').mockRejectedValue(new Error('This Agent needs to sign in before it can start.'));
    await expect(f.runtime.start()).rejects.toThrow('needs to sign in');
    expect(f.runtime.power).toBe('unknown');
    expect(f.runtime.lifecycle).toBe('dead');
    await f.runtime.stop();
  });
  it('inspection neither wakes a sleeping Agent nor lets idle sleep interrupt an awake probe', async () => {
    const f = fixture();
    await f.runtime.start();
    await f.runtime.sleep();
    const read = vi.fn(async () => 'ready');
    expect(await f.runtime.inspect(read)).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
    expect(f.starts).toHaveBeenCalledTimes(1);
    const turn = consume(f.runtime.sendPrompt({ text: 'wake', from: 'user' }));
    await f.clock.advance(0); await f.clock.advance(100); await turn;
    let release!: () => void;
    const inspecting = f.runtime.inspect(() => new Promise<string>((resolve) => { release = () => resolve('ready'); }));
    await f.clock.advance(0);
    await f.clock.advance(2000);
    expect(f.runtime.power).toBe('awake');
    release(); expect(await inspecting).toBe('ready');
    await f.clock.advance(0);
    expect(f.runtime.power).toBe('asleep');
    await f.runtime.stop();
  });
  it('warns before interrupting work, and a declined resource change stops nothing', async () => {
    const f = fixture();
    const change = vi.fn(async () => {});
    const configurable: Machine = f.machine; configurable.reconfigure = change;
    await f.runtime.start();
    const turn = consume(f.runtime.sendPrompt({ text: 'working', from: 'user' }));
    await f.clock.advance(0);
    const limits = { maxCpus: 3, maxMemoryBytes: 3 * 1024 ** 3 };
    await expect(f.runtime.reconfigure(limits)).rejects.toThrow('Confirm');
    const confirm = vi.fn(async () => false);
    expect(await f.runtime.reconfigure(limits, confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(change).not.toHaveBeenCalled();
    expect(f.stops).not.toHaveBeenCalled();
    await f.clock.advance(100); await turn;
    await f.runtime.stop();
  });
  it('reopens a reconfigured execution with its latest session automatically', async () => {
    const f = fixture();
    const change = vi.fn(async () => {});
    const configurable: Machine = f.machine; configurable.reconfigure = change;
    await f.runtime.start();
    const limits = { maxCpus: 3, maxMemoryBytes: 3 * 1024 ** 3 };
    expect(await f.runtime.reconfigure(limits)).toBe(true);
    expect(change).toHaveBeenCalledWith(limits);
    expect(f.stops).toHaveBeenCalledTimes(1);
    expect(f.resumes).toEqual([undefined, 'first-session']);
    expect(f.runtime.power).toBe('awake');
    await f.runtime.stop();
  });
  it('confirmed interruption cancels active work before changing resources and reopens', async () => {
    const f = fixture();
    const order: string[] = [];
    const configurable: Machine = f.machine;
    configurable.reconfigure = async () => { order.push('change'); };
    await f.runtime.start();
    const old = f.runtimes[0]!;
    const originalCancel = old.cancel.bind(old);
    vi.spyOn(old, 'cancel').mockImplementation(async () => { order.push('cancel'); await originalCancel(); });
    const turn = consume(f.runtime.sendPrompt({ text: 'working', from: 'user' }));
    await f.clock.advance(0);
    expect(await f.runtime.reconfigure({ maxCpus: 3, maxMemoryBytes: 3 * 1024 ** 3 }, async () => {
      order.push('confirm'); return true;
    })).toBe(true);
    await turn;
    expect(order).toEqual(['confirm', 'cancel', 'change']);
    expect(f.runtime.power).toBe('awake');
    expect(f.resumes).toEqual([undefined, 'first-session']);
    await f.runtime.stop();
  });
  it('holds a prompt that arrives during reconfiguration and delivers it to the reopened session', async () => {
    const f = fixture();
    let release!: () => void;
    const configurable: Machine = f.machine;
    configurable.reconfigure = () => new Promise<void>((resolve) => { release = resolve; });
    await f.runtime.start();
    const changing = f.runtime.reconfigure({ maxCpus: 3, maxMemoryBytes: 3 * 1024 ** 3 });
    await f.clock.advance(0);
    const prompt = { text: 'after the resource change', from: 'user' as const };
    const turn = consume(f.runtime.sendPrompt(prompt));
    release(); await changing;
    await f.clock.advance(100); await turn;
    expect(f.runtimes[0]?.prompts).toHaveLength(0);
    expect(f.runtimes[1]?.prompts).toEqual([prompt]);
    await f.runtime.stop();
  });
  it('keeps a permission request awake and forwards the handler after sleeping', async () => {
    const f = fixture(scenario('permission').callTool('Review this action', 'execute', { asks: true, durationMs: 0 }).end());
    let answer!: (value: string | null) => void;
    const handler = vi.fn(() => new Promise<string | null>((resolve) => { answer = resolve; }));
    f.runtime.setPermissionHandler(handler);
    await f.runtime.start();
    await f.runtime.sleep();
    f.runtime.setIdleAfterMs(10);
    const turn = consume(f.runtime.sendPrompt({ text: 'needs approval', from: 'user' }));
    await f.clock.advance(0);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(f.runtimes.at(-1)?.permissionHandler).toBe(handler);
    await f.clock.advance(10_000);
    expect(f.runtime.power).toBe('awake');
    expect(await f.runtime.sleep()).toBe(false);
    answer('allow');
    await f.clock.advance(0);
    await turn;
    await f.clock.advance(10);
    expect(f.runtime.power).toBe('asleep');
    await f.runtime.stop();
  });
  it('sleeps after inactivity and wakes to deliver the exact message once', async () => {
    const f = fixture();
    await f.runtime.start();
    await f.clock.advance(999);
    expect(f.runtime.power).toBe('awake');
    await f.clock.advance(1);
    expect(f.runtime.power).toBe('asleep');
    expect(f.stops).toHaveBeenCalledTimes(1);
    const prompt = { text: 'continue the task', from: 'user' as const };
    const turn = consume(f.runtime.sendPrompt(prompt));
    await f.clock.advance(0);
    await f.clock.advance(100);
    expect((await turn).some((event) => event.type === 'turn_ended')).toBe(true);
    expect(f.resumes).toEqual([undefined, 'first-session']);
    expect(f.runtimes[1]?.prompts).toEqual([prompt]);
    expect(f.runtime.power).toBe('awake');
    expect(f.starts).toHaveBeenCalledTimes(2);
    expect(f.powers).toEqual(['waking', 'awake', 'sleeping', 'asleep', 'waking', 'awake']);
    await f.runtime.stop();
    expect(f.clock.pendingTimers).toBe(0);
  });

  it('does not sleep in a turn, including silent work', async () => {
    const f = fixture();
    await f.runtime.start();
    f.runtime.setIdleAfterMs(10);
    const turn = consume(f.runtime.sendPrompt({ text: 'long task', from: 'peer' }));
    await f.clock.advance(0);
    await f.clock.advance(50);
    expect(f.runtime.power).toBe('awake');
    expect(await f.runtime.sleep()).toBe(false);
    expect(f.stops).not.toHaveBeenCalled();
    await f.clock.advance(50);
    await turn;
    await f.clock.advance(10);
    expect(f.runtime.power).toBe('asleep');
    await f.runtime.stop();
  });

  it('honors pending work/holds and a live change disabling automatic sleep', async () => {
    const f = fixture();
    f.holds.active = true;
    await f.runtime.start();
    await f.clock.advance(1500);
    expect(f.runtime.power).toBe('awake');
    f.runtime.setIdleAfterMs(0);
    f.holds.active = false;
    await f.clock.advance(10_000);
    expect(f.runtime.power).toBe('awake');
    f.runtime.setIdleAfterMs(1000);
    await f.clock.advance(0);
    expect(f.runtime.power).toBe('asleep');
    await f.runtime.stop();
  });

  it('resumes the latest compacted session, not the first one', async () => {
    const f = fixture();
    await f.runtime.start();
    await f.runtime.restart();
    const latest = f.runtime.sessionId;
    expect(latest).not.toBe('first-session');
    await f.runtime.sleep();
    const turn = consume(f.runtime.sendPrompt({ text: 'next', from: 'user' }));
    await f.clock.advance(0);
    await f.clock.advance(100);
    await turn;
    expect(f.resumes.at(-1)).toBe(latest);
    await f.runtime.stop();
  });

  it('serializes a message arriving during sleep', async () => {
    const f = fixture();
    await f.runtime.start();
    let release!: () => void;
    const sleeping = new Promise<void>((resolve) => { release = resolve; });
    f.stops.mockImplementationOnce(() => sleeping);
    const sleep = f.runtime.sleep();
    await f.clock.advance(0);
    expect(f.runtime.power).toBe('sleeping');
    const turn = consume(f.runtime.sendPrompt({ text: 'wake while stopping', from: 'user' }));
    release();
    await sleep;
    await f.clock.advance(0);
    await f.clock.advance(100);
    await turn;
    expect(f.runtimes.at(-1)?.prompts).toHaveLength(1);
    expect(f.runtime.power).toBe('awake');
    await f.runtime.stop();
  });

  it('does not report asleep when stopping the machine fails', async () => {
    const f = fixture();
    await f.runtime.start();
    f.stops.mockRejectedValueOnce(new Error('fixture failure'));
    await expect(f.runtime.sleep()).rejects.toThrow('could not');
    expect(f.runtime.power).toBe('unknown');
    expect(f.runtime.lifecycle).toBe('dead');
    await f.runtime.stop();
  });

  it('shutdown cannot be undone by an in-flight wake', async () => {
    const f = fixture();
    let release!: () => void;
    f.starts.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(f.machine.location()); }));
    const starting = f.runtime.start();
    await f.clock.advance(0);
    const stopping = f.runtime.stop();
    release();
    await starting;
    await stopping;
    expect(f.runtime.power).toBe('asleep');
    expect(f.runtime.lifecycle).toBe('stopped');
    await expect(consume(f.runtime.sendPrompt({ text: 'too late', from: 'user' }))).rejects.toThrow('closed');
    expect(f.clock.pendingTimers).toBe(0);
  });
  it('checks the engine before every turn and refuses work after engine loss', async () => {
    const f = fixture();
    const check = vi.fn().mockRejectedValue(new Error('engine lost'));
    const machine: Machine = f.machine;
    machine.beforeWork = check;
    await f.runtime.start();
    await expect(consume(f.runtime.sendPrompt({ text: 'must not run locally', from: 'user' }))).rejects.toThrow('verified');
    expect(check).toHaveBeenCalledTimes(1);
    expect(f.runtimes[0]?.prompts).toHaveLength(0);
    expect(f.runtime.power).toBe('unknown');
    expect(f.runtime.lifecycle).toBe('dead');
    await f.runtime.stop();
  });
});
