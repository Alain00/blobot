import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, UserPlus, X } from 'lucide-react';
import { Command } from 'cmdk';
import type { UiAgentProfile, UiRuntimeChoice, UiTeamSummary } from '../../../shared/api.js';
import { HireAgent } from './AgentForm.js';
import { Blob } from './Blob.js';

/**
 * Putting somebody else on a team that already exists.
 *
 * **The creation flow's *who* step, pointed at a team instead of at a spec**, and it is that
 * rather than a second design because it is the same question — `Who is on this team?` — asked
 * about a team that has an answer already. `EditTeam` is the other door and stays: it is the
 * whole roster restated, which is what taking somebody *off* has to be, since leaving can strand
 * work and the result has to be reported. This one only adds, so it can be a bar over the window
 * that goes away when the thing is done.
 *
 * **Members already on the team are badges you cannot take off.** Not because removal is
 * unimportant, but because a removal is not this act: it needs the confirmation and the removal
 * report `EditTeam` carries, and a × here that quietly did something that heavy would be the
 * cheapest control in the app doing the most expensive thing in it. They are shown all the same,
 * because *who is on this team* with the current members missing is a question about a different
 * team, and because it is what stops somebody adding a person who is already there.
 *
 * Saving restates the whole roster, which is what `editTeam` takes and what a persona needs: a
 * persona names the roster, so a team gains a member by being restarted with the new one in it.
 * The lead is untouched — it is the team's, and adding somebody is not naming them.
 *
 * **The bar does not wait for the team.** `NewTeam`'s rule, and the same measurement behind it:
 * an edit provisions a workspace, opens a session and restarts the team before the call comes
 * back, which is seconds — and a bar sitting over the app for those seconds is a lock on a
 * window that has nothing wrong with it. So the last thing this surface does is hand the roster
 * over; a failure lands in the strip above the panes, where every other team-level failure is
 * already reported.
 */
