import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronDown, X } from 'lucide-react';
import { HANDBOOK_LIMIT } from '@blobot/core/domain';
import type { UiHandbookEntry } from '../../../shared/api.js';
import { lastActive } from '../time.js';
import { WorkspaceLine } from './Workspaces.js';

/**
 * What an Agent knows about **this team's** work, in the agent's own pane.
 *
 * It lives here and not on *your agents* because a Handbook is held at `<team>/<agent>` — the
 * same identity the AgentWorkspace branch is named for. *Your agents* is the AgentProfile
 * screen, and a Handbook drawn there would re-break the boundary ADR-0001 and ADR-0002 drew.
 *
 * Two shapes, and which one you get is a fact about the agent rather than a preference:
 * **unbriefed** draws a notice card above the composer carrying the invitation, and **briefed**
 * draws a door on the tray with the panel behind it. They are never both present. See
 * `.scratch/handbooks/issues/06`.
 */

/**
 * The tray under an agent's composer, and the Handbook that hangs off it.
 *
 * One component rather than two siblings in `App` because the door and the panel share one piece
 * of state and the door has to be **inside** the tray: the tray's own rule, in `Workspaces.tsx`,
 * is that everything on it is a live number or a door and nothing on it is a description. A
 * Handbook is prose, so it cannot sit on the tray, and the only thing that can is a door to it.
 *
 * What is **behind** the door is a dialog, which is ticket 06's 2026-08-31 amendment and the
 * author's own correction from a real Handbook. That ticket put the panel under the composer, in
 * the tray's shape, and it was drawn against a two-entry mock. A real one is prose: two entries
 * from one live audit ran to 774 characters and took two thirds of the pane, and the bound is
 * 8,000. A body with no ceiling cannot live in the composer's footing.
 *
 * A dialog and not a screen over the surface, which is where *your agents* went: that is a
 * **place**, reached from the rail and about every AgentProfile the user has. This is one agent's
 * Handbook, reached from that agent's own tray, and what you do in it changes what the agent
 * believes at the team's next start. It is a decision, so it takes the shape the app gives
 * decisions, and it gets `.modal`'s height ceiling and internal scroll with it.
 */
