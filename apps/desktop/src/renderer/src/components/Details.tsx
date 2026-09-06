import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Gauge } from 'lucide-react';
import { workingCeiling } from '@blobot/core/domain';
import { percent, tokens } from '../usage.js';
import type {
  UiAgent,
  UiHandbookEntry,
  UiInjection,
  UiPublishResult,
  UiUsage,
  UiWorkspaceStatus,
} from '../../../shared/api.js';
import { sizeOf } from './Attached.js';
import { Blob } from './Blob.js';
import { WorkspacePanel } from './Workspaces.js';
import { SessionSkills } from './SessionSkills.js';

/**
 * What the machinery under this team is doing: `CONTEXT` and `WORKSPACE`, behind one glyph in
 * the chrome above the transcript.
 *
 * **It replaced a docked third column, 2026-09-05, at the author's direction.** That column
 * carried a log of tool calls and finished turns above these two blocks, and the log went with
 * it: a settled call is drawn in the transcript's own fold now, so the log was the second copy
 * of it, in a column nobody reads while something is happening. What is left is two blocks that
 * are **one row per agent** and are read on purpose rather than watched — how full each window
 * is, and where each agent's work is — which is a popover's shape and not a column's.
 *
 * A press and never a hover, unlike the composer's context ring: the ring is one figure the
 * pointer is already on, and this is a panel with rows that open. The trigger stands exactly
 * where the column's own toggle stood, so the gesture that used to reveal these blocks still
 * reveals them.
 */
