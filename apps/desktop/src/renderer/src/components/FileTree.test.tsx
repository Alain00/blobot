/**
 * @vitest-environment jsdom
 *
 * The folder the agent is working in, on screen.
 *
 * `Workspaces.test.tsx` states the standard for this area and it holds here: the claims are the
 * ones a screenshot cannot make, and every one is about a distinction the panel must not
 * collapse. The governing one is that **it never draws an absence it did not verify** — a copy
 * that has no status column, a folder that is gone, and a demo team with no worktree are three
 * different true things, and the failure this exists against is all of them rendering as the
 * same blank panel.
 *
 * The drag, the animation and the measure arithmetic are not tested: jsdom has no layout, and
 * `Blob.test.ts` and `test-dom.ts` already record why a test that believed otherwise is worse
 * than no test. Those are reviewed with `--screenshot`.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiAgent, UiWorkspaceStatus, UiWorkspaceTree } from '../../../shared/api.js';
import { FileTree } from './FileTree.js';

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
  {
    id: 'bob',
    name: 'Bob',
    role: 'reviews it',
    runtimeLabel: 'codex',
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

const A_TREE: UiWorkspaceTree = {
  present: true,
  directories: [
    {
      path: '',
      tracked: true,
      entries: [
        { name: 'node_modules', kind: 'directory', ignored: true },
        { name: 'src', kind: 'directory', touched: true, changes: 2 },
        { name: 'drafts', kind: 'directory', touched: true, mark: '?' },
        { name: 'CLAUDE.md', kind: 'file', touched: true, mark: 'M' },
        { name: 'DESIGN.md', kind: 'file', touched: true },
        { name: 'README.md', kind: 'file' },
      ],
    },
  ],
};

let host: HTMLDivElement | undefined;

async function draw(
  element: React.ReactElement,
  tree: UiWorkspaceTree = A_TREE,
): Promise<{ openInWorkspace: ReturnType<typeof vi.fn> }> {
  const openInWorkspace = vi.fn(async () => undefined);
  (window as unknown as { blobot: unknown }).blobot = {
    workspaceTree: vi.fn(async () => tree),
    openInWorkspace,
  };
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  // The reading is a promise, so the render has to settle before anything is asserted about it.
  await act(async () => {
    root.render(element);
  });
  return { openInWorkspace };
}

afterEach(() => {
  host?.remove();
  host = undefined;
});

const text = (): string => host?.textContent ?? '';
const rows = (): HTMLElement[] => [...(host?.querySelectorAll('.ftrow') ?? [])] as HTMLElement[];
const rowFor = (name: string): HTMLElement | undefined =>
  rows().find((row) => row.querySelector('.nm')?.textContent === name);

describe('whose folder this is', () => {
  it('draws the face and the name in the head, and never the branch', async () => {
    await draw(
      <FileTree
        teamId="team"
        pane={{ kind: 'agent', agentId: 'alice' }}
        agents={AGENTS}
        workspaces={[GIT]}
        demoMode={false}
        revision={1}
        panel="tree"
        onPanel={() => {}}
        onSelectAgent={() => {}}
        onSelectTeam={() => {}}
      />,
    );
    expect(host?.querySelector('.fthead')?.textContent).toContain('Alice');
    // The tray forty pixels away already says it, and `DESIGN.md` has twice refused the same
    // claim twice.
    expect(text()).not.toContain('blobot/checkout/alice');
  });

  it('takes the head as the way back out, since the sidebar owns the way in', async () => {
    let back = 0;
    await draw(
      <FileTree
        teamId="team"
        pane={{ kind: 'agent', agentId: 'alice' }}
        agents={AGENTS}
        workspaces={[GIT]}
        demoMode={false}
        revision={1}
        panel="tree"
        onPanel={() => {}}
        onSelectAgent={() => {}}
        onSelectTeam={() => {
          back += 1;
        }}
      />,
    );
    // A face takes you into an agent's pane, so the name takes you back out. Without it the
    // panel is one-way and the rail is the only exit.
    act(() => (host?.querySelector('.fthead') as HTMLElement | null)?.click());
    expect(back).toBe(1);
  });

  it('offers no way back on a team of one, where the chooser would be that same face', async () => {
    let back = 0;
    await draw(
      <FileTree
        teamId="team"
        pane={{ kind: 'agent', agentId: 'alice' }}
        agents={AGENTS.slice(0, 1)}
        workspaces={[GIT]}
        demoMode={false}
        revision={1}
        panel="tree"
        onPanel={() => {}}
        onSelectAgent={() => {}}
        onSelectTeam={() => {
          back += 1;
        }}
      />,
    );
    const head = host?.querySelector('.fthead') as HTMLElement | null;
    expect(head?.textContent).toContain('Alice');
    expect(head?.tagName).not.toBe('BUTTON');
    act(() => head?.click());
    expect(back).toBe(0);
  });

  it('heads the chooser with the team, and offers hiring onto it', async () => {
    let adding = 0;
    await draw(
      <FileTree
        teamId="t1"
        pane={{ kind: 'team' }}
        agents={AGENTS}
        workspaces={[GIT]}
        demoMode={false}
        revision={0}
        panel="tree"
        teamName="Experiment"
        onAddMember={() => { adding += 1; }}
        onPanel={() => {}}
        onSelectAgent={() => {}}
        onSelectTeam={() => {}}
      />,
    );
    expect(host?.querySelector('.fthead')?.textContent).toContain('Experiment');
    act(() => (host?.querySelector('.ftadd') as HTMLElement | null)?.click());
    // The roster editor, and not a cheaper version of it: adding a member restates the whole
    // roster and restarts the team.
    expect(adding).toBe(1);
  });

  it('draws no team head where there is no roster to add to', async () => {
    // A thread and demo mode both arrive without the two props: a thread is one agent's own
    // conversation whose name is the head said twice, and demo mode's team is a source file.
    await draw(
      <FileTree
        teamId="t1"
        pane={{ kind: 'team' }}
        agents={AGENTS}
        workspaces={[GIT]}
        demoMode={false}
        revision={0}
        panel="tree"
        onPanel={() => {}}
        onSelectAgent={() => {}}
        onSelectTeam={() => {}}
      />,
    );
    expect(host?.querySelector('.fthead')).toBeNull();
    expect(host?.querySelector('.ftadd')).toBeNull();
  });

  it('draws neither a head nor the chooser for a pane it cannot name', async () => {
    // The failure this exists against: switching to a sleeping agent left the *previous* team's
    // face at the top of the panel, because a pane about one person fell through to the team
    // pane's empty state. The chooser is the team pane's and nothing else's.
    await draw(
      <FileTree
        teamId="t1"
        pane={{ kind: 'thread', profileId: 'p_mara' }}
        agents={AGENTS}
        workspaces={[GIT]}
        demoMode={false}
        revision={0}
        panel="tree"
        teamName="Experiment"
        onAddMember={() => {}}
        onPanel={() => {}}
        onSelectAgent={() => {}}
        onSelectTeam={() => {}}
      />,
    );
    expect(host?.querySelector('.ftface')).toBeNull();
    expect(host?.querySelector('.fthead')).toBeNull();
    // A thread's Agent does not exist until the first message, so there is no folder yet — and
    // that is a fact rather than a guess about a folder nobody has looked for.
    expect(text()).toContain('no folder');

    // And an agent whose team is still being swapped under this render: an Agent exists, it is
    // simply not on the roster in hand yet.
    await draw(
      <FileTree
        teamId="t1"
        pane={{ kind: 'agent', agentId: 'somebody-else' }}
        agents={AGENTS}
        workspaces={[GIT]}
        demoMode={false}
        revision={0}
        panel="tree"
        onPanel={() => {}}
        onSelectAgent={() => {}}
        onSelectTeam={() => {}}
      />,
    );
    expect(host?.querySelector('.ftface')).toBeNull();
    expect(text()).toContain('opening');
  });

  it('offers no panel switch in the chooser, where the question is whose folder', async () => {
    await draw(
      <FileTree
        teamId="t1"
        pane={{ kind: 'team' }}
        agents={AGENTS}
        workspaces={[GIT]}
        demoMode={false}
        revision={0}
        panel="tree"
        onPanel={() => {}}
        onSelectAgent={() => {}}
        onSelectTeam={() => {}}
      />,
    );
    expect(host?.querySelector('.ftfoot')).toBeNull();
  });

  it('makes the team pane the chooser rather than showing one member as if it were the team', async () => {
    const chose: string[] = [];
    await draw(
      <FileTree
        teamId="team"
        pane={{ kind: 'team' }}
        agents={AGENTS}
        workspaces={[GIT]}
        demoMode={false}
        revision={1}
        panel="tree"
        onPanel={() => {}}
        onSelectAgent={(agentId) => chose.push(agentId)}
        onSelectTeam={() => {}}
      />,
    );
    const faces = [...(host?.querySelectorAll('.ftface') ?? [])] as HTMLElement[];
    expect(faces.map((face) => face.querySelector('.nm')?.textContent)).toEqual(['Alice', 'Bob']);
    act(() => faces[1]?.click());
    // The same act as clicking that agent's row in the rail.
    expect(chose).toEqual(['bob']);
  });
});

describe('the states that are not a tree', () => {
  const states: { name: string; render: () => Promise<unknown>; says: string }[] = [
    {
      name: 'a folder that has moved or been deleted',
      says: 'folder not found',
      render: () =>
        draw(
          <FileTree
            teamId="team"
            pane={{ kind: 'agent', agentId: 'alice' }}
            agents={AGENTS}
            workspaces={[GIT]}
            demoMode={false}
            revision={1}
            panel="tree"
            onPanel={() => {}}
            onSelectAgent={() => {}}
            onSelectTeam={() => {}}
          />,
          { present: false, directories: [] },
        ),
    },
    {
      name: 'demo mode, where the mock agents have no worktree at all',
      says: 'no folder',
      render: () =>
        draw(
          <FileTree
            teamId="team"
            pane={{ kind: 'agent', agentId: 'alice' }}
            agents={AGENTS}
            workspaces={[GIT]}
            demoMode={true}
            revision={1}
            panel="tree"
            onPanel={() => {}}
            onSelectAgent={() => {}}
            onSelectTeam={() => {}}
          />,
        ),
    },
  ];

  for (const state of states) {
    it(`says the short true thing for ${state.name}`, async () => {
      await state.render();
      expect(text()).toContain(state.says);
      // A panel drawing nothing is indistinguishable from one that has not finished reading.
      expect(text().trim()).not.toBe('');
    });
  }

  it('leaves the status column out on a copy rather than drawing an empty one', async () => {
    await draw(
      <FileTree
        teamId="team"
        pane={{ kind: 'agent', agentId: 'alice' }}
        agents={AGENTS}
        workspaces={[{ agentId: 'alice', agentName: 'Alice', kind: 'plain', present: true }]}
        demoMode={false}
        revision={1}
        panel="tree"
        onPanel={() => {}}
        onSelectAgent={() => {}}
        onSelectTeam={() => {}}
      />,
      {
        present: true,
        directories: [
          { path: '', tracked: false, entries: [{ name: 'CLAUDE.md', kind: 'file' }] },
        ],
      },
    );
    // Absent, not empty. An empty column reads as *nothing changed*, which is exactly the
    // absence nobody verified — there is no git here to have verified it.
    expect(host?.querySelectorAll('.ftrow .st')).toHaveLength(0);
    // And the head says why the column is gone, in the two words the app already uses.
    expect(host?.querySelector('.fthead')?.textContent).toContain('a copy');
  });

  it('marks where git starts again in a nested workspace, and nowhere else', async () => {
    await draw(
      <FileTree
        teamId="team"
        pane={{ kind: 'agent', agentId: 'alice' }}
        agents={AGENTS}
        workspaces={[{ agentId: 'alice', agentName: 'Alice', kind: 'nested', present: true }]}
        demoMode={false}
        revision={1}
        panel="tree"
        onPanel={() => {}}
        onSelectAgent={() => {}}
        onSelectTeam={() => {}}
      />,
      {
        present: true,
        directories: [
          {
            path: '',
            tracked: false,
            entries: [
              { name: 'storefront', kind: 'directory', repoRoot: true, touched: true, changes: 3 },
              { name: 'notes.md', kind: 'file' },
            ],
          },
        ],
      },
    );
    // The loose files beside the repositories are a copy, so their silence is the truth about
    // them; the repository's count is what keeps that silence from reading as *clean*.
    expect(rowFor('storefront')?.querySelector('.st')?.textContent).toBe('3');
    expect(rowFor('notes.md')?.querySelector('.st')).toBeNull();
  });
});

describe('the row', () => {
  it('says modified from untracked, and a collapsed folder from an open one', async () => {
    await draw(
      <FileTree
        teamId="team"
        pane={{ kind: 'agent', agentId: 'alice' }}
        agents={AGENTS}
        workspaces={[GIT]}
        demoMode={false}
        revision={1}
        panel="tree"
        onPanel={() => {}}
        onSelectAgent={() => {}}
        onSelectTeam={() => {}}
      />,
    );
    // `M` and `?` are two different facts about a file and one dimness cannot carry both.
    expect(rowFor('CLAUDE.md')?.querySelector('.st')?.textContent).toBe('M');
    expect(rowFor('drafts')?.querySelector('.st')?.textContent).toBe('?');
    // A collapsed directory carries its roll-up with nothing having walked the subtree.
    expect(rowFor('src')?.querySelector('.st')?.textContent).toBe('2');
    expect(rowFor('README.md')?.querySelector('.st')).toBeNull();
  });

  it('keeps a committed file lifted with nothing in the column, which is the second fact', async () => {
    await draw(
      <FileTree
        teamId="team"
        pane={{ kind: 'agent', agentId: 'alice' }}
        agents={AGENTS}
        workspaces={[GIT]}
        demoMode={false}
        revision={1}
        panel="tree"
        onPanel={() => {}}
        onSelectAgent={() => {}}
        onSelectTeam={() => {}}
      />,
    );
    // An agent that commits its work used to empty the whole tree, which is the ordinary case
    // because blobot has a commit control in the tray. The weight says *this is part of the
    // work*; the mark says *and it is not committed yet*. Neither does the other's job.
    expect(rowFor('DESIGN.md')?.className).toContain('on');
    expect(rowFor('DESIGN.md')?.querySelector('.st')).toBeNull();
    expect(rowFor('README.md')?.className).not.toContain('on');
  });

  it('lifts a changed row and dims an ignored one, and hides neither', async () => {
    await draw(
      <FileTree
        teamId="team"
        pane={{ kind: 'agent', agentId: 'alice' }}
        agents={AGENTS}
        workspaces={[GIT]}
        demoMode={false}
        revision={1}
        panel="tree"
        onPanel={() => {}}
        onSelectAgent={() => {}}
        onSelectTeam={() => {}}
      />,
    );
    // Weight and a mono mark, never hue. And an ignored row is shown, because it is in the
    // folder the agent can see.
    expect(rowFor('CLAUDE.md')?.className).toContain('on');
    expect(rowFor('node_modules')?.className).toContain('dim');
    expect(rowFor('node_modules')?.className).not.toContain('on');
  });

  it('opens a file in the editor the user already has, by a relative path', async () => {
    const { openInWorkspace } = await draw(
      <FileTree
        teamId="team"
        pane={{ kind: 'agent', agentId: 'alice' }}
        agents={AGENTS}
        workspaces={[GIT]}
        demoMode={false}
        revision={1}
        panel="tree"
        onPanel={() => {}}
        onSelectAgent={() => {}}
        onSelectTeam={() => {}}
      />,
    );
    act(() => rowFor('CLAUDE.md')?.click());
    // Relative, always. The renderer never holds an absolute path, which is what keeps this
    // from becoming a way to read the disk around ticket 14's permission posture.
    expect(openInWorkspace).toHaveBeenCalledWith('team', 'alice', 'CLAUDE.md');
  });
});
