import { describe, expect, it } from 'vitest';
import {
  detectRuntimes,
  parseOpencodeAuthList,
  parseVersion,
  stripAnsi,
  type CommandResult,
  type CommandRunner,
} from './runtimes.js';

const ESC = '\u001B';

/** A runner that answers from a table and records what it was asked, keyed `cmd arg arg`. */
function fakeRunner(table: Record<string, CommandResult>): CommandRunner & { calls: string[] } {
  const calls: string[] = [];
  const run = (async (command, args) => {
    const key = [command, ...args].join(' ');
    calls.push(key);
    return table[key] ?? { code: 127, stdout: '', stderr: 'not found' };
  }) as CommandRunner & { calls: string[] };
  run.calls = calls;
  return run;
}

const ok = (stdout = ''): CommandResult => ({ code: 0, stdout, stderr: '' });

describe('parseOpencodeAuthList', () => {
  it('reads a credential through the escapes NO_COLOR does not remove', () => {
    const stdout = `${ESC}[1mCredentials${ESC}[0m\n  ${ESC}[32manthropic${ESC}[0m  oauth\n\n1 credentials\n`;
    expect(parseOpencodeAuthList(stdout)).toBe(true);
  });

  it('counts the Environment section, which is env var names and never values', () => {
    expect(parseOpencodeAuthList('Environment\n  OPENAI_API_KEY\n')).toBe(true);
  });

  it('is false when both sections are empty', () => {
    expect(parseOpencodeAuthList('Credentials\n\n0 credentials\n')).toBe(false);
  });
});

describe('parseVersion', () => {
  it('keeps the number out of a decorated line', () => {
    expect(parseVersion('2.1.251 (Claude Code)\n')).toBe('2.1.251');
    expect(parseVersion(`${ESC}[2m1.18.4${ESC}[0m\n`)).toBe('1.18.4');
  });

  it('is undefined when nothing version-shaped is printed', () => {
    expect(parseVersion('command not found')).toBeUndefined();
  });
});

describe('stripAnsi', () => {
  it('removes CSI sequences and leaves the text', () => {
    expect(stripAnsi(`${ESC}[1mbold${ESC}[0m`)).toBe('bold');
  });
});

describe('detectRuntimes', () => {
  it('reports the four honest states and never the word authenticated', async () => {
    const run = fakeRunner({
      'command -v claude': ok('/usr/local/bin/claude\n'),
      '/usr/local/bin/claude --version': ok('2.1.251 (Claude Code)'),
      '/usr/local/bin/claude auth status': ok('{"loggedIn": true}'),
    });
    const [claude, opencode] = await detectRuntimes({ run, home: '/home/nobody' });

    expect(claude).toMatchObject({
      runtimeId: 'claude-code',
      label: 'Claude Code',
      readiness: 'ready',
      executablePath: '/usr/local/bin/claude',
      version: '2.1.251',
    });
    // Nothing installed: a negative is the reliable half of the signal.
    expect(opencode).toMatchObject({ runtimeId: 'opencode', readiness: 'not_installed' });
    for (const detection of [claude, opencode]) {
      expect(detection?.detail.toLowerCase()).not.toContain('authenticat');
    }
  });

  it('reads exit 1 from `claude auth status` as needing sign-in, not as missing', async () => {
    const run = fakeRunner({
      'command -v claude': ok('/usr/local/bin/claude\n'),
      '/usr/local/bin/claude --version': ok('2.1.251'),
      '/usr/local/bin/claude auth status': { code: 1, stdout: '', stderr: '' },
    });
    const [claude] = await detectRuntimes({ run, home: '/home/nobody' });
    expect(claude?.readiness).toBe('needs_sign_in');
  });

  it('says unknown rather than guessing when the probe answers with neither 0 nor 1', async () => {
    const run = fakeRunner({
      'command -v claude': ok('/usr/local/bin/claude\n'),
      '/usr/local/bin/claude --version': ok('2.1.251'),
      '/usr/local/bin/claude auth status': { code: 42, stdout: '', stderr: 'boom' },
    });
    const [claude] = await detectRuntimes({ run, home: '/home/nobody' });
    expect(claude?.readiness).toBe('unknown');
  });

  it('falls back to a known install directory, then to the login shell', async () => {
    // The macOS-GUI PATH case: nothing on PATH, the binary living under $HOME.
    const run = fakeRunner({
      '/home/dev/.opencode/bin/opencode --version': ok('1.18.4'),
      '/home/dev/.opencode/bin/opencode auth list': ok('Credentials\n  anthropic  oauth\n'),
      '/bin/zsh -ilc command -v claude': ok('/home/dev/.local/state/claude\n'),
      '/home/dev/.local/state/claude --version': ok('2.1.251'),
      '/home/dev/.local/state/claude auth status': ok(''),
    });
    const [claude, opencode] = await detectRuntimes({ run, home: '/home/dev', shell: '/bin/zsh' });

    expect(opencode).toMatchObject({
      readiness: 'ready',
      executablePath: '/home/dev/.opencode/bin/opencode',
    });
    expect(claude).toMatchObject({
      readiness: 'ready',
      executablePath: '/home/dev/.local/state/claude',
    });
    // Layer three costs ~1.8s, so it must be reached only after the cheap layers miss.
    expect(run.calls.indexOf('/bin/zsh -ilc command -v claude')).toBeGreaterThan(
      run.calls.indexOf('command -v claude'),
    );
  });
});
