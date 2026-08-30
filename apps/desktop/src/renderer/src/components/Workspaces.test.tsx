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
import { describe, expect, it } from 'vitest';
import type { UiAgent, UiWorkspaceStatus } from '../../../shared/api.js';
import { WorkspaceLine, WorkspacePanel } from './Workspaces.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
        looking={false}
        onRefresh={() => undefined}
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

describe('the line under an agent’s composer', () => {
  it('draws the branch and what the worktree is holding', () => {
    const host = line({ ...ALICE, changed: 3, ahead: 2 });
    expect(host.textContent).toContain('demo/alice');
    expect(host.textContent).toContain('3 changed');
    expect(host.textContent).toContain('2 ahead');
  });

  it('says clean rather than nothing when there is nothing to say', () => {
    expect(line(ALICE).textContent).toContain('clean');
  });

  it('draws nothing at all before the read has arrived', () => {
    expect(line(undefined).textContent).toBe('');
  });

  it('does not name the agent, because the pane already is that agent', () => {
    expect(line(ALICE).textContent).not.toContain('Alice');
  });

  it('says no pr only when it looked, and never when it could not', () => {
    expect(line({ ...ALICE, ahead: 2 }).textContent).toContain('no pr');
    const blind = line({ ...ALICE, ahead: 2, unavailable: 'gh is not installed' });
    expect(blind.textContent).not.toContain('no pr');
  });

  it('offers the pull request nothing else on screen leads to', () => {
    const host = line({ ...ALICE, ahead: 2, pr: { number: 142, state: 'open', title: 't', url: 'https://x/142' } });
    expect(host.textContent).toContain('#142');
    // Open is the state that needs no word: the number and the icon are the whole of it.
    expect(host.textContent).not.toContain('open a pull request');
  });

  it('names a state that is not open', () => {
    const host = line({ ...ALICE, ahead: 2, pr: { number: 9, state: 'merged', title: 't', url: 'u' } });
    expect(host.textContent).toContain('merged');
  });

  it('offers to open one for commits that have none, and not for a clean branch', () => {
    expect(line({ ...ALICE, ahead: 2 }).textContent).toContain('open a pull request');
    expect(line(ALICE).textContent).not.toContain('open a pull request');
  });

  it('offers nothing for a branch it could not ask GitHub about', () => {
    const host = line({ ...ALICE, ahead: 2, unavailable: 'this repository has no remote' });
    expect(host.textContent).not.toContain('open a pull request');
  });

  it('says a copy has no recovery rather than calling it clean', () => {
    const copy = line({ agentId: 'alice', agentName: 'Alice', kind: 'plain', present: true });
    expect(copy.textContent).toContain('no branch, no recovery');
    expect(copy.textContent).not.toContain('clean');
  });

  it('says a workspace that is gone is gone', () => {
    expect(line({ ...ALICE, present: false }).textContent).toContain('workspace not found');
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

  it('disappears entirely rather than leaving a header over nothing', () => {
    expect(panel([]).textContent).toBe('');
  });
});
