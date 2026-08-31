/**
 * @vitest-environment jsdom
 *
 * Where an agent's work is, on screen.
 *
 * The claims here are the ones a screenshot cannot make, and every one of them is about a
 * distinction the line must not collapse: *no pull request* against *we could not look*, a copy
 * against a branch that is simply clean, and a branch with commits nobody has pushed against
 * one that already has a pull request open. Getting any of those wrong tells the user something
 * false about work they cannot see from here.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  UiAgent,
  UiBranches,
  UiCommitResult,
  UiSwitchResult,
  UiWorkspaceStatus,
} from '../../../shared/api.js';
import { narrowBranches, WorkspaceLine, WorkspacePanel } from './Workspaces.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The branch list is cmdk's inside a Radix popover, and both measure. jsdom has neither a
// ResizeObserver nor a scroll, which is the same pair the runtime options menu stubs.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView(): void {};

const AGENTS: readonly UiAgent[] = [
  { id: 'alice', name: 'Alice', role: 'builds it', runtimeLabel: 'claude code', workspacePath: '/w', accepts: { images: true, textFiles: true } },
];

const ALICE: UiWorkspaceStatus = {
  agentId: 'alice',
  agentName: 'Alice',
  kind: 'git',
  branch: 'blobot/demo/alice',
  present: true,
  changed: 0,
  ahead: 0,
  pushed: false,
};

function line(status: UiWorkspaceStatus | undefined): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => {
    createRoot(host).render(
      <WorkspaceLine
        status={status}
        teamId="t1"
        busy={false}
        onSwitched={() => undefined}
        onCommitted={() => undefined}
        onPublish={async () => ({ ok: false, step: 'create', error: 'not in this test' })}
        onPlan={async () => []}
      />,
    );
  });
  return host;
}

function panel(statuses: readonly UiWorkspaceStatus[]): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => {
    createRoot(host).render(
      <WorkspacePanel
        statuses={statuses}
        agents={AGENTS}
        looking={false}
        onRefresh={() => undefined}
        onPublish={async () => ({ ok: false, step: 'create', error: 'not in this test' })}
        onPlan={async () => []}
      />,
    );
  });
  return host;
}

/**
 * The tray, and the one control on it.
 *
 * A branch menu can lie in two directions and both are worth a test: it can hide a branch git
 * would have refused, which sends the user looking for something they can see in their own
 * terminal, and it can offer one git will refuse without saying who is standing on it.
 */
const BRANCHES: UiBranches = {
  current: 'blobot/demo/alice',
  branches: [
    { name: 'main', current: false, heldBy: { path: '/repo', isWorkspace: true } },
    { name: 'blobot/demo/alice', current: true },
    { name: 'blobot/demo/bob', current: false, heldBy: { path: '/w/bob', agentName: 'Bob' } },
    { name: 'spike', current: false },
  ],
};

const drawn: { unmount: () => void; host: HTMLElement }[] = [];
afterEach(() => {
  act(() => {
    for (const entry of drawn.splice(0)) {
      entry.unmount();
      entry.host.remove();
    }
  });
});

