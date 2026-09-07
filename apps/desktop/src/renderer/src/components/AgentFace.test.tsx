/**
 * @vitest-environment jsdom
 *
 * The two halves of a face a name does not decide, in the dialog where they are chosen.
 *
 * The colour row has been on this screen since the creation flow was built and is tested
 * nowhere, so this covers both: a radiogroup each, one default cell each meaning *the name
 * decides*, and a chosen cell that stays chosen. The claim worth a test is the last one — the
 * shape cells are blobatars themselves, so "which one is on" is a fact about `aria-checked`
 * rather than about anything a reader can see in jsdom.
 *
 * `EditAgent` rather than `HireAgent`, because the edit is the one that opens on a stored face
 * and therefore the one where a dropped field shows up as the wrong cell being ringed.
 *
 * *2026-09-07: the rows moved into a popover hanging off the face, so the test presses the face
 * first. The claims are unchanged — what changed is that the palette is no longer a third of the
 * surface, which is the whole reason the bar replaced the dialog.*
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiAgentProfile, UiRuntimeChoice } from '../../../shared/api.js';
import { EditAgent } from './AgentForm.js';
import { SHAPE_NAMES } from '../blobatar-shapes.js';
import { stubGazeHost } from '../test-dom.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// The preview blobatar is the one in the app that always animates, so it brings the gaze
// driver with it into a DOM that has neither `matchMedia` nor a `ResizeObserver`.
stubGazeHost();
Element.prototype.scrollIntoView ??= function scrollIntoView(): void {};

const RUNTIMES: readonly UiRuntimeChoice[] = [
  {
    runtimeId: 'claude-code',
    label: 'Claude Code',
    supported: true,
    readiness: 'ready',
    detail: 'Signed in on this machine',
    remedies: [],
    trustLevels: ['careful', 'normal', 'trusting'],
  },
];

const MARA: UiAgentProfile = {
  id: 'p1',
  name: 'Mara',
  role: 'marketing',
  runtimeId: 'claude-code',
  runtimeLabel: 'Claude Code',
  teams: [],
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

function draw(agent: UiAgentProfile): void {
  (globalThis as unknown as { window: { blobot: unknown } }).window.blobot = {
    describeRuntimeOptions: vi.fn(async () => ({ groups: [] })),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <EditAgent agent={agent} runtimes={RUNTIMES} onClose={() => {}} onSaved={() => {}} />,
    );
  });
  drawn.push({ unmount: () => root.unmount(), host });
}

/** The palette is behind the face now, so every claim below starts by opening it. */
function openFace(): void {
  const face = document.querySelector('[aria-label="Change this face"]');
  act(() => (face as HTMLElement | null)?.click());
}

/** Radix portals the dialog, so the cells are on the document rather than under the host. */
const cells = (label: string): HTMLElement[] => {
  const group = document.querySelector(`[role="radiogroup"][aria-label="${label}"]`);
  return [...(group?.querySelectorAll('[role="radio"]') ?? [])] as HTMLElement[];
};
const chosen = (label: string): string | undefined =>
  cells(label).find((cell) => cell.getAttribute('aria-checked') === 'true')?.getAttribute('aria-label') ??
  undefined;

describe('the face in an agent’s dialog', () => {
  it('offers every silhouette, and one cell meaning the name decides', () => {
    draw(MARA);
    openFace();
    expect(cells('Shape')).toHaveLength(SHAPE_NAMES.length + 1);
    expect(chosen('Shape')).toBe('the shape its name gives it');
    expect(chosen('Colour')).toBe('the colour its name gives it');
  });

  it('opens on the shape the agent is stored with', () => {
    draw({ ...MARA, shape: 'hexagon', hue: 215 });
    openFace();
    expect(chosen('Shape')).toBe('hexagon');
    expect(chosen('Colour')).toBe('colour 215');
  });

  it('takes a shape, and gives it back to the name', () => {
    draw(MARA);
    openFace();
    const cloud = cells('Shape').find((cell) => cell.getAttribute('aria-label') === 'cloud');
    act(() => cloud?.click());
    expect(chosen('Shape')).toBe('cloud');

    const [auto] = cells('Shape');
    act(() => auto?.click());
    expect(chosen('Shape')).toBe('the shape its name gives it');
  });
});
