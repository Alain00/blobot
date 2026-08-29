import { useCallback, useEffect, useState } from 'react';
import type {
  NewTeamSpec,
  UiAgentProfile,
  UiRuntimeChoice,
  UiWorkspaceInspection,
} from '../../../shared/api.js';

const READINESS_WORD: Record<UiRuntimeChoice['readiness'], string> = {
  ready: 'ready',
  needs_sign_in: 'needs sign-in',
  not_installed: 'not installed',
  unknown: 'status unknown',
};

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
 * Ticket 14's disclosure belongs on this screen, once, before the first agent is spawned. It
 * is not here yet — see `build.md`.
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
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const reloadRoster = useCallback(async (): Promise<void> => {
    setRoster(await window.blobot.listAgents());
  }, []);

  useEffect(() => {
    void window.blobot.detectRuntimes().then(setRuntimes);
    void reloadRoster();
  }, [reloadRoster]);

  const readWorkspace = async (chosenPath: string, initialize = false): Promise<void> => {
    setError(undefined);
    const result = initialize
      ? await window.blobot.initializeWorkspace(chosenPath)
      : await window.blobot.inspectWorkspace(chosenPath);
    if ('error' in result) {
      setInspection(undefined);
      setError(result.error);
      return;
    }
    setInspection(result);
    setPath(result.path);
    if (name === '') setName(basename(result.path));
  };

  const choose = async (): Promise<void> => {
    const chosenPath = await window.blobot.chooseWorkspace();
    if (chosenPath === undefined) return;
    await readWorkspace(chosenPath);
  };

  const ready =
    inspection !== undefined &&
    inspection.kind === 'git' &&
    inspection.hasCommits &&
    name.trim() !== '' &&
    chosen.length > 0;

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const spec: NewTeamSpec = {
      name: name.trim(),
      workspacePath: path,
      turnBudget,
      profileIds: chosen,
    };
    const result = await window.blobot.createTeam(spec);
    setBusy(false);
    if (result.ok) onCreated();
    else setError(result.error ?? 'The team could not be created.');
  };

  return (
    <div className="newteam">
      <div className="sheet">
        <div className="sheethead">
          <span className="mono muted">NEW TEAM</span>
          <span className="hand">who is on this one?</span>
          {onCancel !== undefined && (
            <button className="send" onClick={onCancel}>
              cancel
            </button>
          )}
        </div>

        <section>
          <div className="fieldlabel mono">WORKSPACE</div>
          <div className="row">
            <button className="send" onClick={() => void choose()}>
              choose a folder…
            </button>
            <span className="pathline mono">{path === '' ? 'nothing chosen yet' : path}</span>
          </div>
          {inspection !== undefined && (
            <WorkspaceNote inspection={inspection} onInit={() => void readWorkspace(path, true)} />
          )}
        </section>

        <section>
          <div className="fieldlabel mono">TEAM NAME</div>
          <input
            className="textfield"
            value={name}
            placeholder="checkout"
            onChange={(event) => setName(event.target.value)}
          />
          {/* Load-bearing rather than cosmetic: the branch is `blobot/<team>/<agent>`. */}
          <div className="note mono muted">
            Becomes half of each agent&apos;s branch name, so it has to be unique.
          </div>
        </section>

        <section>
          <div className="fieldlabel mono">YOUR AGENTS</div>
          {roster.length === 0 && (
            <div className="note mono muted">
              Nobody hired yet. Agents exist on their own — hire one below and it can join this
              team and any other.
            </div>
          )}
          {roster.map((agent) => {
            const picked = chosen.includes(agent.id);
            return (
              <button
                key={agent.id}
                className={`rosterrow${picked ? ' on' : ''}`}
                onClick={() =>
                  setChosen(picked ? chosen.filter((id) => id !== agent.id) : [...chosen, agent.id])
                }
              >
                <span className="tick mono">{picked ? '✓' : ''}</span>
                <span className="who">
                  <span className="nm">
                    <b>{agent.name}</b> <span className="muted">{agent.role}</span>
                  </span>
                  {/* Where the model shows: an agent is on N teams, and this is one more. */}
                  <span className="sub mono muted">
                    {agent.runtimeLabel}
                    {agent.teams.length === 0 ? ' · on no team' : ` · on ${agent.teams.join(', ')}`}
                  </span>
                </span>
              </button>
            );
          })}
          <HireAgent
            runtimes={runtimes}
            onHired={async (profileId) => {
              await reloadRoster();
              setChosen((current) => [...current, profileId]);
            }}
          />
        </section>

        <section className="budgetrow">
          <div className="fieldlabel mono">TURN BUDGET</div>
          <input
            className="textfield narrow"
            type="number"
            min={1}
            max={100}
            value={turnBudget}
            onChange={(event) => setTurnBudget(Math.max(1, Number(event.target.value) || 1))}
          />
          <span className="note mono muted">
            Agent turns per prompt from you, before the team halts and asks.
          </span>
        </section>

        {error !== undefined && <div className="refusal">{error}</div>}

        <div className="sheetfoot">
          <button className="send" disabled={!ready || busy} onClick={() => void create()}>
            {busy ? 'creating…' : 'create team'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hiring an agent. It exists after this whether or not this team is ever created. */
function HireAgent({
  runtimes,
  onHired,
}: {
  runtimes: readonly UiRuntimeChoice[];
  onHired: (profileId: string) => Promise<void> | void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [instructions, setInstructions] = useState('');
  const [runtimeId, setRuntimeId] = useState('');
  const [error, setError] = useState<string | undefined>();

  const preferred = runtimes.find((runtime) => runtime.supported)?.runtimeId ?? '';
  const selected = runtimeId === '' ? preferred : runtimeId;
  const runtime = runtimes.find((entry) => entry.runtimeId === selected);

  if (!open) {
    return (
      <button className="send" onClick={() => setOpen(true)}>
        hire an agent
      </button>
    );
  }

  const hire = async (): Promise<void> => {
    const result = await window.blobot.hireAgent({
      name,
      role,
      runtimeId: selected,
      ...(instructions.trim() === '' ? {} : { instructions }),
    });
    if (!result.ok || result.profileId === undefined) {
      setError(result.error ?? 'The agent could not be hired.');
      return;
    }
    await onHired(result.profileId);
    setOpen(false);
    setName('');
    setRole('');
    setInstructions('');
    setError(undefined);
  };

  return (
    <div className="hire">
      <div className="agentdraft">
        <input
          className="textfield"
          value={name}
          placeholder="name"
          onChange={(event) => setName(event.target.value)}
        />
        <input
          className="textfield"
          value={role}
          placeholder="role"
          onChange={(event) => setRole(event.target.value)}
        />
        <select
          className="textfield"
          value={selected}
          onChange={(event) => setRuntimeId(event.target.value)}
        >
          {runtimes.map((entry) => (
            <option key={entry.runtimeId} value={entry.runtimeId} disabled={!entry.supported}>
              {entry.label}
              {entry.supported ? '' : ' — no adapter yet'}
            </option>
          ))}
        </select>
        <button className="send" disabled={name.trim() === ''} onClick={() => void hire()}>
          hire
        </button>
        {runtime !== undefined && (
          <span className="runtimenote mono muted">
            {READINESS_WORD[runtime.readiness]}
            {runtime.version === undefined ? '' : ` · ${runtime.version}`} — {runtime.detail}
          </span>
        )}
      </div>
      <textarea
        className="textfield"
        rows={2}
        value={instructions}
        placeholder="standing instructions — anything true of this agent on every team (optional)"
        onChange={(event) => setInstructions(event.target.value)}
      />
      {error !== undefined && <div className="refusal">{error}</div>}
    </div>
  );
}

/** The three things `inspect()` can say, in the words the flow acts on. */
function WorkspaceNote({
  inspection,
  onInit,
}: {
  inspection: UiWorkspaceInspection;
  onInit: () => void;
}): React.JSX.Element {
  if (inspection.kind !== 'git') {
    return (
      <div className="note">
        <span className="mono muted">Not a git repository. </span>
        {/* Offered, never silent: creating a `.git` in someone's directory is a real change. */}
        <button className="send" onClick={onInit}>
          run git init here
        </button>
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

function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? '';
}
