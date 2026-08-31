/**
 * @vitest-environment jsdom
 *
 * The context gauge at the head of the activity column.
 *
 * The claims worth holding are the ones a screenshot would not catch: that both numbers are
 * drawn and not only the percent, because the two runtimes' windows differ by five times and a
 * bare `4%` next to a bare `74%` invites a comparison that is not true; that an agent which has
 * never reported is absent rather than empty; and that the block disappears entirely when
 * nobody has reported, rather than leaving a header over nothing.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { UiAgent, UiInjection } from '../../../shared/api.js';
import { Feed } from './Feed.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AGENTS: readonly UiAgent[] = [
  { id: 'alice', name: 'Alice', role: 'builds the UI', runtimeLabel: 'claude code', workspacePath: '/w', accepts: { images: true, textFiles: true } },
  { id: 'bob', name: 'Bob', role: 'reviews it', runtimeLabel: 'opencode', workspacePath: '/w', accepts: { images: true, textFiles: true } },
];

function render(
  usage: Record<string, { used: number; size: number }>,
  injection: Record<string, UiInjection> = {},
  agents: readonly UiAgent[] = AGENTS,
): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => {
    createRoot(host).render(
      <Feed
        entries={[]}
        agents={agents}
        usage={usage}
        injection={injection}
        pane={{ kind: 'team' }}
        workspaces={[]}
        looking={false}
        onRefreshWorkspaces={() => undefined}
        onPublish={async () => ({ ok: false, step: 'create', error: 'not in this test' })}
        onPlan={async () => []}
      />,
    );
  });
  return host;
}

function click(host: HTMLElement, index: number): void {
  const row = host.querySelectorAll('.ctxrow')[index] as HTMLButtonElement;
  act(() => row.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

const rows = (host: HTMLElement): string[] =>
  [...host.querySelectorAll('.ctxrow')].map((row) => row.textContent ?? '');

describe('the context gauge', () => {
  it('draws both numbers, and the percent against what is usable rather than what is advertised', () => {
    const host = render({
      alice: { used: 37_000, size: 1_000_000 },
      bob: { used: 148_000, size: 200_000 },
    });
    // Neither model is measured, so both take the conservative fallback and the row names it.
    // Alice read `3%` before ticket 09 — 37k of an advertised million — which is the number the
    // ticket was written about: it says barely started about an agent well into its usable
    // window. Bob is past his fallback ceiling entirely, and says so in words.
    expect(rows(host)).toEqual(['Alice37k/1m18%of 200k', 'Bob148k/200kpast 120k']);
  });

  it('uses a measured ceiling where somebody established one, clamped to the window', () => {
    const measured: readonly UiAgent[] = [
      { ...(AGENTS[0] as UiAgent), contextCeiling: 300_000 },
      // A ceiling larger than the window this agent is actually running: the clamp is what stops
      // the row promising room past the end of its own gauge.
      { ...(AGENTS[1] as UiAgent), contextCeiling: 300_000 },
    ];
    const host = render(
      { alice: { used: 37_000, size: 1_000_000 }, bob: { used: 100_000, size: 200_000 } },
      {},
      measured,
    );
    expect(rows(host)).toEqual(['Alice37k/1m12%of 300k', 'Bob100k/200k50%of 200k']);
  });

  it('leaves out an agent that has never reported', () => {
    expect(rows(render({ bob: { used: 148_000, size: 200_000 } }))).toEqual([
      'Bob148k/200kpast 120k',
    ]);
  });

  it('says nothing at all when nobody has reported', () => {
    const host = render({});
    expect(host.querySelector('.ctx')).toBeNull();
    expect(host.querySelector('.feed')).not.toBeNull();
  });
});

describe('what blobot sent', () => {
  const SENT: UiInjection = {
    personaChars: 1_840,
    instructionsChars: 420,
    lastWakeChars: 960,
    lastWakeMessages: 3,
    queued: 0,
    attachmentCount: 0,
    attachmentBytes: 0,
    ownToolChars: 1_040,
  };

  it('opens under the row that was clicked, and closes again', () => {
    const host = render({ alice: { used: 37_000, size: 1_000_000 } }, { alice: SENT });
    expect(host.querySelector('.sent')).toBeNull();
    click(host, 0);
    expect(host.querySelector('.sent')).not.toBeNull();
    click(host, 0);
    expect(host.querySelector('.sent')).toBeNull();
  });

  it('estimates, and says that it is estimating', () => {
    const host = render({ alice: { used: 37_000, size: 1_000_000 } }, { alice: SENT });
    click(host, 0);
    const lines = [...(host.querySelectorAll('.sentrow') ?? [])].map((row) => row.textContent);
    // Four characters to a token, with the tilde saying so. The gauge above is the runtime's
    // own count and these are never added to it.
    expect(lines).toEqual([
      'persona~460',
      'your standing instructions~105',
      'last wake prompt~240',
      '3 messages',
      'queued0',
      // The only tool blobot adds, measured from the definition on the wire. What an agent's
      // other tools cost is not knowable here, and the note says the gauge includes them.
      "blobot's own tool~260",
    ]);
    expect(host.querySelector('.sentnote')?.textContent).toContain('estimated');
  });

  it('reports attachments in bytes, and says they are still there', () => {
    const host = render(
      { alice: { used: 37_000, size: 1_000_000 } },
      { alice: { ...SENT, attachmentCount: 2, attachmentBytes: 480_000 } },
    );
    click(host, 0);
    const lines = [...(host.querySelectorAll('.sentrow') ?? [])].map((row) => row.textContent);
    // Bytes and a count, never tokens: an image's cost is a function of its pixels and that
    // function is the provider's. And *sent this session*, because unlike every other figure
    // here it is not per-turn — an embedded attachment stays in the session's history.
    expect(lines).toContain('attachments2 · 480 KB');
    expect(lines).toContain('sent this session, and still there');
  });

  it('says nothing about attachments when none were sent', () => {
    const host = render({ alice: { used: 37_000, size: 1_000_000 } }, { alice: SENT });
    click(host, 0);
    const lines = [...(host.querySelectorAll('.sentrow') ?? [])].map((row) => row.textContent);
    expect(lines.some((line) => line?.startsWith('attachments'))).toBe(false);
  });

  it('says nothing was sent rather than drawing zeros, for an agent never woken', () => {
    const host = render({ alice: { used: 4_000, size: 200_000 } }, {});
    click(host, 0);
    expect(host.querySelector('.sentnote')?.textContent).toContain('not been woken');
  });
});

/**
 * The head is pinned, and jsdom performs no layout, so `position:sticky` itself is not
 * testable here. What is testable is the thing the stylesheet depends on and a screenshot
 * would not catch: that CONTEXT and WORKSPACE are inside one wrapper, and that the log is
 * outside it. Put a log line into `.feedtop` by accident and it pins to the top of the column
 * forever; take the gauge out of it and it scrolls away again, which is the bug this fixed.
 */
