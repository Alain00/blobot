import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { PanelRight, PanelRightClose } from 'lucide-react';
import { Composer } from './components/Composer.js';
import { Conversation } from './components/Conversation.js';
import { Feed } from './components/Feed.js';
import { NewTeam } from './components/NewTeam.js';
import { Rail } from './components/Rail.js';
import { initialState, itemsFor, reduce, type Pane } from './model.js';
import { useFeedVisible } from './useFeedVisible.js';
import { useRailWidth } from './useRailWidth.js';

export function App(): React.JSX.Element {
  const [state, dispatch] = useReducer(reduce, initialState);
  // `--pane=<agentId>` on the main process lands here, so a screenshot can review a pane the
  // reviewer cannot click into.
  const initialPane = window.location.hash.replace('#pane=', '');
  const [pane, setPane] = useState<Pane>(
    initialPane === '' ? { kind: 'team' } : { kind: 'agent', agentId: initialPane },
  );
  const [creating, setCreating] = useState(false);
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
  const refresh = useCallback((resetPane = false) => {
    void window.blobot.snapshot().then((snapshot) => {
      showing.current = snapshot.team?.id;
      setOpenError(snapshot.openError);
      dispatch({ type: 'snapshot', snapshot });
      if (resetPane) setPane({ kind: 'team' });
    });
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
      window.blobot.onStatus((teamId, agentId, status) => {
        if (mine(teamId)) dispatch({ type: 'status', agentId, status });
      }),
      window.blobot.onMessage((teamId, message) => {
        if (mine(teamId)) dispatch({ type: 'message', message });
      }),
      window.blobot.onBudget((teamId, used, budget) => {
        if (mine(teamId)) dispatch({ type: 'budget', used, budget });
      }),
      // A team switch replaces everything the panes are showing, so it re-snapshots rather
      // than patching: the transcript on screen belongs to the team that just went away.
      window.blobot.onTeamChanged(() => refresh(true)),
    ];
    return () => {
      for (const stop of unsubscribe) stop();
    };
  }, [refresh]);

  const items = useMemo(() => itemsFor(state.items, pane), [state.items, pane]);
  const snapshot = state.snapshot;
  if (snapshot === undefined) return <div className="app" />;

  // The genuine empty state: a first launch, before any team exists.
  if (snapshot.team === undefined || creating) {
    return (
      <div className="app">
        <div className="topbar">
          <span className="wordmark">blobot</span>
          <span className="crumb">
            {snapshot.teams.length === 0 ? 'no teams yet' : `${snapshot.teams.length} teams`}
          </span>
        </div>
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

  return (
    <div className="app">
      <div className="topbar">
        <span className="wordmark">blobot</span>
        <span className="crumb">
          <b>{snapshot.team.name}</b> · {snapshot.team.workspacePath}
        </span>
        {snapshot.demoMode && <span className="badge">DEMO</span>}
        <span className="spacer" />
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
        <span className="budget">
          <span className="mono muted">TURNS</span>
          <span className="pips">
            {Array.from({ length: snapshot.team.turnBudget }, (_, index) => (
              <span
                key={index}
                className={`pip${index < state.turnsThisPrompt ? ' on' : ''}`}
              />
            ))}
          </span>
        </span>
      </div>

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
          {...(snapshot.demoMode
            ? {}
            : {
                onSelectTeam: (teamId: string) => {
                  setOpenError(undefined);
                  void window.blobot.selectTeam(teamId).then((result) => {
                    if (!result.ok) setOpenError(result.error);
                  });
                },
                onNewTeam: () => setCreating(true),
              })}
        />
        <div className="conv">
          <Conversation
            pane={pane}
            team={snapshot.team}
            agents={snapshot.agents}
            statuses={state.statuses}
            items={items}
          />
          <Composer
            agents={snapshot.agents}
            pane={pane}
            onSend={(agentId, text) => void window.blobot.prompt(agentId, text)}
          />
        </div>
        {feed.visible && <Feed entries={state.feed} agents={snapshot.agents} pane={pane} />}
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
