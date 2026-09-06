import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import type { UiAgent, UiRailAgent, UiTeam, UiTeamSummary } from '../../../shared/api.js';
import { Blob } from './Blob.js';
import { TeamMark } from './TeamMark.js';

/**
 * One findable agent: the **person**, not the seat.
 *
 * `.scratch/rail/issues/05`. It used to be one row per membership, so Alice on four teams was
 * four rows — the sixteen-row list this whole redesign refused, and worse in a search result,
 * where rows have no grouping to tell them apart. Selecting one opens their thread, which is
 * what their rail row does. A member of a team is still found by finding the team.
 */
interface Found {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly hue?: number;
  readonly shape?: string;
}

/**
 * Find a team or an agent by typing its name.
 *
 * The rail is a list you *scan*, and scanning stops working somewhere around eight or nine
 * rows — sooner than a roster gets large, because the open team expands into a row per agent.
 * This is the other half of the answer: the rail stays the place you look, and this is the
 * place you ask.
 *
 * It is deliberately **not** a search bar in the chrome. A field sitting above the working
 * surface all day is a control the user pays for on every screen and uses on few of them, and
 * the strip it would go in was removed the same week for being a second copy of the rail. So it
 * is a layer, on one key, gone the moment it has answered — the same shape *your agents* takes,
 * for the same reason.
 *
 * **Names only, and nothing from inside a transcript.** Searching what agents *said* is a
 * different feature with a different price: it needs an addressable message and somewhere to
 * scroll to, and neither exists yet. A navigator that quietly returned message hits would be
 * promising that.
 */
export function Navigator({
  team,
  teams,
  agents,
  profiles,
  onClose,
  onSelectAgent,
  onSelectTeam,
  onOpenAgents,
  onOpenSettings,
  onNewTeam,
}: {
  /** The team on screen. Its agents are the ones a pane can be opened on directly. */
  team: UiTeam;
  teams: readonly UiTeamSummary[];
  /** The open team's roster, which is the only one carrying roles and hues. */
  agents: readonly UiAgent[];
  /** Every hired agent, which is what this list is. Absent in demo mode. */
  profiles?: readonly UiRailAgent[];
  onClose: () => void;
  /** Opens that agent's thread, by AgentProfile id. The same act as their rail row. */
  onSelectAgent: (profileId: string) => void;
  /** Absent in demo mode, which has one team and no way to leave it. */
  onSelectTeam?: (teamId: string) => void;
  onOpenAgents?: () => void;
  /** Opens *settings*. Absent in demo mode, which configures nothing that outlives it. */
  onOpenSettings?: () => void;
  onNewTeam?: () => void;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const roles = new Map(agents.map((agent) => [agent.name, agent.role]));
  const found: readonly Found[] = (profiles ?? []).map((profile) => ({
    id: profile.id,
    name: profile.name,
    role: profile.role,
    ...(profile.hue === undefined ? {} : { hue: profile.hue }),
    ...(profile.shape === undefined ? {} : { shape: profile.shape }),
  }));
  // A **thread** is never findable as a team: it is one thing, and it is already in the list
  // above under the agent's own name. `.scratch/rail/issues/05-where-a-thread-is-hidden.md`.
  const findableTeams = teams.filter((row) => row.threadFor === undefined);

  // Escape closes it even when the field has not taken focus yet, and cmdk does not claim the
  // key. Captured on the window rather than on the sheet, for the same reason *your agents*
  // does it: a layer that ignores Escape reads as stuck.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    // Mousedown rather than click: the field is about to lose focus anyway, and a layer that
    // waits for the button to come back up feels like it is deciding.
    <div className="navscrim" onMouseDown={onClose}>
      <div className="navsheet" onMouseDown={(event) => event.stopPropagation()}>
        <Command label="Find a team or an agent" loop>
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Find a team or an agent"
          />
          <Command.List>
            <Command.Empty>Nobody by that name</Command.Empty>

            {found.length > 0 && (
              <Command.Group heading="AGENTS">
                {found.map((row) => (
                  <Command.Item
                    // One row per person, so the profile id is the key.
                    key={row.id}
                    value={`agent:${row.id}`}
                    // What cmdk matches on. The role is in here so that "reviewer" finds the
                    // reviewer without remembering their name.
                    keywords={[row.name, row.role, roles.get(row.name) ?? '']}
                    onSelect={() => onSelectAgent(row.id)}
                  >
                    <Blob
                      name={row.name}
                      size={20}
                      {...(row.hue === undefined ? {} : { hue: row.hue })}
                      {...(row.shape === undefined ? {} : { shape: row.shape })}
                    />
                    <span>{row.name}</span>
                    {/* The role, and never a team. A row is the person, and a person on four
                        teams has no one team to name here. */}
                    <span className="r">{row.role}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading="TEAMS">
              {findableTeams.map((row) => (
                <Command.Item
                  key={row.id}
                  value={`team:${row.id}`}
                  keywords={[row.name, row.workspacePath]}
                  onSelect={() => onSelectTeam?.(row.id)}
                  disabled={onSelectTeam === undefined}
                >
                  {/* The folder: this list is about where things are, not about who is in
                      them, and a team with nobody on it is still a folder. */}
                  <TeamMark
                    {...(row.icon === undefined ? {} : { icon: row.icon })}
                    members={row.members}
                    size={20}
                  />
                  <span>{row.name}</span>
                  <span className="r">{row.workspacePath}</span>
                </Command.Item>
              ))}
            </Command.Group>

            {(onOpenAgents !== undefined ||
              onNewTeam !== undefined ||
              onOpenSettings !== undefined) && (
              <Command.Group heading="GO TO">
                {onOpenAgents !== undefined && (
                  <Command.Item
                    value="place:agents"
                    keywords={['your agents', 'hire', 'roster']}
                    onSelect={onOpenAgents}
                  >
                    <span className="cmd">your agents</span>
                    <span className="r">everyone you have hired</span>
                  </Command.Item>
                )}
                {onNewTeam !== undefined && (
                  <Command.Item value="place:new-team" keywords={['new team']} onSelect={onNewTeam}>
                    <span className="cmd">new team</span>
                    <span className="r">pick a folder and form a team</span>
                  </Command.Item>
                )}
                {onOpenSettings !== undefined && (
                  <Command.Item
                    value="place:settings"
                    keywords={['settings', 'runtimes', 'sign in', 'install']}
                    onSelect={onOpenSettings}
                  >
                    <span className="cmd">settings</span>
                    <span className="r">which runtimes this machine has</span>
                  </Command.Item>
                )}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
