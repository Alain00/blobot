import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import type { AgentEvent, AgentStatus, Message, TranscriberEvent } from '@blobot/core/domain';
import type {
  BlobotApi,
  EditAgentResult,
  UiAttachment,
  UiAttachmentRefusal,
  HireResult,
  NewAgentSpec,
  NewRoutineSpec,
  NewTeamSpec,
  UiRoutine,
  UiRoutineRun,
  UiRoutineTarget,
  UiHandbookWrite,
  UiScheduledRoutine,
  RoutineSaveResult,
  UiAgentProfile,
  TeamCreationResult,
  TeamOpenResult,
  TeamDeletionResult,
  PermissionChoice,
  UiPermissionOutcome,
  UiPermissionRequest,
  UiCommand,
  UiContextCeiling,
  UiRuntimeChoice,
  RuntimeStepOutcome,
  UiEarlier,
  UiSnapshot,
  UiTeamIcon,
  UiTeamDiskUsage,
  UiWorkspaceInspection,
  UiWorkspaceStatus,
  UiWorkspaceChanges,
  UiWorkspaceTree,
  UiBranches,
  UiCommitResult,
  UiPublishResult,
  UiSwitchResult,
  UiRuntimeOptions,
  UiDictationStart,
  UiDictationSettings,
  UiSpeechFileState,
  UiSpeechMeasurement,
  UiSpeechTarget,
  DictationPatch,
} from '../shared/api.js';

/**
 * The only door between the renderer and the main process. Everything the UI knows arrives
 * through here — in particular there is no database handle, because a renderer with one is a
 * renderer that will eventually filter on `runtime_id`.
 */
