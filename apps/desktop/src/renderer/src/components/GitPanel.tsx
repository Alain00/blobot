import { useEffect, useState } from 'react';
import type {
  UiAgent,
  UiChangedFile,
  UiCommitSelection,
  UiWorkspaceChanges,
  UiWorkspaceStatus,
} from '../../../shared/api.js';
import type { Pane } from '../model.js';
import { Nothing, SidebarShell, type SidebarPanelKind } from './SidebarShell.js';

/**
 * What has changed in the agent's workspace, and committing the part of it you mean.
 *
 * The file tree answers *where is this file*; this answers *what changed, and what am I about to
 * commit*. Flattening the tree to get the second would have destroyed the first, which is why
 * this is a second panel behind the foot switch rather than a mode of the tree.
 *
 * **The ticks are blobot's own selection and never the git index.** An AgentWorkspace's index
 * belongs to the agent working in it too, so writing it here would move state under a running
 * turn and leave a half-staged worktree behind if the app closed. `git commit -- <paths>` is a
 * partial commit that reads the worktree and leaves the index exactly as it was. The one
 * exception git forces is a **new file**, which cannot be named in a pathspec until it is added;
 * that add is bounded to the files being committed and taken back if the commit is refused. The
 * word *staged* is therefore not in this panel's vocabulary at all.
 *
 * **The commit is the user's**: nothing an agent does can reach this, `git commit` is on no trust
 * level's allowlist, no runtime is told it happened, and nothing enters a session.
 *
 * **The commands are not shown**, which narrows a rule this app keeps elsewhere: `claude auth
 * login` and `gh pr create` are printed in full before they run. Withdrawn here by the author on
 * sight, and the two are different acts — those reach the network or the user's account with
 * arguments they cannot see, where this is a local commit in the agent's own worktree whose two
 * variables, the message and the ticks, are the panel itself. `commitPlan` stays on the wire and
 * unused by this panel.
 */
