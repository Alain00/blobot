import { describe, expect, it } from 'vitest';
import {
  claudeModeFor,
  claudeModeNeedsProbe,
  refusedTools,
  vouchedTools,
} from './permissions.js';

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

describe('the mode a trust level asks for', () => {
  it('keeps default for the three attended levels', () => {
    expect(claudeModeFor('careful')).toBe('default');
    expect(claudeModeFor('normal')).toBe('default');
    expect(claudeModeFor('trusting')).toBe('default');
  });

  it('reaches for auto only at unattended', () => {
    expect(claudeModeFor('unattended')).toBe('auto');
  });

  it('probes for auto and never for default', () => {
    // `default` is advertised unconditionally; `auto` is offered "only when the model supports
    // it", which is the whole reason `availableModes` had to be read at all.
    expect(claudeModeNeedsProbe('auto')).toBe(true);
    expect(claudeModeNeedsProbe('default')).toBe(false);
  });
});

describe('what unattended vouches for', () => {
  it('is trusting’s list unchanged, not a wider one', () => {
    // The fourth level buys a decider for the tail, not a longer allowlist. `allowedTools` runs
    // before the permission path, so every rule here is a call the classifier never sees and
    // never charges an inference call for. Widening it would be a different decision.
    expect(vouchedTools('unattended')).toEqual(vouchedTools('trusting'));
  });

  it('still refuses what every level refuses', () => {
    const rules = vouchedTools('unattended').join('\n');
    for (const refused of ['rm', 'sudo', 'chmod', 'chown', 'ssh', 'scp', 'docker']) {
      expect(rules).not.toContain(`Bash(${refused}:*)`);
    }
    expect(rules).not.toContain('Bash(git push:*)');
    expect(rules).not.toContain('Bash(git remote:*)');
    expect(rules).not.toContain('Bash(gh pr create:*)');
  });
});

describe('what unattended refuses outright', () => {
  it('denies the nine verbs, because at that level nobody can be asked', () => {
    // Not belt and braces: measured live, `auto` ran `chmod 777`, pushed a branch to a real
    // remote and reached for `sudo`, with no permission request reaching blobot. Absent from
    // `allowedTools` is not refused, and `disallowedTools` is what the classifier honours.
    const denied = refusedTools('unattended');
    for (const verb of ['rm', 'sudo', 'chmod', 'chown', 'ssh', 'scp', 'docker']) {
      expect(denied).toContain(`Bash(${verb}:*)`);
    }
    expect(denied).toContain('Bash(git push:*)');
    expect(denied).toContain('Bash(git remote:*)');
  });

  it('denies nothing at the three attended levels', () => {
    // There a human is the answer, and the block in the transcript is how they give it. A deny
    // rule here would turn "still asks before deleting" into "cannot delete", silently, for
    // every agent already hired.
    expect(refusedTools('careful')).toEqual([]);
    expect(refusedTools('normal')).toEqual([]);
    expect(refusedTools('trusting')).toEqual([]);
  });

  it('never denies a verb it also vouches for', () => {
    // A rule in both lists is a contradiction the runtime resolves for us, and which resolution
    // it picks is not something blobot should be relying on.
    const vouched = new Set(vouchedTools('unattended'));
    for (const rule of refusedTools('unattended')) expect(vouched.has(rule)).toBe(false);
  });

  it('leaves gh alone, because a prefix rule cannot split its verbs', () => {
    // `Bash(gh:*)` would deny the reading half that `normal` vouches for. The writing half stays
    // un-vouched rather than denied, which is the same asymmetry running in the safe direction.
    expect(refusedTools('unattended').some((rule) => rule.startsWith('Bash(gh'))).toBe(false);
  });
});
