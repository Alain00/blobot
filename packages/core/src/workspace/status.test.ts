import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { CommandResult, CommandRunner } from './status.js';
import { readAgentWorkspaceStatus, readPullRequest } from './status.js';
import type { AgentWorkspace } from './workspace.js';

const here = mkdtempSync(join(tmpdir(), 'blobot-status-'));
afterAll(() => rmSync(here, { recursive: true, force: true }));

const workspace: AgentWorkspace = {
  agentId: 'a1',
  path: here,
  branch: 'blobot/demo/alice',
};

/** A runner answering by the first two words of the command line, so a test says only what it means. */
function runner(table: Record<string, Partial<CommandResult>>): CommandRunner {
  return async (command, args) => {
    const key = [command, ...args].join(' ');
    const match = Object.keys(table).find((prefix) => key.startsWith(prefix));
    const answer = match === undefined ? {} : (table[match] as Partial<CommandResult>);
    return { code: answer.code ?? 0, stdout: answer.stdout ?? '', stderr: answer.stderr ?? '' };
  };
}

const ONE_PR = JSON.stringify([
  { number: 142, state: 'OPEN', isDraft: false, title: 'the budget', url: 'https://github.com/o/r/pull/142' },
]);

describe('readAgentWorkspaceStatus', () => {
  it('counts what the worktree is holding', async () => {
    const status = await readAgentWorkspaceStatus(workspace, {
      kind: 'git',
      agentName: 'alice',
      base: 'main',
      run: runner({
        'git status --porcelain': { stdout: ' M a.ts\n?? b.ts\n' },
        'git rev-list --count': { stdout: '2\n' },
        'git rev-parse --verify': { code: 0 },
      }),
    });
    expect(status).toMatchObject({ present: true, changed: 2, ahead: 2, pushed: true });
  });

  it('does not look the pull request up unless asked', async () => {
    const status = await readAgentWorkspaceStatus(workspace, {
      kind: 'git',
      agentName: 'alice',
      run: runner({ 'gh pr list': { stdout: ONE_PR } }),
    });
    expect(status.forge).toEqual({ asked: false, detail: 'not looked up' });
  });

  it('reads the pull request when it is', async () => {
    const status = await readAgentWorkspaceStatus(workspace, {
      kind: 'git',
      agentName: 'alice',
      forge: true,
      run: runner({ 'gh --version': { stdout: 'gh version 2.55.0' }, 'gh pr list': { stdout: ONE_PR } }),
    });
    expect(status.forge).toEqual({ asked: true, pr: { number: 142, state: 'open', title: 'the budget', url: 'https://github.com/o/r/pull/142' } });
  });

  it('says a copy has no branch rather than running git in it', async () => {
    let ran = false;
    const status = await readAgentWorkspaceStatus(
      { agentId: 'a1', path: here },
      {
        kind: 'plain',
        agentName: 'bob',
        forge: true,
        run: async () => {
          ran = true;
          return { code: 0, stdout: '', stderr: '' };
        },
      },
    );
    expect(ran).toBe(false);
    expect(status).toMatchObject({ present: true, forge: { asked: false, detail: 'a copy has no branch' } });
  });

  it('reports a workspace that is not there without asking anything about it', async () => {
    const status = await readAgentWorkspaceStatus(
      { ...workspace, path: join(here, 'gone') },
      { kind: 'git', agentName: 'alice', forge: true, run: runner({}) },
    );
    expect(status.present).toBe(false);
  });
});

describe('readPullRequest', () => {
  it('separates no pull request from could not look', async () => {
    const none = await readPullRequest(here, 'b', runner({ 'gh --version': {}, 'gh pr list': { stdout: '[]' } }));
    expect(none).toEqual({ asked: true });

    const silent = await readPullRequest(here, 'b', runner({ 'gh --version': { code: 127 } }));
    expect(silent).toEqual({ asked: false, detail: 'gh is not installed' });
  });

  it('names the three reasons gh usually cannot answer', async () => {
    const noRemote = await readPullRequest(here, 'b', runner({ 'gh --version': {}, 'gh pr list': { code: 1, stderr: 'no git remotes found' } }));
    expect(noRemote).toEqual({ asked: false, detail: 'this repository has no remote' });

    const signedOut = await readPullRequest(here, 'b', runner({ 'gh --version': {}, 'gh pr list': { code: 4, stderr: 'To get started with GitHub CLI, please run: gh auth login' } }));
    expect(signedOut).toEqual({ asked: false, detail: 'gh is not signed in' });

    const odd = await readPullRequest(here, 'b', runner({ 'gh --version': {}, 'gh pr list': { code: 1, stderr: 'the server exploded\nsecond line' } }));
    expect(odd).toEqual({ asked: false, detail: 'the server exploded' });
  });

  it('draws a draft as its own state, and keeps merged', async () => {
    const draft = await readPullRequest(
      here,
      'b',
      runner({ 'gh --version': {}, 'gh pr list': { stdout: JSON.stringify([{ number: 7, state: 'OPEN', isDraft: true, title: 't', url: 'u' }]) } }),
    );
    expect(draft).toMatchObject({ asked: true, pr: { state: 'draft' } });

    const merged = await readPullRequest(
      here,
      'b',
      runner({ 'gh --version': {}, 'gh pr list': { stdout: JSON.stringify([{ number: 7, state: 'MERGED', isDraft: false, title: 't', url: 'u' }]) } }),
    );
    expect(merged).toMatchObject({ asked: true, pr: { state: 'merged' } });
  });

  it('treats unreadable output as could not look, never as none', async () => {
    const broken = await readPullRequest(here, 'b', runner({ 'gh --version': {}, 'gh pr list': { stdout: 'not json' } }));
    expect(broken).toEqual({ asked: false, detail: 'gh returned something unreadable' });
  });
});
