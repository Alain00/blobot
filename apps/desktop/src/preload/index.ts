import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { AgentEvent, AgentStatus, Message } from '@blobot/core/domain';
import type {
  BlobotApi,
  NewTeamSpec,
  TeamCreationResult,
  UiRuntimeChoice,
  UiSnapshot,
  UiWorkspaceInspection,
} from '../shared/api.js';

/**
 * The only door between the renderer and the main process. Everything the UI knows arrives
 * through here — in particular there is no database handle, because a renderer with one is a
 * renderer that will eventually filter on `runtime_id`.
 */
const api: BlobotApi = {
  snapshot: () => ipcRenderer.invoke('blobot:snapshot') as Promise<UiSnapshot>,
  prompt: (agentId, text) => ipcRenderer.invoke('blobot:prompt', agentId, text) as Promise<void>,
  resumeAfterBudget: () => ipcRenderer.invoke('blobot:resume') as Promise<void>,
  chooseWorkspace: () =>
    ipcRenderer.invoke('blobot:chooseWorkspace') as Promise<string | undefined>,
  inspectWorkspace: (path) =>
    ipcRenderer.invoke('blobot:inspectWorkspace', path) as Promise<
      UiWorkspaceInspection | { error: string }
    >,
  initializeWorkspace: (path) =>
    ipcRenderer.invoke('blobot:initializeWorkspace', path) as Promise<
      UiWorkspaceInspection | { error: string }
    >,
  detectRuntimes: () =>
    ipcRenderer.invoke('blobot:detectRuntimes') as Promise<readonly UiRuntimeChoice[]>,
  createTeam: (spec: NewTeamSpec) =>
    ipcRenderer.invoke('blobot:createTeam', spec) as Promise<TeamCreationResult>,
  selectTeam: (teamId: string) => ipcRenderer.invoke('blobot:selectTeam', teamId) as Promise<void>,
  onEvent: (listener) => subscribe('blobot:event', (_e, event: AgentEvent) => listener(event)),
  onStatus: (listener) =>
    subscribe('blobot:status', (_e, agentId: string, status: AgentStatus) =>
      listener(agentId, status),
    ),
  onMessage: (listener) =>
    subscribe('blobot:message', (_e, message: Message) => listener(message)),
  onBudget: (listener) =>
    subscribe('blobot:budget', (_e, used: number, budget: number) => listener(used, budget)),
  onTurns: (listener) => subscribe('blobot:turns', (_e, turns: number) => listener(turns)),
  onTeamChanged: (listener) => subscribe('blobot:team', () => listener()),
};

function subscribe(
  channel: string,
  handler: (event: IpcRendererEvent, ...args: never[]) => void,
): () => void {
  ipcRenderer.on(channel, handler as (event: IpcRendererEvent, ...args: unknown[]) => void);
  return () => {
    ipcRenderer.off(channel, handler as (event: IpcRendererEvent, ...args: unknown[]) => void);
  };
}

contextBridge.exposeInMainWorld('blobot', api);
