import { useEffect, useState } from 'react';
import type { MachinePlacement } from '@blobot/core/domain';
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
import { MachinePick, MachineCapacity } from './MachinePick.js';
import { usePlaySound } from '../sound/useSound.js';

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
  const worth = removals.filter((removal) => removal.work !== 'discarded' || removal.state === 'unknown');
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
            {removal.work === 'discarded' ? 'had its working folder removed. ' : removal.work === 'kept' ? 'kept its work. ' : 'could not have its working folder removed. '}
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
export function sizeLine(usage: UiTeamDiskUsage | undefined): string {
  if (usage === undefined) return 'measuring…';
  if (usage.workBytes === null) return 'working-folder size unavailable · full clean unavailable';
  if (usage.stateBytes === null) return `work ${saySize(usage.workBytes)} · private state size unavailable; it will also be removed`;
  if (usage.bytes === 0) return 'these workspaces are holding nothing';
  const each = usage.agents
    .filter((agent) => agent.bytes !== null && agent.bytes > 0)
    .map((agent) => `${agent.agentName} ${saySize(agent.bytes ?? 0)}`);
  return [`recovers about ${saySize(usage.bytes ?? usage.workBytes)}`, ...(usage.stateBytes ? [`work ${saySize(usage.workBytes ?? 0)} · state ${saySize(usage.stateBytes)}`] : []), ...each].join(' · ');
}

/**
 * Taking one agent off a team, from the sidebar's context menu on their face.
 *
 * The counterpart to `AddMember`, and the reason the two are separate: adding is one act with
 * nothing to report, and a departure ends a session and leaves a branch or a copy behind, so it
 * has to say what happens to the work before it does it and what happened to it after. The whole
 * roster is still what goes on the wire — `editTeam` takes a roster, because a persona names one
 * — and it is composed here rather than asked of the user.
 *
 * It is a **membership** that ends. The AgentProfile is untouched and stays on its other teams,
 * which is ADR-0001's whole point and the sentence this dialog leads with.
 */
