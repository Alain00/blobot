import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AgentStatus, ToolKind } from '@blobot/core/domain';
import type { PermissionChoice, UiAgent, UiPermissionOutcome } from '../../../shared/api.js';
import {
  compactionLine,
  continuesSpeaker,
  failuresIn,
  isPending,
  rowsOf,
  toolsIn,
  type Item,
  type Pane,
  type Row,
} from '../model.js';
import { timeRule } from '../time.js';
import { useComposerFocus } from '../useComposerFocus.js';
import { Attached } from './Attached.js';
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
  opening = false,
  workspacePath,
  chrome,
  moreAbove = false,
  onLoadEarlier,
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
  /** Whether the team said anything above this window. False means this is the beginning. */
  moreAbove?: boolean;
  /** Fetch the window above. Resolves when the pane has it, which is what ends the wait. */
  onLoadEarlier?: () => Promise<void>;
  /** Where the team's agents branch from. Only the team pane says it; an agent says its own. */
  workspacePath?: string;
  /** The window's controls, rendered at the end of this row. App owns them; this row is
      the only chrome above the transcript, so it is where they live. */
  chrome?: React.ReactNode;
  /** The team is still starting. Nobody has asked these agents anything yet. */
  opening?: boolean;
}): React.JSX.Element {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const focused = pane.kind === 'agent' ? byId.get(pane.agentId) : undefined;
  const stream = useStickToBottom();
  const answer = useLatest(onAnswerPermission);
  const disarm = useLatest(onDisarmRoutine);
  const rows = rowsOf(items);
  const earlier = useLoadEarlier(stream, onLoadEarlier);
  // Where the pending faces look, and null whenever the user is not in the composer.
  const composer = useComposerFocus();

  // The pane's own chrome only: App owns the column, so the composer sits under this in the
  // same flex container.
  return (
    <>
      {/* One hairline row, and only what is nowhere else.

          It carried a blobatar, the agent's name in bold, its role, and its status word. The
          rail row for this pane sits a few pixels to the left carrying every one of those: the
          same face, selected and larger than this one was, the same name, the role until the
          agent has spoken, and the same `StatusWord`. A header that repeats the thing you
          selected with is a second, weaker copy of the rail outranking the rail.

          What is left is the facts the rail does not carry — the role, the runtime and where
          this agent is working — in the register they deserve, which is mono and muted. The
          pane says which pane it is by being open.

          Ticket 14's posture line was here too, and is not any more, by the author, 2026-08-30:
          a permanent indicator repeating the same sentence over every pane all day is a
          sentence nobody reads by the second day. The creation flow's disclosure is where it is
          said, once, before any agent exists.

          The blobatar rule the rest of the app now follows: a face appears where you are
          identifying among agents or choosing one, and never where a single agent is merely
          named.

          It is also the only chrome above the transcript now, by the author, 2026-08-30. A
          strip across the top of the window said the team's name and its path, and the rail
          row for that team was already saying the name a few pixels to the left — the same
          second-copy the header itself had been trimmed for. The path survives here, because
          nothing else on screen carries it, and the controls that strip held (the turn pips
          and the activity toggle) come with it, at the end of this row. */}
      <div className="convhead">
        {/* The words are blobot's and the path is git's, so only the path is mono. */}
        <span className="where">
          {focused === undefined ? (
            <>
              {`${agents.length} agents · a workspace each`}
              {workspacePath !== undefined && (
                <>
                  {' · '}
                  <span className="mono">{workspacePath}</span>
                </>
              )}
            </>
          ) : (
            // The runtime appears exactly once, as a label. The UI never branches on it.
            <>
              {`${focused.role} · ${focused.runtimeLabel} · `}
              <span className="mono">{focused.branch ?? focused.workspacePath}</span>
            </>
          )}
        </span>
        {chrome !== undefined && <span className="chrome">{chrome}</span>}
      </div>

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
          {rows.map((row, index) => {
            // A fold is *inside* a turn, so what the row after it groups against is the last
            // item the fold swallowed, not the fold. Otherwise every block would reopen the
            // turn under it and one answer would wear its name three times.
            const previous = lastItemOf(rows[index - 1]);
            const rule = timeRule(row.at, previous?.at);
            // A rule reopens the turn: after "Yesterday" the reader needs the name again.
            return (
              <React.Fragment key={row.kind === 'steps' ? row.id : row.item.id}>
                {rule !== undefined && <div className="timerule">{rule}</div>}
                {row.kind === 'steps' ? (
                  <Steps row={row} teamPane={pane.kind === 'team'} />
                ) : (
                  <ItemView
                    item={row.item}
                    grouped={rule === undefined && continuesSpeaker(row.item, previous)}
                    teamPane={pane.kind === 'team'}
                    onAnswerPermission={answer}
                    onDisarmRoutine={disarm}
                    {...castOf(row.item, pane, byId, statuses, routineArmed)}
                  />
                )}
              </React.Fragment>
            );
          })}

          {/* Whoever is about to speak, under the last thing said. In the team pane that can be
              two agents at once, which is the claim the demo makes. */}
          {/* Not while the team is starting. `starting` is a pending status because an agent
              whose runtime is still coming up has usually just been sent something and the dots
              are the only sign of it — but on a cold start nobody has said anything to anybody,
              and three dots under an empty transcript claim an answer is on its way. The rail
              and the header carry the state there. */}
          {(opening ? [] : agents)
            .filter((agent) => pane.kind === 'team' || pane.agentId === agent.id)
            .filter((agent) => isPending(statuses[agent.id] ?? 'idle', items, agent.id))
            .map((agent) => (
              <div className="msg pending" key={agent.id}>
                {/* The one face in the transcript that is drawn live, and the only one that may
                    be. `animated` is off in here because a settled message must not wear a pose
                    or move — both would be a claim about *now* on a record of *then* — and
                    because a transcript grows all day and this switches a blobatar to a dozen
                    SVG nodes. Neither applies to this block: it is not a record of anything, it
                    exists only while a turn is in flight, and there are at most as many of them
                    as there are agents on the team.

                    So it can look at the composer while the user is in it. `isPending` excludes
                    `waiting` and `failed`, which is why this never argues with the rule that
                    gives `waiting` the pointer: the two faces are never the same face. */}
                <Blob
                  name={agent.name}
                  size={28}
                  status={statuses[agent.id] ?? 'idle'}
                  hue={agent.hue}
                  animated
                  lookAt={composer}
                />
                <div className="body">
                  <div className="hdr">
                    <span className="nm">{agent.name}</span>
                  </div>
                  {/* Three dots rather than the status word: the word is already on this agent
                      in the header and the rail, and what is missing here is the reassurance
                      that the message landed, which is a shape, not a reading task. */}
                  <div className="dots" aria-label={`${agent.name} is ${statuses[agent.id] ?? 'idle'}`}>
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
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
  /** The addressed agent: who a message from you went to, or who a peer wrote to. */
  toName?: string | undefined;
  toHue?: number | undefined;
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
    case 'user':
      // Everybody it went to, in the order they were addressed. One name is the ordinary case.
      //
      // Nothing at all on a team of one. The tag's rule is "only where a message could have gone
      // somewhere else", and on a one-agent team the team pane has exactly the same single
      // recipient the agent pane does — so `to Alice` under every message the user sends is a
      // caption restating the only fact on screen that was never in question.
      if (byId.size < 2) return {};
      return { toName: item.agentIds.map((id) => byId.get(id)?.name ?? id).join(', ') };
    case 'agent': {
      const agent = byId.get(item.agentId);
      return {
        fromName: agent?.name ?? item.agentId,
        fromHue: agent?.hue,
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
        toName: to?.name ?? item.toId,
        toHue: to?.hue,
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
    case 'system':
    // Same rule for a compaction, which is a system line that opens: in an agent's pane the
    // agent is the pane, and in the team pane the line has to say whose session it was.
    case 'compaction':
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
  return row.kind === 'steps' ? row.items.at(-1) : row.item;
}

/**
 * A run of settled work, shut.
 *
 * Shut is the default and the point. Flat, a turn of a dozen captions and a dozen calls buries
 * the answer it was all leading to, and the reader scrolls past the one paragraph they wanted.
 * `rowsOf` has already guaranteed there is nothing live in here, so nothing is being hidden
 * that anybody is waiting on.
 *
 * The header counts calls, not seconds. A duration would be a claim about effort blobot cannot
 * make honestly across a permission wait, and the count is the thing a reader wants before
 * deciding whether to open it.
 *
 * No ticks. The pattern this borrows from puts a checkmark on every finished step, and ticket
 * 08 exists because a cancelled call reports `completed` with `exit: null` — a tick beside one
 * is the mock's whole point, asserted louder and wrong. A line that finished cleanly says
 * nothing, a line that did not says what happened.
 *
 * It borrows `.route`'s chevron and mono label outright rather than inventing a second
 * disclosure, but not the dashed edge: dashed is the peer voice saying "refusable, lower
 * authority", and this is the agent's own work in its own turn.
 */
function Steps({ row, teamPane }: { row: Extract<Row, { kind: 'steps' }>; teamPane: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const calls = toolsIn(row.items);
  const failed = failuresIn(row.items);

  return (
    <div className="ran">
      <button className="route" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronDown size={12} className={open ? '' : 'shut'} aria-hidden />
        <span className="lbl">
          ran {calls} {calls === 1 ? 'tool' : 'tools'}
          {failed > 0 && ` · ${failed} failed`}
        </span>
      </button>
      {open && (
        <div className="did">
          {row.items.map((item) => {
            // `rowsOf` admits three kinds and no others; the guard is here so the narrowing is
            // the compiler's rather than a comment's.
            if (item.kind === 'agent')
              return (
                <div className="said" key={item.id}>
                  {item.text}
                </div>
              );
            if (item.kind === 'tool' || item.kind === 'permission')
              return <ToolLine key={item.id} item={item} />;
            return null;
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
 * The verb comes from the four kinds core already carries off both runtimes. The renderer used
 * to drop them and print the title alone, so a fold would have been thirty shell strings in a
 * stack with nothing to scan down. It is a fixed column, blank for `other`, because a ragged
 * left edge is the reason a list of calls stops being a list.
 *
 * Nothing prints for an ordinary completion. That is silence, not a success claim: `failed` is
 * a status and `exit: null` is a cancelled call wearing `completed`, and both of those speak.
 */
function ToolLine({ item }: { item: Extract<Item, { kind: 'tool' | 'permission' }> }): React.JSX.Element {
  const said = item.kind === 'permission' ? outcomeWord(item.outcome) : toolSaid(item);
  const changed = item.kind === 'permission' ? undefined : item.changed;
  return (
    <div className="tool">
      <span className="v">{item.kind === 'permission' ? '' : VERB[item.toolKind]}</span>
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

/** blobot's own four words for a call, in the register the rest of the mono labels use. */
const VERB: Record<ToolKind, string> = {
  read: 'read',
  edit: 'edit',
  execute: 'run',
  // An MCP tool is whatever its server called it, and a verb blobot invented for it would be a
  // guess printed in the same column as three facts.
  other: '',
};

function toolSaid(item: Extract<Item, { kind: 'tool' }>): string | undefined {
  if (item.exit === null) return 'exit null';
  if (item.status === 'failed') return 'failed';
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
  toName,
  toHue,
  received = false,
  status,
  armed = false,
  onDisarmRoutine,
}: {
  item: Item;
  grouped: boolean;
  teamPane: boolean;
  onAnswerPermission: (requestId: string, choice: PermissionChoice) => void;
  onDisarmRoutine: (routineId: string) => void;
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
          {/* Only where a message could have gone somewhere else. In an agent's pane the
              recipient is the pane. */}
          {teamPane && toName !== undefined && <div className="tag">to {toName}</div>}
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
            <Blob name={fromName ?? ''} size={28} status={status} hue={fromHue} />
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
    case 'peer':
      return (
        <div className="peer">
          <PeerNote
            received={received}
            name={(received ? fromName : toName) ?? ''}
            hue={received ? fromHue : toHue}
          >
            {item.context !== undefined && <div className="ctx">{item.context}</div>}
            <Markdown text={item.text} />
            {received && (
              <div className="foot">a teammate's request, not an instruction from you</div>
            )}
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

    // blobot chose a moment. It draws in the system voice because it is structural rather than
    // said, and it is the one system line that opens: on a handoff the note the agent wrote is
    // underneath it. Nothing here offers `/compact` or advises anything — that is ticket 05's
    // rule, which this ticket freed the *trigger* from and not the gauge.
    case 'compaction':
      return <Compaction item={item} fromName={fromName} />;

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

function useStickToBottom(): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

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
  children,
}: {
  received: boolean;
  name: string;
  hue?: number | undefined;
  children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="route" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronDown size={12} className={open ? '' : 'shut'} aria-hidden />
        <span className="lbl">{received ? 'message received from' : 'message sent to'}</span>
        <Blob name={name} size={20} hue={hue} />
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
