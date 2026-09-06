/**
 * @vitest-environment jsdom
 *
 * The Handbook where a person meets it: the panel behind the tray's door.
 *
 * The claims worth holding are the ones a screenshot would not catch. That the door is drawn at
 * **every count**, empty included, since the notice card that used to carry the invitation is
 * gone. That the panel offers **removal and never editing**, since an entry you edited is neither
 * yours nor the agent's. That `add one` **writes nothing** and only hands the composer some
 * words, which is what keeps `record_entry` the single path into a Handbook and therefore keeps
 * the transcript's disclosure complete. And that the door survives an agent whose Workspace has
 * no branch, which is a copy rather than a git worktree and has nothing to do with Handbooks.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { UiHandbookEntry, UiWorkspaceStatus } from '../../../shared/api.js';
import { ComposerFooter } from './Handbook.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The dialog renders through a portal onto `document.body`, so it is not inside the host the
// tray was rendered into, and it outlives an unmounted host unless the body is swept.
afterEach(() => {
  document.body.replaceChildren();
});

/** The open dialog, wherever the portal put it. */
const panel = (): HTMLElement | null => document.body.querySelector('.modal');

const entry = (
  id: string,
  ordinal: number,
  text: string,
  source: 'told' | 'noticed' = 'told',
): UiHandbookEntry => ({ id, ordinal, text, source, at: Date.now(), removed: false });

const GIT: UiWorkspaceStatus = {
  agentId: 'mara',
  agentName: 'Mara',
  kind: 'git',
  branch: 'blobot/vlue/mara',
  present: true,
};

function footer(
  entries: readonly UiHandbookEntry[],
  options: { status?: UiWorkspaceStatus; startOpen?: boolean } = {},
): { host: HTMLElement; removed: string[]; added: number } {
  const removed: string[] = [];
  const counted = { added: 0 };
  const host = document.createElement('div');
  document.body.append(host);
  act(() => {
    createRoot(host).render(
      <ComposerFooter
        entries={entries}
        agentName="Mara"
        onRemoveEntry={(entryId) => removed.push(entryId)}
        onAddOne={() => (counted.added += 1)}
        status={options.status ?? GIT}
        teamId="team"
        busy={false}
        onSwitched={() => {}}
        onOpenChanges={() => {}}
        onPublish={async () => ({ ok: false, step: 'create', error: 'not in this test' })}
        onPlan={async () => []}
        {...(options.startOpen === true ? { startOpen: true } : {})}
      />,
    );
  });
  return { host, removed, get added() { return counted.added; } };
}

const press = (host: HTMLElement, selector: string): void => {
  act(() => {
    host.querySelector<HTMLButtonElement>(selector)?.click();
  });
};

const text = (host: HTMLElement, selector: string): string | undefined =>
  host.querySelector(selector)?.textContent ?? undefined;

describe('the door on the tray', () => {
  it('counts the entries, empty included', () => {
    // It used to be absent at zero, because the notice card above the composer carried the
    // invitation there. That card is gone — briefing is the agent's own first words now — so
    // this is the only way into a Handbook nobody has written in yet.
    expect(footer([]).host.textContent).toContain('handbook · 0');

    const { host } = footer([entry('e1', 1, 'nothing ships on a Friday')]);
    expect(host.textContent).toContain('handbook · 1');
  });

  it('opens the dialog, and closing it leaves the door there', () => {
    const { host } = footer([entry('e1', 1, 'nothing ships on a Friday')]);
    expect(panel()).toBeNull();

    press(host, '.wsdest .wsflat[aria-haspopup]');
    expect(panel()).not.toBeNull();

    // `done` and the close both go through Radix's own dismissal, so the state that opened it
    // has to come back down with it: a door that could only be pressed once would be the bug
    // this asserts against.
    act(() => {
      panel()?.querySelector<HTMLButtonElement>('.modalfoot .btn.primary')?.click();
    });
    expect(panel()).toBeNull();
    expect(host.querySelector('.wsdest .wsflat[aria-haspopup]')).not.toBeNull();
  });

  it('is drawn for an agent whose Workspace has no branch', () => {
    // A `plain` Workspace is a copy: no branch, no diff, no recovery, and the whole workspace
    // half of the tray is absent. A Handbook is per `<team>/<agent>` and has nothing to do with
    // whether git can hold the folder, so hiding it here would be one feature's absence
    // deciding another's.
    const { host } = footer([entry('e1', 1, 'nothing ships on a Friday')], {
      status: { agentId: 'mara', agentName: 'Mara', kind: 'plain', present: true },
    });

    expect(host.querySelector('.wstray')).not.toBeNull();
    expect(host.textContent).toContain('handbook · 1');
  });
});

