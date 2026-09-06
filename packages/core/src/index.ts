export type {
  AgentError,
  AgentEvent,
  AgentEventBase,
  AgentEventType,
  AgentMessageCompleted,
  AgentMessageDelta,
  AgentMessageSent,
  AgentThoughtDelta,
  ContextCompacted,
  PictureArrived,
  StopReason,
  ToolCallStarted,
  ToolCallStatus,
  ToolCallUpdated,
  ToolKind,
  TurnEnded,
  UsageUpdated,
} from './events.js';

export { sameCommands } from './commands.js';
export { LocalMachine } from './machines/local-machine.js';
export { PersonalDirectories, PERSONAL_DIRECTORY_ENV } from './personal/personal-directory.js';
export type { PersonalDirectory, PersonalDirectoryReference } from './personal/personal-directory.js';
export { SleepingRuntime } from './machines/sleeping-runtime.js';
export type { SleepingRuntimeOptions } from './machines/sleeping-runtime.js';
export { DEFAULT_MACHINE_IDLE_MS, machineIdleMs } from './machines/power.js';
export type { MachinePower } from './machines/power.js';
export { DEFAULT_MACHINE_LIMITS, machineLimits } from './machines/resources.js';
export type { MachineLimits } from './machines/resources.js';
export { machinePlacement } from './machines/placement.js';
export type { MachinePlacement, StoredMachinePlacement } from './machines/placement.js';
export { machineFor } from './machines/machine-for.js';
export { MachineUnavailableError } from './machines/machine.js';
export { SbxImageStore, verifyRuntimeImageArchive } from './machines/sbx/image-store.js';
export { SbxEngine, sbxCommandRunner } from './machines/sbx/engine.js';
export { SbxInstaller, SBX_INSTALL_VERSION, sbxHostArtifact, sbxKvmAvailable } from './machines/sbx/installation.js';
export type { SbxInstallation } from './machines/sbx/installation.js';
export { sbxClientEnvironment } from './machines/sbx/client-environment.js';
export type { SbxPtyRunner } from './machines/sbx/engine.js';
export { SbxRegistry } from './machines/sbx/registry.js';
export type { SbxRecord } from './machines/sbx/registry.js';
export { OwnedSbxMachine } from './machines/sbx/owned-machine.js';
export { SBX_INITIAL_STORAGE, sbxKitMismatch } from './machines/sbx/kit.js';
export { runtimeImageBuild } from './machines/runtime-image.js';
export type { RuntimeImageBuild, RuntimeImageDefinition } from './machines/runtime-image.js';
export type {
  Machine, MachineKind, MachineCommand, MachineIdentity, MachineLocation, MachineReadiness,
  MachineReconcileOutcome, MachineRuntimeRequirements, MachineRuntimeAccess, MachineSpawnRequest, MachineStartRequest,
  MachineTransport,
} from './machines/machine.js';

/** A Picture, and every way one fails to be on screen. `.scratch/agent-media/`. */
export type { PictureNotDrawn, PictureSource, PictureMeasurement } from './pictures.js';
export { PICTURE_LIMIT, measurePicture, pictureNotDrawnBecause } from './pictures.js';

export type {
  AgentRuntime,
  AvailableCommand,
  KeptPicture,
  PeerMessageAck,
  PeerMessageCall,
  PeerMessageHandler,
  PermissionHandler,
  PermissionOption,
  PermissionRequest,
  PictureContent,
  PictureKept,
  PictureStore,
  Prompt,
  RuntimeLifecycle,
  RuntimeOptionChoices,
  RuntimeOptionGroup,
  RuntimeOptionChoice,
  Unsubscribe,
} from './runtime.js';

export type { TrustLevel } from './trust.js';
export {
  ATTENDED_TRUST_LEVELS,
  DEFAULT_TRUST,
  TRUST_LEVELS,
  trustLevelOf,
} from './trust.js';
export type { VerbosityLevel } from './verbosity.js';
export { DEFAULT_VERBOSITY, verbosityInstruction, verbosityLevelOf } from './verbosity.js';
export type { WorkingCeiling } from './context-ceiling.js';
export {
  UNMEASURED_CAP,
  UNMEASURED_FRACTION,
  ceilingFromTable,
  measuredCeiling,
  unmeasuredCeiling,
} from './context-ceiling.js';
export { CLAUDE_CEILINGS, claudeCeiling } from './adapters/claude/context.js';
export { OPENCODE_CEILINGS, opencodeCeiling } from './adapters/opencode/context.js';
export { CODEX_CEILINGS, codexCeiling } from './adapters/codex/context.js';
export { workingCeiling } from './context-ceiling.js';

