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
  type Team,
} from '@blobot/core';
import { createDemoTeam } from './demo-team.js';
import { startTeam } from './start-team.js';
import {
  TeamCreationError,
  createTeam,
  hireAgent,
  initializeWorkspace,
  inspectWorkspace,
  type NewAgentSpec,
  type NewTeamSpec,
} from './team-store.js';
import { runtimeLabel } from './runtime-labels.js';
import type { RunningTeam } from './running-team.js';
import type {
  HireResult,
  TeamCreationResult,
  UiAgentProfile,
  UiRuntimeChoice,
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
let running: RunningTeam | undefined;
let window: BrowserWindow | undefined;

function teamSummaries(): UiTeamSummary[] {
  if (store === undefined) return [];
  return store.listTeams().map((team) => ({
    id: team.id,
    name: team.name,
    workspacePath: team.workspacePath,
    agentCount: store?.agentsOfTeam(team.id).length ?? 0,
  }));
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
    teams: store
      ? store
          .membershipsOf(profile.id)
          .map((agent) => teamNames.get(agent.teamId) ?? '')
          .filter((name) => name !== '')
      : [],
  }));
}

function snapshot(): UiSnapshot {
  const team = running;
  if (team === undefined) {
    return {
      teams: teamSummaries(),
      agents: [],
      statuses: {},
      messages: [],
      answers: [],
      turnsThisPrompt: 0,
      demoMode: false,
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
      ...(team.branches[agent.id] === undefined ? {} : { branch: team.branches[agent.id] }),
    })),
    statuses: Object.fromEntries(
      team.agents.map((agent) => [agent.id, team.orchestrator.statusOf(agent.id)]),
    ) as Record<string, AgentStatus>,
    messages: team.store.forTeam(team.team.id),
    answers: team.store.answersOfTeam(team.team.id),
    turnsThisPrompt: team.orchestrator.turnsThisPrompt,
    demoMode: team.demoMode,
  };
}

const send = (channel: string, ...args: unknown[]): void => {
  if (window !== undefined && !window.isDestroyed()) window.webContents.send(channel, ...args);
};

/** Wire one running team's streams to the renderer. Re-run on every team switch. */
function attach(team: RunningTeam): void {
  const orchestrator = team.orchestrator;
  orchestrator.onEvent((event) => {
    send('blobot:event', event);
    send('blobot:turns', orchestrator.turnsThisPrompt);
  });
  orchestrator.onStatusChange((agentId, status) => send('blobot:status', agentId, status));
  orchestrator.onMessage((message) => send('blobot:message', message));
  orchestrator.onBudgetExhausted((exhausted) =>
    send('blobot:budget', exhausted.turnsUsed, exhausted.turnBudget),
  );
}

/**
 * Stop whatever is running and start this team instead. One orchestrator at a time: the
 * orchestrator is per-team already, so holding several is wiring rather than surgery — but a
 * second live team is a second set of agent processes, and nobody has asked for that yet.
 */
async function switchTo(team: Team): Promise<void> {
  if (store === undefined || opened === undefined) return;
  const previous = running;
  running = undefined;
  await previous?.close();
  running = await startTeam({ team, store, db: opened.db, clock });
  attach(running);
  send('blobot:team');
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

  if (running !== undefined) attach(running);

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
      const team = running;
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
    running = await createDemoTeam(':memory:', migrations);
  } else {
    // Everything else lives in one file under `userData`, which is what makes a team a thing
    // the user created rather than a thing this process happens to be holding.
    opened = openDatabase({ path: join(app.getPath('userData'), 'blobot.db'), migrationsFolder: migrations });
    store = new SqliteStore(opened.db);
    const team = liveClaudePath === undefined ? store.listTeams()[0] : await liveTeam(liveClaudePath);
    if (team !== undefined) await switchTo(team);
  }

  ipcMain.handle('blobot:snapshot', () => snapshot());
  ipcMain.handle('blobot:prompt', async (_event, agentId: string, text: string) => {
    await running?.orchestrator.promptFromUser(agentId, text);
  });
  ipcMain.handle('blobot:resume', () => running?.orchestrator.resumeAfterBudget());

  ipcMain.handle('blobot:chooseWorkspace', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose a Workspace',
      properties: ['openDirectory', 'createDirectory'],
    });
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
      await switchTo(team);
      return { ok: true, teamId: team.id };
    } catch (error) {
      return { ok: false, error: describe(error) };
    }
  });
  ipcMain.handle('blobot:selectTeam', async (_event, teamId: string) => {
    const team = store?.teamById(teamId);
    if (team !== undefined && team.id !== running?.team.id) await switchTo(team);
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

function describe(error: unknown): string {
  if (error instanceof TeamCreationError || error instanceof WorkspaceError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

app.on('window-all-closed', () => {
  void running?.close();
  opened?.close();
  if (process.platform !== 'darwin') app.quit();
});
