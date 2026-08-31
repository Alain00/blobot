import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MESSAGE_AGENT_TOOL,
  PROPOSE_ROUTINE_TOOL,
  SqliteStore,
  SystemClock,
  WorkspaceError,
  openDatabase,
  remediesFor,
  remedyFor,
  uuidv7,
  type AgentStatus,
  type OpenedDatabase,
  type PendingPermission,
  type RemedyKind,
  type RuntimeDetection,
  type Team,
} from '@blobot/core';
import {
  createDemoTeam,
  demoScripts,
  DEFAULT_DEMO_SCRIPT,
  type DemoScriptName,
} from './demo-team.js';
import {
  attachmentFromBytes,
  attachmentFromPath,
  dataUrlOf,
  type PickedUp,
} from './attachments.js';
import { startTeam } from './start-team.js';
import { encodeTeamIcon, suggestTeamIcon } from './team-icon.js';
import {
  TeamCreationError,
  createTeam,
  deleteTeam,
  measureTeam,
  publishAgentBranch,
  publishPlanFor,
  commitAgentWork,
  commitPlanFor,
  readAgentBranches,
  readTeamWorkspaces,
  switchAgentBranch,
  editAgentProfile,
  editTeamRoster,
  hireAgent,
  initializeWorkspace,
  inspectWorkspace,
  prepareWorkspace,
  type AgentRemoval,
  type NewAgentSpec,
  type NewTeamSpec,
} from './team-store.js';
import { choicesOf } from './permission-choices.js';
import { runtimeLabel } from './runtime-labels.js';
import { describeRuntimeOptions, rememberRuntimeOptionsIn } from './runtime-options.js';
import { knownRuntime, knownRuntimes, refreshKnownRuntimes } from './known-runtimes.js';
import { resizeStep, startStep, stopStep, writeStep } from './runtime-step.js';
import { isWorking, type RunningTeam } from './running-team.js';
import { TeamPool } from './team-pool.js';
import { RoutineRunner } from './routine-runner.js';
import {
  routineOrigins,
  routineRows,
  routineTargets,
  scheduledRoutines,
  toRunRow,
} from './routine-rows.js';
import { ceilingFor } from './runtime-for.js';
import type {
  EditAgentResult,
  HireResult,
  UiAttachment,
  UiAttachmentRefusal,
  TeamCreationResult,
  TeamDeletionResult,
  UiAgentRemoval,
  PermissionChoice,
  UiPermissionRequest,
  UiAgentProfile,
  NewRoutineSpec,
  RoutineSaveResult,
  UiRoutine,
  UiRoutineRun,
  UiRoutineTarget,
  UiRuntimeChoice,
  UiRuntimeOptions,
  RuntimeStepOutcome,
  TeamOpenResult,
  UiEarlier,
  UiSnapshot,
  UiTeamIcon,
  UiTeamDiskUsage,
  UiWorkspaceStatus,
  UiBranches,
  UiCommitResult,
  UiPublishResult,
  UiSwitchResult,
  UiTeamSummary,
  UiWorkspaceInspection,
} from '../shared/api.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const clock = new SystemClock();

/** `--screenshot=<path>` renders a scripted turn and writes a PNG, so the UI is reviewable. */
/** `--attach=<path>` rides along with `--autoplay`, for reviewing what an attachment looks like. */
const autoplayAttachment = process.argv
  .find((arg) => arg.startsWith('--attach='))
  ?.slice('--attach='.length);
const screenshotPath = process.argv
  .find((arg) => arg.startsWith('--screenshot='))
  ?.slice('--screenshot='.length);
// `--no-autoplay` is the opt-out: reviewing a *restored* transcript is the one screenshot
// that must not send a prompt, or it is no longer a picture of what the last session left.
const autoplay =
  !process.argv.includes('--no-autoplay') &&
  (process.argv.includes('--autoplay') || screenshotPath !== undefined);

/** `--demo` is the scripted team on mock runtimes; it is not the first-run default. */
const demoMode = process.argv.includes('--demo');

/**
 * `--demo-scenario=<name>` picks which run the demo team plays. A name rather than a scenario
 * id: a script and the prompt that makes it legible are one thing, and picking a scenario
 * without its prompt is how you get a run that looks broken. `--demo-scenario=?` lists them.
 *
 * An unknown name is refused rather than quietly defaulted. A typo that silently plays the
 * usual run is a person concluding the thing they came to see does not work.
 */
const demoScriptName = ((): DemoScriptName => {
  const asked = process.argv
    .find((arg) => arg.startsWith('--demo-scenario='))
    ?.slice('--demo-scenario='.length);
  if (asked === undefined) return DEFAULT_DEMO_SCRIPT;
  if (asked in demoScripts) return asked as DemoScriptName;
  const listing = Object.entries(demoScripts)
    .map(([name, script]) => `  ${name.padEnd(20)}${script.summary}`)
    .join('\n');
  if (asked !== '?' && asked !== '') process.stderr.write(`no demo scenario '${asked}'\n`);
  process.stderr.write(`demo scenarios:\n${listing}\n`);
  process.exit(asked === '?' || asked === '' ? 0 : 1);
})();

/**
 * How long after the window loads the autoplay prompt is sent. Seven hundred milliseconds is
 * right on a warm machine and wrong on a cold one: a renderer that paints after the turn has
 * already ended misses the whole stream, and the snapshot behind it restores only what was
 * persisted — no activity feed, no system lines. Raise it and a screenshot sees the live run.
 */
const autoplayDelayMs = Number(
  process.argv.find((arg) => arg.startsWith('--autoplay-at='))?.slice('--autoplay-at='.length) ??
    700,
);

/**
 * `--live-<runtime>=<dir>` is a shortcut through the product path rather than beside it: it
 * creates a real team for `<dir>` in the real database, with a two-agent roster it still
 * hardcodes, and starts it exactly as the creation flow would.
 *
 * Three of them now, and the third is the point of the whole architecture: `--live-mixed` puts
 * a Claude agent and a Codex agent on one team, where the orchestrator cannot tell them apart
 * and the mailbox has to carry a message from one vendor's process to another's.
 */
const LIVE_ROSTERS: Readonly<Record<string, readonly [string, string]>> = {
  '--live-claude=': ['claude-code', 'claude-code'],
  '--live-codex=': ['codex', 'codex'],
  '--live-mixed=': ['claude-code', 'codex'],
};

const liveLaunch = Object.entries(LIVE_ROSTERS).flatMap(([flag, runtimes]) => {
  const path = process.argv.find((arg) => arg.startsWith(flag))?.slice(flag.length);
  return path === undefined ? [] : [{ path, runtimes }];
})[0];

let opened: OpenedDatabase | undefined;
let store: SqliteStore | undefined;
let window: BrowserWindow | undefined;
/** `--demo` only: the scripted team, which lives outside the pool because it has no peers. */
let demo: RunningTeam | undefined;
/**
 * Why the team this launch tried to open did not open. Kept because the empty state is the
 * only screen a failed launch can land on, and "create your first team" is a lie to someone
 * who has three.
 */
let openError: string | undefined;

/**
 * How many teams stay loaded. Three is the smallest number that makes the common shape — a
 * team you are working in, one you are waiting on, one you keep glancing at — cost nothing to
 * move between. Every extra live team is a bridge process per agent, so this is a real cost
 * and not a free cache.
 */
const LIVE_TEAM_LIMIT = 3;

/** Outstanding permission requests, so an answer can find the team that is blocked on it. */
const permissions = new Map<string, { teamId: string; orchestrator: RunningTeam['orchestrator'] }>();

/** A pending request in the words the transcript uses. The option ids never leave the main
 *  process: the renderer answers `allow` or `reject`, which is all ticket 14 offers. */
function asUiPermission(pending: PendingPermission): UiPermissionRequest {
  return {
    id: pending.id,
    agentId: pending.agentId,
    toolCallId: pending.toolCallId,
    title: pending.title,
    canAllow: choicesOf(pending).allowOptionId !== undefined,
    canAllowAlways: choicesOf(pending).allowAlwaysOptionId !== undefined,
  };
}

/**
 * One detected runtime as the picker draws it, remedies included.
 *
 * The remedies are computed here rather than stored with the detection, because they are a
 * fact about *this* platform and this binary at this moment: the same `needs sign-in` offers a
 * login where the binary was found and nothing at all where it was not.
 */
