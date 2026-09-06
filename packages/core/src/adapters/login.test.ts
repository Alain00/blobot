import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { childTransport } from './acp/child-transport.js';
import { LocalMachine } from '../machines/local-machine.js';
import { MachineLogin, loginText, loginUrl, type RuntimeLoginSpec } from './login.js';
import type { MachineTransport } from '../machines/machine.js';

const transports: MachineTransport[] = [];
afterEach(async () => { await Promise.all(transports.splice(0).map((transport) => transport.close())); });
function fixture(script: string, parse: RuntimeLoginSpec['parse']) {
  const machine = new LocalMachine({ agentId: 'login-fixture', workspacePath: '/tmp' });
  // Use the real framed guest wrapper against a synthetic CLI; no vendor account or VM.
  machine.spawn = (request) => {
    if (request.command.kind !== 'exec') throw new Error('Expected executable');
    const transport = childTransport(spawn(request.command.executable, [...request.command.args], {
      cwd: '/tmp', stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env['PATH'] },
    }), undefined);
    transports.push(transport); return transport;
  };
  return new MachineLogin(machine, process.execPath, { executable: process.execPath, args: ['-e', script], parse });
}

describe('owned guest sign-in channel', () => {
  it('frames partial prompts, forwards only solicited input, and reads the CLI exit', async () => {
    const login = fixture("process.stdout.write('Paste code: ');process.stdin.once('data',v=>process.exit(v.toString()==='one-use#state\\n'?0:1));",
      (text) => text.includes('Paste code: ') ? { kind: 'browser', url: 'https://example.com/login', input: 'Authorization code' } : undefined);
    let challenges = 0;
    await login.run(new AbortController().signal, (challenge) => {
      challenges++; expect(challenge.kind).toBe('browser');
      expect(() => login.respond('x\ny')).toThrow();
      login.respond('one-use#state');
      expect(() => login.respond('again')).toThrow();
    });
    expect(challenges).toBe(1);
    expect(() => login.respond('late')).toThrow();
  });
  it('requires an explicit listed choice and does not select a default', async () => {
    const login = fixture("process.stdout.write('Choose team: ');process.stdin.once('data',v=>process.exit(v.toString()==='2\\n'?0:1));",
      () => ({ kind: 'choice', label: 'Team', choices: [{ value: '1', label: 'First' }, { value: '2', label: 'Second' }] }));
    await login.run(new AbortController().signal, () => {
      expect(() => login.respond('')).toThrow();
      expect(() => login.respond('3')).toThrow();
      login.respond('2');
    });
  });
  it('cancels a waiting CLI and does not expose raw diagnostics', async () => {
    const abort = new AbortController();
    const login = fixture("process.stdout.write('waiting');setInterval(()=>{},1000);",
      () => ({ kind: 'browser', url: 'https://example.com/login' }));
    await expect(login.run(abort.signal, () => abort.abort())).rejects.toThrow();
    const failed = fixture("process.stderr.write('secret=fixture');process.exit(1)", () => undefined);
    await expect(failed.run(new AbortController().signal, () => {})).rejects.toThrow(/^Sign-in did not complete/);
  });
  it('strips terminal controls and never emits partial or unrecognized browser URLs', () => {
    expect(loginText('\x1b[31mHello\x1b[0m\r\n')).toBe('Hello\n');
    const accept = (url: URL) => url.hostname === 'example.com' && url.pathname === '/login';
    expect(loginUrl('https://example.com/login', accept)).toBeUndefined();
    expect(loginUrl('https://example.com/login\n', accept)?.href).toBe('https://example.com/login');
    expect(loginUrl('https://evil.example/login\nhttps://u:p@example.com/login\n', accept)).toBeUndefined();
  });
});