export function Details({
  teamId,
  agents,
  usage,
  injection,
  handbooks,
  workspaces,
  looking,
  onRefreshWorkspaces,
  onPublish,
  onPlan,
  startOpen = false,
}: {
  teamId?: string;
  agents: readonly UiAgent[];
  usage: Record<string, UiUsage>;
  injection: Record<string, UiInjection>;
  /** Every member's Handbook. The gauge's handbook row is a sum of exactly these entries. */
  handbooks: Record<string, readonly UiHandbookEntry[]>;
  /**
   * Every member's workspace, in the team pane only. An agent's pane draws its own under the
   * composer, because there one branch is the whole answer.
   */
  workspaces: readonly UiWorkspaceStatus[];
  looking: boolean;
  onRefreshWorkspaces: () => void;
  onPublish: (
    agentId: string,
    options: { title?: string; draft?: boolean },
  ) => Promise<UiPublishResult>;
  onPlan: (
    agentId: string,
    options: { title?: string; draft?: boolean },
  ) => Promise<readonly string[]>;
  /**
   * `--screen=details` on the main process, which puts the panel on screen at launch.
   *
   * The same review affordance `--screen=handbook` is, and for the same reason: this is now a
   * surface a screenshot cannot click to, so without it nothing that reviews the app without a
   * human at the screen can see `CONTEXT` or `WORKSPACE` at all.
   */
  startOpen?: boolean;
}): React.JSX.Element {
  const nothing = Object.keys(usage).length === 0 && workspaces.length === 0;
  return (
    <Popover.Root defaultOpen={startOpen}>
      <Popover.Trigger className="paneltoggle" title="Context and workspace" aria-label="Context and workspace">
        <Gauge size={16} aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="detailspop" side="bottom" align="end" sideOffset={8} collisionPadding={12}>
          <Context agents={agents} usage={usage} injection={injection} handbooks={handbooks} />
          {teamId && <section className="skillrows" aria-label="Skills in this team"><div className="ctxhead"><span className="mono muted">SKILLS</span></div>
            {agents.map((agent) => <SessionSkills key={agent.id} teamId={teamId} agent={agent} />)}
          </section>}
          <WorkspacePanel
            statuses={workspaces}
            agents={agents}
            looking={looking}
            onRefresh={onRefreshWorkspaces}
            onPublish={onPublish}
            onPlan={onPlan}
          />
          {/* Both blocks withhold themselves rather than drawing a header over nothing, so on a
              team that has not taken a turn the panel would be an empty box. A line of type
              saying what will be here is the same answer the activity column gave to the same
              problem, and it is the half of that column worth keeping. */}
          {nothing && (
            <div className="detailsempty">
              nothing yet. how full each window is, and where each agent's work is, land here
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}


/**
 * How full each agent's context is. Occupancy, not billing, and blobot does not manage it: the
 * CLI behind the adapter owns compaction and `/compact` is offered in the composer's palette.
 * What was missing was the ability to see it coming, which is what this draws and all it draws.
 *
 * The whole roster, on both panes, in the roster's own order: an agent's occupancy is worth
 * reading against its teammates', and the two runtimes' windows differ by five times, which is
 * why both numbers are here and not only the percent.
 *
 * Absent for an agent that has never reported, and the block disappears entirely when nobody
 * has. A header over nothing is the mistake the panel's own empty line exists to avoid.
 */
function Context({
  agents,
  usage,
  injection,
  handbooks,
}: {
  agents: readonly UiAgent[];
  usage: Record<string, UiUsage>;
  injection: Record<string, UiInjection>;
  handbooks: Record<string, readonly UiHandbookEntry[]>;
}): React.JSX.Element | null {
  const [open, setOpen] = useState<string | undefined>(undefined);
  const rows = agents
    .map((agent) => ({ agent, reading: usage[agent.id] }))
    .filter((row): row is { agent: UiAgent; reading: UiUsage } => row.reading !== undefined)
    // The ceiling is arithmetic here and a lookup in the adapter: main resolved whatever anybody
    // has established for this agent's model, and this turns it into a number against the window
    // the runtime actually reported — clamped to it, or the conservative fallback when nobody
    // has measured. Nothing in this file can tell which runtime is behind either case.
    .map((row) => ({ ...row, ceiling: workingCeiling(row.agent.contextCeiling, row.reading.size) }));
  if (rows.length === 0) return null;
  return (
    <div className="ctx">
      <div className="ctxhead">
        <span className="mono muted">CONTEXT</span>
      </div>
      {rows.map(({ agent, reading, ceiling }) => (
        <div key={agent.id}>
          <button
            type="button"
            className="ctxrow"
            aria-expanded={open === agent.id}
            aria-controls={`sent-${agent.id}`}
            onClick={() => setOpen(open === agent.id ? undefined : agent.id)}
          >
            <Blob name={agent.name} size={14} hue={agent.hue} shape={agent.shape} />
            <span className="who">{agent.name}</span>
            <span className="n">
              {tokens(reading.used)}/{tokens(reading.size)}
            </span>
            {/* The percent is of the *working ceiling*, and the ceiling is named beside it so
                the denominator is never hidden. Dividing by the advertised window drew 3% for
                an agent 300k into a million, which reads as barely started and is the opposite
                of what the number is for. Past the mark it says so in words: a percentage over
                a hundred is not a fact about anything. See ticket 09. */}
            {reading.used >= ceiling.tokens ? (
              <span className="p past">past {tokens(ceiling.tokens)}</span>
            ) : (
              <>
                <span className="p">{percent(reading.used, ceiling.tokens)}%</span>
                <span className="of">of {tokens(ceiling.tokens)}</span>
              </>
            )}
          </button>
          {open === agent.id && (
            <Sent
              id={`sent-${agent.id}`}
              sent={injection[agent.id]}
              handbookChars={handbookChars(handbooks[agent.id])}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * What blobot put in there, under the agent whose row was clicked.
 *
 * Opens **in place**, under the row it belongs to, and never as a second layer over this one:
 * a panel hanging off a panel is two things to dismiss for one fact, and the rows here are
 * short enough that the panel simply pushes what is under it down.
 *
 * The numbers are **estimated**, and say so. blobot knows exactly how many characters it sent
 * and cannot know what they cost in tokens, because tokenizing is the provider's. They are
 * never added to the gauge above, which is the runtime's own count.
 */
function Sent({
  id,
  sent,
  handbookChars,
}: {
  id: string;
  sent: UiInjection | undefined;
  /**
   * The entries' own text, summed. Passed in rather than carried on `UiInjection`, so this is
   * provably the same list the panel draws instead of a second count of it that can drift — and
   * it moves the moment an agent records one, because the entries are live in the snapshot state.
   */
  handbookChars: number;
}): React.JSX.Element {
  if (sent === undefined) {
    return (
      <div className="sent" id={id}>
        <div className="sentnote">nothing sent yet. this agent has not been woken</div>
      </div>
    );
  }
  return (
    <div className="sent" id={id}>
      <div className="sentrow">
        <span>persona</span>
        <span className="v">{estimate(sent.personaChars)}</span>
      </div>
      {/* The two parts of the persona the user owns, in the order the persona puts them in: what
          is true of this work, then what is true of you. One relationship, drawn where it is
          composed and drawn again here, contradicted in neither.

          `handbook` carries no possessive and no count. *Your* is load-bearing on the row below,
          where the words really are the user's; a Handbook is partly the agent's, so the same
          word would be a small lie in a column whose whole job is being accurate about cost. The
          count belongs in the panel, where a person can act on it.

          It never warns as it nears its bound, and that is not the context ring's reason. The
          ring stays quiet because blobot *will* act: a full window is what the session boundary
          is for. This row stays quiet because blobot will **not** — the remedy is a person
          removing an entry, and the number they act on stands in the panel beside the entries
          they would remove. A warning in a column nothing can be done from is an alarm pointing
          somewhere else. Two rows in one block, quiet for opposite reasons, both right. */}
      {handbookChars > 0 && (
        <div className="sentrow sub">
          <span>handbook</span>
          <span className="v">{estimate(handbookChars)}</span>
        </div>
      )}
      {sent.instructionsChars > 0 && (
        <div className="sentrow sub">
          <span>your standing instructions</span>
          <span className="v">{estimate(sent.instructionsChars)}</span>
        </div>
      )}
      <div className="sentrow">
        <span>last wake prompt</span>
        <span className="v">{estimate(sent.lastWakeChars)}</span>
      </div>
      {sent.lastWakeMessages > 0 && (
        <div className="sentrow sub">
          <span>
            {sent.lastWakeMessages} {sent.lastWakeMessages === 1 ? 'message' : 'messages'}
          </span>
          <span className="v" />
        </div>
      )}
      <div className="sentrow">
        <span>queued</span>
        <span className="v">{sent.queued}</span>
      </div>
      <div className="sentrow">
        <span>blobot's own tool</span>
        <span className="v">{estimate(sent.ownToolChars)}</span>
      </div>
      {sent.attachmentCount > 0 && (
        <>
          {/* Bytes and a count, never tokens: an image's cost is a function of its pixels and
              that function is the provider's. And it says *sent this session*, because it is
              the only figure here that is not per-turn — an embedded attachment stays in the
              session's history for as long as the session does. */}
          <div className="sentrow">
            <span>attachments</span>
            <span className="v">
              {sent.attachmentCount} · {sizeOf(sent.attachmentBytes)}
            </span>
          </div>
          <div className="sentrow sub">
            <span>sent this session, and still there</span>
            <span className="v" />
          </div>
        </>
      )}
      <div className="sentnote">
        estimated from what blobot sent. the count above is the runtime's own, and it includes
        tools and files blobot did not put there
      </div>
    </div>
  );
}

/** Four characters to a token is the usual rule of thumb, and the tilde says it is one. */
function estimate(chars: number): string {
  if (chars === 0) return '0';
  return `~${tokens(Math.ceil(chars / 4))}`;
}

/**
 * The entries' own text, and nothing of the prose blobot wraps them in.
 *
 * Not the ordinals, not the dates, not the four lines telling the agent when to record. Three
 * reasons and they agree: it is what `HANDBOOK_LIMIT` is measured against, it is what the panel's
 * foot stands beside the entries with, and it is the only part of the block a person can change.
 * Counting the framing would put a number in a column about cost that nobody can act on.
 */
export function handbookChars(entries: readonly UiHandbookEntry[] | undefined): number {
  return (entries ?? []).reduce((total, entry) => total + entry.text.length, 0);
}
