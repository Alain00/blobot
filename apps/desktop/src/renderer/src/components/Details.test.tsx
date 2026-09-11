/**
 * @vitest-environment jsdom
 *
 * The context gauge in the details panel, behind the chrome's gauge glyph.
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
import { afterEach, describe, expect, it } from 'vitest';
import type {
  UiAgent,
  UiHandbookEntry,
  UiInjection,
  UiPlanLimits,
  UiWorkspaceStatus,
} from '../../../shared/api.js';
import { Details } from './Details.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The panel is a Radix popover, and Radix measures. jsdom has no ResizeObserver, which is the
// same stub the workspace tests take for the same reason.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

/** Every root drawn by a test, torn down after it: the panel portals into `document.body`. */
const drawn: { unmount: () => void; host: HTMLElement }[] = [];
afterEach(() => {
  for (const one of drawn.splice(0)) {
    act(() => one.unmount());
    one.host.remove();
  }
});

const AGENTS: readonly UiAgent[] = [
  { id: 'alice', name: 'Alice', role: 'builds the UI', runtimeLabel: 'claude code', workspacePath: '/w', accepts: { images: true, textFiles: true } },
  { id: 'bob', name: 'Bob', role: 'reviews it', runtimeLabel: 'opencode', workspacePath: '/w', accepts: { images: true, textFiles: true } },
];

/**
 * The panel, open.
 *
 * Opened by pressing the trigger rather than by a prop, because that press is the whole of how
 * a person reaches these two blocks now — a test that rendered the content directly would pass
 * with the door bricked up. What comes back is `document`, since Radix portals the content out
 * of the host and into the body.
 */
function render(
  usage: Record<string, { used: number; size: number }>,
  injection: Record<string, UiInjection> = {},
  agents: readonly UiAgent[] = AGENTS,
  handbooks: Record<string, readonly UiHandbookEntry[]> = {},
  workspaces: readonly UiWorkspaceStatus[] = [],
  planLimits: UiPlanLimits = {},
  now?: number,
): Document {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  drawn.push({ unmount: () => root.unmount(), host });
  act(() => {
    root.render(
      <Details
        agents={agents}
        usage={usage}
        injection={injection}
        handbooks={handbooks}
        workspaces={workspaces}
        planLimits={planLimits}
        {...(now === undefined ? {} : { now })}
        looking={false}
        onRefreshWorkspaces={() => undefined}
        onPublish={async () => ({ ok: false, step: 'create', error: 'not in this test' })}
        onPlan={async () => []}
      />,
    );
  });
  act(() => {
    (host.querySelector('.paneltoggle') as HTMLButtonElement).click();
  });
  return document;
}

function click(host: Document, index: number): void {
  const row = host.querySelectorAll('.ctxrow')[index] as HTMLButtonElement;
  act(() => row.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

const rows = (host: Document): string[] =>
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

  it('says nothing at all when nobody has reported, and the panel says what will be here', () => {
    const host = render({});
    expect(host.querySelector('.ctx')).toBeNull();
    // Both blocks withhold themselves rather than drawing a header over nothing, so without
    // this line the panel would open onto an empty box.
    expect(host.querySelector('.detailsempty')).not.toBeNull();
  });
});

