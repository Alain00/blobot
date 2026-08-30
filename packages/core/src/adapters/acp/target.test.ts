import { describe, expect, it } from 'vitest';
import { targetOf } from './target.js';
import type { SessionUpdate } from './wire.js';

/**
 * The two shapes are taken from the wire, on the same edit, 2026-08-30. The point of the test
 * is that they come out the same: this is the only place the two runtimes are made to agree,
 * and a fixture invented to match the code would prove nothing.
 */
describe('what a call is about, across two runtimes', () => {
  const cwd = '/tmp/blobot-oc-kAIrDZ';

  it('answers the same for both, where their titles do not', () => {
    // Claude sends a path already relative to the workspace.
    const claude: SessionUpdate = { locations: [{ path: 'notes.txt', line: 1 }] };
    // OpenCode sends it absolute.
    const opencode: SessionUpdate = { locations: [{ path: '/tmp/blobot-oc-kAIrDZ/notes.txt' }] };
    expect(targetOf(claude, cwd)).toBe('notes.txt');
    expect(targetOf(opencode, cwd)).toBe('notes.txt');
  });

  it('keeps a path outside the workspace visible as one', () => {
    expect(targetOf({ locations: [{ path: '/etc/hosts' }] }, cwd)).toBe('../../etc/hosts');
  });

  it('says nothing for a call that is about no path, which is every command', () => {
    expect(targetOf({ locations: [] }, cwd)).toBeUndefined();
    expect(targetOf({}, cwd)).toBeUndefined();
    // A location with no path in it is not a location.
    expect(targetOf({ locations: [{ line: 3 }] }, cwd)).toBeUndefined();
  });

  it('counts the rest rather than naming only the first', () => {
    expect(
      targetOf(
        { locations: [{ path: 'a.ts' }, { path: '/tmp/blobot-oc-kAIrDZ/b.ts' }, { path: 'c.ts' }] },
        cwd,
      ),
    ).toBe('a.ts +2 more');
  });

  it('keeps the workspace root itself, which relative() answers as nothing', () => {
    expect(targetOf({ locations: [{ path: cwd }] }, cwd)).toBe(cwd);
  });
});
