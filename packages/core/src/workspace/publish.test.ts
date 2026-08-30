import { describe, expect, it } from 'vitest';
import type { CommandRunner } from './status.js';
import { publishBranch, publishPlan } from './publish.js';

const request = { path: '/w', branch: 'blobot/demo/alice', base: 'main' };

describe('publishPlan', () => {
  it('writes the two commands the way a person reads them', () => {
    expect(publishPlan(request)).toEqual([
      'git push -u origin blobot/demo/alice',
      'gh pr create --base main --head blobot/demo/alice --fill',
    ]);
    expect(publishPlan({ ...request, title: 'the budget', draft: true })[1]).toBe(
      'gh pr create --base main --head blobot/demo/alice --draft --title "the budget"',
    );
  });
});

describe('publishBranch', () => {
  function record(answers: Record<string, { code?: number; stdout?: string; stderr?: string }>): {
    run: CommandRunner;
    calls: string[][];
  } {
    const calls: string[][] = [];
    const run: CommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      const key = [command, ...args].join(' ');
      const match = Object.keys(answers).find((prefix) => key.startsWith(prefix));
      const answer = match === undefined ? {} : answers[match];
      return { code: answer?.code ?? 0, stdout: answer?.stdout ?? '', stderr: answer?.stderr ?? '' };
    };
    return { run, calls };
  }

  it('pushes, then opens, and returns where it went', async () => {
    const { run, calls } = record({ 'gh pr create': { stdout: 'https://github.com/o/r/pull/9\n' } });
    const outcome = await publishBranch(request, { run });
    expect(outcome).toEqual({ ok: true, url: 'https://github.com/o/r/pull/9' });
    expect(calls[0]).toEqual(['git', 'push', '-u', 'origin', 'blobot/demo/alice']);
  });

  it('does not open a pull request for a branch it could not push', async () => {
    const { run, calls } = record({ 'git push': { code: 1, stderr: 'rejected\nhint: fetch first' } });
    expect(await publishBranch(request, { run })).toEqual({ ok: false, step: 'push', error: 'rejected' });
    expect(calls).toHaveLength(1);
  });

  it('says the push landed when only the create failed', async () => {
    const { run } = record({ 'gh pr create': { code: 1, stderr: 'a pull request already exists' } });
    expect(await publishBranch(request, { run })).toEqual({
      ok: false,
      step: 'create',
      error: 'a pull request already exists',
    });
  });

  it('passes a title as one argument rather than as a command line', async () => {
    const { run, calls } = record({ 'gh pr create': { stdout: 'https://x/1' } });
    await publishBranch({ ...request, title: 'fix; rm -rf /', body: 'b' }, { run });
    const create = calls[1] as string[];
    expect(create).toContain('fix; rm -rf /');
    expect(create).toContain('--title');
  });
});
