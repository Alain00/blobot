export type {
  AgentError,
  AgentEvent,
  AgentEventBase,
  AgentEventType,
  AgentMessageCompleted,
  AgentMessageDelta,
  AgentMessageSent,
  AgentThoughtDelta,
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
export { DEFAULT_TRUST, trustLevelOf } from './trust.js';

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

export type { Agent, AgentDefinition, AgentProfile, Message, Team } from './orchestrator/domain.js';
export { composePersona, composeWakePrompt } from './orchestrator/envelope.js';
export { findAgentByName, namesMentioned } from './orchestrator/roster.js';
export { InMemoryMessageStore } from './orchestrator/message-store.js';
export type { MessageStore } from './orchestrator/message-store.js';
export { Orchestrator } from './orchestrator/orchestrator.js';
export type {
  BudgetExhausted,
  OrchestratorOptions,
  PendingPermission,
  PermissionOutcome,
  SilentHandoff,
  TurnRecorder,
} from './orchestrator/orchestrator.js';

// The Claude Code adapter. Exported from the full entry point only: it spawns a process, so
// it has no business in `@blobot/core/domain`, which the renderer imports.
export { ClaudeAgentRuntime } from './adapters/claude/claude-agent-runtime.js';
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
export { MESSAGE_AGENT_TOOL, PeerMessageServer } from './mcp/peer-message-server.js';
export type {
  PeerMessageEndpoint,
  PeerMessageServerOptions,
} from './mcp/peer-message-server.js';

// Ticket 11: detecting what the user already has. Spawns processes, so not in `/domain`.
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
export type { AgentProfileRecord, AgentRecord, SessionRecord } from './store/sqlite-store.js';
export { SqliteRecorder } from './store/recorder.js';
