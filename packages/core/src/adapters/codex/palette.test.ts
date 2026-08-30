import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { offerableNames, offeredName, VOUCHED_BUILT_INS } from './palette.js';

const made: string[] = [];
function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'blobot-codex-palette-'));
  made.push(dir);
  return dir;
}

function skill(root: string, name: string): void {
  mkdirSync(join(root, name), { recursive: true });
  writeFileSync(join(root, name, 'SKILL.md'), '# skill\n');
}

afterEach(() => {
  delete process.env['CODEX_HOME'];
});

describe('what blobot offers in a Codex composer', () => {
  it('offers the workspace skills and the five vouched built-ins', () => {
    const cwd = workspace();
    skill(join(cwd, '.codex', 'skills'), 'ship-it');
    const names = offerableNames(cwd);
    expect(names.has('ship-it')).toBe(true);
    for (const built of VOUCHED_BUILT_INS) expect(names.has(built)).toBe(true);
  });

  /**
   * The six Codex ships live inside the operator's own skills directory, under `.system`.
   * Everything about them looks authored except the dot, which is the only thing telling the
   * two apart, so it is the thing this test pins.
   */
  it('skips the vendor skills Codex hides inside the operator directory', () => {
    const home = workspace();
    process.env['CODEX_HOME'] = home;
    skill(join(home, 'skills'), 'mine');
    skill(join(home, 'skills', '.system'), 'imagegen');
    const names = offerableNames(workspace());
    expect(names.has('mine')).toBe(true);
    expect(names.has('imagegen')).toBe(false);
    expect(names.has('.system')).toBe(false);
  });

  it('follows a symlinked skill, which is what an operator directory is made of', () => {
    const home = workspace();
    process.env['CODEX_HOME'] = home;
    const shared = workspace();
    skill(shared, 'research');
    mkdirSync(join(home, 'skills'), { recursive: true });
    symlinkSync(join(shared, 'research'), join(home, 'skills', 'research'));
    expect(offerableNames(workspace()).has('research')).toBe(true);
  });

  it('offers nothing a plugin installed, because a plugin is in none of the roots', () => {
    const home = workspace();
    process.env['CODEX_HOME'] = home;
    skill(join(home, 'plugins', 'cache', 'openai-curated', 'github', 'skills'), 'yeet');
    expect(offerableNames(workspace()).has('yeet')).toBe(false);
  });

  it('reads the runtime own spelling of a skill, which carries a $', () => {
    expect(offeredName('$research')).toBe('research');
    expect(offeredName('compact')).toBe('compact');
  });
});
