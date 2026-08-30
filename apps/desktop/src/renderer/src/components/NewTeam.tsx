import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import type {
  NewTeamSpec,
  UiAgentProfile,
  UiRuntimeChoice,
  UiWorkspaceInspection,
} from '../../../shared/api.js';
import { HireAgent } from './AgentForm.js';
import { Blob } from './Blob.js';

/**
 * Forming a team: a Workspace, a name, and agents that already exist.
 *
 * The order on this screen is the domain model. Agents are hired once and live in *your
 * agents*, on no team; a team is formed **out of** them, and the same agent can be on several
 * at once. Hiring one from here is a convenience, not the way agents come into being.
 *
 * Two things this screen refuses to do. It never says *authenticated* — detection observes
 * whether a credential is present, which is not the same claim, so the words are ticket 11's
 * four honest states. And **it never gates on detection**: a runtime that reports "needs
 * sign-in" is still selectable, because a negative probe is not proof the user cannot sign in
 * between here and the first turn.
 *
 * It is the one editorial page in the app, and deliberately so. Everywhere else is a working
 * surface where the blobatars are the loudest thing; this is read once, start to finish, before
 * anything exists — so it is set like a page rather than a form, with a serif display face, its
 * steps numbered, and one question at a time.
 *
 * Ticket 14's disclosure is the last thing on it, above the button that spawns the first agent:
 * stated, never consented to. There is no checkbox, because a checkbox implies the risk has
 * been discharged onto the user, and what actually happened is that blobot picked a default and
 * is telling them what it is.
 */
