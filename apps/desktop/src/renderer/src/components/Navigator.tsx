import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import type { UiAgent, UiTeam, UiTeamSummary } from '../../../shared/api.js';
import { Blob } from './Blob.js';
import { TeamMark } from './TeamMark.js';

/** One findable agent: who, and on which team, since the same person can be on several. */
interface Found {
  readonly teamId: string;
  readonly teamName: string;
  readonly id: string;
  readonly name: string;
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
  onClose: () => void;
  /** `teamId` is the open team for everyone the rail is already drawing panes for. */
  onSelectAgent: (teamId: string, agentId: string) => void;
  /** Absent in demo mode, which has one team and no way to leave it. */
  onSelectTeam?: (teamId: string) => void;
  onOpenAgents?: () => void;
  /** Opens *settings*. Absent in demo mode, which configures nothing that outlives it. */
  onOpenSettings?: () => void;
  onNewTeam?: () => void;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const byId = new Map(agents.map((agent) => [agent.id, agent]));

  // Every agent on every team, the open team's first: those are the ones a click already
  // reaches, and the ones the user is most often looking for. The rest carry their team's name,
  // because "Alice" on two teams is two agents with two workspaces and two sessions, and the
  // team is the only thing that tells them apart.
  const here: readonly Found[] = agents.map((agent) => ({
    teamId: team.id,
    teamName: team.name,
    id: agent.id,
    name: agent.name,
    ...(agent.hue === undefined ? {} : { hue: agent.hue }),
    ...(agent.shape === undefined ? {} : { shape: agent.shape }),
  }));
  const elsewhere: readonly Found[] = teams
    .filter((row) => row.id !== team.id)
    .flatMap((row) =>
      row.members.map((member) => ({
        teamId: row.id,
        teamName: row.name,
        id: member.id,
        name: member.name,
        ...(member.hue === undefined ? {} : { hue: member.hue }),
        ...(member.shape === undefined ? {} : { shape: member.shape }),
      })),
    );
  const found = [...here, ...elsewhere];

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
                    // Agent ids are per membership, so the same person on two teams is two
                    // rows and neither key collides.
                    key={`${row.teamId}:${row.id}`}
                    value={`agent:${row.teamId}:${row.id}`}
                    // What cmdk matches on. The team's name is in here so that typing a team
                    // narrows to its people, which is how you find "the reviewer on hermes"
                    // without remembering the reviewer's name.
                    keywords={[row.name, row.teamName, byId.get(row.id)?.role ?? '']}
                    onSelect={() => onSelectAgent(row.teamId, row.id)}
                  >
                    <Blob
                      name={row.name}
                      size={20}
                      {...(row.hue === undefined ? {} : { hue: row.hue })}
                      {...(row.shape === undefined ? {} : { shape: row.shape })}
                    />
                    <span>{row.name}</span>
                    {/* Which team, unless it is the one already on screen — that row is what
                        everything else here is relative to, and labelling it would put the same
                        word down the whole list. */}
                    <span className="r">
                      {row.teamId === team.id ? (byId.get(row.id)?.role ?? '') : row.teamName}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading="TEAMS">
              {teams.map((row) => (
                <Command.Item
                  key={row.id}
                  value={`team:${row.id}`}
                  keywords={[row.name, row.workspacePath]}
                  onSelect={() => onSelectTeam?.(row.id)}
                  disabled={onSelectTeam === undefined}
                >
                  {/* The folder: this list is about where things are, not about who is in
                      them, and a team with nobody on it is still a folder. */}
                  <TeamMark {...(row.icon === undefined ? {} : { icon: row.icon })} size={20} />
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
