import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { CommandResult, CommandRunner } from './status.js';
import { readWorkspaceTree } from './tree.js';

/**
 * A real temporary tree for the `readdir`, and an injected runner for the git.
 *
 * `status.test.ts`'s shape exactly: the runner answers by the first words of the command line,
 * so a test says only what it means. The claims here are the ones a screenshot cannot make, and
 * every one of them is about a distinction the tree must not collapse.
 */
const here = mkdtempSync(join(tmpdir(), 'blobot-tree-'));
afterAll(() => rmSync(here, { recursive: true, force: true }));

mkdirSync(join(here, 'src'));
mkdirSync(join(here, 'node_modules'));
mkdirSync(join(here, 'drafts'));
mkdirSync(join(here, '.git'));
writeFileSync(join(here, 'src', 'Blob.tsx'), 'x');
writeFileSync(join(here, 'CLAUDE.md'), 'x');
writeFileSync(join(here, '.git', 'HEAD'), 'x');

function runner(table: Record<string, Partial<CommandResult>>): CommandRunner {
  return async (command, args) => {
    const key = [command, ...args].join(' ');
    const match = Object.keys(table).find((prefix) => key.startsWith(prefix));
    const answer = match === undefined ? {} : (table[match] as Partial<CommandResult>);
    return { code: answer.code ?? 0, stdout: answer.stdout ?? '', stderr: answer.stderr ?? '' };
  };
}

const AT_ROOT = {
  'git rev-parse --show-toplevel': { stdout: `${here}\n` },
} as const;

const nothingIgnored = (paths: readonly string[]): string =>
  `${paths.map((path) => `::\t${join(here, path)}`).join('\n')}\n`;

