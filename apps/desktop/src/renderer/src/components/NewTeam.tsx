import { useEffect, useState } from 'react';
import type {
  NewTeamSpec,
  UiRuntimeChoice,
  UiWorkspaceInspection,
} from '../../../shared/api.js';

interface Draft {
  readonly name: string;
  readonly role: string;
  readonly runtimeId: string;
}

const READINESS_WORD: Record<UiRuntimeChoice['readiness'], string> = {
  ready: 'ready',
  needs_sign_in: 'needs sign-in',
  not_installed: 'not installed',
  unknown: 'status unknown',
};

/**
 * Creating a team: a Workspace, a name, and a roster.
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
  const [agents, setAgents] = useState<Draft[]>([
    { name: '', role: '', runtimeId: '' },
    { name: '', role: '', runtimeId: '' },
  ]);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.blobot.detectRuntimes().then((detected) => {
      setRuntimes(detected);
      const preferred = detected.find((runtime) => runtime.supported)?.runtimeId ?? '';
      setAgents((current) =>
        current.map((agent) => (agent.runtimeId === '' ? { ...agent, runtimeId: preferred } : agent)),
      );
    });
  }, []);

  const readWorkspace = async (chosen: string, initialize = false): Promise<void> => {
    setError(undefined);
    const result = initialize
      ? await window.blobot.initializeWorkspace(chosen)
      : await window.blobot.inspectWorkspace(chosen);
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
    const chosen = await window.blobot.chooseWorkspace();
    if (chosen === undefined) return;
    await readWorkspace(chosen);
  };

  const named = agents.filter((agent) => agent.name.trim() !== '');
  const ready =
    inspection !== undefined &&
    inspection.kind === 'git' &&
    inspection.hasCommits &&
    name.trim() !== '' &&
    named.length > 0 &&
    named.every((agent) => agent.runtimeId !== '');

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const spec: NewTeamSpec = {
      name: name.trim(),
      workspacePath: path,
      turnBudget,
      agents: named.map((agent) => ({
        name: agent.name.trim(),
        role: agent.role.trim() === '' ? 'generalist' : agent.role.trim(),
        runtimeId: agent.runtimeId,
      })),
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
          {inspection !== undefined && <WorkspaceNote inspection={inspection} onInit={() => void readWorkspace(path, true)} />}
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
          <div className="fieldlabel mono">AGENTS</div>
          {agents.map((agent, index) => (
            <div className="agentdraft" key={index}>
              <input
                className="textfield"
                value={agent.name}
                placeholder="name"
                onChange={(event) => setAgents(replace(agents, index, { name: event.target.value }))}
              />
              <input
                className="textfield"
                value={agent.role}
                placeholder="role"
                onChange={(event) => setAgents(replace(agents, index, { role: event.target.value }))}
              />
              <select
                className="textfield"
                value={agent.runtimeId}
                onChange={(event) =>
                  setAgents(replace(agents, index, { runtimeId: event.target.value }))
                }
              >
                {runtimes.map((runtime) => (
                  <option
                    key={runtime.runtimeId}
                    value={runtime.runtimeId}
                    disabled={!runtime.supported}
                  >
                    {runtime.label}
                    {runtime.supported ? '' : ' — no adapter yet'}
                  </option>
                ))}
              </select>
              <button
                className="send"
                onClick={() => setAgents(agents.filter((_, at) => at !== index))}
                disabled={agents.length === 1}
              >
                remove
              </button>
              <RuntimeNote runtime={runtimes.find((entry) => entry.runtimeId === agent.runtimeId)} />
            </div>
          ))}
          <button
            className="send"
            onClick={() =>
              setAgents([
                ...agents,
                { name: '', role: '', runtimeId: agents[0]?.runtimeId ?? '' },
              ])
            }
          >
            add an agent
          </button>
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

function RuntimeNote({ runtime }: { runtime: UiRuntimeChoice | undefined }): React.JSX.Element {
  if (runtime === undefined) return <span />;
  return (
    <span className="runtimenote mono muted">
      {READINESS_WORD[runtime.readiness]}
      {runtime.version === undefined ? '' : ` · ${runtime.version}`} — {runtime.detail}
    </span>
  );
}

function replace(agents: Draft[], index: number, patch: Partial<Draft>): Draft[] {
  return agents.map((agent, at) => (at === index ? { ...agent, ...patch } : agent));
}

function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? '';
}