export function AddMember({
  team,
  onClose,
  onAdd,
}: {
  team: UiTeamSummary;
  onClose: () => void;
  /** The whole roster, composed here. The caller makes the change and shuts this. */
  onAdd: (profileIds: readonly string[]) => void;
}): React.JSX.Element {
  const [roster, setRoster] = useState<readonly UiAgentProfile[]>([]);
  /** The ids being added. The team's own members are not in here: they are not this act. */
  const [adding, setAdding] = useState<readonly string[]>([]);
  const [query, setQuery] = useState('');
  const [runtimes, setRuntimes] = useState<readonly UiRuntimeChoice[]>([]);
  const [hiring, setHiring] = useState(false);
  const listed = useRef<HTMLDivElement | null>(null);

  /**
   * cmdk's highlighted row, held here rather than left to cmdk.
   *
   * One moment forces it: the roster arrives after the first paint, so for that tick the hire
   * row is the only item in the list and cmdk highlights it — and cmdk keeps a highlight that is
   * still valid, so it stayed there once the agents arrived, on the row Tab and Space take. The
   * roster's first agent is claimed when the roster lands, and everything after that is cmdk's
   * own: picking a row removes it and cmdk highlights the next, which is what `onValueChange`
   * is reporting back.
   */
  const [highlighted, setHighlighted] = useState('');
  /** Whether the roster has ever landed. cmdk highlights the hire row before it does. */
  const claimed = useRef(false);

  const reloadRoster = useCallback(async (): Promise<void> => {
    const list = await window.blobot.listAgents();
    setRoster(list);
    const first = list.find((agent) => !agent.teams.includes(team.name));
    if (first !== undefined && !claimed.current) {
      claimed.current = true;
      setHighlighted(`agent:${first.id}`);
    }
  }, [team.name]);
  const rescan = useCallback((): void => {
    void window.blobot.detectRuntimes().then(setRuntimes);
  }, []);

  useEffect(() => {
    rescan();
    void reloadRoster();
  }, [reloadRoster, rescan]);

  // Escape leaves, captured on the window the way the navigator and the creation bar do it: a
  // layer that ignores Escape reads as stuck. Not while the hire bar is over it, which is
  // `Agents`' own guard: a window listener answers a key that was aimed at the layer above it,
  // so one press shut both and the roster went with the dialog it opened.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"]') !== null) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * Who is on the team already.
   *
   * By team **name**, which is what `UiAgentProfile.teams` carries and what `EditTeam` reads. It
   * is the team's own summary that names it, so the two agree by construction.
   */
  const members = roster.filter((agent) => agent.teams.includes(team.name));
  const joining = adding
    .map((id) => roster.find((agent) => agent.id === id))
    .filter((agent): agent is UiAgentProfile => agent !== undefined);

  const pick = (id: string): void => {
    setAdding((current) => (current.includes(id) ? current : [...current, id]));
    setQuery('');
  };
  const drop = (id: string): void => setAdding((current) => current.filter((other) => other !== id));

  const save = (): void => {
    if (adding.length === 0) return;
    onAdd([...members.map((agent) => agent.id), ...adding]);
  };

  /**
   * The keys, before cmdk sees them. The creation bar's rules, unchanged, because this is that
   * field: Enter on an empty query means *go on*, Tab and Space take the highlighted row, and
   * Backspace on an empty query takes back the last one added — never a member, who was not
   * added here and cannot be taken off here.
   */
  const keys = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter' && query === '') {
      event.preventDefault();
      event.stopPropagation();
      save();
      return;
    }
    if (event.key === 'Backspace' && query === '' && adding.length > 0) {
      event.preventDefault();
      drop(adding[adding.length - 1] as string);
      return;
    }
    if (event.key === 'Tab' || (event.key === ' ' && query === '')) {
      if (event.key === 'Tab' && event.shiftKey) return;
      const on =
        listed.current?.querySelector('[cmdk-item][data-selected="true"]') ??
        listed.current?.querySelector('[cmdk-item]');
      if (on === null || on === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      (on as HTMLElement).click();
    }
  };

  return (
    /* The hire bar is a sibling of the scrim and never a child of it. It portals to the body,
       but a React event travels the *tree* and not the DOM, so a click on its own text bubbled
       into the scrim's `onMouseDown` below and shut this bar, and the hire bar with it. */
    <>
      <div className="navscrim" onMouseDown={() => onClose()}>
        <div className="navsheet pickbar" onMouseDown={(event) => event.stopPropagation()}>
          <div onKeyDownCapture={keys}>
            <Command
              label={`Who is on ${team.name}`}
              loop
              value={highlighted}
              onValueChange={setHighlighted}
            >
              <div className="pickfield">
                <div className="pickitems">
                  {/* Addressed like a message, as on the creation bar: who this is for, then the
                      badges that are the recipients. */}
                  <span className="pickto">To</span>
                  {/* Already on the team: no ×, and said in the tooltip rather than by a control
                      that is missing without explanation. */}
                  {members.map((agent) => (
                    <span key={agent.id} className="pickchip on" title={`${agent.name} is on this team`}>
                      <span className="who">
                        <Blob
                          name={agent.name}
                          size={17}
                          {...(agent.hue === undefined ? {} : { hue: agent.hue })}
                          {...(agent.shape === undefined ? {} : { shape: agent.shape })}
                        />
                        <span className="nm">{agent.name}</span>
                      </span>
                    </span>
                  ))}
                  {joining.map((agent) => (
                    <span key={agent.id} className="pickchip">
                      <span className="who">
                        <Blob
                          name={agent.name}
                          size={17}
                          {...(agent.hue === undefined ? {} : { hue: agent.hue })}
                          {...(agent.shape === undefined ? {} : { shape: agent.shape })}
                        />
                        <span className="nm">{agent.name}</span>
                      </span>
                      <button
                        className="off"
                        onClick={() => drop(agent.id)}
                        title={`Do not add ${agent.name}`}
                        aria-label={`Do not add ${agent.name}`}
                      >
                        <X size={11} aria-hidden />
                      </button>
                    </span>
                  ))}
                  <Command.Input
                    autoFocus
                    value={query}
                    onValueChange={setQuery}
                    placeholder={members.length === 0 && joining.length === 0 ? 'a name' : ''}
                  />
                </div>
                <button
                  className="pickgo"
                  disabled={adding.length === 0}
                  onClick={save}
                  title="Add to the team"
                  aria-label="Add to the team"
                >
                  <ArrowRight size={15} aria-hidden />
                </button>
              </div>
              <Command.List ref={listed}>
                {/* Two different facts, as on the creation bar: an empty roster is not a failed
                    search, and everybody already being on the team is neither. */}
                <Command.Empty>
                  {roster.length === 0
                    ? 'Nobody hired yet'
                    : roster.every((agent) => members.includes(agent) || adding.includes(agent.id))
                      ? 'Everybody is on this team'
                      : 'Nobody by that name'}
                  {/* The door again, because the row above filters out with everything else and
                      this is exactly when it is wanted. Never both at once. */}
                  <button className="hirerow" onClick={() => setHiring(true)}>
                    <span className="ico">
                      <UserPlus size={17} aria-hidden />
                    </span>
                    <span>hire an agent</span>
                  </button>
                </Command.Empty>
                {roster
                  .filter((agent) => !adding.includes(agent.id) && !members.includes(agent))
                  .map((agent) => (
                    <Command.Item
                      key={agent.id}
                      value={`agent:${agent.id}`}
                      keywords={[agent.name, agent.role, agent.runtimeLabel]}
                      onSelect={() => pick(agent.id)}
                    >
                      <Blob
                        name={agent.name}
                        size={20}
                        {...(agent.hue === undefined ? {} : { hue: agent.hue })}
                        {...(agent.shape === undefined ? {} : { shape: agent.shape })}
                      />
                      <span>{agent.name}</span>
                      <span className="r">{agent.role}</span>
                    </Command.Item>
                  ))}
                {/* A row of the list in full, on the creation bar's own rule and for its reason:
                    a button is not a `[cmdk-item]`, so the pointer resting on it lit it *and*
                    left the list's own highlight lit on the first agent below. Last in the DOM
                    and first on screen, so the highlight the keys act on stays on the agents.
                    The reason in full is on `NewTeam`. */}
                <Command.Item
                  className="hirerow"
                  value="hire an agent"
                  keywords={['hire', 'new', 'add']}
                  onSelect={() => setHiring(true)}
                >
                  <span className="ico">
                    <UserPlus size={17} aria-hidden />
                  </span>
                  <span>hire an agent</span>
                </Command.Item>
              </Command.List>
            </Command>
          </div>
        </div>
      </div>

      {hiring && (
        <HireAgent
          runtimes={runtimes}
          onRuntimesChanged={rescan}
          onClose={() => setHiring(false)}
          onHired={async (profileId) => {
            await reloadRoster();
            pick(profileId);
            setHiring(false);
          }}
        />
      )}
    </>
  );
}