describe('the head of the column', () => {
  const workspaces = [
    { agentId: 'alice', agentName: 'Alice', kind: 'git' as const, branch: 'blobot/t/alice', present: true },
  ];
  const entries = [
    { id: 'e1', at: 1, agentId: 'alice', text: 'read src/index.ts' },
    { id: 'e2', at: 2, agentId: 'bob', text: 'ran the tests' },
  ];

  function renderFull(): HTMLElement {
    const host = document.createElement('div');
    document.body.append(host);
    act(() => {
      createRoot(host).render(
        <Feed
          entries={entries}
          agents={AGENTS}
          usage={{ alice: { used: 1000, size: 200_000 } }}
          injection={{}}
          pane={{ kind: 'team' }}
          workspaces={workspaces}
          looking={false}
          onRefreshWorkspaces={() => undefined}
          onPublish={async () => ({ ok: false, step: 'create', error: 'not in this test' })}
          onPlan={async () => []}
        />,
      );
    });
    return host;
  }

  it('holds both blocks that are one row per agent, and nothing else', () => {
    const top = renderFull().querySelector('.feedtop') as HTMLElement;
    expect(top.querySelector('.ctx')).not.toBeNull();
    expect(top.querySelector('.ws')).not.toBeNull();
    expect(top.querySelectorAll('.fev')).toHaveLength(0);
  });

  it('leaves the log outside it, after it', () => {
    const feed = renderFull().querySelector('.feed') as HTMLElement;
    const children = [...feed.children];
    expect(children[0]?.className).toBe('feedtop');
    expect(feed.querySelectorAll('.fev')).toHaveLength(2);
    for (const line of feed.querySelectorAll('.fev')) {
      expect(line.closest('.feedtop')).toBeNull();
    }
  });
});
