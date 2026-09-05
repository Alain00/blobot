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
import type { UiAgent } from '../../../shared/api.js';
import { itemsFor, type Item, type Pane } from '../model.js';
import { stubGazeHost } from '../test-dom.js';

// React's own flag for "these updates are being driven by a test", which is what lets `act`
// flush effects synchronously instead of warning that nothing is listening.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// This surface draws animated blobatars, so a gaze driver mounts with them. See `test-dom.ts`.
stubGazeHost();

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

const AGENTS: readonly UiAgent[] = [
  { id: 'a', name: 'Alice', role: 'builds', runtimeLabel: 'mock', workspacePath: '/w/a', accepts: { images: true, textFiles: true } },
  { id: 'b', name: 'Bob', role: 'reviews', runtimeLabel: 'mock', workspacePath: '/w/b', accepts: { images: true, textFiles: true } },
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
          agents: AGENTS,
          statuses: { a: 'responding', b: 'idle' },
          items,
          onAnswerPermission: () => {},
        routineArmed: {},
        onDisarmRoutine: () => {},
      onRemoveHandbookEntry: () => {},
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

/**
 * Renders a transcript and answers with the text of the column, whitespace collapsed.
 *
 * `then` runs against the mounted DOM before the text is read, which is how the peer voice is
 * tested: a peer message is a line until somebody clicks it, so the message itself is only in
 * the document on the far side of that click.
 */
function draw(
  items: readonly Item[],
  pane: Pane,
  statuses: Record<string, AgentStatus> = { a: 'working', b: 'idle' },
  then?: (host: HTMLElement) => void,
  // Counting nodes rather than reading text needs the render `then` provoked to have happened,
  // and inside `then` it has not: that callback runs inside the `act` that flushes it.
  read?: (host: HTMLElement) => void,
): string {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      React.createElement(Conversation, {
        pane,
        agents: AGENTS,
        statuses,
        items,
        onAnswerPermission: () => {},
        routineArmed: {},
        onDisarmRoutine: () => {},
      onRemoveHandbookEntry: () => {},
      }),
    );
  });
  if (then !== undefined) act(() => then(host));
  if (read !== undefined) read(host);
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

  // The `to Bob` caption under every prompt is gone, 2026-09-04. What it was guarding against is
  // the reader losing which reply is whose, and the fold answers that where it happens.
  it('says what you typed and nothing about where it went', () => {
    const items: Item[] = [{ kind: 'user', id: 'u', at, agentIds: ['b'], text: 'have a look' }];
    expect(draw(items, { kind: 'team' })).toContain('have a look');
    expect(draw(items, { kind: 'team' })).not.toContain('to Bob');
    expect(draw(items, { kind: 'agent', agentId: 'b' })).not.toContain('to Bob');
  });

  // A fan-out went to both, and used to say so under the bubble. The bubble's own words carry it
  // now, because addressing is typed with an `@` and the reader is the one who typed it.
  it('says nothing about a fan-out either', () => {
    const items: Item[] = [
      { kind: 'user', id: 'u', at, agentIds: ['a', 'b'], text: '@Alice @Bob have a look' },
    ];
    expect(draw(items, { kind: 'team' })).not.toContain('to Alice, Bob');
  });

  // An agent that put itself on a schedule. The block is the price of issue 05's amendment, so
  // it has to draw: who, what, the shape, what the shape costs, and one control.
  it('draws the block an agent scheduling itself opens', () => {
    const drawn = draw(
      [
        {
          kind: 'routine',
          id: 'r:scheduled',
          at,
          agentId: 'a',
          routineId: 'r',
          name: 'morning typecheck',
          schedule: 'every day at 09:00',
          frequency: '1 firing a day',
        },
      ],
      { kind: 'team' },
      { a: 'idle', b: 'idle' },
    );
    expect(drawn).toContain('Alice scheduled a routine');
    expect(drawn).toContain('morning typecheck');
    expect(drawn).toContain('every day at 09:00');
    expect(drawn).toContain('1 firing a day');
  });

  // The tag answers "where did this go", and on a team of one that question was never open.
  it('says nothing about the recipient on a team of one', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        React.createElement(Conversation, {
          pane: { kind: 'team' } as Pane,
          agents: [AGENTS[0]!],
          statuses: { a: 'idle' },
          items: [{ kind: 'user', id: 'u', at, agentIds: ['a'], text: 'have a look' }],
          onAnswerPermission: () => {},
          routineArmed: {},
          onDisarmRoutine: () => {},
      onRemoveHandbookEntry: () => {},
        }),
      );
    });
    const text = host.querySelector('.col')?.textContent ?? '';
    act(() => root.unmount());
    host.remove();
    expect(text).toContain('have a look');
    expect(text).not.toContain('to Alice');
  });

  /*
   * The screenshot this change came from: the user asked Alice about Bob, Alice mailed Bob, and
   * Bob's whole answer to Alice was drawn in the user's column with nothing marking it as
   * somebody else's mail. Shut, the pane says a teammate was involved and names them; the turn
   * itself is one click away.
   */
  it('folds a teammate the prompt did not address, and names them on the line', () => {
    const at = 1_700_000_000_000;
    const items: Item[] = [
      { kind: 'user', id: 'u', at, agentIds: ['a'], text: 'can you check on Bob' },
      { kind: 'peer', id: 'p', at: at + 1000, fromId: 'a', toId: 'b', text: 'what are you on?' },
      { kind: 'agent', id: 'm', at: at + 2000, agentId: 'b', text: 'NOTHING RUNNING MY END', live: false },
    ];

    // Idle on purpose: while Alice is still in her turn the same reply is a live step instead,
    // which is the test below this one.
    const shut = draw(items, { kind: 'team' }, { a: 'idle', b: 'idle' });
    expect(shut).toContain('2 messages');
    expect(shut).toContain('Bob');
    expect(shut).not.toContain('NOTHING RUNNING MY END');

    const opened = draw(items, { kind: 'team' }, { a: 'idle', b: 'idle' }, (host) =>
      host.querySelector<HTMLButtonElement>('.ran .route')?.click(),
    );
    expect(opened).toContain('NOTHING RUNNING MY END');
  });

  /*
   * Past two, the far ends are a stack of faces and nothing else: `17 messages with 3 teammates`
   * said in words what the faces beside it were already saying, and the count of mail is the half
   * of it a reader can do nothing with.
   */
  /*
   * And the same reply while the turn it belongs to is still running. The author, 2026-09-05:
   * drawn at the top level it streamed a paragraph nobody in the room was addressed in over the
   * agent they did ask, and then vanished into the fold the instant it stopped. It is a step
   * now -- a call's altitude, Bob's own face, his words clipped to the row -- and it leaves when
   * the fold takes the whole block.
   */
  it('draws a teammate reply as a step while the principal is still working', () => {
    const at = 1_700_000_000_000;
    const items: Item[] = [
      { kind: 'user', id: 'u', at, agentIds: ['a'], text: 'can you check on Bob' },
      { kind: 'peer', id: 'p', at: at + 1000, fromId: 'a', toId: 'b', text: 'what are you on?' },
      { kind: 'agent', id: 'm', at: at + 2000, agentId: 'b', text: 'NOTHING RUNNING MY END', live: false },
    ];

    const live = draw(items, { kind: 'team' }, { a: 'working', b: 'idle' });
    expect(live).toContain('NOTHING RUNNING MY END');

    // And it is news only until the principal has worked past it. Two calls of Alice's after the
    // reply and it is the turn's history, which is what the fold is for.
    const worked: Item[] = [
      ...items,
      { kind: 'tool', id: 't1', at: at + 3000, agentId: 'a', title: 'npm run one', toolKind: 'execute', status: 'completed' },
      { kind: 'tool', id: 't2', at: at + 4000, agentId: 'a', title: 'npm run two', toolKind: 'execute', status: 'running' },
    ];
    const moved = draw(worked, { kind: 'team' }, { a: 'working', b: 'idle' });
    expect(moved).toContain('npm run two');
    expect(moved).not.toContain('NOTHING RUNNING MY END');

    // Still being written, it is in neither place: not a paragraph at the top level, and not a
    // line in the block. `when it finished` is the whole of the instruction.
    const writing: Item[] = [
      items[0] as Item,
      items[1] as Item,
      { kind: 'agent', id: 'm', at: at + 2000, agentId: 'b', text: 'NOTHING RUNNING MY END', live: true },
    ];
    expect(draw(writing, { kind: 'team' }, { a: 'working', b: 'responding' })).not.toContain(
      'NOTHING RUNNING MY END',
    );
  });

  it('stacks the faces past two partners, and counts nothing in words', () => {
    const at = 1_700_000_000_000;
    const items: Item[] = [
      { kind: 'user', id: 'u', at, agentIds: ['a'], text: 'can u ping the team?' },
      { kind: 'peer', id: 'p1', at: at + 1000, fromId: 'a', toId: 'b', text: 'what are you on?' },
      { kind: 'peer', id: 'p2', at: at + 2000, fromId: 'a', toId: 'c', text: 'what are you on?' },
      { kind: 'peer', id: 'p3', at: at + 3000, fromId: 'a', toId: 'd', text: 'what are you on?' },
      { kind: 'agent', id: 'mb', at: at + 4000, agentId: 'b', text: 'nothing in flight', live: false },
      { kind: 'agent', id: 'mc', at: at + 5000, agentId: 'c', text: 'unbriefed', live: false },
      { kind: 'agent', id: 'md', at: at + 6000, agentId: 'd', text: 'idle here', live: false },
    ];

    let faces = 0;
    const shut = draw(items, { kind: 'team' }, { a: 'idle', b: 'idle' }, undefined, (host) => {
      faces = host.querySelectorAll('.ran .route .stack > span').length;
    });

    expect(faces).toBe(3);
    expect(shut).not.toContain('teammates');
    expect(shut).not.toContain('messages with');
  });

  /*
   * An agent's own pane holds that agent's items and the mail at either end of them, and never
   * another agent's turn -- `itemsFor` has already taken those out, which is what App hands this
   * component. So swallowing a teammate is a team-pane shape by arithmetic rather than by a
   * pane check, and
   * the filter is in this test for the same reason it is in App: without it the component would
   * be being asked to draw a pane that cannot occur.
   */
  it('makes no aside in an agent own pane', () => {
    const at = 1_700_000_000_000;
    const items: Item[] = [
      { kind: 'user', id: 'u', at, agentIds: ['a'], text: 'can you check on Bob' },
      { kind: 'peer', id: 'p', at: at + 1000, fromId: 'a', toId: 'b', text: 'what are you on?' },
      { kind: 'agent', id: 'm', at: at + 2000, agentId: 'b', text: 'nothing running', live: false },
    ];
    const pane: Pane = { kind: 'agent', agentId: 'a' };
    expect(draw(itemsFor(items, pane), pane)).not.toContain('message with');
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
    const open = (host: HTMLElement): void =>
      host.querySelector<HTMLButtonElement>('.peer .route')?.click();

    // Shut, it is one line naming the far end, and the far end is whoever this pane is not.
    // No space between the two: the sender's blobatar is the element sitting between them.
    expect(draw(items, { kind: 'agent', agentId: 'b' })).toContain('message received fromAlice');
    expect(draw(items, { kind: 'team' })).toContain('message sent toBob');
    // And no peek: the message is not in the document until the line is clicked.
    expect(draw(items, { kind: 'agent', agentId: 'b' })).not.toContain('could you check this');
    expect(draw(items, { kind: 'agent', agentId: 'b' }, undefined, open)).toContain(
      'could you check this',
    );
    // The trust framing is gone from the block (the author, 2026-09-04): it is said in the
    // envelope, to the agent, which is the only reader it binds. Neither side draws it.
    expect(draw(items, { kind: 'agent', agentId: 'b' }, undefined, open)).not.toContain(
      "a teammate's request",
    );
    expect(draw(items, { kind: 'team' }, undefined, open)).not.toContain("a teammate's request");
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
      canAllowAlways: true,
    };
    // The command is its own line under the sentence, so the two are not one run of text.
    expect(draw([asking], { kind: 'team' })).toContain('Alice wants to run');
    expect(draw([asking], { kind: 'team' })).toContain('git push');
    expect(draw([asking], { kind: 'team' })).toContain('allow always');
    expect(draw([{ ...asking, outcome: 'allowed' }], { kind: 'team' })).toContain(
      'allowed once',
    );
    expect(draw([{ ...asking, outcome: 'allowed_always' }], { kind: 'team' })).toContain(
      'allowed always',
    );
  });

  it('attributes a system line in the team pane and leaves it bare in an agent pane', () => {
    const items: Item[] = [
      { kind: 'system', id: 's', at, agentId: 'a', text: 'turn stopped · max tokens' },
    ];
    expect(draw(items, { kind: 'team' })).toContain('Alice · turn stopped');
    expect(draw(items, { kind: 'agent', agentId: 'a' })).not.toContain('Alice ·');
  });

  it('folds a settled run of work to one line, and opens it on a click', () => {
    const items: Item[] = [
      { kind: 'agent', id: 'c1', at, agentId: 'a', text: 'Now the selection store.', live: false },
      {
        kind: 'tool',
        id: 't1',
        at: at + 1,
        agentId: 'a',
        title: 'src/store.ts',
        toolKind: 'edit',
        status: 'completed',
      },
      {
        kind: 'tool',
        id: 't2',
        at: at + 2,
        agentId: 'a',
        title: 'npx astro check',
        toolKind: 'execute',
        status: 'completed',
      },
      { kind: 'agent', id: 'a1', at: at + 3, agentId: 'a', text: 'Zero errors.', live: false },
    ];
    const open = (host: HTMLElement): void =>
      host.querySelector<HTMLButtonElement>('.ran .route')?.click();

    // Shut: the count, and the answer the run was leading to. Not the captions, not the calls.
    const shut = draw(items, { kind: 'team' });
    expect(shut).toContain('ran 2 tools');
    expect(shut).toContain('Zero errors.');
    expect(shut).not.toContain('Now the selection store.');
    expect(shut).not.toContain('npx astro check');

    // Opened: the kind column, from the kind the runtimes send and the renderer used to drop.
    // It is a glyph now, so the word it stands for is read off the label and not off the text.
    let kinds: string[] = [];
    const opened = draw(
      items,
      { kind: 'team' },
      undefined,
      open,
      (host) => {
        kinds = [...host.querySelectorAll('.tool .v [aria-label]')].map(
          (glyph) => glyph.getAttribute('aria-label') ?? '',
        );
      },
    );
    expect(kinds).toEqual(['edit', 'run']);
    expect(opened).toContain('src/store.ts');
    expect(opened).toContain('npx astro check');
    expect(opened).toContain('Now the selection store.');
    // And no word for a call that finished the ordinary way: silence, never a success claim.
    expect(opened).not.toContain('completed');
  });

  /**
   * A call in flight used to end in the word `running`, which is a static word claiming a live
   * fact: on screen the only moving thing was the pending bubble's three dots underneath it.
   * The word is gone and the status channel's sweeping hairline stands in its place.
   */
  it('says a call is still running with the status hairline, and never with the word', () => {
    const items: Item[] = [
      {
        kind: 'tool',
        id: 't1',
        at,
        agentId: 'a',
        title: 'npx astro check',
        toolKind: 'execute',
        status: 'running',
      },
    ];
    let hairlines = -1;
    // A running call is never folded away, so it draws without opening anything.
    const drawn = draw(items, { kind: 'team' }, undefined, (host) => {
      hairlines = host.querySelectorAll('.tool .inflight').length;
    });
    expect(drawn).toContain('npx astro check');
    expect(drawn).not.toContain('running');
    expect(hairlines).toBe(1);

    // And the kind column survives it: the hairline is at the end, not in place of the glyph.
    let settled = -1;
    draw(
      [{ ...(items[0] as Extract<Item, { kind: 'tool' }>), status: 'completed' }],
      { kind: 'team' },
      undefined,
      (host) => {
        settled = host.querySelectorAll('.tool .inflight').length;
      },
    );
    expect(settled).toBe(0);
  });

  it('draws what an edit changed, signed, and nothing at all where it was not measured', () => {
    const items: Item[] = [
      {
        kind: 'tool',
        id: 't1',
        at,
        agentId: 'a',
        title: 'src/desk.tsx',
        toolKind: 'edit',
        status: 'completed',
        changed: { added: 74, removed: 41 },
      },
      {
        kind: 'tool',
        id: 't2',
        at: at + 1,
        agentId: 'a',
        title: 'npm run build',
        toolKind: 'execute',
        status: 'completed',
      },
    ];
    const opened = draw(items, { kind: 'team' }, undefined, (host) =>
      host.querySelector<HTMLButtonElement>('.ran .route')?.click(),
    );
    expect(opened).toContain('+74');
    expect(opened).toContain('\u221241');
    // A zero is drawn where it was measured, because `+12 −0` is a different edit from `+12 −8`.
    const zero = draw(
      [{ ...(items[0] as Extract<Item, { kind: 'tool' }>), changed: { added: 12, removed: 0 } }, items[1] as Item],
      { kind: 'team' },
      undefined,
      (host) => host.querySelector<HTMLButtonElement>('.ran .route')?.click(),
    );
    expect(zero).toContain('\u22120');
  });

  it('says what a shut run touched, per file, and stops saying it once the calls are on screen', () => {
    const items: Item[] = [
      { kind: 'agent', id: 'c1', at, agentId: 'a', text: 'The schedule first.', live: false },
      {
        kind: 'tool',
        id: 't1',
        at: at + 1,
        agentId: 'a',
        title: 'src/ChurnSchedule.tsx',
        toolKind: 'edit',
        status: 'completed',
        changed: { added: 70, removed: 41 },
      },
      // The same file again: a footer is per file, not per call, so the two sum.
      {
        kind: 'tool',
        id: 't2',
        at: at + 2,
        agentId: 'a',
        title: 'src/ChurnSchedule.tsx',
        toolKind: 'edit',
        status: 'completed',
        changed: { added: 4, removed: 0 },
      },
      // Measured nowhere, so it is not in the footer at all: absent is not zero.
      {
        kind: 'tool',
        id: 't3',
        at: at + 3,
        agentId: 'a',
        title: 'src/menu.ts',
        toolKind: 'edit',
        status: 'completed',
      },
      { kind: 'agent', id: 'a1', at: at + 4, agentId: 'a', text: 'Done.', live: false },
    ];

    let shutFiles = -1;
    const shut = draw(items, { kind: 'team' }, undefined, (host) => {
      shutFiles = host.querySelectorAll('.ran .touched .file').length;
    });
    expect(shutFiles).toBe(1);
    // The filename, not the path the line inside the fold carries.
    expect(shut).toContain('ChurnSchedule.tsx');
    expect(shut).not.toContain('src/ChurnSchedule.tsx');
    expect(shut).toContain('+74');
    expect(shut).toContain('\u221241');
    expect(shut).not.toContain('menu.ts');
    // And the captions it swallowed are counted, in blobot's own word for them.
    expect(shut).toContain('ran 3 tools \u00b7 1 note');

    // Opened, every one of those numbers is on the call that made it. Saying it twice in one
    // block is the noise the altitude argument was never about.
    let openFiles = -1;
    draw(
      items,
      { kind: 'team' },
      undefined,
      (host) => host.querySelector<HTMLButtonElement>('.ran .route')?.click(),
      (host) => {
        openFiles = host.querySelectorAll('.ran .touched .file').length;
      },
    );
    expect(openFiles).toBe(0);
  });

  it('keeps the whole path on both of two touched files that share a filename', () => {
    const twin = (id: string, title: string): Item => ({
      kind: 'tool',
      id,
      at,
      agentId: 'a',
      title,
      toolKind: 'edit',
      status: 'completed',
      changed: { added: 3, removed: 1 },
    });
    const items: Item[] = [twin('t1', 'src/store/index.ts'), twin('t2', 'src/scene/index.ts')];
    const shut = draw(items, { kind: 'team' });
    expect(shut).toContain('src/store/index.ts');
    expect(shut).toContain('src/scene/index.ts');
  });

  it('says what happened to a call that did not finish, in the header and on its line', () => {
    const items: Item[] = [
      {
        kind: 'tool',
        id: 't1',
        at,
        agentId: 'a',
        title: 'npm test',
        toolKind: 'execute',
        status: 'failed',
      },
      // A cancelled call reports `completed` with a null exit, which is ticket 08's trap.
      {
        kind: 'tool',
        id: 't2',
        at: at + 1,
        agentId: 'a',
        title: 'npm build',
        toolKind: 'execute',
        status: 'completed',
        exit: null,
      },
    ];
    expect(draw(items, { kind: 'team' })).toContain('ran 2 tools · 2 failed');
    const opened = draw(items, { kind: 'team' }, undefined, (host) =>
      host.querySelector<HTMLButtonElement>('.ran .route')?.click(),
    );
    expect(opened).toContain('failed');
    expect(opened).toContain('exit null');
  });

  it('stands three dots under the last thing said for an agent that has not started', () => {
    // Bob is idle and Alice is working, so only Alice is about to speak.
    const drawn = draw([], { kind: 'team' });
    expect(drawn).toContain('Alice');
    expect(drawn).not.toContain('Bob');
  });
});

