import { describe, expect, it, vi } from 'vitest';
import { SbxEngine, type SbxCommandResult } from './engine.js';
import { SBX_DEVELOPMENT_PIN } from './observations.js';

function fixture() {
  const run = vi.fn(async (args: readonly string[]): Promise<SbxCommandResult> => {
    let data: unknown = {};
    if (args[0] === 'daemon' && args[1] === 'status') data = { status: 'running' };
    if (args[0] === 'version') data = { client: SBX_DEVELOPMENT_PIN, server: { ...SBX_DEVELOPMENT_PIN, state: 'running' } };
    if (args[0] === 'settings' && args[1] === 'get') data = { key: 'ssh.agentForwardingEnabled', type: 'bool', value: false };
    if (args[0] === 'diagnose') data = { checks: [{ name: 'Authentication', status: 'pass' }] };
    if (args[0] === 'ls') data = { sandboxes: [] };
    return { code: 0, stdout: JSON.stringify(data) };
  });
  return { run, engine: new SbxEngine(run) };
}
describe('explicit sbx engine setup and readiness', () => {
  it('onboarding reuses configured isolation without a shared restart or consent prompt', async () => {
    const { run, engine } = fixture();
    const confirm = vi.fn(async () => true);
    expect((await engine.setup(confirm)).state).toBe('ready');
    expect(confirm).not.toHaveBeenCalled();
    expect(run.mock.calls.some(([args]) => args.includes('restart') || args.includes('set'))).toBe(false);
  });
  it('onboarding refuses an uninterpretable setting instead of overwriting it', async () => {
    const { run, engine } = fixture();
    run.mockResolvedValueOnce({ code: 0, stdout: '{}' });
    run.mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ client: SBX_DEVELOPMENT_PIN, server: { ...SBX_DEVELOPMENT_PIN, state: 'running' } }) });
    run.mockResolvedValueOnce({ code: 0, stdout: '{"key":"ssh.agentForwardingEnabled","type":"string","value":"unknown"}' });
    await expect(engine.setup(async () => true)).rejects.toThrow('could not be checked');
    expect(run.mock.calls.some(([args]) => args.includes('restart') || args.includes('set'))).toBe(false);
  });
  it('runs only browser login and refreshes even after an abandoned remedy', async () => {
    const { run, engine } = fixture();
    const perform = vi.fn(async () => { throw new Error('closed'); });
    const result = await engine.signIn(perform);
    expect(result.completed).toBe(false);
    expect(result.readiness.state).toBe('ready');
    expect(perform.mock.calls[0]).toEqual([{ args: ['login'], env: expect.objectContaining({ SBX_NO_TELEMETRY: '1' }) }]);
    expect(run.mock.calls.at(-1)).toEqual([['diagnose', '--json']]);
  });
  it('display asks only status and never settings, login, inventory or guest exec', async () => {
    const { run, engine } = fixture();
    expect((await engine.readiness()).state).toBe('unknown');
    expect(run.mock.calls).toEqual([[['daemon', 'status', '--json']]]);
  });
  it('reports absent only for executable absence, not every command failure', async () => {
    const { run, engine } = fixture();
    run.mockResolvedValueOnce({ code: 127, stdout: '', missing: true });
    expect((await engine.readiness()).state).toBe('not_installed');
    run.mockResolvedValueOnce({ code: 1, stdout: '' });
    expect((await engine.readiness('work')).state).toBe('unknown');
    expect(run).toHaveBeenCalledTimes(2);
  });
  it('checks fresh at every work boundary and refuses unsupported/unknown facts', async () => {
    const { run, engine } = fixture();
    await engine.beforeWork(); await engine.beforeWork();
    expect(run.mock.calls.filter(([args]) => args[0] === 'diagnose')).toHaveLength(2);
    run.mockResolvedValueOnce({ code: 0, stdout: '{"status":"running"}' });
    run.mockResolvedValueOnce({ code: 0, stdout: '{}' });
    await expect(engine.beforeWork()).rejects.toThrow();
  });
  it('declining shared changes performs no mutation', async () => {
    const { run, engine } = fixture();
    await engine.configureIsolation(async () => false);
    expect(run.mock.calls).toEqual([[['ls', '--json']], [['version', '--json']], [['daemon', 'status', '--json']]]);
  });
  it('refuses foreign or malformed inventories before asking to stop anything', async () => {
    const { run, engine } = fixture();
    const confirm = vi.fn(async () => true);
    run.mockResolvedValueOnce({ code: 0, stdout: '{"sandboxes":[{"name":"foreign"}]}' });
    await expect(engine.configureIsolation(confirm)).rejects.toThrow('Nothing was stopped');
    expect(confirm).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('rechecks foreign work after consent and before restart, then refreshes readiness', async () => {
    const { run, engine } = fixture();
    expect((await engine.configureIsolation(async () => true)).state).toBe('ready');
    expect(run.mock.calls.slice(0, 6)).toEqual([
      [['ls', '--json']], [['version', '--json']], [['ls', '--json']], [['settings', 'set', 'ssh.agentForwardingEnabled', 'false']],
      [['ls', '--json']], [['daemon', 'restart']],
    ]);
    expect(run.mock.calls.at(-1)).toEqual([['diagnose', '--json']]);
  });
  it('does not stop work that arrives while consent is open', async () => {
    const { run, engine } = fixture();
    await expect(engine.configureIsolation(async () => {
      run.mockResolvedValueOnce({ code: 0, stdout: '{"sandboxes":[{}]}' });
      return true;
    })).rejects.toThrow('Nothing was stopped');
    expect(run.mock.calls.some(([args]) => args[0] === 'settings')).toBe(false);
  });
});
