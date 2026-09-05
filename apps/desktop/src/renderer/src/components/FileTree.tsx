import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type {
  UiAgent,
  UiTreeDirectory,
  UiTreeEntry,
  UiWorkspaceStatus,
} from '../../../shared/api.js';
import type { Pane } from '../model.js';
import { FileIcon } from './FileIcon.js';
import { Nothing, SidebarShell, type SidebarPanelKind } from './SidebarShell.js';

/**
 * The folder the agent is working in.
 *
 * Every other surface reads an AgentWorkspace as a *figure* — the tray's `+412 −7 · 9 files`,
 * `WORKSPACE`'s branch, `CONTEXT`'s percent — and not one of them can say **which nine files**.
 * That is the hole this fills, and it is what makes it a flank rather than the activity column
 * in a new costume: the column drew what the transcript was already drawing; this draws what
 * the transcript cannot.
 *
 * **A window onto the work, never an editor.** Read-only in every direction: blobot writes no
 * byte into an AgentWorkspace from here, and a click opens the file in the user's own editor.
 * Nothing here reaches an agent — observation in the same sense the context gauge is.
 *
 * **It draws the pane's agent, full stop.** No selection of its own, which would let Bob's tree
 * sit beside Alice's transcript; in the team pane the empty state *is* the chooser, because a
 * single tree there would be false about the other members.
 *
 * The one rule under the states that are not a tree: **it never draws an absence it did not
 * verify**, and it never draws nothing, which is indistinguishable from a panel that has not
 * finished reading.
 */
export function FileTree({
  teamId,
  pane,
  agents,
  workspaces,
  demoMode,
  revision,
  panel,
  onPanel,
  onSelectAgent,
  onSelectTeam,
}: {
  teamId: string | undefined;
  pane: Pane;
  agents: readonly UiAgent[];
  /** The same rows `WORKSPACE` draws. Read for the kind, which decides the status column. */
  workspaces: readonly UiWorkspaceStatus[];
  demoMode: boolean;
  /**
   * `AppState.settled`, which rises on every settled tool call. The tree follows the work off
   * the signal `useWorkspaces` already uses, and on **no timer**: a team left open in the
   * background must not sit running subprocesses nobody wanted.
   */
  revision: number;
  panel: SidebarPanelKind;
  onPanel: (panel: SidebarPanelKind) => void;
  onSelectAgent: (agentId: string) => void;
  /**
   * Back to the team, which is back to the chooser.
   *
   * The head is the way out because it is the thing that says which way you came in: a face
   * takes you into an agent's pane, and pressing the name of the agent you are in takes you
   * back out. Without it the panel is one-way — the rail is the only exit, and the sidebar has
   * already claimed the entrance.
   */
  onSelectTeam: () => void;
}): React.JSX.Element {
  const agentId = pane.kind === 'agent' ? pane.agentId : undefined;
  const key = `${teamId ?? ''}/${agentId ?? ''}`;
  // Per `<team>/<agent>` and in memory. A schema migration for a scroll position is the wrong
  // trade, and coming back to a team the pool still holds should not find the tree collapsed.
  const [expanded, setExpanded] = useState<Record<string, readonly string[]>>({});
  const [reading, setReading] = useState<
    { key: string; present: boolean; dirs: Record<string, UiTreeDirectory> } | undefined
  >(undefined);

  const open = expanded[key] ?? [];
  const asked = ['', ...open].join('\n');

  useEffect(() => {
    if (teamId === undefined || agentId === undefined) return;
    let live = true;
    void window.blobot
      .workspaceTree(teamId, agentId, asked.split('\n'))
      .then((tree) => {
        if (!live) return;
        const dirs: Record<string, UiTreeDirectory> = {};
        for (const directory of tree.directories) dirs[directory.path] = directory;
        setReading({ key, present: tree.present, dirs });
      })
      .catch(() => {
        if (live) setReading({ key, present: false, dirs: {} });
      });
    return () => {
      live = false;
    };
  }, [teamId, agentId, key, asked, revision]);

  const agent = agents.find((row) => row.id === agentId);
  const status = workspaces.find((row) => row.agentId === agentId);
  const here = reading?.key === key ? reading : undefined;
  const shell = { agents, workspaces, panel, onPanel, onSelectAgent, onSelectTeam } as const;

  return (
    <SidebarShell
      {...shell}
      agent={agent}
      // `a copy` is the two words the app already uses for this kind, and it is here because the
      // status column is absent rather than empty.
      {...(status?.kind === 'plain' ? { note: 'a copy' } : {})}
    >
      {demoMode ? (
        // The mock agents have no worktree at all, so there is nothing to fail to find.
        <Nothing>no folder</Nothing>
      ) : here === undefined ? (
        <Nothing>reading</Nothing>
      ) : !here.present ? (
        <Nothing>folder not found</Nothing>
      ) : (
        <div className="fttree">
          <Rows
            dirs={here.dirs}
            path=""
            depth={0}
            open={open}
            onToggle={(at) =>
              setExpanded((was) => ({
                ...was,
                [key]: (was[key] ?? []).includes(at)
                  ? (was[key] ?? []).filter((one) => one !== at)
                  : [...(was[key] ?? []), at],
              }))
            }
            onOpenFile={(at) => void window.blobot.openInWorkspace(teamId ?? '', agentId ?? '', at)}
          />
        </div>
      )}
    </SidebarShell>
  );
}

