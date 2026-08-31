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
  StopReason,
  ToolCallStarted,
  ToolCallStatus,
  ToolCallUpdated,
  ToolKind,
  TurnEnded,
  UsageUpdated,
} from './events.js';

export { sameCommands } from './commands.js';

export type {
  AgentRuntime,
  AvailableCommand,
  PeerMessageAck,
  PeerMessageCall,
  PeerMessageHandler,
  PermissionHandler,
  PermissionOption,
  PermissionRequest,
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
export { Scenario, scenario } from './mock/scenario.js';
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
export { ClaudeAgentRuntime } from './adapters/claude/claude-agent-runtime.js';
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

export { detectRuntimes, parseOpencodeAuthList, parseVersion, stripAnsi } from './detect/runtimes.js';
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
  SessionRecord,
} from './store/sqlite-store.js';
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