function asUiRuntime(detection: RuntimeDetection): UiRuntimeChoice {
  return {
    runtimeId: detection.runtimeId,
    label: detection.label,
    readiness: detection.readiness,
    supported: detection.supported,
    detail: detection.detail,
    ...(detection.version === undefined ? {} : { version: detection.version }),
    remedies: remediesFor(detection).map((remedy) => ({
      kind: remedy.kind,
      shown: remedy.shown,
      note: remedy.note,
    })),
  };
}

/**
 * What the pane asked to run, or nothing if it did not arrive in a shape blobot understands.
 *
 * The renderer is trusted with *which* remedy, never with the command: `kind` is checked against
 * the two words core will answer to, and everything else is looked up on this side. It is also
 * the one place a version skew between the window and the preload bridge under it can be
 * recognised rather than misread as a question about a runtime nobody asked about.
 */
function asStepRequest(
  request: unknown,
): { stepId: string; runtimeId: string; kind: RemedyKind } | undefined {
  if (typeof request !== 'object' || request === null) return undefined;
  const { stepId, runtimeId, kind } = request as Record<string, unknown>;
  if (typeof stepId !== 'string' || stepId === '') return undefined;
  if (typeof runtimeId !== 'string' || runtimeId === '') return undefined;
  if (kind !== 'sign_in' && kind !== 'install') return undefined;
  return { stepId, runtimeId, kind };
}

/**
 * The live teams. Selecting one promotes it rather than restarting it, which is why switching
 * no longer costs a workspace reconcile, a process per agent and a transcript replay.
 */
/**
 * Routines: the timer, the window check and the calling, which are main's three (issue 09).
 *
 * Created with the database, because a Routine is a row like everything else, and never in demo
 * mode: the scripted team's database is thrown away, so a Routine there would be a schedule
 * nobody could keep. Only ever started once a window exists.
 */
let routines: RoutineRunner | undefined;

const pool = new TeamPool<RunningTeam>({
  limit: LIVE_TEAM_LIMIT,
  start: async (team) => {
    if (store === undefined || opened === undefined) throw new Error('No database is open.');
    const live = await startTeam({
      team,
      store,
      db: opened.db,
      clock,
      // Each agent reports itself up, and the rail redraws that one row. A cold start is a
      // workspace reconcile and a process per agent, and reporting only at the end would make
      // a four-agent team look frozen for as long as its slowest member takes.
      onAgentReady: (agentId) => {
        if (opening?.team.id !== team.id) return;
        opening.ready.add(agentId);
        send('blobot:team');
      },
    });
    attach(live);
    return live;
  },
  isWorking,
  onEvict: (live, reason) => {
    if (reason === 'over_limit') {
      process.stderr.write(`[teams] ${live.team.name} stopped: ${LIVE_TEAM_LIMIT} teams stay live\n`);
    }
  },
});

/**
 * The team the user is waiting for, while it is being started.
 *
 * `current()` still answers with the team that was on screen, which is correct — that one is
 * still running and still the one whose transcript is drawn. But it is not what the user just
 * clicked, and for the seconds a cold start takes it was the only thing the renderer could see.
 * This is the other half: who they are waiting for, and which of that team's agents are up.
 */
let opening: { readonly team: Team; readonly ready: Set<string> } | undefined;

/**
 * The launch team's start, for the two things that have to wait for it: `--screenshot`'s
 * autoplay, and nothing else. Resolved when there is no team to open.
 */
let firstStart: Promise<void> = Promise.resolve();

/** The team on screen. Everything the renderer asks about is about this one. */
function current(): RunningTeam | undefined {
  return demo ?? pool.active;
}

/**
 * The size of the tools blobot adds, measured rather than typed: these definitions are on the
 * wire to every agent on every turn. What an agent's *other* tools cost is not knowable here,
 * because a tool list is not advertised to the client the way a command list is.
 *
 * Two of them now — `message_agent` and issue 05's `propose_routine` — which is exactly why this
 * is measured: the number moved when the second tool was added, and nobody had to remember to
 * change it.
 */
const OWN_TOOL_CHARS =
  JSON.stringify(MESSAGE_AGENT_TOOL).length + JSON.stringify(PROPOSE_ROUTINE_TOOL).length;

function teamSummaries(): UiTeamSummary[] {
  if (store === undefined) return [];
  return store.listTeams().map((team) => {
    const lastActiveAt = store?.lastActiveAt(team.id);
    const lead = (store?.agentsOfTeam(team.id) ?? []).find(
      (agent) => agent.id === team.leadAgentId,
    );
    return {
      id: team.id,
      name: team.name,
      workspacePath: team.workspacePath,
      workspaceKind: team.workspaceKind,
      ...(team.icon === undefined ? {} : { icon: team.icon }),
      // The members rather than a count of them: the rail draws every team as its faces, and
      // a face is seeded by the agent's name. Same query the count came from.
      members: (store?.agentsOfTeam(team.id) ?? []).map((agent) => ({
        id: agent.id,
        name: agent.name,
        ...(agent.profileId === undefined ? {} : { profileId: agent.profileId }),
        ...(agent.hue === undefined ? {} : { hue: agent.hue }),
      })),
      // The lead as a *profile* id, because the roster dialog is a set of ticks on profiles and
      // this is the tick it has to draw marked. Absent on a team formed before there were
      // leads, and on one whose lead has left.
      ...(lead?.profileId === undefined ? {} : { leadProfileId: lead.profileId }),
      ...(lastActiveAt === undefined ? {} : { lastActiveAt }),
    };
  });
}

/**
 * Every live agent's status, across every team the pool is holding.
 *
 * Not just the team on screen. Three teams run at once, and a backgrounded one can be working,
 * or stuck at `waiting` on a permission block nobody has been shown. The rail is the only
 * surface that can say so, and this is what it says it from.
 *
 * A team the pool is not holding simply has no entries here. That is not a claim that it was
 * stopped: which three teams happen to be loaded is a fact about a process pool, not something
 * the user chose, and an unloaded team has nothing in flight either way.
 */
function liveStatuses(): Record<string, AgentStatus> {
  const statuses: Record<string, AgentStatus> = {};
  for (const live of demo === undefined ? pool.live : [demo]) {
    for (const agent of live.agents) statuses[agent.id] = live.orchestrator.statusOf(agent.id);
  }
  return statuses;
}

/** Every hired agent, and which teams it is on — a membership query, never a stored count. */
function agentProfiles(): UiAgentProfile[] {
  if (store === undefined) return [];
  const teamNames = new Map(store.listTeams().map((team) => [team.id, team.name]));
  return store.listProfiles().map((profile) => ({
    id: profile.id,
    name: profile.name,
    role: profile.role,
    runtimeId: profile.runtimeId,
    runtimeLabel: runtimeLabel(profile.runtimeId),
    ...(profile.instructions === undefined ? {} : { instructions: profile.instructions }),
    ...(profile.hue === undefined ? {} : { hue: profile.hue }),
    ...(profile.runtimeOptions === undefined ? {} : { runtimeOptions: profile.runtimeOptions }),
    ...(profile.trust === undefined ? {} : { trust: profile.trust }),
    ...(profile.compaction === undefined ? {} : { compaction: profile.compaction }),
    teams: store
      ? store
          .membershipsOf(profile.id)
          .map((agent) => teamNames.get(agent.teamId) ?? '')
          .filter((name) => name !== '')
      : [],
  }));
}

/**
 * What the renderer gets while a team is being started.
 *
 * Read from the database, because that is where a team's roster has always lived: the names,
 * the roles, the hues and the runtimes are all known the instant the user clicks, and only the
 * processes are not. So the team appears immediately, wearing the faces it will have, and each
 * agent sits at `starting` until its runtime says otherwise.
 *
 * The transcript comes too. A team you are returning to had a conversation, and showing it
 * while the agents come up is more honest than an empty pane: those messages were really said.
 */