export function ComposerFooter({
  entries,
  agentName,
  onRemoveEntry,
  onAddOne,
  startOpen = false,
  ...workspace
}: {
  entries: readonly UiHandbookEntry[];
  agentName: string;
  onRemoveEntry: (entryId: string) => void;
  /** Hands the composer the words. `add one` is not a text field: see {@link Panel}. */
  onAddOne: () => void;
  /**
   * `--screen=handbook`, and only that. The panel is behind a click and a screenshot cannot
   * click, which is the same hole `--pane` and `--screen=agents` were cut for.
   */
  startOpen?: boolean;
} & React.ComponentProps<typeof WorkspaceLine>): React.JSX.Element {
  const [open, setOpen] = useState(startOpen);
  return (
    <>
      <WorkspaceLine
        {...workspace}
        door={
          // Absent while the Handbook is empty. The notice card above the composer is carrying
          // the invitation then, and the tray's rule is against a door to an empty room.
          entries.length === 0 ? undefined : (
            <button
              type="button"
              className={`wsflat${open ? ' on' : ''}`}
              // `aria-haspopup` and not `aria-expanded`/`aria-controls`: what opens is a dialog
              // in a portal, announced by its own role, and not a region this button contains.
              aria-haspopup="dialog"
              onClick={() => setOpen(!open)}
            >
              handbook · {entries.length}
            </button>
          )
        }
      />
      {open && entries.length > 0 && (
        <Panel
          entries={entries}
          agentName={agentName}
          onRemoveEntry={onRemoveEntry}
          onAddOne={onAddOne}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * The entries, and the room left for more of them.
 *
 * **Removal only, never editing.** An entry you edited is neither yours nor the agent's, and
 * `source` exists precisely so ticket 10 can tell those apart: an agent may withdraw what it
 * worked out and may never touch what it was told. Removing one and saying the new version is
 * one turn and leaves an honest record.
 */
function Panel({
  entries,
  agentName,
  onRemoveEntry,
  onAddOne,
  onClose,
}: {
  entries: readonly UiHandbookEntry[];
  agentName: string;
  onRemoveEntry: (entryId: string) => void;
  onAddOne: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const used = entries.reduce((total, entry) => total + entry.text.length, 0);
  return (
    <Dialog.Root open onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        {/* Not `.roomy`. That variant exists for the agent form, which is eight fields wanting
            two or three to a row; entries are paragraphs, and a paragraph set to 760px is a
            paragraph nobody reads to the end of. `.modal` already caps its height and scrolls
            inside itself, which is the whole reason this stopped being a panel. */}
        <Dialog.Content className="modal" aria-describedby={undefined}>
          <header className="modalhead">
            <div>
              <div className="eyebrow mono">HANDBOOK</div>
              {/* The agent's name, because a Handbook is held at `<team>/<agent>` and the one
                  thing a reader must not lose here is whose beliefs these are. */}
              <Dialog.Title className="display sm">{agentName}</Dialog.Title>
            </div>
            <Dialog.Close className="iconbtn" aria-label="Close">
              <X size={17} aria-hidden />
            </Dialog.Close>
          </header>
          {/* ADR-0002's rule, said where somebody is about to act on it. A persona is a
              `session/new` parameter on every adapter blobot has, so an edit takes when the team
              next starts. Without this a user removes an entry and watches the agent go on
              believing it. */}
          <div className="prose">
            <p className="hbnote">
              What {agentName} has been told about this team's work. It does not follow them to
              their other teams. Changes here reach them when the team next starts.
            </p>
          </div>
          <div className="hbentries">
            {entries.map((entry) => (
              <Entry
                key={entry.id}
                entry={entry}
                agentName={agentName}
                onRemove={() => onRemoveEntry(entry.id)}
              />
            ))}
          </div>
          <div className="modalfoot">
            {/* Not a duplicate of the gauge's handbook row, though both count the same
                characters. The gauge answers *what is blobot is spending on this turn*; this
                answers *how much room is left in the thing I am editing*, standing beside the
                entries a person would remove. `bounds.ts` made the full-Handbook refusal the one
                whose fix belongs to somebody who is not in the room. This is that room. */}
            <span className="hbused">
              {used.toLocaleString('en-US')} of {HANDBOOK_LIMIT.toLocaleString('en-US')} characters
            </span>
            {/* Not a text field, and that is the decision rather than the shortcut.
                `record_entry` stays the single path into a Handbook, which is what keeps the
                transcript disclosure complete: a hand-written entry would be the one entry with
                no block behind it. So this hands the composer the words and the agent records
                what you say next — and it closes, because the field it fills is behind this. */}
            <Dialog.Close className="btn" onClick={onAddOne}>
              add one
            </Dialog.Close>
            <Dialog.Close className="btn primary">done</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * One entry: a line, and the rest of it on a click.
 *
 * **Folded, because a Handbook is a list before it is a document.** Full text on every row was
 * the first version and a real one broke it: two entries from one live account audit, one of
 * them a paragraph of ids and campaign names, filled the dialog on their own. The question this
 * list answers first is *what does my agent believe*, which is a scan, and a scan cannot happen
 * over three paragraphs. What is folded is the tail, never the row: the first line stays, so the
 * list still reads as a list of somethings rather than a stack of chevrons.
 *
 * It is `.route`'s chevron, which is this app's fold gesture, and by the rule the transcript
 * wrote for it: *a chevron promises the thing is already here and folded*. That is true here and
 * false of `load earlier`, which is why that one has none.
 *
 * The **text** is the button and the row is not, because the row also carries removal and a
 * button inside a button is not a thing. Each row keeps its own state: opening one must not shut
 * another, since the reason to open two is to compare them.
 */
function Entry({
  entry,
  agentName,
  onRemove,
}: {
  entry: UiHandbookEntry;
  agentName: string;
  onRemove: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className={`hbentry${open ? ' open' : ''}`}>
      <button
        type="button"
        className="hbt"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronDown size={12} className={open ? '' : 'shut'} aria-hidden />
        <span className="t">{entry.text}</span>
      </button>
      {/* Author and age, and that is the whole of an entry's metadata. The author is `source`
          rather than a third field: `told` is the user's own words and `noticed` is the agent's
          conclusion, which is the distinction that decides what the agent may withdraw. */}
      <span className="m">
        {entry.source === 'told' ? 'you' : agentName} · {lastActive(entry.at)}
      </span>
      <button
        type="button"
        className="hbx"
        onClick={onRemove}
        title={`Remove entry ${entry.ordinal}`}
        aria-label={`Remove entry ${entry.ordinal}`}
      >
        ×
      </button>
    </div>
  );
}

/**
 * An agent nobody has told anything, above its composer.
 *
 * It **persists** while the Handbook is empty, because it states a fact about the agent rather
 * than announcing an event: an agent given one task on Monday is not an agent somebody decided
 * never to brief. There is no dismiss, which would invent a third state — unbriefed and hidden —
 * that nothing could then draw.
 *
 * No icon. The reference this came from leads with a blue check; blobot has no blue, and every
 * icon at rest is `--muted`, so a muted glyph in that slot would have to mean something. The
 * card's presence is already the signal, and not yet briefed is the ordinary condition of a new
 * hire rather than a kind of thing.
 */
export function HandbookNotice({
  agentName,
  teamName,
  busy,
  onBrief,
}: {
  agentName: string;
  teamName: string;
  /** Mid-turn. The invitation is a turn, and two at once is a queue nobody asked for. */
  busy: boolean;
  onBrief: () => void;
}): React.JSX.Element {
  return (
    <div className="hbnotice">
      <div className="hbnbody">
        <div className="hbnt">{agentName} has not been briefed</div>
        <div className="hbnd">
          {agentName} knows nothing about this team's work yet. What you say here stays with{' '}
          {teamName}.
        </div>
      </div>
      <div className="hbnact">
        <button type="button" className="hbnbtn" disabled={busy} onClick={onBrief}>
          brief them
        </button>
      </div>
    </div>
  );
}
