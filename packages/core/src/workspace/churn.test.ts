import { describe, expect, it } from 'vitest';
import { readChurn } from './churn.js';
import type { CommandResult, CommandRunner } from './status.js';

/**
 * Lines, not files.
 *
 * The claims worth pinning are the ones about what git does *not* say on its own: an untracked
 * file is invisible to `git diff` and is all additions once committed, a binary file is a change
 * with no lines in it, and a repository holding a thousand new files is a number blobot should
 * refuse to spend a thousand subprocesses on rather than quietly under-report.
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

describe('readChurn', () => {
  it('adds the tracked lines up, in both directions', async () => {
    const churn = await readChurn(
      '/w',
      runner({ 'git diff --numstat HEAD': { stdout: '12\t3\tsrc/a.ts\n0\t7\tsrc/b.ts\n' } }),
    );
    expect(churn).toEqual({ added: 12, removed: 10, files: 2 });
  });

  it('counts an untracked file as the additions committing it would make', async () => {
    const churn = await readChurn(
      '/w',
      runner({
        'git diff --numstat HEAD': { stdout: '1\t1\tsrc/a.ts\n' },
        'git ls-files --others': { stdout: 'src/new.ts\n' },
        // `--no-index` exits 1 whenever the two differ, which is every time here.
        'git diff --no-index': { code: 1, stdout: '40\t0\tsrc/new.ts\n' },
      }),
    );
    expect(churn).toEqual({ added: 41, removed: 1, files: 2 });
  });

  it('counts a binary file once as a file and never as a line', async () => {
    const churn = await readChurn(
      '/w',
      runner({ 'git diff --numstat HEAD': { stdout: '-\t-\tlogo.png\n' } }),
    );
    expect(churn).toEqual({ added: 0, removed: 0, files: 1 });
  });

  it('stops counting untracked files past the ceiling, and says the number is a floor', async () => {
    const many = Array.from({ length: 140 }, (_index, at) => `f${at}.ts`).join('\n');
    let diffs = 0;
    const churn = await readChurn('/w', async (_command, args) => {
      const key = args.join(' ');
      if (key.startsWith('diff --numstat HEAD')) return { code: 0, stdout: '', stderr: '' };
      if (key.startsWith('ls-files')) return { code: 0, stdout: many, stderr: '' };
      diffs += 1;
      return { code: 1, stdout: '1\t0\tf.ts\n', stderr: '' };
    });
    expect(diffs).toBe(100);
    expect(churn?.partial).toBe(true);
  });

  it('is undefined rather than zero where git will not answer', async () => {
    // Zero would be a claim that nothing has changed, which is a different thing from not
    // knowing, and the tray must not draw the second as the first.
    expect(await readChurn('/w', runner({ 'git diff --numstat HEAD': { code: 128 } }))).toBeUndefined();
  });
});