describe('a session blobot replaced', () => {
  const at = 1_000;
  const compaction: Item = {
    kind: 'compaction',
    id: 'c1',
    at,
    agentId: 'a',
    how: 'handoff',
    used: 110_000,
    ceiling: 120_000,
    measured: false,
    handoff: 'I am migrating the old call sites. Four left, all in checkout.',
    handoffPath: '/handoffs/alice-1000.md',
  };

  it('is shut by default, so a transcript is not full of blobot explaining itself', () => {
    const drawn = draw([compaction], { kind: 'team' });
    expect(drawn).toContain('fresh session');
    expect(drawn).not.toContain('Four left');
  });

  it('opens onto the note the agent wrote, which is the reason to prefer this to /compact', () => {
    const drawn = draw([compaction], { kind: 'team' }, { a: 'idle', b: 'idle' }, (host) => {
      host.querySelector<HTMLButtonElement>('.handoff .route')?.click();
    });
    expect(drawn).toContain('Four left, all in checkout');
    // Under the note rather than in the line: it is where the file went, not part of the
    // sentence about what happened.
    expect(drawn).toContain('/handoffs/alice-1000.md');
  });

  it('says whose session it was in the team pane, and does not in the agent’s own', () => {
    expect(draw([compaction], { kind: 'team' })).toContain('Alice · fresh session');
    expect(draw([compaction], { kind: 'agent', agentId: 'a' })).not.toContain('Alice ·');
  });

  it('draws a refusal as a plain line, because there is no note to open', () => {
    const kept: Item = {
      kind: 'compaction',
      id: 'c2',
      at,
      agentId: 'a',
      how: 'refused',
      used: 110_000,
      ceiling: 120_000,
      measured: true,
      reason: 'the agent wrote no handoff, so the session was kept',
    };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        React.createElement(Conversation, {
          pane: { kind: 'team' } as Pane,
          agents: AGENTS,
          statuses: { a: 'idle', b: 'idle' },
          items: [kept],
          onAnswerPermission: () => {},
        routineArmed: {},
        onDisarmRoutine: () => {},
      onRemoveHandbookEntry: () => {},
        }),
      );
    });
    expect(host.querySelector('.handoff')).toBeNull();
    expect(host.textContent).toContain('session kept');
    act(() => root.unmount());
    host.remove();
  });
});