export type { Clock } from './clock.js';
export { SystemClock, VirtualClock } from './clock.js';

export { assembleMessages, MessageAssembler } from './message-assembler.js';

export { AgentStatusTracker, statusAfter } from './status.js';
export type { AgentStatus, StatusListener } from './status.js';

export { AsyncQueue } from './mock/async-queue.js';
export { raggedFragments } from './mock/ragged.js';
export type { Fragment } from './mock/ragged.js';
export { Scenario, scenario, tool } from './mock/scenario.js';
export type {
  CallToolOptions,
  ScenarioStep,
  TextOptions,
  ToolOutcome,
  ToolStep,
} from './mock/scenario.js';
export { MockAgentRuntime } from './mock/mock-agent-runtime.js';
export type {
  InjectableEvent,
  MockAgentRuntimeOptions,
  ScenarioScript,
} from './mock/mock-agent-runtime.js';
export { scenarios } from './mock/scenarios/index.js';
export type { ScenarioName } from './mock/scenarios/index.js';

export { uuidv7 } from './ids.js';
export type { IdFactory } from './ids.js';

export type {
  Agent,
  AgentDefinition,
  AgentProfile,
  Attachment,
  AttachmentContent,
  CompactionSetting,
  Message,
  Team,
} from './orchestrator/domain.js';
export { DEFAULT_COMPACTION } from './orchestrator/domain.js';
// Ticket 10: the moment blobot is allowed to choose, and what it asks for when it does.
export {
  COMPACTION_TRIGGER,
  HANDOFF_EMPTY,
  HANDOFF_LIMIT,
  HANDOFF_PROMPT,
  HANDOFF_STOPPED,
  RESTART_FAILED,
  handoffTooLong,
  overCompactionThreshold,
  resumeFromHandoff,
} from './orchestrator/compaction.js';
export type { HandoffArchive, HandoffRecord } from './orchestrator/compaction.js';
export {
  HANDBOOK_ENTRY_LIMIT,
  HANDBOOK_LIMIT,
  IMAGE_ATTACHMENT_LIMIT,
  ROUTINE_NAME_LIMIT,
  ROUTINE_PROPOSALS_PER_TURN,
  ROUTINE_PROPOSALS_STANDING,
  ROUTINE_BUSY_CEILING_MS,
  ROUTINE_DISARM_AFTER,
  ROUTINE_PERMISSION_CEILING_MS,
  ROUTINE_TURN_BUDGET,
  TEXT_ATTACHMENT_LIMIT,
  attachmentNotSupported,
  attachmentTooLarge,
  formatSize,
} from './orchestrator/bounds.js';
export { composeLeadBrief, composePersona, composeWakePrompt } from './orchestrator/envelope.js';
export type { TeammateView } from './orchestrator/envelope.js';
export { findAgentByName, namesMentioned } from './orchestrator/roster.js';
export { InMemoryMessageStore } from './orchestrator/message-store.js';
export type { AttachmentStore, MessageStore } from './orchestrator/message-store.js';
export { Orchestrator } from './orchestrator/orchestrator.js';
export type { ProfileOverview, ProfileOverviewSource } from './orchestrator/profile-overview.js';
export type { RoutineStore, RoutineTurn } from './orchestrator/orchestrator.js';
export type {
  BudgetExhausted,
  Compacted,
  OrchestratorOptions,
  PendingPermission,
  PermissionOutcome,
  SilentHandoff,
  TurnRecorder,
} from './orchestrator/orchestrator.js';

// The Claude Code adapter. Exported from the full entry point only: it spawns a process, so
// it has no business in `@blobot/core/domain`, which the renderer imports.
export { MachineLogin } from './adapters/login.js';
export type { RuntimeLogin, RuntimeLoginMethod, RuntimeLoginSpec, LoginChallenge } from './adapters/login.js';
export { openLoginCallbackRelay } from './adapters/login-callback.js';