describe('the panel', () => {
  const ENTRIES = [
    entry('e1', 1, 'the client is Vlue, a two-person agency'),
    entry('e2', 2, 'the tone in /marketing is the one they want', 'noticed'),
  ];

  it('says who wrote each entry, and the author is the source', () => {
    footer(ENTRIES, { startOpen: true });
    const rows = [...(panel()?.querySelectorAll('.hbentry .m') ?? [])].map((row) => row.textContent);

    // `told` is the user's own words and `noticed` is the agent's conclusion, which is the
    // distinction that decides what the agent may withdraw. So an entry carries no third field
    // for the author: `source` is the author.
    expect(rows[0]).toContain('you');
    expect(rows[1]).toContain('Mara');
  });

  it('folds each entry to its first line, and opens the one you asked for', () => {
    // A real Handbook is what forced this: one entry can be a paragraph of ids and campaign
    // names, and the question this list answers first is *what does my agent believe*, which is
    // a scan. What folds is the tail — the first line stays, so the list reads as a list of
    // somethings rather than a stack of chevrons.
    footer(ENTRIES, { startOpen: true });
    const rows = (): HTMLElement[] => [...(panel()?.querySelectorAll<HTMLElement>('.hbentry') ?? [])];
    expect(rows().every((row) => !row.classList.contains('open'))).toBe(true);

    act(() => {
      rows()[1]?.querySelector<HTMLButtonElement>('.hbt')?.click();
    });

    // Opening one must not shut another: the reason to open two is to compare them.
    expect(rows()[1]?.classList.contains('open')).toBe(true);
    expect(rows()[0]?.classList.contains('open')).toBe(false);
    expect(rows()[1]?.querySelector('.hbt')?.getAttribute('aria-expanded')).toBe('true');

    // The whole text is in the row either way. The fold is the stylesheet clamping it, not the
    // component withholding it, so nothing a reader needs is absent from the accessibility tree.
    expect(rows()[0]?.textContent).toContain(ENTRIES[0]?.text);
  });

  it('gives an open entry the whole row, so its byline sets no measure', () => {
    // `COMPAIGN AUDITOR · 14M` is 22 characters of mono, and beside a paragraph it was deciding
    // the width that paragraph is read at. Shut, the two share a line, which is what a one-liner
    // and its byline want. The `open` class is what the stylesheet hangs both on.
    footer(ENTRIES, { startOpen: true });
    const row = (): HTMLElement | null | undefined => panel()?.querySelector<HTMLElement>('.hbentry');
    expect(row()?.classList.contains('open')).toBe(false);

    act(() => {
      row()?.querySelector<HTMLButtonElement>('.hbt')?.click();
    });
    expect(row()?.classList.contains('open')).toBe(true);
  });

  it('offers removal and never editing', () => {
    const { removed } = footer(ENTRIES, { startOpen: true });
    const open = panel();

    // An entry you edited is neither yours nor the agent's. Removing one and saying the new
    // version is one turn and leaves an honest record.
    expect(open?.querySelectorAll('input, textarea, [contenteditable]')).toHaveLength(0);

    act(() => {
      open?.querySelector<HTMLButtonElement>('.hbentry .hbx')?.click();
    });
    expect(removed).toEqual(['e1']);
  });

  it('prices the Handbook against the bound a person can act on', () => {
    footer(ENTRIES, { startOpen: true });
    const used = ENTRIES.reduce((total, one) => total + one.text.length, 0);

    // Not a duplicate of the gauge's handbook row, though both count the same characters. The
    // gauge answers what blobot is spending; this answers how much room is left in the thing
    // being edited, standing beside the entries a person would remove.
    expect(panel()?.querySelector('.hbused')?.textContent).toContain(
      `${used} of 8,000 characters`,
    );
  });

  it('says that a change takes at the team next start', () => {
    // ADR-0002's rule, said where somebody is about to act on it. Without it a user removes an
    // entry and watches the agent go on believing it.
    footer(ENTRIES, { startOpen: true });
    expect(panel()?.querySelector('.hbnote')?.textContent).toContain(
      'when the team next starts',
    );
  });

  it('hands the composer the words rather than writing an entry itself', () => {
    const state = footer(ENTRIES, { startOpen: true });

    act(() => {
      const buttons = [...(panel()?.querySelectorAll<HTMLButtonElement>('.modalfoot .btn') ?? [])];
      buttons.find((button) => button.textContent === 'add one')?.click();
    });

    // `record_entry` stays the single path into a Handbook, which is what keeps the transcript
    // disclosure complete: a hand-written entry would be the one entry with no block behind it.
    expect(state.added).toBe(1);
    expect(state.removed).toEqual([]);
    // And it shuts, because the field it just filled is behind this dialog.
    expect(panel()).toBeNull();
  });
});
