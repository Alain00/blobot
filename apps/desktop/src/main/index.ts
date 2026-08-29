import { app, BrowserWindow, ipcMain } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentStatus } from '@blobot/core';
import { createDemoTeam, demoBranchOf, type DemoTeam } from './demo-team.js';
import type { UiSnapshot } from '../shared/api.js';

const here = fileURLToPath(new URL('.', import.meta.url));

/** `--screenshot=<path>` renders a scripted turn and writes a PNG, so the UI is reviewable. */
const screenshotPath = process.argv
  .find((arg) => arg.startsWith('--screenshot='))
  ?.slice('--screenshot='.length);
const autoplay = process.argv.includes('--autoplay') || screenshotPath !== undefined;

let demo: DemoTeam | undefined;
let window: BrowserWindow | undefined;

function snapshot(): UiSnapshot {
  if (demo === undefined) throw new Error('demo team not started');
  return {
    team: {
      id: demo.team.id,
      name: demo.team.name,
      workspacePath: demo.team.workspacePath,
      turnBudget: demo.team.turnBudget,
    },
    agents: demo.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      runtimeLabel: demo?.runtimeLabels[agent.id] ?? 'unknown',
      workspacePath: agent.workspacePath,
      branch: demoBranchOf(agent),
    })),
    statuses: Object.fromEntries(
      demo.agents.map((agent) => [agent.id, demo?.orchestrator.statusOf(agent.id) ?? 'idle']),
    ) as Record<string, AgentStatus>,
    messages: demo.store.forTeam(demo.team.id),
    turnsThisPrompt: demo.orchestrator.turnsThisPrompt,
    demoMode: true,
  };
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

  const send = (channel: string, ...args: unknown[]): void => {
    if (window !== undefined && !window.isDestroyed()) window.webContents.send(channel, ...args);
  };

  const orchestrator = demo?.orchestrator;
  orchestrator?.onEvent((event) => {
    send('blobot:event', event);
    send('blobot:turns', orchestrator.turnsThisPrompt);
  });
  orchestrator?.onStatusChange((agentId, status) => send('blobot:status', agentId, status));
  orchestrator?.onMessage((message) => send('blobot:message', message));
  orchestrator?.onBudgetExhausted((exhausted) =>
    send('blobot:budget', exhausted.turnsUsed, exhausted.turnBudget),
  );

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
      void demo?.orchestrator.promptFromUser(
        'alice',
        'The checkout page double-charges on a double click. Fix the UI side and get the API side sorted too.',
      );
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
  demo = await createDemoTeam(':memory:', join(app.getAppPath(), '../../packages/core/migrations'));

  ipcMain.handle('blobot:snapshot', () => snapshot());
  ipcMain.handle('blobot:prompt', async (_event, agentId: string, text: string) => {
    await demo?.orchestrator.promptFromUser(agentId, text);
  });
  ipcMain.handle('blobot:resume', () => demo?.orchestrator.resumeAfterBudget());

  await createWindow();
});

app.on('window-all-closed', () => {
  demo?.close();
  if (process.platform !== 'darwin') app.quit();
});
