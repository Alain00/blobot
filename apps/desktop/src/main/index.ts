import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, session, shell } from 'electron';
import { registerSkillsIpc } from './skills-ipc.js';
import { ForgeMemory } from './forge-memory.js';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MESSAGE_AGENT_TOOL,
  DeepgramTranscriber,
  MistralTranscriber,
  MockTranscriber,
  OpenAiTranscriber,
  PROPOSE_ROUTINE_TOOL,
  SqliteStore,
  SystemClock,
  WorkspaceError,
  composeSpeechHint,
  openDatabase,
  remediesFor,
  remedyFor,
  speechScenarios,
  uuidv7,
  measuredReadiness,
  type AgentStatus,
  type SpeechScenarioName,
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
  createThread,
  threadOf,
  deleteTeam,
  measureTeam,
  publishAgentBranch,
  publishPlanFor,
  commitAgentWork,
  commitPlanFor,
  readAgentChanges,
  readAgentBranches,
  readAgentTree,
  readTeamWorkspaces,
  resolveInWorkspace,
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
import { asUiHandbookEntry, handbooksOf, handbookWrites } from './handbook-rows.js';
import { choicesOf } from './permission-choices.js';
import { runtimeLabel } from './runtime-labels.js';
import { PlanLimitReadings } from './plan-limits.js';
import { describeRuntimeOptions, rememberRuntimeOptionsIn } from './runtime-options.js';
import { knownRuntime, knownRuntimes, refreshKnownRuntimes } from './known-runtimes.js';
import { resizeStep, startStep, stopStep, writeStep } from './runtime-step.js';
import { isWorking, type RunningTeam } from './running-team.js';
import { TeamPool } from './team-pool.js';
import { DEFAULT_LIVE_TEAM_LIMIT, MachinePreferences } from './machine-preferences.js';
import { DesktopMachines } from './machines.js';
import { MachineInventory } from './machine-inventory.js';
import { EngineSetup } from './engine-setup.js';
import { MachineLogins, type MachineLoginAccess } from './machine-login.js';
import { DictationHost, TRYOUT_TEAM } from './dictation.js';
import { DictationSettingsHost } from './dictation-settings.js';
import { SpeechFiles, type SpeechTarget } from './speech-files.js';
import { SpeechKeys } from './speech-keys.js';
import { installWebPermissions, ownOriginsFor } from './web-permissions.js';
import { RoutineRunner } from './routine-runner.js';
import {
  routineOrigins,
  routineRows,
  routineTargets,
  scheduledRoutines,
  toRunRow,
} from './routine-rows.js';
import { CEILING_TABLES, localProtectionFor, trustLevelsFor } from './runtime-for.js';
import { ceilingIsSane, ceilingRows, resolveCeiling } from './context-ceilings.js';
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
  UiContextCeiling,
  UiDepartedAgent,
  UiRuntimeChoice,
  UiRuntimeOptions,
  UiDictationState,
  DictationPatch,
  RuntimeStepOutcome,
  TeamOpenResult,
  UiEarlier,
  UiSnapshot,
  UiTeamIcon,
  UiTeamDiskUsage,
  UiWorkspaceStatus,
  UiWorkspaceTree,
  UiBranches,
  UiCommitResult,
  UiCommitSelection,
  UiWorkspaceChanges,
  UiPublishResult,
  UiSwitchResult,
  UiRailAgent,
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
 * `--demo-speech=<name>` picks which of the mock Transcriber's scenarios a demo recording plays
 * (`.scratch/dictation/`, ticket 11): `rewrites` by default, `stalls`, `dies`. The microphone
 * is genuinely open in demo mode; only the words are scripted.
 */
const demoSpeechName: SpeechScenarioName = ((): SpeechScenarioName => {
  const asked = process.argv.find((arg) => arg.startsWith('--demo-speech='))?.slice('--demo-speech='.length);
  if (asked !== undefined && asked in speechScenarios) return asked as SpeechScenarioName;
  if (asked !== undefined) process.stderr.write(`no demo speech scenario '${asked}'\n`);
  return 'rewrites';
})();

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
 * Five of them now, and the mixed pairs are the point of the whole architecture: one puts a
 * Claude agent and a Codex agent on one team, the other a Claude agent and an fx agent, where
 * the orchestrator cannot tell them apart and the mailbox has to carry a message from one
 * vendor's process to another's. fx is the sharper of the two, because it is the runtime none
 * of the protocol's authors wrote.
 */
