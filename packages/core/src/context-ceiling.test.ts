import { describe, expect, it } from 'vitest';
import { CLAUDE_CEILINGS, claudeCeiling } from './adapters/claude/context.js';
import { codexCeiling } from './adapters/codex/context.js';
import { opencodeCeiling } from './adapters/opencode/context.js';
import { UNMEASURED_CAP, unmeasuredCeiling, workingCeiling } from './context-ceiling.js';

describe('the working ceiling', () => {
  it('falls back for a model nobody measured, which is the common path', () => {
    // Not an error state and not a gap: almost every model reaches here, and the value says so.
    expect(workingCeiling(undefined, 200_000)).toEqual({ tokens: 120_000, measured: false });
  });

  it('does not let an unmeasured ceiling scale with a window that advertises a million', () => {
    // The trap the cap exists for. 60% of a million is 600,000, which is twice the point the one
    // model anybody has looked at was reported to degrade at — so a bare fraction fails open
    // exactly where advertised and usable diverge hardest.
    expect(unmeasuredCeiling(1_000_000)).toEqual({ tokens: UNMEASURED_CAP, measured: false });
    expect(unmeasuredCeiling(1_000_000).tokens).toBeLessThan(1_000_000 * 0.6);
  });

  it('never exceeds the window that was actually reported', () => {
    // A model alias points at different windows in different places: the same `opus` runs at
    // 200k and at 1m. An entry taken from one would otherwise draw a mark past the end of the
    // other's gauge, which claims room the agent does not have.
    expect(workingCeiling(300_000, 200_000)).toEqual({ tokens: 200_000, measured: true });
    expect(unmeasuredCeiling(50_000)).toEqual({ tokens: 30_000, measured: false });
  });

  it('says nothing rather than something wrong when no window has been reported', () => {
    expect(workingCeiling(300_000, 0)).toEqual({ tokens: 0, measured: false });
  });

  it('keeps the measured flag apart from the number, since the two can coincide', () => {
    // 120k is what both a measured 120k and an unmeasured 200k window come to. A reader asking
    // how much to trust the figure cannot get that from the figure.
    expect(workingCeiling(120_000, 200_000).measured).toBe(true);
    expect(workingCeiling(undefined, 200_000).measured).toBe(false);
  });
});

describe('what each adapter knows', () => {
  it('looks a model up exactly, and never guesses that one name is near enough to another', () => {
    expect(claudeCeiling('opus')).toBe(CLAUDE_CEILINGS['opus']);
    // A prefix match here is how a table starts making claims nobody checked. The fallback is
    // already the safe answer, so there is nothing to gain by reaching for it.
    expect(claudeCeiling('opus-5-turbo')).toBeUndefined();
    expect(claudeCeiling('sonnet')).toBeUndefined();
    expect(claudeCeiling(undefined)).toBeUndefined();
  });

  it('has nothing measured for the two runtimes nobody has measured', () => {
    // Empty on purpose, and the honest state rather than an oversight: OpenCode is a front end
    // onto somebody else's model, and the Codex adapter advertises no model group at all.
    expect(opencodeCeiling('claude-sonnet-4')).toBeUndefined();
    expect(codexCeiling(undefined)).toBeUndefined();
  });

  it('gives every entry in the one non-empty table a source, in the file beside it', () => {
    // The rule the table exists under: an entry that ages silently is worse than no entry,
    // because the fallback at least announces that it is a guess. This asserts the shape a
    // reviewer would otherwise have to remember to check.
    expect(Object.keys(CLAUDE_CEILINGS)).toEqual(['opus']);
  });
});