export { ClaudeAgentRuntime } from './adapters/claude/claude-agent-runtime.js';
export { CLAUDE_MACHINE_IMAGE } from './adapters/claude/image.js';
export { CLAUDE_LOGIN } from './adapters/claude/login.js';
export { CLAUDE_LOCAL_PROTECTION } from './adapters/claude/sandbox.js';
export { CURSOR_LOCAL_PROTECTION } from './adapters/cursor/permissions.js';
export { CODEX_LOCAL_PROTECTION } from './adapters/codex/permissions.js';
export { FX_LOCAL_PROTECTION } from './adapters/fx/permissions.js';
export { OPENCODE_LOCAL_PROTECTION } from './adapters/opencode/config.js';
export {
  CLAUDE_POSTURE_MODE,
  CLAUDE_TRUST_LEVELS,
  claudeModeFor,
  refusedTools,
} from './adapters/claude/permissions.js';
export type { ClaudeMode } from './adapters/claude/permissions.js';
export type {
  ClaudeAgentRuntimeOptions,
  McpHttpServer,
  McpServerConfig,
  McpStdioServer,
} from './adapters/claude/claude-agent-runtime.js';
export {
  BRIDGE_PACKAGE,
  BRIDGE_VERSION,
  resolveClaudeExecutable,
} from './adapters/claude/stdio-bridge.js';

// The OpenCode adapter. Same reason it is not in `/domain`: it spawns `opencode acp`.
export { OpencodeAgentRuntime } from './adapters/opencode/opencode-agent-runtime.js';
export { OPENCODE_MACHINE_IMAGE } from './adapters/opencode/image.js';
export { OPENCODE_LOGIN } from './adapters/opencode/login.js';
export type { OpencodeAgentRuntimeOptions } from './adapters/opencode/opencode-agent-runtime.js';
export { agentKeyFor, opencodeConfigContent, permissionPosture } from './adapters/opencode/config.js';
export {
  resolveOpencodeExecutable,
  VERIFIED_OPENCODE_VERSION,
} from './adapters/opencode/stdio.js';

// Ticket 10: AgentWorkspaces. The git implementation shells out, so it is not in `/domain`.
export { GitWorktreeWorkspaces, defaultWorktreeRoot } from './workspace/git-worktrees.js';
// The amendment's other two kinds of Workspace: a folder git cannot hold, and a folder of
// repositories. `workspaceProviderFor` is how a caller picks one without knowing the classes.
export { CopiedDirectoryWorkspaces, defaultCopyRoot } from './workspace/copied-directory.js';
export { NestedRepoWorkspaces, defaultTreeRoot } from './workspace/nested-repos.js';
export { inspectWorkspace } from './workspace/inspect.js';
export { prepareWorkspace } from './workspace/prepare.js';
export { findWorkspaceIcon, type WorkspaceIcon } from './workspace/icon.js';
export { workspaceProviderFor } from './workspace/provider-for.js';
export { agentGitEnvironment } from './workspace/git-identity.js';
export { boxWorkspaceMounts, type BoxWorkspaceMounts } from './workspace/box-mounts.js';
// What a full clean would recover. The words for a size are the renderer's, not core's.
export { directorySize } from './workspace/size.js';
export {
  readAgentWorkspaceStatus,
  readPullRequest,
  spawnCommand,
  type AgentWorkspaceStatus,
  type ForgeReading,
  type PullRequest,
  type PullRequestState,
} from './workspace/status.js';
export {
  currentBranch,
  listBranches,
  switchBranch,
  type Branch,
  type BranchListing,
  type SwitchOutcome,
} from './workspace/branches.js';
export { readChurn, type Churn } from './workspace/churn.js';
export {
  readChanges,
  type ChangedFile,
  type WorkspaceChanges,
} from './workspace/changes.js';
export {
  readWorkspaceTree,
  type DirectoryReading,
  type TreeEntry,
  type TreeMark,
  type WorkspaceTree,
} from './workspace/tree.js';
export {
  commitPlan,
  commitWorktree,
  type CommitOutcome,
  type CommitRequest,
} from './workspace/commit.js';
export { publishBranch, publishPlan, type PublishOutcome, type PublishRequest } from './workspace/publish.js';
export { WorkspaceError, branchNameFor, refSlug } from './workspace/workspace.js';
export type {
  AgentWorkspace,
  NestedRepo,
  ProvisionRequest,
  ReconcileOutcome,
  RemovalOutcome,
  WorkspaceInspection,
  WorkspaceProvider,
} from './workspace/workspace.js';