export function GitPanel({
  teamId,
  pane,
  agents,
  workspaces,
  demoMode,
  revision,
  busy,
  panel,
  onPanel,
  onSelectAgent,
  onSelectTeam,
  onCommitted,
}: {
  teamId: string | undefined;
  pane: Pane;
  agents: readonly UiAgent[];
  workspaces: readonly UiWorkspaceStatus[];
  demoMode: boolean;
  /** `AppState.settled`. The panel follows the work off the tree's own signal, and on no timer. */
  revision: number;
  /**
   * This agent is mid-turn.
   *
   * A commit taken now captures a file the agent is halfway through writing, and the result is
   * not a state anything was ever in. The tray has refused this since the control existed, and it
   * says so rather than disappearing, because a control that vanishes while an agent happens to
   * be thinking reads as a bug.
   */
  busy: boolean;
  panel: SidebarPanelKind;
  onPanel: (panel: SidebarPanelKind) => void;
  onSelectAgent: (agentId: string) => void;
  onSelectTeam: () => void;
  /** The worktree moved, so every other reading of it is now a second old. */
  onCommitted: () => void;
}): React.JSX.Element {
  const agentId = pane.kind === 'agent' ? pane.agentId : undefined;
  const key = `${teamId ?? ''}/${agentId ?? ''}`;
  const [repo, setRepo] = useState<Record<string, string>>({});
  const [reading, setReading] = useState<{ key: string; changes: UiWorkspaceChanges } | undefined>();
  /**
   * The paths the user has *un*ticked, per `<team>/<agent>`.
   *
   * Held as the exclusions rather than as the selection, which is what makes the refresh
   * harmless: a file that appears mid-selection arrives ticked like everything else, and one
   * that disappears drops out without leaving a stale tick behind. Everything ticked is the
   * commonest case by a distance, and it is the case that costs nothing to hold.
   */
  const [off, setOff] = useState<Record<string, readonly string[]>>({});
  const [message, setMessage] = useState('');
  const [said, setSaid] = useState<string | undefined>();
  const [running, setRunning] = useState(false);
  /** Bumped by a commit of our own, which is a change to the worktree nothing else will report. */
  const [beat, setBeat] = useState(0);

  const at = repo[key];
  useEffect(() => {
    if (teamId === undefined || agentId === undefined) return;
    let live = true;
    void window.blobot
      .workspaceChanges(teamId, agentId, at)
      .then((changes) => {
        if (live) setReading({ key, changes });
      })
      .catch(() => {
        if (live) setReading(undefined);
      });
    return () => {
      live = false;
    };
  }, [teamId, agentId, key, at, revision, beat]);

  const agent = agents.find((row) => row.id === agentId);
  const here = reading?.key === key ? reading.changes : undefined;
  const excluded = off[key] ?? [];
  const rows = here?.rows ?? [];
  const picked = rows.filter((row) => !excluded.includes(row.path));
  const shell = { agents, workspaces, panel, onPanel, onSelectAgent, onSelectTeam } as const;

  function selectionOf(): UiCommitSelection {
    // Everything ticked commits the whole worktree, which is what the tray has always done and
    // is not the same act as naming every path: a file that appeared between the read and the
    // click belongs in a commit the user meant as *all of it*.
    const all = picked.length === rows.length;
    const paths = picked.flatMap((row) => (row.from === undefined ? [row.path] : [row.path, row.from]));
    const fresh = picked.filter((row) => row.untracked === true).map((row) => row.path);
    return {
      ...(all ? {} : { paths, ...(fresh.length === 0 ? {} : { untracked: fresh }) }),
      ...(here?.repo === undefined || here.repo === '' ? {} : { repo: here.repo }),
    };
  }

  const commit = async (): Promise<void> => {
    if (teamId === undefined || agentId === undefined || message.trim() === '' || busy) return;
    setRunning(true);
    const result = await window.blobot.commitWork(teamId, agentId, message, selectionOf());
    setRunning(false);
    // git's own sentence on the way out, `nothing to commit` included. In place, because this is
    // where the act was: nothing about a commit belongs in the transcript, which is what agents
    // did.
    setSaid(result.ok ? `committed ${result.sha}` : result.error);
    if (result.ok) {
      setMessage('');
      setOff((was) => ({ ...was, [key]: [] }));
      setBeat((was) => was + 1);
      onCommitted();
    }
  };

  return (
    <SidebarShell
      {...shell}
      agent={agent}
      fill={rows.length > 0}
      {...(here?.kind === 'plain' ? { note: 'a copy' } : {})}
    >
      {demoMode ? (
        <Nothing>no folder</Nothing>
      ) : here === undefined ? (
        <Nothing>reading</Nothing>
      ) : !here.present ? (
        <Nothing>folder not found</Nothing>
      ) : here.kind === 'plain' ? (
        // A copy has no git in it, so there is nothing to show and nothing to offer. The tree
        // says the same thing by leaving its status column absent rather than empty.
        <Nothing>a copy has no git</Nothing>
      ) : here.kind === 'nested' && (here.repo === undefined || here.repo === '') ? (
        <Repos repos={here.repos ?? []} onPick={(one) => setRepo((was) => ({ ...was, [key]: one }))} />
      ) : rows.length === 0 ? (
        <Nothing>nothing to commit</Nothing>
      ) : (
        <div className="gitpanel">
          <div className="gitlist">
          <div className="githead">
            <span className="wschurn">
              <span className="wsadd">+{here.added}</span>
              <span className="wsdel">−{here.removed}</span>
            </span>
            <span className="grow" />
            <button
              type="button"
              className="gitall"
              onClick={() =>
                setOff((was) => ({
                  ...was,
                  [key]: picked.length === rows.length ? rows.map((row) => row.path) : [],
                }))
              }
            >
              {picked.length === rows.length ? 'none' : 'all'}
            </button>
          </div>
          <Section
            label="tracked"
            rows={rows.filter((row) => row.untracked !== true)}
            excluded={excluded}
            onToggle={(path) => setOff((was) => toggle(was, key, path))}
            onOpen={(path) => void window.blobot.openInWorkspace(teamId ?? '', agentId ?? '', path)}
          />
          <Section
            label="untracked"
            rows={rows.filter((row) => row.untracked === true)}
            excluded={excluded}
            onToggle={(path) => setOff((was) => toggle(was, key, path))}
            onOpen={(path) => void window.blobot.openInWorkspace(teamId ?? '', agentId ?? '', path)}
          />
          {here.partial === true && (
            <div className="ftmore mono muted">first {rows.length}</div>
          )}
          </div>
          {/* The composer, at the foot and pinned there: the list scrolls under it, so the act
              stays put however long the list is. The composer's own shape, one flank over — a
              field with the button that sends it inside its own border, because a message and
              the act of taking it are one thing and were drawn as two. */}
          <div className="gitfoot">
            {/* The refusal is a line over the field rather than a word in the button: the button
                is inside the field's own border now and has room for one word. Said rather than
                hidden, because a control that vanishes while an agent happens to be thinking
                reads as a bug. */}
            {busy ? (
              <div className="gitsaid mono muted">this agent is working</div>
            ) : (
              said !== undefined && <div className="gitsaid mono muted">{said}</div>
            )}
            <div className="gitentry">
              <textarea
                className="gitmsg"
                placeholder="what this commit does"
                value={message}
                rows={2}
                onChange={(event) => setMessage(event.target.value)}
                // A message can be more than a line, so the field is a textarea and enter is a
                // newline — except with the modifier the composer already uses for *send it*.
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
                  event.preventDefault();
                  void commit();
                }}
              />
              <button
                type="button"
                className="gitcommit"
                disabled={busy || running || message.trim() === '' || picked.length === 0}
                title={busy ? 'this agent is working' : 'commit what is ticked'}
                onClick={() => void commit()}
              >
                {running ? 'committing' : busy ? 'working' : 'commit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SidebarShell>
  );
}

function toggle(
  was: Record<string, readonly string[]>,
  key: string,
  path: string,
): Record<string, readonly string[]> {
  const now = was[key] ?? [];
  return { ...was, [key]: now.includes(path) ? now.filter((one) => one !== path) : [...now, path] };
}

/**
 * A nested Workspace has a HEAD per repository, so there is no single commit to make.
 *
 * It answers with the repositories rather than picking one, which is the same refusal the branch
 * menu already makes for the same reason.
 */
function Repos({
  repos,
  onPick,
}: {
  repos: readonly string[];
  onPick: (repo: string) => void;
}): React.JSX.Element {
  if (repos.length === 0) return <Nothing>no repository here</Nothing>;
  return (
    <div className="ftfaces">
      {repos.map((repo) => (
        <button key={repo} type="button" className="ftface" onClick={() => onPick(repo)}>
          <span className="nm">{repo}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Tracked and untracked, in that order, and never one sorted list.
 *
 * Untracked is the half you commit blind — a file nobody has ever reviewed a line of — so it
 * earns its own heading rather than being mixed in among files git already knows.
 */
function Section({
  label,
  rows,
  excluded,
  onToggle,
  onOpen,
}: {
  label: string;
  rows: readonly UiChangedFile[];
  excluded: readonly string[];
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
}): React.JSX.Element | null {
  if (rows.length === 0) return null;
  return (
    <>
      <div className="gitlabel mono muted">{label}</div>
      {rows.map((row) => (
        <Row
          key={row.path}
          row={row}
          on={!excluded.includes(row.path)}
          onToggle={() => onToggle(row.path)}
          onOpen={() => onOpen(row.path)}
        />
      ))}
    </>
  );
}

/**
 * A tick, a name, the folder it is in, and `+96 −0`.
 *
 * **No file icon.** The Material set earned its exception in the tree because a tree is scanned
 * by shape; a flat list of changed files is read by name, and a glyph per row here would be
 * decoration wearing a rule's exemption.
 *
 * Pressing the row toggles the tick, and pressing the **name** opens the file in the user's own
 * editor — the tree's act, with the tree's guard, since the panel is a window onto the work in
 * exactly the same sense.
 */
function Row({
  row,
  on,
  onToggle,
  onOpen,
}: {
  row: UiChangedFile;
  on: boolean;
  onToggle: () => void;
  onOpen: () => void;
}): React.JSX.Element {
  const cut = row.path.lastIndexOf('/');
  const name = cut === -1 ? row.path : row.path.slice(cut + 1);
  const under = cut === -1 ? '' : row.path.slice(0, cut);
  return (
    <div className={`gitrow${on ? ' on' : ''}`}>
      <button
        type="button"
        className="gittick"
        role="checkbox"
        aria-checked={on}
        aria-label={row.path}
        onClick={onToggle}
      />
      <button
        type="button"
        className="gitname"
        onClick={onOpen}
        title={row.from === undefined ? row.path : `${row.from} → ${row.path}`}
      >
        <span className="nm">{name}</span>
        {under !== '' && <span className="at">{under}</span>}
      </button>
      <span className="wschurn">
        <span className="wsadd">+{row.added}</span>
        <span className="wsdel">−{row.removed}</span>
      </span>
    </div>
  );
}
