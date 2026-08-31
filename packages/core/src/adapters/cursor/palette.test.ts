import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { offerableNames } from './palette.js';

describe('Cursor command allowlist', () => {
  it('offers a command a person wrote under .cursor/commands', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'blobot-cursor-pal-'));
    mkdirSync(join(cwd, '.cursor', 'commands'), { recursive: true });
    writeFileSync(join(cwd, '.cursor', 'commands', 'ship.md'), '# ship\n');
    expect(offerableNames(cwd).has('ship')).toBe(true);
  });

  it('offers a skill directory holding SKILL.md', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'blobot-cursor-pal-'));
    mkdirSync(join(cwd, '.cursor', 'skills', 'review'), { recursive: true });
    writeFileSync(join(cwd, '.cursor', 'skills', 'review', 'SKILL.md'), '# review\n');
    expect(offerableNames(cwd).has('review')).toBe(true);
  });

  it('skips dot-directories, which is where a vendor stages its own surface', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'blobot-cursor-pal-'));
    mkdirSync(join(cwd, '.cursor', 'skills', '.system', 'vendor-thing'), { recursive: true });
    writeFileSync(join(cwd, '.cursor', 'skills', '.system', 'vendor-thing', 'SKILL.md'), '# x\n');
    expect(offerableNames(cwd).has('.system')).toBe(false);
    expect(offerableNames(cwd).has('vendor-thing')).toBe(false);
  });
});
