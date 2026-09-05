import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, FileText, Pencil, SquareTerminal } from 'lucide-react';
import type { AgentStatus, ToolKind } from '@blobot/core/domain';
import type { PermissionChoice, UiAgent, UiPermissionOutcome } from '../../../shared/api.js';
import {
  compactionLine,
  continuesAgent,
  continuesSpeaker,
  failuresIn,
  filesChangedIn,
  addressedIn,
  isInFlight,
  isPending,
  isPrincipal,
  messagesIn,
  notesIn,
  rowsOf,
  toolsIn,
  type Item,
  type LiveBlock,
  type Pane,
  type Row,
} from '../model.js';
import { timeRule } from '../time.js';
import { useComposerFocus } from '../useComposerFocus.js';
import { Attached } from './Attached.js';
import { Picture } from './Picture.js';
import { Blob } from './Blob.js';
import { Markdown } from './Markdown.js';


export function Conversation({
  pane,
  agents,
  statuses,
  items,
  onAnswerPermission,
  routineArmed,
  onDisarmRoutine,
  onRemoveHandbookEntry,
  opening = false,
  chrome,
  moreAbove = false,
  onLoadEarlier,
  place,
}: {
  pane: Pane;
  agents: readonly UiAgent[];
  statuses: Record<string, AgentStatus>;
  items: readonly Item[];
  onAnswerPermission: (requestId: string, choice: PermissionChoice) => void;
  /**
   * Whether each Routine an agent scheduled for itself is still running, by routine id. The
   * block draws `disarm` only while it is, so this pane and the Routines screen cannot end up
   * saying different things about one row.
   */
  routineArmed: Record<string, boolean>;
  onDisarmRoutine: (routineId: string) => void;
  /**
   * Take an entry out of an agent's Handbook, from the block that disclosed it.
   *
   * The block carries removal rather than sending the reader to the pane's panel, because that
   * would turn a disclosure into a notification: the reason an agent may write into its own
   * persona at all is that you see it happen and can undo it here.
   */
  onRemoveHandbookEntry: (entryId: string) => void;
  /** Whether the team said anything above this window. False means this is the beginning. */
  moreAbove?: boolean;
  /** Fetch the window above. Resolves when the pane has it, which is what ends the wait. */
  onLoadEarlier?: () => Promise<void>;
  /** The window's controls, floating over the top right of the transcript. App owns them. */
  chrome?: React.ReactNode;
  /** The team is still starting. Nobody has asked these agents anything yet. */
  opening?: boolean;
  /**
   * Where the reader is, named: a team and, when they are in one, an agent. Whenever it
   * changes the column goes to the newest line and follows it again.
   *
   * The scroll container is one node for every pane, so without this a switch keeps the pixel
   * offset it had — a position measured into a transcript the reader is no longer looking at.
   */
  place?: string;
}): React.JSX.Element {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const stream = useStickToBottom(place);
  const answer = useLatest(onAnswerPermission);
  const disarm = useLatest(onDisarmRoutine);
  const removeEntry = useLatest(onRemoveHandbookEntry);
  /*
   * One pass over the items for both halves of the transcript. `rowsOf` computes the run
   * boundary over settled and unsettled work together and hands back the live half as a row of
   * its own, standing where its run stands — `.scratch/live-steps/issues/08`. It used to be a
   * second pass that took the *trailing* loose calls off the end, which is true of one agent
   * working and false the moment two are: a teammate's open call with the principal's later
   * rows after it was stranded above them as exactly the unattributed mono line the block exists
   * to abolish.
   */
  const rows = rowsOf(items, (agentId) => isInFlight(statuses[agentId] ?? 'idle'));
  const flying = useSwallowed(rows);
  const inPane = agents.filter((agent) => pane.kind === 'team' || pane.agentId === agent.id);
  /*
   * The agents that are in a turn with nothing to show for it yet — `starting` and `thinking`,
   * where the dots are the only sign the message landed. Same shape as a live row so the face
   * does not unmount and remount the instant the first call opens.
   *
   * Principals only, which is 08 in the one place `rowsOf` cannot say it: a woken teammate is
   * `thinking` too, and dots under its own face at the top level is the top-level voice this
   * ticket took away from it. Not while the team is starting either: on a cold start nobody has
   * said anything to anybody, and a face under an empty transcript claims an answer is on its way.
   */
  const addressed = addressedIn(items);
  const pending: LiveBlock[] = opening
    ? []
    : inPane
        .filter((agent) => isPrincipal(addressed, agent.id))
        .filter((agent) => !rows.some((row) => row.kind === 'live' && row.agentId === agent.id))
        .filter((agent) => isPending(statuses[agent.id] ?? 'idle', items, agent.id))
        .map((agent) => ({ agentId: agent.id, items: [] }));
  const earlier = useLoadEarlier(stream, onLoadEarlier);
  // Where the pending faces look, and null whenever the user is not in the composer.
  const composer = useComposerFocus();
  // Everything a row needs that is not the row itself. Bundled rather than spread, because a
  // block draws items of its own now -- mail, and a teammate's turn -- and would otherwise take
  // seven props to hand straight back down. It is rebuilt on every render and that is
  // deliberate: `ItemView` is the memoized thing, and it takes primitives.
  const cast: RowCast = {
    pane,
    byId,
    statuses,
    composer,
    routineArmed,
    onAnswerPermission: answer,
    onDisarmRoutine: disarm,
    onRemoveHandbookEntry: removeEntry,
  };

  // The pane's own chrome only: App owns the column, so the composer sits under this in the
  // same flex container.
  return (
    <>
      {/* The window's controls, floating over the transcript the way the composer floats under
          it. No row and no hairline.

          The row they sat in is gone, by the author, 2026-09-04, and it took its words with it.
          It had already been trimmed twice — the blobatar, the name and the status word went
          when the rail was found to be saying all three larger and to the left; `2 agents · a
          workspace each` went the same way. What was left was a path and a `role · runtime ·
          branch`, a permanent strip of text above every transcript that answered a question
          nobody was asking while reading one, and the folder and the branch are both said where
          they are actually wanted: the activity column's `WORKSPACE` block in the team pane,
          and the line under the composer in an agent's.

          Floating rather than docked, because a row that exists to hold two controls is a rule
          across the window paid for by two controls. What is left is over the ground, top right,
          out of the reading column's way. */}
      {chrome !== undefined && <div className="floatchrome">{chrome}</div>}

      {/* The column is the readable thing, not the pane: it fills the width it is given and
          stops at a measure a paragraph can be read at, centred in whatever is left. */}
      <div className="stream" ref={stream}>
        <div className="col">
          {/* The top of the window, said out loud.

              The transcript is bounded (`transcriptOfTeam`), so what the pane holds is the
              recent end of a conversation and not the whole of it. Without this the reader has
              no way to tell that from a team that started here, which is the app telling them
              something false about their own history — the same failure the activity column had
              when a switch emptied it silently.

              A control and not a scroll trigger, decided with the author 2026-08-30. Infinite
              scroll is what a chat pane usually does, and it wants a second scroll-position
              mutation inside the one ResizeObserver that already pins this column to the
              bottom; the two fight, and the pane that results is the jumpy one. A click cannot
              fire twice on a flick, and it puts the boundary on screen instead of implying it.

              It borrows `.route`'s mono label and nothing else. No chevron: a chevron promises
              the thing is already here and folded, and this is a fetch. */}
          {moreAbove && onLoadEarlier !== undefined && (
            <div className="earlier">
              <button className="route" onClick={earlier.load} disabled={earlier.loading}>
                <span className="lbl">{earlier.loading ? 'loading' : 'load earlier'}</span>
              </button>
            </div>
          )}
          <Rows rows={rows} cast={cast} flying={flying} />

          {/* Asked, and nothing to show for it yet. At the foot rather than in the rows, because
              there is no run for it to be the live half of: the prompt has landed and the agent
              has not answered a word of it. */}
          {pending.map((block) => (
            <Live
              key={block.agentId}
              block={block}
              agent={byId.get(block.agentId)}
              byId={byId}
              composer={composer}
              status={statuses[block.agentId] ?? 'idle'}
              grouped={continuesAgent(block.agentId, lastItemOf(rows.at(-1)))}
            />
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * One agent's turn while it is still one: its face, its name, and the calls in flight under it.
 *
 * `.scratch/live-steps/issues/01` and `03`. Two things were wrong with what this replaces. The
 * running call drew three dots at the end of its line and the pending bubble drew three more
 * forty pixels below it — the same glyph, the same keyframes, saying the same thing twice, which
 * is the duplicate `DESIGN.md` has already ruled against twice in this column. And the calls
 * themselves were loose lines in the shared column with nothing on them saying whose they were,
 * so two agents running at once in a team pane was an unreadable interleave.
 *
 * The face answers both. It carries the attribution the lines never had, and it takes the dots
 * back for the one case where they are the only thing there is to see — `starting` and
 * `thinking`, before the first call opens. Under a running call the dots are gone from here,
 * because the line's own are already saying it.
 *
 * **The list is not capped.** A call pushed out of a full window would still be running, and it
 * could not go into the fold above, whose whole line is a count of what *finished* — so a cap
 * buys a shorter block by making the interface claim a call ended when it did not. A batch is
 * two to five calls; the length of this list is how many are open, which is a fact worth being
 * able to read rather than a quantity to manage. `.scratch/live-steps/issues/04`.
 */
function Live({
  block,
  agent,
  byId,
  composer,
  status,
  grouped,
}: {
  block: LiveBlock;
  agent: UiAgent | undefined;
  /** For the steps that are not this agent's: a teammate's reply carries its own face. */
  byId: Map<string, UiAgent>;
  composer: Element | null;
  status: AgentStatus;
  /**
   * The row above is this same agent still talking, so the face and the name are already on
   * screen a line up. The caption an agent writes before a call is the ordinary case — it is
   * settled prose with running calls under it, which is below the fold's threshold and stays a
   * loose row — and drawn ungrouped it put the same face twice in a row with one sentence
   * between them. `continuesSpeaker`'s rule, applied to a block instead of to a message.
   */
  grouped: boolean;
}): React.JSX.Element {
  const shown = useDwell(block.items);
  return (
    <div className={grouped ? 'msg live grouped' : 'msg live'}>
      {/* The one face in the transcript that is drawn live, and the only one that may be.
          `animated` is off on a settled message because a record of *then* must not wear a pose
          or move, and because a transcript grows all day and this switches a blobatar to a dozen
          SVG nodes. Neither applies here: this is not a record of anything, it exists only while
          a turn is in flight, and there are at most as many of them as there are agents.

          So it can look at the composer while the user is in it. The block never coexists with a
          live message — `isInFlight` leaves `responding` out — so the two faces an agent could
          wear are never on screen together. */}
      {grouped ? (
        <div className="gutter" />
      ) : (
        <Blob
          name={agent?.name ?? block.agentId}
          size={28}
          status={status}
          hue={agent?.hue}
          shape={agent?.shape}
          animated
          lookAt={composer}
        />
      )}
      <div className="body">
        {!grouped && (
          <div className="hdr">
            <span className="nm">{agent?.name ?? block.agentId}</span>
          </div>
        )}
        {shown.length === 0 ? (
          <div
            className="dots"
            aria-label={`${agent?.name ?? block.agentId} is ${status}`}
          >
            <i />
            <i />
            <i />
          </div>
        ) : (
          <div className="steps">
            {shown.map((item) =>
              item.kind === 'tool' ? (
                <ToolLine key={item.id} item={item} />
              ) : (
                <Reply key={item.id} item={item as Extract<Item, { kind: 'agent' }>} byId={byId} />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The block's steps, with anything the model dropped inside {@link DWELL} held in place.
 *
 * The timer owns the removal, exactly as it does for the swallow: the model is free to be strict
 * about what is happening now, and this is the only thing standing between strictness and a line
 * that is never drawn. A step that comes back before its timer fires simply stays — it is matched
 * by id, so a call that finishes and a call that returns are the same row throughout.
 */
function useDwell(items: readonly Item[]): readonly Item[] {
  const [held, setHeld] = useState<readonly Item[]>([]);
  const [withdrawn, setWithdrawn] = useState<ReadonlySet<string>>(() => new Set());
  const previous = useRef<readonly Item[]>([]);
  const shownAt = useRef(new Map<string, number>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const timer of running) clearTimeout(timer);
    };
  }, []);

  // A reply's own clock, started the first time it is seen settled and never restarted. The model
  // goes on offering it for the rest of the run, so this is the thing that takes it away.
  useEffect(() => {
    const fresh = items.filter((item) => item.kind === 'agent' && !shownAt.current.has(item.id));
    if (fresh.length === 0) return;
    const gone = new Set(fresh.map((item) => item.id));
    timers.current.push(
      setTimeout(() => setWithdrawn((current) => new Set([...current, ...gone])), REPLY_STANDS),
    );
  }, [items]);

  useEffect(() => {
    const now = Date.now();
    for (const item of items) if (!shownAt.current.has(item.id)) shownAt.current.set(item.id, now);
    const present = new Set(items.map((item) => item.id));
    const early = previous.current.filter(
      (item) => !present.has(item.id) && now - (shownAt.current.get(item.id) ?? now) < DWELL,
    );
    previous.current = items;

    setHeld((current) => {
      const kept = current.filter(
        (item) => !present.has(item.id) && !early.some((gone) => gone.id === item.id),
      );
      if (kept.length === current.length && early.length === 0) return current;
      return [...kept, ...early];
    });
    if (early.length === 0) return;

    const wait = Math.max(
      ...early.map((item) => DWELL - (now - (shownAt.current.get(item.id) ?? now))),
    );
    const gone = new Set(early.map((item) => item.id));
    timers.current.push(
      setTimeout(() => setHeld((current) => current.filter((item) => !gone.has(item.id))), wait),
    );
  }, [items]);

  const standing = withdrawn.size === 0 ? items : items.filter((item) => !withdrawn.has(item.id));
  if (held.length === 0) return standing;
  // Back where it stood: a line that jumps to the end on its way out is a move the reader did
  // not cause, on top of the removal they also did not cause.
  return [...held, ...standing].sort((left, right) => left.at - right.at);
}

/**
 * A teammate's finished reply, standing in the live block as a step.
 *
 * `.scratch/live-steps/issues/08`, amended by the author 2026-09-05. It is at a call's altitude
 * and wears a call's register — the same row, the same muted ink, the same one-line clamp — with
 * the teammate's own face where a call has its verb, because the one thing a reader needs off it
 * at a glance is *who answered*. Clipped rather than summarised: blobot provides no inference, so
 * the line is the reply's own first words and stops where the row does. The whole of it is one
 * click away in the fold, the moment the turn ends and this block is taken.
 */
function Reply({
  item,
  byId,
}: {
  item: Extract<Item, { kind: 'agent' }>;
  byId: Map<string, UiAgent>;
}): React.JSX.Element {
  const who = byId.get(item.agentId);
  return (
    <div className="tool reply">
      <span className="v">
        <Blob name={who?.name ?? item.agentId} size={16} hue={who?.hue} shape={who?.shape} />
      </span>
      <span className="nm">{who?.name ?? item.agentId}</span>
      <span className="k">{item.text.replace(/\s+/g, " ").trim()}</span>
    </div>
  );
}

/**
 * Everything the rows need that is not a row: who is on the team, where they are being drawn,
 * and the three things a block can do about what it is disclosing.
 *
 * It exists because a fold draws more than mono lines now. A block that swallows mail and a
 * teammate's turn has to draw them as themselves, so it needs the cast the transcript has, and
 * the alternative to one bundle is seven props threaded through two components whose only
 * interest in most of them is handing them down.
 */
interface RowCast {
  pane: Pane;
  byId: Map<string, UiAgent>;
  statuses: Record<string, AgentStatus>;
  /** Where a live face looks, and null whenever the user is not in the composer. */
  composer: Element | null;
  routineArmed: Record<string, boolean>;
  onAnswerPermission: (requestId: string, choice: PermissionChoice) => void;
  onDisarmRoutine: (routineId: string) => void;
  onRemoveHandbookEntry: (entryId: string) => void;
}

/** The transcript itself: every row of it, with the time rules between them. */
function Rows({
  rows,
  cast,
  flying,
}: {
  rows: readonly Row[];
  cast: RowCast;
  /** Measured over the whole row list by the parent, which owns the effect that tracks it. */
  flying: readonly Flight[];
}): React.JSX.Element {
  return (
    <>
      {rows.map((row, index) => {
        // A fold is *inside* a turn, so what the row after it groups against is the last
        // item the fold swallowed, not the fold. Otherwise every block would reopen the
        // turn under it and one answer would wear its name three times.
        const previous = lastItemOf(rows[index - 1]);
        const rule = timeRule(row.at, previous?.at);
        // A rule reopens the turn: after "Yesterday" the reader needs the name again.
        return (
          <React.Fragment key={row.kind === 'item' ? row.item.id : row.id}>
            {rule !== undefined && <div className="timerule">{rule}</div>}
            {row.kind === 'live' ? (
              <Live
                block={row}
                agent={cast.byId.get(row.agentId)}
                byId={cast.byId}
                composer={cast.composer}
                status={cast.statuses[row.agentId] ?? 'idle'}
                grouped={rule === undefined && continuesAgent(row.agentId, previous)}
              />
            ) : row.kind === 'steps' ? (
              <Steps
                row={row}
                cast={cast}
                flying={flying.filter((flight) => flight.rowId === row.id).map((flight) => flight.item)}
              />
            ) : row.kind === 'pictures' ? (
              // Every Picture one agent showed in a turn, side by side. Only ever more than one:
              // a single Picture keeps the column, because half a column buys no scroll and
              // costs the detail it exists to carry.
              <div className="msg pictrow">
                <div className="gutter" />
                <div className="body">
                  {cast.pane.kind === 'team' && (
                    <div className="hdr">
                      <span className="nm">{cast.byId.get(row.agentId)?.name}</span>
                    </div>
                  )}
                  <div className="picts">
                    {row.items.map((item) => (
                      <Picture key={item.id} item={item as Extract<Item, { kind: 'picture' }>} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <ItemView
                item={row.item}
                grouped={rule === undefined && continuesSpeaker(row.item, previous)}
                teamPane={cast.pane.kind === 'team'}
                onAnswerPermission={cast.onAnswerPermission}
                onDisarmRoutine={cast.onDisarmRoutine}
                onRemoveHandbookEntry={cast.onRemoveHandbookEntry}
                {...castOf(row.item, cast.pane, cast.byId, cast.statuses, cast.routineArmed)}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

/**
 * What one item needs from the roster and the pane, resolved by the parent into plain values.
 *
 * An item is drawn by its own speaker, not by the cast list: handing `ItemView` the roster map
 * and the status record made every message in the transcript re-render whenever any of it
 * changed, which for a `Record` rebuilt on every status action is constantly. Names, hues and
 * roles are strings and numbers, so `React.memo`'s shallow comparison settles them without
 * anyone having to remember to memoize a map upstream.
 */
interface Cast {
  /** The voice: the agent speaking, or the sender of a peer message. */
  fromName?: string | undefined;
  fromHue?: number | undefined;
  fromShape?: string | undefined;
  /** The addressed agent: who a message from you went to, or who a peer wrote to. */
  toName?: string | undefined;
  toHue?: number | undefined;
  toShape?: string | undefined;
  /** This pane is the recipient of a peer message, so it reads as mail rather than as a copy. */
  received?: boolean | undefined;
  /**
   * The speaker's status, and only while this message is the one being written. A settled
   * message is a record of something already said, so a blobatar beside it that bobs along with
   * whatever its agent is doing now is twenty things fidgeting at one piece of news, which is
   * the fidget `DESIGN.md` reserves the team mark's single animation to avoid.
   */
  status?: AgentStatus | undefined;
  /**
   * Whether the Routine an agent scheduled is still running. A **boolean** rather than the map
   * it comes from, and deliberately: `ItemView` is memoized, and a fresh object handed to every
   * row on every delta would re-render the whole history for the sake of one live message. That
   * cost has a test.
   */
  armed?: boolean | undefined;
}

function castOf(
  item: Item,
  pane: Pane,
  byId: Map<string, UiAgent>,
  statuses: Record<string, AgentStatus>,
  routineArmed: Record<string, boolean>,
): Cast {
  switch (item.kind) {
    // Nothing. The bubble says what you typed and the transcript says who answered, and between
    // those two the caption had nothing left to add.
    //
    // It was already suppressed twice over — on a team of one, and on a prompt to the lead —
    // which was the shape of the argument arriving in instalments: a `to Alice` under words that
    // begin `@Alice` is the address said twice, once by the user and once back at them in mono.
    // Removed by the author, 2026-09-04, at the same time as the fold learned to swallow a
    // teammate's turn, and the two go together: what the tag was really guarding against is the
    // reader losing track of whose reply is whose in a team pane, and folding the turns nobody
    // addressed answers that where it happens rather than by labelling every prompt in the
    // history.
    case 'user':
      return {};
    case 'agent': {
      const agent = byId.get(item.agentId);
      return {
        fromName: agent?.name ?? item.agentId,
        fromHue: agent?.hue,
        fromShape: agent?.shape,
        ...(item.live ? { status: statuses[item.agentId] ?? 'idle' } : {}),
      };
    }
    case 'peer': {
      const from = byId.get(item.fromId);
      const to = byId.get(item.toId);
      const received = pane.kind === 'agent' && pane.agentId === item.toId;
      return {
        fromName: from?.name ?? item.fromId,
        fromHue: from?.hue,
        fromShape: from?.shape,
        toName: to?.name ?? item.toId,
        toHue: to?.hue,
        toShape: to?.shape,
        received,
      };
    }
    case 'permission':
      return { fromName: byId.get(item.agentId)?.name ?? item.agentId };
    // A claim about one agent, which the team pane has to attribute or it reads as the team
    // having done it. Plus whether it is still running, resolved here so the row itself takes a
    // boolean and stays memoizable.
    case 'routine':
      return {
        fromName: pane.kind === 'team' ? byId.get(item.agentId)?.name : undefined,
        armed: routineArmed[item.routineId] ?? false,
      };
    // A Picture is one agent's, so the team pane has to say whose. Same rule again.
    case 'picture':
    case 'system':
    // Same rule for a compaction, which is a system line that opens: in an agent's pane the
    // agent is the pane, and in the team pane the line has to say whose session it was.
    case 'compaction':
    // And for a Handbook write, which is the same shape again and names whose Handbook it was.
    case 'handbook':
      // No fallback to the id: an unrecognised agent leaves the line unattributed rather than
      // prefixing it with a row id nobody can read.
      return { fromName: pane.kind === 'team' ? byId.get(item.agentId)?.name : undefined };
    case 'tool':
      return {};
  }
}

/** The item a row ends on, which is what the next row groups and times itself against. */
function lastItemOf(row: Row | undefined): Item | undefined {
  if (row === undefined) return undefined;
  return row.kind === 'item' ? row.item : row.items.at(-1);
}

/**
 * A run of settled work, shut.
 *
 * Shut is the default and the point. Flat, a turn of a dozen captions and a dozen calls buries
 * the answer it was all leading to, and the reader scrolls past the one paragraph they wanted.
 * `rowsOf` has already guaranteed there is nothing live in here, so nothing is being hidden
 * that anybody is waiting on.
 *
 * **It holds the back and forth too**, by the author, 2026-09-04. You ask Alice, Alice mails a
 * teammate, the teammate answers *Alice* -- and the team pane drew that answer in your own column
 * at your own altitude, usually as the longest thing on screen and the least addressed to anybody
 * in the room. It shipped that morning as a second fold of its own, `aside`, and became this one
 * the same day: what the reader wants demoted is everything the turn had to arrange, and
 * splitting that by whether blobot classed a line as a call or as a message is a distinction the
 * reader never asked about. The far end is named on the shut line, with its face, because a fold
 * that swallows somebody else's turn has to say whose.
 *
 * The header counts calls, not seconds. A duration would be a claim about effort blobot cannot
 * make honestly across a permission wait, and the count is the thing a reader wants before
 * deciding whether to open it. It counts the captions too, as `notes`, and the mail and the
 * teammate's turn as `messages` -- which is the word's ordinary meaning and not a new one. The
 * old rule that a message never folds was true while a block could hold one voice; a teammate's
 * reply to your agent folds now, because it was never addressed to you. The message count is
 * drawn only when it is the whole label: beside `ran 6 tools` and three faces, `17 messages with`
 * is the same fact a third time, and the number is the half of it nobody acts on.
 *
 * No ticks. The pattern this borrows from puts a checkmark on every finished step, and ticket
 * 08 exists because a cancelled call reports `completed` with `exit: null` — a tick beside one
 * is the mock's whole point, asserted louder and wrong. A line that finished cleanly says
 * nothing, a line that did not says what happened.
 *
 * It borrows `.route`'s chevron and mono label outright rather than inventing a second
 * disclosure. It borrows the dashed edge only for what is somebody else's: mail and a teammate's
 * turn keep their own voices inside the fold, because dashed-against-solid is the contrast that
 * says *refusable, lower authority* and it is not this block's to flatten.
 */
/**
 * How many steps may be in the air at once, and how long the flight lasts.
 *
 * Two, because that is the whole of the claim: one line arriving under the fold while the one
 * before it is still leaving. A third would be a queue, and a queue on this path is a slot
 * machine -- a run of fast calls would have the reader watching a column of text scroll rather
 * than reading the line that is live. Past two the oldest is dropped, which is the same answer
 * `.stack` gives four faces on one label.
 */
export const IN_THE_AIR = 2;
/**
 * Kept equal to the `filed` keyframe's duration in the stylesheet, deliberately in two places.
 * The timer owns the removal and the animation is cosmetic, so the two cannot drift: shorter
 * and the collapse is cut off mid-shut, longer and a finished, empty box holds the column open.
 */
export const FLIGHT = 260;
/**
 * The shortest a live step may be on screen, however briefly the model held it.
 *
 * The author, 2026-09-05: *"it's not that is visible for a short time, the thing it's never
 * visible, i think each live step should have a min screen time, for example 300ms"* — and the
 * diagnosis is better than the rule it corrects. A teammate's reply leaves the block when the
 * principal's current batch does, and a batch is usually one call opened *after* the reply
 * landed, so the reply's natural life on screen was not short, it was **zero**.
 *
 * Bounding it by time rather than by widening the rule is the honest split. Whether a step is
 * still what is happening now is a question about the turn; whether the reader got to see that
 * it happened at all is a question about the screen, and answering the first with the second is
 * how the block ends up holding stale work again. So the model stays strict and the render holds
 * anything it drops too early, in place, for the rest of this.
 *
 * The author's own number. It is a floor on *noticing* and not on reading — a clipped reply is
 * not readable in 300ms and is not meant to be, since the whole of it is in the fold the moment
 * the turn ends. It sits above `FLIGHT`, which matters: a step must not be born and taken away
 * inside one swallow.
 */
export const DWELL = 800;
/**
 * How long a teammate's reply stands in the live block before it is withdrawn into the fold.
 *
 * A call's time on screen is its own: it is there while it is open and while its batch stands,
 * and {@link DWELL} is only a floor under that. A reply has no such life — it has already
 * happened — so something has to say when it stops being news, and two attempts to say it in the
 * model failed. The measurement is on `liveRunIn`: an agent message takes its `at` from its first
 * delta, so a reply is inserted into the transcript at the moment it *began* and settles behind
 * work the principal has since done. It is new and it is positionally old, so nothing about where
 * it sits can date it.
 *
 * What can is the transition the renderer watches — a live message becoming a settled one — and
 * the clock starts there. Eight seconds is long enough to read a clipped line and short enough
 * that a turn with three replies in it is not three lines of history stacked over the work in
 * progress. The whole of it is in the fold the moment the turn ends, so nothing is lost when it
 * goes.
 */
export const REPLY_STANDS = 8_000;

/** A step caught mid-file, and the fold that is taking it. */
interface Flight {
  readonly rowId: string;
  readonly item: Item;
}

/**
 * The steps a fold has just swallowed, held for one flight so the swallow can be seen.
 *
 * A completed call moves out of its own row and into a `steps` row the moment a second one
 * lands, because {@link rowsOf} regroups on every delta and `WORTH_FOLDING` is 2. That is a real
 * transition in the data and it has always been drawn as a cut: the line the reader was looking
 * at is replaced between two frames by a count one higher. This is that cut, made travellable.
 * The line is not deleted, it is *filed*, and the fold header above it is where it goes -- so
 * the motion states a fact the interface was already asserting, which is the only kind
 * `DESIGN.md` admits. Miss it and the count still says everything.
 *
 * **It lives here rather than in `Steps`, and it has to.** The obvious place is the fold itself,
 * diffing its own `items` and ghosting what is new. It was written that way and it drew nothing,
 * because the ordinary swallow is the one that *creates* the fold: below the threshold there is
 * no `steps` row at all, so the component seeing the arrival is mounting for the first time and
 * has no previous set to diff against. The signal is only legible one level up, where the same
 * pass can see a row stop being loose and an item start being folded.
 *
 * That diff is also what keeps settled data still. A ghost is drawn for exactly one shape: an
 * item that was a top-level tool row on the previous render and is inside a fold on this one.
 * A restored transcript, a team switch and `load earlier` all arrive with their calls already
 * folded and never loose, so they mount perfectly still -- which is `DESIGN.md`'s *nothing that
 * moves what the user is reading*, kept rather than argued around.
 *
 * The timer is the authority and the animation is cosmetic, for the reason the entrance rules
 * already give: a window that is not painting can starve a keyframe for seconds, and a ghost
 * whose removal hung on `animationend` would sit on top of live text until it got a frame.
 */
function useSwallowed(rows: readonly Row[]): readonly Flight[] {
  const loose = useRef<Map<string, Item> | undefined>(undefined);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [flying, setFlying] = useState<readonly Flight[]>([]);

  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const timer of running) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const before = loose.current;
    const now = new Map<string, Item>();
    for (const row of rows) {
      // Everything drawn outside a fold, which is what a fold can be seen taking: a loose line,
      // and a call standing in a live block. Both travel into the same place when they settle.
      if (row.kind === 'item' && row.item.kind === 'tool') now.set(row.item.id, row.item);
      if (row.kind === 'live') {
        for (const item of row.items) if (item.kind === 'tool') now.set(item.id, item);
      }
    }
    loose.current = now;
    if (before === undefined) return;

    const taken: Flight[] = [];
    for (const row of rows) {
      if (row.kind !== 'steps') continue;
      for (const item of row.items) {
        // Loose a moment ago, folded now. Drawn in the state it was last seen in, which is the
        // completed one: the reader watched it finish and then watched it go.
        const was = before.get(item.id);
        if (was !== undefined && !now.has(item.id)) taken.push({ rowId: row.id, item: was });
      }
    }
    if (taken.length === 0) return;

    const gone = new Set(taken.map((flight) => flight.item.id));
    setFlying((air) => [...air, ...taken].slice(-IN_THE_AIR));
    timers.current.push(
      setTimeout(() => setFlying((air) => air.filter((flight) => !gone.has(flight.item.id))), FLIGHT),
    );
  }, [rows]);

  return flying;
}

function Steps({
  row,
  cast,
  flying,
}: {
  row: Extract<Row, { kind: 'steps' }>;
  cast: RowCast;
  /** What this fold has just taken, on its way in. Empty for every settled fold on screen. */
  flying: readonly Item[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const teamPane = cast.pane.kind === 'team';
  const calls = toolsIn(row.items);
  const failed = failuresIn(row.items);
  const notes = notesIn(row.items, row.agentId);
  const messages = messagesIn(row.items, row.agentId);
  const touched = filesChangedIn(row.items);
  const partners = row.partnerIds.map((id) => ({ id, agent: cast.byId.get(id) }));

  return (
    <div className="ran">
      <button className="route" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronDown size={12} className={open ? '' : 'shut'} aria-hidden />
        <span className="lbl">
          {/* A run with no calls in it is here because a teammate took a turn, so the count that
              leads is the one that is not zero. `ran 0 tools · 2 messages` would be leading with
              the thing that did not happen. */}
          {calls > 0 && (
            <>
              ran {calls} {calls === 1 ? 'tool' : 'tools'}
              {/* One qualifier, and the caption count is the one that loses every tie. Failure
                  takes the slot whenever there is one; a teammate's turn takes it next, because
                  somebody else having spoken in here outranks how many sentences the principal
                  wrote. Two qualifiers on a ten-pixel label is a sentence nobody reads, and
                  `ran 2 tools · 2 notes · 3 messages with Bob` is three. */}
              {failed > 0
                ? ` · ${failed} failed`
                : messages === 0 && notes > 0 && ` · ${notes} ${notes === 1 ? 'note' : 'notes'}`}
            </>
          )}
          {/* The count of messages is drawn only when there is nothing else in the label, because
              the faces beside it already say the turn had mail in it. `17 messages with` in front
              of three blobatars is the same fact twice, and the number is the half a reader can
              do nothing with. */}
          {calls === 0 && messages > 0 && `${messages} ${messages === 1 ? 'message' : 'messages'}`}
        </span>
        {/* Whose turn got swallowed, said on the line that swallowed it. Past two they overlap
            into one stack and drop their names: four names on a ten-pixel label is a sentence
            nobody reads, and the faces are the part that identifies anybody at a glance. */}
        {messages > 0 &&
          (partners.length > 2 ? (
            <span className="stack">
              {partners.map(({ id, agent }) => (
                <Blob key={id} name={agent?.name ?? id} size={20} hue={agent?.hue} shape={agent?.shape} />
              ))}
            </span>
          ) : (
            partners.map(({ id, agent }) => (
              <React.Fragment key={id}>
                <Blob name={agent?.name ?? id} size={20} hue={agent?.hue} shape={agent?.shape} />
                <span className="nm">{agent?.name ?? id}</span>
              </React.Fragment>
            ))
          ))}
      </button>
      {/* What the run touched, at the altitude where nothing else answers it. Shut only: opened,
          every one of these numbers is on the call that made it, next to which call that was.
          Filenames, for the same reason: shut is the glance and open is the record. */}
      {!open && touched.length > 0 && (
        <div className="touched">
          {touched.map((file) => (
            <span className="file" key={file.path}>
              <span className="p">{file.name}</span>
              <span className="diff">
                <span className="add">+{file.added}</span>
                <span className="del">&minus;{file.removed}</span>
              </span>
            </span>
          ))}
        </div>
      )}
      {/* On its way in, under the header rather than over it, because that is where the line was
          standing when it was taken. One shutting box per line rather than one holding all of
          them: two calls swallowed in the same frame were standing as two rows and each closes
          on its own, which is also what keeps a second swallow arriving mid-flight from
          restarting the first one's collapse. */}
      {flying.map((item) => (
        <div className="went" aria-hidden key={item.id}>
          <div>
            <ToolLine item={item as Extract<Item, { kind: 'tool' }>} />
          </div>
        </div>
      ))}
      {open && (
        <div className="did">
          {row.items.map((item) => {
            // The principal's own captions, unattributed on purpose: the block is its turn, and a
            // name on every line of a turn already labelled is the repetition `grouped` exists to
            // avoid.
            if (item.kind === 'agent' && item.agentId === row.agentId)
              return (
                <div className="said" key={item.id}>
                  {item.text}
                </div>
              );
            if (item.kind === 'tool' || item.kind === 'permission')
              return <ToolLine key={item.id} item={item} />;
            // Mail, and a teammate's own turn. Drawn as themselves rather than as another
            // caption: inside a block that is Alice's turn, an unattributed paragraph is read as
            // Alice's, and this one is not hers.
            return (
              <ItemView
                key={item.id}
                item={item}
                grouped={false}
                teamPane={teamPane}
                onAnswerPermission={cast.onAnswerPermission}
                onDisarmRoutine={cast.onDisarmRoutine}
                onRemoveHandbookEntry={cast.onRemoveHandbookEntry}
                {...castOf(item, cast.pane, cast.byId, cast.statuses, cast.routineArmed)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * One call: what it was, what it was to, and what happened only when what happened is worth a
 * word.
 *
 * The kind comes from the four core already carries off both runtimes, and is drawn as a glyph.
 * The renderer used to drop the kind entirely and print the title alone, so a fold would have
 * been thirty shell strings in a stack with nothing to scan down. It is a fixed column, empty
 * for `other`, because a ragged left edge is the reason a list of calls stops being a list.
 *
 * Nothing prints for an ordinary completion. That is silence, not a success claim: `failed` is
 * a status and `exit: null` is a cancelled call wearing `completed`, and both of those speak.
 */
function ToolLine({ item }: { item: Extract<Item, { kind: 'tool' | 'permission' }> }): React.JSX.Element {
  const said = item.kind === 'permission' ? outcomeWord(item.outcome) : toolSaid(item);
  const changed = item.kind === 'permission' ? undefined : item.changed;
  const kind = item.kind === 'permission' ? undefined : item.toolKind;
  const Glyph = kind === undefined ? undefined : GLYPH[kind];
  // Only a call that is still running arrives, which is the whole of the gate: every other
  // `.tool` on screen is settled data, and settled data does not move. A restored transcript
  // mounts dozens of these and must sit perfectly still while it does.
  const running = item.kind === 'tool' && item.status === 'running';
  return (
    <div className={running ? 'tool now' : 'tool'}>
      {/* The glyph took the verb's column, 2026-08-31, and did not join it: an icon beside the
          word it denotes is the same claim twice in the narrowest place in the app, which is
          what took WORKING out from beside the dots. The column itself is untouched and is the
          whole reason this is a swap rather than the mockup's per-row label — a fixed slot is
          what keeps every target starting at the same x. The word survives as the label, so a
          reader not reading shapes loses nothing. */}
      <span className="v">
        {Glyph !== undefined && kind !== undefined && (
          <Glyph size={13} role="img" aria-label={VERB[kind]} />
        )}
      </span>
      <span className="k">{item.title}</span>
      {/* The app's one saturated thing that is not a blobatar, by the author, 2026-08-30. Two
          small signed numbers whose sign already carries the meaning, so the colour reinforces
          a fact that is legible without it. A zero on either side is drawn, because `+12 −0` is
          a different edit from `+12 −8` and silence there would read as the second. */}
      {changed !== undefined && (
        <span className="diff">
          <span className="add">+{changed.added}</span>
          <span className="del">&minus;{changed.removed}</span>
        </span>
      )}
      {said !== undefined && <span>{said}</span>}
      {/* In flight. The word `running` was the only thing on this line that changed while the
          call ran, and a word does not change: it sat there static under a three-dot pending
          bubble that was the only moving thing on the screen. So the fact is carried by the
          status channel's own device instead, the three dots `.stat` wears while a turn is in
          flight, rather than a spinner, which would be a second in-flight vocabulary for
          the same fact. It sits where the word sat, at the end, and not in the verb column:
          `read`, `edit` and `run` are a fixed left column, and losing the verb for the duration
          of the call is exactly the ragged edge that column exists to prevent. */}
      {item.kind === 'tool' && item.status === 'running' && (
        <span className="inflight dots" role="status" aria-label="running">
          <i />
          <i />
          <i />
        </span>
      )}
    </div>
  );
}

/** blobot's own four words for a call. Drawn as the glyph's label rather than as text. */
const VERB: Record<ToolKind, string> = {
  read: 'read',
  edit: 'edit',
  execute: 'run',
  // An MCP tool is whatever its server called it, and a verb blobot invented for it would be a
  // guess printed in the same column as three facts.
  other: '',
};

/**
 * The same four kinds as shapes. Lucide at 13px and `--muted`, which is the icons rule.
 *
 * `other` has none, and the slot is held empty rather than filled with something meaning
 * "unknown". It is the same argument the blank verb was already making: an MCP tool's name
 * belongs to its server, and a glyph is a paraphrase with even less room to hedge than a word.
 * Empty is legible in its own right — it is the one row in a fold that blobot has no word for.
 */
const GLYPH: Record<ToolKind, React.ComponentType<{ size?: number; role?: string; 'aria-label'?: string }> | undefined> = {
  read: FileText,
  edit: Pencil,
  execute: SquareTerminal,
  other: undefined,
};

function toolSaid(item: Extract<Item, { kind: 'tool' }>): string | undefined {
  if (item.exit === null) return 'exit null';
  if (item.status === 'failed') return 'failed';
  // Not a failure and not a success. The process that owned the call went away before it
  // reported, so the one true thing to say is that blobot never found out.
  if (item.status === 'unfinished') return 'unfinished';
  return undefined;
}

/**
 * What you said, and only that.
 *
 * It used to read "you allowed this, and it stops asking" on every call the rule covered — a
 * sentence about a standing rule, stamped once per use of it, three times in one turn in the
 * screenshot that prompted this. Where the rule goes is said in the block that asks, which is
 * the moment it is a decision. Here it is a record.
 */
function outcomeWord(outcome: UiPermissionOutcome | undefined): string | undefined {
  switch (outcome) {
    case 'allowed':
      return 'allowed once';
    case 'allowed_always':
      return 'allowed always';
    case 'rejected':
      return 'rejected';
    case 'cancelled':
      return 'nobody answered, so it was cancelled';
    default:
      return undefined;
  }
}

/**
 * Memoized, because `applyEvent` hands the pane a new `items` array on every streamed token and
 * an unmemoized child means every message in the history re-renders, and re-parses its markdown,
 * to show one more word at the bottom. The cost of a token was the length of the transcript.
 *
 * The items are immutable values with stable ids, so reference equality on the item is the
 * comparison this wants, and everything else is narrowed to a primitive above.
 */
const ItemView = React.memo(function ItemView({
  item,
  grouped,
  teamPane,
  onAnswerPermission,
  fromName,
  fromHue,
  fromShape,
  toName,
  toHue,
  toShape,
  received = false,
  status,
  armed = false,
  onDisarmRoutine,
  onRemoveHandbookEntry,
}: {
  item: Item;
  grouped: boolean;
  teamPane: boolean;
  onAnswerPermission: (requestId: string, choice: PermissionChoice) => void;
  onDisarmRoutine: (routineId: string) => void;
  onRemoveHandbookEntry: (entryId: string) => void;
} & Cast): React.JSX.Element | null {
  switch (item.kind) {
    // From you: a solid bubble on the right. There is only ever one "you", so the side is an
    // unambiguous label no matter how many agents share the pane — which is why this survives
    // where Grok's two-sided layout would not. It carries no name for the same reason.
    case 'user':
      return (
        <div className="msg user">
          {/* Inside the bubble and above the words, which is the order they were put together
              in: here is the thing, and here is what I am asking about it. The same order the
              prompt goes to the runtime in. */}
          {item.attachments !== undefined && item.attachments.length > 0 && (
            <div className="attached">
              {item.attachments.map((attachment) => (
                <Attached key={attachment.id} attachment={attachment} />
              ))}
            </div>
          )}
          <div className="bubble">{item.text}</div>
        </div>
      );

    // From the agent: no container at all. It is the pane's default voice, and boxing it would
    // make the agent look like a guest in its own transcript — and would put a solid enclosure
    // in the same column as the dashed peer, which is the contrast doing all the work below.
    case 'agent':
      return (
        <div className={grouped ? 'msg grouped' : 'msg'}>
          {grouped ? (
            // Holds the gutter so a continued turn stays on the same left edge as its header.
            <div className="gutter" />
          ) : (
            <Blob
              name={fromName ?? ''}
              size={28}
              status={status}
              hue={fromHue}
              shape={fromShape}
            />
          )}
          <div className="body">
            {!grouped && (
              <div className="hdr">
                <span className="nm">{fromName}</span>
                {item.live && <span className="tag">typing</span>}
              </div>
            )}
            <Markdown text={item.text} live={item.live} />
          </div>
        </div>
      );

    // From a peer: a dashed rule down the left, inset, and one line saying where it came from.
    // Never a bubble, and never filled — dashed against the user's solid bubble reads as lower
    // authority before a word is parsed, which is the visual form of "a peer message is
    // refusable, not authoritative". It was a full dashed box on a raised ground, then one edge
    // and eight folded lines; it is now the line alone until it is asked for.
    //
    // A received one carried `a teammate's request, not an instruction from you` under it, and
    // does not any more (the author, 2026-09-04). The sentence is still true and is still said
    // where it binds: the envelope says it to the agent, which is the only reader whose
    // behaviour it changes. On screen it was a standing caption under every inbound peer
    // message, and the contrast the dashed edge exists to draw was already making the claim.
    case 'peer':
      return (
        <div className="peer">
          <PeerNote
            received={received}
            name={(received ? fromName : toName) ?? ''}
            hue={received ? fromHue : toHue}
            shape={received ? fromShape : toShape}
          >
            {item.context !== undefined && <div className="ctx">{item.context}</div>}
            <Markdown text={item.text} />
          </PeerNote>
        </div>
      );

    case 'tool':
      // Asked about but not started: the permission block below it is this call's line.
      if (item.status === 'asking') return null;
      // A settled call reaching here rather than a fold is one `rowsOf` found alone, which is
      // the case a fold costs more than it saves. Same line either way.
      return <ToolLine item={item} />;

    /*
     * Ticket 14's permission block: the agent has stopped, and it will stay stopped until this
     * is answered.
     *
     * Inline in the transcript rather than in a modal, because two agents can be waiting at
     * once and a modal serialises them into whichever arrived first. It sits where the tool
     * line would have sat, and it is the same shape a moment later: answered, it collapses to
     * one mono line saying what was asked and what you said.
     *
     * Neither button is armed. `.btn.primary` is the app's other inversion and it means "this
     * is the thing to do here"; blobot has no opinion about whether an agent should run this,
     * which is the entire reason it is asking.
     */
    case 'permission':
      if (item.outcome !== undefined) return <ToolLine item={item} />;
      return (
        <Permission item={item} fromName={fromName} onAnswerPermission={onAnswerPermission} />
      );

    // A structural event, in the timeline rather than in the activity column — it is part of
    // what happened here, and a column the reader may not be watching is not where the reason
    // an answer stopped belongs. Named in the team pane, where several agents share the stream.
    case 'system':
      return (
        <div className="sysline">
          <span>{fromName === undefined ? item.text : `${fromName} · ${item.text}`}</span>
        </div>
      );

    // A Picture, at the agent's own altitude in the agent's own column, because it is one of the
    // things the agent said. In the team pane the name goes with it for the same reason every
    // other per-agent line carries one. It does not animate.
    case 'picture':
      // A Picture that could not be shown is one mono line and nothing else, so it takes no
      // gutter and no header: the name is in the sentence, where the only thing there is to
      // say has to fit.
      return item.notDrawn !== undefined ? (
        <Picture item={item} fromName={fromName} />
      ) : (
        <div className="msg pictrow">
          <div className="gutter" />
          <div className="body">
            {fromName !== undefined && (
              <div className="hdr">
                <span className="nm">{fromName}</span>
              </div>
            )}
            <Picture item={item} />
          </div>
        </div>
      );

    // blobot chose a moment. It draws in the system voice because it is structural rather than
    // said, and it is the one system line that opens: on a handoff the note the agent wrote is
    // underneath it. Nothing here offers `/compact` or advises anything — that is ticket 05's
    // rule, which this ticket freed the *trigger* from and not the gauge.
    case 'compaction':
      return <Compaction item={item} fromName={fromName} />;

    // An agent wrote into its own persona, and this is what pays for that being allowed.
    case 'handbook':
      return (
        <HandbookWrite item={item} fromName={fromName} onRemove={onRemoveHandbookEntry} />
      );

    // An agent put itself on a schedule, and it is already running.
    //
    // Issue 05's 2026-08-30 amendment reversed *only a person may arm one*, and this block is
    // what pays for it: **the user is told, where it happened.** blobot has never interrupted
    // the user and does not start here — the block sits in the turn, in the transcript, at the
    // moment it was created. What it refuses is to let an agent arm something off screen.
    //
    // It carries `disarm` and nothing else. There is no `keep`, because keeping it is what
    // happens if you do nothing, and a button for the status quo would read as a question the
    // agent was asking. It was not asking.
    case 'routine':
      return (
        <div className="card scheduled">
          {/* Sans, because it is a sentence. It was 10px mono and lowercase, which is neither of
              the two things mono is for here: it is not a value or a literal, and it is not an
              uppercase signage label. The same argument that took `.sysline` off mono. */}
          <div className="said">
            {fromName === undefined ? 'A routine was scheduled' : `${fromName} scheduled a routine`}
          </div>
          <div className="what">
            <b>{item.name}</b>
            {/* The shape and what the shape costs, because an agent choosing `every hour` chose
                twenty-four times what `every day` costs and the person reading this is the one
                who can undo it. A count, never a price. Mono here and not above: this pair is
                two values, which is the case mono exists for. */}
            <span className="mono muted">
              {item.schedule} · {item.frequency}
            </span>
          </div>
          <div className="acts">
            {armed ? (
              <button className="btn" onClick={() => onDisarmRoutine(item.routineId)}>
                disarm
              </button>
            ) : (
              // Answered, and it says so rather than the block disappearing: the transcript is a
              // record of what happened here, and a block that vanished would take the fact that
              // an agent scheduled anything with it.
              <span className="mono muted">disarmed</span>
            )}
          </div>
        </div>
      );
  }
});

/**
 * Ticket 14's permission block: the agent has stopped, and it will stay stopped until this is
 * answered.
 *
 * A **card** — raised ground, one hairline, 14px radius — rather than the ink edge it wore until
 * now. The edge was `.refusal`'s on the argument that this is the same kind of event, and the
 * argument held for a refusal, which is one sentence. This is four things: a claim, a literal of
 * unbounded length, a reason, and three answers. An edge does not contain four things; it just
 * runs down the side of them, and the block read as loose transcript rather than as one object
 * that has stopped. DESIGN.md carries the amendment.
 *
 * What the card does *not* borrow from every other permission dialog on earth: an armed button.
 * `.btn.primary` is the app's other inversion and it means "this is the thing to do here";
 * blobot has no opinion about whether an agent should run this, which is the entire reason it is
 * asking. All three answers are the same weight, and the colour stays on the blobatars.
 *
 * The *always* sentence is behind the transcript's own disclosure rather than on the face of the
 * block. It is three of the four lines the block used to open with, all of them about the
 * rarest of the three answers, and the paragraph out-massed both the command and the buttons.
 * DESIGN.md's rule that the block says where an always goes is kept: it says it, one click away,
 * on the control that is about to write the rule.
 */
function Permission({
  item,
  fromName,
  onAnswerPermission,
}: {
  item: Extract<Item, { kind: 'permission' }>;
  fromName: string | undefined;
  onAnswerPermission: (requestId: string, choice: PermissionChoice) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="card perm">
      {/* The sentence and the literal are two lines, not one. A command is quoted from somewhere
          else and can be any length: run inline through the sentence, a long one wraps three
          times and the only thing on the block the user has to actually read is the hardest
          thing on it to find. It scrolls rather than wraps, for the reason a path does. */}
      <div className="ask">
        <b>{fromName}</b> wants to run
      </div>
      <div className="cmd mono">{item.title}</div>
      {/* Nothing else on the face of the card. What was here was four lines of prose, identical
          on every request forever, and it was the largest thing on a block whose whole content
          is one command and three answers: read once, noise every time after. Both sentences are
          behind the disclosure, which is where a thing you need on your first permission request
          and never again belongs. */}
      {open && (
        <div className="always">
          blobot did not vouch for this one, so the runtime is asking and the agent waits until
          you answer. What it vouches for is what this agent is set to, in its own definition.
          Allow always writes a rule into this agent&apos;s own .claude/settings.local.json and
          stops asking for this one thing. It is a file in this agent&apos;s own copy of the
          folder, so you can read it and delete it, and it says nothing about any other agent.
        </div>
      )}
      <div className="acts">
        <button className="route" aria-expanded={open} onClick={() => setOpen(!open)}>
          <ChevronDown size={12} className={open ? '' : 'shut'} aria-hidden />
          <span className="lbl">why you are asked</span>
        </button>
        <div className="btns">
          <button
            className="btn"
            disabled={!item.canAllow}
            onClick={() => onAnswerPermission(item.id, 'allow')}
          >
            allow once
          </button>
          <button
            className="btn"
            disabled={!item.canAllowAlways}
            onClick={() => onAnswerPermission(item.id, 'allow_always')}
          >
            allow always
          </button>
          <button className="btn" onClick={() => onAnswerPermission(item.id, 'reject')}>
            reject
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * An agent wrote to its own Handbook, or was refused because it is full.
 *
 * `Compaction`'s shape rather than a card, and that comment is the argument, about this exactly:
 * *"this is a thing that happened, not a thing to read, until the reader asks why their agent
 * stopped remembering yesterday. Then it is the whole answer."* An entry recorded is a thing
 * that happened. A card would put several sentences of an agent's notes into the middle of a
 * conversation every time it learns something, which is how the disclosure that makes
 * agent-written entries safe becomes the noise that makes the conversation unreadable.
 *
 * One line for the call, not one per entry: `record_entry` takes a list, so the turn produced
 * one act and it draws as one line whether it recorded one thing or four.
 *
 * The line stays after a removal, and says the same words. A transcript is a record of what
 * happened and is never rewritten, which is the same reason a Routine that was later disarmed
 * still shows the turn that armed it.
 */
function HandbookWrite({
  item,
  fromName,
  onRemove,
}: {
  item: Extract<Item, { kind: 'handbook' }>;
  fromName: string | undefined;
  onRemove: (entryId: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  // The one refusal in the app that leaves the room. Every other one in `bounds.ts` is the
  // agent's own to fix; this one's remedy is a person removing an entry, and the agent will hit
  // the same wall on every turn until somebody does. It opens nothing: there is nothing to show.
  if (item.write === 'full') {
    const said = 'handbook is full, nothing was recorded';
    return (
      <div className="sysline">
        <span>{fromName === undefined ? said : `${fromName} · ${said}`}</span>
      </div>
    );
  }
  const line = wroteDown(item.entries.length, item.withdrew.length);
  const said = fromName === undefined ? line : `${fromName} · ${line}`;
  return (
    <div className="hbwrite">
      <button className="route" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronDown size={12} className={open ? '' : 'shut'} aria-hidden />
        <span className="lbl">{said}</span>
      </button>
      {open && (
        <div className="note">
          {item.entries.map((entry) => (
            <div className="hbentry" key={entry.id}>
              {/* The number is what the agent names to correct this later, and what the persona
                  draws it under, so it is the same value in both places and therefore mono. */}
              <span className="mono muted">{entry.ordinal}</span>
              <span className="said">{entry.text}</span>
              {entry.removed ? (
                // Gone, and it says so rather than the row disappearing: what the turn did is
                // not undone by what happened afterwards.
                <span className="mono muted">removed</span>
              ) : (
                <button className="btn" onClick={() => onRemove(entry.id)}>
                  remove
                </button>
              )}
            </div>
          ))}
          {/* A correction is one act, so what it withdrew is on the same block rather than in a
              second line: *that one is wrong, this is right.* No control beside it, because it
              is already gone. */}
          {item.withdrew.map((entry) => (
            <div className="hbentry gone" key={entry.id}>
              <span className="mono muted">{entry.ordinal}</span>
              <span className="said">{entry.text}</span>
              <span className="mono muted">withdrawn</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * `wrote down 3 things`, and `wrote down 1 thing, replacing 1` when the call was a correction.
 *
 * Plain words and a count. The reader is deciding whether to open it, and *what* was written is
 * the thing behind the click.
 */
function wroteDown(entries: number, withdrew: number): string {
  const wrote = `wrote down ${entries} ${entries === 1 ? 'thing' : 'things'}`;
  return withdrew === 0 ? wrote : `${wrote}, replacing ${withdrew}`;
}

/**
 * A session blobot replaced, or kept, with the agent's own note under it.
 *
 * The disclosure is `.route`'s again rather than a third gesture, and it is shut by default for
 * the reason `Steps` is: this is a thing that happened, not a thing to read, until the reader
 * asks why their agent stopped remembering yesterday. Then it is the whole answer.
 *
 * The path is drawn under the note rather than in the line. It is where the file was archived,
 * outside every AgentWorkspace, and it is a fact for somebody who wants the file, not part of
 * the sentence about what happened.
 */
function Compaction({
  item,
  fromName,
}: {
  item: Extract<Item, { kind: 'compaction' }>;
  fromName: string | undefined;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const line = compactionLine(
    item.how,
    item.used,
    item.ceiling,
    item.measured,
    item.reason,
    item.personaRefreshed,
  );
  const said = fromName === undefined ? line : `${fromName} · ${line}`;
  if (item.handoff === undefined) {
    return (
      <div className="sysline">
        <span>{said}</span>
      </div>
    );
  }
  return (
    <div className="handoff">
      <button className="route" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronDown size={12} className={open ? '' : 'shut'} aria-hidden />
        <span className="lbl">{said}</span>
      </button>
      {open && (
        <div className="note">
          <div className="said">{item.handoff}</div>
          {item.handoffPath !== undefined && <div className="where">{item.handoffPath}</div>}
        </div>
      )}
    </div>
  );
}

/**
 * The transcript follows the newest line, and stops following the moment the reader scrolls
 * away from the bottom — an agent streaming for a minute must not yank a reader out of the
 * paragraph they went back to read.
 */
/**
 * Load the window above without moving what the reader is looking at.
 *
 * Prepending content above the viewport pushes everything down by exactly the height of what
 * arrived, and `useStickToBottom` only knows about the bottom — so left alone, a reader who
 * reaches the top and asks for more is thrown to a random place in their own history, which is
 * the one thing the ticket said would be got wrong.
 *
 * The fix is to hold the distance from the *bottom* rather than the scroll position. `scrollTop`
 * is measured from the top and every prepended pixel invalidates it; `scrollHeight - scrollTop`
 * is measured from the end of the column, and prepending does not move the end. Restore it in a
 * layout effect, before the browser paints, or the jump is visible on the way to being fixed.
 *
 * Markdown lays out a frame late, which would defeat a one-shot restore, so the anchor is held
 * across the observer's next callbacks too: it is released on the first frame in which the
 * column's height has stopped changing. `pinned` is false throughout — the reader is at the top,
 * a long way from the bottom — so this cannot race the stick-to-bottom path.
 */
function useLoadEarlier(
  stream: React.RefObject<HTMLDivElement | null>,
  onLoadEarlier: (() => Promise<void>) | undefined,
): { load: () => void; loading: boolean } {
  const [loading, setLoading] = useState(false);
  const anchor = useRef<number | undefined>(undefined);

  useEffect(() => {
    const node = stream.current;
    const content = node?.firstElementChild;
    if (node === null || content === null || content === undefined) return;
    let last = -1;
    const hold = new ResizeObserver(() => {
      const held = anchor.current;
      if (held === undefined) return;
      node.scrollTop = node.scrollHeight - held;
      // Released only once the column has settled: a late-laying-out code block would otherwise
      // move the page after the anchor had been dropped.
      if (node.scrollHeight === last) anchor.current = undefined;
      last = node.scrollHeight;
    });
    hold.observe(content);
    return () => hold.disconnect();
  }, [stream]);

  const load = useCallback(() => {
    const node = stream.current;
    if (node === null || onLoadEarlier === undefined) return;
    // The distance from the bottom, captured before anything arrives.
    anchor.current = node.scrollHeight - node.scrollTop;
    setLoading(true);
    void onLoadEarlier().finally(() => setLoading(false));
  }, [stream, onLoadEarlier]);

  return { load, loading };
}

function useStickToBottom(place: string | undefined): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  /**
   * Arriving somewhere lands on the newest line, and starts following it again.
   *
   * Both halves matter. The offset is the obvious one: this container is shared by every pane,
   * so a reader who had scrolled up in one used to arrive somewhere arbitrary in the next — or
   * at its end, if the new transcript is the shorter of the two, which is the same wrong answer
   * reached by accident. The pin is the quiet one: `pinned` is a fact about a reader in a
   * transcript, and it must not follow them out of it, or an agent whose pane you have just
   * opened streams off the bottom of the screen because you were reading history somewhere
   * else. Re-pinning rather than scrolling once is also what makes this survive markdown: the
   * column lays out over the next few frames, and the observer below keeps the end in view for
   * all of them.
   *
   * A layout effect, before the browser paints, so the arrival is never a visible jump. Not
   * smooth: a pane is a different place, and animating between two transcripts would say they
   * are one column the reader travelled along.
   */
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null || place === undefined) return;
    pinned.current = true;
    node.scrollTop = node.scrollHeight;
  }, [place]);

  useEffect(() => {
    const node = ref.current;
    const content = node?.firstElementChild;
    if (node === null || content === null || content === undefined) return;

    const onScroll = (): void => {
      pinned.current = node.scrollHeight - node.scrollTop - node.clientHeight < 40;
    };
    node.addEventListener('scroll', onScroll, { passive: true });

    // The column's height, not the item list, is what has to be watched. A delta is not the
    // only thing that makes the transcript taller: markdown lays out after it is handed the
    // text, a code block is highlighted a frame later, and an expanded peer message grows by
    // hundreds of pixels on a click. Keying on the items missed all three, which is why a long
    // answer would stream off the bottom of the screen and stay there.
    const follow = new ResizeObserver(() => {
      if (pinned.current) node.scrollTop = node.scrollHeight;
    });
    follow.observe(content);

    return () => {
      node.removeEventListener('scroll', onScroll);
      follow.disconnect();
    };
  }, []);

  return ref;
}

/**
 * A peer message: one line saying where it came from, and nothing else until it is asked for.
 *
 * Only the peer voice is hidden like this. A message from you is yours and short; an agent's
 * answer is the thing the pane exists to show, and putting it behind a click would be hiding
 * the work. A peer message is neither: it is one agent's mail to another, usually the whole of
 * a previous turn quoted back, and it is the loudest thing in a transcript that is not about
 * it.
 *
 * No peek, where there used to be eight lines and a `more` toggle. A peek is a claim that the
 * first eight lines are the part worth reading, which for a quoted turn is rarely true, and
 * eight lines of somebody else's mail still outweighed the reply beside it. The line is the
 * item now; the message is what opens.
 *
 * One blobatar, the far end's. The route header drew both, but this end of it is the pane the
 * message is already sitting in, so the second face said what the column header says.
 */
function PeerNote({
  received,
  name,
  hue,
  shape,
  children,
}: {
  received: boolean;
  name: string;
  hue?: number | undefined;
  shape?: string | undefined;
  children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="route" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronDown size={12} className={open ? '' : 'shut'} aria-hidden />
        <span className="lbl">{received ? 'message received from' : 'message sent to'}</span>
        <Blob name={name} size={20} hue={hue} shape={shape} />
        <span className="nm">{name}</span>
      </button>
      {open && <div className="note">{children}</div>}
    </>
  );
}

/**
 * A callback with a stable identity, reading whatever the latest render gave it.
 *
 * The memoized item above compares its props by identity, and a handler written inline at the
 * call site is a new function on every render, which would defeat the memo for the entire
 * transcript. Holding it here rather than asking `App` for a `useCallback` keeps that a property
 * of this pane instead of an obligation on whoever renders it next.
 */
function useLatest<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  const held = useRef(fn);
  held.current = fn;
  return useCallback((...args: A) => held.current(...args), []);
}
