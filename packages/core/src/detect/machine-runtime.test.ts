import { describe, expect, it, vi } from 'vitest';
import { detectAgentRuntime, engineDetection, type AgentProbeAccess } from './machine-runtime.js';

function fixture(agentId = 'alice'): AgentProbeAccess {
  return { agentId, runtimeId: 'fx', power: () => 'awake', inspect: async (read) => read(),
    run: vi.fn(async (command) => command === 'command'
      ? { code: 0, stdout: '/guest/bin/fx\n', stderr: '' }
      : { code: 0, stdout: '{"auth":"fx login"}', stderr: '' }) };
}
describe('readiness subjects inside Machines', () => {
  it('never calls a probe to draw the login of a sleeping Agent', async () => {
    const access = fixture();
    const value = await detectAgentRuntime({ ...access, power: () => 'asleep', inspect: async () => undefined });
    expect(value).toEqual({ subject: { kind: 'agent', agentId: 'alice' }, runtimeId: 'fx',
      readiness: 'unknown', detail: 'Status unknown: it is stopped.' });
    expect(access.run).not.toHaveBeenCalled();
    expect((await detectAgentRuntime({ ...access, power: () => 'unknown', inspect: async () => undefined })).detail)
      .not.toBe('Status unknown: it is stopped.');
  });
  it('keeps different Agents’ login states separate and executes only fixed guest binary names', async () => {
    const alice = fixture();
    const bob = fixture('bob');
    const run = vi.fn(bob.run).mockResolvedValueOnce({ code: 0, stdout: '/guest/fx', stderr: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '{"auth":"missing"}', stderr: '' });
    expect((await detectAgentRuntime(alice)).readiness).toBe('ready');
    expect(await detectAgentRuntime({ ...bob, run })).toMatchObject({ subject: { kind: 'agent', agentId: 'bob' }, readiness: 'needs_sign_in' });
    expect(run.mock.calls[1]?.[0]).toBe('fx');
  });
  it('distinguishes a missing guest CLI from an unavailable transport or malformed response', async () => {
    const access = fixture();
    expect((await detectAgentRuntime({ ...access, run: async () => ({ code: 1, stdout: '', stderr: '' }) })).readiness).toBe('not_installed');
    expect((await detectAgentRuntime({ ...access, run: async () => { throw new Error('engine absent'); } })).readiness).toBe('unknown');
    expect((await detectAgentRuntime({ ...access, run: async () => ({ code: 127, stdout: '', stderr: '' }) })).readiness).toBe('unknown');
  });
  it('never confuses engine readiness with an Agent’s sign-in', () => {
    expect(engineDetection({ state: 'ready' })).toEqual({ subject: { kind: 'engine', engine: 'sbx' },
      readiness: 'ready', detail: 'Sandbox engine is ready on this computer.' });
  });
});
