import { describe, expect, it } from 'vitest';
import { commitPlan, commitWorktree } from './commit.js';
import type { CommandResult, CommandRunner } from './status.js';

function runner(table: Record<string, Partial<CommandResult>>): CommandRunner {
  return async (command, args) => {
    const key = [command, ...args].join(' ');
    const match = Object.keys(table).find((prefix) => key.startsWith(prefix));
    const answer = match === undefined ? {} : (table[match] as Partial<CommandResult>);
    return { code: answer.code ?? 0, stdout: answer.stdout ?? '', stderr: answer.stderr ?? '' };
  };
}

describe('commitPlan', () => {
  it('shows the two commands the user is agreeing to', () => {
    expect(commitPlan({ path: '/w', message: 'fix the retry loop' })).toEqual([
      'git add -A',
      'git commit -m "fix the retry loop"',
    ]);
  });
});

describe('commitWorktree', () => {
  it('stages everything in the worktree, then commits it', async () => {
    const ran: string[] = [];
    const outcome = await commitWorktree({ path: '/w', message: 'one' }, async (command, args) => {
      ran.push([command, ...args].join(' '));
      return { code: 0, stdout: 'ab12cd3\n', stderr: '' };
    });
    expect(ran[0]).toBe('git add -A');
    expect(ran[1]).toBe('git commit -m one');
    expect(outcome).toEqual({ ok: true, sha: 'ab12cd3' });
  });

  it('refuses an empty message without running git', async () => {
    let ran = false;
    const outcome = await commitWorktree({ path: '/w', message: '  ' }, async () => {
      ran = true;
      return { code: 0, stdout: '', stderr: '' };
    });
    expect(ran).toBe(false);
    expect(outcome).toEqual({ ok: false, error: 'a commit needs a message' });
  });

  it('says nothing to commit, and not the branch name git leads that paragraph with', async () => {
    // Found live: `git commit` with nothing staged exits 1 and prints a paragraph beginning
    // `On branch try-it`, so taking the first line reported the branch and meant the opposite.
    const outcome = await commitWorktree(
      { path: '/w', message: 'one' },
      runner({
        'git commit': {
          code: 1,
          stdout: 'On branch try-it\nYour branch is ahead of main by 1 commit.\n\nnothing to commit, working tree clean\n',
        },
      }),
    );
    expect(outcome).toEqual({ ok: false, error: 'nothing to commit, working tree clean' });
  });

  it('passes a refusal from git through without the word fatal', async () => {
    const outcome = await commitWorktree(
      { path: '/w', message: 'one' },
      runner({
        'git commit': { code: 128, stderr: 'fatal: unable to auto-detect email address\n' },
      }),
    );
    expect(outcome).toEqual({ ok: false, error: 'unable to auto-detect email address' });
  });

  it('takes a selection with a pathspec and never touches the index', async () => {
    const ran: string[] = [];
    const outcome = await commitWorktree(
      { path: '/w', message: 'one', paths: ['src/a.ts', 'src/b.ts'] },
      async (command, args) => {
        ran.push([command, ...args].join(' '));
        return { code: 0, stdout: 'ab12cd3\n', stderr: '' };
      },
    );
    // No `add` at all: a partial commit reads the worktree for those paths and leaves the index
    // as it was, which is what lets the ticks be blobot's own and not git's.
    expect(ran[0]).toBe('git commit -m one -- src/a.ts src/b.ts');
    expect(outcome).toEqual({ ok: true, sha: 'ab12cd3' });
  });

  it('adds the new files in a selection, because a pathspec cannot name them', async () => {
    const ran: string[] = [];
    await commitWorktree(
      { path: '/w', message: 'one', paths: ['src/a.ts', 'src/new.ts'], untracked: ['src/new.ts'] },
      async (command, args) => {
        ran.push([command, ...args].join(' '));
        return { code: 0, stdout: 'ab12cd3\n', stderr: '' };
      },
    );
    expect(ran[0]).toBe('git add -- src/new.ts');
    expect(ran[1]).toBe('git commit -m one -- src/a.ts src/new.ts');
  });

  it('takes that add back when the commit is refused', async () => {
    // The add is the one thing here that outlives a failure. A refused commit that left a file
    // staged would leave the worktree in a state the user never chose and cannot see.
    const ran: string[] = [];
    const outcome = await commitWorktree(
      { path: '/w', message: 'one', paths: ['src/new.ts'], untracked: ['src/new.ts'] },
      async (command, args) => {
        const key = [command, ...args].join(' ');
        ran.push(key);
        if (key.startsWith('git commit')) {
          return { code: 128, stdout: '', stderr: 'fatal: unable to auto-detect email address\n' };
        }
        return { code: 0, stdout: '', stderr: '' };
      },
    );
    expect(ran).toContain('git reset -q -- src/new.ts');
    expect(outcome).toEqual({ ok: false, error: 'unable to auto-detect email address' });
  });

  it('refuses a selection of nothing rather than committing everything', async () => {
    let ran = false;
    const outcome = await commitWorktree({ path: '/w', message: 'one', paths: [] }, async () => {
      ran = true;
      return { code: 0, stdout: '', stderr: '' };
    });
    expect(ran).toBe(false);
    expect(outcome).toEqual({ ok: false, error: 'nothing is ticked' });
  });
});
