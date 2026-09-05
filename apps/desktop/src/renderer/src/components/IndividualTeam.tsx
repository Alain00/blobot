import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, X } from 'lucide-react';
import type { TeamOpenResult, UiAgentProfile, UiTeamSummary } from '../../../shared/api.js';

/** A choice of ordinary Teams, never a profile-owned session or a hidden default history. */
export function IndividualTeam({ agent, teams, onCreate, onOpen }: {
  agent: UiAgentProfile;
  teams: readonly UiTeamSummary[];
  onCreate: (agent: UiAgentProfile) => void;
  onOpen: (profileId: string, team: UiTeamSummary) => Promise<TeamOpenResult>;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState<string>();
  const [error, setError] = useState<string>();
  const individual = teams.filter((team) => team.members.length === 1 && team.members[0]?.profileId === agent.id);

  const choose = async (team: UiTeamSummary): Promise<void> => {
    if (opening !== undefined) return;
    setOpening(team.id);
    setError(undefined);
    try {
      const result = await onOpen(agent.id, team);
      if (result.ok) setOpen(false);
      else setError(result.error ?? 'The team could not be opened. Try again.');
    } catch {
      setError('The team could not be opened. Try again.');
    } finally {
      setOpening(undefined);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(value) => {
      if (opening !== undefined) return;
      setOpen(value);
      setError(undefined);
    }}>
      <Dialog.Trigger className="btn agenttalk" aria-label={`Talk with ${agent.name}`}>talk</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content className="modal individualteam">
          <header className="modalhead">
            <div><Dialog.Title className="subhead lg">Talk with {agent.name}</Dialog.Title></div>
            <Dialog.Close className="iconbtn" disabled={opening !== undefined} aria-label="Close">
              <X size={17} aria-hidden />
            </Dialog.Close>
          </header>
          <Dialog.Description className="note muted">
            Continue in an individual team, or create one with its own folder and history.
          </Dialog.Description>
          {individual.length === 0 ? (
            <p className="note muted">No individual teams yet. Your new team will appear in the team list.</p>
          ) : (
            <div className="individualteamlist">
              {individual.map((team) => (
                <button className="listrow" key={team.id} disabled={opening !== undefined}
                  onClick={() => void choose(team)}>
                  <span className="individualteamname">{team.name}</span>
                  {opening === team.id ? <span className="mono muted">opening…</span> : <ArrowRight size={16} aria-hidden />}
                </button>
              ))}
            </div>
          )}
          {error !== undefined && <p className="refusal" role="alert">{error}</p>}
          <div className="modalfoot">
            <button className="btn primary" disabled={opening !== undefined} onClick={() => {
              setOpen(false);
              onCreate(agent);
            }}>new individual team</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
