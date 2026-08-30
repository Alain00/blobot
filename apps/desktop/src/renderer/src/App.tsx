import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { PanelRight, PanelRightClose } from 'lucide-react';
import { Agents } from './components/Agents.js';
import { Composer } from './components/Composer.js';
import { Conversation } from './components/Conversation.js';
import { Feed } from './components/Feed.js';
import { WorkspaceLine } from './components/Workspaces.js';
import { Navigator } from './components/Navigator.js';
import { NewTeam } from './components/NewTeam.js';
import { Rail } from './components/Rail.js';
import { DeleteTeam, EditTeam } from './components/TeamEdits.js';
import { initialState, itemsFor, reduce, type Pane } from './model.js';
import { useFeedVisible } from './useFeedVisible.js';
import { useWorkspaces } from './useWorkspaces.js';
import { useRailWidth } from './useRailWidth.js';

export function App(): React.JSX.Element {
  const [state, dispatch] = useReducer(reduce, initialState);
  // `--pane=<agentId>` and `--screen=agents` on the main process land here, so a screenshot can
  // review a surface the reviewer cannot click into.
  const opened = new URLSearchParams(window.location.hash.slice(1));
  const initialPane = opened.get('pane') ?? '';
  const [pane, setPane] = useState<Pane>(
    initialPane === '' ? { kind: 'team' } : { kind: 'agent', agentId: initialPane },
  );
  // `--screen=new-team` opens it, for the same reason `--screen=agents` exists: the flow is a
  // surface a screenshot cannot click its way to, and now one of its steps decides who leads.
  const [creating, setCreating] = useState(opened.get('screen') === 'new-team');
  /** *Your agents*, over the working surface. Not a modal: it is a place, not a decision. */
  // `--screen=hire` is the same place with its one dialog open, because the runtime picker and
  // what it now offers to do about a runtime live in there and nowhere a screenshot can reach.
  const [browsingAgents, setBrowsingAgents] = useState(
    opened.get('screen') === 'agents' || opened.get('screen') === 'hire',
  );
  /** The navigator, on ctrl+k. `--screen=find` opens it for a screenshot. */
  const [finding, setFinding] = useState(opened.get('screen') === 'find');
  /** The team a modal is about, and which one. Never the team on screen by implication. */
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const [deleting, setDeleting] = useState<string | undefined>(undefined);
  /** Why the last team the user clicked would not open. Cleared by the next click. */
  const [openError, setOpenError] = useState<string | undefined>(undefined);
  const rail = useRailWidth();
  const feed = useFeedVisible();

  /**
   * The team these streams are allowed to be about.
   *
   * Several teams are live at once and all of them stream, so the reducer — which holds one
   * flat list of items, and which the rail reads each agent's preview line out of — has to be
   * told which ones are the team on screen. A ref rather than state: the listeners below are
   * registered once, and a stale closure here would show another team's words.
   */
  const showing = useRef<string | undefined>(undefined);

  // Resetting the pane belongs to a team *change*: the agent it was showing belongs to the
  // team that just went away. On the first snapshot it threw away `--pane=<agentId>`, which is
  // how a screenshot reviews a pane nobody is there to click into.
  /**
   * The agent the navigator asked for on a team that was not open yet.
   *
   * Switching teams resets the pane, because the agent it was showing belongs to the team that
   * just went away — so a navigator that set the pane itself would be overwritten a moment
   * later by the snapshot. It leaves the wish here instead, and the reset honours it once the
   * roster it names has actually arrived.
   */
  const wanted = useRef<string | undefined>(undefined);

  const refresh = useCallback((resetPane = false) => {
    void window.blobot.snapshot().then((snapshot) => {
      showing.current = snapshot.team?.id;
      setOpenError(snapshot.openError);
      dispatch({ type: 'snapshot', snapshot });
      if (!resetPane) return;
      const want = wanted.current;
      wanted.current = undefined;
      setPane(
        want !== undefined && snapshot.agents.some((agent) => agent.id === want)
          ? { kind: 'agent', agentId: want }
          : { kind: 'team' },
      );
    });
  }, []);

  // One key for the navigator, and the same one the rest of the desktop uses for "find the
  // thing by name". It is a window listener because the composer holds focus almost all the
  // time and this must not be a control you first have to click away from.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'k' || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      setFinding((open) => !open);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    refresh();
    const mine = (teamId: string): boolean => teamId === showing.current;
    const unsubscribe = [
      window.blobot.onEvent((teamId, event) => {
        if (mine(teamId)) dispatch({ type: 'event', event });
      }),
      window.blobot.onTurns((teamId, turnsThisPrompt) => {
        if (mine(teamId)) dispatch({ type: 'turns', turnsThisPrompt });
      }),
      // The one stream that is *not* filtered to the team on screen. Every other channel here
      // would draw another team's work into this transcript, which is the bug the filter
      // exists for. A status is different: it is what the rail row is, and a backgrounded
      // team that is working, or stuck at `waiting`, has no other way to say so. Keyed by
      // agent id, which is per membership, so no two teams can write the same entry.
      window.blobot.onStatus((_teamId, agentId, status) => {
        dispatch({ type: 'status', agentId, status });
      }),
      window.blobot.onCommands((teamId, agentId, commands) => {
        if (mine(teamId)) dispatch({ type: 'commands', agentId, commands });
      }),
      window.blobot.onMessage((teamId, message) => {
        if (mine(teamId)) dispatch({ type: 'message', message });
      }),
      window.blobot.onBudget((teamId, used, budget) => {
        if (mine(teamId)) dispatch({ type: 'budget', used, budget });
      }),
      window.blobot.onSilentHandoff((teamId, agentId, named, at) => {
        if (mine(teamId)) dispatch({ type: 'silentHandoff', agentId, named, at });
      }),
      // A backgrounded team can be blocked on the user too. It is not drawn into this
      // transcript — that is what the team filter is for — and the rail says `waiting` on it
      // the moment it is opened, because status comes with the snapshot.
      window.blobot.onPermission((teamId, request) => {
        if (mine(teamId)) dispatch({ type: 'permission', request, at: Date.now() });
      }),
      window.blobot.onPermissionSettled((teamId, requestId, outcome) => {
        if (mine(teamId)) dispatch({ type: 'permissionSettled', id: requestId, outcome });
      }),
      // A team switch replaces everything the panes are showing, so it re-snapshots rather
      // than patching: the transcript on screen belongs to the team that just went away.
      window.blobot.onTeamChanged(() => refresh(true)),
    ];
    return () => {
      for (const stop of unsubscribe) stop();
    };
  }, [refresh]);

  /** Open a team, and optionally land on one of its agents once its roster arrives. */
  const openTeam = useCallback((teamId: string, agentId?: string) => {
    setOpenError(undefined);
    wanted.current = agentId;
    void window.blobot.selectTeam(teamId).then((result) => {
      if (result.ok) return;
      wanted.current = undefined;
      setOpenError(result.error);
    });
  }, []);

  const items = useMemo(() => itemsFor(state.items, pane), [state.items, pane]);
  /**
   * Where each agent's work is. Local git follows the feed, so the count moves as the agents do;
   * GitHub is asked on opening the team and on the user's own refresh, and never on a timer.
   *
   * Read up here, above every early return, because this component has two of them — no
   * snapshot yet, and no team yet — and a hook below either is a hook that is not always
   * called. It takes the id as an optional and answers with nothing when there is no team.
   */
  const openTeamId = state.snapshot?.team?.id;
  const workspaces = useWorkspaces(openTeamId, state.feed.length);
  const refreshWorkspaces = workspaces.refresh;
  const publish = useCallback(
    (agentId: string, options: { title?: string; draft?: boolean }) => {
      if (openTeamId === undefined) {
        return Promise.resolve({ ok: false as const, step: 'create' as const, error: 'No team is open.' });
      }
      return window.blobot.publishBranch(openTeamId, agentId, options).then((result) => {
        // Whatever happened, the branch may now be on the remote and there may now be a pull
        // request. Both are things only this read can see.
        refreshWorkspaces();
        return result;
      });
    },
    [openTeamId, refreshWorkspaces],
  );
  const plan = useCallback(
    (agentId: string, options: { title?: string; draft?: boolean }) =>
      openTeamId === undefined
        ? Promise.resolve([] as readonly string[])
        : window.blobot.publishPlan(openTeamId, agentId, options),
    [openTeamId],
  );
  const snapshot = state.snapshot;
  if (snapshot === undefined) return <div className="app" />;
  // Looked up rather than copied into state: a team that has just been deleted must not stay
  // on screen inside a modal that is about it.
  const editingTeam = snapshot.teams.find((row) => row.id === editing);
  // `--screen=delete-team` opens it on the team that is showing, so the dialog that prices a
  // full clean is reviewable by a screenshot. The id is not known until the snapshot arrives.
  const deletingTeam =
    snapshot.teams.find((row) => row.id === deleting) ??
    (opened.get('screen') === 'delete-team' ? snapshot.teams[0] : undefined);

  // The genuine empty state: a first launch, before any team exists.
  if (snapshot.team === undefined || creating) {
    return (
      // No strip across the top. It said the product's own name and counted the teams, on the
      // one screen where neither is a thing the reader can act on, and it put a second
      // left-aligned anchor above a page that is set centred. The working surface lost its
      // header for the same reason.
      <div className="app">
        {openError !== undefined && <div className="openerror">{openError}</div>}
        <NewTeam
          {...(snapshot.team === undefined ? {} : { onCancel: () => setCreating(false) })}
          onCreated={() => {
            setCreating(false);
            refresh(true);
          }}
        />
      </div>
    );
  }

  // The open team, narrowed once. The callbacks below run after this render and cannot lean on
  // the early return above.
  const team = snapshot.team;

  return (
    <div className="app">
      {/* Above the panes rather than inside them: the team on screen is still the one that
          was there, and nothing in it is wrong. What failed was the click. */}
      {openError !== undefined && (
        <div className="openerror">
          {openError}
          <button className="dismiss" onClick={() => setOpenError(undefined)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <div
        className="vA"
        style={{
          gridTemplateColumns: `${rail.width}px minmax(0,1fr)${feed.visible ? ' 288px' : ''}`,
        }}
      >
        <Rail
          team={snapshot.team}
          teams={snapshot.teams}
          agents={snapshot.agents}
          statuses={state.statuses}
          items={state.items}
          pane={pane}
          onSelect={setPane}
          // Not gated on having several teams, unlike the rest of the rail's chrome: a door
          // that appears once you have eight teams is a door nobody finds. Demo mode has it
          // too, where it switches panes and cannot switch teams.
          onFind={() => setFinding(true)}
          {...(snapshot.demoMode
            ? {}
            : {
                onSelectTeam: (teamId: string) => openTeam(teamId),
                onNewTeam: () => setCreating(true),
                onOpenAgents: () => setBrowsingAgents(true),
                onEditTeam: (teamId: string) => setEditing(teamId),
                onDeleteTeam: (teamId: string) => setDeleting(teamId),
              })}
        />
        <div className="conv">
          <Conversation
            pane={pane}
            agents={snapshot.agents}
            statuses={state.statuses}
            items={items}
            opening={snapshot.opening === true}
            workspacePath={snapshot.team.workspacePath}
            onAnswerPermission={(requestId, choice) =>
              void window.blobot.answerPermission(requestId, choice)
            }
            chrome={
              <>
                {snapshot.demoMode && <span className="badge">DEMO</span>}
                {state.budget !== undefined && (
                  <button className="send" onClick={() => void window.blobot.resumeAfterBudget()}>
                    turn budget spent · continue
                  </button>
                )}
                <button
                  className="paneltoggle"
                  onClick={feed.toggle}
                  title={feed.visible ? 'Hide activity' : 'Show activity'}
                  aria-label={feed.visible ? 'Hide activity' : 'Show activity'}
                  aria-pressed={feed.visible}
                >
                  {feed.visible ? (
                    <PanelRightClose size={16} aria-hidden />
                  ) : (
                    <PanelRight size={16} aria-hidden />
                  )}
                </button>
                {/* The budget is per prompt and the pips fill as the team spends it, so it
                    belongs above the transcript it is being spent in. */}
                <span className="budget">
                  <span className="mono muted">TURNS</span>
                  <span className="pips">
                    {Array.from({ length: snapshot.team.turnBudget }, (_, index) => (
                      <span key={index} className={`pip${index < state.turnsThisPrompt ? ' on' : ''}`} />
                    ))}
                  </span>
                </span>
              </>
            }
          />
          <Composer
            agents={snapshot.agents}
            commands={state.commands}
            pane={pane}
            {...(snapshot.team?.leadAgentId === undefined
              ? {}
              : { lead: snapshot.team.leadAgentId })}
            opening={snapshot.opening === true}
            onSend={(agentIds, text, attachmentIds) =>
              void window.blobot.prompt(agentIds, text, attachmentIds)
            }
          />
          {/* Under the input, and only in an agent's pane: there it is one branch and one
              possible pull request, which is a sentence that can be true. The team pane's
              answer is N of them, and it is drawn in the activity column instead. */}
          {pane.kind === 'agent' && (
            <WorkspaceLine
              status={workspaces.statuses.find((row) => row.agentId === pane.agentId)}
              looking={workspaces.looking}
              onRefresh={workspaces.refresh}
              onPublish={(options) => publish(pane.agentId, options)}
              onPlan={(options) => plan(pane.agentId, options)}
            />
          )}
        </div>
        {feed.visible && (
          <Feed
            entries={state.feed}
            agents={snapshot.agents}
            usage={state.usage}
            injection={state.injection}
            pane={pane}
            workspaces={pane.kind === 'team' ? workspaces.statuses : []}
            looking={workspaces.looking}
            onRefreshWorkspaces={workspaces.refresh}
            onPublish={publish}
            onPlan={plan}
          />
        )}
        {editingTeam !== undefined && (
          <EditTeam
            team={editingTeam}
            onClose={() => setEditing(undefined)}
            // The roster changed under the team, so everything on screen is about to be
            // replaced: the main process restarts it and the snapshot comes back with it.
            onSaved={() => refresh(true)}
          />
        )}
        {/* Over the panes rather than in place of them: the team behind it keeps running, and
            an edit here is about agents rather than about what is on screen. Nothing it does
            restarts a team, so nothing behind it has to be torn down. */}
        {browsingAgents && (
          <Agents
            onClose={() => setBrowsingAgents(false)}
            hiringAtOnce={opened.get('screen') === 'hire'}
          />
        )}
        {deletingTeam !== undefined && (
          <DeleteTeam
            team={deletingTeam}
            onClose={() => setDeleting(undefined)}
            onDeleted={() => refresh(true)}
          />
        )}
        {/* Over every other layer, because it is how you leave the one you are on. It is the
            only surface in the app that is not a place: it opens on a key, answers, and goes. */}
        {finding && (
          <Navigator
            team={team}
            teams={snapshot.teams}
            agents={snapshot.agents}
            onClose={() => setFinding(false)}
            onSelectAgent={(teamId, agentId) => {
              setFinding(false);
              setBrowsingAgents(false);
              if (teamId === team.id) setPane({ kind: 'agent', agentId });
              else openTeam(teamId, agentId);
            }}
            {...(snapshot.demoMode
              ? {}
              : {
                  onSelectTeam: (teamId: string) => {
                    setFinding(false);
                    setBrowsingAgents(false);
                    if (teamId === team.id) setPane({ kind: 'team' });
                    else openTeam(teamId);
                  },
                  onOpenAgents: () => {
                    setFinding(false);
                    setBrowsingAgents(true);
                  },
                  onNewTeam: () => {
                    setFinding(false);
                    setCreating(true);
                  },
                })}
          />
        )}
        <div
          className={`railgrab${rail.dragging ? ' on' : ''}`}
          style={{ left: rail.width }}
          onPointerDown={rail.onPointerDown}
          onPointerMove={rail.onPointerMove}
          onPointerUp={rail.onPointerUp}
        />
      </div>
    </div>
  );
}
