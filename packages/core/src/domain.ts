/**
 * blobot's domain: the event vocabulary, the aggregates, the status fold and the roster
 * lookup. Pure TypeScript with no Node dependencies — no store, no runtime, no adapter.
 *
 * It is a separate entry point because the main one pulls in `better-sqlite3` and Drizzle,
 * which have no place in a browser bundle. It is named for what it holds rather than for who
 * imports it: today that is the renderer, but a CLI would want exactly the same subset and
 * would want nothing to do with a UI.
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

export type { Agent, AgentDefinition, AgentProfile, Message, Team } from './orchestrator/domain.js';
export { findAgentByName } from './orchestrator/roster.js';
export { AgentStatusTracker, statusAfter } from './status.js';
export type { TrustLevel } from './trust.js';
export { DEFAULT_TRUST, trustLevelOf } from './trust.js';

export type { AgentStatus } from './status.js';
