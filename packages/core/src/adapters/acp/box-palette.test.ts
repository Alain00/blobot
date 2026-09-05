import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { offerableNames as claude } from '../claude/palette.js';
import { offerableNames as codex } from '../codex/palette.js';
import { offerableNames as opencode } from '../opencode/palette.js';
import { offerableNames as cursor } from '../cursor/palette.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
it('offers mounted skills and loose project commands on every palette, excluding escaping links', () => {
  const root = mkdtempSync(join(tmpdir(), 'blobot-box-palette-')); roots.push(root);
  const cwd = join(root, 'work'), sharedSkillsPath = join(root, 'shared'), outside = join(root, 'outside');
  const skill = (path: string) => { mkdirSync(path, { recursive: true }); writeFileSync(join(path, 'SKILL.md'), '# fixture'); };
  skill(join(sharedSkillsPath, 'mounted')); skill(outside);
  symlinkSync(outside, join(sharedSkillsPath, 'escaping'));
  for (const name of ['claude', 'codex', 'opencode', 'cursor']) {
    skill(join(cwd, `.${name}`, 'skills', 'loose'));
    symlinkSync(outside, join(cwd, `.${name}`, 'skills', 'not-mounted'));
  }
  for (const offer of [claude, codex, opencode, cursor]) {
    const names = offer(cwd, { sharedSkillsPath });
    expect(names.has('mounted')).toBe(true);
    expect(names.has('loose')).toBe(true);
    expect(names.has('escaping')).toBe(false);
    expect(names.has('not-mounted')).toBe(false);
    expect(offer(cwd, {}).has('mounted')).toBe(false);
  }
});
