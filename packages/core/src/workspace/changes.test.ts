import { describe, expect, it } from 'vitest';
import { readChanges } from './changes.js';
import type { CommandResult, CommandRunner } from './status.js';

/**
 * The rows, and the two things about them a figure never had to be right about: which **path**
 * a row is, and whether committing that path alone would leave something behind.
 *
 * `churn.test.ts` still owns the arithmetic; every claim here is about a shape git prints that a
 * sum could afford to ignore.
 */
function runner(table: Record<string, Partial<CommandResult>>): CommandRunner {
  return async (command, args) => {
    const key = [command, ...args].join(' ');
    const match = Object.keys(table)
      .sort((a, b) => b.length - a.length)
      .find((prefix) => key.startsWith(prefix));
    const answer = match === undefined ? {} : (table[match] as Partial<CommandResult>);
    return { code: answer.code ?? 0, stdout: answer.stdout ?? '', stderr: answer.stderr ?? '' };
  };
}

describe('readChanges', () => {
  it('gives every changed file its own row, tracked and untracked together', async () => {
    const changes = await readChanges(
      '/w',
      runner({
        'git diff --numstat -z HEAD': { stdout: '12\t3\tsrc/a.ts\x000\t7\tsrc/b.ts\x00' },
        'git ls-files --others': { stdout: 'src/new.ts\x00' },
        'git diff --no-index': { code: 1, stdout: '40\t0\tsrc/new.ts\x00' },
      }),
    );
    expect(changes?.rows).toEqual([
      { path: 'src/a.ts', added: 12, removed: 3 },
      { path: 'src/b.ts', added: 0, removed: 7 },
      { path: 'src/new.ts', added: 40, removed: 0, untracked: true },
    ]);
    expect(changes).toMatchObject({ added: 52, removed: 10, files: 3 });
  });

  it('carries both of a rename’s paths, because a commit that takes one leaves the other', async () => {
    // The line form prints this as `src/{old.ts => new.ts}`, which is a sentence about two paths
    // rather than a path, and `git commit --` refuses it. The NUL form is why `-z` is here.
    const changes = await readChanges(
      '/w',
      runner({
        'git diff --numstat -z HEAD': { stdout: '1\t0\t\x00src/old.ts\x00src/new.ts\x00' },
      }),
    );
    expect(changes?.rows).toEqual([
      { path: 'src/new.ts', added: 1, removed: 0, from: 'src/old.ts' },
    ]);
  });

  it('keeps a path with a space in it whole', async () => {
    const changes = await readChanges(
      '/w',
      runner({
        'git diff --numstat -z HEAD': { stdout: '' },
        'git ls-files --others': { stdout: 'a file.txt\x00' },
        'git diff --no-index': { code: 1, stdout: '1\t0\ta file.txt\x00' },
      }),
    );
    expect(changes?.rows[0]?.path).toBe('a file.txt');
  });

  it('is undefined rather than empty where git will not answer', async () => {
    // Empty is a claim that nothing changed, which is a different thing from not knowing, and a
    // panel offering a commit must not draw the second as the first.
    expect(await readChanges('/w', runner({ 'git diff --numstat -z HEAD': { code: 128 } }))).toBeUndefined();
  });
});