// Ticket 15: blobot's own MCP server, over loopback HTTP. Not in `/domain` — it binds a port.
export {
  MESSAGE_AGENT_TOOL,
  PROPOSE_ROUTINE_TOOL,
  RECORD_ENTRY_TOOL,
  PeerMessageServer,
} from './mcp/peer-message-server.js';
export type {
  PeerMessageEndpoint,
  PeerMessageServerOptions,
} from './mcp/peer-message-server.js';

// Ticket 11: detecting what the user already has. Spawns processes, so not in `/domain`.
// The Codex adapter. Same reason again: it spawns a pinned npm bridge over stdio.
export { CodexAgentRuntime } from './adapters/codex/codex-agent-runtime.js';
export { CODEX_MACHINE_IMAGE } from './adapters/codex/image.js';
export { CODEX_LOGIN } from './adapters/codex/login.js';
export type { CodexAgentRuntimeOptions } from './adapters/codex/codex-agent-runtime.js';
export {
  CODEX_EXPRESSES_TRUST,
  CODEX_POSTURE_MODE,
  codexModeFor,
} from './adapters/codex/permissions.js';
export {
  CODEX_BRIDGE_VERSION,
  resolveCodexExecutable,
  spawnCodexBridge,
} from './adapters/codex/stdio-bridge.js';

// The fx adapter. Same reason again, minus the bridge: `fx acp` is the user's own binary.
export { FxAgentRuntime } from './adapters/fx/fx-agent-runtime.js';
export { FX_MACHINE_IMAGE } from './adapters/fx/image.js';
export { FX_LOGIN } from './adapters/fx/login.js';
export type { FxAgentRuntimeOptions } from './adapters/fx/fx-agent-runtime.js';
export {
  FX_EXPRESSES_TRUST,
  FX_MODE_ASK,
  FX_MODE_CODE,
  FX_PERMISSION_MODE_ENV,
  fxModeFor,
} from './adapters/fx/permissions.js';
export { fxPersonaBlocks } from './adapters/fx/persona.js';
export { resolveFxExecutable, spawnFx, VERIFIED_FX_VERSION } from './adapters/fx/stdio.js';

// The Cursor adapter. First-party ACP again: `cursor-agent acp` is the user's own binary.
export { CursorAgentRuntime } from './adapters/cursor/cursor-agent-runtime.js';
export { CURSOR_MACHINE_IMAGE } from './adapters/cursor/image.js';
export { CURSOR_LOGIN } from './adapters/cursor/login.js';
export type { CursorAgentRuntimeOptions } from './adapters/cursor/cursor-agent-runtime.js';
export {
  CURSOR_APPROVAL_MODE,
  CURSOR_SESSION_MODE,
  CURSOR_TRUST_LEVELS,
  cursorCliConfig,
} from './adapters/cursor/permissions.js';
export { cursorPersonaBlocks } from './adapters/cursor/persona.js';
export { defaultCursorConfigDir, writeCursorConfig } from './adapters/cursor/config.js';
export {
  resolveCursorExecutable,
  spawnCursor,
  VERIFIED_CURSOR_VERSION,
} from './adapters/cursor/stdio.js';

export { detectRuntimes, parseCursorStatus, parseOpencodeAuthList, parseVersion, stripAnsi } from './detect/runtimes.js';
export { detectAgentRuntime, engineDetection } from './detect/machine-runtime.js';
export type { DetectionSubject, MachineDetection, AgentProbeAccess } from './detect/machine-runtime.js';
export type {
  CommandResult,
  CommandRunner,
  DetectOptions,
  RuntimeDetection,
  RuntimeReadiness,
} from './detect/runtimes.js';
// The way out of a state detection reports: the runtime's own login, the vendor's own installer.
export { remediesFor, remedyFor } from './detect/remedies.js';
export type { RemedyKind, RuntimeRemedy } from './detect/remedies.js';

export { openDatabase } from './store/database.js';
export type { BlobotDatabase, OpenDatabaseOptions, OpenedDatabase } from './store/database.js';
export { SqliteStore } from './store/sqlite-store.js';
export type {
  AgentProfileRecord,
  AgentRecord,
  ContextCeilingRecord,
  DictationRecord,
  SessionRecord,
} from './store/sqlite-store.js';
export { DEFAULT_DICTATION } from './store/sqlite-store.js';
export { SqliteRecorder } from './store/recorder.js';

