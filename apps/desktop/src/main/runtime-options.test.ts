/**
 * What a runtime offers, remembered across launches.
 *
 * The claim under test is not "there is a cache" but the three things that make a remembered
 * answer worth serving: it survives the process, it is thrown away when the binary or its
 * version changes, and a day-old answer is drawn *now* and replaced quietly for next time.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RuntimeOptionGroup } from '@blobot/core';
import { RuntimeOptionsCache, type RuntimeOptionsProbe } from './runtime-options.js';

const GROUPS: readonly RuntimeOptionGroup[] = [
  { id: 'model', label: 'Model', choices: [{ value: 'sonnet', label: 'sonnet', isDefault: true }] },
];

function file(): string {
  return join(mkdtempSync(join(tmpdir(), 'blobot-options-test-')), 'runtime-options.json');
}

/** A probe that counts its spawns, which is the cost the whole thing exists to avoid. */
function counting(
  answer: (runtimeId: string) => RuntimeOptionsProbe = (runtimeId) => ({ runtimeId, groups: GROUPS }),
): { probe: (runtimeId: string, executablePath?: string) => Promise<RuntimeOptionsProbe>; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    probe: async (runtimeId, executablePath) => {
      calls.push(`${runtimeId} ${executablePath ?? ''}`);
      return answer(runtimeId);
    },
  };
}

describe('asking a runtime what it offers', () => {
  it('spawns once per launch, as it always did', async () => {
    const { probe, calls } = counting();
    const cache = new RuntimeOptionsCache({ probe });

    await cache.describe('claude-code', '/bin/claude', '2.1.251');
    await cache.describe('claude-code', '/bin/claude', '2.1.251');

    expect(calls).toHaveLength(1);
  });

  it('does not spawn at all on the next launch', async () => {
    const path = file();
    const first = counting();
    await new RuntimeOptionsCache({ probe: first.probe, file: path }).describe(
      'claude-code',
      '/bin/claude',
      '2.1.251',
    );

    // A second cache is a second launch: nothing in memory, everything on disk.
    const next = counting();
    const answer = await new RuntimeOptionsCache({ probe: next.probe, file: path }).describe(
      'claude-code',
      '/bin/claude',
      '2.1.251',
    );

    expect(next.calls).toHaveLength(0);
    expect(answer.groups).toEqual(GROUPS);
  });

  it('throws the answer away when the binary has been upgraded', async () => {
    const path = file();
    await new RuntimeOptionsCache({ probe: counting().probe, file: path }).describe(
      'claude-code',
      '/bin/claude',
      '2.1.251',
    );

    const next = counting();
    await new RuntimeOptionsCache({ probe: next.probe, file: path }).describe(
      'claude-code',
      '/bin/claude',
      '2.2.0',
    );

    // The upgrade is the whole reason a model list moves, so the version is a key and not a
    // timer. Same for a different binary: a second install answers for itself.
    expect(next.calls).toHaveLength(1);
  });

  it('answers a day-old list now and replaces it for next time', async () => {
    const path = file();
    let clock = 1_000_000;
    await new RuntimeOptionsCache({ probe: counting().probe, file: path, now: () => clock }).describe(
      'claude-code',
      '/bin/claude',
      '2.1.251',
    );

    clock += 25 * 60 * 60 * 1000;
    const later = counting(() => ({
      runtimeId: 'claude-code',
      groups: [{ id: 'model', label: 'Model', choices: [{ value: 'opus', label: 'opus' }] }],
    }));
    const cache = new RuntimeOptionsCache({ probe: later.probe, file: path, now: () => clock });
    const answer = await cache.describe('claude-code', '/bin/claude', '2.1.251');

    // Drawn from what was remembered, not from the refresh: a menu that stalls to be current
    // is the thing this exists to stop.
    expect(answer.groups).toEqual(GROUPS);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(later.calls).toHaveLength(1);
    expect(JSON.parse(readFileSync(path, 'utf8')).runtimes['claude-code'].groups[0].choices[0].value).toBe(
      'opus',
    );
  });

  it('never remembers a failure', async () => {
    const path = file();
    const failing = counting((runtimeId) => ({ runtimeId, groups: [], error: 'not found on PATH' }));
    const cache = new RuntimeOptionsCache({ probe: failing.probe, file: path });

    const answer = await cache.describe('opencode', '/bin/opencode', '1.18.4');
    expect(answer.error).toBe('not found on PATH');

    // The ordinary reasons are a CLI that is not installed yet or is signed out, and both are
    // fixed in another window and come back from. Asking again is the point.
    await cache.describe('opencode', '/bin/opencode', '1.18.4');
    expect(failing.calls).toHaveLength(2);
    expect(() => readFileSync(path, 'utf8')).toThrow();
  });

  it('keeps one entry per runtime and leaves the others alone', async () => {
    const path = file();
    const cache = new RuntimeOptionsCache({ probe: counting().probe, file: path });
    await cache.describe('claude-code', '/bin/claude', '2.1.251');
    await cache.describe('opencode', '/bin/opencode', '1.18.4');

    expect(Object.keys(JSON.parse(readFileSync(path, 'utf8')).runtimes).sort()).toEqual([
      'claude-code',
      'opencode',
    ]);
  });

  it('treats a file it cannot read as no file at all', async () => {
    const path = file();
    writeFileSync(path, 'this is not json', 'utf8');
    const { probe, calls } = counting();

    const answer = await new RuntimeOptionsCache({ probe, file: path }).describe(
      'claude-code',
      '/bin/claude',
      '2.1.251',
    );

    expect(calls).toHaveLength(1);
    expect(answer.groups).toEqual(GROUPS);
    // And it repairs itself by writing over it, so the next launch is fast again.
    expect(JSON.parse(readFileSync(path, 'utf8')).version).toBe(1);
  });
});
