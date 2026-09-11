import { describe, expect, it } from 'vitest';
import type { UiWorkspaceStatus } from '../shared/api.js';
import { ForgeMemory } from './forge-memory.js';

/**
 * A local read and a forge read answer different halves of one row. What is under test is that
 * the cheap read never takes away what the expensive one found, and never lends it to a branch
 * it was not about.
 */

const LOCAL: UiWorkspaceStatus = {
  agentId: 'alice',
  agentName: 'Alice',
  kind: 'git',
  branch: 'blobot/t1/alice',
  present: true,
  ahead: 2,
  unavailable: 'not looked up',
};

const PR = { number: 8, state: 'open', title: 'it', url: 'https://example.test/8' } as const;

const ASKED: UiWorkspaceStatus = (() => {
  const { unavailable: _, ...row } = LOCAL;
  return { ...row, pr: PR };
})();

describe('what the forge last said', () => {
  it('stays on the row through a local read', () => {
    const memory = new ForgeMemory();
    memory.settle('t1', [ASKED], true);
    const [row] = memory.settle('t1', [{ ...LOCAL, ahead: 3 }], false);
    expect(row?.pr).toEqual(PR);
    expect(row?.unavailable).toBeUndefined();
    // The local half is still the local read's.
    expect(row?.ahead).toBe(3);
  });

  it('remembers that it looked and found nothing, which is not the same as not looking', () => {
    const memory = new ForgeMemory();
    const { pr: _, ...none } = ASKED;
    memory.settle('t1', [none], true);
    const [row] = memory.settle('t1', [LOCAL], false);
    expect(row?.pr).toBeUndefined();
    expect(row?.unavailable).toBeUndefined();
  });

  it('is not lent to a branch the worktree switched onto', () => {
    const memory = new ForgeMemory();
    memory.settle('t1', [ASKED], true);
    const [row] = memory.settle('t1', [{ ...LOCAL, branch: 'spike' }], false);
    expect(row?.pr).toBeUndefined();
    expect(row?.unavailable).toBe('not looked up');
  });

  it('is replaced by the next forge read, so a closed pull request does not linger', () => {
    const memory = new ForgeMemory();
    memory.settle('t1', [ASKED], true);
    memory.settle('t1', [{ ...ASKED, pr: { ...PR, state: 'merged' } }], true);
    expect(memory.settle('t1', [LOCAL], false)[0]?.pr?.state).toBe('merged');
  });

  it('belongs to one team', () => {
    const memory = new ForgeMemory();
    memory.settle('t1', [ASKED], true);
    expect(memory.settle('t2', [LOCAL], false)[0]).toEqual(LOCAL);
  });

  it('says nothing about a folder that is gone', () => {
    const memory = new ForgeMemory();
    memory.settle('t1', [ASKED], true);
    const gone = { ...LOCAL, present: false, unavailable: 'the workspace is not there' };
    expect(memory.settle('t1', [gone], false)[0]).toEqual(gone);
  });
});
