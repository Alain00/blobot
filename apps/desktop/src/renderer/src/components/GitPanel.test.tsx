/**
 * @vitest-environment jsdom
 *
 * What has changed, and committing the part of it you mean.
 *
 * `FileTree.test.tsx`'s standard, which is `Workspaces.test.tsx`'s: the claims are the ones a
 * screenshot cannot make. Here they are all about **what a commit would actually take** — the
 * ticks are blobot's own selection, so the arithmetic between what is on screen and what reaches
 * `git` is the whole risk of this panel, and a wrong answer is a commit the user did not mean.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiAgent, UiWorkspaceChanges, UiWorkspaceStatus } from '../../../shared/api.js';
import { GitPanel } from './GitPanel.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AGENTS: readonly UiAgent[] = [
  {
    id: 'alice',
    name: 'Alice',
    role: 'builds it',
    runtimeLabel: 'claude code',
    workspacePath: '/w',
    accepts: { images: true, textFiles: true },
  },
];

const GIT: UiWorkspaceStatus = {
  agentId: 'alice',
  agentName: 'Alice',
  kind: 'git',
  branch: 'blobot/checkout/alice',
  present: true,
};

const CHANGES: UiWorkspaceChanges = {
  present: true,
  kind: 'git',
  repo: '',
  added: 53,
  removed: 3,
  rows: [
    { path: 'src/a.ts', added: 12, removed: 3 },
    { path: 'src/new.ts', added: 40, removed: 0, untracked: true },
    { path: 'README.md', added: 1, removed: 0 },
  ],
};

let host: HTMLDivElement | undefined;

async function draw(
  changes: UiWorkspaceChanges = CHANGES,
  busy = false,
): Promise<{ commitWork: ReturnType<typeof vi.fn>; openInWorkspace: ReturnType<typeof vi.fn> }> {
  const commitWork = vi.fn(async () => ({ ok: true as const, sha: 'ab12cd3' }));
  const openInWorkspace = vi.fn(async () => undefined);
  (window as unknown as { blobot: unknown }).blobot = {
    workspaceChanges: vi.fn(async () => changes),
    // The commands are built in main, because argv is never the renderer's.
    commitPlan: vi.fn(async () => ['git commit -m "one"']),
    commitWork,
    openInWorkspace,
  };
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <GitPanel
        teamId="t1"
        pane={{ kind: 'agent', agentId: 'alice' }}
        agents={AGENTS}
        workspaces={[GIT]}
        demoMode={false}
        revision={0}
        busy={busy}
        panel="git"
        onPanel={() => {}}
        onSelectAgent={() => {}}
        onSelectTeam={() => {}}
        onCommitted={() => {}}
      />,
    );
  });
  return { commitWork, openInWorkspace };
}

afterEach(() => {
  host?.remove();
  host = undefined;
});

const text = (): string => host?.textContent ?? '';
const rows = (): HTMLElement[] => [...(host?.querySelectorAll('.gitrow') ?? [])] as HTMLElement[];
const rowFor = (name: string): HTMLElement | undefined =>
  rows().find((row) => row.querySelector('.nm')?.textContent === name);
const press = async (element: Element | null | undefined): Promise<void> => {
  await act(async () => {
    (element as HTMLElement | null)?.click();
  });
};
const type = async (what: string): Promise<void> => {
  const field = host?.querySelector('.gitmsg') as HTMLTextAreaElement | null;
  await act(async () => {
    if (field === null) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(field, what);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('what the panel says', () => {
  it('splits tracked from untracked, because one of them you commit blind', async () => {
    await draw();
    expect(text()).toContain('tracked');
    expect(text()).toContain('untracked');
    // The untracked file is under its own heading, not sorted in among files git knows.
    const labels = [...(host?.querySelectorAll('.gitlabel') ?? [])].map((one) => one.textContent);
    expect(labels).toEqual(['tracked', 'untracked']);
  });

  it('draws the total and every row in the tray’s own figures', async () => {
    await draw();
    expect(text()).toContain('+53');
    expect(text()).toContain('−3');
    expect(rowFor('a.ts')?.textContent).toContain('+12');
  });
});

describe('what a commit takes', () => {
  it('sends no pathspec at all when everything is ticked', async () => {
    // Everything ticked is *all of it*, which is not the same act as naming every path: a file
    // that appears between the read and the click belongs in a commit the user meant that way.
    const { commitWork } = await draw();
    await type('one');
    await press(host?.querySelector('.gitcommit'));
    expect(commitWork).toHaveBeenCalledWith('t1', 'alice', 'one', {});
  });

  it('names the paths, and the new files among them, when one is unticked', async () => {
    const { commitWork } = await draw();
    await press(rowFor('a.ts')?.querySelector('.gittick'));
    await type('one');
    await press(host?.querySelector('.gitcommit'));
    expect(commitWork).toHaveBeenCalledWith('t1', 'alice', 'one', {
      paths: ['src/new.ts', 'README.md'],
      // A pathspec cannot name a file git has never seen, so these are the ones that need an
      // `add` first. Getting this list wrong is a commit that silently drops a new file.
      untracked: ['src/new.ts'],
    });
  });

  it('takes both of a rename’s paths, or the deletion stays behind', async () => {
    const { commitWork } = await draw({
      ...CHANGES,
      rows: [
        { path: 'src/new.ts', added: 1, removed: 0, from: 'src/old.ts' },
        { path: 'README.md', added: 1, removed: 0 },
      ],
    });
    await press(rowFor('README.md')?.querySelector('.gittick'));
    await type('one');
    await press(host?.querySelector('.gitcommit'));
    expect(commitWork).toHaveBeenCalledWith('t1', 'alice', 'one', {
      paths: ['src/new.ts', 'src/old.ts'],
    });
  });

  it('will not commit with nothing ticked, or with no message', async () => {
    await draw();
    const button = (): HTMLButtonElement | null =>
      host?.querySelector('.gitcommit') as HTMLButtonElement | null;
    expect(button()?.disabled).toBe(true);
    await type('one');
    expect(button()?.disabled).toBe(false);
    await press(host?.querySelector('.gitall'));
    expect(button()?.disabled).toBe(true);
  });


  it('does not print the commands, unlike the acts that leave the machine', async () => {
    // `claude auth login` and `gh pr create` are shown in full before they run. Withdrawn here
    // by the author: those reach the network or the user's account with arguments they cannot
    // see, and this is a local commit whose two variables, the message and the ticks, are the
    // panel itself.
    await draw();
    await type('one');
    expect(text()).not.toContain('git commit');
  });

  it('refuses while the agent is working, and says so rather than vanishing', async () => {
    await draw(CHANGES, true);
    await type('one');
    const button = host?.querySelector('.gitcommit') as HTMLButtonElement | null;
    // A commit taken mid-turn captures a file the agent is halfway through writing, and the
    // result is not a state anything was ever in.
    expect(button?.disabled).toBe(true);
    // Said over the field rather than in the button, which is inside the field's border and has
    // room for one word. Said rather than hidden: a control that vanishes while an agent happens
    // to be thinking reads as a bug.
    expect(text()).toContain('this agent is working');
  });

  it('says what git said, in place', async () => {
    await draw();
    await type('one');
    await press(host?.querySelector('.gitcommit'));
    expect(text()).toContain('committed ab12cd3');
  });
});

describe('the states that are not a list', () => {
  it('offers nothing on a copy, because there is no git in it', async () => {
    await draw({ present: true, kind: 'plain', rows: [], added: 0, removed: 0 });
    expect(text()).toContain('a copy');
    expect(host?.querySelector('.gitcommit')).toBeNull();
  });

  it('asks which repository in a nested workspace rather than picking one', async () => {
    // Several HEADs, so there is no single commit to make. The branch menu already refuses the
    // same thing for the same reason.
    await draw({
      present: true,
      kind: 'nested',
      repos: ['api', 'web'],
      rows: [],
      added: 0,
      removed: 0,
    });
    expect(text()).toContain('api');
    expect(text()).toContain('web');
    expect(host?.querySelector('.gitcommit')).toBeNull();
  });

  it('never draws a blank panel', async () => {
    await draw({ present: false, kind: 'git', rows: [], added: 0, removed: 0 });
    expect(text()).toContain('folder not found');
  });

  it('says nothing to commit rather than drawing an empty list', async () => {
    await draw({ present: true, kind: 'git', repo: '', rows: [], added: 0, removed: 0 });
    expect(text()).toContain('nothing to commit');
  });
});
