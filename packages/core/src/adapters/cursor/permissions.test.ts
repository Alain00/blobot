import { describe, expect, it } from 'vitest';
import type { TrustLevel } from '../../trust.js';
import { CURSOR_TRUST_LEVELS, cursorCliConfig } from './permissions.js';

const LEVELS: readonly TrustLevel[] = ['careful', 'normal', 'trusting'];

/** Seven of the nine dangerous verbs — the whole-command ones; `git push` and `git remote`
 *  are asserted separately below because their rules are verb splits, not command names. All
 *  nine must be UNLISTED — never allowed, never denied — so they prompt. On Cursor a deny is
 *  a silent hard block whose tool_call reports `completed` (measured, ticket 01), which would
 *  take the decision away from the user. */
const DANGEROUS = ['rm', 'sudo', 'chmod', 'chown', 'ssh', 'scp', 'docker'];

describe('what blobot vouches for on a Cursor session', () => {
  it('is allowlist at every trust level, never auto-review or unrestricted', () => {
    for (const trust of LEVELS) {
      expect(cursorCliConfig(trust).approvalMode).toBe('allowlist');
    }
  });

  it('keeps deny empty at every level, because a deny does not ask — it silently blocks', () => {
    for (const trust of LEVELS) {
      expect(cursorCliConfig(trust).permissions.deny).toEqual([]);
    }
  });

  it('never lists a dangerous verb in any direction, so every one of them prompts', () => {
    for (const trust of LEVELS) {
      const { allow, deny } = cursorCliConfig(trust).permissions;
      for (const verb of DANGEROUS) {
        expect(allow.some((rule) => rule.includes(`(${verb})`) || rule.includes(`(${verb}:`))).toBe(false);
        expect(deny.some((rule) => rule.includes(verb))).toBe(false);
      }
      // The bare git atom would vouch for push and remote in one word.
      expect(allow).not.toContain('Shell(git)');
      expect(allow.some((rule) => rule.includes('git:push') || rule.includes('git:remote'))).toBe(false);
      // gh api can write with a flag a prefix rule cannot see; the writing gh verbs prompt.
      expect(allow.some((rule) => rule.includes('gh:api') || rule.includes('gh:pr create'))).toBe(false);
    }
  });

  it('lets the mailbox through at careful, and vouches for nothing else there', () => {
    expect(cursorCliConfig('careful').permissions.allow).toEqual(['Mcp(blobot:*)']);
  });

  it('vouches the mailbox at every level, so a peer message never waits on a human', () => {
    for (const trust of LEVELS) {
      expect(cursorCliConfig(trust).permissions.allow).toContain('Mcp(blobot:*)');
    }
  });

  it('vouches for workspace edits and the git reading verbs from normal', () => {
    const allow = cursorCliConfig('normal').permissions.allow;
    expect(allow).toContain('Write(**)');
    expect(allow).toContain('Read(**)');
    expect(allow).toContain('Shell(git:status*)');
    expect(allow).toContain('Shell(gh:pr view*)');
    expect(allow).not.toContain('Shell(curl)');
  });

  it('adds the network and the installers only at trusting', () => {
    const normal = cursorCliConfig('normal').permissions.allow;
    const trusting = cursorCliConfig('trusting').permissions.allow;
    expect(normal).not.toContain('Shell(npm:install*)');
    expect(trusting).toContain('Shell(curl)');
    expect(trusting).toContain('Shell(npm:install*)');
    expect(trusting).toContain('WebFetch(*)');
    for (const rule of normal) expect(trusting).toContain(rule);
  });

  it('preserves the local sandbox setting without treating it as an effective ACP fence', () => {
    for (const trust of LEVELS) {
      expect(cursorCliConfig(trust).sandbox).toEqual({ mode: 'enabled', networkAccess: 'allow_all' });
    }
  });

  it('disables only the optional inner fence in a box, preserving every approval rule', () => {
    for (const trust of [...LEVELS, 'unattended'] as const) {
      const local = cursorCliConfig(trust, 'local');
      const box = cursorCliConfig(trust, 'box');
      expect(box.sandbox).toEqual({ mode: 'disabled', networkAccess: 'allow_all' });
      expect(box.approvalMode).toBe('allowlist');
      expect(box.permissions).toEqual(local.permissions);
    }
  });

  it('declares the three attended levels and not a fourth', () => {
    expect(CURSOR_TRUST_LEVELS).toEqual(['careful', 'normal', 'trusting']);
  });

  it('reads a stored unattended as trusting’s list, the strictly more cautious translation', () => {
    expect(cursorCliConfig('unattended').permissions.allow).toEqual(
      cursorCliConfig('trusting').permissions.allow,
    );
  });
});