describe('one directory of an AgentWorkspace', () => {
  it('excludes .git by our own rule, because git calls it not ignored', async () => {
    const tree = await readWorkspaceTree(here, [''], {
      kind: 'git',
      run: runner({
        ...AT_ROOT,
        'git status': { stdout: '' },
        'git check-ignore': { stdout: nothingIgnored(['drafts', 'node_modules', 'src', 'CLAUDE.md']) },
      }),
    });
    const [root] = tree.directories;
    expect(root?.entries.map((entry) => entry.name)).toEqual([
      'drafts',
      'node_modules',
      'src',
      'CLAUDE.md',
    ]);
  });

  it('dims an ignored directory rather than hiding it, and does not descend into it', async () => {
    const tree = await readWorkspaceTree(here, [''], {
      kind: 'git',
      run: runner({
        ...AT_ROOT,
        'git status': { stdout: '' },
        'git check-ignore': {
          stdout: [
            `.gitignore:1:node_modules/\t${join(here, 'node_modules')}`,
            `::\t${join(here, 'drafts')}`,
            `::\t${join(here, 'src')}`,
            `::\t${join(here, 'CLAUDE.md')}`,
            '',
          ].join('\n'),
        },
      }),
    });
    const entries = tree.directories[0]?.entries ?? [];
    expect(entries.find((entry) => entry.name === 'node_modules')?.ignored).toBe(true);
    expect(entries.find((entry) => entry.name === 'src')?.ignored).toBeUndefined();
    // One listing was asked for and one was returned. Nothing walked into the ignored one.
    expect(tree.directories).toHaveLength(1);
  });

  it('does not draw an empty untracked directory as ignored, which is where the cheap derivation is wrong', async () => {
    const tree = await readWorkspaceTree(here, [''], {
      kind: 'git',
      // `drafts` is empty, so it is in neither `ls-files` nor `status`, exactly as an ignored
      // directory is. Only `check-ignore` can tell the two apart, and it says this one is not.
      run: runner({
        ...AT_ROOT,
        'git status': { stdout: '' },
        'git check-ignore': { stdout: nothingIgnored(['drafts', 'node_modules', 'src', 'CLAUDE.md']) },
      }),
    });
    const drafts = tree.directories[0]?.entries.find((entry) => entry.name === 'drafts');
    expect(drafts).toMatchObject({ kind: 'directory' });
    expect(drafts?.ignored).toBeUndefined();
  });

  it('carries a collapsed directory its roll-up with nothing having walked it', async () => {
    const tree = await readWorkspaceTree(here, [''], {
      kind: 'git',
      run: runner({
        ...AT_ROOT,
        'git status': {
          stdout: [
            '1 .M N... 100644 100644 100644 aaa aaa src/Blob.tsx',
            '1 .M N... 100644 100644 100644 bbb bbb src/styles.css',
            '1 .M N... 100644 100644 100644 ccc ccc CLAUDE.md',
            '? drafts/',
            '',
          ].join('\n'),
        },
        'git check-ignore': { stdout: nothingIgnored(['drafts', 'node_modules', 'src', 'CLAUDE.md']) },
      }),
    });
    const entries = tree.directories[0]?.entries ?? [];
    expect(entries.find((entry) => entry.name === 'src')).toMatchObject({ changes: 2 });
    expect(entries.find((entry) => entry.name === 'CLAUDE.md')).toMatchObject({ mark: 'M' });
    // `? drafts/` already says everything under it is new. A count there would be a walk to
    // repeat what the mark says.
    expect(entries.find((entry) => entry.name === 'drafts')).toMatchObject({ mark: '?' });
    expect(entries.find((entry) => entry.name === 'drafts')?.changes).toBeUndefined();
  });

  it('folds the marks under a collapsed directory so the count can say which kind', async () => {
    const fold = async (status: string): Promise<string | undefined> => {
      const tree = await readWorkspaceTree(here, [''], {
        kind: 'git',
        run: runner({
          ...AT_ROOT,
          'git status': { stdout: status },
          'git check-ignore': {
            stdout: nothingIgnored(['drafts', 'node_modules', 'src', 'CLAUDE.md']),
          },
        }),
      });
      return (tree.directories[0]?.entries ?? []).find((entry) => entry.name === 'src')?.mark;
    };

    // A folder of nothing but new files reads as added. Zed's rule, in the two letters this
    // tree has.
    expect(await fold('? src/one.ts\n? src/two.ts\n')).toBe('?');
    // Mixed is modified, because a change to a tracked file is the stronger claim and there is
    // no third letter to invent for it.
    expect(
      await fold('? src/one.ts\n1 .M N... 100644 100644 100644 aaa aaa src/Blob.tsx\n'),
    ).toBe('M');
  });

  it('keeps a committed file part of the work, which is what the agent committing used to erase', async () => {
    const tree = await readWorkspaceTree(here, [''], {
      kind: 'git',
      base: 'main',
      run: runner({
        ...AT_ROOT,
        // Nothing uncommitted but the lockfile: the shape of a real agent that has committed
        // its work, measured on `worktrees/blobatar/bob` when this was reported.
        'git status': { stdout: '1 .M N... 100644 100644 100644 aaa aaa CLAUDE.md\n' },
        'git diff --name-only main...HEAD': { stdout: 'CLAUDE.md\nsrc/Blob.tsx\n' },
        'git check-ignore': { stdout: nothingIgnored(['drafts', 'node_modules', 'src', 'CLAUDE.md']) },
      }),
    });
    const entries = tree.directories[0]?.entries ?? [];
    // Two channels, two facts. The lockfile is both; the committed file is only the first.
    expect(entries.find((entry) => entry.name === 'CLAUDE.md')).toMatchObject({
      touched: true,
      mark: 'M',
    });
    expect(entries.find((entry) => entry.name === 'src')).toMatchObject({ touched: true, changes: 1 });
    expect(entries.find((entry) => entry.name === 'src')?.mark).toBeUndefined();
  });

  it('says nothing about the branch when there is no base to measure against', async () => {
    const tree = await readWorkspaceTree(here, [''], {
      kind: 'git',
      run: runner({
        ...AT_ROOT,
        'git status': { stdout: '' },
        // A detached HEAD has no base, so `touched` collapses back onto the uncommitted half
        // rather than being guessed at.
        'git diff --name-only': { stdout: 'src/Blob.tsx\n' },
        'git check-ignore': { stdout: nothingIgnored(['drafts', 'node_modules', 'src', 'CLAUDE.md']) },
      }),
    });
    expect(tree.directories[0]?.entries.every((entry) => entry.touched === undefined)).toBe(true);
  });

  it('reports the ceiling rather than truncating silently', async () => {
    const crowded = join(here, 'crowded');
    mkdirSync(crowded, { recursive: true });
    for (let index = 0; index < 520; index += 1) writeFileSync(join(crowded, `f${index}.txt`), 'x');
    const tree = await readWorkspaceTree(here, ['crowded'], {
      kind: 'git',
      run: runner({ ...AT_ROOT, 'git status': { stdout: '' }, 'git check-ignore': { code: 1 } }),
    });
    expect(tree.directories[0]?.partial).toBe(true);
    expect(tree.directories[0]?.entries).toHaveLength(500);
  });

  it('says the folder is not there rather than drawing an empty tree', async () => {
    const tree = await readWorkspaceTree(join(here, 'gone'), [''], { kind: 'git', run: runner({}) });
    expect(tree).toEqual({ present: false, directories: [] });
  });
});