export function RemoveMember({
  team,
  member,
  onClose,
  onRemoved,
}: {
  team: UiTeamSummary;
  /** The one leaving. Their `profileId` is what the roster is composed of. */
  member: { readonly id: string; readonly name: string; readonly profileId?: string };
  onClose: () => void;
  onRemoved: () => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [removals, setRemovals] = useState<readonly UiAgentRemoval[] | undefined>();
  const playSound = usePlaySound();

  const remove = async (): Promise<void> => {
    playSound('remove');
    setBusy(true);
    setError(undefined);
    const staying = team.members
      .filter((row) => row.id !== member.id)
      .map((row) => row.profileId)
      .filter((id): id is string => id !== undefined);
    // A lead who has left leads nothing, and nobody is promoted in their place — `EditTeam`'s
    // rule, which is the app's rule, and it is not this dialog's to change.
    const lead = team.leadProfileId === member.profileId ? undefined : team.leadProfileId;
    const result = await window.blobot.editTeam(team.id, staying, lead, {});
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'The team could not be changed.');
      return;
    }
    onRemoved();
    // The half that can leave work behind is the half worth staying open for. Nothing left
    // behind is nothing to report, and the dialog goes.
    if ((result.removals ?? []).some((removal) => removal.work !== 'discarded' || removal.state === 'unknown')) {
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
              <div className="eyebrow mono">TAKE OFF THE TEAM</div>
              <Dialog.Title className="display sm">{member.name}</Dialog.Title>
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
              <div className="prose">
                <p>
                  {member.name} stays hired and keeps every other team. The conversation stays
                  where it is.
                </p>
                <p className="note muted">{whatHappensTo(team.workspaceKind)}</p>
                <p className="note muted">
                  {team.name} restarts, because a persona names the roster.
                </p>
              </div>
              {error !== undefined && <p role="alert">{error}</p>}
              <div className="modalfoot">
                <Dialog.Close className="btn">cancel</Dialog.Close>
                <button className="btn primary" disabled={busy} onClick={() => void remove()}>
                  {busy ? 'taking off…' : `take ${member.name} off`}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
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
  const playSound = usePlaySound();
  /** What the clean would recover. `undefined` while it is still being counted. */
  const [usage, setUsage] = useState<UiTeamDiskUsage | undefined>();
  const [freed, setFreed] = useState<number | undefined>();
  /** A **thread**: this agent's own conversation rather than a team. Only the copy changes. */
  const thread = team.threadFor !== undefined;

  // Measured as the dialog opens rather than when the option is ticked: the size is the reason
  // to tick it, so it has to be on screen before the decision, not after.
  useEffect(() => {
    let live = true;
    void window.blobot.teamDiskUsage(team.id).then((measured) => {
      if (live) setUsage(measured);
    }).catch(() => { if (live) setUsage({ bytes: null, workBytes: null, stateBytes: null, agents: [] }); });
    return () => {
      live = false;
    };
  }, [team.id]);

  const remove = async (): Promise<void> => {
    // Falling, and the full clean puts a floor under the tail: it is the one unrecoverable act in
    // the app, and this dialog is the one place that difference is already priced.
    playSound(clean ? 'purge' : 'remove');
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
              {/* The same dialog, and the noun is what changes. Deleting a conversation reuses
                  the team-delete flow whole — the same worktree removal before the tombstone,
                  the same full-clean tick with its priced figure, the same independent reporting
                  of what was kept — because that ordering and that pricing were bought
                  expensively in the Machines review and must not have a second implementation.
                  A thread's Team name *is* the agent's name, which is the one place that
                  invented string is worth drawing. `.scratch/rail/issues/06`. */}
              <div className="eyebrow mono">
                {thread ? 'DELETE A CONVERSATION' : 'DELETE A TEAM'}
              </div>
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
                  {thread ? 'The conversation ends.' : 'The team stops and leaves the rail.'}{' '}
                  {clean
                    ? 'Every agent gets its workspace deleted whatever is in it, so work that was never merged goes with it. Nothing here is recoverable, by blobot or by git.'
                    : whatHappensTo(team.workspaceKind)}
                </p>
                {thread ? (
                  // Said because it is the thing a person would otherwise assume: the Team is
                  // tombstoned and its transcript kept but unreachable, and saying hello makes a
                  // new thread with a new folder. Reattaching the tombstone instead would make
                  // deletion mean *hide* while the folder was gone anyway, so the returning
                  // history would reference paths that no longer exist.
                  <p>
                    {team.name} stays hired and keeps their row. This conversation does not come
                    back: saying hello starts a new one.
                  </p>
                ) : (
                  <p>
                    <span className="mono">{team.workspacePath}</span> is not touched, and the
                    transcript stays in the database: what these agents were told is a record, not
                    a side effect.
                  </p>
                )}
              </div>

              {/* The option, priced. A tick rather than prose because it changes what the
                  paragraph above says, and it is drawn as a roster row because that is the tick
                  this app already has. Ticked is never the state it opens in. */}
              <button
                className={`listrow pick${clean ? ' on' : ''}`}
                aria-pressed={clean}
                disabled={busy || usage === undefined || usage.workBytes === null}
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
                  {busy
                    ? 'deleting…'
                    : clean
                      ? 'delete and clean'
                      : thread
                        ? 'delete conversation'
                        : 'delete team'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* What the clean actually recovered, measured as it ran rather than promised
                  beforehand: the estimate on the button was of a directory two agents were
                  still writing to. */}
              {freed !== undefined && (
                <div className="note mono muted">{saySize(freed)} of measured data recovered from disk</div>
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
  const [memberMachines, setMemberMachines] = useState<Readonly<Record<string, MachinePlacement>>>({});
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [hostCapacity, setHostCapacity] = useState<import('../../../shared/api.js').EngineSetupView['host']>();
  useEffect(() => { void window.blobot.engineSetup().then((view) => { setPreviewEnabled(view.previewEnabled); setHostCapacity(view.host); }).catch(() => {}); }, []);
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
    const result = await window.blobot.editTeam(team.id, chosen, leading,
      Object.fromEntries(Object.entries(memberMachines).filter(([id]) => joining.some((agent) => agent.id === id))));
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'The team could not be changed.');
      return;
    }
    onSaved();
    // Somebody leaving is the half that can leave work behind, so the dialog stays open to say
    // what happened to it. Nobody leaving is nothing to report.
    if ((result.removals ?? []).some((removal) => removal.work !== 'discarded' || removal.state === 'unknown')) {
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
                      <Blob name={agent.name} size={34} hue={agent.hue} shape={agent.shape} />
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

              {joining.length > 0 && <details className="machinedisclosure">
                <summary>Where new members work</summary>
                <MachineCapacity host={hostCapacity} placements={joining.map((agent) => memberMachines[agent.id] ?? team.defaultMachine ?? { kind: 'local' })} />
                {joining.map((agent) => <div key={agent.id} className="machinemember">
                  <span>{agent.name}</span>
                  <MachinePick label={`Where ${agent.name} works`} value={memberMachines[agent.id] ?? team.defaultMachine ?? { kind: 'local' }} previewEnabled={previewEnabled}
                    onChange={(value) => setMemberMachines((current) => ({ ...current, [agent.id]: value }))} />
                </div>)}
                <p>Sandboxes use a private home and runtime login. Their working folder and shared Git history stay writable on this computer.
                  They can reach the Internet and local network with the runtime’s selected approval settings.</p>
                <p>Each sandbox has an 8 GiB home and 20 GiB for software it installs. CPU and memory limits are fixed after creation.</p>
              </details>}

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