function openingSnapshot(pending: { readonly team: Team; readonly ready: Set<string> }): UiSnapshot {
  const { team, ready } = pending;
  const records = store?.agentsOfTeam(team.id) ?? [];
  return {
    team: {
      id: team.id,
      name: team.name,
      workspacePath: team.workspacePath,
      ...(team.icon === undefined ? {} : { icon: team.icon }),
      turnBudget: team.turnBudget,
      ...(team.leadAgentId === undefined ? {} : { leadAgentId: team.leadAgentId }),
    },
    teams: teamSummaries(),
    agents: records.map((record) => ({
      id: record.id,
      name: record.name,
      role: record.role,
      runtimeLabel: runtimeLabel(record.runtimeId),
      // The Workspace it will be cut from. Its own AgentWorkspace does not exist yet on a first
      // launch, and naming a path that has not been provisioned would be a claim, not a fact.
      workspacePath: team.workspacePath,
      ...(record.branch === undefined ? {} : { branch: record.branch }),
      ...(record.hue === undefined ? {} : { hue: record.hue }),
      // Nothing has advertised anything yet, so the paperclip is closed with the composer.
      accepts: { images: false, textFiles: false },
      ...ceiling(record.runtimeId, record.runtimeOptions),
    })),
    // The teams the pool is still holding keep reporting: one of them can be working while
    // this one starts, and the rail draws all of them.
    statuses: {
      ...liveStatuses(),
      ...Object.fromEntries(
        records.map((record) => [record.id, ready.has(record.id) ? 'idle' : 'starting']),
      ),
    },
    // Nothing has a session yet, so there is no menu to offer and no block to answer.
    commands: {},
    // The gauge is a persisted fact, so it is drawn while the team is still coming up: what
    // these agents were carrying when they were last awake is what they will resume with.
    usage: store?.lastUsageOfTeam(team.id) ?? {},
    log: store?.logOfTeam(team.id) ?? { running: [], tools: [], turns: [], compactions: [] },
    // Composed but not yet sent: the personas exist, and nothing has been woken.
    injection: Object.fromEntries(
      records.map((record) => [
        record.id,
        {
          personaChars: store?.lastPersonaOf(record.id)?.length ?? 0,
          instructionsChars: record.instructions?.length ?? 0,
          lastWakeChars: 0,
          lastWakeMessages: 0,
          queued: 0,
          // Nothing has been sent, which is zero rather than absent — and unlike every other
          // figure here, this one does not reset when the team comes back up: it counts what
          // is in a session's history, and a resumed session still holds it.
          attachmentCount: 0,
          attachmentBytes: 0,
          ownToolChars: OWN_TOOL_CHARS,
        },
      ]),
    ),
    ...transcript(store, team.id),
    permissions: [],
    turnsThisPrompt: 0,
    demoMode: false,
    opening: true,
  };
}

/**
 * The recent end of a team's transcript, for a snapshot.
 *
 * One call rather than two, because the window has to be *shared*: the pane merge-sorts the two
 * halves, so bounding them independently gives a reply whose question fell off the top. The
 * store owns that rule; this is only the shape the snapshot wants it in.
 */
function transcript(
  store: SqliteStore | undefined,
  teamId: string,
): Pick<UiSnapshot, 'messages' | 'answers' | 'moreAbove' | 'routineOrigins'> {
  if (store === undefined) return { messages: [], answers: [], moreAbove: false };
  const window = store.transcriptOfTeam(teamId);
  return {
    messages: window.messages,
    answers: window.answers,
    moreAbove: window.more,
    // Which Routine each firing in this window belongs to. Issue 07's disclosure needs a name,
    // and the row carries a link — so the name is looked up beside the window it is about.
    routineOrigins: routineOrigins(store, window.messages),
  };
}

/**
 * How far back the transcript window on screen reaches. The floor for the blocks above it, so a
 * Routine scheduled last month does not reappear at the top of a pane showing this afternoon.
 */
function oldestOf(store: SqliteStore, teamId: string): number {
  const window = store.transcriptOfTeam(teamId);
  const times = [...window.messages.map((one) => one.at), ...window.answers.map((one) => one.at)];
  return times.length === 0 ? 0 : Math.min(...times);
}

/**
 * Agents carrying a Routine run nobody has looked at. Issue 11's unread mark.
 *
 * Every agent on every team the user has, not just the one on screen: the mark folds onto the
 * team row the way `StatusWord` already folds, and a signal only visible once you are already on
 * the team answers nothing — which is the whole failure the ticket was written about.
 */
function unreadAgents(): string[] {
  if (store === undefined) return [];
  const everybody = store.listTeams().flatMap((team) => store?.agentsOfTeam(team.id) ?? []);
  const runs = store.unseenRoutineRuns(everybody.map((agent) => agent.id));
  return [...new Set(runs.map((run) => run.agentId))];
}

/**
 * What blobot knows about this model's usable context, for the agent it belongs to.
 *
 * Absent unless somebody measured that model, which is the ordinary case: the renderer falls
 * back conservatively and says so, rather than the snapshot inventing a number here. Spread
 * into the agent so an unmeasured model contributes no key at all.
 */
function ceiling(
  runtimeId: string | undefined,
  options: Readonly<Record<string, string>> | undefined,
): { contextCeiling?: number } {
  if (runtimeId === undefined) return {};
  const tokens = ceilingFor(runtimeId, options?.['model']);
  return tokens === undefined ? {} : { contextCeiling: tokens };
}

function snapshot(): UiSnapshot {
  if (opening !== undefined) return openingSnapshot(opening);
  const team = current();
  if (team === undefined) {
    return {
      teams: teamSummaries(),
      agents: [],
      statuses: {},
      commands: {},
      usage: {},
      log: { running: [], tools: [], turns: [], compactions: [] },
      injection: {},
      messages: [],
      answers: [],
      moreAbove: false,
      permissions: [],
      unread: unreadAgents(),
      turnsThisPrompt: 0,
      demoMode: false,
      ...(openError === undefined ? {} : { openError }),
    };
  }
  return {
    team: {
      id: team.team.id,
      name: team.team.name,
      workspacePath: team.team.workspacePath,
      ...(team.team.icon === undefined ? {} : { icon: team.team.icon }),
      turnBudget: team.team.turnBudget,
      ...(team.team.leadAgentId === undefined ? {} : { leadAgentId: team.team.leadAgentId }),
    },
    teams: team.demoMode
      ? [
          {
            id: team.team.id,
            name: team.team.name,
            workspacePath: team.team.workspacePath,
            workspaceKind: team.team.workspaceKind,
            members: team.agents.map((agent) => ({
              id: agent.id,
              name: agent.name,
              ...(agent.hue === undefined ? {} : { hue: agent.hue }),
            })),
          },
        ]
      : teamSummaries(),
    agents: team.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      runtimeLabel: team.runtimeLabels[agent.id] ?? 'unknown',
      workspacePath: agent.workspacePath,
      ...(agent.hue === undefined ? {} : { hue: agent.hue }),
      ...(team.branches[agent.id] === undefined ? {} : { branch: team.branches[agent.id] }),
      accepts: team.orchestrator.acceptsOf(agent.id),
      ...(team.contextCeilings[agent.id] === undefined
        ? {}
        : { contextCeiling: team.contextCeilings[agent.id] }),
    })),
    statuses: liveStatuses(),
    // Read fresh rather than remembered: a team that was evicted and resumed re-advertises,
    // and a menu kept across that would describe a session that no longer exists.
    commands: Object.fromEntries(
      team.agents.map((agent) => [agent.id, team.orchestrator.commandsOf(agent.id)]),
    ),
    usage: team.store.lastUsageOfTeam(team.team.id),
    log: team.store.logOfTeam(team.team.id),
    injection: Object.fromEntries(
      team.agents.map((agent) => [
        agent.id,
        {
          personaChars: team.store.lastPersonaOf(agent.id)?.length ?? 0,
          instructionsChars: agent.instructions?.length ?? 0,
          ...team.orchestrator.injectionOf(agent.id),
          ownToolChars: OWN_TOOL_CHARS,
        },
      ]),
    ),
    ...transcript(team.store, team.team.id),
    // A block the user has not answered survives a re-snapshot, because the turn behind it is
    // still standing there: a switch away and back must not lose the question.
    permissions: team.orchestrator.pendingPermissions.map(asUiPermission),
    // Issue 05's amendment, control two: a Routine an agent armed for itself opens in the
    // transcript, and it comes back with the transcript rather than living only as long as the
    // app happened to be watching. Bounded by the window, so the blocks arrive with their turns.
    scheduled: scheduledRoutines(
      team.store,
      team.agents.map((agent) => agent.id),
      oldestOf(team.store, team.team.id),
    ),
    unread: unreadAgents(),
    turnsThisPrompt: team.orchestrator.turnsThisPrompt,
    demoMode: team.demoMode,
  };
}

