import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { AgentEvent, AgentStatus, Message } from '@blobot/core/domain';
import type {
  BlobotApi,
  EditAgentResult,
  HireResult,
  NewAgentSpec,
  NewTeamSpec,
  UiAgentProfile,
  TeamCreationResult,
  TeamOpenResult,
  TeamDeletionResult,
  PermissionChoice,
  UiPermissionOutcome,
  UiPermissionRequest,
  UiCommand,
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
  prompt: (agentIds, text) =>
    ipcRenderer.invoke('blobot:prompt', agentIds, text) as Promise<void>,
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
  listAgents: () => ipcRenderer.invoke('blobot:listAgents') as Promise<readonly UiAgentProfile[]>,
  hireAgent: (spec: NewAgentSpec) =>
    ipcRenderer.invoke('blobot:hireAgent', spec) as Promise<HireResult>,
  editAgent: (profileId: string, spec: NewAgentSpec) =>
    ipcRenderer.invoke('blobot:editAgent', profileId, spec) as Promise<EditAgentResult>,
  retireAgent: (profileId: string) =>
    ipcRenderer.invoke('blobot:retireAgent', profileId) as Promise<void>,
  createTeam: (spec: NewTeamSpec) =>
    ipcRenderer.invoke('blobot:createTeam', spec) as Promise<TeamCreationResult>,
  selectTeam: (teamId: string) =>
    ipcRenderer.invoke('blobot:selectTeam', teamId) as Promise<TeamOpenResult>,
  editTeam: (teamId: string, profileIds: readonly string[], leadProfileId?: string) =>
    ipcRenderer.invoke(
      'blobot:editTeam',
      teamId,
      profileIds,
      leadProfileId,
    ) as Promise<TeamDeletionResult>,
  deleteTeam: (teamId: string) =>
    ipcRenderer.invoke('blobot:deleteTeam', teamId) as Promise<TeamDeletionResult>,
  answerPermission: (requestId: string, choice: PermissionChoice) =>
    ipcRenderer.invoke('blobot:answerPermission', requestId, choice) as Promise<void>,
  onEvent: (listener) =>
    subscribe('blobot:event', (_e, teamId: string, event: AgentEvent) => listener(teamId, event)),
  onStatus: (listener) =>
    subscribe('blobot:status', (_e, teamId: string, agentId: string, status: AgentStatus) =>
      listener(teamId, agentId, status),
    ),
  onCommands: (listener) =>
    subscribe('blobot:commands', (_e, teamId: string, agentId: string, commands: UiCommand[]) =>
      listener(teamId, agentId, commands),
    ),
  onMessage: (listener) =>
    subscribe('blobot:message', (_e, teamId: string, message: Message) =>
      listener(teamId, message),
    ),
  onBudget: (listener) =>
    subscribe('blobot:budget', (_e, teamId: string, used: number, budget: number) =>
      listener(teamId, used, budget),
    ),
  onTurns: (listener) =>
    subscribe('blobot:turns', (_e, teamId: string, turns: number) => listener(teamId, turns)),
  onPermission: (listener) =>
    subscribe('blobot:permission', (_e, teamId: string, request: UiPermissionRequest) =>
      listener(teamId, request),
    ),
  onPermissionSettled: (listener) =>
    subscribe(
      'blobot:permission-settled',
      (_e, teamId: string, requestId: string, outcome: UiPermissionOutcome) =>
        listener(teamId, requestId, outcome),
    ),
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
