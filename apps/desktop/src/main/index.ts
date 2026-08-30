import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SqliteStore,
  SystemClock,
  WorkspaceError,
  detectRuntimes,
  openDatabase,
  type AgentStatus,
  type OpenedDatabase,
  type PendingPermission,
  type Team,
} from '@blobot/core';
import { createDemoTeam } from './demo-team.js';
import { startTeam } from './start-team.js';
import {
  TeamCreationError,
  createTeam,
  deleteTeam,
  editAgentProfile,
  editTeamRoster,
  hireAgent,
  initializeWorkspace,
  inspectWorkspace,
  type AgentRemoval,
  type NewAgentSpec,
  type NewTeamSpec,
} from './team-store.js';
import { choicesOf } from './permission-choices.js';
import { runtimeLabel } from './runtime-labels.js';
import { isWorking, type RunningTeam } from './running-team.js';
import { TeamPool } from './team-pool.js';
import type {
  EditAgentResult,
  HireResult,
  TeamCreationResult,
  TeamDeletionResult,
  UiAgentRemoval,
  PermissionChoice,
  UiPermissionRequest,
  UiAgentProfile,
  UiRuntimeChoice,
  TeamOpenResult,
  UiSnapshot,
  UiTeamSummary,
  UiWorkspaceInspection,
} from '../shared/api.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const clock = new SystemClock();

/** `--screenshot=<path>` renders a scripted turn and writes a PNG, so the UI is reviewable. */
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
 * `--live-claude=<dir>` is now a shortcut through the product path rather than beside it: it
 * creates a real team for `<dir>` in the real database, with a two-agent roster it still
 * hardcodes, and starts it exactly as the creation flow would.
 */
const liveClaudePath = process.argv
  .find((arg) => arg.startsWith('--live-claude='))
  ?.slice('--live-claude='.length);

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
 * The live teams. Selecting one promotes it rather than restarting it, which is why switching
 * no longer costs a workspace reconcile, a process per agent and a transcript replay.
 */
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
    messages: store?.forTeam(team.id) ?? [],
    answers: store?.answersOfTeam(team.id) ?? [],
    permissions: [],
    turnsThisPrompt: 0,
    demoMode: false,
    opening: true,
  };
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
      messages: [],
      answers: [],
      permissions: [],
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
    })),
    statuses: liveStatuses(),
    // Read fresh rather than remembered: a team that was evicted and resumed re-advertises,
    // and a menu kept across that would describe a session that no longer exists.
    commands: Object.fromEntries(
      team.agents.map((agent) => [agent.id, team.orchestrator.commandsOf(agent.id)]),
    ),
    messages: team.store.forTeam(team.team.id),
    answers: team.store.answersOfTeam(team.team.id),
    // A block the user has not answered survives a re-snapshot, because the turn behind it is
    // still standing there: a switch away and back must not lose the question.
    permissions: team.orchestrator.pendingPermissions.map(asUiPermission),
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
  orchestrator.onMessage((message) => send('blobot:message', teamId, message));
  orchestrator.onBudgetExhausted((exhausted) =>
    send('blobot:budget', teamId, exhausted.turnsUsed, exhausted.turnBudget),
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

  if (autoplay) {
    // `loadFile` already resolved, so a `did-finish-load` listener attached here never fires.
    // The wait is for the launch team, which now starts after this window rather than before it:
    // without it a `--live-claude` autoplay would prompt whatever was live, which is nothing.
    setTimeout(() => {
      void firstStart.then(() => {
        const team = current();
        if (team !== undefined) {
          void team.orchestrator.promptFromUser(team.agents[0]?.id ?? '', team.autoplayPrompt);
        }
      });
    }, 700);
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
    demo = await createDemoTeam(':memory:', migrations);
    attach(demo);
  } else {
    // Everything else lives in one file under `userData`, which is what makes a team a thing
    // the user created rather than a thing this process happens to be holding.
    opened = openDatabase({ path: join(app.getPath('userData'), 'blobot.db'), migrationsFolder: migrations });
    store = new SqliteStore(opened.db);
    launchTeam = liveClaudePath === undefined ? store.listTeams()[0] : await liveTeam(liveClaudePath);
  }

  ipcMain.handle('blobot:snapshot', () => snapshot());
  ipcMain.handle('blobot:prompt', async (_event, agentId: string, text: string) => {
    // `current()` is still the team that was on screen while another one starts, so a message
    // sent now would reach the wrong team's agent. The composer is closed for the same reason;
    // this is the half that does not depend on the renderer having agreed.
    if (opening !== undefined) return;
    await current()?.orchestrator.promptFromUser(agentId, text);
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
  ipcMain.handle('blobot:detectRuntimes', async (): Promise<UiRuntimeChoice[]> => {
    const detections = await detectRuntimes();
    return detections.map((detection) => ({
      runtimeId: detection.runtimeId,
      label: detection.label,
      readiness: detection.readiness,
      supported: detection.supported,
      detail: detection.detail,
      ...(detection.version === undefined ? {} : { version: detection.version }),
    }));
  });
  ipcMain.handle('blobot:listAgents', (): UiAgentProfile[] => agentProfiles());
  ipcMain.handle('blobot:hireAgent', async (_event, spec: NewAgentSpec): Promise<HireResult> => {
    if (store === undefined) return { ok: false, error: 'No database is open.' };
    try {
      // The executable is resolved here rather than in the renderer: ticket 07 pins the
      // user's own binary, and that resolution is detection's job, not the UI's.
      const detected = await detectRuntimes();
      const executablePath = detected.find(
        (detection) => detection.runtimeId === spec.runtimeId,
      )?.executablePath;
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
        const detected = await detectRuntimes();
        const executablePath = detected.find(
          (detection) => detection.runtimeId === spec.runtimeId,
        )?.executablePath;
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
  ipcMain.handle('blobot:deleteTeam', async (_event, teamId: string): Promise<TeamDeletionResult> => {
    if (store === undefined) return { ok: false, error: 'No database is open.' };
    const wasActive = pool.active?.team.id === teamId;
    await pool.release(teamId);
    try {
      const deletion = await deleteTeam(teamId, { store, clock });
      if (wasActive) {
        openError = undefined;
        const next = store.listTeams()[0];
        if (next !== undefined) {
          const opened = await switchTo(next);
          if (!opened.ok) openError = `${next.name} did not open. ${opened.error ?? ''}`.trim();
        }
      }
      return { ok: true, removals: deletion.removals.map(asUiRemoval) };
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

/** The `--live-claude` roster: still hardcoded, now the only shortcut left in that flag. */
async function liveTeam(workspacePath: string): Promise<Team | undefined> {
  if (store === undefined) return undefined;
  const name = basename(workspacePath);
  const existing = store.teamByName(name);
  if (existing !== undefined) return existing;
  const claude = (await detectRuntimes()).find((runtime) => runtime.runtimeId === 'claude-code');
  const profileIds = [
    { name: 'Alice', role: 'frontend' },
    { name: 'Bob', role: 'backend' },
  ].map((member) => {
    // Hire them once. On a second directory they are the *same* agents joining a second team.
    const existingProfile = store?.profileByName(member.name);
    if (existingProfile !== undefined) return existingProfile.id;
    return hireAgent(
      {
        ...member,
        runtimeId: 'claude-code',
        ...(claude?.executablePath === undefined ? {} : { executablePath: claude.executablePath }),
      },
      { store: store as SqliteStore, clock },
    ).id;
  });
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
  void pool.closeAll();
  void demo?.close();
  opened?.close();
  if (process.platform !== 'darwin') app.quit();
});
