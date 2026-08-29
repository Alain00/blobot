import { useEffect, useMemo, useReducer, useState } from 'react';
import { Composer } from './components/Composer.js';
import { Conversation } from './components/Conversation.js';
import { Feed } from './components/Feed.js';
import { Rail } from './components/Rail.js';
import { initialState, itemsFor, reduce, type Pane } from './model.js';

export function App(): React.JSX.Element {
  const [state, dispatch] = useReducer(reduce, initialState);
  // `--pane=<agentId>` on the main process lands here, so a screenshot can review a pane the
  // reviewer cannot click into.
  const initialPane = window.location.hash.replace('#pane=', '');
  const [pane, setPane] = useState<Pane>(
    initialPane === '' ? { kind: 'team' } : { kind: 'agent', agentId: initialPane },
  );

  useEffect(() => {
    void window.blobot.snapshot().then((snapshot) => dispatch({ type: 'snapshot', snapshot }));
    const unsubscribe = [
      window.blobot.onEvent((event) => dispatch({ type: 'event', event })),
      window.blobot.onTurns((turnsThisPrompt) => dispatch({ type: 'turns', turnsThisPrompt })),
      window.blobot.onStatus((agentId, status) => dispatch({ type: 'status', agentId, status })),
      window.blobot.onMessage((message) => dispatch({ type: 'message', message })),
      window.blobot.onBudget((used, budget) => dispatch({ type: 'budget', used, budget })),
    ];
    return () => {
      for (const stop of unsubscribe) stop();
    };
  }, []);

  const items = useMemo(() => itemsFor(state.items, pane), [state.items, pane]);
  const snapshot = state.snapshot;
  if (snapshot === undefined) return <div className="app" />;

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
            turn budget spent — continue
          </button>
        )}
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

      <div className="vA">
        <Rail
          team={snapshot.team}
          agents={snapshot.agents}
          statuses={state.statuses}
          pane={pane}
          onSelect={setPane}
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
        <Feed entries={state.feed} agents={snapshot.agents} pane={pane} />
      </div>
    </div>
  );
}
