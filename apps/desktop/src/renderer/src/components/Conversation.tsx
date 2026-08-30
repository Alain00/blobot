import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AgentStatus, ToolKind } from '@blobot/core/domain';
import type { PermissionChoice, UiAgent, UiPermissionOutcome } from '../../../shared/api.js';
import {
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
import { Attached } from './Attached.js';
import { Blob } from './Blob.js';
import { Markdown } from './Markdown.js';


export function Conversation({
  pane,
  agents,
  statuses,
  items,
  onAnswerPermission,
  opening = false,
  workspacePath,
  chrome,
}: {
  pane: Pane;
  agents: readonly UiAgent[];
  statuses: Record<string, AgentStatus>;
  items: readonly Item[];
  onAnswerPermission: (requestId: string, choice: PermissionChoice) => void;
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
  const rows = rowsOf(items);

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
        <span className="where">
          {focused === undefined
            ? `${agents.length} agents · a workspace each${workspacePath === undefined ? '' : ` · ${workspacePath}`}`
            : // The runtime appears exactly once, as a label. The UI never branches on it.
              `${focused.role} · ${focused.runtimeLabel} · ${focused.branch ?? focused.workspacePath}`}
        </span>
        {chrome !== undefined && <span className="chrome">{chrome}</span>}
      </div>

      {/* The column is the readable thing, not the pane: it fills the width it is given and
          stops at a measure a paragraph can be read at, centred in whatever is left. */}
      <div className="stream" ref={stream}>
        <div className="col">
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
                    {...castOf(row.item, pane, byId, statuses)}
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
                <Blob
                  name={agent.name}
                  size={28}
                  status={statuses[agent.id] ?? 'idle'}
                  hue={agent.hue}
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
}

function castOf(
  item: Item,
  pane: Pane,
  byId: Map<string, UiAgent>,
  statuses: Record<string, AgentStatus>,
): Cast {
  switch (item.kind) {
    case 'user':
      // Everybody it went to, in the order they were addressed. One name is the ordinary case.
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
    case 'system':
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
          status channel's own device instead, the hairline that sweeps in `.stat` while a turn
          is in flight, rather than a spinner, which would be a second in-flight vocabulary for
          the same fact. It sits where the word sat, at the end, and not in the verb column:
          `read`, `edit` and `run` are a fixed left column, and losing the verb for the duration
          of the call is exactly the ragged edge that column exists to prevent. */}
      {item.kind === 'tool' && item.status === 'running' && (
        <span className="inflight" role="status" aria-label="running" />
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
}: {
  item: Item;
  grouped: boolean;
  teamPane: boolean;
  onAnswerPermission: (requestId: string, choice: PermissionChoice) => void;
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
          {teamPane && <div className="tag">to {toName}</div>}
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
        <div className="perm">
          <div className="ask">
            <b>{fromName}</b> wants to run <span className="mono">{item.title}</span>
          </div>
          {/* Said every time rather than once at team creation: this is the moment the sentence
              is about something, and the block is where a user decides what blobot is.

              It used to say "this reaches outside its own workspace or cannot be undone", which
              was a reason blobot cannot know and which was false of most of what it was printed
              over: on Claude, `default` mode asked about every edit inside the agent's own
              worktree. Ticket 14's 2026-08-30 amendment. It now says the one thing that is true
              of every request that reaches here, at all three trust levels — naming what blobot
              vouches for would be wrong for a `careful` agent, which it vouches for nothing
              for. */}
          <div className="why">
            blobot did not vouch for this one, so the runtime is asking and the agent waits until
            you answer. What it vouches for is what this agent is set to, in its own definition.
            Allow once covers this call. Allow always writes a rule into this agent&apos;s own
            .claude/settings.local.json and stops asking for this one thing.
          </div>
          <div className="acts">
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
  }
});

/**
 * The transcript follows the newest line, and stops following the moment the reader scrolls
 * away from the bottom — an agent streaming for a minute must not yank a reader out of the
 * paragraph they went back to read.
 */
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