describe('a workspace git cannot answer for', () => {
  it('yields no status at all on a copy, rather than an empty one', async () => {
    let asked = 0;
    const tree = await readWorkspaceTree(here, [''], {
      kind: 'plain',
      run: async (command, args) => {
        asked += 1;
        return { code: 0, stdout: `${command} ${args.join(' ')}`, stderr: '' };
      },
    });
    // `tracked: false` is what makes the column absent rather than empty. An empty column reads
    // as *nothing changed*, which is the unverified absence this whole surface refuses.
    expect(tree.directories[0]?.tracked).toBe(false);
    expect(tree.directories[0]?.entries.every((entry) => entry.mark === undefined)).toBe(true);
    expect(asked).toBe(0);
  });

  it('marks where git starts again in a nested workspace, and leaves the loose files unmarked', async () => {
    const nested = mkdtempSync(join(tmpdir(), 'blobot-nested-'));
    mkdirSync(join(nested, 'storefront', '.git'), { recursive: true });
    writeFileSync(join(nested, 'notes.md'), 'x');
    const tree = await readWorkspaceTree(nested, [''], {
      kind: 'nested',
      // The Workspace root of a nested tree is in no repository: `rev-parse` fails there, which
      // is the seam. The repositories inside it answer for themselves.
      run: runner({
        'git rev-parse --show-toplevel': { code: 128 },
        'git status': { stdout: '1 .M N... 100644 100644 100644 aaa aaa a.ts\n? b.ts\n' },
      }),
    });
    const root = tree.directories[0];
    expect(root?.tracked).toBe(false);
    // The seam, and it needs no device of its own: in a listing git cannot answer for, the only
    // rows carrying a count are the repositories. The loose files beside them are a copy and
    // say nothing, which is the truth about them.
    expect(root?.entries.find((entry) => entry.name === 'storefront')).toMatchObject({
      repoRoot: true,
      changes: 2,
    });
    expect(root?.entries.find((entry) => entry.name === 'notes.md')?.mark).toBeUndefined();
    expect(root?.entries.find((entry) => entry.name === 'notes.md')?.changes).toBeUndefined();
    rmSync(nested, { recursive: true, force: true });
  });

  it('refuses a repository the workspace is merely sitting inside', async () => {
    const tree = await readWorkspaceTree(here, [''], {
      kind: 'git',
      // A worktree under some other checkout would otherwise be drawn with that checkout's
      // changed set over it.
      run: runner({
        'git rev-parse --show-toplevel': { stdout: '/somewhere/else\n' },
        'git check-ignore': { code: 1 },
      }),
    });
    expect(tree.directories[0]?.tracked).toBe(false);
  });
});
