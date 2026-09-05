import { useEffect, useState } from 'react';
import { pictureNotDrawnBecause } from '@blobot/core/domain';
import type { Item } from '../model.js';

type PictureItem = Extract<Item, { kind: 'picture' }>;

/**
 * A Picture an agent showed the user, or the fact that there was one and it is not here.
 *
 * `.scratch/agent-media/08`: **the picture, then one mono line, and nothing else.** No chip, no
 * announcement, no title. A chip is right for a thing you are being reminded you sent and wrong
 * for a thing you are being shown.
 *
 * **It is drawn in colour**, which is the second time DESIGN.md's governing rule yields and the
 * yield is written narrowly again: the content is a photograph of the user's own app, taken
 * inside a checkout of the user's own repository, so it is not a signal blobot is emitting. The
 * functional half settles it on its own -- the question is *how does my app look*, and a grey
 * screenshot of a UI does not answer it. An **observed** Picture is in colour too, on a rule
 * rather than a shrug: colour must not carry provenance, when the two frames already carry the
 * difference in words. It stops at the picture's edge.
 *
 * The line under it says only what blobot measured, and only what the reader cannot already see:
 * *if the reader can see it in the picture, blobot does not say it.* So no dimensions, no byte
 * size, no kind, and no `1 picture`.
 */
export function Picture({
  item,
  fromName,
}: {
  item: PictureItem;
  /** The agent, in the team pane where several share the column. Undefined in its own pane. */
  fromName?: string | undefined;
}): React.JSX.Element {
  if (item.notDrawn !== undefined) return <NotDrawn item={item} fromName={fromName} />;
  return <Drawn item={item} />;
}

function Drawn({ item }: { item: PictureItem }): React.JSX.Element {
  const url = usePictureUrl(item.pictureId);
  const [open, setOpen] = useState(false);
  const caption = captionOf(item);
  // On the document, not on the overlay: a `keydown` handler on a div only fires while that div
  // holds focus, and this one opens under the pointer rather than under the keyboard.
  useEffect(() => {
    if (!open) return;
    const close = (keys: KeyboardEvent): void => {
      if (keys.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open]);
  return (
    <div className="pict">
      {url === undefined ? (
        <span className="shim" aria-hidden />
      ) : (
        <img
          src={url}
          alt={caption ?? 'a picture'}
          onClick={() => setOpen(true)}
          // Scaled to fit and never cropped: a crop is the same defect as a resize, a wrong
          // answer with no visible cause. Full size is one click away because a column-width
          // draw of a 1280 wide screenshot cannot be read for detail, and detail is what the
          // reader is judging.
        />
      )}
      {caption !== undefined && <div className="pline">{caption}</div>}
      {open && url !== undefined && (
        <div className="pfull" onClick={() => setOpen(false)} role="presentation">
          <img src={url} alt={caption ?? 'a picture'} />
        </div>
      )}
    </div>
  );
}

/**
 * The one case in this feature that is text alone, and the exception the author's rule implies
 * rather than one against it: blobot does not caption what the reader can see, and here there is
 * nothing to see.
 *
 * It **counts** rather than repeating. An agent in a screenshot loop would otherwise draw a
 * column of identical apologies, which is the duplicate this column has already refused twice.
 * No apology, no control, no retry: the bytes are gone or were never blobot's, and a *try again*
 * that re-runs a turn is a spend nobody asked for.
 */
function NotDrawn({
  item,
  fromName,
}: {
  item: PictureItem;
  fromName?: string | undefined;
}): React.JSX.Element {
  const count = item.count ?? 1;
  // The name is in the sentence here rather than in a header above it, because there is no
  // picture for a header to introduce -- and it is left out in the agent's own pane, where the
  // pane is the agent, which is the same rule every other per-agent line in this column follows.
  const who = fromName === undefined ? '' : ` from ${fromName}`;
  const what = count === 1 ? `a picture${who}` : `${count} pictures${who}`;
  return (
    <div className="pnone">
      {what} · not drawn · {pictureNotDrawnBecause(item.notDrawn ?? 'not_kept')}
    </div>
  );
}

/**
 * The frame, and the two sources deliberately do not draw the same.
 *
 * A **shown** Picture is a file blobot opened, so it can say the file's own name and the fact
 * that decides the map: whether it was written during this turn or was already there. That is
 * what turns a screenshot of a stale build from an unfalsifiable claim into a weighable one, with
 * no inference anywhere.
 *
 * An **observed** one has **no line at all**, by the author against the first live run, and it is
 * this ticket's own test applied one step further than the ticket applied it. `from Read File` is
 * not provenance: it is the runtime's prose title for a call whose fold is already on screen
 * directly above the picture, so the line was repeating something visible rather than adding a
 * defeater. What blobot actually knows about an observed Picture is a tool name and an arrival
 * time -- `annotations` are stripped by every bridge measured, so `lastModified`, the protocol's
 * own answer to the age question, is gone -- and none of that weighs the claim.
 *
 * The two frames still never draw the same, which is the rule that mattered: one carries a
 * sentence and the other carries none, which is a wider gap than the one this replaced.
 */
function captionOf(item: PictureItem): string | undefined {
  if (item.source !== 'shown') return undefined;
  const age = item.writtenThisTurn === true ? ' · written during this turn' : '';
  return `${item.name ?? 'a picture'}${age}`;
}

/** The bytes for one Picture, once. The snapshot carries the record and never the picture. */
function usePictureUrl(pictureId: string | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (pictureId === undefined) return;
    let live = true;
    void window.blobot.pictureUrl(pictureId).then((found) => {
      if (live) setUrl(found);
    });
    return () => {
      live = false;
    };
  }, [pictureId]);
  return url;
}
