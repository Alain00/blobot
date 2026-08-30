import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, X } from 'lucide-react';
import type { UiAgentProfile, UiAgentRemoval, UiTeamSummary } from '../../../shared/api.js';
import { Blob } from './Blob.js';

/**
 * The two things you can do to a team that already exists: change who is on it, and end it.
 *
 * Both are modals, which the rest of the app is careful about. The test in `DESIGN.md` is
 * whether the thing outlives the screen that opened it, and both of these do: an agent that
 * leaves keeps existing on its other teams, and a deleted team leaves branches, copies and a
 * transcript behind it. They are also both destructive in a way nothing else in the rail is,
 * and a rail row that deleted a team on one click would be a rail nobody trusts to click.
 */

/** What became of each agent's work, in the words the provider used. Never summarised away. */
function RemovalNotes({ removals }: { removals: readonly UiAgentRemoval[] }): React.JSX.Element {
  const worth = removals.filter((removal) => removal.work !== 'discarded');
  if (worth.length === 0) {
    return (
      <div className="note muted">
        Every workspace was removed cleanly. Nothing was left behind.
      </div>
    );
  }
  return (
    <div className="removals">
      {worth.map((removal) => (
        <div className="note" key={removal.agentName}>
          <b>{removal.agentName}</b>{' '}
          <span className="muted">
            {removal.work === 'kept' ? 'kept its work. ' : 'could not be cleaned up. '}
            {removal.detail}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * What deleting this team will do to the work, before it is done.
 *
 * It depends on the mechanism the Workspace was given, and the guarantees genuinely differ: a
 * branch can be kept because git can tell whether it holds anything, and a copy cannot, so
 * blobot will not delete one. A user told nothing here would assume the strongest version.
 */
function whatHappensTo(kind: UiTeamSummary['workspaceKind']): string {
  return kind === 'plain'
    ? 'Each agent has a copy of the folder rather than a branch, so blobot leaves the copies where they are. It has no way to tell whether there is work in one.'
    : "Each agent's branch is deleted if its work is already merged, and kept if it is not. blobot tells you which, and never deletes a branch that still holds something.";
}

export function DeleteTeam({
  team,
  onClose,
  onDeleted,
}: {
  team: UiTeamSummary;
  onClose: () => void;
  /** Called once the rail should redraw, which is before the notes have been read. */
  onDeleted: () => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [removals, setRemovals] = useState<readonly UiAgentRemoval[] | undefined>();

  const remove = async (): Promise<void> => {
    setBusy(true);
    const result = await window.blobot.deleteTeam(team.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'The team could not be deleted.');
      return;
    }
    setRemovals(result.removals ?? []);
    onDeleted();
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content className="modal" aria-describedby={undefined}>
          <header className="modalhead">
            <div>
              <div className="eyebrow mono">DELETE A TEAM</div>
              <Dialog.Title className="display sm">{team.name}</Dialog.Title>
            </div>
            <Dialog.Close className="iconbtn" aria-label="Close">
              <X size={17} aria-hidden />
            </Dialog.Close>
          </header>

          {removals === undefined ? (
            <>
              <div className="prose">
                <p>
                  The team stops and leaves the rail. {whatHappensTo(team.workspaceKind)}
                </p>
                <p>
                  <span className="mono">{team.workspacePath}</span> is not touched, and the
                  transcript stays in the database: what these agents were told is a record, not
                  a side effect.
                </p>
              </div>
              {error !== undefined && <div className="refusal">{error}</div>}
              <div className="modalfoot">
                <Dialog.Close className="btn">keep it</Dialog.Close>
                <button className="btn primary" disabled={busy} onClick={() => void remove()}>
                  {busy ? 'deleting…' : 'delete team'}
                </button>
              </div>
            </>
          ) : (
            <>
              <RemovalNotes removals={removals} />
              <div className="modalfoot">
                <Dialog.Close className="btn primary">done</Dialog.Close>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Changing who is on a team: the same roster the creation flow shows, with the current members
 * already ticked.
 *
 * Ticked from the *memberships* rather than from a list of ids the renderer keeps, because that
 * is the fact — an agent is on N teams and this is one of them. Untick and it leaves; tick
 * somebody new and they join with their own workspace, their own session and their own mailbox,
 * which is what joining a team has always meant.
 */
export function EditTeam({
  team,
  onClose,
  onSaved,
}: {
  team: UiTeamSummary;
  onClose: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const [roster, setRoster] = useState<readonly UiAgentProfile[]>([]);
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [removals, setRemovals] = useState<readonly UiAgentRemoval[] | undefined>();

  useEffect(() => {
    void window.blobot.listAgents().then((agents) => {
      setRoster(agents);
      setChosen(
        agents.filter((agent) => agent.teams.includes(team.name)).map((agent) => agent.id),
      );
    });
  }, [team.name]);

  const members = new Set(
    roster.filter((agent) => agent.teams.includes(team.name)).map((agent) => agent.id),
  );
  const leaving = roster.filter((agent) => members.has(agent.id) && !chosen.includes(agent.id));
  const joining = roster.filter((agent) => !members.has(agent.id) && chosen.includes(agent.id));
  const changed = leaving.length > 0 || joining.length > 0;

  const save = async (): Promise<void> => {
    setBusy(true);
    const result = await window.blobot.editTeam(team.id, chosen);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'The team could not be changed.');
      return;
    }
    onSaved();
    // Somebody leaving is the half that can leave work behind, so the dialog stays open to say
    // what happened to it. Nobody leaving is nothing to report.
    if ((result.removals ?? []).some((removal) => removal.work !== 'discarded')) {
      setRemovals(result.removals ?? []);
      return;
    }
    onClose();
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content className="modal" aria-describedby={undefined}>
          <header className="modalhead">
            <div>
              <div className="eyebrow mono">WHO IS ON THIS TEAM</div>
              <Dialog.Title className="display sm">{team.name}</Dialog.Title>
            </div>
            <Dialog.Close className="iconbtn" aria-label="Close">
              <X size={17} aria-hidden />
            </Dialog.Close>
          </header>

          {removals !== undefined ? (
            <>
              <RemovalNotes removals={removals} />
              <div className="modalfoot">
                <Dialog.Close className="btn primary">done</Dialog.Close>
              </div>
            </>
          ) : (
            <>
              <div className="roster">
                {roster.map((agent) => {
                  const picked = chosen.includes(agent.id);
                  return (
                    <button
                      key={agent.id}
                      className={`rosterrow${picked ? ' on' : ''}`}
                      onClick={() =>
                        setChosen(
                          picked
                            ? chosen.filter((id) => id !== agent.id)
                            : [...chosen, agent.id],
                        )
                      }
                    >
                      <Blob name={agent.name} size={34} hue={agent.hue} />
                      <span className="who">
                        <span className="nm">
                          <b>{agent.name}</b> <span className="muted">{agent.role}</span>
                        </span>
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

              {/* Stated before the click, because both halves are surprising: an agent who
                  leaves takes its workspace with it, and saving stops and restarts the team. */}
              {leaving.length > 0 && (
                <div className="note">
                  <b>{leaving.map((agent) => agent.name).join(', ')}</b>{' '}
                  <span className="muted">
                    {leaving.length === 1 ? 'leaves this team' : 'leave this team'}.{' '}
                    {whatHappensTo(team.workspaceKind)} Everything they said stays in the
                    transcript.
                  </span>
                </div>
              )}
              {changed && (
                <div className="note mono muted">
                  saving restarts the team · each agent resumes the conversation it was in
                </div>
              )}
              {error !== undefined && <div className="refusal">{error}</div>}

              <div className="modalfoot">
                <Dialog.Close className="btn">cancel</Dialog.Close>
                <button
                  className="btn primary"
                  disabled={!changed || chosen.length === 0 || busy}
                  onClick={() => void save()}
                >
                  {busy ? 'saving…' : 'save'}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
