import { describe, expect, it } from 'vitest';
import { vouchedTools } from './permissions.js';

/**
 * The three levels, checked against what each one has to mean to be worth offering.
 *
 * The list itself is data and its contents are argued in `permissions.ts`; what is asserted
 * here is the shape of the choice, which is the part a future edit could quietly break.
 */
describe('what blobot vouches for', () => {
  it('vouches for nothing when the agent is careful', () => {
    // Not "fewer edits": every edit and every command asks, which is the whole of the word.
    expect(vouchedTools('careful')).toEqual([]);
  });

  it('vouches for editing and ordinary commands when the agent is normal', () => {
    const rules = vouchedTools('normal');
    expect(rules).toContain('Edit');
    expect(rules).toContain('Write');
    expect(rules).toContain('Bash(npm test:*)');
    expect(rules).toContain('Bash(git commit:*)');
  });

  it('adds the network and the installers when the agent is trusting', () => {
    const rules = vouchedTools('trusting');
    for (const added of ['Bash(curl:*)', 'Bash(npm install:*)', 'Bash(npx:*)']) {
      expect(rules).toContain(added);
      expect(vouchedTools('normal')).not.toContain(added);
    }
    // A level is a superset of the one below it, or the word means nothing.
    for (const rule of vouchedTools('normal')) expect(rules).toContain(rule);
  });

  it('vouches for reading GitHub from normal, and splits gh on the verb', () => {
    // The correction of 2026-08-31. `gh` was sorted by its transport and landed beside `curl`
    // and the installers, which put `gh pr view` a level above `git fetch` — the same act,
    // against the same host, already vouched at `normal`.
    const rules = vouchedTools('normal');
    expect(rules).toContain('Bash(gh pr view:*)');
    expect(rules).toContain('Bash(gh issue list:*)');
    expect(rules).toContain('Bash(gh run view:*)');
    expect(rules).toContain('Bash(git fetch:*)');
  });

  it('never vouches for deleting, publishing or changing who can do what, at any level', () => {
    // The line that does not move with the selector. There is no position above `trusting`,
    // and this is what that promise is made of. `gh` joins it as of 2026-08-31: writing to a
    // forge is the user's action, so no level reaches `gh pr create`, and the bare prefix is
    // absent because it would swallow every writing verb the way bare `git` swallows `push`.
    const forbidden = ['rm', 'sudo', 'chmod', 'chown', 'ssh', 'scp', 'docker', 'git push',
      'git remote', 'git', 'bash', 'sh', 'gh', 'gh pr create', 'gh pr merge', 'gh pr close',
      'gh release create', 'gh repo delete', 'gh api', 'gh secret set'];
    for (const trust of ['careful', 'normal', 'trusting'] as const) {
      for (const command of forbidden) {
        expect(vouchedTools(trust)).not.toContain(`Bash(${command}:*)`);
      }
    }
  });
});