const send = (channel: string, ...args: unknown[]): void => {
  if (window !== undefined && !window.isDestroyed()) window.webContents.send(channel, ...args);
};

/**
 * Wire one running team's streams to the renderer. Once per team, when it starts — not on
 * every switch, because a team that is already live keeps the listeners it had.
 *
 * Every message leads with the team id. Several teams stream at once now, and a backgrounded
 * team's words drawn into the open transcript would be a worse bug than the restart this
 * replaced.
 */
function attach(team: RunningTeam): void {
  const teamId = team.team.id;
  const orchestrator = team.orchestrator;
  orchestrator.onEvent((event) => {
    send('blobot:event', teamId, event);
    send('blobot:turns', teamId, orchestrator.turnsThisPrompt);
    // A team kept past the limit only because it was mid-turn is collected once it is quiet.
    if (!isWorking(team)) void pool.evictIdle();
  });
  orchestrator.onStatusChange((agentId, status) => send('blobot:status', teamId, agentId, status));
  orchestrator.onCommandsChange((agentId, commands) =>
    send('blobot:commands', teamId, agentId, commands),
  );
  // Catch up on what was advertised before this ran. A team is attached *after* it starts, and
  // a session advertises its menu during startup — so the first advertisement, which is usually
  // the only one, lands with nobody listening. Worse, the adapter is right not to repeat
  // itself: an identical re-advertisement notifies nobody, so without this the event would
  // never come again and the composer would wait forever for a message already sent.
  for (const agent of team.agents) {
    const commands = orchestrator.commandsOf(agent.id);
    if (commands.length > 0) send('blobot:commands', teamId, agent.id, commands);
  }
  orchestrator.onPermissionRequested((pending) => {
    // The answer arrives by id from another process, so the team it belongs to is remembered
    // here rather than asked for: the renderer knows one team and must not be trusted with
    // routing an approval to a different one.
    permissions.set(pending.id, { teamId, orchestrator });
    send('blobot:permission', teamId, asUiPermission(pending));
  });
  orchestrator.onPermissionSettled((id, outcome) => {
    permissions.delete(id);
    send('blobot:permission-settled', teamId, id, outcome);
  });
  // The Routine that caused it travels with it, when one did. A briefing that lands at 09:00
  // while its pane is open would otherwise draw as the user speaking at 09:00, and the user was
  // asleep: the words are theirs and the moment is not, which is the one thing the bubble gets
  // wrong and the whole of what issue 07's `system` line is there to say.
  orchestrator.onMessage((message) =>
    send(
      'blobot:message',
      teamId,
      message,
      message.routineRunId === undefined
        ? undefined
        : team.store.routineNameOfRun(message.routineRunId),
    ),
  );
  orchestrator.onBudgetExhausted((exhausted) =>
    send('blobot:budget', teamId, exhausted.turnsUsed, exhausted.turnBudget),
  );
  // An agent put itself on a schedule, and it is already running. The user is told where it
  // happened rather than being left to find it on a screen they would have to go looking for:
  // an agent arming something silently is the version of this feature that must not exist.
  orchestrator.onRoutineScheduled((one) =>
    send('blobot:routine-scheduled', teamId, { ...one, armed: true }),
  );
  // A proposal is the one thing an agent can put in front of the user without saying anything,
  // so the screens that draw Routines are told rather than left to notice on the next open.
  orchestrator.onRoutinesChanged(() => send('blobot:team'));
  orchestrator.onSilentHandoff((observed) =>
    send('blobot:silent-handoff', teamId, observed.agentId, observed.named, observed.at),
  );
}

/**
 * Put this team on screen, starting it only if it is not already live.
 *
 * This used to stop the previous team, which made every switch a restart — a process per
 * agent, a workspace reconcile, and, before `session/load`, an agent who had forgotten the
 * conversation it was in the middle of. The pool keeps the last few, so going back to a team
 * you were just in costs nothing and loses nothing.
 */
async function switchTo(team: Team): Promise<TeamOpenResult> {
  if (store === undefined || opened === undefined) return { ok: false, error: 'No database is open.' };
  // Said before the work rather than after it. A team the pool already holds is promoted in the
  // same tick and the renderer never draws this; a cold start is seconds, and those seconds used
  // to be a click that did nothing.
  opening = { team, ready: new Set() };
  send('blobot:team');
  try {
    await pool.select(team);
    openError = undefined;
  } catch (error) {
    // A Workspace that has been moved or deleted is the ordinary case here, and it used to
    // reach nobody: the handler rejected, the terminal got a stack trace, and the user got a
    // team that would not open for no stated reason. Whatever was on screen stays on screen.
    opening = undefined;
    send('blobot:team');
    return { ok: false, error: describe(error) };
  }
  opening = undefined;
  send('blobot:team');
  return { ok: true };
}

async function createWindow(): Promise<void> {
  window = new BrowserWindow({
    width: 1360,
    height: 860,
    // Near-black, not #000: against true black the blobatar silhouettes read as cut out.
    backgroundColor: '#0a0a0b',
    title: 'blobot',
    webPreferences: {
      preload: join(here, '../preload/index.mjs'),
      sandbox: false,
    },
  });

  // Devtools, on the keys everybody already presses. They came free with Electron's default
  // menu strip and went when that strip did — the menu was four menus of things this app does
  // not do, and losing the inspector with it was not a decision anybody made. Bound on the
  // window's own input rather than as a global shortcut, so it is blobot's key while blobot has
  // focus and nobody else's while it does not. Not gated to a dev build: the packaged app is
  // what a bug is usually reported against.
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const asked =
      input.key === 'F12' ||
      (input.control && input.shift && input.key.toLowerCase() === 'i') ||
      (input.meta && input.alt && input.key.toLowerCase() === 'i');
    if (!asked) return;
    event.preventDefault();
    window?.webContents.toggleDevTools();
  });

  // Two review affordances, both of them "open on the surface a screenshot cannot click to".
  const pane = process.argv.find((arg) => arg.startsWith('--pane='))?.slice('--pane='.length);
  const screen = process.argv.find((arg) => arg.startsWith('--screen='))?.slice('--screen='.length);
  const parts = [
    ...(pane === undefined ? [] : [`pane=${pane}`]),
    ...(screen === undefined ? [] : [`screen=${screen}`]),
  ];
  const hash = parts.length === 0 ? undefined : parts.join('&');
  const devServer = process.env['ELECTRON_RENDERER_URL'];
  if (devServer !== undefined) {
    await window.loadURL(devServer + (hash === undefined ? '' : `#${hash}`));
  } else {
    await window.loadFile(join(here, '../renderer/index.html'), {
      ...(hash === undefined ? {} : { hash }),
    });
  }

  // Detection, started behind the window rather than in front of the first dialog. It costs a
  // second and a half of somebody else's processes, it is the same answer for the whole launch,
  // and every surface that hires, edits or picks a runtime waits on it. Nothing awaits this: if
  // a dialog opens first it joins the same promise.
  void knownRuntimes().catch(() => undefined);

  if (autoplay) {
    // `loadFile` already resolved, so a `did-finish-load` listener attached here never fires.
    // The wait is for the launch team, which now starts after this window rather than before it:
    // without it a `--live-claude` autoplay would prompt whatever was live, which is nothing.
    setTimeout(() => {
      void firstStart.then(async () => {
        const team = current();
        if (team === undefined) return;
        // `--attach=<path>` puts a file on the scripted prompt, so the chip and the bubble are
        // reviewable without a human at the screen — the same reason `--screenshot` exists.
        const picked =
          autoplayAttachment === undefined
            ? undefined
            : await attachmentFromPath(autoplayAttachment, Date.now());
        if (picked !== undefined && 'error' in picked) {
          console.error(picked.error);
          return;
        }
        const kept = picked === undefined ? undefined : team.orchestrator.store.putAttachment(picked.attachment);
        await team.orchestrator.promptFromUser(
          [team.agents[0]?.id ?? ''],
          team.autoplayPrompt,
          kept === undefined ? [] : [kept.id],
        );
      });
    }, autoplayDelayMs);
  }

  const screenshotDelay = Number(
    process.argv.find((arg) => arg.startsWith('--screenshot-at='))?.slice('--screenshot-at='.length) ??
      9_000,
  );
  if (screenshotPath !== undefined) {
    setTimeout(() => {
      void (async () => {
        const image = await window?.webContents.capturePage();
        if (image !== undefined) await writeFile(screenshotPath, image.toPNG());
        app.quit();
      })();
    }, screenshotDelay);
  }
}

