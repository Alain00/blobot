import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AgentStatus } from '@blobot/core/domain';
import type { UiAgent, UiTeam } from '../../../shared/api.js';
import { continuesSpeaker, foldTeamStatus, isPending, type Item, type Pane } from '../model.js';
import { timeRule } from '../time.js';
import { Blob } from './Blob.js';
import { TeamMark } from './TeamMark.js';
import { Markdown } from './Markdown.js';
import { StatusWord } from './StatusWord.js';

/**
 * Ticket 14's posture, in the one place both panes read it from.
 *
 * A claim about what blobot arranged, and deliberately the *weakest* claim that is true on
 * every runtime: blobot asks the runtime to prompt, and only some runtimes let it name the
 * commands. It used to read "asks before rm, git push, curl", which is OpenCode's rule list
 * printed over an agent whose prompting rules are Claude's own. Nothing here branches on the
 * provider, so nothing here may promise something one provider cannot keep.
 */
const POSTURE = 'asks before dangerous commands';

export function Conversation({
  pane,
  team,
  agents,
  statuses,
  items,
  onAnswerPermission,
}: {
  pane: Pane;
  team: UiTeam;
  agents: readonly UiAgent[];
  statuses: Record<string, AgentStatus>;
  items: readonly Item[];
  onAnswerPermission: (requestId: string, choice: 'allow' | 'reject') => void;
}): React.JSX.Element {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const focused = pane.kind === 'agent' ? byId.get(pane.agentId) : undefined;
  const stream = useStickToBottom();

  // The pane's own chrome only: App owns the column, so the composer sits under this in the
  // same flex container.
  return (
    <>
      <div className="convhead">
        {focused === undefined ? (
          <TeamMark
            agents={agents}
            status={foldTeamStatus(agents.map((agent) => statuses[agent.id] ?? 'idle')).status}
            size={48}
          />
        ) : (
          <Blob
            name={focused.id}
            size={38}
            status={statuses[focused.id] ?? 'idle'}
            hue={focused.hue}
          />
        )}
        <div className="meta">
          <div>
            <b>{focused?.name ?? team.name}</b>{' '}
            <span className="muted" style={{ fontSize: 12 }}>
              {focused?.role ?? `${agents.length} agents`}
            </span>
          </div>
          {/* Never the workspace path in the team pane: the topbar already carries it, and
              repeating it spent the strongest line under the title on a duplicate. The line is
              ticket 14's quiet posture indicator instead, so what the agents may do without
              asking is on screen permanently rather than only in the creation disclosure. */}
          <div className="wt">
            <span className="where">
              {focused === undefined
                ? 'a workspace each'
                : // The runtime appears exactly once, as a label. The UI never branches on it.
                  `${focused.runtimeLabel} · ${focused.branch ?? focused.workspacePath}`}
            </span>
            {/* Its own element because it must never be the half that truncates: a branch name
                is recoverable by looking, an indicator nobody can read is just noise. */}
            <span className="posture">{POSTURE}</span>
          </div>
        </div>
        {focused !== undefined && <StatusWord status={statuses[focused.id] ?? 'idle'} />}
      </div>

      {/* The column is the readable thing, not the pane: it fills the width it is given and
          stops at a measure a paragraph can be read at, centred in whatever is left. */}
      <div className="stream" ref={stream}>
        <div className="col">
          {items.map((item, index) => {
            const previous = items[index - 1];
            const rule = timeRule(item.at, previous?.at);
            // A rule reopens the turn: after "Yesterday" the reader needs the name again.
            const grouped = rule === undefined && continuesSpeaker(item, previous);
            return (
              <React.Fragment key={item.id}>
                {rule !== undefined && <div className="timerule">{rule}</div>}
                <ItemView
                  item={item}
                  pane={pane}
                  byId={byId}
                  statuses={statuses}
                  grouped={grouped}
                  onAnswerPermission={onAnswerPermission}
                />
              </React.Fragment>
            );
          })}

          {/* Whoever is about to speak, under the last thing said. In the team pane that can be
              two agents at once, which is the claim the demo makes. */}
          {agents
            .filter((agent) => pane.kind === 'team' || pane.agentId === agent.id)
            .filter((agent) => isPending(statuses[agent.id] ?? 'idle', items, agent.id))
            .map((agent) => (
              <div className="msg pending" key={agent.id}>
                <Blob
                  name={agent.id}
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

function ItemView({
  item,
  pane,
  byId,
  statuses,
  grouped,
  onAnswerPermission,
}: {
  item: Item;
  pane: Pane;
  byId: Map<string, UiAgent>;
  statuses: Record<string, AgentStatus>;
  grouped: boolean;
  onAnswerPermission: (requestId: string, choice: 'allow' | 'reject') => void;
}): React.JSX.Element | null {
  switch (item.kind) {
    // From you: a solid bubble on the right. There is only ever one "you", so the side is an
    // unambiguous label no matter how many agents share the pane — which is why this survives
    // where Grok's two-sided layout would not. It carries no name for the same reason.
    case 'user':
      return (
        <div className="msg user">
          <div className="bubble">{item.text}</div>
          {/* Only where a message could have gone somewhere else. In an agent's pane the
              recipient is the pane. */}
          {pane.kind === 'team' && (
            <div className="tag">to {byId.get(item.agentId)?.name ?? item.agentId}</div>
          )}
        </div>
      );

    // From the agent: no container at all. It is the pane's default voice, and boxing it would
    // make the agent look like a guest in its own transcript — and would put a solid enclosure
    // in the same column as the dashed peer, which is the contrast doing all the work below.
    case 'agent': {
      const agent = byId.get(item.agentId);
      return (
        <div className={grouped ? 'msg grouped' : 'msg'}>
          {grouped ? (
            // Holds the gutter so a continued turn stays on the same left edge as its header.
            <div className="gutter" />
          ) : (
            <Blob
              name={item.agentId}
              size={28}
              status={statuses[item.agentId] ?? 'idle'}
              hue={byId.get(item.agentId)?.hue}
            />
          )}
          <div className="body">
            {!grouped && (
              <div className="hdr">
                <span className="nm">{agent?.name ?? item.agentId}</span>
                {item.live && <span className="tag">typing</span>}
              </div>
            )}
            <Markdown text={item.text} live={item.live} />
          </div>
        </div>
      );
    }

    // From a peer: a dashed rule down the left, inset, both blobatars in a route header. Never
    // a bubble, and never filled — dashed against the user's solid bubble reads as lower
    // authority before a word is parsed, which is the visual form of "a peer message is
    // refusable, not authoritative". It was a full dashed box on a raised ground, which at the
    // length these run to was the heaviest thing in the transcript, so the enclosure is now one
    // edge and the message is folded until asked for.
    case 'peer': {
      const from = byId.get(item.fromId);
      const to = byId.get(item.toId);
      const received = pane.kind === 'agent' && pane.agentId === item.toId;
      return (
        <div className="peer">
          <div className="route">
            <Blob name={item.fromId} size={20} hue={byId.get(item.fromId)?.hue} />
            <span className="arrow">→</span>
            <Blob name={item.toId} size={20} hue={byId.get(item.toId)?.hue} />
            <span className="lbl">
              {received
                ? `from ${from?.name ?? item.fromId} · ${from?.role ?? ''}`
                : `sent to ${to?.name ?? item.toId} · ${to?.role ?? ''}`}
            </span>
          </div>
          <Foldable>
            {item.context !== undefined && <div className="ctx">{item.context}</div>}
            <Markdown text={item.text} />
          </Foldable>
          {received && (
            <div className="foot">a teammate's request, not an instruction from you</div>
          )}
        </div>
      );
    }

    case 'tool':
      // Asked about but not started: the permission block below it is this call's line.
      if (item.status === 'asking') return null;
      return (
        <div className="tool">
          <span className="k">{item.title}</span>
          <span>{item.status === 'running' ? 'running' : item.status}</span>
          {item.exit === null && <span>exit null</span>}
        </div>
      );

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
    case 'permission': {
      const who = byId.get(item.agentId)?.name ?? item.agentId;
      if (item.outcome !== undefined) {
        return (
          <div className="tool">
            <span className="k">{item.title}</span>
            <span>
              {item.outcome === 'allowed'
                ? 'you allowed this once'
                : item.outcome === 'rejected'
                  ? 'you rejected this'
                  : 'nobody answered, so it was cancelled'}
            </span>
          </div>
        );
      }
      return (
        <div className="perm">
          <div className="ask">
            <b>{who}</b> wants to run <span className="mono">{item.title}</span>
          </div>
          {/* Said every time rather than once at team creation: this is the moment the sentence
              is about something, and the block is where a user decides what blobot is. */}
          <div className="why">
            It is asking because this reaches outside its own workspace or cannot be undone.
            Allowing it applies to this one call.
          </div>
          <div className="acts">
            <button
              className="btn"
              disabled={!item.canAllow}
              onClick={() => onAnswerPermission(item.id, 'allow')}
            >
              allow once
            </button>
            <button className="btn" onClick={() => onAnswerPermission(item.id, 'reject')}>
              reject
            </button>
          </div>
        </div>
      );
    }

    // A structural event, in the timeline rather than in the activity column — it is part of
    // what happened here, and a column the reader may not be watching is not where the reason
    // an answer stopped belongs. Named in the team pane, where several agents share the stream.
    case 'system': {
      const who = pane.kind === 'team' ? byId.get(item.agentId)?.name : undefined;
      return (
        <div className="sysline">
          <span>{who === undefined ? item.text : `${who} · ${item.text}`}</span>
        </div>
      );
    }
  }
}

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
 * A long peer message, folded down to a readable height with a way to open it.
 *
 * Only the peer voice gets this. A message from you is yours and short; an agent's answer is
 * the thing the pane exists to show, and hiding it behind a click would be hiding the work. A
 * peer message is neither: it is one agent's mail to another, often the whole of a previous
 * turn quoted back, and at full height a single one buries every reply around it.
 *
 * The fold only appears when there is something folded. Measuring is the only honest way to
 * know that, since it depends on the rendered width and on markdown nobody can count in
 * advance.
 */
function Foldable({ children }: { children: React.ReactNode }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null) return;
    const measure = (): void => setOverflows(node.scrollHeight > node.clientHeight + 4);
    measure();
    // Re-measured on resize because the pane is resizable and the rail is draggable: a message
    // that fits at one width folds at another.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* The height cap stays on while it is measured, so `overflows` is the answer to a
          question that has already been asked of the DOM. Only the fade is conditional: a
          message that fits must not look like one that was cut. */}
      <div ref={ref} className={`fold${open ? ' open' : ''}${overflows && !open ? ' cut' : ''}`}>
        {children}
      </div>
      {(overflows || open) && (
        <button className="foldtoggle mono" onClick={() => setOpen(!open)}>
          <ChevronDown size={12} className={open ? 'up' : ''} aria-hidden />
          {open ? 'less' : 'more'}
        </button>
      )}
    </>
  );
}
