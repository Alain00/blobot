import { describe, expect, it } from 'vitest';
import {
  detectRuntimes,
  parseCursorStatus,
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

/**
 * Byte for byte what `opencode` 1.18.4 printed on this machine on 2026-08-30, escapes included.
 *
 * Copied from the terminal rather than written from the docs, which is the whole lesson of the
 * bug it pins: the version that read this by section name matched nothing at all, and answered
 * `false` for every input including this one.
 */
const OPENCODE_1_18_4 =
  '\u001B[0m\n' +
  '\u250C  Credentials \u001B[90m~/.local/share/opencode/auth.json\n' +
  '\u2502\n' +
  '\u25CF  GitHub Copilot \u001B[90moauth\n' +
  '\u2502\n' +
  '\u25CF  OpenAI \u001B[90moauth\n' +
  '\u2502\n' +
  '\u25CF  Anthropic \u001B[90moauth\n' +
  '\u2502\n' +
  '\u25CF  OpenCode Zen \u001B[90mapi\n' +
  '\u2502\n' +
  '\u2514  4 credentials\n';

describe('parseOpencodeAuthList', () => {
  it('reads the boxed output the CLI actually prints', () => {
    expect(parseOpencodeAuthList(OPENCODE_1_18_4)).toBe(true);
  });

  it('is false when the box closes on a count of none', () => {
    // The negative has to come from the count rather than from finding no entries, or an output
    // shape nobody anticipated reads as "signed out" instead of as "not understood".
    expect(
      parseOpencodeAuthList(
        '\u250C  Credentials \u001B[90m~/.local/share/opencode/auth.json\n\u2502\n\u2514  0 credentials\n',
      ),
    ).toBe(false);
  });

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

/**
 * Codex, against the exit codes a real `codex login status` returned on 2026-08-30 (codex-cli
 * 0.148.0): 0 with *"Logged in using ChatGPT"*, 1 with *"Not logged in"*. The signed-out state
 * was produced by pointing `CODEX_HOME` at an empty directory, so the author's own login was
 * never touched to observe it.
 */
describe('the Codex probe', () => {
  const found = (status: CommandResult): CommandRunner =>
    fakeRunner({
      'command -v codex': ok('/home/someone/.local/bin/codex\n'),
      '/home/someone/.local/bin/codex --version': ok('codex-cli 0.148.0\n'),
      '/home/someone/.local/bin/codex login status': status,
      // The other two are absent from the table, so they answer 127 and report not installed.
    });

  const codexOf = async (status: CommandResult) =>
    (await detectRuntimes({ run: found(status), home: '/home/someone', shell: '/bin/zsh' })).find(
      (entry) => entry.runtimeId === 'codex',
    );

  it('reads a credential as present on exit 0, and never says authenticated', async () => {
    const codex = await codexOf(ok('Logged in using ChatGPT\n'));
    expect(codex?.readiness).toBe('ready');
    expect(codex?.version).toBe('0.148.0');
    expect(codex?.detail).not.toMatch(/authenticated/i);
  });

  it('reads exit 1 as signed out, and anything else as unread rather than as signed out', async () => {
    expect((await codexOf({ code: 1, stdout: 'Not logged in\n', stderr: '' }))?.readiness).toBe(
      'needs_sign_in',
    );
    expect((await codexOf({ code: 2, stdout: '', stderr: 'boom' }))?.readiness).toBe('unknown');
  });

  /**
   * Carried as *no adapter yet* while ticket 04 was the whole of this, the way OpenCode was
   * before its own adapter landed. Ticket 05 built the adapter, so the remedies now lead
   * somewhere and this says so.
   */
  it('is a runtime blobot can construct, now that the adapter exists', async () => {
    const codex = await codexOf(ok('Logged in using ChatGPT\n'));
    expect(codex?.supported).toBe(true);
  });
});

/** The status line a signed-in cursor-agent 2026.08.25 printed on this machine, 2026-08-31. */
const CURSOR_SIGNED_IN =
  '{"status":"authenticated","isAuthenticated":true,"email":"someone@example.com"}\n';

describe('parseCursorStatus', () => {
  it('requires the vendor’s own isAuthenticated, and never repeats the word', () => {
    expect(parseCursorStatus(CURSOR_SIGNED_IN).readiness).toBe('ready');
    expect(parseCursorStatus(CURSOR_SIGNED_IN).detail).not.toMatch(/authenticated/i);
  });

  it('reads anything parsed without the flag as not signed in', () => {
    // The signed-out shape was never observed — producing it would have signed the author
    // out — so a positive needs the exact flag and everything else parsed is a negative.
    expect(parseCursorStatus('{"status":"unauthenticated"}').readiness).toBe('needs_sign_in');
    expect(parseCursorStatus('{"isAuthenticated":false}').readiness).toBe('needs_sign_in');
  });

  it('reads anything unparsed as unknown rather than guessing a direction', () => {
    expect(parseCursorStatus('Usage: cursor-agent ...').readiness).toBe('unknown');
    expect(parseCursorStatus('').readiness).toBe('unknown');
  });
});

describe('the Cursor probe', () => {
  it('probes only cursor-agent, and never the collision-prone bare name', async () => {
    const run = fakeRunner({
      'command -v cursor-agent': ok('/home/dev/.local/bin/cursor-agent\n'),
      '/home/dev/.local/bin/cursor-agent --version': ok('2026.08.25-3e8eec8\n'),
      '/home/dev/.local/bin/cursor-agent status --format json': ok(CURSOR_SIGNED_IN),
    });
    const cursor = (await detectRuntimes({ run, home: '/home/dev' })).find(
      (entry) => entry.runtimeId === 'cursor',
    );
    expect(cursor).toMatchObject({
      readiness: 'ready',
      supported: true,
      executablePath: '/home/dev/.local/bin/cursor-agent',
      version: '2026.08.25-3e8eec8',
    });
    expect(cursor?.detail).not.toMatch(/authenticated/i);
    expect(run.calls.some((call) => call === 'command -v agent')).toBe(false);
  });

  it('does not believe a machine that only has some binary called agent', async () => {
    // The installer always drops `cursor-agent` beside `agent`, so a machine with only the
    // bare name did not get it from Cursor's installer — and probing it would be guessing.
    const run = fakeRunner({
      'command -v agent': ok('/usr/bin/agent\n'),
      '/usr/bin/agent --version': ok('GNU agent 2.0\n'),
    });
    const cursor = (await detectRuntimes({ run, home: '/home/nobody' })).find(
      (entry) => entry.runtimeId === 'cursor',
    );
    expect(cursor?.readiness).toBe('not_installed');
  });

  it('reports the state it could not read as unknown', async () => {
    const run = fakeRunner({
      'command -v cursor-agent': ok('/home/dev/.local/bin/cursor-agent\n'),
      '/home/dev/.local/bin/cursor-agent --version': ok('2026.08.25-3e8eec8\n'),
      '/home/dev/.local/bin/cursor-agent status --format json': {
        code: 2,
        stdout: '',
        stderr: 'boom',
      },
    });
    expect(
      (await detectRuntimes({ run, home: '/home/dev' })).find(
        (entry) => entry.runtimeId === 'cursor',
      )?.readiness,
    ).toBe('unknown');
  });
});