describe('plan limits', () => {
  const NOW = new Date(2026, 8, 11, 10, 0).getTime(); // a Friday
  const at = (day: number, hours: number, minutes = 0): number =>
    new Date(2026, 8, day, hours, minutes).getTime();
  const CLAUDES: readonly UiAgent[] = [
    AGENTS[0] as UiAgent,
    { ...(AGENTS[1] as UiAgent), runtimeLabel: 'claude code' },
  ];
  const texts = (host: Document, selector: string): string[] =>
    [...host.querySelectorAll(selector)].map((node) => node.textContent ?? '');

  it('draws a login on this computer once, named by its runtime, with a fixed reset time', () => {
    const host = render({}, {}, CLAUDES, {}, [], {
      'local:claude code': [
        { durationMinutes: 300, utilization: 0.419, resetsAt: at(11, 14) },
        { durationMinutes: 10_080, utilization: 0.14, resetsAt: at(14, 9) },
      ],
    }, NOW);
    expect(texts(host, '.limitshead')).toEqual(['claude code']);
    expect(texts(host, '.limitrow')).toEqual(['5h41%resets 14:00', 'week14%resets Mon 09:00']);
    // Nobody owns a shared login, so it wears nobody's face.
    expect(host.querySelector('.limitshead')?.children).toHaveLength(1);
  });

  it('draws no percent for a window whose reset is already behind the clock', () => {
    const host = render({}, {}, AGENTS, {}, [], {
      'local:claude code': [{ durationMinutes: 300, utilization: 0.97, resetsAt: at(11, 9, 20) }],
    }, NOW);
    expect(texts(host, '.limitrow')).toEqual(['5hreset 09:20']);
  });

  it('gives a sandboxed agent its own row with its face, after the shared one', () => {
    const boxed: readonly UiAgent[] = [
      { ...(AGENTS[0] as UiAgent), machine: { kind: 'box', limits: { maxCpus: 2, maxMemoryBytes: 1 } } },
      { ...(AGENTS[1] as UiAgent), runtimeLabel: 'claude code' },
    ];
    const windows = [{ durationMinutes: 300, utilization: 0.08, resetsAt: at(11, 16) }];
    const host = render({}, {}, boxed, {}, [], {
      'agent:alice': windows,
      'local:claude code': windows,
    }, NOW);
    expect(texts(host, '.limitshead')).toEqual(['claude code', 'Alice']);
    expect(host.querySelectorAll('.limitshead')[1]?.children).toHaveLength(2);
  });

  it('draws no block for a roster whose logins never sent a reading', () => {
    const host = render({ bob: { used: 1_000, size: 200_000 } }, {}, AGENTS, {}, [], {
      'local:somebody else': [{ durationMinutes: 300, utilization: 0.5, resetsAt: at(11, 14) }],
    }, NOW);
    expect(host.querySelector('.limits')).toBeNull();
    expect(host.querySelector('.ctx')).not.toBeNull();
  });

  it('is enough on its own for the panel not to say it is empty', () => {
    const host = render({}, {}, AGENTS, {}, [], {
      'local:claude code': [{ durationMinutes: 300, utilization: 0.5, resetsAt: at(11, 14) }],
    }, NOW);
    expect(host.querySelector('.detailsempty')).toBeNull();
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

  /** 1,240 characters of entries, so the row estimates ~310 tokens at four to a token. */
  const ENTRIES: readonly UiHandbookEntry[] = [
    { id: 'e1', ordinal: 1, text: 'x'.repeat(600), source: 'told', at: 1, removed: false },
    { id: 'e2', ordinal: 2, text: 'x'.repeat(640), source: 'noticed', at: 2, removed: false },
  ];

  it('draws the handbook under persona, above standing instructions', () => {
    const host = render(
      { alice: { used: 37_000, size: 1_000_000 } },
      { alice: SENT },
      AGENTS,
      { alice: ENTRIES },
    );
    click(host, 0);
    const lines = [...(host.querySelectorAll('.sentrow') ?? [])].map((row) => row.textContent);
    // The order the persona puts them in, which is the whole point of drawing them adjacent:
    // what is true of this work, then what is true of you. And no possessive and no count —
    // *your* is load-bearing on the row below it and would be a small lie on this one.
    expect(lines.slice(0, 3)).toEqual([
      'persona~460',
      'handbook~310',
      'your standing instructions~105',
    ]);
  });

  it('says nothing about a handbook that is empty', () => {
    const host = render({ alice: { used: 37_000, size: 1_000_000 } }, { alice: SENT });
    click(host, 0);
    const lines = [...(host.querySelectorAll('.sentrow') ?? [])].map((row) => row.textContent);
    // Hidden at zero like both neighbours. This row prices what blobot spends on a turn, and
    // an empty Handbook costs nothing; the tray's door is where a count of zero is said.
    expect(lines.some((line) => line?.startsWith('handbook'))).toBe(false);
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

describe('the panel', () => {
  const workspaces = [
    { agentId: 'alice', agentName: 'Alice', kind: 'git' as const, branch: 'blobot/t/alice', present: true },
  ];

  it('holds both blocks, and nothing else', () => {
    const panel = render(
      { alice: { used: 1000, size: 200_000 } },
      {},
      AGENTS,
      {},
      workspaces,
    ).querySelector('.detailspop') as HTMLElement;
    expect(panel.querySelector('.ctx')).not.toBeNull();
    expect(panel.querySelector('.ws')).not.toBeNull();
    // The activity log was the third thing here until 2026-09-05, and it is not coming back
    // through this door: what settles is drawn in the transcript's own fold.
    expect(panel.querySelectorAll('.fev')).toHaveLength(0);
    expect(panel.querySelector('.detailsempty')).toBeNull();
  });

  it('is not on screen until the glyph is pressed', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    drawn.push({ unmount: () => root.unmount(), host });
    act(() => {
      root.render(
        <Details
          agents={AGENTS}
          usage={{ alice: { used: 1000, size: 200_000 } }}
          injection={{}}
          handbooks={{}}
          workspaces={workspaces}
          looking={false}
          onRefreshWorkspaces={() => undefined}
          onPublish={async () => ({ ok: false, step: 'create', error: 'not in this test' })}
          onPlan={async () => []}
        />,
      );
    });
    expect(document.querySelector('.detailspop')).toBeNull();
    expect(host.querySelector('.paneltoggle')).not.toBeNull();
  });
});
