/**
 * The subset of core a renderer may import: types, the status fold, and the roster lookup.
 *
 * It exists because the main entry pulls in `better-sqlite3` and Drizzle, which have no place
 * in a browser bundle — and because the boundary is worth stating rather than discovering. The
 * UI gets vocabulary and pure functions; it gets no store, no runtime, and no adapter.
 */
export type {
  AgentError,
  AgentEvent,
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

export type { Agent, Message, Team } from './orchestrator/domain.js';
export { findAgentByName } from './orchestrator/roster.js';
export { AgentStatusTracker, statusAfter } from './status.js';
export type { AgentStatus } from './status.js';
