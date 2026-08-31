import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, X } from 'lucide-react';
import type {
  UiAgentProfile,
  UiAgentRemoval,
  UiTeamDiskUsage,
  UiTeamIcon,
  UiTeamSummary,
} from '../../../shared/api.js';
import { Blob } from './Blob.js';
import { IconPick } from './IconPick.js';
import { LeadPicker } from './Lead.js';

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

/**
 * A number of bytes, as a person says it: `1.2 GB`, `840 MB`, `nothing`.
 *
 * One decimal below 10 and none above, which is how a size is spoken aloud, and powers of 1024
 * with the short unit names so blobot's figure agrees with the file manager beside it.
 */
export function saySize(bytes: number): string {
  if (bytes <= 0) return 'nothing';
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${Math.round(value)} bytes`;
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
}

/**
 * What the tick is worth, in one line: the total, then who is holding it.
 *
 * Per agent as well as in total, because a single figure is a number to be trusted and
 * `alice 2.9 GB · bob 180 MB` is one to be recognised. An agent holding nothing is left out
 * rather than listed as zero; it is not what the line is for.
 */
function sizeLine(usage: UiTeamDiskUsage | undefined): string {
  if (usage === undefined) return 'measuring…';
  if (usage.bytes === 0) return 'these workspaces are holding nothing';
  const each = usage.agents
    .filter((agent) => agent.bytes > 0)
    .map((agent) => `${agent.agentName} ${saySize(agent.bytes)}`);
  return [`recovers about ${saySize(usage.bytes)}`, ...each].join(' · ');
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
  /**
   * A full clean: every workspace deleted whatever it holds. Off, always, and it stays off
   * until the user ticks it, because it is the one thing in blobot that destroys work no
   * branch and no copy will give back.
   */
  const [clean, setClean] = useState(false);
  /** What the clean would recover. `undefined` while it is still being counted. */
  const [usage, setUsage] = useState<UiTeamDiskUsage | undefined>();
  const [freed, setFreed] = useState<number | undefined>();

  // Measured as the dialog opens rather than when the option is ticked: the size is the reason
  // to tick it, so it has to be on screen before the decision, not after.
  useEffect(() => {
    let live = true;
    void window.blobot.teamDiskUsage(team.id).then((measured) => {
      if (live) setUsage(measured);
    });
    return () => {
      live = false;
    };
  }, [team.id]);

  const remove = async (): Promise<void> => {
    setBusy(true);
    const result = await window.blobot.deleteTeam(team.id, clean);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'The team could not be deleted.');
      return;
    }
    setRemovals(result.removals ?? []);
    setFreed(result.freedBytes);
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
                  The team stops and leaves the rail.{' '}
                  {clean
                    ? 'Every agent gets its workspace deleted whatever is in it, so work that was never merged goes with it. Nothing here is recoverable, by blobot or by git.'
                    : whatHappensTo(team.workspaceKind)}
                </p>
                <p>
                  <span className="mono">{team.workspacePath}</span> is not touched, and the
                  transcript stays in the database: what these agents were told is a record, not
                  a side effect.
                </p>
              </div>

              {/* The option, priced. A tick rather than prose because it changes what the
                  paragraph above says, and it is drawn as a roster row because that is the tick
                  this app already has. Ticked is never the state it opens in. */}
              <button
                className={`listrow pick${clean ? ' on' : ''}`}
                aria-pressed={clean}
                onClick={() => setClean(!clean)}
              >
                <span className="who">
                  <span className="nm">
                    <b>full clean</b>{' '}
                    <span className="muted">delete the workspaces on disk too</span>
                  </span>
                  <span className="sub mono muted">{sizeLine(usage)}</span>
                </span>
                <span className={`tick${clean ? ' on' : ''}`}>
                  {clean && <Check size={14} aria-hidden />}
                </span>
              </button>

              {error !== undefined && <div className="refusal">{error}</div>}
              <div className="modalfoot">
                <Dialog.Close className="btn">keep it</Dialog.Close>
                <button className="btn primary" disabled={busy} onClick={() => void remove()}>
                  {busy ? 'deleting…' : clean ? 'delete and clean' : 'delete team'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* What the clean actually recovered, measured as it ran rather than promised
                  beforehand: the estimate on the button was of a directory two agents were
                  still writing to. */}
              {freed !== undefined && (
                <div className="note mono muted">{saySize(freed)} recovered from disk</div>
              )}
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
  /**
   * Who leads. Seeded from the team, and undefined is a real value here in a way it is not on
   * the creation screen: a team formed before leads existed has none, and so does one whose
   * lead has left. Neither is repaired by promoting somebody the user never saw chosen, so the
   * pane goes back to asking for an `@` until this says otherwise.
   */
  const [lead, setLead] = useState<string | undefined>(team.leadProfileId);
  /**
   * The team's icon. Seeded from the team, and offered from the Workspace when it has none —
   * which is how every team formed before icons existed gets one without being recreated.
   *
   * `from` on an icon the team already has is the word *its own*, not a filename: what the row
   * stores is the image, never the path it came out of, because the folder it came out of is a
   * thing the user can move.
   */
  const [icon, setIcon] = useState<UiTeamIcon | undefined>(
    team.icon === undefined ? undefined : { dataUrl: team.icon, from: 'its own icon' },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [removals, setRemovals] = useState<readonly UiAgentRemoval[] | undefined>();

  useEffect(() => {
    if (team.icon !== undefined) return;
    void window.blobot.suggestTeamIcon(team.workspacePath).then(setIcon);
  }, [team.icon, team.workspacePath]);

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
  /** An unticked lead is off the team, so it leads nothing. Nobody takes over automatically. */
  const leading = lead !== undefined && chosen.includes(lead) ? lead : undefined;
  // Naming a lead is a change on its own. A team that has never had one is the ordinary case
  // for opening this dialog and touching nothing else.
  const changed =
    leaving.length > 0 ||
    joining.length > 0 ||
    leading !== team.leadProfileId ||
    icon?.dataUrl !== team.icon;

  /** An icon of the user's own. The same picker the creation flow uses, refusing the same files. */
  const chooseIcon = async (): Promise<void> => {
    const result = await window.blobot.chooseTeamIcon();
    if (result === undefined) return;
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setIcon(result);
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    // The icon first, and on its own call, because it is the half of this dialog that changes
    // nothing about the team: no workspace is provisioned, no session is opened and nothing
    // restarts. A roster change does all three, and putting them in one transaction would make
    // a new icon fail for a reason that has nothing to do with it.
    if (icon?.dataUrl !== team.icon) await window.blobot.setTeamIcon(team.id, icon?.dataUrl);
    const result = await window.blobot.editTeam(team.id, chosen, leading);
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
                      className={`listrow pick${picked ? ' on' : ''}`}
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

              <IconPick
                {...(icon === undefined ? {} : { icon })}
                onChoose={() => void chooseIcon()}
                onClear={() => setIcon(undefined)}
              />

              <LeadPicker
                chosen={roster.filter((agent) => chosen.includes(agent.id))}
                {...(leading === undefined ? {} : { lead: leading })}
                onPick={setLead}
              />

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
