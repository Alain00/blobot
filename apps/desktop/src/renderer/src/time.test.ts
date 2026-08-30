import { describe, expect, it } from 'vitest';
import { lastActive, timeRule } from './time.js';

const at = new Date('2026-08-29T13:53:00').getTime();
const minutes = (n: number): number => n * 60_000;

describe('the rule above a message', () => {
  it('is drawn before the first item, which has nothing before it', () => {
    expect(timeRule(at, undefined, at)).toBe('1:53 PM');
  });

  it('is left out inside a cluster, so a burst of replies is not sliced up', () => {
    expect(timeRule(at, at - minutes(2), at)).toBeUndefined();
  });

  it('names the day once the conversation is not today, which is what a restart restores', () => {
    const now = at + minutes(60 * 24);
    expect(timeRule(at, undefined, now)).toBe('yesterday 1:53 PM');
    // Still no rule inside the cluster: the day is named once, above the sitting.
    expect(timeRule(at, at - minutes(2), now)).toBeUndefined();
    expect(timeRule(at, undefined, at + minutes(60 * 24 * 9))).toBe('Aug 29 1:53 PM');
  });
});

describe('how long a stopped team has been quiet', () => {
  it('is minutes, then hours, then the day', () => {
    expect(lastActive(at, at)).toBe('now');
    expect(lastActive(at, at + minutes(14))).toBe('14m');
    expect(lastActive(at, at + minutes(180))).toBe('3h');
    expect(lastActive(at, at + minutes(60 * 24))).toBe('yesterday');
    expect(lastActive(at, at + minutes(60 * 24 * 9))).toBe('Aug 29');
  });
});
