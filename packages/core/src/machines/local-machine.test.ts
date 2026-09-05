import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalMachine } from './local-machine.js';
import { machineFor } from './machine-for.js';

const directories: string[] = [];
function directory(): string {
  const path = mkdtempSync(join(tmpdir(), 'blobot-machine-'));
  directories.push(path);
  return path;
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('LocalMachine', () => {
  it('runs argv without a shell, in the workspace, with stderr separate and speech keys removed', async () => {
    const cwd = directory();
    vi.stubEnv('BLOBOT_OPENAI_API_KEY', 'host-speech-key');
    vi.stubEnv('BLOBOT_MACHINE_INHERITED_TEST', 'inherited');
    vi.stubEnv('CURSOR_API_KEY', 'host-cursor-key');
    const machine = new LocalMachine({ agentId: 'alice', workspacePath: cwd });
    const stderr: string[] = [];
    const literal = '$(touch should-not-exist); echo nope';
    const transport = machine.spawn({
      command: { kind: 'exec', executable: process.execPath, args: ['-e',
        'console.error("diagnostic"); console.log(JSON.stringify({cwd:process.cwd(), arg:process.argv[1], inherited:process.env.BLOBOT_MACHINE_INHERITED_TEST, explicit:process.env.EXPLICIT, speech:process.env.BLOBOT_OPENAI_API_KEY ?? null, cursor:process.env.CURSOR_API_KEY ?? null}));', literal] },
      cwd,
      env: { EXPLICIT: 'chosen', BLOBOT_OPENAI_API_KEY: 'explicit-speech-key', CURSOR_API_KEY: undefined },
      onStderr: (line) => stderr.push(line),
    });
    const lines: string[] = [];
    for await (const line of transport.lines()) lines.push(line);
    await transport.close();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({
      cwd: realpathSync(cwd), arg: literal, inherited: 'inherited', explicit: 'chosen', speech: null, cursor: null,
    });
    expect(stderr).toEqual(['diagnostic']);
    expect(existsSync(join(cwd, 'should-not-exist'))).toBe(false);
  });

  it('runs a packaged node entry and closes its channel on EOF', async () => {
    const cwd = directory();
    const entry = join(cwd, 'bridge.cjs');
    writeFileSync(entry, 'process.stdin.pipe(process.stdout);');
    const machine = new LocalMachine({ agentId: 'alice', workspacePath: cwd }, { nodeExecutable: process.execPath });
    const transport = machine.spawn({
      command: { kind: 'node-module', package: 'fixture', version: '1', entry: 'bridge.cjs', localEntryPath: entry }, cwd,
    });
    const closed = vi.fn();
    transport.onClose(closed);
    const received = (async () => {
      const lines: string[] = [];
      for await (const line of transport.lines()) lines.push(line);
      return lines;
    })();
    transport.write('{"hello":"alice"}\n');
    await transport.close();
    expect(await received).toEqual(['{"hello":"alice"}']);
    expect(closed).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it('owns no volumes and never deletes the workspace or a CLI login during lifecycle operations', async () => {
    const workspacePath = directory();
    const file = join(workspacePath, 'keep.txt');
    writeFileSync(file, 'work');
    const alice = machineFor('local', { agentId: 'alice', workspacePath });
    const bob = machineFor('local', { agentId: 'bob', workspacePath: directory() });
    expect(alice).not.toBe(bob);
    expect(alice.location()).toMatchObject({ agentId: 'alice', volumes: null });
    expect(await alice.readiness()).toEqual({ state: 'ready' });
    expect(await alice.start({ mailboxPort: 4321 })).toEqual(alice.location());
    expect(await alice.reconcile()).toEqual({ state: 'ok', location: alice.location() });
    await alice.stop();
    await alice.destroy();
    expect(existsSync(file)).toBe(true);
    expect(await alice.measure()).toBe(0);
  });

  it('refuses an unavailable box instead of running on the host', () => {
    expect(() => machineFor('box', { agentId: 'alice', workspacePath: '/workspace' }))
      .toThrow('Sandbox machines are not available');
  });
});
