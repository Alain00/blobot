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
});
