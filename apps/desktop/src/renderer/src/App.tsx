import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { PanelRight } from 'lucide-react';
import { Agents } from './components/Agents.js';
import { Composer } from './components/Composer.js';
import { AgentMachine } from './components/AgentMachine.js';
import { Conversation } from './components/Conversation.js';
import { Details } from './components/Details.js';
import { FileTree } from './components/FileTree.js';
import { GitPanel } from './components/GitPanel.js';
import { ComposerFooter } from './components/Handbook.js';
import { Navigator } from './components/Navigator.js';
import { NewTeam } from './components/NewTeam.js';
import { Rail } from './components/Rail.js';
import { Routines } from './components/Routines.js';
import { Settings } from './components/Settings.js';
import { AddMember } from './components/AddMember.js';
import { RetireAgent } from './components/AgentForm.js';
import { DeleteTeam, EditTeam, RemoveMember } from './components/TeamEdits.js';
import { initialState, itemsFor, paneAfterSnapshot, reduce, type Pane } from './model.js';
import { useWorkspaces } from './useWorkspaces.js';
import { useRailWidth } from './useRailWidth.js';
import { useRailPins } from './useRailPins.js';
import { useSidebarPanel } from './useSidebarPanel.js';
import { useSidebarWidth } from './useSidebarWidth.js';
import { useDictation } from './useDictation.js';
import { settingsSectionOf } from './components/Settings.js';
import { useComposerRoom } from './useComposerRoom.js';
import { usePlaySound } from './sound/useSound.js';
import type { NewTeamSpec, UiAgentProfile, UiPlanLimits, UiTeamSummary } from '../../shared/api.js';

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
  const [initialProfile, setInitialProfile] = useState<UiAgentProfile>();
  /**
   * A team handed over and not yet on screen.
   *
   * The bar closes the moment the spec is complete, so the seconds that follow — an Agent per
   * member, a worktree each, a session in every one — happen behind the ordinary window instead
   * of under a modal saying *creating…*. It only shows on a first launch, where there is no
   * window behind it to go back to.
   */
  const [starting, setStarting] = useState(false);
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
  // Every login's Plan limit, app-wide: held beside the team model rather than in it, because a
  // team switch replaces that model and a login is not the team's.
  const [planLimits, setPlanLimits] = useState<UiPlanLimits>({});
  const [inSettings, setInSettings] = useState(
    (opened.get('screen') ?? '').startsWith('settings'),
  );
  const settingsSection = settingsSectionOf(opened.get('screen') ?? undefined);
  /** The navigator, on ctrl+k. `--screen=find` opens it for a screenshot. */
  const [finding, setFinding] = useState(opened.get('screen') === 'find');
  /** The team a modal is about, and which one. Never the team on screen by implication. */
  const [editing, setEditing] = useState<string | undefined>(undefined);
  /**
   * Adding somebody to a team, from the sidebar head's `+`.
   *
   * Its own state beside `editing` because it is its own act: this only adds, so it is the
   * creation bar's *who* step over the window, where an edit is the whole roster restated in a
   * dialog that has to be able to report what a departure left behind.
   */
  const [adding, setAdding] = useState<string | undefined>(undefined);
  /**
   * Taking one agent off the open team, from the chooser's context menu. An **Agent id**, which
   * is the membership, because that is what the sidebar draws; the roster it composes is made of
   * profile ids, and the team's own summary is what carries both.
   */
  const [removing, setRemoving] = useState<string | undefined>(undefined);
  const [deleting, setDeleting] = useState<string | undefined>(undefined);
  /**
   * The agent the rail's menu asked to retire, whole rather than by id: the dialog prices what
   * it is about to end and names the teams that keep running, and the rail carries neither —
   * its rows are `UiRailAgent`. So the definition is read when the menu is answered.
   */
  const [retiring, setRetiring] = useState<UiAgentProfile | undefined>(undefined);
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
  /** Which rail rows are pinned, and in what order. A preference on this machine. */
  const pins = useRailPins();
  /* The file sidebar. Open unless this machine shut it, and `--screen=files` opens it at launch
     anyway, because it is a surface a screenshot cannot click to — as `--screen=details` is. */
  const sidebar = useSidebarWidth(rail.width, opened.get('screen') === 'files');
  /* Which panel it is showing. One global preference, remembered beside the width. */
  const [panel, setPanel] = useSidebarPanel();
  /** The composer floats over the transcript; this keeps the transcript's last line clear of it. */
  const convRoom = useComposerRoom();

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
  /** The AgentProfiles whose thread already exists, read by `openThread` as it is now. */
  const threaded = useRef<ReadonlySet<string>>(new Set());
  /**
   * A thread row pressed whose team has not arrived yet. The rail lights it at once; the pane,
   * and the transcript and tray it carries, stay on what is there until the snapshot swaps them
   * in one render.
   */
  const [pressed, setPressed] = useState<string | undefined>(undefined);

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

  /**
   * How many snapshots have been asked for. An answer that has been overtaken is dropped.
   *
   * `.scratch/live-steps/issues/11`. Main pushes `blobot:team` from a dozen places and each push
   * is a fresh `snapshot()`, so two are in flight across every switch — and the reducer replaces
   * the pane wholesale, so whichever lands *last* is what the transcript is. An answer that
   * describes the team the user has just left is not a stale detail to be corrected on the next
   * push: it is the previous team's whole conversation, its live blocks included, put back into
   * a pane that had moved on.
   *
   * The rule `loadEarlier` already applies, applied to the thing that replaces everything rather
   * than only to the thing that prepends to it. A counter and not the team id, because two
   * snapshots of the *same* team race the same way and the later one is still the true one.
   */
  const asked = useRef(0);

  const refresh = useCallback((resetPane = false) => {
    const mine = (asked.current += 1);
    void window.blobot.snapshot().then((snapshot) => {
      if (asked.current !== mine) return;
      const arrived = showing.current !== snapshot.team?.id;
      showing.current = snapshot.team?.id;
      setOpenError(snapshot.openError);
      dispatch({ type: 'snapshot', snapshot });
      if (!resetPane) return;
      const want = wanted.current;
      wanted.current = undefined;
      setPressed(undefined);
      setPane((open) =>
        paneAfterSnapshot({
          open,
          arrived,
          roster: snapshot.agents,
          ...(snapshot.team?.threadFor === undefined ? {} : { thread: true }),
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
    void window.blobot.planLimits().then(setPlanLimits);
    const mine = (teamId: string): boolean => teamId === showing.current;
    const unsubscribe = [
      window.blobot.onPlanLimits(setPlanLimits),
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

  /**
   * Open an agent's **thread**: their own conversation, and the only Team the user never sees as
   * one.
   *
   * The pane holds the *profile* until the thread exists, which is `.scratch/rail/issues/04`'s
   * amendment: a row is a person, so what it selects is a person, and the thread is something
   * that person's conversation acquires on the first message. Creating on press instead would
   * charge for curiosity — twenty idle clicks, twenty repositories under a directory the user is
   * meant to open in an editor.
   */
  const openThread = useCallback(
    async (profileId: string) => {
      setBrowsingAgents(false);
      setOpenError(undefined);
      // **Only a thread that does not exist yet takes the profile pane at once**, since no
      // snapshot will ever resolve that one. A thread that exists lights its row and leaves the
      // pane alone until the snapshot lands. Taking the profile pane here unmounted the
      // composer's tray and emptied the transcript for the round trip, because a profile pane
      // has neither, and both came back a frame later.
      if (threaded.current.has(profileId)) setPressed(profileId);
      else setPane({ kind: 'thread', profileId });
      const result = await window.blobot
        .openThread(profileId)
        .catch(() => ({ ok: false as const, error: 'That conversation could not be opened.' }));
      if (!result.ok) {
        setPressed(undefined);
        setOpenError(result.error);
        return result;
      }
      if (result.agentId !== undefined) {
        // **The pane stays on the profile until that agent's team is the one in hand.**
        //
        // It used to move to `{kind: 'agent'}` here, the moment main answered, and the snapshot
        // is still the team being left at that instant. An agent pane on a thread takes its
        // selected row from `team.threadFor` — the *old* thread's profile — so pressing one
        // thread lit the row you came from for a frame before the snapshot corrected it, and the
        // transcript blanked with it, since the wanted agent is not on the old roster. A team
        // with members never showed it: `openTeam` sets no pane at all, so its selection moves
        // once, when the snapshot arrives.
        //
        // `wanted` and `paneAfterSnapshot` already do this properly for every other opening. The
        // clearing of the unread mark is the one thing `openPane` was here for, so it is kept
        // outright rather than deferred: the row was pressed now.
        wanted.current = result.agentId;
        dispatch({ type: 'seen', agentId: result.agentId });
        void window.blobot.seenRoutineRuns(result.agentId);
        refresh(true);
        return result;
      }
      refresh();
      return result;
    },
    [refresh],
  );

  const items = useMemo(() => itemsFor(state.items, pane), [state.items, pane]);
  // Kept current on every render, so the callback above reads the cursor as it is now rather
  // than as it was when it was built.
  oldest.current = state.oldest;
  threaded.current = new Set(
    (state.snapshot?.teams ?? []).flatMap((row) => (row.threadFor === undefined ? [] : [row.threadFor])),
  );
  /**
   * Where each agent's work is. Local git follows the settled log, so the count moves as the
   * agents do;
   * GitHub is asked on opening the team and on the user's own refresh, and never on a timer.
   *
   * Read up here, above every early return, because this component has two of them — no
   * snapshot yet, and no team yet — and a hook below either is a hook that is not always
   * called. It takes the id as an optional and answers with nothing when there is no team.
   */
  const openTeamId = state.snapshot?.team?.id;
  const workspaces = useWorkspaces(openTeamId, state.settled);
  /**
   * Take the creation bar's spec, close it, and let the rail report what happens.
   *
   * Nothing awaits this on screen. A failure lands in the strip above the panes, which is where
   * *the team you clicked would not open* already goes, because it is the same kind of news
   * about the same kind of thing. On success the snapshot brings the team in as the open one,
   * `switchTo` having already made it current in main.
   */
  const startTeam = useCallback(
    (spec: NewTeamSpec) => {
      setCreating(false);
      setInitialProfile(undefined);
      setStarting(true);
      void window.blobot.createTeam(spec).then((result) => {
        setStarting(false);
        if (result.ok) refresh(true);
        else setOpenError(result.error ?? 'The team could not be created.');
      });
    },
    [refresh],
  );

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
  const addingTeam = snapshot.teams.find((row) => row.id === adding);
  const removingFrom = snapshot.teams.find((row) => row.id === openTeamId);
  const leaving = removingFrom?.members.find((row) => row.id === removing);
  // `--screen=delete-team` opens it on the team that is showing, so the dialog that prices a
  // full clean is reviewable by a screenshot. The id is not known until the snapshot arrives.
  const deletingTeam =
    snapshot.teams.find((row) => row.id === deleting) ??
    (opened.get('screen') === 'delete-team' ? snapshot.teams[0] : undefined);

  // The genuine empty state: a first launch, before any team exists. Creating a team when one
  // already exists no longer comes here: the bar floats over the working surface, below, the
  // way the navigator does, because a team you are forming does not replace the team you are on.
  if (snapshot.team === undefined) {
    // The bar has gone and the first team is being made. The same blank the app shows before
    // its first snapshot, because that is exactly what this is: a window waiting for one.
    if (starting) return <div className="app" />;
    return (
      // No strip across the top. It said the product's own name and counted the teams, on the
      // one screen where neither is a thing the reader can act on, and it put a second
      // left-aligned anchor above a page that is set centred. The working surface lost its
      // header for the same reason.
      <div className="app">
        {openError !== undefined && (
          <div className="openerrorwrap">
            <div className="openerror">{openError}</div>
          </div>
        )}
        <NewTeam onCreate={startTeam} {...(initialProfile === undefined ? {} : { initialProfile })} />
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
  /**
   * Whose **thread** this pane is, when it is one — before the thread exists and after.
   *
   * Both halves matter. Before: the pane holds an AgentProfile id and there is no Agent, so the
   * composer takes its name from the rail's own list. After: the pane holds an Agent id and the
   * open team carries `threadFor`, which is the stored value rather than a roster inference.
   */
  const threadProfileId =
    pane.kind === 'thread' ? pane.profileId : undefined;
  const threadName =
    pane.kind === 'thread'
      ? (snapshot.profiles ?? []).find((profile) => profile.id === pane.profileId)?.name
      : team.threadFor !== undefined && pane.kind === 'agent'
        ? nameOf(pane.agentId)
        : undefined;

  return (
    <div className="app">
      {/* Above the panes rather than inside them: the team on screen is still the one that
          was there, and nothing in it is wrong. What failed was the click. */}
      {openError !== undefined && (
        /* The wrapper is what grows, because what has to move is everything beneath it: this sits
           above the panes and in flow, so arriving it shoves the whole working surface down. */
        <div className="openerrorwrap">
          <div className="openerror">
            {openError}
            <button className="dismiss" onClick={() => setOpenError(undefined)} aria-label="Dismiss">
              ×
            </button>
          </div>
        </div>
      )}
      <div
        /* A drag animates nothing and tracks the pointer exactly: an animated drag is a panel
           that lags your hand, which reads as the app being slow rather than as motion. The
           snap shut below the floor is the one animated part of a drag, because that is the app
           acting rather than the hand — and it lands here, once the pointer is up. */
        className={`vA${rail.dragging || sidebar.dragging ? ' dragging' : ''}`}
        style={{
          gridTemplateColumns: `${rail.width}px minmax(0,1fr) ${sidebar.width}px`,
        }}
      >
        <Rail
          team={snapshot.team}
          teams={snapshot.teams}
          {...(snapshot.profiles === undefined ? {} : { profiles: snapshot.profiles })}
          agents={snapshot.agents}
          statuses={state.statuses}
          pane={pane}
          {...(pressed === undefined ? {} : { pressed })}
          unread={state.unread}
          pinned={pins.pinned}
          onSelect={openPane}
          // Not gated on having several teams, unlike the rest of the rail's chrome: a door
          // that appears once you have eight teams is a door nobody finds. Demo mode has it
          // too, where it switches panes and cannot switch teams.
          onFind={() => setFinding(true)}
          {...(snapshot.demoMode
            ? {}
            : {
                onSelectTeam: (teamId: string) => openTeam(teamId),
                onSelectAgent: (profileId: string) => void openThread(profileId),
                onTogglePin: pins.toggle,
                onDeleteThread: (teamId: string) => setDeleting(teamId),
                onRetireAgent: (profileId: string) => {
                  void window.blobot.listAgents().then((list) => {
                    const found = list.find((one) => one.id === profileId);
                    if (found !== undefined) setRetiring(found);
                  });
                },
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
            /* The people who wrote into this transcript and have since been taken off the team.
               Handed only here: every other surface in the window is about the roster, and a
               departed member belongs in none of them. `.scratch/team-addressing/issues/07`. */
            departed={snapshot.departed ?? []}
            statuses={state.statuses}
            items={items}
            opening={snapshot.opening === true}
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
                {/* Where the activity column's toggle stood, and the same two blocks behind
                    it: the column is gone and `CONTEXT` and `WORKSPACE` are read on purpose
                    now rather than watched. */}
                <Details
                  {...(snapshot.demoMode ? {} : { teamId: team.id })}
                  agents={snapshot.agents}
                  usage={state.usage}
                  planLimits={planLimits}
                  injection={state.injection}
                  handbooks={state.handbooks}
                  workspaces={pane.kind === 'team' ? workspaces.statuses : []}
                  looking={workspaces.looking}
                  onRefreshWorkspaces={workspaces.refresh}
                  onPublish={publish}
                  onPlan={plan}
                  startOpen={opened.get('screen') === 'details'}
                />
                {/* The second glyph in this chrome, beside the details one, where the activity
                    column's own toggle stood. Two is not a row of switches; a third would be,
                    and that is the standing limit for a chrome that has been pruned twice. */}
                <button
                  type="button"
                  className="paneltoggle"
                  onClick={sidebar.toggle}
                  aria-pressed={sidebar.open}
                  title="Files"
                  aria-label="Files"
                >
                  <PanelRight size={16} aria-hidden />
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
            {...(threadName === undefined ? {} : { thread: { name: threadName } })}
            opening={snapshot.opening === true}
            /* Where the user just arrived. The composer puts the cursor in the field whenever
               this changes, which is what a click on the rail was for. */
            place={place}
            onSend={(agentIds, text, attachmentIds) => {
              // The most frequent committed act in the app, and the shortest and quietest sound
              // in the set because of it. It survives the frequency because it is the one
              // committed act whose completion nothing else reports once the eye has moved.
              playSound('send');
              // A thread's **first** message is what makes the thread: the folder, the Team, the
              // Agent and the launch all happen behind this one call, so it is not a `prompt`
              // with a creation step bolted on the renderer's side. A failure comes back here
              // and lands in the strip above the panes, and the composer keeps the words.
              if (threadProfileId !== undefined) {
                void window.blobot
                  .promptThread(threadProfileId, text, attachmentIds)
                  .then((result) => {
                    if (!result.ok) return setOpenError(result.error);
                    if (result.agentId !== undefined) {
                      wanted.current = result.agentId;
                      setPane({ kind: 'agent', agentId: result.agentId });
                    }
                    refresh();
                  });
                return;
              }
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
                  /* Above the field: what this agent's Machine is doing, and nothing else.
                     Briefing is not announced here any more — an unbriefed agent says so in
                     its own first words, which is the only place there is no third party in
                     the room. */
                  notice: <>
                    {snapshot.agents.filter((agent) => agent.id === pane.agentId)
                      .map((agent) => <AgentMachine key={`${team.id}:${agent.id}`} teamId={team.id} agent={agent} status={state.statuses[agent.id] ?? 'idle'} />)}
                  </>,
                  footer: (
                    <ComposerFooter
                      key={pane.agentId}
                      status={workspaces.statuses.find((row) => row.agentId === pane.agentId)}
                      teamId={openTeamId}
                      busy={(state.statuses[pane.agentId] ?? 'idle') !== 'idle'}
                      onSwitched={workspaces.refresh}
                      onOpenChanges={() => {
                        // The tray's figure is a door to the panel that can act on it, and the
                        // sidebar may be shut when it is pressed.
                        setPanel('git');
                        if (!sidebar.open) sidebar.toggle();
                      }}
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
        {/* The third column, restored. `DESIGN.md`'s flanks rule takes an amendment for it and
            the test in that amendment is what it passes: this is the only rendering of which
            files an agent has touched, where the activity column drew what the transcript was
            already drawing. Its expansion memory is per `<team>/<agent>` and lives here for as
            long as the panel is open, which is what makes switching agents and coming back
            cheap; closing it is a person putting it away, and it starts fresh. */}
        {sidebar.open &&
          (() => {
            // Two panels, one shell, one set of props: the head, the chooser and the short true
            // sentences about a folder are the shell's, so the panels differ only in the body.
            const shared = {
              teamId: openTeamId,
              pane,
              agents: snapshot.agents,
              workspaces: workspaces.statuses,
              demoMode: snapshot.demoMode === true,
              revision: state.settled,
              panel,
              onPanel: setPanel,
              onSelectAgent: (agentId: string) => openPane({ kind: 'agent', agentId }),
              onSelectTeam: () => openPane({ kind: 'team' }),
              // The head over the chooser. A thread has no roster to add to — it is one agent's
              // own conversation — and demo mode's team is a TypeScript file, so both lose the
              // `+` and a thread loses the head with it: its name is the agent's, said twice.
              ...(snapshot.demoMode === true || team.threadFor !== undefined
                ? {}
                : {
                    teamName: team.name,
                    onAddMember: () => setAdding(team.id),
                    // Offered only where it can be composed and where it leaves a team behind:
                    // the roster on the wire is profile ids, and a team formed before profiles
                    // existed has members with none — dropping those would take everybody off.
                    // And a team of nobody is not a team, so the last member cannot leave.
                    ...(removingFrom !== undefined &&
                    removingFrom.members.length > 1 &&
                    removingFrom.members.every((row) => row.profileId !== undefined)
                      ? { onRemoveMember: (agentId: string) => setRemoving(agentId) }
                      : {}),
                  }),
            };
            return panel === 'git' ? (
              <GitPanel
                {...shared}
                busy={pane.kind === 'agent' && (state.statuses[pane.agentId] ?? 'idle') !== 'idle'}
                onCommitted={workspaces.refresh}
              />
            ) : (
              <FileTree {...shared} />
            );
          })()}
        {sidebar.open && (
          <div
            className={`sidebargrab${sidebar.dragging ? ' on' : ''}`}
            style={{ right: sidebar.width }}
            onPointerDown={sidebar.onPointerDown}
            onPointerMove={sidebar.onPointerMove}
            onPointerUp={sidebar.onPointerUp}
          />
        )}
        {removingFrom !== undefined && leaving !== undefined && (
          <RemoveMember
            team={removingFrom}
            member={leaving}
            onClose={() => setRemoving(undefined)}
            onRemoved={() => refresh(true)}
          />
        )}
        {addingTeam !== undefined && (
          <AddMember
            team={addingTeam}
            onClose={() => setAdding(undefined)}
            // Handed over and gone, which is `startTeam`'s shape and for its reason: the edit
            // provisions a workspace, opens a session and restarts the team before it comes
            // back, and a bar held over the window for those seconds is a lock on a window with
            // nothing wrong with it. A failure lands in the strip above the panes.
            onAdd={(profileIds) => {
              setAdding(undefined);
              void window.blobot
                .editTeam(addingTeam.id, profileIds, addingTeam.leadProfileId, {})
                .then((result) => {
                  if (result.ok) refresh(true);
                  else setOpenError(result.error ?? 'The team could not be changed.');
                });
            }}
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
        {/* Browsing and editing definitions keep the working surface alive. `talk` is explicit
            navigation to that agent's own conversation, so it closes the screen. */}
        {browsingAgents && (
          <Agents
            onClose={() => setBrowsingAgents(false)}
            onChanged={refresh}
            hiringAtOnce={opened.get('screen') === 'hire'}
            onTalk={(profileId) => void openThread(profileId)}
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
        {/* Retiring, from the rail's own menu. The same dialog *your agents* opens, because it
            is the same act and a second wording of it would be a second answer to what retiring
            costs. */}
        {retiring !== undefined && (
          <RetireAgent
            agent={retiring}
            onClose={() => setRetiring(undefined)}
            onRetired={() => refresh(true)}
          />
        )}
        {deletingTeam !== undefined && (
          <DeleteTeam
            team={deletingTeam}
            onClose={() => setDeleting(undefined)}
            onDeleted={() => refresh(true)}
          />
        )}
        {/* The same layer the navigator takes, and for the same reason: forming a team is a
            door, not a place, and the team you are on is still running behind it. */}
        {creating && (
          <NewTeam onCancel={() => {
            setCreating(false);
            if (initialProfile !== undefined) setBrowsingAgents(true);
            setInitialProfile(undefined);
          }} onCreate={startTeam} {...(initialProfile === undefined ? {} : { initialProfile })} />
        )}
        {/* Over every other layer, because it is how you leave the one you are on. It is the
            only surface in the app that is not a place: it opens on a key, answers, and goes. */}
        {finding && (
          <Navigator
            team={team}
            teams={snapshot.teams}
            agents={snapshot.agents}
            {...(snapshot.profiles === undefined ? {} : { profiles: snapshot.profiles })}
            onClose={() => setFinding(false)}
            onSelectAgent={(profileId) => {
              setFinding(false);
              void openThread(profileId);
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