export function NewTeam({
  onCancel,
  onCreated,
}: {
  onCancel?: () => void;
  onCreated: () => void;
}): React.JSX.Element {
  const [path, setPath] = useState<string>('');
  const [inspection, setInspection] = useState<UiWorkspaceInspection | undefined>();
  const [name, setName] = useState('');
  const [turnBudget, setTurnBudget] = useState(10);
  const [runtimes, setRuntimes] = useState<readonly UiRuntimeChoice[]>([]);
  const [roster, setRoster] = useState<readonly UiAgentProfile[]>([]);
  const [chosen, setChosen] = useState<readonly string[]>([]);
  /** `nested` only: the repositories in scope. Every one found is ticked by default. */
  const [repos, setRepos] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | undefined>();
  /** Inspecting a big folder takes seconds, and a screen that does not say so looks broken. */
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hiring, setHiring] = useState(false);

  const reloadRoster = useCallback(async (): Promise<void> => {
    setRoster(await window.blobot.listAgents());
  }, []);

  useEffect(() => {
    void window.blobot.detectRuntimes().then(setRuntimes);
    void reloadRoster();
  }, [reloadRoster]);

  /**
   * The chosen path lands on screen *first*, and the inspection fills in behind it.
   *
   * Looking at a folder means walking two levels of it and asking git about every repository
   * inside, which is milliseconds on a project and seconds on a home directory. Waiting for
   * that before showing anything is why picking a folder used to look like it had not worked.
   */
  const readWorkspace = async (chosenPath: string, initialize = false): Promise<void> => {
    setError(undefined);
    setPath(chosenPath);
    if (name === '') setName(basename(chosenPath));
    setInspection(undefined);
    setReading(true);
    try {
      const result = initialize
        ? await window.blobot.initializeWorkspace(chosenPath)
        : await window.blobot.inspectWorkspace(chosenPath);
      if ('error' in result) {
        setInspection(undefined);
        setError(result.error);
        return;
      }
      setInspection(result);
      setRepos(result.repos.map((repo) => repo.path));
      setPath(result.path);
    } finally {
      setReading(false);
    }
  };

  const choose = async (): Promise<void> => {
    const chosenPath = await window.blobot.chooseWorkspace();
    if (chosenPath === undefined) return;
    await readWorkspace(chosenPath);
  };

  // Every kind of Workspace can carry a team now. What still blocks is a repository with
  // nothing to branch from, and a folder of repositories with nothing at all in scope.
  const workspaceUsable =
    inspection !== undefined &&
    (inspection.kind === 'git'
      ? inspection.hasCommits
      : inspection.kind === 'nested'
        ? repos.length > 0 || inspection.looseFiles
        : true);
  const ready = !reading && workspaceUsable && name.trim() !== '' && chosen.length > 0;

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const spec: NewTeamSpec = {
      name: name.trim(),
      workspacePath: path,
      turnBudget,
      profileIds: chosen,
      ...(inspection?.kind === 'nested' ? { repoPaths: repos } : {}),
    };
    const result = await window.blobot.createTeam(spec);
    setBusy(false);
    if (result.ok) onCreated();
    else setError(result.error ?? 'The team could not be created.');
  };

  return (
    <div className="newteam">
      <div className="sheet">
        <header className="sheethead">
          <div>
            <div className="eyebrow mono">NEW TEAM</div>
            <h1 className="display">Who is on this one?</h1>
            <p className="standfirst">
              A team is a folder to work in and the agents you put on it. Both are things you can
              change your mind about later.
            </p>
          </div>
          {onCancel !== undefined && (
            <button className="iconbtn" onClick={onCancel} title="Cancel" aria-label="Cancel">
              <X size={17} aria-hidden />
            </button>
          )}
        </header>

        <Step n="01" title="The folder they work in">
          <div className="row">
            <button className="btn" onClick={() => void choose()}>
              choose a folder…
            </button>
            <span className="pathline mono">{path === '' ? 'nothing chosen yet' : path}</span>
          </div>
          {reading && (
            <div className="note mono muted">looking through this folder for repositories…</div>
          )}
          {inspection !== undefined && (
            <WorkspaceNote inspection={inspection} onInit={() => void readWorkspace(path, true)} />
          )}
          {inspection?.kind === 'nested' && (
            <RepoScope
              inspection={inspection}
              chosen={repos}
              onToggle={(repo) =>
                setRepos((current) =>
                  current.includes(repo)
                    ? current.filter((other) => other !== repo)
                    : [...current, repo],
                )
              }
            />
          )}
        </Step>

        <Step n="02" title="What the team is called">
          <input
            className="field"
            value={name}
            placeholder="checkout"
            onChange={(event) => setName(event.target.value)}
          />
          {/* Load-bearing rather than cosmetic: the branch is `blobot/<team>/<agent>`. */}
          <div className="note muted">
            Becomes half of each agent&apos;s branch name, so it has to be unique.
          </div>
        </Step>

        <Step
          n="03"
          title="Who joins"
          aside={
            <button className="btn" onClick={() => setHiring(true)}>
              hire an agent
            </button>
          }
        >
          {roster.length === 0 ? (
            <div className="note muted">
              Nobody hired yet. Agents exist on their own: hire one and it can join this team and
              any other.
            </div>
          ) : (
            <div className="roster">
              {roster.map((agent) => {
                const picked = chosen.includes(agent.id);
                return (
                  <button
                    key={agent.id}
                    className={`rosterrow${picked ? ' on' : ''}`}
                    onClick={() =>
                      setChosen(
                        picked ? chosen.filter((id) => id !== agent.id) : [...chosen, agent.id],
                      )
                    }
                  >
                    {/* The same face it will wear in the rail and the transcript, so the roster
                        is recognisably the same set of agents rather than a list of names. */}
                    <Blob name={agent.name} size={34} hue={agent.hue} />
                    <span className="who">
                      <span className="nm">
                        <b>{agent.name}</b> <span className="muted">{agent.role}</span>
                      </span>
                      {/* Where the model shows: an agent is on N teams, and this is one more. */}
                      <span className="sub mono muted">
                        {agent.runtimeLabel}
                        {agent.teams.length === 0
                          ? ' · on no team'
                          : ` · on ${agent.teams.join(', ')}`}
                      </span>
                    </span>
                    <span className={`tick${picked ? ' on' : ''}`}>
                      {picked && <Check size={14} aria-hidden />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Step>

        <Step n="04" title="How far they go on their own">
          <div className="row">
            <input
              className="field narrow"
              type="number"
              min={1}
              max={100}
              value={turnBudget}
              onChange={(event) => setTurnBudget(Math.max(1, Number(event.target.value) || 1))}
            />
            <span className="note muted">
              Agent turns per prompt from you, before the team halts and asks.
            </span>
          </div>
        </Step>

        <Disclosure
          agents={roster.filter((agent) => chosen.includes(agent.id)).map((agent) => agent.name)}
          path={path}
          kind={inspection?.kind}
        />

        {error !== undefined && <div className="refusal">{error}</div>}

        <div className="sheetfoot">
          <button className="btn primary" disabled={!ready || busy} onClick={() => void create()}>
            {busy ? 'creating…' : 'create team'}
          </button>
        </div>
      </div>

      {hiring && (
        <HireAgent
          runtimes={runtimes}
          onClose={() => setHiring(false)}
          onHired={async (profileId) => {
            await reloadRoster();
            setChosen((current) => [...current, profileId]);
            setHiring(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * What the user is taking on, once, at the moment they point autonomous processes at a folder
 * they care about.
 *
 * It is a statement and not a step: no number, no control, nothing to agree to. The one thing
 * it must never do is claim more protection than blobot can deliver, so it says what blobot
 * actually arranged (each runtime is set to prompt) rather than naming commands it can only name
 * on some runtimes. See the 2026-08-29 amendment on ticket 14, which took a list of OpenCode's
 * out of this copy.
 */
function Disclosure({
  agents,
  path,
  kind,
}: {
  agents: readonly string[];
  path: string;
  kind: UiWorkspaceInspection['kind'] | undefined;
}): React.JSX.Element {
  // Named once anybody is chosen, because the sentence is about those two agents and a folder
  // the user just picked, not about a product.
  const who =
    agents.length === 0
      ? 'Every agent on this team'
      : agents.length === 1
        ? (agents[0] as string)
        : `${agents.slice(0, -1).join(', ')} and ${agents.at(-1) as string}`;
  const get = agents.length > 1 ? 'each get' : 'gets';
  const where = path === '' ? 'this folder' : basename(path);
  // A copy has no branch, and this is the sentence that would quietly promise one.
  const copy = kind === 'plain' ? 'their own copy' : 'their own copy, on their own branch';


  return (
    <section className="disclosure">
      <h2 className="subhead">Before you create this team</h2>
      <p>
        {who} {get} {copy} of <b>{where}</b>. Inside that copy they can read, edit and run
        commands without asking you.
      </p>
      <p>
        They ask before things that reach outside that copy or cannot be undone. blobot sets each
        agent&apos;s runtime to prompt, and it is the runtime that decides what counts, not a
        list blobot wrote. When you are asked, the question appears in the conversation and the
        agent waits for you.
      </p>
      <p>
        They also have whatever tools your own MCP servers provide, and blobot does not prompt
        for those.
      </p>
      <p>
        <b>blobot is not a sandbox.</b>
      </p>
    </section>
  );
}

/** One numbered step. The numeral is the editorial device that makes this a page, not a form. */
function Step({
  n,
  title,
  aside,
  children,
}: {
  n: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="step">
      <div className="stephead">
        <span className="stepn mono">{n}</span>
        <h2 className="subhead">{title}</h2>
        {aside !== undefined && <span className="stepaside">{aside}</span>}
      </div>
      <div className="stepbody">{children}</div>
    </section>
  );
}

/**
 * What the chosen folder is, and therefore what the agents are about to get.
 *
 * Every kind is usable now; the note's job is that the *guarantees* differ and a user told
 * nothing will assume the strongest. A copy has no branch, no diff and no recovery, and this
 * is the only place that can say so before the team exists.
 */
function WorkspaceNote({
  inspection,
  onInit,
}: {
  inspection: UiWorkspaceInspection;
  onInit: () => void;
}): React.JSX.Element {
  if (inspection.kind === 'plain') {
    return (
      <div className="note">
        <span className="muted">
          Not a git repository, which is fine. Each agent gets its own copy of this folder. No
          branch, no diff of what changed, and blobot cannot recover a copy that is deleted.{' '}
        </span>
        {/* Offered, never silent: creating a `.git` in someone's directory is a real change.
            A choice now rather than a gate — the team works either way. */}
        <button className="btn" onClick={onInit}>
          run git init here
        </button>
      </div>
    );
  }
  if (inspection.kind === 'nested') {
    return (
      <div className="note mono muted">
        {inspection.repos.length} repositories in this folder · each agent gets a worktree of the
        ones you pick{inspection.looseFiles ? ', and a copy of everything else' : ''}
      </div>
    );
  }
  if (!inspection.hasCommits) {
    return (
      <div className="refusal">
        No commits yet, so there is nothing to branch an agent&apos;s workspace from. Make one
        commit and choose the folder again.
      </div>
    );
  }
  return (
    <div className="note mono muted">
      git{inspection.branch === undefined ? '' : ` · on ${inspection.branch}`}
      {inspection.dirty
        ? ' · uncommitted changes live in no agent’s workspace, so the agents will not see them'
        : ' · clean'}
    </div>
  );
}

/**
 * Which repositories the agents may work in.
 *
 * Everything found is ticked, because that is what the user pointed at. Unticking is how a
 * `~/code` with twenty projects avoids twenty `blobot/<team>/<agent>` branches and twenty
 * checkouts per agent — and a repository left out is **absent** from the agent's workspace
 * rather than present and off limits, which is the only version of "out of scope" an agent
 * with shell access cannot ignore.
 */
function RepoScope({
  inspection,
  chosen,
  onToggle,
}: {
  inspection: UiWorkspaceInspection;
  chosen: readonly string[];
  onToggle: (repo: string) => void;
}): React.JSX.Element {
  return (
    <div className="reposcope">
      <div className="fieldlabel mono">REPOSITORIES IN SCOPE</div>
      {inspection.repos.map((repo) => {
        const on = chosen.includes(repo.path);
        return (
          <button
            key={repo.path}
            className={`rosterrow${on ? ' on' : ''}`}
            onClick={() => onToggle(repo.path)}
            // A repository with no commits has nothing to branch from. It is skipped with a
            // reason rather than refusing the whole team — one empty project in a folder of
            // twenty must not stop anybody working.
            disabled={!repo.hasCommits}
          >
            <span className="who">
              <span className="nm">
                <b>{repo.path}</b>
              </span>
              <span className="sub mono muted">
                {repo.hasCommits
                  ? `${repo.branch ?? 'detached'}${repo.dirty ? ' · uncommitted changes' : ''}`
                  : 'no commits yet, nothing to branch from, so it is left out'}
              </span>
            </span>
            <span className={`tick${on && repo.hasCommits ? ' on' : ''}`}>
              {on && repo.hasCommits && <Check size={14} aria-hidden />}
            </span>
          </button>
        );
      })}
      {chosen.length === 0 && !inspection.looseFiles && (
        <div className="refusal">Nothing is in scope. Pick at least one repository.</div>
      )}
    </div>
  );
}

function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? '';
}
