import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { sbxClientEnvironment } from '@blobot/core';
import { engineLoginEnvironment, runEngineLogin } from './engine-setup.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(source: string) {
  const root = await mkdtemp(join(tmpdir(), 'blobot-engine-login-')); roots.push(root);
  const path = join(root, 'login.cjs'), marker = join(root, 'pid');
  await writeFile(path, `#!${process.execPath}\n${source}`, { mode: 0o700 });
  return { path, marker };
}

it('passes only host desktop endpoints alongside the existing clean engine environment', () => {
  const source = { PATH: '/usr/bin', HOME: '/home/example', DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-0',
    XDG_RUNTIME_DIR: '/run/user/1000', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
    SSH_AUTH_SOCK: '/secret/socket', ANTHROPIC_API_KEY: 'secret', BROWSER: 'unvalidated-command' };
  expect(engineLoginEnvironment(source)).toEqual({ SBX_NO_TELEMETRY: '1', PATH: source.PATH, HOME: source.HOME,
    DISPLAY: source.DISPLAY, WAYLAND_DISPLAY: source.WAYLAND_DISPLAY, XDG_RUNTIME_DIR: source.XDG_RUNTIME_DIR,
    DBUS_SESSION_BUS_ADDRESS: source.DBUS_SESSION_BUS_ADDRESS });
  expect(sbxClientEnvironment(source)).toEqual({ SBX_NO_TELEMETRY: '1', PATH: source.PATH, HOME: source.HOME });
});

it('closes unsupported terminal input immediately, drains output, and reports only process completion', async () => {
  const f = await fixture("process.stdout.write('private URL'); process.stderr.write('private account'); process.stdin.resume(); process.stdin.on('end', () => process.exit(0));");
  await expect(runEngineLogin(f.path, AbortSignal.timeout(5000))).resolves.toBeUndefined();
});

it('reports browser/keyring failure without exposing child output', async () => {
  const f = await fixture("process.stderr.write('private credential details'); process.stdin.resume(); process.stdin.on('end', () => process.exit(1));");
  await expect(runEngineLogin(f.path, AbortSignal.timeout(5000))).rejects.toThrow('Check that your browser and account keyring are available');
});

it('kills a cancelled login even when the process ignores the graceful signal', async () => {
  const f = await fixture("process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(require('node:path').join(__dirname, 'pid'), String(process.pid)); setInterval(() => {}, 1000);");
  const controller = new AbortController(), task = runEngineLogin(f.path, controller.signal);
  const rejected = expect(task).rejects.toThrow('cancelled');
  try {
    await vi.waitFor(async () => expect(Number(await readFile(f.marker, 'utf8'))).toBeGreaterThan(0));
    const pid = Number(await readFile(f.marker, 'utf8'));
    controller.abort(); await rejected;
    expect(() => process.kill(pid, 0)).toThrow();
  } finally { controller.abort(); await task.catch(() => {}); }
});

it('does not launch an already cancelled login', async () => {
  expect(() => runEngineLogin('/not-an-executable', AbortSignal.abort())).toThrow();
});
