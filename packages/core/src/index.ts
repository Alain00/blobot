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

export type {
  AgentRuntime,
  PeerMessageAck,
  PeerMessageCall,
  PeerMessageHandler,
  PermissionHandler,
  PermissionOption,
  PermissionRequest,
  Prompt,
  RuntimeLifecycle,
  Unsubscribe,
} from './runtime.js';

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

export type { Agent, Message, Team } from './orchestrator/domain.js';
export { composePersona, composeWakePrompt } from './orchestrator/envelope.js';
export { findAgentByName } from './orchestrator/roster.js';
export { InMemoryMessageStore } from './orchestrator/message-store.js';
export type { MessageStore } from './orchestrator/message-store.js';
export { Orchestrator } from './orchestrator/orchestrator.js';
export type {
  BudgetExhausted,
  OrchestratorOptions,
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

// Ticket 10: AgentWorkspaces. The git implementation shells out, so it is not in `/domain`.
export { GitWorktreeWorkspaces, defaultWorktreeRoot } from './workspace/git-worktrees.js';
export { WorkspaceError, branchNameFor, refSlug } from './workspace/workspace.js';
export type {
  AgentWorkspace,
  ProvisionRequest,
  ReconcileOutcome,
  RemovalOutcome,
  WorkspaceInspection,
  WorkspaceProvider,
} from './workspace/workspace.js';

// Ticket 15: blobot's own MCP server, over loopback HTTP. Not in `/domain` — it binds a port.
export { PeerMessageServer } from './mcp/peer-message-server.js';
export type {
  PeerMessageEndpoint,
  PeerMessageServerOptions,
} from './mcp/peer-message-server.js';

export { openDatabase } from './store/database.js';
export type { BlobotDatabase, OpenDatabaseOptions, OpenedDatabase } from './store/database.js';
export { SqliteStore } from './store/sqlite-store.js';
export type { AgentRecord, SessionRecord } from './store/sqlite-store.js';
export { SqliteRecorder } from './store/recorder.js';