/** One directory's rows, and the rows of any directory under it the user has opened. */
function Rows({
  dirs,
  path,
  depth,
  open,
  onToggle,
  onOpenFile,
}: {
  dirs: Record<string, UiTreeDirectory>;
  path: string;
  depth: number;
  open: readonly string[];
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
}): React.JSX.Element | null {
  const directory = dirs[path];
  if (directory === undefined) return null;
  return (
    <>
      {directory.entries.map((entry) => {
        const at = path === '' ? entry.name : `${path}/${entry.name}`;
        const isOpen = open.includes(at);
        return (
          <div key={at}>
            <Row
              entry={entry}
              depth={depth}
              open={isOpen}
              tracked={directory.tracked}
              onClick={() => (entry.kind === 'directory' ? onToggle(at) : onOpenFile(at))}
            />
            {entry.kind === 'directory' && isOpen && (
              <Rows
                dirs={dirs}
                path={at}
                depth={depth + 1}
                open={open}
                onToggle={onToggle}
                onOpenFile={onOpenFile}
              />
            )}
          </div>
        );
      })}
      {/* `churn.ts`'s honesty rather than a silent truncation: a stated number, and the row
          count is the floor it is a floor of. */}
      {directory.partial === true && (
        <div className="ftmore mono muted" style={{ paddingLeft: 10 + depth * 13 }}>
          first {directory.entries.length}
        </div>
      )}
    </>
  );
}

/**
 * Four columns, three of them fixed: chevron, mark, name, and the status column parked at the
 * panel's right edge.
 *
 * The status column is a **value in mono**, which is what mono is for. Its cost is accepted
 * rather than overlooked: at 320px a name and its `M` sit 200px apart, and the column at a
 * measured offset is on the shelf if that reads badly in use.
 *
 * Decoration is **weight and a mono mark**, and they say two different things. The
 * **weight** is *this file is part of what this agent did on this branch* — it survives the
 * agent committing, which is the ordinary case and which used to empty the whole tree. The
 * **mark** is *and it is not committed yet* — and the mark carries git's own hue, `?` added and
 * `M` modified, which is the third and last place `DESIGN.md` spends saturation on something
 * that is not a blobatar. An ignored row dims, and is shown rather than hidden because the agent
 * can see it.
 */
function Row({
  entry,
  depth,
  open,
  tracked,
  onClick,
}: {
  entry: UiTreeEntry;
  depth: number;
  open: boolean;
  tracked: boolean;
  onClick: () => void;
}): React.JSX.Element {
  // The count is the value where there is one, and the mark is the hue in either case: on a
  // file the letter is both, on a directory the letter is folded from what is underneath and
  // only ever colours the number.
  const value = entry.changes === undefined ? entry.mark : String(entry.changes);
  // Absent, not empty, where git could not answer: an empty column reads as *nothing changed*.
  // A repository root inside a nested workspace is the exception, and it is the seam.
  const says = tracked || entry.repoRoot === true;
  return (
    <button
      type="button"
      className={`ftrow${entry.ignored === true ? ' dim' : ''}${entry.touched === true ? ' on' : ''}`}
      style={{ paddingLeft: 6 + depth * 13 }}
      onClick={onClick}
    >
      <span className="chev">
        {entry.kind === 'directory' && (
          <ChevronRight size={11} aria-hidden style={{ rotate: open ? '90deg' : '0deg' }} />
        )}
      </span>
      <FileIcon name={entry.name} kind={entry.kind} open={open} />
      <span className="nm">{entry.name}</span>
      {says && value !== undefined && (
        // Hue off the mark: `?` is git's *added*, `M` is git's *modified*, the two letters people
        // already read in colour everywhere they meet a working tree. A folder takes the fold of
        // what is under it, so a count is coloured by kind without a walk and without a third
        // letter, and a folder whose work is all committed keeps the muted count it had.
        <span
          className={`st mono${entry.mark === '?' ? ' add' : entry.mark === 'M' ? ' mod' : ''}`}
        >
          {value}
        </span>
      )}
    </button>
  );
}


