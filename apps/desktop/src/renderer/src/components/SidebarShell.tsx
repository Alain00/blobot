import { ArrowLeft, FolderTree, GitBranch } from 'lucide-react';
import type { UiAgent, UiChurn, UiWorkspaceStatus } from '../../../shared/api.js';
import { Blob } from './Blob.js';

/**
 * The sidebar the panels live in: one head, one body, one foot.
 *
 * The file tree was the sidebar for a day, so the head, the chooser and the short true sentences
 * about a folder that is gone all lived inside it. The git panel needs every one of them and
 * answers them identically — **it draws the pane's agent, full stop**, and in the team pane the
 * chooser is the empty state — so they moved here rather than being written twice. A tree and a
 * changed-file list that disagreed about whose folder they were showing is the exact failure the
 * tree refused when it declined a selection of its own.
 *
 * The **foot** is what makes this a container rather than a panel: two icon buttons, the tree and
 * git. It is a global preference, not per team and not per agent, because switching agents to
 * compare their changes and finding the panel flipped back is the annoyance nobody asked for. It
 * is **absent in the chooser**, where the question is *whose folder* and a switch between two
 * views of a folder nobody has picked yet answers a different one.
 */

export type SidebarPanelKind = 'tree' | 'git';

export function SidebarShell({
  agent,
  agents,
  workspaces,
  note,
  fill,
  panel,
  onPanel,
  onSelectAgent,
  onSelectTeam,
  children,
}: {
  /** The pane's agent. Undefined is the team pane, where the empty state is the chooser. */
  agent: UiAgent | undefined;
  agents: readonly UiAgent[];
  workspaces: readonly UiWorkspaceStatus[];
  /** A word beside the name, where the panel has to qualify what it is drawing. */
  note?: string;
  /**
   * The body holds its own height rather than scrolling as one column.
   *
   * The tree is one scrolling list; the git panel is a list *and* a composer pinned under it, so
   * the scrolling has to happen inside the panel instead of around it.
   */
  fill?: boolean;
  panel: SidebarPanelKind;
  onPanel: (panel: SidebarPanelKind) => void;
  onSelectAgent: (agentId: string) => void;
  /**
   * Back to the team, which is back to the chooser.
   *
   * The head is the way out because it is the thing that says which way you came in: a face takes
   * you into an agent's pane, and pressing the name of the agent you are in takes you back out.
   */
  onSelectTeam: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="filetree">
      {agent !== undefined && (
        <button type="button" className="fthead" onClick={onSelectTeam} title="Back to the team">
          {/* The face was carrying the door on its own, and a face is the app's word for *this
              agent* everywhere else — nothing about it points anywhere. The arrow is the part
              that says the press goes back. */}
          <ArrowLeft size={12} aria-hidden className="back" />
          <Blob name={agent.name} size={18} hue={agent.hue} shape={agent.shape} />
          <span className="nm">{agent.name}</span>
          {/* Never the branch: the tray forty pixels away already says it. */}
          {note !== undefined && <span className="mono muted">{note}</span>}
        </button>
      )}
      <div className={`ftbody${fill === true ? ' fill' : ''}`}>
        {agent === undefined ? (
          <Chooser agents={agents} workspaces={workspaces} onSelectAgent={onSelectAgent} />
        ) : (
          children
        )}
      </div>
      {/* The doors are absent in the chooser. Two panels of one agent's folder is not a choice
          worth offering before there is an agent: the question there is *whose*, and the switch
          would be answering a different one. */}
      {agent !== undefined && (
      <div className="ftfoot">
        <Door
          on={panel === 'tree'}
          label="The folder"
          onClick={() => onPanel('tree')}
          glyph={<FolderTree size={13} aria-hidden />}
        />
        <Door
          on={panel === 'git'}
          label="What has changed"
          onClick={() => onPanel('git')}
          glyph={<GitBranch size={13} aria-hidden />}
        />
      </div>
      )}
    </div>
  );
}

function Door({
  on,
  label,
  glyph,
  onClick,
}: {
  on: boolean;
  label: string;
  glyph: React.ReactNode;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`ftdoor${on ? ' on' : ''}`}
      aria-pressed={on}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {glyph}
    </button>
  );
}

/**
 * The team pane's empty state, which *is* the chooser.
 *
 * A single panel there would be false about the other members, and a face is the shortest path
 * from *I want to see her files* to seeing them. No line over them: the faces are the invitation.
 * Each row carries the tray's own `+52 −51`, because this is the one place where four workspaces
 * are on screen at once and a name alone says nothing about whether there is anything in there.
 */
function Chooser({
  agents,
  workspaces,
  onSelectAgent,
}: {
  agents: readonly UiAgent[];
  workspaces: readonly UiWorkspaceStatus[];
  onSelectAgent: (agentId: string) => void;
}): React.JSX.Element {
  return (
    <div className="ftfaces">
      {agents.map((agent) => (
        <button
          key={agent.id}
          type="button"
          className="ftface"
          onClick={() => onSelectAgent(agent.id)}
          title={agent.name}
        >
          <Blob name={agent.name} size={26} hue={agent.hue} shape={agent.shape} />
          <span className="nm">{agent.name}</span>
          <Churn churn={workspaces.find((row) => row.agentId === agent.id)?.churn} />
        </button>
      ))}
    </div>
  );
}

/**
 * The tray's own figure, quoted rather than reworded: same shape, same tokens.
 *
 * The one place it departs from the tray is the zero. The tray says `clean`, because there the
 * word is a live number's zero standing where a figure would otherwise be missing; here a column
 * of `clean` beside every idle face is a word repeated for saying nothing. Nothing is the resting
 * state, and the figure is what breaks it.
 */
export function Churn({ churn }: { churn: UiChurn | undefined }): React.JSX.Element | null {
  if (churn === undefined) return null;
  if (churn.added === 0 && churn.removed === 0) return null;
  return (
    <span className="wschurn">
      <span className="wsadd">+{churn.added}</span>
      <span className="wsdel">−{churn.removed}</span>
    </span>
  );
}

/** Short, and one line. The full sentence about a moved folder lives where the fix is. */
export function Nothing({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="ftnone mono muted">{children}</div>;
}
