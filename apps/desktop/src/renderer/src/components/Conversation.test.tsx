/**
 * @vitest-environment jsdom
 *
 * The transcript's cost per streamed token.
 *
 * This is a performance claim, so it is measured rather than asserted about: the instrument is
 * how many times `Markdown` is invoked while one agent writes one message. Streaming a token
 * must cost the message being written, not the history it is being written into.
 *
 * `Markdown` is the thing being counted because it is where the money is — every invocation
 * parses and lays out a markdown tree. It is mocked to a bare element so the count is of
 * renders, not of layout, which keeps the number exact instead of merely large.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentStatus } from '@blobot/core/domain';
import type { UiAgent, UiTeam } from '../../../shared/api.js';
import type { Item, Pane } from '../model.js';

// React's own flag for "these updates are being driven by a test", which is what lets `act`
// flush effects synchronously instead of warning that nothing is listening.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no ResizeObserver, and the pane's stick-to-bottom is built on one. Nothing here
// measures layout, so it may be inert: what matters is that the effect mounts.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

const markdowns = vi.fn();
vi.mock('./Markdown.js', () => ({
  Markdown: (props: { text: string }): React.JSX.Element => {
    markdowns(props.text);
    return React.createElement('div', null, props.text);
  },
}));

const { Conversation } = await import('./Conversation.js');

const TEAM: UiTeam = { id: 't', name: 'Team', workspacePath: '/w', turnBudget: 10 };
const AGENTS: readonly UiAgent[] = [
  { id: 'a', name: 'Alice', role: 'builds', runtimeLabel: 'mock', workspacePath: '/w/a' },
  { id: 'b', name: 'Bob', role: 'reviews', runtimeLabel: 'mock', workspacePath: '/w/b' },
];

/** A settled transcript of `count` messages, alternating speakers so nothing groups away. */
function history(count: number): Item[] {
  return Array.from({ length: count }, (_, index) => ({
    kind: 'agent' as const,
    id: `old-${index}`,
    at: index * 60_000,
    agentId: index % 2 === 0 ? 'a' : 'b',
    text: `something said a while ago, number ${index}`,
    live: false,
  }));
}

/**
 * Renders a transcript of `depth` settled messages, then streams `deltas` tokens into a new one,
 * and answers with the number of `Markdown` renders each token cost.
 */
function costPerDelta(depth: number, deltas: number): number {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  const draw = (items: readonly Item[]): void => {
    act(() => {
      root.render(
        React.createElement(Conversation, {
          pane: { kind: 'team' },
          team: TEAM,
          agents: AGENTS,
          statuses: { a: 'responding', b: 'idle' },
          items,
          onAnswerPermission: () => {},
        }),
      );
    });
  };

  const settled = history(depth);
  draw(settled);

  // Only what the stream costs: the first paint of the history is not the thing being measured.
  markdowns.mockClear();
  let text = '';
  for (let index = 0; index < deltas; index += 1) {
    text += 'token ';
    // The same shape `applyEvent` produces for `agent_message_delta`: a new array, and a new
    // object for the item being written. Everything else keeps its identity.
    draw([...settled, { kind: 'agent', id: 'live', at: 999_999, agentId: 'a', text, live: true }]);
  }
  const cost = markdowns.mock.calls.length / deltas;

  act(() => root.unmount());
  host.remove();
  return cost;
}

beforeEach(() => markdowns.mockClear());

describe('streaming into a long transcript', () => {
  it('costs the message being written, not the history behind it', () => {
    const shallow = costPerDelta(20, 20);
    const deep = costPerDelta(400, 20);

    // One render per token: the message being written. Nothing settled is touched.
    expect(shallow).toBe(1);
    expect(deep).toBe(1);
  });
});

/** Renders a transcript and answers with the text of the column, whitespace collapsed. */
function draw(
  items: readonly Item[],
  pane: Pane,
  statuses: Record<string, AgentStatus> = { a: 'working', b: 'idle' },
): string {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      React.createElement(Conversation, {
        pane,
        team: TEAM,
        agents: AGENTS,
        statuses,
        items,
        onAnswerPermission: () => {},
      }),
    );
  });
  const text = host.querySelector('.col')?.textContent ?? '';
  const grouped = host.querySelectorAll('.msg.grouped').length;
  act(() => root.unmount());
  host.remove();
  return `${text.replace(/\s+/g, ' ').trim()} [grouped:${grouped}]`;
}

/**
 * The narrowing above resolved every name, hue and role at the call site instead of inside the
 * item, which is a rewrite of all six voices. This is what says they still say what they said.
 */
describe('the voices, after the roster stopped being passed down', () => {
  const at = 1_700_000_000_000;

  it('names the recipient of your message, in the team pane only', () => {
    const items: Item[] = [{ kind: 'user', id: 'u', at, agentId: 'b', text: 'have a look' }];
    expect(draw(items, { kind: 'team' })).toContain('to Bob');
    expect(draw(items, { kind: 'agent', agentId: 'b' })).not.toContain('to Bob');
  });

  it('labels a turn once and drops the name from what continues it', () => {
    const drawn = draw(
      [
        { kind: 'agent', id: '1', at, agentId: 'a', text: 'first', live: false },
        { kind: 'agent', id: '2', at: at + 1000, agentId: 'a', text: 'second', live: false },
      ],
      { kind: 'team' },
      // Nobody is about to speak, so the only names on screen are the transcript's own.
      { a: 'idle', b: 'idle' },
    );
    // One name for two messages, and the second is the grouped one.
    expect(drawn.match(/Alice/g)).toHaveLength(1);
    expect(drawn).toContain('[grouped:1]');
  });

  it('reads a peer message as mail in the pane that received it, and as a copy elsewhere', () => {
    const items: Item[] = [
      { kind: 'peer', id: 'p', at, fromId: 'a', toId: 'b', text: 'could you check this' },
    ];
    expect(draw(items, { kind: 'agent', agentId: 'b' })).toContain('from Alice · builds');
    expect(draw(items, { kind: 'agent', agentId: 'b' })).toContain("a teammate's request");
    expect(draw(items, { kind: 'team' })).toContain('sent to Bob · reviews');
    expect(draw(items, { kind: 'team' })).not.toContain("a teammate's request");
  });

  it('says who is asking to run what, and what was answered', () => {
    const asking: Item = {
      kind: 'permission',
      id: 'q',
      at,
      agentId: 'a',
      toolCallId: 'c',
      title: 'git push',
      canAllow: true,
    };
    expect(draw([asking], { kind: 'team' })).toContain('Alice wants to run git push');
    expect(draw([{ ...asking, outcome: 'allowed' }], { kind: 'team' })).toContain(
      'you allowed this once',
    );
  });

  it('attributes a system line in the team pane and leaves it bare in an agent pane', () => {
    const items: Item[] = [
      { kind: 'system', id: 's', at, agentId: 'a', text: 'turn stopped · max tokens' },
    ];
    expect(draw(items, { kind: 'team' })).toContain('Alice · turn stopped');
    expect(draw(items, { kind: 'agent', agentId: 'a' })).not.toContain('Alice ·');
  });

  it('stands three dots under the last thing said for an agent that has not started', () => {
    // Bob is idle and Alice is working, so only Alice is about to speak.
    const drawn = draw([], { kind: 'team' });
    expect(drawn).toContain('Alice');
    expect(drawn).not.toContain('Bob');
  });
});
