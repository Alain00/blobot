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
  HireResult,
  TeamCreationResult,
  TeamDeletionResult,
  UiAgentRemoval,
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
    const live = await startTeam({ team, store, db: opened.db, clock });
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

/** The team on screen. Everything the renderer asks about is about this one. */
function current(): RunningTeam | undefined {
  return demo ?? pool.active;
}

function teamSummaries(): UiTeamSummary[] {
  if (store === undefined) return [];
  return store.listTeams().map((team) => {
    const lastActiveAt = store?.lastActiveAt(team.id);
    return {
      id: team.id,
      name: team.name,
      workspacePath: team.workspacePath,
      workspaceKind: team.workspaceKind,
      agentCount: store?.agentsOfTeam(team.id).length ?? 0,
      ...(lastActiveAt === undefined ? {} : { lastActiveAt }),
    };
  });
}

/** Every hired agent, and which teams it is on — a membership query, never a stored count. */
function agentProfiles(): UiAgentProfile[] {
  if (store === undefined) return [];
  const teamNames = new Map(store.listTeams().map((team) => [team.id, team.name]));
  return store.listProfiles().map((profile) => ({
    id: profile.id,
    name: profile.name,
    role: profile.role,
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

function snapshot(): UiSnapshot {
  const team = current();
  if (team === undefined) {
    return {
      teams: teamSummaries(),
      agents: [],
      statuses: {},
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
    },
    teams: team.demoMode
      ? [
          {
            id: team.team.id,
            name: team.team.name,
            workspacePath: team.team.workspacePath,
            workspaceKind: team.team.workspaceKind,
            agentCount: team.agents.length,
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
    statuses: Object.fromEntries(
      team.agents.map((agent) => [agent.id, team.orchestrator.statusOf(agent.id)]),
    ) as Record<string, AgentStatus>,
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
  try {
    await pool.select(team);
    openError = undefined;
  } catch (error) {
    // A Workspace that has been moved or deleted is the ordinary case here, and it used to
    // reach nobody: the handler rejected, the terminal got a stack trace, and the user got a
    // team that would not open for no stated reason. Whatever was on screen stays on screen.
    return { ok: false, error: describe(error) };
  }
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

  const pane = process.argv.find((arg) => arg.startsWith('--pane='))?.slice('--pane='.length);
  const hash = pane === undefined ? undefined : `pane=${pane}`;
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
    setTimeout(() => {
      const team = current();
      if (team !== undefined) {
        void team.orchestrator.promptFromUser(team.agents[0]?.id ?? '', team.autoplayPrompt);
      }
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
    const team = liveClaudePath === undefined ? store.listTeams()[0] : await liveTeam(liveClaudePath);
    // A launch that cannot open the newest team is not a launch that fails: the window comes
    // up on the rail, where the user can pick another one and read what went wrong.
    if (team !== undefined) {
      const first = await switchTo(team);
      if (!first.ok) {
        openError = `${team.name} did not open. ${first.error ?? ''}`.trim();
        process.stderr.write(`[teams] ${openError}\n`);
      }
    }
  }

  ipcMain.handle('blobot:snapshot', () => snapshot());
  ipcMain.handle('blobot:prompt', async (_event, agentId: string, text: string) => {
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
    async (_event, teamId: string, profileIds: readonly string[]): Promise<TeamDeletionResult> => {
      if (store === undefined) return { ok: false, error: 'No database is open.' };
      const wasLive = pool.find(teamId) !== undefined;
      await pool.release(teamId);
      try {
        const removals = await editTeamRoster(teamId, profileIds, { store, clock });
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
   * The answer to one permission block. Two choices reach here, and the option ids stay in this
   * process: a renderer that could name an option could name `allow_always`.
   */
  ipcMain.handle('blobot:answerPermission', (_event, requestId: string, choice: 'allow' | 'reject') => {
    const waiting = permissions.get(requestId);
    const pending = waiting?.orchestrator.pendingPermissions.find((entry) => entry.id === requestId);
    if (waiting === undefined || pending === undefined) return;
    const choices = choicesOf(pending);
    const optionId = choice === 'allow' ? choices.allowOptionId : choices.rejectOptionId;
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
