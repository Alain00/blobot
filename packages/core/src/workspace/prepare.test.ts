import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findWorkspaceIcon } from './icon.js';
import { prepareWorkspace } from './prepare.js';
import { WorkspaceError } from './workspace.js';

/**
 * The folder blobot makes for a team that has not got one, and the icon it finds in a folder
 * that has. Against the real filesystem and the real `git`, like the rest of this directory:
 * every claim here is a claim about what those two actually do.
 */

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function scratch(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), `blobot-${prefix}-`));
  temporary.push(path);
  return path;
}

describe('a folder blobot makes for a team', () => {
  it('is a git repository with something to branch from, not a plain folder', async () => {
    const root = scratch('root');

    const inspection = await prepareWorkspace(root, 'checkout');

    // Both halves matter. `git` is what gives every agent a branch and a diff; `hasCommits` is
    // the one state the creation flow genuinely refuses, and an empty commit is what avoids it.
    expect(inspection.kind).toBe('git');
    expect(inspection.hasCommits).toBe(true);
    expect(inspection.path).toBe(join(root, 'checkout'));
  });

  it('names the folder after the team, as a ref would', async () => {
    const root = scratch('root');

    const inspection = await prepareWorkspace(root, 'Checkout Flow');

    // The same slug the branch is built from, because a folder called `Checkout Flow` and a
    // branch called `blobot/checkout-flow/bob` would be two names for one team.
    expect(inspection.path).toBe(join(root, 'checkout-flow'));
  });

  it('commits even on a machine that has no git identity configured', async () => {
    const root = scratch('root');

    const inspection = await prepareWorkspace(root, 'fresh');

    // The case this is for: a machine where `git commit` would refuse for want of a
    // `user.email`, which is exactly the machine somebody reaches for "make one for me" on.
    const log = execFileSync('git', ['-C', inspection.path, 'log', '--format=%s'], {
      encoding: 'utf8',
    });
    expect(log.trim()).toBe('blobot: new workspace');
  });

  it('refuses a folder that is already there with something in it', async () => {
    const root = scratch('root');
    mkdirSync(join(root, 'taken'));
    writeFileSync(join(root, 'taken', 'notes.md'), 'work somebody cares about');

    // Refused, never adopted: the user asked for a new folder, and quietly pointing autonomous
    // processes at files they did not choose is the one outcome this must not have.
    await expect(prepareWorkspace(root, 'taken')).rejects.toBeInstanceOf(WorkspaceError);
  });

  it('uses a folder that is there and empty', async () => {
    const root = scratch('root');
    mkdirSync(join(root, 'empty'));

    const inspection = await prepareWorkspace(root, 'empty');

    expect(inspection.kind).toBe('git');
    expect(inspection.hasCommits).toBe(true);
  });
});

describe('the icon a project already has', () => {
  it('finds the one a build serves before the one a repository stores', async () => {
    const root = scratch('icons');
    mkdirSync(join(root, 'public'));
    mkdirSync(join(root, 'docs'));
    writeFileSync(join(root, 'docs', 'logo.png'), 'not really a png, but a file');
    writeFileSync(join(root, 'public', 'favicon.png'), 'not really a png, but a file');

    expect((await findWorkspaceIcon(root))?.relative).toBe('public/favicon.png');
  });

  it('prefers the name most likely to be somebody’s own over the framework default', async () => {
    const root = scratch('icons');
    mkdirSync(join(root, 'public'));
    writeFileSync(join(root, 'public', 'favicon.ico'), 'a file');
    writeFileSync(join(root, 'public', 'icon.png'), 'a file');

    expect((await findWorkspaceIcon(root))?.relative).toBe('public/icon.png');
  });

  it('does not offer an SVG, whatever it is called', async () => {
    const root = scratch('icons');
    writeFileSync(join(root, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');

    // Raster only. These are files out of a repository blobot did not write, rendered in the
    // app's own window, and no suggestion is a perfectly good answer.
    expect(await findWorkspaceIcon(root)).toBeUndefined();
  });

  it('ignores a zero-byte placeholder', async () => {
    const root = scratch('icons');
    writeFileSync(join(root, 'icon.png'), '');

    expect(await findWorkspaceIcon(root)).toBeUndefined();
  });

  it('finds the one inside a monorepo, where the top level holds no icon at all', async () => {
    const root = scratch('icons');
    mkdirSync(join(root, 'apps', 'shop', 'public'), { recursive: true });
    writeFileSync(join(root, 'apps', 'shop', 'public', 'favicon.png'), 'a file');

    // The shape most likely to be pointed at blobot, and the one the first version of this
    // search missed entirely: `apps/<app>/public/favicon.png`, three levels down, with a
    // `package.json` and not much else at the top. blobot is one of these itself.
    expect((await findWorkspaceIcon(root))?.relative).toBe('apps/shop/public/favicon.png');
  });

  it('goes as deep as the shapes people actually ship', async () => {
    const root = scratch('icons');
    mkdirSync(join(root, 'apps', 'web', 'frontend', 'public'), { recursive: true });
    writeFileSync(join(root, 'apps', 'web', 'frontend', 'public', 'favicon.png'), 'a file');

    // Four levels down. The search is a walk rather than a list of paths precisely because
    // there is no list of paths that ends: every fixed guess is one floor short of somebody.
    expect((await findWorkspaceIcon(root))?.relative).toBe('apps/web/frontend/public/favicon.png');
  });

  it('does not offer somebody else’s icon out of a dependency or a fixture', async () => {
    const root = scratch('icons');
    mkdirSync(join(root, 'node_modules', 'some-lib', 'public'), { recursive: true });
    mkdirSync(join(root, 'test', 'fixtures'), { recursive: true });
    writeFileSync(join(root, 'node_modules', 'some-lib', 'public', 'favicon.png'), 'a file');
    writeFileSync(join(root, 'test', 'fixtures', 'icon.png'), 'a file');

    // The trees that make a walk expensive are also the ones full of other people's marks, so
    // the same skip list buys both. A favicon out of a dependency is exactly the wrong answer.
    expect(await findWorkspaceIcon(root)).toBeUndefined();
  });

  it('prefers the application named after the repository', async () => {
    const root = scratch('icons');
    const named = join(root, 'apps', basename(root));
    mkdirSync(join(named, 'public'), { recursive: true });
    mkdirSync(join(root, 'apps', 'admin', 'public'), { recursive: true });
    writeFileSync(join(named, 'public', 'favicon.png'), 'a file');
    writeFileSync(join(root, 'apps', 'admin', 'public', 'favicon.png'), 'a file');

    // Two applications, one of which the repository has already named as the front of the
    // house. Alphabetically `admin` would have won, which is arbitrary in a way this is not.
    expect((await findWorkspaceIcon(root))?.relative).toBe(`apps/${basename(root)}/public/favicon.png`);
  });

  it('takes the top of the Workspace over anything nested in it', async () => {
    const root = scratch('icons');
    mkdirSync(join(root, 'public'));
    mkdirSync(join(root, 'apps', 'shop', 'public'), { recursive: true });
    writeFileSync(join(root, 'public', 'favicon.png'), 'a file');
    writeFileSync(join(root, 'apps', 'shop', 'public', 'icon.png'), 'a file');

    // Even against a better *name* below it: a project that put an icon at its own top level
    // has answered this question about itself, and one of its applications has not.
    expect((await findWorkspaceIcon(root))?.relative).toBe('public/favicon.png');
  });

  it('says nothing about a folder that has no icon in it', async () => {
    expect(await findWorkspaceIcon(scratch('bare'))).toBeUndefined();
  });
});
