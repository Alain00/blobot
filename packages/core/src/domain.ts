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

export type {
  Agent,
  AgentDefinition,
  AgentProfile,
  Attachment,
  CompactionSetting,
  Message,
  Team,
} from './orchestrator/domain.js';
export { DEFAULT_COMPACTION } from './orchestrator/domain.js';
export type { AttachmentKind, AttachmentSupport } from './runtime.js';
/**
 * A Picture and the reasons one is not on screen. In the domain entry point because the
 * transcript draws the refusal, and drawing it must not mean importing a store.
 */
export type { PictureNotDrawn, PictureSource } from './pictures.js';
export { PICTURE_LIMIT, pictureNotDrawnBecause } from './pictures.js';
export { findAgentByName } from './orchestrator/roster.js';
export { AgentStatusTracker, statusAfter } from './status.js';
export type { TrustLevel } from './trust.js';
export {
  ATTENDED_TRUST_LEVELS,
  DEFAULT_TRUST,
  TRUST_LEVELS,
  trustLevelOf,
} from './trust.js';
export type { VerbosityLevel } from './verbosity.js';
export { DEFAULT_VERBOSITY, verbosityInstruction, verbosityLevelOf } from './verbosity.js';
/**
 * The arithmetic half of the working ceiling, and only that half. The per-model tables live in
 * the adapters and are not exported here: this entry point is what the renderer imports, and a
 * component that could look a model up would be a component that knows about providers.
 */
export type { WorkingCeiling } from './context-ceiling.js';
export { UNMEASURED_CAP, UNMEASURED_FRACTION, measuredCeiling, unmeasuredCeiling, workingCeiling } from './context-ceiling.js';
/**
 * The fraction of that ceiling at which blobot asks for a handoff. Pure arithmetic, and the
 * renderer draws it: a screen that lets somebody set a ceiling has to say what the number does.
 */
export { COMPACTION_TRIGGER } from './orchestrator/compaction.js';

export type { AgentStatus } from './status.js';

// Handbooks. The renderer draws a Handbook in the agent's pane, so the type is pure and here.
export type { EntrySource, HandbookEntry, HandbookWrite } from './handbook/domain.js';
export { shortDate } from './handbook/persona.js';
/**
 * The whole-Handbook bound, on the same argument as `COMPACTION_TRIGGER`: the panel's foot says
 * `1,240 of 8,000` beside the entries a person would remove, so the screen that carries the only
 * remedy for a full Handbook has to be able to name the limit it is against.
 */
export { HANDBOOK_LIMIT } from './orchestrator/bounds.js';

// Routines. Pure by construction: a schedule is arithmetic on a wall clock and the scheduler
// reads no clock of its own, so the renderer can say *next run* without asking main.
export type { Routine, RoutineOutcome, RoutineRun, Schedule } from './routines/domain.js';
export {
  describeFrequency,
  describeSchedule,
  lastOccurrenceAtOrBefore,
  nextOccurrenceAfter,
  occurrencesBetween,
} from './routines/schedule.js';

// Dictation (`.scratch/dictation/`). The composer draws a Transcriber's events and never learns
// which Transcriber; the vocabulary is pure and here, the implementations are in `speech/` and
// exported from the full entry point only, because they open sockets and spawn a process.
export type {
  SpeechHint,
  Transcriber,
  TranscriberEvent,
  TranscriberFailure,
  TranscriberId,
} from './speech/domain.js';
export { PCM_16K_MONO_INT16, PCM_BYTES_PER_SECOND, describeTranscriberFailure } from './speech/domain.js';
/**
 * The renderer cuts local segments from the level it measures (ticket 06), so the numbers it
 * cuts with are core's and named provisional there, not constants in a component.
 */
export {
  DICTATION_CUT_LOOKBACK_MS,
  DICTATION_PREROLL_MS,
  DICTATION_RECORDING_LIMIT_MS,
  DICTATION_SEGMENT_MAX_MS,
  DICTATION_SEGMENT_MIN_MS,
  DICTATION_SILENCE_MS,
  DICTATION_SILENCE_RMS,
} from './orchestrator/bounds.js';
export type { SpeechModelId } from './speech/catalog.js';
export type { SpeechReadiness } from './speech/readiness.js';
export { describeRtf } from './speech/readiness.js';
export type { MachinePower } from './machines/power.js';
export { DEFAULT_MACHINE_LIMITS, machineLimits } from './machines/resources.js';
export { machinePlacement } from './machines/placement.js';
export type { MachineLimits } from './machines/resources.js';
export type { MachinePlacement } from './machines/placement.js';
export type { DetectionSubject, MachineDetection } from './detect/machine-runtime.js';
