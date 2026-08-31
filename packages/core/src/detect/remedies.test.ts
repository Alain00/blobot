import { describe, expect, it } from 'vitest';
import { remediesFor, remedyFor } from './remedies.js';
import type { RuntimeDetection } from './runtimes.js';

const detected = (over: Partial<RuntimeDetection> = {}): RuntimeDetection => ({
  runtimeId: 'claude-code',
  label: 'Claude Code',
  readiness: 'needs_sign_in',
  supported: true,
  detail: 'Installed, not signed in',
  executablePath: '/home/someone/.local/bin/claude',
  ...over,
});

describe('remediesFor', () => {
  it('offers the runtime its own login when a credential is missing', () => {
    const [remedy] = remediesFor(detected(), 'linux');
    expect(remedy?.kind).toBe('sign_in');
    expect(remedy?.argv).toEqual(['/home/someone/.local/bin/claude', 'auth', 'login']);
  });

  it('signs in with the binary the cascade found, not with the name', () => {
    // The whole point of the three-layer locate: the binary may sit somewhere no `PATH` this
    // process has would reach, and a remedy that spawned `claude` would fail where detection did not.
    const [remedy] = remediesFor(detected({ executablePath: '/opt/elsewhere/claude' }), 'linux');
    expect(remedy?.argv[0]).toBe('/opt/elsewhere/claude');
  });

  it('offers nothing at all when there is no binary to sign in with', () => {
    const withoutPath = detected();
    const { executablePath: _dropped, ...noPath } = withoutPath;
    expect(remediesFor(noPath as RuntimeDetection, 'linux')).toEqual([]);
  });

  it('offers the vendor install command when nothing is installed', () => {
    const [remedy] = remediesFor(detected({ readiness: 'not_installed' }), 'linux');
    expect(remedy?.kind).toBe('install');
    expect(remedy?.shown).toBe('curl -fsSL https://claude.ai/install.sh | bash');
    expect(remedy?.argv[0]).toBe('/bin/sh');
  });

  it('offers nothing on a runtime that is ready', () => {
    // A second door labelled sign in, beside a runtime that works, reads as blobot doubting
    // the answer it just gave.
    expect(remediesFor(detected({ readiness: 'ready' }), 'linux')).toEqual([]);
  });

  it('offers the login when the state could not be read, since that is what it fixes', () => {
    expect(remediesFor(detected({ readiness: 'unknown' }), 'linux')[0]?.kind).toBe('sign_in');
  });

  it('offers nothing on Windows, which no research covers', () => {
    expect(remediesFor(detected(), 'win32')).toEqual([]);
    expect(remediesFor(detected({ readiness: 'not_installed' }), 'win32')).toEqual([]);
  });

  it('offers nothing for a runtime blobot has no adapter for', () => {
    expect(remediesFor(detected({ runtimeId: 'gemini', supported: false }), 'linux')).toEqual([]);
  });

  it('finds one remedy by the kind the renderer is allowed to name', () => {
    expect(remedyFor(detected(), 'install', 'linux')).toBeUndefined();
    expect(remedyFor(detected(), 'sign_in', 'linux')?.runtimeId).toBe('claude-code');
  });

  it('offers Cursor’s own install and login, named for the binary detection found', () => {
    const missing = remediesFor(
      detected({ runtimeId: 'cursor', label: 'Cursor', readiness: 'not_installed' }),
      'linux',
    );
    expect(missing[0]?.shown).toBe('curl https://cursor.com/install -fsS | bash');
    const signIn = remediesFor(
      detected({
        runtimeId: 'cursor',
        label: 'Cursor',
        executablePath: '/home/dev/.local/bin/agent',
      }),
      'linux',
    );
    expect(signIn[0]?.argv).toEqual(['/home/dev/.local/bin/agent', 'login']);
    expect(signIn[0]?.shown).toBe('agent login');
  });
});