const LIVE_ROSTERS: Readonly<Record<string, readonly [string, string]>> = {
  '--live-claude=': ['claude-code', 'claude-code'],
  '--live-codex=': ['codex', 'codex'],
  '--live-fx=': ['fx', 'fx'],
  '--live-cursor=': ['cursor', 'cursor'],
  '--live-mixed=': ['claude-code', 'codex'],
  '--live-fx-mixed=': ['claude-code', 'fx'],
  '--live-cursor-mixed=': ['claude-code', 'cursor'],
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
 * How many teams stay loaded before the saved preference is read.
 *
 * It was three and it was final, which made a real cost invisible: a fourth team's agents were
 * stopped the moment a fifth was opened, so their Machines went out on the rail with nothing
 * saying why. Every extra live team is still a bridge process per agent — the cost is real —
 * but how many of them this computer can hold is the user's to say. `DEFAULT_LIVE_TEAM_LIMIT`
 * and Settings' Machines section.
 */
const LIVE_TEAM_LIMIT = DEFAULT_LIVE_TEAM_LIMIT;

/** Outstanding permission requests, so an answer can find the team that is blocked on it. */
const permissions = new Map<string, { teamId: string; orchestrator: RunningTeam['orchestrator'] }>();

/** A pending request in the words the transcript uses. Option ids stay in main; the renderer
 *  returns one of blobot's three choices and receives the selected option's explanation. */
function asUiPermission(pending: PendingPermission): UiPermissionRequest {
  const choices = choicesOf(pending);
  return {
    id: pending.id,
    agentId: pending.agentId,
    toolCallId: pending.toolCallId,
    title: pending.title,
    canAllow: choices.allowOptionId !== undefined,
    canAllowAlways: choices.allowAlwaysOptionId !== undefined,
    ...(choices.allowAlways === undefined ? {} : { allowAlways: choices.allowAlways }),
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
  const localProtection = localProtectionFor(detection.runtimeId);
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
    // Static per runtime, unlike the remedies above, and looked up in the one module allowed to
    // know what a `runtime_id` means. Three levels or four, and the renderer is not told why.
    trustLevels: trustLevelsFor(detection.runtimeId),
    ...(localProtection === undefined ? {} : { localProtection }),
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
let machinePreferences: MachinePreferences | undefined;
let machines: DesktopMachines | undefined;
let engineSetup: EngineSetup | undefined;
let machineLogins: MachineLogins | undefined;
let machineInventory: MachineInventory | undefined;
const startingTeams = new Map<string, RunningTeam>();

function agentAccess(teamId: string, agentId: string) {
  const live = pool.find(teamId) ?? startingTeams.get(teamId), record = store?.agentById(agentId);
  const machine = live?.machines?.get(agentId), execution = live?.executions?.get(agentId);
  if (live === undefined || record?.teamId !== teamId) {
    throw new Error('Open this agent’s team to manage its execution.');
  }
  return { record, machine, execution, failure: live.orchestrator.failureOf(agentId), retry: async () => {
    if (machine?.kind === 'local') await refreshKnownRuntimes();
    await live.orchestrator.retryAgent(agentId);
  },
    pendingMessages: () => live.orchestrator.mailbox(agentId).length };
}

function boxAccess(teamId: string, agentId: string): MachineLoginAccess {
  const access = agentAccess(teamId, agentId);
  if (access.machine?.runtimeAccess === undefined || access.execution === undefined) throw new Error('This agent does not have a sandbox runtime to sign in.');
  return { ...access, execution: access.execution, machine: access.machine as MachineLoginAccess['machine'] };
}

function machinesOf(teamId: string) {
  const team = store?.teamById(teamId);
  return team === undefined || machines === undefined || store === undefined ? undefined
    : machines.forTeam(store.agentsOfTeam(teamId), team);
}

const pool = new TeamPool<RunningTeam>({
  limit: LIVE_TEAM_LIMIT,
  start: async (team) => {
    if (store === undefined || opened === undefined) throw new Error('No database is open.');
    agentsUp.set(team.id, new Set());
    try {
      const live = await startTeam({
        team,
        store,
        db: opened.db,
        clock,
        onStarting: (starting) => {
          startingTeams.set(team.id, starting);
          if (closing !== undefined) for (const execution of starting.executions?.values() ?? []) void execution.stop().catch(() => {});
          send('blobot:team');
        },
        ...(machines === undefined ? {} : { createMachine: (record: import('@blobot/core').AgentRecord) => machines!.forAgent(record, team) }),
        acquireResources: async (record) => record.profileId && machines ? machines.skills.acquire(record.profileId) : async () => {},
        beforeRuntimeStart: async (machine, record) => {
          if (machine.runtimeAccess !== undefined) await machine.runtimeAccess.beforeStart();
          else if (machine.kind === 'local') {
            const detection = await knownRuntime(record.runtimeId);
            if (detection?.readiness === 'not_installed') throw new Error(`${record.name} needs ${detection.label} installed on this computer. Open Settings → Runtimes, then try again.`);
          }
        },
        ...(machinePreferences === undefined ? {} : { idleAfterMs: machinePreferences.idleAfterMs }),
        canSleep: () => !pool.isHeld(team.id),
        onMachinePowerChange: () => send('blobot:team'),
        // Each agent reports itself up, and the rail redraws that one row. A cold start is a
        // workspace reconcile and a process per agent, and reporting only at the end would make
        // a four-agent team look frozen for as long as its slowest member takes.
        // Counted whether or not the team is on screen: the user may leave while it starts and
        // come back before it is up.
        onAgentReady: (agentId) => {
          agentsUp.get(team.id)?.add(agentId);
          if (opening?.team.id === team.id) send('blobot:team');
        },
      });
      attach(live);
      return live;
    } catch (error) {
      agentsUp.delete(team.id);
      throw error;
    } finally { startingTeams.delete(team.id); }
  },
  isWorking,
  onEvict: (live, reason) => {
    agentsUp.delete(live.team.id);
    if (reason === 'over_limit') {
      process.stderr.write(`[teams] ${live.team.name} stopped: ${pool.limit} teams stay live\n`);
    }
  },
});

/**
 * The team the user is waiting for, while it is being started.
 *
 * `current()` still answers with the team that was on screen, which is correct — that one is
 * still running and still the one whose transcript is drawn. But it is not what the user just
 * clicked, and for the seconds a cold start takes it was the only thing the renderer could see.
 * This is the other half: who they are waiting for.
 *
 * Only the latest press owns it. A team the user moved away from keeps starting in the pool,
 * and its `switchTo` finishing must not clear the one they moved to. An object and not an id, so
 * a second press on the same team is told apart from the first.
 */
let opening: { readonly team: Team } | undefined;

/** Which of a starting team's agents are up, per team, so leaving and coming back loses nothing. */
const agentsUp = new Map<string, Set<string>>();

/**
 * The launch team's start, for the two things that have to wait for it: `--screenshot`'s
 * autoplay, and nothing else. Resolved when there is no team to open.
 */
let firstStart: Promise<void> = Promise.resolve();

/** The team on screen. Everything the renderer asks about is about this one. */
function current(): RunningTeam | undefined {
  return demo ?? pool.active;
}

/** The team the renderer is drawing: the one being opened, or else the one on screen. */
function shownTeamId(): string | undefined {
  return opening?.team.id ?? current()?.team.id;
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
    // Every live team's own reading, and never only the open one's. A backgrounded team is
    // still running — that is what the pool is for — so a dot drawn from the open roster alone
    // was going out on rows whose agents were awake.
    const live = pool.find(team.id);
    const starting = startingTeams.get(team.id);
    const powerOf = (agentId: string) => live?.powerOf?.(agentId) ?? starting?.powerOf?.(agentId);
    const said = store?.lastSaidIn(team.id);
    const lastActiveAt = said?.at ?? store?.lastActiveAt(team.id);
    const lead = (store?.agentsOfTeam(team.id) ?? []).find(
      (agent) => agent.id === team.leadAgentId,
    );
    return {
      id: team.id,
      name: team.name,
      workspacePath: team.workspacePath,
      workspaceKind: team.workspaceKind,
      ...(team.defaultMachine === undefined ? {} : { defaultMachine: team.defaultMachine }),
      ...(team.icon === undefined ? {} : { icon: team.icon }),
      // The members rather than a count of them: the rail draws every team as its faces, and
      // a face is seeded by the agent's name. Same query the count came from.
      members: (store?.agentsOfTeam(team.id) ?? []).map((agent) => {
        const power = powerOf(agent.id);
        return {
          id: agent.id,
          name: agent.name,
          ...(agent.profileId === undefined ? {} : { profileId: agent.profileId }),
          ...(agent.hue === undefined ? {} : { hue: agent.hue }),
          ...(agent.shape === undefined ? {} : { shape: agent.shape }),
          ...(power === undefined ? {} : { machinePower: power }),
        };
      }),
      // The lead as a *profile* id, because the roster dialog is a set of ticks on profiles and
      // this is the tick it has to draw marked. Absent on a team formed before there were
      // leads, and on one whose lead has left.
      ...(lead?.profileId === undefined ? {} : { leadProfileId: lead.profileId }),
      ...(lastActiveAt === undefined ? {} : { lastActiveAt }),
      ...(said === undefined ? {} : { lastLine: said.text.slice(0, RAIL_LINE_LIMIT) }),
      ...(team.threadFor === undefined ? {} : { threadFor: team.threadFor }),
    };
  });
}

/**
 * How much of the last thing said travels for a rail row. One line at rail width is well under
 * this; the bound is what stops a 4,000-character answer crossing IPC to be clipped by CSS.
 */
const RAIL_LINE_LIMIT = 200;

/**
 * Every hired agent, for the rail's second kind of row.
 *
 * `.scratch/rail/`. A row is the **person** and never the seat, so this is the profile list and
 * not a flattening of memberships: Alice on four teams is one row here, exactly as she is one
 * row on *your agents*. Their thread is looked up by the stored `thread_for` value, and is
 * absent until their first message makes one.
 */
function railAgents(): UiRailAgent[] {
  if (store === undefined) return [];
  const threads = new Map(
    store
      .listTeams()
      .filter((team) => team.threadFor !== undefined)
      .map((team) => [team.threadFor as string, team.id]),
  );
  return store.listProfiles().map((profile) => ({
    id: profile.id,
    name: profile.name,
    role: profile.role,
    ...(profile.hue === undefined ? {} : { hue: profile.hue }),
    ...(profile.shape === undefined ? {} : { shape: profile.shape }),
    hiredAt: profile.createdAt,
    ...(threads.get(profile.id) === undefined ? {} : { threadId: threads.get(profile.id) as string }),
  }));
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
  // Threads excluded: a thread's Team name is the agent's own, invented in the store and drawn
  // nowhere, so listing it here would read as *Alice is on a team called Alice*.
  const teamNames = new Map(
    store
      .listTeams()
      .filter((team) => team.threadFor === undefined)
      .map((team) => [team.id, team.name]),
  );
  const threads = new Map(
    (store.listTeams() ?? [])
      .filter((team) => team.threadFor !== undefined)
      .map((team) => [team.threadFor as string, team.id]),
  );
  return store.listProfiles().map((profile) => ({
    id: profile.id,
    name: profile.name,
    role: profile.role,
    runtimeId: profile.runtimeId,
    runtimeLabel: runtimeLabel(profile.runtimeId),
    ...(threads.get(profile.id) === undefined ? {} : { threadId: threads.get(profile.id) as string }),
    ...(profile.instructions === undefined ? {} : { instructions: profile.instructions }),
    ...(profile.hue === undefined ? {} : { hue: profile.hue }),
    ...(profile.shape === undefined ? {} : { shape: profile.shape }),
    ...(profile.runtimeOptions === undefined ? {} : { runtimeOptions: profile.runtimeOptions }),
    ...(profile.trust === undefined ? {} : { trust: profile.trust }),
    ...(profile.compaction === undefined ? {} : { compaction: profile.compaction }),
    ...(profile.verbosity === undefined ? {} : { verbosity: profile.verbosity }),
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
function openingSnapshot(team: Team): UiSnapshot {
  const ready = agentsUp.get(team.id) ?? new Set<string>();
  const records = store?.agentsOfTeam(team.id) ?? [];
  const starting = startingTeams.get(team.id);
  return {
    team: {
      id: team.id,
      name: team.name,
      workspacePath: team.workspacePath,
      ...(team.icon === undefined ? {} : { icon: team.icon }),
      ...(team.threadFor === undefined ? {} : { threadFor: team.threadFor }),
      turnBudget: team.turnBudget,
      ...(team.leadAgentId === undefined ? {} : { leadAgentId: team.leadAgentId }),
    },
    teams: teamSummaries(),
    // The rail's agent rows and their unread marks are store reads, like the roster and the
    // transcript below: a hired agent exists whether or not any team is coming up. Omitting
    // them emptied the rail of every agent for the length of a cold start.
    profiles: railAgents(),
    unread: unreadAgents(),
    departed: departedOf(store, team.id, records),
    agents: records.map((record) => ({
      id: record.id,
      name: record.name,
      role: record.role,
      ...(record.machine === undefined ? {} : { machine: record.machine }),
      machinePower: starting?.powerOf?.(record.id) ?? 'unknown',
      runtimeLabel: runtimeLabel(record.runtimeId),
      // The Workspace it will be cut from. Its own AgentWorkspace does not exist yet on a first
      // launch, and naming a path that has not been provisioned would be a claim, not a fact.
      workspacePath: team.workspacePath,
      ...(record.branch === undefined ? {} : { branch: record.branch }),
      ...(record.hue === undefined ? {} : { hue: record.hue }),
      ...(record.shape === undefined ? {} : { shape: record.shape }),
      // Nothing has advertised anything yet, so the paperclip is closed with the composer.
      accepts: { images: false, textFiles: false },
      ...ceiling(record.runtimeId, record.runtimeOptions),
    })),
    // The teams the pool is still holding keep reporting: one of them can be working while
    // this one starts, and the rail draws all of them.
    statuses: {
      ...liveStatuses(),
      ...Object.fromEntries(
        records.map((record) => [record.id, starting?.orchestrator.statusOf(record.id) ?? (ready.has(record.id) ? 'idle' : 'starting')]),
      ),
    },
    // Nothing has a session yet, so there is no menu to offer and no block to answer.
    commands: {},
    // The gauge is a persisted fact, so it is drawn while the team is still coming up: what
    // these agents were carrying when they were last awake is what they will resume with.
    usage: store?.lastUsageOfTeam(team.id) ?? {},
    log: store?.logOfTeam(team.id) ?? { running: [], tools: [], turns: [], compactions: [], pictures: [] },
    // Read while the processes are still coming up, like the roster and the transcript: a
    // Handbook is a persisted fact and nothing about it waits on a session.
    handbooks: store === undefined ? {} : handbooksOf(store, team.id, records),
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
    dictation: dictationState(),
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
 * Who wrote into this team's transcript and is no longer on it.
 *
 * `.scratch/team-addressing/issues/07`. An Agent taken off a team is tombstoned rather than
 * deleted, so its rows survive in the transcript with nothing on the live roster left to resolve
 * them -- and the renderer's every fallback was `?? item.agentId`, which put a database key in
 * the reading column under a hue derived from that key. The store already knew: the same
 * `includeDeleted` read is what `transcriptOfTeam` uses to decide which rows belong to the team
 * at all, so the name and the face were one flag away from every row they are owed to.
 *
 * The roster is subtracted rather than the deleted flag trusted, so this list and `agents`
 * cannot both claim the same person however the two reads are ordered.
 */
function departedOf(
  store: SqliteStore | undefined,
  teamId: string,
  roster: readonly { readonly id: string }[],
): readonly UiDepartedAgent[] {
  if (store === undefined) return [];
  const here = new Set(roster.map((agent) => agent.id));
  return store
    .agentsOfTeam(teamId, { includeDeleted: true })
    .filter((record) => !here.has(record.id))
    .map((record) => ({
      id: record.id,
      name: record.name,
      ...(record.hue === undefined ? {} : { hue: record.hue }),
      ...(record.shape === undefined ? {} : { shape: record.shape }),
    }));
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
 * The user's own figure if they set one on the settings screen, then whatever the adapter's
 * table knows, then absent — which is the ordinary case: the renderer falls back conservatively
 * and says so, rather than the snapshot inventing a number here. Spread into the agent so an
 * unmeasured model contributes no key at all.
 */
function ceiling(
  runtimeId: string | undefined,
  options: Readonly<Record<string, string>> | undefined,
): { contextCeiling?: number } {
  if (runtimeId === undefined || store === undefined) return {};
  const tokens = resolveCeiling(store.contextCeilings(), runtimeId, options?.['model']);
  return tokens === undefined ? {} : { contextCeiling: tokens };
}

/**
 * The settings screen's list: every model this installation can be asked about.
 *
 * Built from the roster rather than from a catalogue, so a row is about an agent the user
 * actually hired — plus the handful blobot ships an entry for, so a number it decided is visible
 * before it surprises anybody.
 */
function ceilingList(): readonly UiContextCeiling[] {
  if (store === undefined) return [];
  return ceilingRows(store.contextCeilings(), store.listProfiles(), CEILING_TABLES);
}

/**
 * Push the ceilings at every team that is up, so a change lands on the agents it is about.
 *
 * Recomputed from scratch for each agent rather than diffed against what moved: the resolution
 * order is two lines long, the rosters here are a handful of agents, and a diff would be a
 * second implementation of `resolveCeiling` that could disagree with the first.
 */
function applyCeilings(): void {
  if (store === undefined) return;
  const overrides = store.contextCeilings();
  for (const live of demo === undefined ? pool.live : [demo, ...pool.live]) {
    for (const record of store.agentsOfTeam(live.team.id)) {
      const tokens = resolveCeiling(overrides, record.runtimeId, record.runtimeOptions?.['model']);
      live.orchestrator.setContextCeiling(record.id, tokens);
      if (tokens === undefined) delete live.contextCeilings[record.id];
      else live.contextCeilings[record.id] = tokens;
    }
  }
}

function snapshot(): UiSnapshot {
  if (opening !== undefined) return openingSnapshot(opening.team);
  const team = current();
  if (team === undefined) {
    return {
      teams: teamSummaries(),
      profiles: railAgents(),
      agents: [],
      statuses: {},
      commands: {},
      usage: {},
      handbooks: {},
      log: { running: [], tools: [], turns: [], compactions: [], pictures: [] },
      injection: {},
      messages: [],
      answers: [],
      moreAbove: false,
      permissions: [],
      unread: unreadAgents(),
      turnsThisPrompt: 0,
      demoMode: false,
      dictation: dictationState(),
      ...(openError === undefined ? {} : { openError }),
    };
  }
  /**
   * Each agent's face as the *store* holds it, not as the running team was launched with it.
   *
   * An edit restates the face onto every membership the moment it is saved, and the rail draws
   * its rows straight out of those rows — so reading the open team's faces off the in-memory
   * Agent put the new face on the rail and the old one in the transcript beside it. One agent,
   * two faces, which is the failure the whole face rule exists to prevent, and this time inside
   * one window.
   *
   * The face is the one part of an edit with nothing to restart. A role and standing
   * instructions wait for the next start because they are composed into a persona and the
   * session in flight was composed from the old one; a hue is drawn, and there is no session
   * for it to disagree with.
   */
  const faces = new Map(
    team.store.agentsOfTeam(team.team.id).map((row) => [
      row.id,
      {
        ...(row.hue === undefined ? {} : { hue: row.hue }),
        ...(row.shape === undefined ? {} : { shape: row.shape }),
      },
    ]),
  );
  const faceOf = (agentId: string): { hue?: number; shape?: string } => faces.get(agentId) ?? {};

  return {
    team: {
      id: team.team.id,
      name: team.team.name,
      workspacePath: team.team.workspacePath,
      ...(team.team.icon === undefined ? {} : { icon: team.team.icon }),
      ...(team.team.threadFor === undefined ? {} : { threadFor: team.team.threadFor }),
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
              ...faceOf(agent.id),
            })),
          },
        ]
      : teamSummaries(),
    profiles: railAgents(),
    departed: departedOf(team.store, team.team.id, team.agents),
    agents: team.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      runtimeLabel: team.runtimeLabels[agent.id] ?? 'unknown',
      ...(team.powerOf === undefined ? {} : { machinePower: team.powerOf(agent.id) }),
      ...(agent.machine === undefined ? {} : { machine: agent.machine }),
      workspacePath: agent.workspacePath,
      ...faceOf(agent.id),
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
    handbooks: handbooksOf(team.store, team.team.id, team.agents),
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
    // The same restoration, for the same reason: a disclosure you could miss by having been on
    // another team when it happened would not be one.
    handbook: handbookWrites(team.store, team.team.id, oldestOf(team.store, team.team.id)),
    unread: unreadAgents(),
    turnsThisPrompt: team.orchestrator.turnsThisPrompt,
    demoMode: team.demoMode,
    dictation: dictationState(),
  };
}

const send = (channel: string, ...args: unknown[]): void => {
  if (window !== undefined && !window.isDestroyed()) window.webContents.send(channel, ...args);
};

let railPending: NodeJS.Immediate | undefined;
/**
 * Re-send the rail's rows once something has been said, on any team.
 *
 * Deferred, because the orchestrator publishes an event *before* its recorder writes it, and the
 * last line is read out of the store. Coalesced, because a fan-out commits several messages in
 * one tick and the rail needs reading once.
 */
function pushRail(): void {
  if (railPending !== undefined) return;
  railPending = setImmediate(() => {
    railPending = undefined;
    send('blobot:rail', teamSummaries(), railAgents());
  });
}

/** Every login's last Plan limit reading, app-wide, in memory. */
const planLimits = new PlanLimitReadings();

/**
 * What blobot downloaded for a local Transcriber: `~/.local/share/blobot/speech/`, beside the
 * worktrees and the handoffs, never userData and never a workspace (ticket 09).
 */
function speechRoot(): string {
  const xdg = process.env['XDG_DATA_HOME'];
  const base = xdg !== undefined && xdg.length > 0 ? xdg : join(homedir(), '.local', 'share');
  return join(base, 'blobot', 'speech');
}

const speechFiles = new SpeechFiles({
  root: speechRoot(),
  onChange: (target, state) => {
    dictationSettings.noteFile(target, state);
    send('dictation:file', target, state);
  },
});

/**
 * The one key, in the one file (ADR-0005). Beside `runtime-options.json`; `safeStorage` where
 * the OS can encrypt, plain and stated where it cannot. `rememberIn` is called once `userData`
 * is known, like the options cache.
 */
const speechKeys = new SpeechKeys({ file: join(app.getPath('userData'), 'dictation-keys.json'), crypto: safeStorage });

const dictationSettings = new DictationSettingsHost({
  // The demo team's own in-memory store when there is no database, so the section works in
  // `--demo` for a screenshot and forgets everything on quit, which is the demo's whole claim.
  store: () => store ?? demo?.store,
  files: speechFiles,
  keys: speechKeys,
  now: () => clock.now(),
  // The composer reads its word off the snapshot, so a change here is a snapshot push.
  onChange: () => send('blobot:team'),
  onStderr: (line) => process.stderr.write(`whisper: ${line}\n`),
  // The remote Transcriber for the chosen provider, with its key — the one place a key is
  // handed to anything, and it goes to that provider only (ADR-0005 clause 4).
  remoteFor: (provider, key) => {
    switch (provider.id) {
      case 'openai':
        return new OpenAiTranscriber({ key, locale: app.getLocale() });
      case 'deepgram':
        return new DeepgramTranscriber({ key });
      case 'mistral':
        return new MistralTranscriber({ key });
    }
  },
});

/**
 * Whether the composer draws a microphone (ticket 10). In demo mode it is `ready` with the mock
 * Transcriber behind it — real audio in, scripted text out — so the mic works without a model
 * or a key. Outside the demo it is the Settings row's answer: `off`, `unconfigured`, or `ready`
 * when the chosen Transcriber is actually there.
 */
function dictationState(): UiDictationState {
  return demoMode ? 'ready' : dictationSettings.state();
}

/**
 * The one recording. Main chooses the Transcriber and composes the hint; the renderer sends
 * bytes and draws events, and never learns which Transcriber it has.
 */
const dictation = new DictationHost({
  send,
  transcriberFor: () => {
    if (demoMode) return new MockTranscriber({ scenario: speechScenarios[demoSpeechName], clock });
    return dictationSettings.transcriberFor();
  },
  // Ticket 08's measured stage: the first sentence of *say something*, timed, kept against the
  // model it measured, and shown with the words it heard.
  onMeasured: ({ text, rtf }) => {
    dictationSettings.recordMeasurement(rtf);
    send('dictation:measured', { text, rtf, word: measuredReadiness(rtf) });
  },
  hintFor: (teamId) => {
    const team = current();
    if (team === undefined || team.team.id !== teamId) return { terms: [] };
    const spoken = team.store
      .transcriptOfTeam(teamId)
      .messages.filter((message) => message.fromAgentId === null)
      .map((message) => message.body);
    return composeSpeechHint(
      team.agents.map((agent) => agent.name),
      team.team.name,
      spoken,
    );
  },
});

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
    // The one stream that does not lead with a team id: a Plan limit is a login's, and every team
    // with an Agent on that login draws the same reading.
    if (event.type === 'plan_limits_updated' && planLimits.observe(team, event)) {
      send('blobot:planLimits', planLimits.all());
    }
    send('blobot:turns', teamId, orchestrator.turnsThisPrompt);
    if (event.type === 'agent_message_completed' && !team.demoMode) pushRail();
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
  orchestrator.onMessage((message) => {
    send(
      'blobot:message',
      teamId,
      message,
      message.routineRunId === undefined
        ? undefined
        : team.store.routineNameOfRun(message.routineRunId),
    );
    if (!team.demoMode) pushRail();
  });
  orchestrator.onBudgetExhausted((exhausted) =>
    send('blobot:budget', teamId, exhausted.turnsUsed, exhausted.turnBudget),
  );
  // An agent put itself on a schedule, and it is already running. The user is told where it
  // happened rather than being left to find it on a screen they would have to go looking for:
  // an agent arming something silently is the version of this feature that must not exist.
  orchestrator.onRoutineScheduled((one) =>
    send('blobot:routine-scheduled', teamId, { ...one, armed: true }),
  );
  // An agent wrote into its own persona. The same rule as the line above, for the same reason:
  // the write is allowed *because* it opens in the turn that made it. Recorded before it is
  // sent, so a switch away and back finds it there rather than only in a window that was open.
  orchestrator.onHandbookWrite((write) => {
    // `team.store`, not the module's: the demo team has a database of its own, and this block
    // is one a demo has to be able to show.
    const id = uuidv7(write.at);
    team.store.recordHandbookWrite(id, teamId, {
      kind: write.kind,
      agentId: write.agentId,
      at: write.at,
      ...(write.kind === 'recorded'
        ? {
            entryIds: write.entries.map((entry) => entry.id),
            withdrewIds: write.withdrew.map((entry) => entry.id),
          }
        : {}),
    });
    send('blobot:handbook-write', teamId, {
      id,
      agentId: write.agentId,
      at: write.at,
      kind: write.kind,
      entries: write.kind === 'recorded' ? write.entries.map(asUiHandbookEntry) : [],
      withdrew: write.kind === 'recorded' ? write.withdrew.map(asUiHandbookEntry) : [],
    });
  });
  // A proposal is the one thing an agent can put in front of the user without saying anything,
  // so the screens that draw Routines are told rather than left to notice on the next open.
  orchestrator.onRoutinesChanged(() => send('blobot:team'));
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
  //
  // The user may press something else before this one is up. The start keeps loading in the
  // pool, and this call stops owning the screen: it clears `opening` only while it is still its.
  const mine = opening?.team.id === team.id ? opening : { team };
  opening = mine;
  send('blobot:team');
  try {
    await pool.select(team);
    if (opening === mine) openError = undefined;
  } catch (error) {
    // A Workspace that has been moved or deleted is the ordinary case here, and it used to
    // reach nobody: the handler rejected, the terminal got a stack trace, and the user got a
    // team that would not open for no stated reason. Whatever was on screen stays on screen.
    if (opening === mine) opening = undefined;
    send('blobot:team');
    return { ok: false, error: describe(error) };
  }
  if (opening === mine) opening = undefined;
  send('blobot:team');
  return { ok: true };
}

async function createWindow(): Promise<void> {
  window = new BrowserWindow({
    width: 1360,
    height: 860,
    // Near-black, not #000: against true black the blobatar silhouettes read as cut out.
    backgroundColor: '#1a1c1e',
    title: 'blobot',
    webPreferences: {
      preload: join(here, '../preload/index.mjs'),
      sandbox: false,
    },
  });

  // Before anything can ask. Electron grants every permission to every origin when no handler
  // is installed, and blobot had none (ticket 04). The microphone is the one thing allowed, from
  // blobot's own renderer, while dictation is switched on; the camera and the rest are refused.
  installWebPermissions(
    session.defaultSession,
    ownOriginsFor(process.env['ELECTRON_RENDERER_URL']),
    () => dictationState() !== 'off',
  );

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
    // A screenshot run is exactly the context where nobody is present and something may be
    // capturing, so it is silent above the user's own switch. The only place the sound effort
    // touches main, and it reads a flag that already existed rather than adding one.
    ...(screenshotPath === undefined ? [] : ['silent=1']),
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
  machinePreferences = new MachinePreferences(join(app.getPath('userData'), 'machine-preferences.json'));
  machines = new DesktopMachines(join(app.getPath('userData'), 'machines'), undefined, () => send('blobot:machines'));
  const configuredMachines = () => (store?.listTeams() ?? []).flatMap((team) =>
      (store?.agentsOfTeam(team.id) ?? []).flatMap((agent) => agent.machine?.kind === 'box' ? [{
        teamId: team.id, agentId: agent.id, teamName: team.name, agentName: agent.name, limits: agent.machine.limits,
      }] : []));
  machineInventory = new MachineInventory(machines, configuredMachines, (agentId) =>
    [...startingTeams.values(), ...pool.live].some((live) => live.agents.some((agent) => agent.id === agentId)) ||
    (store?.listTeams() ?? []).some((team) => store?.agentsOfTeam(team.id).some((agent) => agent.id === agentId) === true));
  engineSetup = new EngineSetup(machines, { changed: () => send('blobot:machines'), openPackage: (path) => shell.openPath(path),
    sleepError: () => machinePreferences?.readError, configuredMachines, inventory: () => machineInventory!.view(),
  });
  machineLogins = new MachineLogins(boxAccess, () => send('blobot:machines'), (url) => shell.openExternal(url));
  await machinePreferences.load().catch(() => {
    process.stderr.write('[machines] Saved sleep settings could not be read; automatic sleep is disabled. The file was kept.\n');
  });
  // Before the first team is opened, so nothing is started under the wrong number.
  pool.limit = machinePreferences.liveTeamLimit;
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
    // The key file beside it (ADR-0005). A plain value on a machine that can now encrypt is
    // re-encrypted here, and never the reverse.
    speechKeys.migrate();
    store = new SqliteStore(opened.db);
    // Before anything reads. A call cannot outlive the runtime that owned it, and this is the
    // one moment that is knowable: nothing is attached yet, so every row still claiming to be
    // in flight was orphaned by however the last process ended.
    store.closeOrphanedCalls();
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
        // mid-turn. A missing local runtime fails that Agent by name while peers start.
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
  ipcMain.handle('blobot:planLimits', () => planLimits.all());
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

  // One Picture's bytes, asked for by the pane about to draw it. The snapshot carries the record
  // and never the picture: an agent decides how many Pictures a transcript has, so carrying them
  // would put every screenshot of the session through here on every team switch.
  ipcMain.handle('blobot:pictureUrl', (_event, id: string) => {
    // The one store, not the team's: the orchestrator holds a `MessageStore & AttachmentStore`
    // and pictures are deliberately not on it. Nothing an agent can reach knows this table
    // exists, which is `.scratch/agent-media/02`'s invariant and has a test named for it.
    const found = store?.picture(id);
    return found === undefined
      ? undefined
      : `data:${found.mimeType};base64,${Buffer.from(found.data).toString('base64')}`;
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
  ipcMain.handle('blobot:contextCeilings', (): readonly UiContextCeiling[] => ceilingList());
  /**
   * Set where a model stops being worth more context, or hand the question back to blobot.
   *
   * **It reaches the teams that are already up**, which is the difference between this and the
   * model or the trust level: those are `session/new` parameters and a running session was
   * opened without them, but a ceiling is a number blobot compares against after every turn. So
   * there is no restart to explain, and the screen does not have to promise one.
   *
   * The floor and the roof are not judgements about any model — they are the range in which a
   * token count is a token count at all. Outside it the row is left as it was.
   */
  ipcMain.handle(
    'blobot:setContextCeiling',
    (
      _event,
      runtimeId: string,
      model: string | undefined,
      tokens: number | undefined,
    ): readonly UiContextCeiling[] => {
      if (store === undefined) return [];
      if (tokens === undefined) store.clearContextCeiling(runtimeId, model);
      else if (ceilingIsSane(tokens)) store.setContextCeiling(runtimeId, model, tokens, Date.now());
      else return ceilingList();
      applyCeilings();
      // The gauge draws its mark off the snapshot, so the pane redraws with the new denominator
      // rather than waiting for the next thing an agent happens to say.
      send('blobot:team');
      return ceilingList();
    },
  );
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
  registerSkillsIpc({ store: () => store, machines: () => machines, teams: () => [...new Map([...pool.live, ...startingTeams.values()].map((team) => [team.team.id, team])).values()] });
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
  /**
   * Retire an agent, and delete its thread with it.
   *
   * The thread goes **first** and by the ordinary team-delete path, which removes every
   * AgentWorkspace before the tombstone because the branch is `blobot/<team>/<agent>` and the
   * name has to still be true. Teams the agent is on are untouched: they keep running with their
   * workspaces and their conversations, and *ending a team is a separate decision* stays true of
   * every team the user made. `.scratch/rail/issues/06-retiring-an-agent.md`.
   *
   * A workspace blobot cannot reach is not a refusal here either. The ordinary reason to retire
   * somebody whose folder is gone is that the folder is gone.
   */
  ipcMain.handle('blobot:retireAgent', async (
    _event, profileId: string, clean = false,
  ): Promise<TeamDeletionResult> => {
    if (store === undefined) return { ok: false, error: 'No database is open.' };
    const thread = threadOf(store, profileId);
    let result: TeamDeletionResult = { ok: true, removals: [] };
    if (thread !== undefined) result = await removeTeam(thread.id, clean === true);
    store.tombstoneProfile(profileId, clock.now());
    send('blobot:team');
    return result;
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
  /**
   * Take an entry out of a Handbook, from the transcript block or from the pane.
   *
   * The row stays and the block stays: a transcript is a record of what happened and is never
   * rewritten, which is why a Routine the user later disarmed still shows the turn that armed
   * it. What changes is what the next session is composed from.
   */
  ipcMain.handle('blobot:removeHandbookEntry', (_event, entryId: string) => {
    // The team's own store, so the demo's block is a working control rather than a picture.
    current()?.store.removeHandbookEntry(entryId, clock.now());
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
      memberMachines?: Readonly<Record<string, import('@blobot/core').MachinePlacement>>,
    ): Promise<TeamDeletionResult> => {
      if (store === undefined) return { ok: false, error: 'No database is open.' };
      const wasLive = pool.find(teamId) !== undefined;
      try {
        const activeStore = store;
        const removals = await pool.withReleased(teamId, async () => {
          const agentMachines = machinesOf(teamId);
          return editTeamRoster(teamId, profileIds, {
            store: activeStore, clock, ...(agentMachines === undefined ? {} : { machines: agentMachines }),
          }, leadProfileId, memberMachines);
        });
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
    if (store === undefined) return { bytes: null, workBytes: null, stateBytes: null, agents: [] };
    try {
      const agentMachines = machinesOf(teamId);
      return await measureTeam(teamId, { store, clock, ...(agentMachines === undefined ? {} : { machines: agentMachines }) });
    } catch {
      // A team blobot cannot measure is offered nothing rather than a wrong figure.
      return { bytes: null, workBytes: null, stateBytes: null, agents: [] };
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
  const forgeMemory = new ForgeMemory();
  ipcMain.handle(
    'blobot:workspaceStatus',
    async (_event, teamId: string, forge = false): Promise<readonly UiWorkspaceStatus[]> => {
      if (store === undefined) return [];
      const statuses = await readTeamWorkspaces(teamId, { store, clock }, { forge }).catch(() => []);
      // A local read carries what the forge last said, so the pull request does not leave the
      // tray every time a turn settles. Settled after the await, so a forge read that landed
      // while this one was in flight is the answer it borrows.
      return forgeMemory.settle(teamId, statuses.map((status) => ({
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
      })), forge);
    },
  );

  /**
   * The directories of one agent's AgentWorkspace the sidebar has open.
   *
   * Local reads only, and no walk: one `git status` for the worktree and a `readdir` plus a
   * `check-ignore` per open folder. Nothing here reaches the network and no runtime is told it
   * happened, which is what makes this observation in the same sense the context gauge is.
   */
  ipcMain.handle(
    'blobot:workspaceTree',
    async (
      _event,
      teamId: string,
      agentId: string,
      paths: readonly string[],
    ): Promise<UiWorkspaceTree> => {
      if (store === undefined) return { present: false, directories: [] };
      const asked = Array.isArray(paths) ? paths.filter((path) => typeof path === 'string') : [];
      return readAgentTree(teamId, agentId, asked, { store, clock }).catch(() => ({
        present: false,
        directories: [],
      }));
    },
  );

  /**
   * A file from that tree, opened in whatever the user opens files with.
   *
   * Guarded the way `blobot:openLink` is, and for the same kind of reason. That one refuses any
   * scheme but `http`; this one takes a **relative** path, resolves it against this agent's own
   * workspace, and refuses anything that escapes it. blobot must not become a read primitive
   * that goes around ticket 14's permission posture, and an absolute path from the renderer
   * would be exactly that.
   */
  ipcMain.handle(
    'blobot:openInWorkspace',
    (_event, teamId: string, agentId: string, path: unknown) => {
      if (store === undefined || typeof path !== 'string') return;
      const target = resolveInWorkspace(teamId, agentId, path, { store, clock });
      if (target === undefined) return;
      void shell.openPath(target);
    },
  );

  /**
   * One agent's uncommitted work, file by file: the git panel's rows.
   *
   * Local reads only, and the same two commands the tray's figure already runs, kept as rows
   * instead of summed. Nothing here reaches the network, and no runtime is told it happened.
   */
  ipcMain.handle(
    'blobot:workspaceChanges',
    async (
      _event,
      teamId: string,
      agentId: string,
      repo?: string,
    ): Promise<UiWorkspaceChanges> => {
      const nothing = { present: false, kind: 'git' as const, rows: [], added: 0, removed: 0 };
      if (store === undefined) return nothing;
      return readAgentChanges(teamId, agentId, typeof repo === 'string' ? repo : undefined, {
        store,
        clock,
      }).catch(() => nothing);
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
    async (
      _event,
      teamId: string,
      agentId: string,
      message: string,
      selection: UiCommitSelection = {},
    ): Promise<readonly string[]> => {
      if (store === undefined) return [];
      return commitPlanFor(teamId, agentId, message, { store, clock }, selection);
    },
  );

  ipcMain.handle(
    'blobot:commitWork',
    async (
      _event,
      teamId: string,
      agentId: string,
      message: string,
      selection: UiCommitSelection = {},
    ): Promise<UiCommitResult> => {
      if (store === undefined) return { ok: false, error: 'No database is open.' };
      return commitAgentWork(teamId, agentId, message, { store, clock }, selection).catch(
        (error: unknown) => ({ ok: false as const, error: describe(error) }),
      );
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

  /**
   * Deleting a team, and the one path that does it.
   *
   * Extracted because retiring an agent deletes that agent's thread, and a thread is a Team: the
   * ordering bought in the Machines review — every AgentWorkspace removed *before* the rows are
   * tombstoned, because the branch is `blobot/<team>/<agent>` and the name has to still be true —
   * must not have a second implementation that could disagree with this one.
   */
  const removeTeam = async (teamId: string, clean: boolean): Promise<TeamDeletionResult> => {
    if (store === undefined) return { ok: false, error: 'No database is open.' };
    const wasActive = pool.active?.team.id === teamId;
    try {
      const activeStore = store;
      const deletion = await pool.withReleased(teamId, async () => {
        const agentMachines = machinesOf(teamId);
        return deleteTeam(teamId, { store: activeStore, clock,
          ...(agentMachines === undefined ? {} : { machines: agentMachines }),
        }, { clean });
      });
      if (wasActive) {
        openError = undefined;
        // The most recent surviving row, thread or team. A thread is a legitimate place to
        // land — it resolves to its one agent's pane and never to a team view — and excluding
        // them would put a user whose only conversations are threads back in the creation flow.
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
  };

  ipcMain.handle('blobot:deleteTeam', (_event, teamId: string, clean = false) =>
    removeTeam(teamId, clean === true),
  );

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

  // Dictation. Audio arrives as bytes on `dictation:feed` and nothing else crosses: the
  // renderer never names a device or a path. `feed` is an invoke rather than a send because its
  // answer is the backpressure signal the composer draws as `paused`.
  ipcMain.handle('dictation:start', (_event, teamId: string) => dictation.start(teamId));
  ipcMain.handle('dictation:feed', (_event, pcm: Uint8Array) => dictation.feed(pcm));
  ipcMain.on('dictation:mark', () => dictation.mark());
  ipcMain.handle('dictation:stop', () => dictation.stop());
  // *Say something*: the local Transcriber with no team behind it, timed on its first sentence.
  ipcMain.handle('dictation:tryout', () => {
    const made = demoMode
      ? new MockTranscriber({ scenario: speechScenarios[demoSpeechName], clock })
      : dictationSettings.tryoutTranscriber();
    return 'error' in made ? Promise.resolve({ ok: false as const, error: made.error }) : dictation.start(TRYOUT_TEAM, made);
  });

  // The Dictation section (ticket 10). Every action answers with the whole section.
  ipcMain.handle('blobot:dictationSettings', () => dictationSettings.view());
  ipcMain.handle('blobot:machineIdleAfterMs', () => machinePreferences?.idleAfterMs);
  ipcMain.handle('blobot:liveTeamLimit', () => pool.limit);
  ipcMain.handle('blobot:setLiveTeamLimit', async (_event, value: number) => {
    if (machinePreferences === undefined) throw new Error('Machine preferences are not available.');
    const saved = await machinePreferences.setLiveTeamLimit(value);
    // Applied to the running pool, not only stored: lowering it collects the excess now, under
    // the eviction rule that never takes the active team or one mid-turn.
    pool.limit = saved;
    send('blobot:team');
    return saved;
  });
  ipcMain.handle('blobot:engineSetup', () => engineSetup?.view());
  ipcMain.handle('blobot:startEngineSetup', (_event, kind: 'install' | 'sign_in' | 'check') => engineSetup?.start(kind));
  ipcMain.handle('blobot:cancelEngineSetup', (_event, id: string) => engineSetup?.cancel(id));
  ipcMain.handle('blobot:removeRetainedMachine', async (_event, agentId: string) => {
    if (machineInventory === undefined) throw new Error('Sandbox storage is unavailable.');
    await machineInventory.remove(agentId);
    send('blobot:machines');
  });
  ipcMain.handle('blobot:agentMachine', (_event, teamId: string, agentId: string) => {
    const access = agentAccess(teamId, agentId);
    const view = access.machine?.runtimeAccess === undefined ? {
      placement: access.record.machine ?? { kind: 'local' as const }, power: access.execution?.power ?? 'unknown',
      pendingMessages: access.pendingMessages(), methods: [],
    } : machineLogins!.view(teamId, agentId);
    const preparation = access.machine !== undefined && 'preparation' in access.machine ? access.machine.preparation : undefined;
    const storage = access.machine !== undefined && 'storage' in access.machine ? access.machine.storage : undefined;
    return { ...view, ...(access.failure === undefined ? {} : { failure: access.failure }),
      ...(preparation === undefined ? {} : { preparation }), ...(storage === undefined ? {} : { storage }) };
  });
  ipcMain.handle('blobot:startMachineLogin', (_event, teamId: string, agentId: string, method: string) => machineLogins?.start(teamId, agentId, method));
  ipcMain.handle('blobot:openMachineLogin', (_event, teamId: string, agentId: string, id: string) => machineLogins?.open(teamId, agentId, id));
  ipcMain.handle('blobot:answerMachineLogin', (_event, teamId: string, agentId: string, id: string, value: string) => machineLogins?.respond(teamId, agentId, id, value));
  ipcMain.handle('blobot:cancelMachineLogin', (_event, teamId: string, agentId: string, id: string) => machineLogins?.cancel(teamId, agentId, id));
  ipcMain.handle('blobot:retryMachine', (_event, teamId: string, agentId: string) => agentAccess(teamId, agentId).retry());
  ipcMain.handle('blobot:cancelMachineStart', (_event, teamId: string, agentId: string) => agentAccess(teamId, agentId).execution?.cancelStart());
  ipcMain.handle('blobot:setMachineIdleAfterMs', async (_event, value: number) => {
    if (machinePreferences === undefined) throw new Error('Machine preferences are not available.');
    const saved = await machinePreferences.setIdleAfterMs(value);
    for (const live of pool.live) live.setIdleAfterMs?.(saved);
    return saved;
  });
  ipcMain.handle('blobot:setDictation', (_event, patch: DictationPatch) => dictationSettings.set(patch));
  ipcMain.handle('blobot:checkSpeechReadiness', () => dictationSettings.checkReadiness());
  ipcMain.handle('blobot:downloadSpeech', (_event, target: SpeechTarget) => dictationSettings.download(target));
  ipcMain.handle('blobot:cancelSpeechDownload', (_event, target: SpeechTarget) =>
    dictationSettings.cancelDownload(target),
  );
  ipcMain.handle('blobot:removeSpeech', (_event, target: SpeechTarget) => dictationSettings.remove(target));
  ipcMain.handle('blobot:removeAllSpeech', () => dictationSettings.removeAll());
  // The key arrives once and is validated against its provider before it is kept. It is not
  // logged, not echoed and not returned: the answer is the section, plus why not.
  ipcMain.handle('blobot:saveSpeechKey', (_event, providerId: string, key: string) =>
    dictationSettings.saveKey(providerId, key),
  );
  ipcMain.handle('blobot:removeSpeechKey', (_event, providerId: string) => dictationSettings.removeKey(providerId));

  ipcMain.handle('blobot:selectTeam', async (_event, teamId: string): Promise<TeamOpenResult> => {
    const team = store?.teamById(teamId);
    if (team === undefined) return { ok: false, error: 'That team is no longer in the database.' };
    // Against what is drawn, not what is running: while another team opens, the running one is
    // still `current()`, and pressing it has to take the screen back.
    if (team.id === shownTeamId()) return { ok: true };
    return switchTo(team);
  });

  /**
   * Open an agent's **thread**, if they have one.
   *
   * Answering `{ok: true}` with no team is not a failure and is the ordinary case: a freshly
   * hired agent has no thread until their first message makes one, and the pane draws an empty
   * conversation until then. `.scratch/rail/issues/04`.
   */
  ipcMain.handle('blobot:openThread', async (
    _event, profileId: string,
  ): Promise<TeamOpenResult & { agentId?: string }> => {
    const team = store === undefined ? undefined : threadOf(store, profileId);
    if (team === undefined) return { ok: true };
    const agentId = store?.agentsOfTeam(team.id)[0]?.id;
    if (team.id === shownTeamId()) {
      return { ok: true, ...(agentId === undefined ? {} : { agentId }) };
    }
    const opened = await switchTo(team);
    return { ...opened, ...(agentId === undefined ? {} : { agentId }) };
  });

  /**
   * The first message in a thread, which is what makes the thread.
   *
   * Four things happen before a turn starts — the folder, the Team, the Agent, the launch — and
   * they happen here rather than on the press of a rail row, so curiosity costs nothing. A
   * failure comes back as one, and the renderer keeps the typed message: `git init` failing or
   * `~/blobot` not being writable is something the user can fix and send again.
   */
  ipcMain.handle('blobot:promptThread', async (
    _event, profileId: string, text: string, attachmentIds: readonly string[] = [],
  ): Promise<TeamOpenResult & { agentId?: string }> => {
    if (store === undefined) return { ok: false, error: 'No database is open.' };
    let team = threadOf(store, profileId);
    if (team === undefined) {
      try {
        team = await createThread(profileId, { store, clock });
      } catch (error) {
        return { ok: false, error: describe(error) };
      }
    }
    if (opening !== undefined || team.id !== current()?.team.id) {
      const opened = await switchTo(team);
      if (!opened.ok) return opened;
    }
    // By this team and not by what is on screen: the user may have pressed elsewhere while it
    // started, and the message is still this thread's.
    const live = current()?.team.id === team.id ? current() : pool.find(team.id);
    const agentId = live?.agents[0]?.id;
    if (live === undefined || agentId === undefined) {
      return { ok: false, error: 'That conversation could not be opened.' };
    }
    await live.orchestrator.promptFromUser([agentId], text, attachmentIds);
    return { ok: true, agentId };
  });

  // What is on disk for dictation, read once so the first snapshot's word is right.
  await dictationSettings.refresh();
  // `--demo-dictation=on` switches the section on in the demo's throwaway store, so the rows
  // past the switch — readiness, the models, the providers — are reviewable by a screenshot.
  if (demoMode && process.argv.includes('--demo-dictation=on')) await dictationSettings.set({ enabled: true });

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
    // Suffixed by the runtime rather than by a hardcoded word: an agent's runtime is fixed at
    // hire, so Alice-on-Claude and Alice-on-fx cannot be the same profile. Claude keeps the bare
    // name because it was the first, and renaming it would orphan the profiles already hired.
    const profileName =
      seat.runtimeId === 'claude-code' ? seat.name : `${seat.name}-${seat.runtimeId}`;
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

let closing: Promise<void> | undefined;
let closed = false;
function closeApplication(): Promise<void> {
  return closing ??= (async () => {
    stopStep();
    routines?.stop();
    // Stop readers/writers and guest sign-in before closing their durable state.
    const results = await Promise.allSettled([
      engineSetup?.close(), machineLogins?.close(), machines?.close(), pool.closeAll(), dictation.stop(), demo?.close(),
      ...[...startingTeams.values()].flatMap((live) => [...live.executions?.values() ?? []].map((execution) => execution.stop())),
    ]);
    if (results.some((result) => result.status === 'rejected')) console.warn('Some application services could not close cleanly.');
    opened?.close();
    opened = undefined;
    store = undefined;
    closed = true;
  })();
}

app.on('before-quit', (event) => {
  if (closed) return;
  event.preventDefault();
  void closeApplication().then(() => app.quit());
});
app.on('window-all-closed', () => {
  void closeApplication().then(() => { if (process.platform !== 'darwin') app.quit(); });
});