/** The tray with a stubbed main process behind it, opened on the branch menu. */
async function picker(
  answer: UiBranches = BRANCHES,
  switched: UiSwitchResult = { ok: true, branch: 'spike' },
): Promise<{ host: HTMLElement; calls: unknown[][]; refreshed: number }> {
  const calls: unknown[][] = [];
  const state = { refreshed: 0 };
  (globalThis as unknown as { window: { blobot: unknown } }).window.blobot = {
    listBranches: vi.fn(async () => answer),
    switchBranch: vi.fn(async (...args: unknown[]) => {
      calls.push(args);
      return switched;
    }),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  drawn.push({ unmount: () => root.unmount(), host });
  await act(async () => {
    root.render(
      <WorkspaceLine
        status={{ ...ALICE, ahead: 2 }}
        teamId="t1"
        busy={false}
        onSwitched={() => {
          state.refreshed += 1;
        }}
        onCommitted={() => undefined}
        onPublish={async () => ({ ok: false, step: 'create', error: 'not in this test' })}
        onPlan={async () => []}
      />,
    );
  });
  await act(async () => {
    (host.querySelector('.wsbranchpick') as HTMLButtonElement).click();
  });
  return {
    host,
    calls,
    get refreshed() {
      return state.refreshed;
    },
  } as { host: HTMLElement; calls: unknown[][]; refreshed: number };
}

/** A controlled input takes a value set on the node only if React is told about it. */
function typeInto(selector: string, text: string): void {
  const field = document.querySelector(selector) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(field, text);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

/** cmdk's input is controlled, so a value set on the node has to be announced to React. */
function type(host: HTMLElement, text: string): void {
  const field = document.querySelector('[cmdk-input]') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(field, text);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function row(name: string): HTMLElement | undefined {
  return [...document.querySelectorAll('.branchitem')].find(
    (item) => item.querySelector('.branchname')?.textContent === name,
  ) as HTMLElement | undefined;
}

describe('the tray under an agent’s composer', () => {
  it('draws the branch and where the work goes, and no description of the folder', () => {
    const host = line({ ...ALICE, changed: 3, ahead: 2, pr: { number: 8, state: 'open', title: 't', url: 'u' } });
    expect(host.textContent).toContain('demo/alice');
    expect(host.textContent).toContain('#8');
    // Everything on this row is a live number or a door. `checkout` was a constant under an
    // agent's own composer, and a count of touched files says nothing about what is in them.
    expect(host.textContent).not.toContain('3 changed');
    expect(host.textContent).not.toContain('checkout');
  });

  it('draws what is uncommitted in lines, with the signs carrying the direction', () => {
    const host = line({ ...ALICE, churn: { added: 412, removed: 7, files: 9 } });
    expect(host.textContent).toContain('+412');
    expect(host.textContent).toContain('−7');
  });

  it('says clean rather than +0 −0, and offers no commit for it', () => {
    const quiet = line({ ...ALICE, churn: { added: 0, removed: 0, files: 0 } });
    expect(quiet.querySelector('.wschurn')).toBeNull();
    // An empty slot reads as a count that failed. `clean` is the zero of a live number.
    expect(quiet.textContent).toContain('clean');
    // No commit control, though: a button that can never do anything is noise.
    expect(quiet.textContent).not.toContain('commit');
  });

  it('says nothing at all where it could not look, which is not the same as clean', () => {
    const blind = line(ALICE);
    expect(blind.textContent).not.toContain('clean');
  });

  it('offers the commit only where there is something to commit', () => {
    const host = line({ ...ALICE, churn: { added: 4, removed: 3, files: 2 } });
    expect(host.textContent).toContain('commit');
  });

  it('draws nothing at all before the read has arrived', () => {
    expect(line(undefined).textContent).toBe('');
  });

  it('draws nothing for a workspace with no branch, rather than an empty control', () => {
    // A copy is the work and has no branch. A picker over it would be offering a switch that
    // cannot happen, which is worse than the tray not being there.
    const copy = line({ agentId: 'alice', agentName: 'Alice', kind: 'plain', present: true });
    expect(copy.textContent).toBe('');
  });

  it('does not name the agent, because the pane already is that agent', () => {
    expect(line(ALICE).textContent).not.toContain('Alice');
  });

  it('refuses to commit while the agent is working, and says so rather than vanishing', () => {
    const host = document.createElement('div');
    document.body.append(host);
    act(() => {
      createRoot(host).render(
        <WorkspaceLine
          status={{ ...ALICE, churn: { added: 4, removed: 3, files: 2 } }}
          teamId="t1"
          busy
          onSwitched={() => undefined}
          onCommitted={() => undefined}
          onPublish={async () => ({ ok: false, step: 'create', error: 'not in this test' })}
          onPlan={async () => []}
        />,
      );
    });
    // A commit taken mid-turn captures a file the agent is halfway through writing, which is a
    // state nothing was ever in. Disabled rather than absent: a control that disappears while an
    // agent happens to be thinking reads as a bug.
    const commit = [...host.querySelectorAll('.wsflat')].find((button) =>
      button.textContent?.includes('commit'),
    ) as HTMLButtonElement | undefined;
    expect(commit?.disabled).toBe(true);
  });
});

describe('the commit', () => {
  /** The tray with a stubbed main process, opened on the commit popover. */
  async function commitTray(
    result: UiCommitResult = { ok: true, sha: 'ab12cd3' },
  ): Promise<{ host: HTMLElement; sent: unknown[][]; committed: () => number }> {
    const sent: unknown[][] = [];
    const state = { committed: 0 };
    (globalThis as unknown as { window: { blobot: unknown } }).window.blobot = {
      commitPlan: vi.fn(async () => ['git add -A', 'git commit -m "one"']),
      commitWork: vi.fn(async (...args: unknown[]) => {
        sent.push(args);
        return result;
      }),
    };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    drawn.push({ unmount: () => root.unmount(), host });
    await act(async () => {
      root.render(
        <WorkspaceLine
          status={{ ...ALICE, churn: { added: 4, removed: 3, files: 2 } }}
          teamId="t1"
          busy={false}
          onSwitched={() => undefined}
          onCommitted={() => {
            state.committed += 1;
          }}
          onPublish={async () => ({ ok: false, step: 'create', error: 'not in this test' })}
          onPlan={async () => []}
        />,
      );
    });
    await act(async () => {
      ([...host.querySelectorAll('.wsflat')].find((button) =>
        button.textContent?.includes('commit'),
      ) as HTMLButtonElement).click();
    });
    return { host, sent, committed: () => state.committed };
  }

  function armed(): HTMLButtonElement | undefined {
    return [...document.querySelectorAll('.wsactions .btn.primary')].at(0) as
      | HTMLButtonElement
      | undefined;
  }

  it('shows the two commands it is about to run', async () => {
    await commitTray();
    expect(document.querySelector('.wsplan')?.textContent).toContain('git add -A');
  });

  it('is not armed until there is a message, because nothing writes one for the user', async () => {
    await commitTray();
    expect(armed()?.disabled).toBe(true);
  });

  it('commits the typed message and tells the caller the folder changed', async () => {
    const tray = await commitTray();
    await act(async () => {
      typeInto('.wstitle', 'fix the retry loop');
    });
    await act(async () => {
      armed()?.click();
    });
    expect(tray.sent[0]).toEqual(['t1', 'alice', 'fix the retry loop']);
    expect(tray.committed()).toBe(1);
  });

  it('says git’s own refusal and stays open', async () => {
    const tray = await commitTray({ ok: false, error: 'unable to auto-detect email address' });
    await act(async () => {
      typeInto('.wstitle', 'one');
    });
    await act(async () => {
      armed()?.click();
    });
    expect(document.querySelector('.wsfailed')?.textContent).toContain('auto-detect email');
    expect(tray.committed()).toBe(0);
  });
});

describe('the branch menu', () => {
  it('lists the branches and ticks the one the worktree is on', async () => {
    await picker();
    expect(row('spike')).toBeDefined();
    expect(row('blobot/demo/alice')?.querySelector('.selecttick')).not.toBeNull();
  });

  it('draws a branch another worktree holds, and draws whose face it is', async () => {
    await picker();
    // Hiding it would send the user hunting for a branch they can see in their own terminal.
    const bob = row('blobot/demo/bob');
    // The face, not the sentence: this is a list of names and the reader is looking for a person.
    expect(bob?.querySelector('.branchheld .blob')).not.toBeNull();
    expect(bob?.textContent).not.toContain('has it');
    // The sentence survives for the pointer and the screen reader.
    expect(bob?.getAttribute('title')).toContain('Bob has this branch checked out');
  });

  it('marks a holder that is not an agent as itself, and never as a face', async () => {
    await picker();
    // The folder the user opened is not an agent and must not be drawn as one. A worktree
    // nobody here made keeps its path, which is the only thing blobot knows about it.
    expect(row('main')?.getAttribute('title')).toContain('the project folder');
    const stranger = await picker({
      branches: [{ name: 'wip', current: false, heldBy: { path: '/somewhere/else' } }],
    });
    expect(stranger.host.ownerDocument.querySelector('.branchheld')?.textContent).toContain('else');
  });

  it('refuses to switch onto a branch somebody is standing on', async () => {
    await picker();
    const held = row('blobot/demo/bob');
    expect(held?.getAttribute('aria-disabled') ?? held?.getAttribute('data-disabled')).toBeTruthy();
  });

  it('switches on a free branch, and tells the caller the folder changed', async () => {
    const picked = await picker();
    await act(async () => {
      row('spike')?.click();
    });
    expect(picked.calls[0]).toEqual(['t1', 'alice', 'spike', { create: false }]);
    expect(picked.refreshed).toBe(1);
  });

  it('offers to cut a new branch under the name that is typed', async () => {
    const picked = await picker();
    await act(async () => {
      type(picked.host, 'try-it');
    });
    const created = [...document.querySelectorAll('.branchitem')].find((item) =>
      item.textContent?.startsWith('new branch'),
    ) as HTMLElement | undefined;
    expect(created?.textContent).toContain('try-it');
    await act(async () => {
      created?.click();
    });
    expect(picked.calls[0]).toEqual(['t1', 'alice', 'try-it', { create: true }]);
  });

  it('does not offer to create a branch that already exists', async () => {
    const picked = await picker();
    await act(async () => {
      type(picked.host, 'spike');
    });
    expect(document.body.textContent).not.toContain('new branch');
  });

  it('says git’s own refusal, and stays open on the row that raised it', async () => {
    const picked = await picker(BRANCHES, { ok: false, error: "'spike' is already used by worktree" });
    await act(async () => {
      row('spike')?.click();
    });
    expect(document.querySelector('.branchfailed')?.textContent).toContain('already used by worktree');
    expect(row('spike')).toBeDefined();
    expect(picked.refreshed).toBe(0);
  });

  it('says why there is nothing to choose rather than drawing an empty menu', async () => {
    await picker({ branches: [], unavailable: 'this workspace is not a single git repository' });
    expect(document.querySelector('.branchnote')?.textContent).toContain('not a single git repository');
  });
});

describe('narrowBranches', () => {
  it('needs every token, so two words narrow rather than widen', () => {
    const names = narrowBranches(BRANCHES.branches, 'blobot bob').map((branch) => branch.name);
    expect(names).toEqual(['blobot/demo/bob']);
  });

  it('holds nothing back on an empty query', () => {
    expect(narrowBranches(BRANCHES.branches, '  ')).toHaveLength(4);
  });
});

describe('the panel in the activity column', () => {
  it('names whose each row is, because it is a list', () => {
    expect(panel([ALICE]).textContent).toContain('Alice');
  });

  it('names the agent even when nobody chose it a hue', () => {
    // The name was gated on the hue once, and a roster of default agents came out anonymous.
    const nameless = panel([{ ...ALICE, agentId: 'nobody' }]);
    expect(nameless.textContent).toContain('Alice');
  });

  it('says clean rather than nothing when there is nothing to say', () => {
    expect(panel([ALICE]).textContent).toContain('clean');
  });

  it('says no pr only when it looked, and never when it could not', () => {
    expect(panel([{ ...ALICE, ahead: 2 }]).textContent).toContain('no pr');
    const blind = panel([{ ...ALICE, ahead: 2, unavailable: 'gh is not installed' }]);
    expect(blind.textContent).not.toContain('no pr');
  });

  it('says a copy has no recovery rather than calling it clean', () => {
    const copy = panel([{ agentId: 'alice', agentName: 'Alice', kind: 'plain', present: true }]);
    expect(copy.textContent).toContain('no branch, no recovery');
    expect(copy.textContent).not.toContain('clean');
  });

  it('says a workspace that is gone is gone', () => {
    expect(panel([{ ...ALICE, present: false }]).textContent).toContain('workspace not found');
  });

  it('disappears entirely rather than leaving a header over nothing', () => {
    expect(panel([]).textContent).toBe('');
  });
});
