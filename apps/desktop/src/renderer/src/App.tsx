import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { PanelRight, PanelRightClose } from 'lucide-react';
import { Agents } from './components/Agents.js';
import { Composer } from './components/Composer.js';
import { Conversation } from './components/Conversation.js';
import { Feed } from './components/Feed.js';
import { ComposerFooter, HandbookNotice } from './components/Handbook.js';
import { Navigator } from './components/Navigator.js';
import { NewTeam } from './components/NewTeam.js';
import { Rail } from './components/Rail.js';
import { Routines } from './components/Routines.js';
import { Settings } from './components/Settings.js';
import { DeleteTeam, EditTeam } from './components/TeamEdits.js';
import { initialState, itemsFor, paneAfterSnapshot, reduce, type Pane } from './model.js';
import { useFeedVisible } from './useFeedVisible.js';
import { useWorkspaces } from './useWorkspaces.js';
import { useRailWidth } from './useRailWidth.js';
import { useDictation } from './useDictation.js';
import { settingsSectionOf } from './components/Settings.js';
import { useComposerRoom } from './useComposerRoom.js';
import { usePlaySound } from './sound/useSound.js';

export function App(): React.JSX.Element {
  const [state, dispatch] = useReducer(reduce, initialState);
  /*
   * `.scratch/sound/issues/09-the-seam.md`. Interaction sounds are called at the committed act,
   * which is a small stable set and almost all of it is in this file. Notification sounds are
   * *subscribed* below rather than called, because a component only ever sees the open team and
   * the whole point of `waiting` is the team you are not looking at.
   */
  const playSound = usePlaySound();
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
  /** *Routines*, the second door in that group. `--screen=routines` for a screenshot. */
  const [browsingRoutines, setBrowsingRoutines] = useState(
    opened.get('screen') === 'routines' || opened.get('screen') === 'new-routine',
  );
  /** *Settings*, the third door. `--screen=settings`, or `settings:<section>`, for a screenshot. */
  const [inSettings, setInSettings] = useState(
    (opened.get('screen') ?? '').startsWith('settings'),
  );
  const settingsSection = settingsSectionOf(opened.get('screen') ?? undefined);
  /** The navigator, on ctrl+k. `--screen=find` opens it for a screenshot. */
  const [finding, setFinding] = useState(opened.get('screen') === 'find');
  /** The team a modal is about, and which one. Never the team on screen by implication. */
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const [deleting, setDeleting] = useState<string | undefined>(undefined);
  /** Why the last team the user clicked would not open. Cleared by the next click. */
  const [openError, setOpenError] = useState<string | undefined>(undefined);
  /**
   * Words the panel's `add one` put in the composer for the user to finish.
   *
   * Held here rather than in the composer because the control that offers them is in the tray
   * under it, and the two are siblings. Never cleared: the composer keys off the moment, so a
   * stale offer cannot re-fire.
   */
  const [suggest, setSuggest] = useState<{ text: string; at: number } | undefined>(undefined);
  const rail = useRailWidth();
  /** The composer floats over the transcript; this keeps the transcript's last line clear of it. */
  const convRoom = useComposerRoom();
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
  /**
   * How far back the pane reaches, for `load earlier`. A ref rather than a dependency: the
   * callback is handed to a memoized child, and rebuilding it on every page would remount the
   * control the reader is clicking.
   */
  const oldest = useRef<number | undefined>(undefined);

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

  /**
   * The window of transcript above the one on screen.
   *
   * The team id and the cursor both travel, and main refuses the call if the id is not the open
   * team: the user can switch while this is in flight, and a page that came back late and
   * prepended one team's history to another's is a worse outcome than no page.
   */
  const loadEarlier = useCallback(async (): Promise<void> => {
    const teamId = showing.current;
    const before = oldest.current;
    if (teamId === undefined || before === undefined) return;
    const page = await window.blobot.earlier(teamId, before);
    // Undefined is main saying the pane moved on. Dropping it is the whole of the handling.
    if (page === undefined || showing.current !== teamId) return;
    dispatch({
      type: 'earlier',
      messages: page.messages,
      answers: page.answers,
      moreAbove: page.moreAbove,
      ...(page.routineOrigins === undefined ? {} : { routineOrigins: page.routineOrigins }),
    });
  }, []);

  const refresh = useCallback((resetPane = false) => {
    void window.blobot.snapshot().then((snapshot) => {
      const arrived = showing.current !== snapshot.team?.id;
      showing.current = snapshot.team?.id;
      setOpenError(snapshot.openError);
      dispatch({ type: 'snapshot', snapshot });
      if (!resetPane) return;
      const want = wanted.current;
      wanted.current = undefined;
      setPane((open) =>
        paneAfterSnapshot({
          open,
          arrived,
          roster: snapshot.agents,
          ...(want === undefined ? {} : { wanted: want }),
        }),
      );
    });
  }, []);

  /**
   * Open a pane, and clear issue 11's unread mark when it is an agent's.
   *
   * **Opening that agent's pane is the only thing that clears it.** Not opening the team: the
   * team pane is not where that agent's turn is. Cleared here as well as in main so the mark
   * goes the moment the row is clicked rather than on the next snapshot — the mark is about
   * what the user is looking at, and they are looking at it now.
   */
  const openPane = useCallback((next: Pane) => {
    setPane(next);
    if (next.kind !== 'agent') return;
    dispatch({ type: 'seen', agentId: next.agentId });
    void window.blobot.seenRoutineRuns(next.agentId);
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
        // A compaction handoff, on any team. blobot chose the moment and the agent kept its
        // worktree, so nothing is asked of the user: the quietest thing in the set, and the one
        // `.scratch/sound/issues/02` names as the first to come back out if one has to.
        if (event.type === 'context_compacted') playSound('handoff');
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
      window.blobot.onMessage((teamId, message, routineName) => {
        if (mine(teamId)) {
          dispatch({
            type: 'message',
            message,
            ...(routineName === undefined ? {} : { routineName }),
          });
        }
      }),
      window.blobot.onBudget((teamId, used, budget) => {
        if (mine(teamId)) dispatch({ type: 'budget', used, budget });
      }),
      // An agent put itself on a schedule. Filtered to the team on screen like every other
      // transcript channel; a backgrounded team's block comes back with its snapshot, because
      // the block is restored from the Routine row rather than from this event.
      window.blobot.onRoutineScheduled((teamId, scheduled) => {
        if (mine(teamId)) dispatch({ type: 'scheduled', scheduled });
      }),
      // An agent wrote into its own persona. Filtered to the team on screen like every other
      // transcript channel; a backgrounded team's block comes back with its snapshot.
      window.blobot.onHandbookWrite((teamId, write) => {
        if (mine(teamId)) dispatch({ type: 'handbookWrite', write });
      }),
      window.blobot.onSilentHandoff((teamId, agentId, named, at) => {
        if (mine(teamId)) dispatch({ type: 'silentHandoff', agentId, named, at });
      }),
      // A backgrounded team can be blocked on the user too. It is not drawn into this
      // transcript — that is what the team filter is for — and the rail says `waiting` on it
      // the moment it is opened, because status comes with the snapshot.
      window.blobot.onPermission((teamId, request) => {
        if (mine(teamId)) dispatch({ type: 'permission', request, at: Date.now() });
        // The one notification that ships, and the reason DESIGN.md was amended at all. It fires
        // only in the case that justified it: **never for a team you are already looking at**, in
        // a focused window, where the inline block is in the transcript in front of you and the
        // status word is in the column. A sound there is the same claim twice in one moment.
        //
        // This channel receives every team rather than only the open one, which is exactly what
        // that rule needs, and is why it is expressed here once instead of at a call site.
        if (!mine(teamId) || !document.hasFocus()) playSound('waiting');
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
  }, [refresh, playSound]);

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
  // Kept current on every render, so the callback above reads the cursor as it is now rather
  // than as it was when it was built.
  oldest.current = state.oldest;
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
  /**
   * Dictation, when Settings says it is ready. `--screen=dictation` starts a recording on
   * arrival with a simulated level, so the composer's listening state is reviewable through
   * `--screenshot` with nobody at the microphone (`.scratch/dictation/`, ticket 07).
   */
  const dictation = useDictation({
    state: state.snapshot?.dictation ?? 'off',
    teamId: state.snapshot?.team?.id,
    simulate: opened.get('screen') === 'dictation',
  });
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
  /**
   * Where the reader is, as one string, handed to the two things that answer an arrival: the
   * transcript goes to the newest line, and the composer takes the cursor.
   *
   * The team is in it as well as the agent, because switching teams can leave you in the team
   * pane you were already in, and that is still somewhere new.
   */
  const place = `${team.id}:${pane.kind === 'agent' ? pane.agentId : ''}`;
  /** The roster's own word for an agent. The Handbook's copy is about a person, so it uses it. */
  const nameOf = (agentId: string): string =>
    snapshot.agents.find((agent) => agent.id === agentId)?.name ?? 'this agent';

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
          unread={state.unread}
          onSelect={openPane}
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
                onOpenRoutines: () => setBrowsingRoutines(true),
                onOpenSettings: () => setInSettings(true),
                onEditTeam: (teamId: string) => setEditing(teamId),
                onDeleteTeam: (teamId: string) => setDeleting(teamId),
              })}
        />
        <div className="conv" ref={convRoom}>
          <Conversation
            pane={pane}
            place={place}
            agents={snapshot.agents}
            statuses={state.statuses}
            items={items}
            opening={snapshot.opening === true}
            workspacePath={snapshot.team.workspacePath}
            moreAbove={state.moreAbove}
            onLoadEarlier={loadEarlier}
            onAnswerPermission={(requestId, choice) => {
              // Yes rises a fifth and no falls the same fifth: one interval, mirrored. `allow
              // always` is the rise plus the whispered repeat that means a standing rule was
              // written, because `allowed` and `allowed_always` are separate values in
              // `PermissionOutcome` and must not be the same sound.
              playSound(
                choice === 'reject'
                  ? 'reject'
                  : choice === 'allow_always'
                    ? 'allowAlways'
                    : 'allow',
              );
              void window.blobot.answerPermission(requestId, choice);
            }}
            routineArmed={state.routineArmed}
            // The same call the Routines screen makes, which also marks it answered: pressing
            // this is a person deciding, and the two surfaces must not disagree about one row.
            onDisarmRoutine={(routineId) => {
              // `arm` reversed with its echo removed, and removing it is the statement: the echo
              // was the part that meant it recurs.
              playSound('disarm');
              dispatch({ type: 'routineArmed', routineId, armed: false });
              void window.blobot.setRoutineArmed(routineId, false);
            }}
            // The same act as removing it in the pane's panel, on the same row. The block stays
            // where it is and keeps saying what happened; the control beside the entry goes.
            onRemoveHandbookEntry={(entryId) => {
              dispatch({ type: 'handbookRemoved', entryId });
              void window.blobot.removeHandbookEntry(entryId);
            }}
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
            usage={state.usage}
            {...(snapshot.team?.leadAgentId === undefined
              ? {}
              : { lead: snapshot.team.leadAgentId })}
            opening={snapshot.opening === true}
            /* Where the user just arrived. The composer puts the cursor in the field whenever
               this changes, which is what a click on the rail was for. */
            place={place}
            onSend={(agentIds, text, attachmentIds) => {
              // The most frequent committed act in the app, and the shortest and quietest sound
              // in the set because of it. It survives the frequency because it is the one
              // committed act whose completion nothing else reports once the eye has moved.
              playSound('send');
              void window.blobot.prompt(agentIds, text, attachmentIds);
            }}
            /* The tray under the field, and only in an agent's pane: there it is one branch and
               one possible pull request, which is a sentence that can be true. The team pane's
               answer is N of them, and it is drawn in the activity column instead. Passed as a
               node, so the composer still knows nothing about branches. */
            {...(suggest === undefined ? {} : { suggest })}
            {...(dictation === undefined ? {} : { dictation })}
            {...(pane.kind !== 'agent'
              ? {}
              : {
                  /* Unbriefed, and only then: the card is the invitation and the tray's door is
                     absent while it is up, so the two are never both on screen. */
                  ...((state.handbooks[pane.agentId] ?? []).length > 0
                    ? {}
                    : {
                        notice: (
                          <HandbookNotice
                            agentName={nameOf(pane.agentId)}
                            teamName={snapshot.team?.name ?? 'this team'}
                            busy={(state.statuses[pane.agentId] ?? 'idle') !== 'idle'}
                            onBrief={() => void window.blobot.brief(pane.agentId)}
                          />
                        ),
                      }),
                  footer: (
                    <ComposerFooter
                      key={pane.agentId}
                      status={workspaces.statuses.find((row) => row.agentId === pane.agentId)}
                      teamId={openTeamId}
                      busy={(state.statuses[pane.agentId] ?? 'idle') !== 'idle'}
                      onSwitched={workspaces.refresh}
                      onCommitted={workspaces.refresh}
                      onPublish={(options) => publish(pane.agentId, options)}
                      onPlan={(options) => plan(pane.agentId, options)}
                      entries={state.handbooks[pane.agentId] ?? []}
                      agentName={nameOf(pane.agentId)}
                      onRemoveEntry={(entryId) => {
                        dispatch({ type: 'handbookRemoved', entryId });
                        void window.blobot.removeHandbookEntry(entryId);
                      }}
                      onAddOne={() => setSuggest({ text: 'Remember this: ', at: Date.now() })}
                      startOpen={opened.get('screen') === 'handbook'}
                    />
                  ),
                })}
          />
        </div>
        {feed.visible && (
          <Feed
            entries={state.feed}
            agents={snapshot.agents}
            usage={state.usage}
            injection={state.injection}
            handbooks={state.handbooks}
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
        {/* Over the panes for the same reason *your agents* is: the team behind it keeps
            running, and nothing on this screen restarts one. Arming a Routine changes what the
            tick will do at the next firing and nothing that is happening now. */}
        {browsingRoutines && (
          <Routines
            onClose={() => setBrowsingRoutines(false)}
            writingAtOnce={opened.get('screen') === 'new-routine'}
          />
        )}
        {/* Over the panes like the two doors beside it, and for the same reason: nothing here
            restarts a team. Signing a runtime in changes what the *next* team start can do, and
            an agent already running on that runtime is already running. */}
        {inSettings && (
          <Settings
            onClose={() => setInSettings(false)}
            {...(settingsSection === undefined ? {} : { section: settingsSection })}
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
              if (teamId === team.id) openPane({ kind: 'agent', agentId });
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
                  onOpenSettings: () => {
                    setFinding(false);
                    setInSettings(true);
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
