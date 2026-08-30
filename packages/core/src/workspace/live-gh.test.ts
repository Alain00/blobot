import { describe, expect, it } from 'vitest';
import { readAgentWorkspaceStatus, readPullRequest, spawnCommand } from './status.js';

/**
 * The half no fake can prove: a real `gh`, a real remote, a real pull request.
 *
 * Gated the way every live suite here is gated, and pointed at a repository the runner names,
 * because nothing in this repo can serve as its own fixture: blobot has no remote, which is
 * itself one of the cases under test.
 *
 *   BLOBOT_LIVE_GH=/path/to/a/github/repo pnpm --filter @blobot/core test live-gh
 *
 * Read-only. Nothing here pushes, and nothing here opens a pull request.
 */
const repo = process.env.BLOBOT_LIVE_GH;
const live = repo === undefined || repo === '' ? describe.skip : describe;

live('a real gh', () => {
  it('finds the pull request whose head is a branch that has one', async () => {
    const branch = process.env.BLOBOT_LIVE_GH_BRANCH;
    if (branch === undefined) return;
    const reading = await readPullRequest(repo as string, branch, spawnCommand);
    expect(reading.asked).toBe(true);
    if (reading.asked) expect(reading.pr?.number).toBeGreaterThan(0);
  }, 30_000);

  it('says no pull request, rather than could not look, for a branch that has none', async () => {
    const reading = await readPullRequest(repo as string, 'blobot/no/such/branch', spawnCommand);
    expect(reading).toEqual({ asked: true });
  }, 30_000);

  it('reads a real working tree', async () => {
    const status = await readAgentWorkspaceStatus(
      { agentId: 'live', path: repo as string, branch: 'main' },
      { kind: 'git', agentName: 'live', forge: false },
    );
    expect(status.present).toBe(true);
    expect(status.changed).toBeTypeOf('number');
  }, 30_000);
});

describe('a repository with no remote', () => {
  it('is silent rather than an error', async () => {
    const reading = await readPullRequest(process.cwd(), 'master', spawnCommand);
    // This repository has no remote on purpose, so this is the case the developer's own
    // machine exercises every time the suite runs.
    if (!reading.asked) expect(reading.detail).toMatch(/no remote|not installed|not signed in/);
  }, 30_000);
});
