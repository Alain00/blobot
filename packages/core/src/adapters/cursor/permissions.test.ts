import { describe, expect, it } from 'vitest';
import { ALWAYS_DENY, CURSOR_APPROVAL_MODE, cursorCliConfig } from './permissions.js';
import type { TrustLevel } from '../../trust.js';

const LEVELS: readonly TrustLevel[] = ['careful', 'normal', 'trusting'];

describe('what blobot vouches for on a Cursor session', () => {
  it('is allowlist at every trust level, never auto-review or unrestricted', () => {
    for (const trust of LEVELS) {
      expect(cursorCliConfig(trust).approvalMode).toBe(CURSOR_APPROVAL_MODE);
      expect(cursorCliConfig(trust).approvalMode).not.toBe('auto-review');
      expect(cursorCliConfig(trust).approvalMode).not.toBe('unrestricted');
    }
  });

  it('keeps the closed deny list at every level, including trusting', () => {
    for (const trust of LEVELS) {
      expect(cursorCliConfig(trust).permissions.deny).toEqual([...ALWAYS_DENY]);
    }
    expect(ALWAYS_DENY).toEqual(
      expect.arrayContaining([
        'Shell(rm)',
        'Shell(sudo)',
        'Shell(git:push*)',
        'Shell(git:remote*)',
        'Shell(docker)',
      ]),
    );
  });

  it('lets the mailbox through at careful, and vouches for nothing else', () => {
    expect(cursorCliConfig('careful').permissions.allow).toEqual(['Mcp(blobot:*)']);
    expect(cursorCliConfig('careful').permissions.allow).not.toContain('Write(**)');
  });

  it('vouches for workspace edits at normal, and the network only at trusting', () => {
    expect(cursorCliConfig('normal').permissions.allow).toContain('Write(**)');
    expect(cursorCliConfig('normal').permissions.allow).not.toContain('Shell(curl:*)');
    expect(cursorCliConfig('trusting').permissions.allow).toContain('Shell(curl:*)');
    expect(cursorCliConfig('trusting').permissions.allow).toContain('WebFetch(*)');
  });

  it('keeps the sandbox on; network inside it follows trust', () => {
    expect(cursorCliConfig('normal').sandbox.mode).toBe('enabled');
    expect(cursorCliConfig('normal').sandbox.networkAccess).toBe('disabled');
    expect(cursorCliConfig('trusting').sandbox.networkAccess).toBe('enabled');
  });
});