// Handbooks: what an Agent knows about this team's work. See `.scratch/handbooks/`.
export type {
  EntrySource,
  HandbookEntry,
  HandbookWrite,
  NewHandbookEntry,
} from './handbook/domain.js';
export { composeHandbookBlock, shortDate } from './handbook/persona.js';
export type { HandbookStore } from './orchestrator/orchestrator.js';

// Ticket 09's Routines. The scheduler decides only what is due; main owns the timer, the window
// check and the calling, exactly as main owns the pool and core owns the wake policy.
export type { Routine, RoutineOutcome, RoutineRun, Schedule } from './routines/domain.js';
export {
  describeFrequency,
  describeSchedule,
  lastOccurrenceAtOrBefore,
  nextOccurrenceAfter,
  occurrencesBetween,
} from './routines/schedule.js';
export { FIRING_TOLERANCE_MS, Scheduler } from './routines/scheduler.js';
export { checkProposalText, parseProposedSchedule } from './routines/proposal.js';
export type { Due } from './routines/scheduler.js';

// Dictation (`.scratch/dictation/`): the Transcriber vocabulary, the mock that plays the ugly
// cases, the recording ceiling and the hint. Engines and providers arrive beside them.
export type {
  SpeechHint,
  Transcriber,
  TranscriberEvent,
  TranscriberFailure,
  TranscriberId,
} from './speech/domain.js';
export { PCM_16K_MONO_INT16, PCM_BYTES_PER_SECOND, describeTranscriberFailure } from './speech/domain.js';
export { composeSpeechHint, identifiersIn } from './speech/hint.js';
export { withRecordingCeiling } from './speech/ceiling.js';
export { MockTranscriber, speechScenarios } from './speech/mock-transcriber.js';
export type {
  MockTranscriberOptions,
  SpeechScenario,
  SpeechScenarioName,
  SpeechStep,
} from './speech/mock-transcriber.js';
export {
  DICTATION_RECORDING_LIMIT_MS,
  SPEECH_DISK_MARGIN,
  SPEECH_FIT_RTF,
  SPEECH_HINT_CHARS,
  SPEECH_HINT_TERMS,
  SPEECH_RAM_FLOORS_GB,
} from './orchestrator/bounds.js';
export {
  ENGINE_BUILDS,
  SPEECH_MODELS,
  WHISPER_RELEASE_TAG,
  WHISPER_SOURCE_TAG,
  engineBuildFor,
  speechModel,
} from './speech/catalog.js';
export type { EngineBuild, SpeechModel, SpeechModelId } from './speech/catalog.js';
export { describeRtf, measuredReadiness, staticReadiness } from './speech/readiness.js';
export type { MachineFacts, SpeechReadiness, StaticReadiness } from './speech/readiness.js';
export { CHECKSUM_MISMATCH, downloadVerified } from './speech/download.js';
export type { DownloadOutcome, DownloadRequest } from './speech/download.js';
export { WhisperTranscriber, parseTranscription, wavHeader } from './speech/whisper.js';
export type { WhisperTranscriberOptions } from './speech/whisper.js';
export { SPEECH_PROVIDERS, authorizationFor, speechProvider, validateSpeechKey } from './speech/providers.js';
export type { KeyValidation, SpeechProviderId, SpeechProviderSpec } from './speech/providers.js';
export { BLOBOT_KEY_VARIABLE, childEnvironment } from './process/child-env.js';
export { OPENAI_LIVE_MODEL, OPENAI_REALTIME_URL, OpenAiTranscriber, localeLanguage } from './speech/openai.js';
export type { OpenAiTranscriberOptions } from './speech/openai.js';
export { DEEPGRAM_LISTEN_URL, DeepgramTranscriber, deepgramQuery } from './speech/deepgram.js';
export type { DeepgramTranscriberOptions } from './speech/deepgram.js';
export { MISTRAL_MODEL, MISTRAL_TRANSCRIPTIONS_URL, MistralTranscriber } from './speech/mistral.js';
export type { MistralTranscriberOptions } from './speech/mistral.js';
export { nodeSocket, resample16to24 } from './speech/socket.js';
export type { SocketFactory, SocketLike } from './speech/socket.js';
