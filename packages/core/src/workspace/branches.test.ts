import { describe, expect, it } from 'vitest';
import { currentBranch, listBranches, switchBranch } from './branches.js';
import type { CommandResult, CommandRunner } from './status.js';

/**
 * The branch menu under an agent's composer, and the one write in this directory.
 *
 * The claims worth pinning are the ones a screenshot cannot make: that a branch a teammate's
 * worktree is holding comes back marked rather than missing, that the worktree's own branch is
 * never marked against itself, and that a refusal from git reaches the user as git's own
 * sentence. A menu that quietly dropped the held branches would send the user looking for a
 * branch they know exists.
 */

function runner(table: Record<string, Partial<CommandResult>>): CommandRunner {
  return async (command, args) => {
    const key = [command, ...args].join(' ');
    const match = Object.keys(table).find((prefix) => key.startsWith(prefix));
    const answer = match === undefined ? {} : (table[match] as Partial<CommandResult>);
    return { code: answer.code ?? 0, stdout: answer.stdout ?? '', stderr: answer.stderr ?? '' };
  };
}

const WORKTREES = [
  'worktree /home/u/repo',
  'HEAD abc',
  'branch refs/heads/main',
  '',
  'worktree /home/u/.local/share/blobot/worktrees/demo/alice',
  'HEAD def',
  'branch refs/heads/blobot/demo/alice',
  '',
  'worktree /home/u/.local/share/blobot/worktrees/demo/bob',
  'HEAD ghi',
  'branch refs/heads/blobot/demo/bob',
  '',
].join('\n');

const REPO = runner({
  'git for-each-ref': { stdout: 'main\nblobot/demo/alice\nblobot/demo/bob\nspike\n' },
  'git worktree list': { stdout: WORKTREES },
  'git rev-parse --abbrev-ref HEAD': { stdout: 'blobot/demo/alice\n' },
});

describe('listBranches', () => {
  it('names every local branch, and which one this worktree is on', async () => {
    const listing = await listBranches('/w', REPO);
    expect(listing.current).toBe('blobot/demo/alice');
    expect(listing.branches.map((branch) => branch.name)).toEqual([
      'main',
      'blobot/demo/alice',
      'blobot/demo/bob',
      'spike',
    ]);
    expect(listing.branches.find((branch) => branch.current)?.name).toBe('blobot/demo/alice');
  });

  it('says who is holding a branch rather than leaving it out of the list', async () => {
    const listing = await listBranches('/w', REPO);
    const bob = listing.branches.find((branch) => branch.name === 'blobot/demo/bob');
    // git will refuse this one, and *why* is the useful half. Dropping the row would leave the
    // user hunting for a branch they can see in their own terminal.
    expect(bob?.heldBy).toContain('demo/bob');
    expect(listing.branches.find((branch) => branch.name === 'main')?.heldBy).toBe('/home/u/repo');
  });

  it('never reports the current branch as held, though a worktree does hold it', async () => {
    const listing = await listBranches('/w', REPO);
    expect(listing.branches.find((branch) => branch.name === 'blobot/demo/alice')?.heldBy).toBeUndefined();
  });

  it('is empty rather than wrong where git will not answer', async () => {
    const listing = await listBranches('/w', runner({ 'git for-each-ref': { code: 128 } }));
    expect(listing.branches).toEqual([]);
  });

  it('leaves a free branch free', async () => {
    const listing = await listBranches('/w', REPO);
    expect(listing.branches.find((branch) => branch.name === 'spike')?.heldBy).toBeUndefined();
  });
});

describe('currentBranch', () => {
  it('reads a detached HEAD as no branch rather than as one called HEAD', async () => {
    expect(await currentBranch('/w', runner({ 'git rev-parse': { stdout: 'HEAD\n' } }))).toBeUndefined();
  });

  it('is undefined where git failed, so the caller keeps the name it already had', async () => {
    expect(await currentBranch('/w', runner({ 'git rev-parse': { code: 128 } }))).toBeUndefined();
  });
});

describe('switchBranch', () => {
  it('switches to a branch that exists', async () => {
    let ran: readonly string[] = [];
    const outcome = await switchBranch('/w', 'spike', {}, async (_command, args) => {
      ran = args;
      return { code: 0, stdout: '', stderr: '' };
    });
    expect(ran).toEqual(['switch', 'spike']);
    expect(outcome).toEqual({ ok: true, branch: 'spike' });
  });

  it('cuts a new one where it is standing when asked to', async () => {
    let ran: readonly string[] = [];
    await switchBranch('/w', 'try-it', { create: true }, async (_command, args) => {
      ran = args;
      return { code: 0, stdout: '', stderr: '' };
    });
    expect(ran).toEqual(['switch', '-c', 'try-it']);
  });

  it('passes git’s own refusal through, without the word fatal', async () => {
    const outcome = await switchBranch(
      '/w',
      'blobot/demo/bob',
      {},
      runner({
        'git switch': {
          code: 128,
          stderr: "fatal: 'blobot/demo/bob' is already used by worktree at '/w/bob'\n",
        },
      }),
    );
    expect(outcome).toEqual({
      ok: false,
      error: "'blobot/demo/bob' is already used by worktree at '/w/bob'",
    });
  });

  it('refuses an empty name without running git', async () => {
    let ran = false;
    const outcome = await switchBranch('/w', '   ', {}, async () => {
      ran = true;
      return { code: 0, stdout: '', stderr: '' };
    });
    expect(ran).toBe(false);
    expect(outcome.ok).toBe(false);
  });
});
