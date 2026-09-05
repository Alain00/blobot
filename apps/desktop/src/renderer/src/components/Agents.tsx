import { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import type { TeamOpenResult, UiAgentProfile, UiRuntimeChoice, UiTeamSummary } from '../../../shared/api.js';
import { EditAgent, HireAgent, RetireAgent } from './AgentForm.js';
import { Blob } from './Blob.js';
import { IndividualTeam } from './IndividualTeam.js';

/**
 * Your agents: everyone you have hired, on no team and on several at once.
 *
 * This screen is the domain model made visible. Until it existed, an AgentProfile could only be
 * seen from inside team creation, which read as though agents were a step of making a team —
 * exactly the reading ADR-0001 was written to overturn. Agents exist, and teams are formed out
 * of them, so they have a place of their own.
 *
 * It is a **working** surface, not an editorial one. The creation flow's treatment (the hand
 * face, the standfirst, the numbered steps) is deliberately not here: `DESIGN.md` says that page
 * works because it is the only one, and this is a list you come back to.
 *
 * A row is the agent, and clicking it edits the definition. Retiring is an icon on hover and on
 * focus, the same rule the rail's team rows follow and for the same reason: a screen whose job
 * is "here is everybody" must not have a delete button as its loudest thing at rest.
 */
export function Agents({
  onClose,
  onChanged,
  hiringAtOnce,
  teams,
  onCreateIndividualTeam,
  onOpenIndividualTeam,
}: {
  onClose: () => void;
  /**
   * An agent's definition changed, so the surface behind this screen is out of date.
   *
   * A face is restated onto every membership the moment it is saved, and the rail draws its
   * teams out of those rows — so without this the roster here showed the new face and the rail
   * two layers down went on drawing the old one until something else happened to re-snapshot.
   * One agent, two faces, which is the failure the whole face rule exists to prevent.
   *
   * It is a re-read and never a restart: nothing on this screen stops a team. ADR-0002.
   */
  onChanged?: () => void;
  /** `--screen=hire` only: the dialog a screenshot cannot click its way to. */
  hiringAtOnce?: boolean;
  teams: readonly UiTeamSummary[];
  onCreateIndividualTeam: (agent: UiAgentProfile) => void;
  onOpenIndividualTeam: (profileId: string, team: UiTeamSummary) => Promise<TeamOpenResult>;
}): React.JSX.Element {
  const [roster, setRoster] = useState<readonly UiAgentProfile[]>([]);
  const [runtimes, setRuntimes] = useState<readonly UiRuntimeChoice[]>([]);
  const [hiring, setHiring] = useState(hiringAtOnce === true);
  /** Which agent a dialog is about, by id rather than by value: the row it came from is about
   *  to be replaced by a reloaded one, and a copy held here would go stale on save. */
  const [editing, setEditing] = useState<string | undefined>();
  const [retiring, setRetiring] = useState<string | undefined>();

  const reload = useCallback(async (): Promise<void> => {
    setRoster(await window.blobot.listAgents());
    // The screen behind this one holds the same agents on their teams. Asked after the roster,
    // because the roster is what the person is looking at.
    onChanged?.();
  }, [onChanged]);

  /** Ask the machine again. `detectRuntimes` re-detects, so signing one in redraws the picker. */
  const rescan = useCallback((): void => {
    void window.blobot.detectRuntimes().then(setRuntimes);
  }, []);

  useEffect(() => {
    rescan();
    void reload();
  }, [reload, rescan]);

  const editingAgent = roster.find((agent) => agent.id === editing);
  const retiringAgent = roster.find((agent) => agent.id === retiring);

  // Escape closes the screen, because every other layer in this app answers to it and one that
  // does not reads as stuck. Not while a dialog is open: Radix is already closing that, and
  // both would go at once.
  const dialogOpen = hiring || editingAgent !== undefined || retiringAgent !== undefined;
  useEffect(() => {
    if (dialogOpen) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && document.querySelector('[role="dialog"]') === null) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialogOpen, onClose]);

  return (
    <div className="agentspage">
      <div className="agentssheet">
        <header className="agentshead">
          <div>
            <div className="eyebrow mono">YOUR AGENTS</div>
            {/* A title rather than a count. The list underneath is the count, and a heading
                that only ever says what is already on screen is decoration. */}
            <h1 className="subhead lg">
              {roster.length === 0 ? 'Nobody yet' : 'Everyone you have hired'}
            </h1>
          </div>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={() => setHiring(true)}>
            hire an agent
          </button>
          <button className="iconbtn" onClick={onClose} title="Close" aria-label="Close">
            <X size={17} aria-hidden />
          </button>
        </header>

        {roster.length === 0 ? (
          <div className="note muted">
            An agent is hired once and belongs to nobody. Hire one and it can join this team and
            any other, at the same time.
          </div>
        ) : (
          <div className="roster">
            {roster.map((agent) => (
              <div key={agent.id} className="agentcardwrap">
                <button className="listrow tall" onClick={() => setEditing(agent.id)}>
                  {/* The face it wears in the rail and the transcript, so this list is
                      recognisably the same set of agents rather than a list of names. */}
                  <Blob name={agent.name} size={34} hue={agent.hue} shape={agent.shape} />
                  <span className="who">
                    <span className="nm">
                      <b>{agent.name}</b> <span className="muted">{agent.role}</span>
                    </span>
                    <span className="sub mono muted">
                      {agent.runtimeLabel}
                      {/* Where the model shows: an agent is on N teams, and none is special. */}
                      {agent.teams.length === 0
                        ? ' · on no team'
                        : ` · on ${agent.teams.join(', ')}`}
                    </span>
                    {/* Shown rather than hinted at: standing instructions are the one part of a
                        definition that changes what the agent does, and the only place they were
                        readable was the field you type them into. */}
                    {agent.instructions !== undefined && (
                      <span className="standing muted">{agent.instructions}</span>
                    )}
                  </span>
                </button>
                <span className="rowacts">
                  <IndividualTeam agent={agent} teams={teams}
                    onCreate={onCreateIndividualTeam} onOpen={onOpenIndividualTeam} />
                  <button
                    className="iconbtn sm"
                    onClick={() => setEditing(agent.id)}
                    title={`Edit ${agent.name}`}
                    aria-label={`Edit ${agent.name}`}
                  >
                    <Pencil size={13} aria-hidden />
                  </button>
                  <button
                    className="iconbtn sm"
                    onClick={() => setRetiring(agent.id)}
                    title={`Retire ${agent.name}`}
                    aria-label={`Retire ${agent.name}`}
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {hiring && (
        <HireAgent
          runtimes={runtimes}
          onRuntimesChanged={rescan}
          onClose={() => setHiring(false)}
          onHired={async () => {
            await reload();
            setHiring(false);
          }}
        />
      )}
      {editingAgent !== undefined && (
        <EditAgent
          agent={editingAgent}
          runtimes={runtimes}
          onRuntimesChanged={rescan}
          onClose={() => setEditing(undefined)}
          onSaved={reload}
        />
      )}
      {retiringAgent !== undefined && (
        <RetireAgent
          agent={retiringAgent}
          onClose={() => setRetiring(undefined)}
          onRetired={reload}
        />
      )}
    </div>
  );
}