const api: BlobotApi = {
  machineIdleAfterMs: () => ipcRenderer.invoke('blobot:machineIdleAfterMs') as Promise<number>,
  setMachineIdleAfterMs: (value) => ipcRenderer.invoke('blobot:setMachineIdleAfterMs', value) as Promise<number>,
  snapshot: () => ipcRenderer.invoke('blobot:snapshot') as Promise<UiSnapshot>,
  earlier: (teamId: string, before: number) =>
    ipcRenderer.invoke('blobot:earlier', teamId, before) as Promise<UiEarlier | undefined>,
  prompt: (agentIds, text, attachmentIds) =>
    ipcRenderer.invoke('blobot:prompt', agentIds, text, attachmentIds) as Promise<void>,
  chooseAttachment: () =>
    ipcRenderer.invoke('blobot:chooseAttachment') as Promise<
      UiAttachment | UiAttachmentRefusal | undefined
    >,
  attachPath: (path) =>
    ipcRenderer.invoke('blobot:attachPath', path) as Promise<UiAttachment | UiAttachmentRefusal>,
  attachBytes: (data, mimeType, name) =>
    ipcRenderer.invoke('blobot:attachBytes', data, mimeType, name) as Promise<
      UiAttachment | UiAttachmentRefusal
    >,
  attachmentUrl: (id) =>
    ipcRenderer.invoke('blobot:attachmentUrl', id) as Promise<string | undefined>,
  pictureUrl: (id) => ipcRenderer.invoke('blobot:pictureUrl', id) as Promise<string | undefined>,
  /**
   * A dropped file's path.
   *
   * `File.path` was removed in Electron 32, and this is the replacement — which lives in the
   * preload because it is the only side that has `webUtils`. It is the whole of what the
   * renderer learns about the filesystem: a path it immediately hands back for main to read.
   */
  pathOf: (file) => {
    const path = webUtils.getPathForFile(file);
    return path === '' ? undefined : path;
  },
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
  prepareWorkspace: (name) =>
    ipcRenderer.invoke('blobot:prepareWorkspace', name) as Promise<
      UiWorkspaceInspection | { error: string }
    >,
  suggestTeamIcon: (path) =>
    ipcRenderer.invoke('blobot:suggestTeamIcon', path) as Promise<UiTeamIcon | undefined>,
  chooseTeamIcon: () =>
    ipcRenderer.invoke('blobot:chooseTeamIcon') as Promise<UiTeamIcon | { error: string } | undefined>,
  setTeamIcon: (teamId, icon) =>
    ipcRenderer.invoke('blobot:setTeamIcon', teamId, icon) as Promise<void>,
  detectRuntimes: () =>
    ipcRenderer.invoke('blobot:detectRuntimes') as Promise<readonly UiRuntimeChoice[]>,
  contextCeilings: () =>
    ipcRenderer.invoke('blobot:contextCeilings') as Promise<readonly UiContextCeiling[]>,
  setContextCeiling: (runtimeId, model, tokens) =>
    ipcRenderer.invoke('blobot:setContextCeiling', runtimeId, model, tokens) as Promise<
      readonly UiContextCeiling[]
    >,
  listAgents: () => ipcRenderer.invoke('blobot:listAgents') as Promise<readonly UiAgentProfile[]>,
  describeRuntimeOptions: (runtimeId: string) =>
    ipcRenderer.invoke('blobot:describeRuntimeOptions', runtimeId) as Promise<UiRuntimeOptions>,
  hireAgent: (spec: NewAgentSpec) =>
    ipcRenderer.invoke('blobot:hireAgent', spec) as Promise<HireResult>,
  editAgent: (profileId: string, spec: NewAgentSpec) =>
    ipcRenderer.invoke('blobot:editAgent', profileId, spec) as Promise<EditAgentResult>,
  retireAgent: (profileId: string) =>
    ipcRenderer.invoke('blobot:retireAgent', profileId) as Promise<void>,
  listRoutines: () => ipcRenderer.invoke('blobot:listRoutines') as Promise<readonly UiRoutine[]>,
  routineTargets: () =>
    ipcRenderer.invoke('blobot:routineTargets') as Promise<readonly UiRoutineTarget[]>,
  saveRoutine: (spec: NewRoutineSpec, routineId?: string) =>
    ipcRenderer.invoke('blobot:saveRoutine', spec, routineId) as Promise<RoutineSaveResult>,
  setRoutineArmed: (routineId: string, armed: boolean) =>
    ipcRenderer.invoke('blobot:setRoutineArmed', routineId, armed) as Promise<void>,
  deleteRoutine: (routineId: string) =>
    ipcRenderer.invoke('blobot:deleteRoutine', routineId) as Promise<void>,
  runRoutineNow: (routineId: string) =>
    ipcRenderer.invoke('blobot:runRoutineNow', routineId) as Promise<{
      ok: boolean;
      error?: string;
    }>,
  routineRuns: (routineId: string) =>
    ipcRenderer.invoke('blobot:routineRuns', routineId) as Promise<readonly UiRoutineRun[]>,
  removeHandbookEntry: (entryId: string) =>
    ipcRenderer.invoke('blobot:removeHandbookEntry', entryId) as Promise<void>,
  /** Start the briefing interview. No text travels: the words are core's, not the renderer's. */
  brief: (agentId: string) => ipcRenderer.invoke('blobot:brief', agentId) as Promise<void>,
  seenRoutineRuns: (agentId: string) =>
    ipcRenderer.invoke('blobot:seenRoutineRuns', agentId) as Promise<void>,
  createTeam: (spec: NewTeamSpec) =>
    ipcRenderer.invoke('blobot:createTeam', spec) as Promise<TeamCreationResult>,
  selectTeam: (teamId: string) =>
    ipcRenderer.invoke('blobot:selectTeam', teamId) as Promise<TeamOpenResult>,
  selectIndividualTeam: (profileId: string, teamId: string) =>
    ipcRenderer.invoke('blobot:selectIndividualTeam', profileId, teamId) as Promise<TeamOpenResult>,
  editTeam: (teamId: string, profileIds: readonly string[], leadProfileId?: string) =>
    ipcRenderer.invoke(
      'blobot:editTeam',
      teamId,
      profileIds,
      leadProfileId,
    ) as Promise<TeamDeletionResult>,
  deleteTeam: (teamId: string, clean?: boolean) =>
    ipcRenderer.invoke('blobot:deleteTeam', teamId, clean === true) as Promise<TeamDeletionResult>,
  teamDiskUsage: (teamId: string) =>
    ipcRenderer.invoke('blobot:teamDiskUsage', teamId) as Promise<UiTeamDiskUsage>,
  workspaceStatus: (teamId, forge) =>
    ipcRenderer.invoke('blobot:workspaceStatus', teamId, forge) as Promise<
      readonly UiWorkspaceStatus[]
    >,
  workspaceTree: (teamId, agentId, paths) =>
    ipcRenderer.invoke('blobot:workspaceTree', teamId, agentId, paths) as Promise<UiWorkspaceTree>,
  openInWorkspace: (teamId, agentId, path) =>
    ipcRenderer.invoke('blobot:openInWorkspace', teamId, agentId, path) as Promise<void>,
  workspaceChanges: (teamId, agentId, repo) =>
    ipcRenderer.invoke('blobot:workspaceChanges', teamId, agentId, repo) as Promise<UiWorkspaceChanges>,
  listBranches: (teamId, agentId) =>
    ipcRenderer.invoke('blobot:listBranches', teamId, agentId) as Promise<UiBranches>,
  switchBranch: (teamId, agentId, branch, options) =>
    ipcRenderer.invoke('blobot:switchBranch', teamId, agentId, branch, options) as Promise<UiSwitchResult>,
  commitPlan: (teamId, agentId, message, selection) =>
    ipcRenderer.invoke('blobot:commitPlan', teamId, agentId, message, selection) as Promise<
      readonly string[]
    >,
  commitWork: (teamId, agentId, message, selection) =>
    ipcRenderer.invoke('blobot:commitWork', teamId, agentId, message, selection) as Promise<UiCommitResult>,
  publishPlan: (teamId, agentId, options) =>
    ipcRenderer.invoke('blobot:publishPlan', teamId, agentId, options) as Promise<readonly string[]>,
  publishBranch: (teamId, agentId, options) =>
    ipcRenderer.invoke('blobot:publishBranch', teamId, agentId, options) as Promise<UiPublishResult>,
  answerPermission: (requestId: string, choice: PermissionChoice) =>
    ipcRenderer.invoke('blobot:answerPermission', requestId, choice) as Promise<void>,
  // The runtime's own login or its vendor's own installer, on a terminal. Two ids go out and
  // keystrokes go out; the command line is core's and is never sent from this side.
  // One named object over the wire, so a bridge older than the window fails as a version skew
  // that says so rather than as three strings that happen to line up one place to the left.
  startRuntimeStep: (stepId: string, runtimeId: string, kind: 'sign_in' | 'install') =>
    ipcRenderer.invoke('blobot:startRuntimeStep', { stepId, runtimeId, kind }) as Promise<{
      ok: boolean;
      error?: string;
    }>,
  openLink: (url: string) => ipcRenderer.invoke('blobot:openLink', url) as Promise<void>,
  sendRuntimeStepInput: (stepId: string, data: string) =>
    ipcRenderer.invoke('blobot:runtimeStepInput', stepId, data) as Promise<void>,
  resizeRuntimeStep: (stepId: string, cols: number, rows: number) =>
    ipcRenderer.invoke('blobot:runtimeStepResize', stepId, cols, rows) as Promise<void>,
  closeRuntimeStep: (stepId: string) =>
    ipcRenderer.invoke('blobot:closeRuntimeStep', stepId) as Promise<void>,
  onRuntimeStepData: (listener) =>
    subscribe('blobot:runtime-step-data', (_e, stepId: string, data: string) =>
      listener(stepId, data),
    ),
  onRuntimeStepExit: (listener) =>
    subscribe('blobot:runtime-step-exit', (_e, outcome: RuntimeStepOutcome) => listener(outcome)),
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
    subscribe(
      'blobot:message',
      (_e, teamId: string, message: Message, routineName: string | undefined) =>
        listener(teamId, message, routineName),
    ),
  onBudget: (listener) =>
    subscribe('blobot:budget', (_e, teamId: string, used: number, budget: number) =>
      listener(teamId, used, budget),
    ),
  onRoutineScheduled: (listener) =>
    subscribe('blobot:routine-scheduled', (_e, teamId: string, scheduled: UiScheduledRoutine) =>
      listener(teamId, scheduled),
    ),
  onHandbookWrite: (listener) =>
    subscribe('blobot:handbook-write', (_e, teamId: string, write: UiHandbookWrite) =>
      listener(teamId, write),
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
  // Dictation. The audio goes out as bytes and nothing else: no device, no path, no file.
  startDictation: (teamId) =>
    ipcRenderer.invoke('dictation:start', teamId) as Promise<UiDictationStart>,
  feedDictation: (pcm) => ipcRenderer.invoke('dictation:feed', pcm) as Promise<'taken' | 'dropped'>,
  markDictation: () => ipcRenderer.send('dictation:mark'),
  stopDictation: () => ipcRenderer.invoke('dictation:stop') as Promise<void>,
  onDictation: (listener) =>
    subscribe('dictation:event', (_e, teamId: string, event: TranscriberEvent) =>
      listener(teamId, event),
    ),
  dictationSettings: () =>
    ipcRenderer.invoke('blobot:dictationSettings') as Promise<UiDictationSettings>,
  setDictation: (patch: DictationPatch) =>
    ipcRenderer.invoke('blobot:setDictation', patch) as Promise<UiDictationSettings>,
  checkSpeechReadiness: () =>
    ipcRenderer.invoke('blobot:checkSpeechReadiness') as Promise<UiDictationSettings>,
  downloadSpeech: (target: UiSpeechTarget) =>
    ipcRenderer.invoke('blobot:downloadSpeech', target) as Promise<UiDictationSettings>,
  cancelSpeechDownload: (target: UiSpeechTarget) =>
    ipcRenderer.invoke('blobot:cancelSpeechDownload', target) as Promise<UiDictationSettings>,
  removeSpeech: (target: UiSpeechTarget) =>
    ipcRenderer.invoke('blobot:removeSpeech', target) as Promise<UiDictationSettings>,
  removeAllSpeech: () => ipcRenderer.invoke('blobot:removeAllSpeech') as Promise<UiDictationSettings>,
  startSpeechTryout: () => ipcRenderer.invoke('dictation:tryout') as Promise<UiDictationStart>,
  onSpeechFile: (listener) =>
    subscribe('dictation:file', (_e, target: UiSpeechTarget, state: UiSpeechFileState) =>
      listener(target, state),
    ),
  onSpeechMeasured: (listener) =>
    subscribe('dictation:measured', (_e, measurement: UiSpeechMeasurement) => listener(measurement)),
  // The key goes out once, to main, which validates it against its provider and keeps it. It
  // never comes back: the section learns a state and a form, never the key.
  saveSpeechKey: (providerId: string, key: string) =>
    ipcRenderer.invoke('blobot:saveSpeechKey', providerId, key) as Promise<
      UiDictationSettings & { readonly rejected?: string }
    >,
  removeSpeechKey: (providerId: string) =>
    ipcRenderer.invoke('blobot:removeSpeechKey', providerId) as Promise<UiDictationSettings>,
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
