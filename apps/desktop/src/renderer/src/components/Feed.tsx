import { useState } from 'react';
import { workingCeiling } from '@blobot/core/domain';
import type {
  UiAgent,
  UiInjection,
  UiPublishResult,
  UiUsage,
  UiWorkspaceStatus,
} from '../../../shared/api.js';
import { sizeOf } from './Attached.js';
import { Blob } from './Blob.js';
import { WorkspacePanel } from './Workspaces.js';
import type { FeedEntry, Pane } from '../model.js';

/**
 * Docked right, always visible — a third column rather than a tab or a drawer, because the
 * demo's claim is that you can watch two agents work at once, and a feed you have to open is a
 * feed you never see while something is happening.
 *
 * For an agent: that agent's events on top, the team's below a rule. For the team: undivided.
 */
export function Feed({
  entries,
  agents,
  usage,
  injection,
  pane,
  workspaces,
  looking,
  onRefreshWorkspaces,
  onPublish,
  onPlan,
}: {
  entries: readonly FeedEntry[];
  agents: readonly UiAgent[];
  usage: Record<string, UiUsage>;
  injection: Record<string, UiInjection>;
  pane: Pane;
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
}): React.JSX.Element {
  const name = (agentId?: string): string =>
    agents.find((agent) => agent.id === agentId)?.name ?? 'team';
  const mine =
    pane.kind === 'agent' ? entries.filter((entry) => entry.agentId === pane.agentId) : entries;
  const rest = pane.kind === 'agent' ? entries.filter((entry) => entry.agentId !== pane.agentId) : [];

  return (
    <div className="feed">
      {/* The column's head, pinned. CONTEXT is the one figure here a reader watches *while*
          reading the log below it, and it scrolled away the moment they did. The log passes
          under it; nothing floats. See the note in DESIGN.md on why this is not the rail's
          rejected pinned group. It carries its own ceiling and scrolls inside itself, because
          both blocks are one row per agent and a six-agent roster would otherwise pin the
          whole column. */}
      <div className="feedtop">
        <div className="feedhead">
          <span className="mono muted">ACTIVITY</span>
        </div>
        <Context agents={agents} usage={usage} injection={injection} />
        <WorkspacePanel
          statuses={workspaces}
          agents={agents}
          looking={looking}
          onRefresh={onRefreshWorkspaces}
          onPublish={onPublish}
          onPlan={onPlan}
        />
      </div>
      {entries.length === 0 && (
        // A header over nothing is what a fifth of the window looked like on a quiet team.
        // The column keeps its width rather than collapsing: it would reappear on the first
        // tool call and shove the conversation sideways mid-turn, which is worse than a line
        // of type saying what will land here.
        <div className="feedempty">nothing yet. tool calls and finished turns land here</div>
      )}
      {mine.map((entry) => (
        <FeedLine key={entry.id} entry={entry} who={name(entry.agentId)} />
      ))}
      {rest.length > 0 && <hr style={{ margin: '10px 0' }} />}
      {rest.map((entry) => (
        <FeedLine key={entry.id} entry={entry} who={name(entry.agentId)} />
      ))}
    </div>
  );
}

function FeedLine({ entry, who }: { entry: FeedEntry; who: string }): React.JSX.Element {
  const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`fev${entry.emphasis === true ? ' hi' : ''}`}>
      <span className="t">{time}</span>
      <span className="who">{who}</span>
      <span className="what">{entry.text}</span>
    </div>
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
 * has. A header over nothing is the same mistake the empty-feed line exists to avoid.
 */
function Context({
  agents,
  usage,
  injection,
}: {
  agents: readonly UiAgent[];
  usage: Record<string, UiUsage>;
  injection: Record<string, UiInjection>;
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
            <Blob name={agent.name} size={14} hue={agent.hue} />
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
          {open === agent.id && <Sent id={`sent-${agent.id}`} sent={injection[agent.id]} />}
        </div>
      ))}
    </div>
  );
}

/**
 * What blobot put in there, under the agent whose row was clicked.
 *
 * Opens **in place** rather than over the column, which is the same rule the rail keeps:
 * nothing in a column covers anything else in it, and a panel floating over the log would read
 * as sitting on top of the activity rather than belonging to the row it came from.
 *
 * The numbers are **estimated**, and say so. blobot knows exactly how many characters it sent
 * and cannot know what they cost in tokens, because tokenizing is the provider's. They are
 * never added to the gauge above, which is the runtime's own count.
 */
function Sent({ id, sent }: { id: string; sent: UiInjection | undefined }): React.JSX.Element {
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

/** A token count at a glance: `37k`, `1m`. Never rounded up to a window it has not reached. */
function tokens(count: number): string {
  if (count >= 1_000_000) return `${Math.floor(count / 100_000) / 10}m`.replace('.0m', 'm');
  if (count >= 1_000) return `${Math.floor(count / 1_000)}k`;
  return `${count}`;
}

/**
 * Floored, so a context that is not yet full never reads as full.
 *
 * Against the working ceiling rather than the advertised window, since ticket 09. The window is
 * still drawn, as the right-hand half of `used/size`, because it is what the runtime said; this
 * is the figure a reader acts on, and the two are not the same question. An agent past its
 * ceiling never reaches here — that case is words, not a number.
 */
function percent(used: number, ceiling: number): number {
  if (ceiling <= 0) return 0;
  return Math.min(100, Math.floor((used / ceiling) * 100));
}