void app.whenReady().then(async () => {
  // No native menubar. Every command blobot has is on the surface it belongs to, so the
  // default File/Edit/View/Window strip was four menus of things this app does not do,
  // drawn above a window whose own chrome is the interface.
  Menu.setApplicationMenu(null);

  // Dev-time path: core's migrations live in its package. Packaging will copy them next to
  // the bundle, and this is the line that changes when it does.
  const migrations = join(app.getAppPath(), '../../packages/core/migrations');
  /** The team to open once the window is up. Undefined on a first run, which has none. */
  let launchTeam: Team | undefined;

  if (demoMode) {
    // The one team whose database is thrown away, because it is the same scripted replay
    // every time and stacking it would only grow a transcript nobody reads twice.
    // The demo is one team and stays one team: it never reaches the pool, because there is
    // nothing to switch to and its database is thrown away.
    demo = await createDemoTeam(':memory:', migrations, demoScriptName);
    attach(demo);
  } else {
    // Everything else lives in one file under `userData`, which is what makes a team a thing
    // the user created rather than a thing this process happens to be holding.
    opened = openDatabase({ path: join(app.getPath('userData'), 'blobot.db'), migrationsFolder: migrations });
    // Beside the database, and for the same reason: what a runtime offers is worth knowing
    // before the CLI has been spawned, so the hire dialog draws its picker instead of waiting.
    rememberRuntimeOptionsIn(join(app.getPath('userData'), 'runtime-options.json'));
    store = new SqliteStore(opened.db);
    routines = new RoutineRunner({
      store,
      clock,
      host: {
        // Every platform, and the whole of issue 02's enforcement: with no window a firing has
        // nobody to raise a permission request to, and the tick settles nothing, so what it
        // slept through comes back as missed rather than as a run that happened in the dark.
        hasWindow: () => window !== undefined && !window.isDestroyed(),
        teamOfAgent: (agentId) => {
          const agent = store?.agentById(agentId);
          return agent === undefined ? undefined : store?.teamById(agent.teamId);
        },
        // Held rather than selected: a firing runs a team, it does not switch to it. The pool's
        // own rule protects the team the user is working in, because it never evicts one
        // mid-turn, and `startTeam` refuses by name when a runtime is not installed.
        open: async (team) => (await pool.hold(team)).orchestrator,
        finished: (team) => pool.letGo(team.id),
        onLog: (line) => process.stderr.write(`${line}\n`),
        // The rail draws what a team is doing, and a Routine is the one thing that starts work
        // with nobody at the keyboard.
        onChange: () => send('blobot:team'),
      },
    });
    launchTeam =
      liveLaunch === undefined
        ? store.listTeams()[0]
        : await liveTeam(liveLaunch.path, liveLaunch.runtimes);
  }

  ipcMain.handle('blobot:snapshot', () => snapshot());
  // Bounded like the snapshot and paged by time, never by offset: rows arrive while the reader
  // is reading, and an offset would slide a window that the transcript is still growing under.
  ipcMain.handle('blobot:earlier', (_event, teamId: string, before: number): UiEarlier | undefined => {
    const team = current();
    // The user can switch teams while this is in flight. A window that came back late and got
    // prepended to a different team's pane would be worse than no window at all.
    if (team === undefined || team.team.id !== teamId) return undefined;
    const window = team.store.transcriptOfTeam(teamId, { before });
    return {
      messages: window.messages,
      answers: window.answers,
      moreAbove: window.more,
      routineOrigins: routineOrigins(team.store, window.messages),
    };
  });
  ipcMain.handle(
    'blobot:prompt',
    async (
      _event,
      agentIds: readonly string[],
      text: string,
      attachmentIds: readonly string[] = [],
    ) => {
      // `current()` is still the team that was on screen while another one starts, so a message
      // sent now would reach the wrong team's agent. The composer is closed for the same reason;
      // this is the half that does not depend on the renderer having agreed.
      if (opening !== undefined) return;
      await current()?.orchestrator.promptFromUser(agentIds, text, attachmentIds);
    },
  );

  /**
   * Picking a file up. Three doors, one place that reads bytes, and the checks before the
   * renderer ever sees the file.
   *
   * The attachment is stored the moment it is accepted rather than at send, because the store is
   * where the id comes from and the id is all the composer carries. A draft that is abandoned
   * leaves a row nothing points at, which is the same shape as a message the user never sent
   * would be, and costs at most one file.
   */
  const keepAttachment = (picked: PickedUp): UiAttachment | UiAttachmentRefusal => {
    if ('error' in picked) return picked;
    // The running team's own store, which in demo mode is an in-memory one. There is nowhere
    // else an attachment could be kept that the orchestrator would find it.
    const keeper = current()?.orchestrator.store ?? store;
    if (keeper === undefined) return { error: 'blobot has nowhere to keep that yet.' };
    return keeper.putAttachment(picked.attachment);
  };

  ipcMain.handle('blobot:chooseAttachment', async () => {
    const chosen = await dialog.showOpenDialog(window as BrowserWindow, {
      properties: ['openFile'],
      // Named rather than `*`: what blobot can send is two kinds, and a picker that offers a
      // `.pdf` it will refuse a moment later is the trap the pickup-time check exists to avoid.
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
        { name: 'Text', extensions: ['txt', 'md', 'csv', 'json', 'log', 'ts', 'tsx', 'js', 'py'] },
      ],
    });
    const path = chosen.filePaths[0];
    if (chosen.canceled || path === undefined) return undefined;
    return keepAttachment(await attachmentFromPath(path, Date.now()));
  });

  ipcMain.handle('blobot:attachPath', async (_event, path: string) =>
    keepAttachment(await attachmentFromPath(path, Date.now())),
  );

  ipcMain.handle(
    'blobot:attachBytes',
    (_event, data: Uint8Array, mimeType: string, name?: string) =>
      keepAttachment(attachmentFromBytes(new Uint8Array(data), mimeType, Date.now(), name)),
  );

  ipcMain.handle('blobot:attachmentUrl', (_event, id: string) => {
    const found = (current()?.orchestrator.store ?? store)?.attachment(id);
    return found === undefined ? undefined : dataUrlOf(found);
  });
  ipcMain.handle('blobot:resume', () => current()?.orchestrator.resumeAfterBudget());

  ipcMain.handle('blobot:chooseWorkspace', async () => {
    // Attached to the window rather than free-floating, so the picker cannot end up behind
    // the app with the app looking unresponsive.
    const options = {
      title: 'Choose a Workspace',
      properties: ['openDirectory', 'createDirectory'] as const,
    };
    const result =
      window === undefined
        ? await dialog.showOpenDialog({ ...options, properties: [...options.properties] })
        : await dialog.showOpenDialog(window, { ...options, properties: [...options.properties] });
    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle('blobot:inspectWorkspace', (_event, path: string) => reportInspection(() => inspectWorkspace(path)));
  ipcMain.handle('blobot:initializeWorkspace', (_event, path: string) =>
    reportInspection(() => initializeWorkspace(path)),
  );
  ipcMain.handle('blobot:prepareWorkspace', (_event, name: string) =>
    reportInspection(() => prepareWorkspace(name)),
  );
  ipcMain.handle('blobot:suggestTeamIcon', (_event, path: string) => suggestTeamIcon(path));
  /**
   * An icon of the user's own.
   *
   * The filter is the raster-only rule at the one place a user could otherwise walk around it.
   * A file that gets past it and still will not decode is reported rather than swallowed: the
   * user picked that file deliberately, so silence would read as the picker having failed.
   */
  ipcMain.handle('blobot:chooseTeamIcon', async (): Promise<UiTeamIcon | { error: string } | undefined> => {
    const options = {
      title: 'Choose an icon',
      properties: ['openFile'] as const,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    };
    const result =
      window === undefined
        ? await dialog.showOpenDialog({ ...options, properties: [...options.properties] })
        : await dialog.showOpenDialog(window, { ...options, properties: [...options.properties] });
    const chosen = result.canceled ? undefined : result.filePaths[0];
    if (chosen === undefined) return undefined;
    const dataUrl = encodeTeamIcon(chosen);
    return dataUrl === undefined
      ? { error: 'That file could not be read as an image.' }
      : { dataUrl, from: basename(chosen) };
  });
  /**
   * An icon on a team that already exists. It restarts nothing: the mark is drawn by the rail
   * out of the snapshot, so writing the row and pushing a snapshot is the whole change.
   */
  ipcMain.handle('blobot:setTeamIcon', (_event, teamId: string, icon: string | undefined) => {
    store?.setTeamIcon(teamId, icon);
    send('blobot:team');
  });
  ipcMain.handle('blobot:detectRuntimes', async (): Promise<UiRuntimeChoice[]> => {
    // The one caller that asks the machine again, because it is the one drawing the answer:
    // installing a CLI and coming back is when readiness changes. Everything else reuses this.
    const detections = await refreshKnownRuntimes();
    return detections.map(asUiRuntime);
  });
  /**
   * Run the runtime's own login, or its vendor's own installer, on a terminal.
   *
   * The renderer sends three ids and no command: which pane is asking, and what for. The argv is looked up here from core's table
   * against detection as it stands right now, which is also what keeps a stale renderer from
   * asking to sign in to something that is no longer installed.
   */
  ipcMain.handle(
    'blobot:startRuntimeStep',
    async (_event, request: unknown): Promise<{ ok: boolean; error?: string }> => {
      // One object rather than three positional strings, and checked before it is used. Three
      // strings in a row are a shape a *stale bridge* can still satisfy: a preload from before
      // `stepId` existed sent (runtimeId, kind), which arrived here as a step id of `opencode`
      // and a runtime id of `sign_in`, and the honest-looking answer was "blobot does not know
      // that runtime". A preload only reloads when the app restarts, so this is reachable
      // whenever the window is newer than the bridge under it.
      const ask = asStepRequest(request);
      if (ask === undefined) {
        return {
          ok: false,
          error:
            'blobot could not read that request. The window is running a newer version than the ' +
            'app under it, so quitting blobot and starting it again will fix this.',
        };
      }
      const { stepId, runtimeId, kind } = ask;
      const detection = await knownRuntime(runtimeId);
      if (detection === undefined) {
        return { ok: false, error: `blobot does not know a runtime called ${runtimeId}.` };
      }
      const remedy = remedyFor(detection, kind);
      if (remedy === undefined) {
        return { ok: false, error: `There is nothing blobot can run for ${detection.label} here.` };
      }
      startStep(stepId, remedy, {
        onData: (data) => send('blobot:runtime-step-data', stepId, data),
        onExit: (exitCode) => {
          void (async (): Promise<void> => {
            // Asked again rather than assumed. An installer can exit 0 having put the binary
            // somewhere nothing finds, and a login can be abandoned in the browser with the
            // command still exiting cleanly: the exit code says the command ended, and only
            // detection says what the machine holds now.
            const after = (await refreshKnownRuntimes()).find(
              (entry) => entry.runtimeId === runtimeId,
            );
            const outcome: RuntimeStepOutcome = {
              stepId,
              runtimeId,
              kind,
              exitCode,
              ...(after === undefined ? {} : { runtime: asUiRuntime(after) }),
            };
            send('blobot:runtime-step-exit', outcome);
          })();
        },
      });
      return { ok: true };
    },
  );
  /**
   * A link the user clicked in the terminal, opened in their own browser.
   *
   * **Only `http` and `https`.** The text came out of another program's stdout, and handing an
   * arbitrary scheme to the OS is handing that program a way to launch things: `file:` opens a
   * folder, and on some desktops a registered scheme opens an application with an argument.
   * A login printing a URL to visit is the whole of the need here.
   */
  ipcMain.handle('blobot:openLink', (_event, url: unknown) => {
    if (typeof url !== 'string') return;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
    void shell.openExternal(parsed.toString());
  });
  ipcMain.handle('blobot:runtimeStepInput', (_event, stepId: string, data: string) => {
    writeStep(stepId, data);
  });
  ipcMain.handle(
    'blobot:runtimeStepResize',
    (_event, stepId: string, cols: number, rows: number) => {
      resizeStep(stepId, cols, rows);
    },
  );
  // Named, so a pane whose cleanup lands after another pane has started its own kills nothing.
  ipcMain.handle('blobot:closeRuntimeStep', (_event, stepId: string) => {
    stopStep(stepId);
  });
  ipcMain.handle('blobot:listAgents', (): UiAgentProfile[] => agentProfiles());
  /**
   * Ask a runtime what it lets an agent be set to.
   *
   * It starts the runtime, so it is slow by the standards of an IPC call and instant by the
   * standards of the thing it replaces, which was nothing. The executable comes from detection
   * for the same reason it does when hiring: ticket 07 pins the user's own binary.
   */
  ipcMain.handle(
    'blobot:describeRuntimeOptions',
    async (_event, runtimeId: string): Promise<UiRuntimeOptions> => {
      const detection = await knownRuntime(runtimeId);
      // The version is a cache key, not decoration: an upgraded binary is when a model list
      // moves, and it is the one thing that makes a remembered answer worth throwing away.
      const probe = await describeRuntimeOptions(
        runtimeId,
        detection?.executablePath,
        detection?.version,
      );
      return {
        runtimeId,
        groups: probe.groups.map((group) => ({
          id: group.id,
          label: group.label,
          choices: group.choices.map((choice) => ({
            value: choice.value,
            label: choice.label,
            ...(choice.isDefault === true ? { isDefault: true } : {}),
          })),
        })),
        ...(probe.error === undefined ? {} : { error: probe.error }),
      };
    },
  );
  ipcMain.handle('blobot:hireAgent', async (_event, spec: NewAgentSpec): Promise<HireResult> => {
    if (store === undefined) return { ok: false, error: 'No database is open.' };
    try {
      // The executable is resolved here rather than in the renderer: ticket 07 pins the
      // user's own binary, and that resolution is detection's job, not the UI's.
      const executablePath = (await knownRuntime(spec.runtimeId))?.executablePath;
      const profile = hireAgent(
        { ...spec, ...(executablePath === undefined ? {} : { executablePath }) },
        { store, clock },
      );
      return { ok: true, profileId: profile.id };
    } catch (error) {
      return { ok: false, error: describe(error) };
    }
  });
  /**
   * Restate an agent's definition.
   *
   * No team is stopped and none is restarted, which is the difference between this and editing
   * a roster. A roster change makes a live team disagree with itself: a persona names the
   * roster and the mailbox resolves recipients out of it. A definition change does not. What
   * it changes is what the *next* persona says, and the agents on screen are mid-conversation
   * under the one they were started with. ADR-0002.
   */
  ipcMain.handle(
    'blobot:editAgent',
    async (_event, profileId: string, spec: NewAgentSpec): Promise<EditAgentResult> => {
      if (store === undefined) return { ok: false, error: 'No database is open.' };
      try {
        // Resolved here for the same reason hiring resolves it here: pinning the user's own
        // binary is detection's job, and a changed runtime means a different binary.
        const executablePath = (await knownRuntime(spec.runtimeId))?.executablePath;
        const edit = editAgentProfile(
          profileId,
          { ...spec, ...(executablePath === undefined ? {} : { executablePath }) },
          { store, clock },
        );
        return {
          ok: true,
          restated: edit.restated,
          keepingName: edit.keepingName,
          ...(edit.formerName === undefined ? {} : { formerName: edit.formerName }),
          runtimeChanged: edit.runtimeChanged,
        };
      } catch (error) {
        return { ok: false, error: describe(error) };
      }
    },
  );
  ipcMain.handle('blobot:retireAgent', (_event, profileId: string) => {
    store?.tombstoneProfile(profileId, clock.now());
  });
  // ---------------------------------------------------------------- Routines
  //
  // Issue 06's screen, and the two verbs that are not on it. Everything here goes through the
  // store and the runner: the renderer holds no database handle, and `Run now` is the only way a
  // person starts a firing, which is what keeps the tick the single thing that starts work
  // nobody asked for at that second.
  ipcMain.handle('blobot:listRoutines', (): readonly UiRoutine[] =>
    store === undefined ? [] : routineRows(store, clock.now()),
  );
  ipcMain.handle('blobot:routineTargets', (): readonly UiRoutineTarget[] =>
    store === undefined ? [] : routineTargets(store),
  );
  ipcMain.handle(
    'blobot:saveRoutine',
    (_event, spec: NewRoutineSpec, routineId?: string): RoutineSaveResult => {
      if (store === undefined) return { ok: false, error: 'No database is open.' };
      const name = spec.name.trim();
      const prompt = spec.prompt.trim();
      if (name === '') return { ok: false, error: 'Give it a name.' };
      if (prompt === '') return { ok: false, error: 'Say what it should do.' };
      const now = clock.now();
      if (routineId !== undefined) {
        // A restatement, not a patch, exactly as editing an agent is. The agent it belongs to is
        // not among the fields: a Routine is `<team>/<agent>`, and moving one to somebody else
        // would be a new Routine wearing an old one's run history.
        if (store.routineById(routineId) === undefined) {
          return { ok: false, error: 'That routine is gone.' };
        }
        store.updateRoutine(routineId, { name, prompt, schedule: spec.schedule });
        // Editing a proposal is answering it: the person read it and made it theirs.
        store.reviewRoutine(routineId, now);
        send('blobot:team');
        return { ok: true, id: routineId };
      }
      if (store.agentById(spec.agentId) === undefined) {
        return { ok: false, error: 'That agent is no longer on a team.' };
      }
      // Disarmed, like every Routine at birth. Arming is its own act and its own control, and
      // that is true of the ones a person writes as well as the ones an agent proposes.
      const created = store.createRoutine({
        id: uuidv7(now),
        agentId: spec.agentId,
        name,
        prompt,
        schedule: spec.schedule,
        armed: false,
        createdAt: now,
      });
      send('blobot:team');
      return { ok: true, id: created.id };
    },
  );
  ipcMain.handle('blobot:setRoutineArmed', (_event, routineId: string, armed: boolean) => {
    store?.setRoutineArmed(routineId, armed);
    // A person answered it, whichever way they answered. Separate from the arming itself,
    // because the tick disarms a Routine that has failed three nights running and that is
    // blobot noticing rather than somebody deciding.
    store?.reviewRoutine(routineId, clock.now());
    send('blobot:team');
  });
  ipcMain.handle('blobot:deleteRoutine', (_event, routineId: string) => {
    // Discarding a proposal and deleting a Routine are the same act on the same row. The run
    // history outlives it, as every tombstone here does.
    store?.tombstoneRoutine(routineId, clock.now());
    send('blobot:team');
  });
  ipcMain.handle('blobot:runRoutineNow', (_event, routineId: string) => {
    if (routines === undefined) return { ok: false, error: 'Routines are not running.' };
    return routines.runNow(routineId);
  });
  ipcMain.handle('blobot:routineRuns', (_event, routineId: string): readonly UiRoutineRun[] =>
    store === undefined ? [] : store.routineRunsOf(routineId).map(toRunRow),
  );
  ipcMain.handle('blobot:seenRoutineRuns', (_event, agentId: string) => {
    store?.markRoutineRunsSeen(agentId, clock.now());
  });

  ipcMain.handle('blobot:createTeam', async (_event, spec: NewTeamSpec): Promise<TeamCreationResult> => {
    if (store === undefined) return { ok: false, error: 'No database is open.' };
    try {
      const team = await createTeam(spec, { store, clock });
      const launched = await switchTo(team);
      // The row exists either way, but a flow that says "created" while nothing opened is
      // worse than one that says what stopped it.
      if (!launched.ok) {
        return { ok: false, ...(launched.error === undefined ? {} : { error: launched.error }) };
      }
      return { ok: true, teamId: team.id };
    } catch (error) {
      return { ok: false, error: describe(error) };
    }
  });
  /**
   * Change who is on a team.
   *
   * The team is stopped first and started again afterwards, rather than edited underneath its
   * own orchestrator. A persona names the roster (ticket 06), the mailbox resolves recipients
   * out of it, and an agent who has just left still holds a session and a loopback token — so
   * a live team whose membership changed is a team disagreeing with itself. Restarting costs
   * nothing that matters now that `session/load` resumes each agent where it was.
   */
  ipcMain.handle(
    'blobot:editTeam',
    async (
      _event,
      teamId: string,
      profileIds: readonly string[],
      leadProfileId?: string,
    ): Promise<TeamDeletionResult> => {
      if (store === undefined) return { ok: false, error: 'No database is open.' };
      const wasLive = pool.find(teamId) !== undefined;
      await pool.release(teamId);
      try {
        const removals = await editTeamRoster(teamId, profileIds, { store, clock }, leadProfileId);
        return { ok: true, removals: removals.map(asUiRemoval) };
      } catch (error) {
        return { ok: false, error: describe(error) };
      } finally {
        // Whether the edit landed or was refused, a team that was running goes back to running:
        // the user changed a roster, they did not ask for their agents to be stopped.
        const team = store.teamById(teamId);
        if (wasLive && team !== undefined) {
          const restarted = await switchTo(team);
          if (!restarted.ok) openError = `${team.name} did not open. ${restarted.error ?? ''}`.trim();
        }
        send('blobot:team');
      }
    },
  );

  /**
   * Delete a team: its agents' workspaces, then the rows.
   *
   * Stopped before anything is removed — git will not take a worktree out from under a process
   * sitting in it — and the app lands on the most recent surviving team, or on the creation
   * flow when there is none, because a rail with a hole where the open team was is not a state
   * the user asked for.
   */
  /**
   * What a full clean would recover. Read while the dialog is open, because the number is what
   * makes the option answerable: nobody can decide about "delete the workspaces too" without it.
   */
  ipcMain.handle('blobot:teamDiskUsage', async (_event, teamId: string): Promise<UiTeamDiskUsage> => {
    if (store === undefined) return { bytes: 0, agents: [] };
    try {
      return await measureTeam(teamId, { store, clock });
    } catch {
      // A team blobot cannot measure is offered nothing rather than a wrong figure.
      return { bytes: 0, agents: [] };
    }
  });

  /**
   * What each agent's workspace is holding, and what GitHub knows about it.
   *
   * The git half is local and cheap and runs whenever the line is drawn. The forge half is a
   * subprocess and a network round trip, so it only runs when the renderer asks for it, which
   * it does on opening the line and on the user's refresh and never on a timer. A backgrounded
   * team never reaches GitHub.
   */
  ipcMain.handle(
    'blobot:workspaceStatus',
    async (_event, teamId: string, forge = false): Promise<readonly UiWorkspaceStatus[]> => {
      if (store === undefined) return [];
      const statuses = await readTeamWorkspaces(teamId, { store, clock }, { forge }).catch(() => []);
      return statuses.map((status) => ({
        agentId: status.agentId,
        agentName: status.agentName,
        kind: status.kind,
        ...(status.branch === undefined ? {} : { branch: status.branch }),
        present: status.present,
        ...(status.changed === undefined ? {} : { changed: status.changed }),
        ...(status.churn === undefined ? {} : { churn: status.churn }),
        ...(status.ahead === undefined ? {} : { ahead: status.ahead }),
        ...(status.pushed === undefined ? {} : { pushed: status.pushed }),
        ...(status.forge.asked
          ? status.forge.pr === undefined
            ? {}
            : { pr: status.forge.pr }
          : { unavailable: status.forge.detail }),
      }));
    },
  );

  /**
   * The branches an agent's worktree could be on, and the user moving it onto one.
   *
   * Local git only: the list is `for-each-ref` and the move is `git switch`, so neither reaches
   * the network and neither needs the forge. The switch is the only write among these workspace
   * handlers, and it is the user's: no runtime is told it happened, and no agent can reach it,
   * because `git switch` prompts at every trust level and is on no allowlist.
   */
  ipcMain.handle(
    'blobot:listBranches',
    async (_event, teamId: string, agentId: string): Promise<UiBranches> => {
      if (store === undefined) return { branches: [] };
      return readAgentBranches(teamId, agentId, { store, clock }).catch(() => ({ branches: [] }));
    },
  );

  ipcMain.handle(
    'blobot:switchBranch',
    async (
      _event,
      teamId: string,
      agentId: string,
      branch: string,
      options: { create?: boolean } = {},
    ): Promise<UiSwitchResult> => {
      if (store === undefined) return { ok: false, error: 'No database is open.' };
      return switchAgentBranch(teamId, agentId, branch, options, { store, clock }).catch(
        (error: unknown) => ({ ok: false as const, error: describe(error) }),
      );
    },
  );

  /**
   * Committing what is in an agent's workspace. The user's own git, twice over: the commands are
   * shown before they run, and nothing an agent does can reach this handler.
   */
  ipcMain.handle(
    'blobot:commitPlan',
    async (_event, teamId: string, agentId: string, message: string): Promise<readonly string[]> => {
      if (store === undefined) return [];
      return commitPlanFor(teamId, agentId, message, { store, clock });
    },
  );

  ipcMain.handle(
    'blobot:commitWork',
    async (_event, teamId: string, agentId: string, message: string): Promise<UiCommitResult> => {
      if (store === undefined) return { ok: false, error: 'No database is open.' };
      return commitAgentWork(teamId, agentId, message, { store, clock }).catch((error: unknown) => ({
        ok: false as const,
        error: describe(error),
      }));
    },
  );

  ipcMain.handle(
    'blobot:publishPlan',
    async (
      _event,
      teamId: string,
      agentId: string,
      options: { title?: string; draft?: boolean } = {},
    ): Promise<readonly string[]> => {
      if (store === undefined) return [];
      return publishPlanFor(teamId, agentId, { store, clock }, options).catch(() => []);
    },
  );

  /**
   * The user pushing an agent's branch and opening a pull request for it.
   *
   * Nothing about this is an agent's: it is not a tool, no runtime is told it happened, and the
   * result never enters a session. blobot carries no token either — `gh` is the user's own
   * login, spawned, exactly as the runtime remedies spawn `claude auth login`.
   */
  ipcMain.handle(
    'blobot:publishBranch',
    async (
      _event,
      teamId: string,
      agentId: string,
      options: { title?: string; body?: string; draft?: boolean } = {},
    ): Promise<UiPublishResult> => {
      if (store === undefined) return { ok: false, step: 'create', error: 'No database is open.' };
      return publishAgentBranch(teamId, agentId, { store, clock }, options).catch((error: unknown) => ({
        ok: false as const,
        step: 'create' as const,
        error: error instanceof Error ? error.message : String(error),
      }));
    },
  );

  ipcMain.handle('blobot:deleteTeam', async (_event, teamId: string, clean = false): Promise<TeamDeletionResult> => {
    if (store === undefined) return { ok: false, error: 'No database is open.' };
    const wasActive = pool.active?.team.id === teamId;
    await pool.release(teamId);
    try {
      const deletion = await deleteTeam(teamId, { store, clock }, { clean: clean === true });
      if (wasActive) {
        openError = undefined;
        const next = store.listTeams()[0];
        if (next !== undefined) {
          const opened = await switchTo(next);
          if (!opened.ok) openError = `${next.name} did not open. ${opened.error ?? ''}`.trim();
        }
      }
      return {
        ok: true,
        removals: deletion.removals.map(asUiRemoval),
        ...(deletion.freedBytes === undefined ? {} : { freedBytes: deletion.freedBytes }),
      };
    } catch (error) {
      return { ok: false, error: describe(error) };
    } finally {
      send('blobot:team');
    }
  });

  /**
   * The answer to one permission block. Three choices reach here as blobot's own words, and the
   * provider's option ids stay in this process: the renderer names an intent, not an option.
   */
  ipcMain.handle('blobot:answerPermission', (_event, requestId: string, choice: PermissionChoice) => {
    const waiting = permissions.get(requestId);
    const pending = waiting?.orchestrator.pendingPermissions.find((entry) => entry.id === requestId);
    if (waiting === undefined || pending === undefined) return;
    const choices = choicesOf(pending);
    const optionId =
      choice === 'allow'
        ? choices.allowOptionId
        : choice === 'allow_always'
          ? choices.allowAlwaysOptionId
          : choices.rejectOptionId;
    // `null` cancels rather than approves: a runtime that offers neither option must not have
    // one invented for it.
    waiting.orchestrator.answerPermission(requestId, optionId ?? null);
  });

  ipcMain.handle('blobot:selectTeam', async (_event, teamId: string): Promise<TeamOpenResult> => {
    const team = store?.teamById(teamId);
    if (team === undefined) return { ok: false, error: 'That team is no longer in the database.' };
    if (team.id === current()?.team.id) return { ok: true };
    return switchTo(team);
  });

  await createWindow();

  // After the window, and only after it: the tick's first question is whether there is one, and
  // starting it before there was would be asking a question whose answer is always no.
  routines?.start();

  // The launch team starts *after* the window, and is deliberately not awaited. It used to be
  // started before there was anything to draw on, so a cold start — a workspace reconcile and a
  // process per agent — was spent with no window at all: seconds of nothing on a local app that
  // has not so much as said hello. The rail comes up first and the team arrives into it, each
  // agent leaving `starting` as its runtime reports itself up.
  //
  // A launch that cannot open the newest team is still not a launch that fails: the window is
  // already there, on the rail, where the user can pick another one and read what went wrong.
  const team = launchTeam;
  if (team !== undefined) {
    firstStart = switchTo(team).then((first) => {
      if (first.ok) return;
      openError = `${team.name} did not open. ${first.error ?? ''}`.trim();
      process.stderr.write(`[teams] ${openError}\n`);
      // `switchTo` already said the team is no longer opening; this is the reason why, which
      // it does not know about.
      send('blobot:team');
    });
  }
});

/**
 * The `--live-*` roster: still hardcoded, now with a runtime per seat.
 *
 * The names carry the runtime on a mixed team (`Alice`, `Bob-codex`) because an agent is hired
 * once and joins many teams (ADR-0001), and a `Bob` who is Claude on one team cannot also be
 * Codex on another: the runtime is part of what an agent *is*, and an edit may not change it.
 */
async function liveTeam(
  workspacePath: string,
  runtimes: readonly [string, string],
): Promise<Team | undefined> {
  if (store === undefined) return undefined;
  const name = basename(workspacePath);
  const existing = store.teamByName(name);
  if (existing !== undefined) return existing;
  const seats = [
    { name: 'Alice', role: 'frontend', runtimeId: runtimes[0] },
    { name: 'Bob', role: 'backend', runtimeId: runtimes[1] },
  ];
  const profileIds: string[] = [];
  for (const seat of seats) {
    const detected = await knownRuntime(seat.runtimeId);
    const profileName = seat.runtimeId === 'claude-code' ? seat.name : `${seat.name}-codex`;
    // Hire them once. On a second directory they are the *same* agents joining a second team.
    const existingProfile = store.profileByName(profileName);
    if (existingProfile !== undefined) {
      profileIds.push(existingProfile.id);
      continue;
    }
    profileIds.push(
      hireAgent(
        {
          name: profileName,
          role: seat.role,
          runtimeId: seat.runtimeId,
          ...(detected?.executablePath === undefined
            ? {}
            : { executablePath: detected.executablePath }),
        },
        { store: store as SqliteStore, clock },
      ).id,
    );
  }
  return createTeam({ name, workspacePath, turnBudget: 6, profileIds }, { store, clock });
}

async function reportInspection(
  read: () => Promise<UiWorkspaceInspection>,
): Promise<UiWorkspaceInspection | { error: string }> {
  try {
    return await read();
  } catch (error) {
    return { error: describe(error) };
  }
}

/** A removal in the renderer's words. The same three outcomes, no provider anywhere. */
function asUiRemoval(removal: AgentRemoval): UiAgentRemoval {
  return {
    agentName: removal.agentName,
    work: removal.work,
    ...(removal.detail === undefined ? {} : { detail: removal.detail }),
  };
}

function describe(error: unknown): string {
  if (error instanceof TeamCreationError || error instanceof WorkspaceError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

app.on('window-all-closed', () => {
  // A login nobody is watching any more is a process holding a terminal open forever.
  stopStep();
  // And a tick with no window to fire into is the background daemon issue 02 refused.
  routines?.stop();
  void pool.closeAll();
  void demo?.close();
  opened?.close();
  if (process.platform !== 'darwin') app.quit();
});
