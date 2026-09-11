import * as Menu from '@radix-ui/react-context-menu';
import { ArrowLeft, FolderTree, GitBranch, Plus, UserMinus } from 'lucide-react';
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
  waiting,
  agents,
  workspaces,
  note,
  fill,
  panel,
  teamName,
  onAddMember,
  onRemoveMember,
  onPanel,
  onSelectAgent,
  onSelectTeam,
  children,
}: {
  /** The pane's agent. Undefined is the team pane, where the empty state is the chooser. */
  agent: UiAgent | undefined;
  /**
   * The pane is about somebody who is not on the roster in hand: a **thread** whose Agent does
   * not exist yet, or an agent whose team is still being swapped under this render.
   *
   * It has to be its own state, because the two things the shell would otherwise draw are both
   * false there. The chooser is the *team pane's* empty state and nothing else's — drawn for a
   * pane that is about one person it offers the previous team's roster, which is how switching
   * to a sleeping agent left somebody else's face at the top of the panel. And a head cannot be
   * drawn for an agent that is not there to name. So: a short true word, and nothing else. It is
   * the panel's own rule about absences, applied to whose folder rather than to what is in one.
   */
  waiting?: 'opening' | 'no folder';
  /**
   * The team the chooser's faces belong to, drawn as the head when no agent is picked.
   *
   * One head slot with two states rather than two stacked heads: the head says what the panel is
   * showing, which in the team pane is the team and in an agent's pane is that agent. Absent in
   * demo mode, whose team is a TypeScript file.
   */
  teamName?: string;
  /**
   * Taking one agent off this team, from a right-click on their face in the chooser.
   *
   * A context menu and not a control on the row: adding is the head's `+` because it is the
   * ordinary act, and a departure ends a session and leaves a branch or a copy behind, so it
   * lives one gesture further in — the rail's own arrangement for the same pair.
   */
  onRemoveMember?: (agentId: string) => void;
  /**
   * Hiring someone onto this team, from the head's `+`.
   *
   * Absent on a **thread**, which is one agent's own conversation and has no roster to add to,
   * and in demo mode. It opens the roster editor — the same dialog the rail row's menu opens —
   * because adding a member restates the whole roster and restarts the team, and there is no
   * cheaper version of that hiding behind a plus.
   */
  onAddMember?: () => void;
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
      {waiting !== undefined ? (
        <div className="ftbody">
          <Nothing>{waiting}</Nothing>
        </div>
      ) : (
        <>
      {agent === undefined && teamName !== undefined && (
        <div className="fthead team">
          <span className="nm">{teamName}</span>
          {onAddMember !== undefined && (
            <button
              type="button"
              className="ftadd"
              onClick={onAddMember}
              title="Add a member"
              aria-label="Add a member"
            >
              <Plus size={14} aria-hidden />
            </button>
          )}
        </div>
      )}
      {/* A team of one has nothing to go back to: the chooser would offer the face you just
          pressed, alone. So the head names the agent and is not a door. */}
      {agent !== undefined && agents.length === 1 && (
        <div className="fthead">
          <Blob name={agent.name} size={18} hue={agent.hue} shape={agent.shape} />
          <span className="nm">{agent.name}</span>
          {note !== undefined && <span className="mono muted">{note}</span>}
        </div>
      )}
      {agent !== undefined && agents.length !== 1 && (
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
          <Chooser
            agents={agents}
            workspaces={workspaces}
            onSelectAgent={onSelectAgent}
            {...(onRemoveMember === undefined ? {} : { onRemoveMember })}
          />
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
        </>
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
  onRemoveMember,
}: {
  agents: readonly UiAgent[];
  workspaces: readonly UiWorkspaceStatus[];
  onSelectAgent: (agentId: string) => void;
  /** Absent on a thread and in demo mode, where there is no roster to take anybody off. */
  onRemoveMember?: (agentId: string) => void;
}): React.JSX.Element {
  return (
    <div className="ftfaces">
      {agents.map((agent) => {
        const row = (
          <button
            type="button"
            className="ftface"
            onClick={() => onSelectAgent(agent.id)}
            title={agent.name}
          >
            <Blob name={agent.name} size={26} hue={agent.hue} shape={agent.shape} />
            <span className="nm">{agent.name}</span>
            <Churn churn={workspaces.find((row) => row.agentId === agent.id)?.churn} />
          </button>
        );
        if (onRemoveMember === undefined) return <div key={agent.id}>{row}</div>;
        return (
          <Menu.Root key={agent.id}>
            <Menu.Trigger asChild>{row}</Menu.Trigger>
            <Menu.Portal>
              {/* The rail's menu object, borrowed outright: a second menu that looked like a
                  different menu would be saying the two are different kinds of thing. */}
              <Menu.Content className="selectmenu rowmenu">
                <Menu.Item className="selectitem" onSelect={() => onRemoveMember(agent.id)}>
                  <UserMinus size={13} aria-hidden />
                  <span>Take {agent.name} off the team</span>
                </Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        );
      })}
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
