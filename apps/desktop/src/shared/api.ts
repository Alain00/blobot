import type {
  AgentEvent,
  AgentStatus,
  MachinePower,
  AttachmentKind,
  AttachmentSupport,
  CompactionSetting,
  Message,
  RoutineOutcome,
  Schedule,
  StopReason,
  TrustLevel,
  VerbosityLevel,
  TranscriberEvent,
  SpeechModelId,
  SpeechReadiness,
} from '@blobot/core/domain';

/**
 * Re-exported so the renderer takes it from here with everything else it is allowed to know.
 * The three words are blobot's own, so this is not the provider vocabulary the UI is barred
 * from: no component learns which runtime is behind them or what either one does with them.
 */
export type { CompactionSetting, TrustLevel, VerbosityLevel };

/**
 * The schedule's three shapes, re-exported for the same reason the trust words are: it is a
 * closed vocabulary of blobot's own, so a form that offers exactly these three is offering what
 * the domain has rather than parsing an expression the renderer invented.
 */
export type { RoutineOutcome, Schedule };

/**
 * A Routine as the screen draws it: the row, and everything on it.
 *
 * Composed in main rather than assembled in the renderer, because the row is one sentence made
 * of four tables — the Routine, its Agent, that Agent's Team, and the last `routine_runs` row.
 * The renderer holds no database handle and this is the shape that keeps it that way.
 */
export interface UiRoutine {
  readonly id: string;
  readonly name: string;
  readonly prompt: string;
  readonly schedule: Schedule;
  /** The schedule in the words it was chosen with. Never an expression, because there is none. */
  readonly scheduleLabel: string;
  /** What the shape costs, as a count of firings. Issue 06's amendment: a count, never a price. */
  readonly frequencyLabel: string;
  readonly armed: boolean;
  /**
   * Who it belongs to: **one agent on one team**, which is the identity an AgentWorkspace's
   * branch is named for. The name and the team are absent when that agent has been taken off a
   * roster — the Routine is kept and disarmed rather than reassigned, because blobot does not
   * decide who a message is for.
   */
  readonly agentId: string;
  readonly agentName?: string;
  readonly agentHue?: number;
  readonly teamName?: string;
  /** When it next comes due. Absent while it is disarmed, because a disarmed Routine has none. */
  readonly nextRunAt?: number;
  /** The last firing. What the screen sorts on, so the overnight runs are at the top by morning. */
  readonly lastRun?: UiRoutineRun;
  /** Firings nobody was there for, since the last one blobot was there for. Absent is none. */
  readonly missedFirings?: number;
  /**
   * The agent that asked for this, when an agent did. **Not who owns it — who asked.**
   *
   * Its presence with `armed: false` and no run behind it is what makes this a *proposal*, which
   * issue 05 made load-bearing: a Routine the user disarmed is a decision they made, and a
   * proposal is a decision they have not made yet.
   */
  readonly proposedByName?: string;
}

/**
 * An agent put itself on a schedule, as the transcript draws it.
 *
 * Issue 05's 2026-08-30 amendment made `propose_routine` arm what it writes, and this block is
 * the second of the four controls that pay for that: **a person is told, where it happened.**
 * blobot still never interrupts; what it refuses is to let this happen off screen.
 */
export interface UiScheduledRoutine {
  readonly routineId: string;
  readonly agentId: string;
  readonly name: string;
  readonly schedule: string;
  readonly frequency: string;
  readonly at: number;
  /** Whether it is still running. The block draws `disarm` only while this is true. */
  readonly armed: boolean;
}

/**
 * An agent wrote to its own Handbook, as the transcript draws it.
 *
 * The disclosure that pays for letting an agent write into its own persona at all: it opens in
 * the turn that did it, carrying removal, so the write is exactly as visible as it is durable.
 *
 * `full` is the refusal, and it is here for a reason none of the others are: the Handbook is
 * full, nothing was recorded, and the fix is a person removing an entry. Every other refusal in
 * `bounds.ts` is the agent's own to act on and stays between blobot and the agent.
 */
export interface UiHandbookWrite {
  readonly id: string;
  readonly agentId: string;
  readonly at: number;
  readonly kind: 'recorded' | 'full';
  /** What was written, with what each entry says **now** and whether it is still there. */
  readonly entries: readonly UiHandbookEntry[];
  /** What the same call withdrew, which is a correction rather than a second act. */
  readonly withdrew: readonly UiHandbookEntry[];
}

export interface UiHandbookEntry {
  readonly id: string;
  /** The number the Handbook draws it under, and the number the agent names to correct it. */
  readonly ordinal: number;
  readonly text: string;
  readonly source: 'told' | 'noticed';
  /**
   * When it was recorded. The panel draws `author · age` and this is the age half; the author
   * half is `source`, which is why an entry carries no third field for it.
   */
  readonly at: number;
  /** Removed since, by the user or withdrawn by the agent. The line stays; the control goes. */
  readonly removed: boolean;
}

/** One firing, as the run history draws it. */
export interface UiRoutineRun {
  readonly id: string;
  readonly firedAt: number;
  readonly outcome: RoutineOutcome;
  readonly reason?: string;
}

/** An agent a Routine can be given to: everyone on every team, since a Routine is per agent. */
export interface UiRoutineTarget {
  readonly agentId: string;
  readonly agentName: string;
  readonly agentHue?: number;
  readonly teamName: string;
}

/** What a person filled in. The whole of a Routine, because saving one restates it. */
export interface NewRoutineSpec {
  readonly agentId: string;
  readonly name: string;
  readonly prompt: string;
  readonly schedule: Schedule;
}

export type RoutineSaveResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly error: string };

/**
 * What the renderer is allowed to know about an agent.
 *
 * Note what is here and what is not: a `runtimeLabel` to print in the conversation header,
 * and no runtime id to branch on. The UI is provider-agnostic, and the renderer never touches
 * the database where `runtime_id` actually lives.
 */
export interface UiAgent {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly runtimeLabel: string;
  /** Execution power, independent of work status and runtime sign-in. */
  readonly machinePower?: MachinePower;
  readonly workspacePath: string;
  readonly branch?: string;
  /** The blobatar's hue, when the user chose one. Absent means the name derives it. */
  readonly hue?: number;
  /**
   * What this agent's runtime takes attached to a prompt.
   *
   * Two booleans in blobot's own vocabulary, so the composer can refuse a file before the user
   * writes the message and still cannot tell which provider is behind them. Both false for an
   * agent whose team has not started: nothing has advertised anything yet.
   */
  readonly accepts: AttachmentSupport;
  /**
   * What blobot knows about where this agent's model stops being worth more context, in tokens.
   *
   * A number somebody established for this model, or **absent**, which is the ordinary case and
   * means nobody has. The renderer turns it into a ceiling against whatever window the runtime
   * reports (`workingCeiling`), falling back conservatively when it is absent — so the pane can
   * draw the mark without ever learning which provider the number came from, and an unmeasured
   * model is drawn honestly rather than not at all. See ticket 09.
   */
  readonly contextCeiling?: number;
}

/**
 * One entry in the composer's slash menu.
 *
 * Curated before it gets here: the adapter offers the workspace's own `.claude/` commands plus
 * the handful blobot vouches for, so nothing on this list can tell the renderer which provider
 * produced it. See ADR-0003 and `adapters/claude/palette.ts`.
 */
export interface UiCommand {
  readonly name: string;
  readonly description: string;
  /** What the command expects after its name, when it takes an argument at all. */
  readonly hint?: string;
}

/**
 * An Attachment as the composer and the transcript draw it.
 *
 * `dataUrl` only for an image, and only when it has been fetched: a snapshot carries the record
 * and never the bytes, so a transcript of two hundred messages is not two hundred images. The
 * pane asks for the picture of the chip it is about to draw.
 */
export interface UiAttachment {
  readonly id: string;
  readonly kind: AttachmentKind;
  readonly mimeType: string;
  /** Absent for a pasted image, which has no filename and is given no invented one. */
  readonly name?: string;
  readonly bytes: number;
}

/** What blobot says when a file will not travel. Said at pickup, never at send. */
export interface UiAttachmentRefusal {
  readonly error: string;
}

export interface UiTeam {
  readonly id: string;
  readonly name: string;
  readonly workspacePath: string;
  /**
   * The team's icon as a `data:` URL, when it has one. A label on the folder its mark already
   * is, never a replacement for it: the faces still say who is on the team, and this says
   * which project they are in.
   */
  readonly icon?: string;
  readonly turnBudget: number;
  /**
   * The team's **lead**: who the team pane addresses when the user names nobody.
   *
   * The composer resolves to this agent the way an agent pane resolves to its own, and an
   * `@mention` still overrides it. Absent is a real state and not a missing value: the team
   * pane then waits for a mention, exactly as ticket 12 specified.
   */
  readonly leadAgentId?: string;
}

/**
 * One member of a team, as a rail row draws it: enough to seed a blobatar, nothing more.
 *
 * Separate from `UiAgent` on purpose. A row for a team that is not the one on screen has no
 * session, no workspace and no runtime to name — but it does have faces, and DESIGN.md seeds a
 * face from the agent's *name*, so the name has to travel with the row.
 */
export interface UiTeamMember {
  readonly id: string;
  /** The agent this membership was instantiated from, so a roster of ticks can find it. */
  readonly profileId?: string;
  readonly name: string;
  /** The blobatar's hue, when the user chose one. Absent means the name derives it. */
  readonly hue?: number;
}

/** A row in the rail's team list. Every team the user has created, running or not. */
export interface UiTeamSummary {
  readonly id: string;
  readonly name: string;
  readonly workspacePath: string;
  /**
   * Which mechanism gave the agents their copies. The renderer never branches on a *provider*;
   * this is a fact about the Workspace, and the delete confirm has to say what happens to the
   * work — a branch that survives if it has commits on it, or a copy blobot will not delete.
   */
  readonly workspaceKind: 'git' | 'plain' | 'nested';
  /**
   * Who is on it. This used to be a count, which is why every team but the one on screen was
   * drawn as an anonymous dashed silhouette: the row had nothing to seed a face with. The
   * count is `members.length` and the mark is the members.
   */
  readonly members: readonly UiTeamMember[];
  /** The team's icon as a `data:` URL, when it has one. Drawn on the folder's front panel. */
  readonly icon?: string;
  /**
   * Who leads it, as a profile id — which is what the roster dialog is a set of ticks on.
   * Absent on a team formed before leads existed, and on one whose lead has left.
   */
  readonly leadProfileId?: string;
  /** When it last said anything. Undefined for a team that has never held a turn. */
  readonly lastActiveAt?: number;
}

/**
 * A window of older transcript, for the `load earlier` control.
 *
 * The same two halves a snapshot carries and nothing else. It is deliberately not a snapshot:
 * a snapshot *replaces* the pane, which is what it is for, and this adds to the top of one.
 */
export interface UiEarlier {
  readonly messages: readonly Message[];
  readonly answers: readonly UiAgentMessage[];
  /** The same run-id-to-name map the snapshot carries, for the window above it. */
  readonly routineOrigins?: Record<string, string>;
  /** Whether anything remains above this window. False is what ends the control. */
  readonly moreAbove: boolean;
}

/** One thing an agent said, as a restored pane draws it. Answers only — never thinking. */
export interface UiAgentMessage {
  readonly id: string;
  readonly agentId: string;
  readonly text: string;
  readonly at: number;
}

/**
 * How full an agent's context is, as the runtime reports it.
 *
 * Occupancy, not billing: `used` and `size` are tokens in this session's window, and `size`
 * differs by runtime, which is why the pane draws both numbers and not only a percentage.
 * `costUsd` is a running total that only one runtime sends and nothing draws yet.
 */
export interface UiUsage {
  readonly used: number;
  readonly size: number;
  readonly costUsd?: number;
}

/**
 * The team's log as it was persisted: finished tool calls and finished turns.
 *
 * The activity column is built from live events, so it emptied on every snapshot while the
 * transcript beside it came back in full. These are the rows that put it back, and they carry
 * what happened rather than the line that was drawn: the pane formats a restored entry through
 * the same code as a live one, so the two cannot drift apart.
 */
export interface UiLog {
  /**
   * Calls that had not finished when the snapshot was read. The transcript draws them as the
   * in-flight lines they are; the activity column ignores them, because a log is of what
   * happened and these have not happened yet.
   */
  readonly running: readonly UiRunningTool[];
  readonly tools: readonly UiToolLog[];
  readonly turns: readonly UiTurnLog[];
  /** Sessions blobot replaced, or decided to keep. Ticket 10. */
  readonly compactions: readonly UiCompaction[];
}

/**
 * One moment blobot chose, as the transcript rebuilds it.
 *
 * The handoff travels in the snapshot rather than being fetched on disclosure, and that is a
 * decision: it is a page of text at most, there are a handful of them in a team's whole history,
 * and a fetch would make the one row a reader opens the one row that can fail to open.
 */
export interface UiCompaction {
  readonly agentId: string;
  readonly at: number;
  readonly how: 'command' | 'handoff' | 'refused';
  readonly used: number;
  readonly ceiling: number;
  readonly measured: boolean;
  /** The fresh session took the agent's standing instructions as they stand now. Ticket 10. */
  readonly personaRefreshed?: boolean;
  readonly handoff?: string;
  readonly handoffPath?: string;
  readonly reason?: string;
}

/** A call the store knows started and has not seen end. */
export interface UiRunningTool {
  readonly toolCallId: string;
  readonly agentId: string;
  readonly startedAt: number;
  readonly title: string;
  readonly kind: string | null;
}

/**
 * A finished call, as both surfaces that draw one need it.
 *
 * The activity column reads it as log, at `at`, which is when the call ended. The transcript
 * rebuilds it as an item at `startedAt`, which is where it stood in the conversation — after the
 * line that introduced it, and before the next one.
 */
export interface UiToolLog {
  readonly toolCallId: string;
  readonly agentId: string;
  /** When it ended, or when it started if it never did. The feed's order. */
  readonly at: number;
  /** When it started. The transcript's order. */
  readonly startedAt: number;
  readonly title: string;
  readonly status: string;
  /** `read` | `edit` | `execute` | `other`, or null for a row written before this was stored. */
  readonly kind: string | null;
  /**
   * Present only where the runtime reported an exit code. Absent and null are different facts:
   * a null is the cancelled call that reported `completed`, and absent is a call that never had
   * an exit code to report. Ticket 08 is the whole reason they are kept apart.
   */
  readonly exit?: number | null;
  /**
   * What an edit changed, in lines. Absent is not zero: a call that changed nothing, a diff too
   * large to measure and a runtime that sends no diff block are all absent, and all three draw
   * nothing.
   */
  readonly changed?: { readonly added: number; readonly removed: number };
}

export interface UiTurnLog {
  readonly turnId: string;
  readonly agentId: string;
  readonly at: number;
  readonly stopReason: StopReason;
}

/**
 * What blobot itself put into an agent's turn, in characters, which is the only unit it can be
 * exact about.
 *
 * Kept apart from `UiUsage` on purpose: the gauge is the runtime's own count of a window blobot
 * does not manage, and this is blobot's own contribution to it. The pane may estimate tokens
 * from these and must say that it is estimating. It must never add them to the gauge.
 */
export interface UiInjection {
  /**
   * What has been attached into this session, cumulatively.
   *
   * Apart from every other figure here, and worded apart on screen, because it is the only one
   * that is not per-turn: an embedded image is in that session's history for the life of the
   * session. Bytes and a count, never tokens — an image's token cost is a function of its
   * pixels and that function belongs to the provider.
   */
  readonly attachmentCount: number;
  readonly attachmentBytes: number;
  /** The cached system prefix this agent's session was opened with. */
  readonly personaChars: number;
  /**
   * How much of that persona is the operator's own standing instructions.
   *
   * The Handbook's own figure is deliberately **not** here, though it belongs to the same
   * breakdown and draws beside this row. It is derived in the renderer from
   * {@link UiSnapshot.handbooks}, so the number in the gauge is provably the sum of the entries
   * the panel lists rather than a second count of them that can drift. See
   * `.scratch/handbooks/issues/05`.
   */
  readonly instructionsChars: number;
  /** The last prompt the orchestrator composed: envelopes, the roster line, the numbering. */
  readonly lastWakeChars: number;
  readonly lastWakeMessages: number;
  /** Mail that has not been delivered yet, and will arrive as the next wake prompt. */
  readonly queued: number;
  /**
   * blobot's own `message_agent` tool definition, which is sent on every turn.
   *
   * The only tool blobot adds. Every other tool in an agent's list came from the runtime or
   * from an MCP server the user configured, and blobot cannot see either: an agent's tool list
   * is not advertised to the client the way its commands are.
   */
  readonly ownToolChars: number;
}

export interface UiSnapshot {
  /** Undefined before the first team exists — the app's genuine empty state. */
  readonly team?: UiTeam;
  readonly teams: readonly UiTeamSummary[];
  readonly agents: readonly UiAgent[];
  /**
   * Every agent on every *live* team, not just the one on screen. Several teams run at once,
   * and the rail draws a status on each of their rows, so a map keyed by team would only be
   * unfolded again on arrival. Agent ids are per membership, so two teams cannot collide.
   *
   * A team the pool is not holding contributes nothing and therefore reads as idle, which is
   * what it is: an unloaded team has nothing in flight.
   */
  readonly statuses: Record<string, AgentStatus>;
  /** Per agent, because each has its own session and two teammates can offer different menus. */
  readonly commands: Record<string, readonly UiCommand[]>;
  /**
   * The last context reading each agent reported, so the gauge survives a relaunch and a team
   * switch. An agent that has never reported is absent, which is not the same as zero.
   */
  readonly usage: Record<string, UiUsage>;
  /** What the activity column showed before this snapshot, from the rows that recorded it. */
  readonly log: UiLog;
  /**
   * Each agent's Handbook, live, keyed by agent id: what it has been told about this team's
   * work, oldest first, removed entries absent.
   *
   * In the snapshot rather than fetched when the panel opens, because three surfaces need it and
   * two of them are drawn before anybody asks for it: the notice card above the composer has to
   * know an agent is unbriefed, and the gauge's handbook row is a sum of exactly these entries.
   * It is small — the whole thing is bounded at 8,000 characters per agent by `HANDBOOK_LIMIT`.
   */
  readonly handbooks: Record<string, readonly UiHandbookEntry[]>;
  /** What blobot put into each agent's turn, for the breakdown under the gauge. */
  readonly injection: Record<string, UiInjection>;
  readonly messages: readonly Message[];
  /** The team's own words, so a restart shows a conversation rather than half of one. */
  readonly answers: readonly UiAgentMessage[];
  /**
   * Whether this team said anything above the window `messages` and `answers` carry.
   *
   * The transcript is bounded now, so a snapshot is the recent end of a conversation rather
   * than the whole of it, and the pane has to say so: a reader who cannot tell the difference
   * between "this is where the team started" and "this is where blobot stopped reading" has
   * been told something false about their own history.
   */
  readonly moreAbove: boolean;
  /** Blocks nobody has answered yet, so a pane rebuilt mid-turn is not missing the question. */
  readonly permissions: readonly UiPermissionRequest[];
  /**
   * Which Routine each firing in this window belongs to, by run id, so the transcript can say
   * `routine · nightly typecheck` above a prompt nobody typed at that hour.
   *
   * A name and not a flag. `messages.routine_run_id` is a **link**, because two screens ask two
   * questions of it — *which Routine* here, and *has that run been seen* in the rail — and a
   * boolean answers neither without a second lookup.
   *
   * Optional because absent and empty say the same thing, which is what a transcript with no
   * Routine in it costs: nothing.
   */
  readonly routineOrigins?: Record<string, string>;
  /**
   * Agents carrying a Routine run the user has not looked at. Issue 11's unread mark.
   *
   * Every agent on every team, not just the one on screen: the mark folds onto the team row the
   * same way `StatusWord` does, and a signal only visible once you are already on the team
   * answers nothing.
   *
   * Optional for the same reason as above: nobody's morning has an empty list in it.
   */
  readonly unread?: readonly string[];
  /**
   * Routines this team's agents scheduled for themselves, within the transcript window.
   *
   * Restored from the rows rather than from an event log, which is what makes the transcript
   * block survive a relaunch and a team switch: the Routine *is* the record, and a block that
   * only existed while the app happened to be watching would be a disclosure you could miss by
   * being on another team.
   */
  readonly scheduled?: readonly UiScheduledRoutine[];
  /**
   * Handbook writes within the transcript window, restored the same way and for the same
   * reason: a disclosure you could miss by having been on another team would not be one.
   *
   * The event says which entries the call touched; the rows say what they say and whether they
   * are still there, so a block never draws a removal control beside something already gone.
   */
  readonly handbook?: readonly UiHandbookWrite[];
  readonly turnsThisPrompt: number;
  /** Named so nobody mistakes the demo for real agents. */
  readonly demoMode: boolean;
  /**
   * Whether the composer draws a microphone (`.scratch/dictation/`, ticket 10). `off` is the
   * switch; `unconfigured` is on with no Transcriber chosen or none installed; `ready` is the
   * only state with a button. The renderer learns a word and never which Transcriber.
   */
  readonly dictation: UiDictationState;
  /**
   * This team is being started and is not answering yet: its workspaces are being reconciled
   * and a process is being spawned per agent, which on a cold start is seconds.
   *
   * Present so the surfaces that would otherwise lie can stop. The roster in this snapshot is
   * read from the database rather than from a running team, so the user watches the agents they
   * are waiting for arrive one at a time; every one of them that is not up yet reads `starting`,
   * which is a status the vocabulary already had and nothing had ever emitted. Sending is closed
   * while it is set, because there is no orchestrator behind these agents to send to.
   */
  readonly opening?: true;
  /**
   * Why the team this launch tried to open did not open, if one did not. Present with `team`
   * undefined and `teams` non-empty, which is the shape the empty state has to tell apart
   * from a genuine first run.
   */
  readonly openError?: string;
}

/**
 * A tool call an agent is blocked on until you answer, as the transcript draws it.
 *
 * Ticket 14 and its 2026-08-29 amendment: three answers, inline in the transcript. Two agents
 * can be waiting at once and a modal would serialise them into whichever arrived first.
 */
export interface UiPermissionRequest {
  readonly id: string;
  readonly agentId: string;
  /** The call this is about. The transcript already has a line for it, and this is that line. */
  readonly toolCallId: string;
  /** What the runtime says it is about to do, in its own words. */
  readonly title: string;
  /** False on a runtime that offers no single-use approval: the block can only reject. */
  readonly canAllow: boolean;
  /**
   * False on a runtime that cannot record a standing rule. On Claude Code the rule lands in
   * `<workspace>/.claude/settings.local.json`, in this one agent's copy of the folder.
   */
  readonly canAllowAlways: boolean;
}

/**
 * How a permission block ends. `cancelled` is nobody answering, which is not a rejection, and
 * `allowed_always` left a rule behind where `allowed` did not.
 */
export type UiPermissionOutcome = 'allowed' | 'allowed_always' | 'rejected' | 'cancelled';

/** The three answers the block offers, named by what they do rather than by a provider's word. */
export type PermissionChoice = 'allow' | 'allow_always' | 'reject';

/** What became of one agent's work when it left a team, or the team was deleted. */
export interface UiAgentRemoval {
  readonly agentName: string;
  /** `unknown` is a workspace blobot could not reach, which is the ordinary reason to delete. */
  readonly work: 'discarded' | 'kept' | 'unknown';
  readonly detail?: string;
}

export interface TeamDeletionResult {
  readonly ok: boolean;
  readonly error?: string;
  /** Said plainly rather than swallowed: a kept branch is work nobody else will mention. */
  readonly removals?: readonly UiAgentRemoval[];
  /** What a full clean recovered, in bytes. Absent unless one was asked for. */
  readonly freedBytes?: number;
}

/**
 * What a full clean of a team would recover, measured now.
 *
 * Bytes rather than a formatted string, so the renderer decides how a size is spoken in the
 * same place it decides everything else a person reads.
 */
/**
 * One agent's workspace as the UI draws it: what is in the worktree, and what GitHub knows.
 *
 * Three states about the pull request, flattened out of core's `ForgeReading` into two optional
 * fields, and the third is both of them absent. `pr` present means there is one; `unavailable`
 * present means blobot could not look and says why; neither means it looked and there is none.
 * *No pull request* and *we could not look* must never draw the same, which is why this is not
 * one nullable field.
 */
export interface UiWorkspaceStatus {
  readonly agentId: string;
  readonly agentName: string;
  readonly kind: 'git' | 'nested' | 'plain';
  /** Absent on a copied workspace. There is no branch to name and none is invented. */
  readonly branch?: string;
  readonly present: boolean;
  readonly changed?: number;
  /**
   * The same uncommitted work in lines, which is the figure a person decides on: *+412 −7* and
   * *+4 −3* are two different afternoons and `3 changed` calls them the same thing. Against
   * `HEAD`, so it is what a commit from here would take, and untracked files count as the
   * additions committing them would make.
   */
  readonly churn?: UiChurn;
  readonly ahead?: number;
  readonly pushed?: boolean;
  readonly pr?: UiPullRequest;
  readonly unavailable?: string;
}

export interface UiPullRequest {
  readonly number: number;
  readonly state: 'open' | 'draft' | 'merged' | 'closed';
  readonly title: string;
  readonly url: string;
}

/**
 * One row in the branch menu under an agent's composer.
 *
 * `heldBy` is why a row cannot be chosen, and it is a name rather than a path: git refuses to
 * check one branch out into two worktrees, and *Bob is standing on it* is the answer to the
 * question the refusal raises. The renderer says the words; main does the mapping, because
 * knowing which directory belongs to which agent is not the renderer's business.
 */
export interface UiBranch {
  readonly name: string;
  readonly current: boolean;
  readonly heldBy?: {
    readonly path: string;
    readonly agentName?: string;
    /** Their own hue, so the row draws that agent's face and not a second one. */
    readonly agentHue?: number;
    readonly isWorkspace?: boolean;
  };
}

export interface UiBranches {
  readonly current?: string;
  readonly branches: readonly UiBranch[];
  /** Said instead of an empty menu: a copy has no branches and never will have any. */
  readonly unavailable?: string;
}

/** What became of a switch. git's own sentence on the way out, never a house phrase. */
export type UiSwitchResult =
  | { readonly ok: true; readonly branch: string }
  | { readonly ok: false; readonly error: string };

export interface UiChurn {
  readonly added: number;
  readonly removed: number;
  readonly files: number;
  /** Too many untracked files to count, so the additions are a floor rather than a total. */
  readonly partial?: boolean;
}

/** What became of a commit. git's own sentence on the way out, `nothing to commit` included. */
export type UiCommitResult =
  | { readonly ok: true; readonly sha: string }
  | { readonly ok: false; readonly error: string };

/** What became of a push and an open. The url is where to send the user next. */
export type UiPublishResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly step: 'push' | 'create'; readonly error: string };

export interface UiTeamDiskUsage {
  readonly bytes: number;
  readonly agents: readonly { readonly agentName: string; readonly bytes: number }[];
}

/**
 * One row in the creation flow's runtime picker.
 *
 * `runtimeId` is an opaque token here: the renderer shows the label, sends the id back, and
 * never branches on either. `readiness` deliberately has no "authenticated" state — every
 * probe answers "is a credential present", so a positive is not proof it works.
 */
export interface UiRuntimeChoice {
  readonly runtimeId: string;
  readonly label: string;
  readonly readiness: 'ready' | 'needs_sign_in' | 'not_installed' | 'unknown';
  /** Whether blobot has an adapter for it yet — about us, not about the user's machine. */
  readonly supported: boolean;
  readonly detail: string;
  readonly version?: string;
  /**
   * What blobot can offer to do about this state, which is at most one thing and is often
   * nothing. A `ready` runtime offers none: a door labelled *sign in* beside a runtime that
   * works reads as blobot doubting the answer it just gave.
   */
  readonly remedies: readonly UiRuntimeRemedy[];
  /**
   * Which trust positions this runtime can actually express, weakest first.
   *
   * Three on most of them and four on the one with a classifier of its own. It rides this row
   * rather than being hardcoded in the picker for the reason everything else here does: the
   * renderer draws the rows it is handed and never learns which provider produced them, so a
   * form that offered `unattended` beside a runtime that has no such thing is impossible to
   * write rather than merely discouraged.
   */
  readonly trustLevels: readonly TrustLevel[];
}

/**
 * One model's working ceiling, as the settings screen lists it.
 *
 * The ceiling is *where a model stops being worth more context* — the denominator the gauge
 * marks and the number compaction fires at a fraction of. It is knowledge somebody has to have
 * established, so this row carries where it came from as plainly as it carries the figure:
 * blobot ships a small table, the user can overrule any line of it, and everything else takes a
 * conservative fallback and says so.
 *
 * `tokens` is absent exactly when `source` is `unmeasured`, because the fallback is a fraction
 * of a window nobody is reporting for a model nobody is running. The renderer says that in
 * words rather than drawing an invented number.
 */
export interface UiContextCeiling {
  readonly runtimeId: string;
  readonly runtimeLabel: string;
  /** Absent means *whatever model the runtime picks for itself*, which is every Codex agent. */
  readonly model?: string;
  readonly tokens?: number;
  readonly source: 'yours' | 'measured' | 'unmeasured';
  /** The hired agents set to this model, by name. Empty for a row blobot ships and nobody uses. */
  readonly used: readonly string[];
}

/**
 * A way out of a readiness state, as the picker offers it.
 *
 * The renderer sends back `runtimeId` and `kind` and nothing else. **The command line itself
 * never travels in this direction**: it is looked up in core's table on the way back, so no
 * string a user could reach becomes part of an argv. `shown` is here to be read, not to be run.
 */
export interface UiRuntimeRemedy {
  readonly kind: 'sign_in' | 'install';
  /** The command in full, as a person reads it. The install confirm shows it before running. */
  readonly shown: string;
  /** One line saying what is about to happen. */
  readonly note: string;
}

/** How a watched remedy ended, and what the machine says about that runtime now. */
export interface RuntimeStepOutcome {
  /** The pane this is about. A pane that has been replaced ignores what it hears. */
  readonly stepId: string;
  readonly runtimeId: string;
  readonly kind: 'sign_in' | 'install';
  readonly exitCode: number;
  /** Detection asked again, after the fact. The only honest way to say whether it worked. */
  readonly runtime?: UiRuntimeChoice;
}

/**
 * What one runtime lets the user choose, as the agent form draws it.
 *
 * Every string here comes off the runtime and is sent back verbatim. The renderer draws the
 * groups it is handed, in the order it is handed them, and knows the meaning of none of
 * them — `effort` is a Claude word, and a component that recognised it would know which
 * provider it was rendering.
 */
export interface UiRuntimeOptions {
  readonly runtimeId: string;
  readonly groups: readonly UiRuntimeOptionGroup[];
  /** Why the runtime could not be asked. Not installed and not signed in both land here. */
  readonly error?: string;
}

export interface UiRuntimeOptionGroup {
  readonly id: string;
  readonly label: string;
  readonly choices: readonly UiRuntimeOptionChoice[];
}

export interface UiRuntimeOptionChoice {
  readonly value: string;
  readonly label: string;
  /** What the runtime does when nothing is chosen, which is what choosing nothing means. */
  readonly isDefault?: boolean;
}

/** One repository inside a Workspace that is not itself one, as the scope picker draws it. */
export interface UiNestedRepo {
  readonly path: string;
  readonly hasCommits: boolean;
  readonly dirty: boolean;
  readonly branch?: string;
}

/**
 * What `inspect()` found at the path the user picked, in the words the flow renders.
 *
 * `kind` decides which mechanism gives the agents their isolated copies — worktrees, a
 * mirrored tree, or plain copies — and the flow says which, because the guarantees differ and
 * a user who is told nothing will assume the strongest.
 */
export interface UiWorkspaceInspection {
  readonly path: string;
  readonly kind: 'git' | 'plain' | 'nested';
  readonly hasCommits: boolean;
  readonly dirty: boolean;
  readonly branch?: string;
  /** Every repository inside a `nested` Workspace. Empty otherwise. */
  readonly repos: readonly UiNestedRepo[];
  /** Whether anything in a `nested` tree belongs to no repository, and so would be copied. */
  readonly looseFiles: boolean;
}

/**
 * An agent the user has hired. It exists on its own: it is not a member of anything until it
 * joins a team, and it can be on several at once.
 */
export interface UiAgentProfile {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  /**
   * An opaque token, exactly as `UiRuntimeChoice.runtimeId` is one: the edit form sends it back
   * so the runtime picker opens on the runtime this agent already has. The renderer never reads
   * it, never compares it to a literal, and never branches on it. The label is the thing to
   * print.
   */
  readonly runtimeId: string;
  /** The label to print. The only one of the two a component may put on screen. */
  readonly runtimeLabel: string;
  readonly instructions?: string;
  /** The blobatar's hue, when the user chose one. Absent means the name derives it. */
  readonly hue?: number;
  /** What it is set to among its runtime's options, so the edit form opens on the truth. */
  readonly runtimeOptions?: Readonly<Record<string, string>>;
  /**
   * How much of its own work blobot vouches for. Absent is `normal`.
   *
   * The one thing on this interface that is neither a provider's word nor a label to print:
   * these three are blobot's own vocabulary, so the renderer is allowed to read them and to
   * write the sentence explaining each. Nothing here knows what either runtime does with it.
   */
  readonly trust?: TrustLevel;
  /**
   * Whether blobot may replace its session when the window fills up. Absent is `auto`.
   *
   * blobot's own vocabulary again, for the same reason and with the same licence: the renderer
   * reads these two words and writes the sentence under each, and learns nothing about which
   * runtime is behind them.
   */
  readonly compaction?: CompactionSetting;
  /**
   * How much it says when it answers. Absent is `normal`.
   *
   * The third of the same three, and the one that reaches no runtime at all: it is composed
   * into the persona, so the renderer naming it says nothing about who is behind it.
   */
  readonly verbosity?: VerbosityLevel;
  /** The teams it is currently on, by name. Empty for an agent nobody has put to work yet. */
  readonly teams: readonly string[];
}

/** Hiring one. `runtimeId` comes straight back from a `UiRuntimeChoice`, unread. */
export interface NewAgentSpec {
  readonly name: string;
  readonly role: string;
  readonly runtimeId: string;
  readonly instructions?: string;
  /** 0 to 359. Omitted when the user kept the face the name gave it. */
  readonly hue?: number;
  /**
   * What the user chose among the options the runtime advertises, keyed by the provider's own
   * group id. An absent key is the runtime's default, and an empty map is a form where the
   * user chose nothing, which is the same thing said by a picker rather than by silence.
   */
  readonly runtimeOptions?: Readonly<Record<string, string>>;
  /** Which of the three the user picked. Absent is `normal`, and is what a form nobody
   *  touched sends, so an agent hired without a thought about this is where it always was. */
  readonly trust?: TrustLevel;
  /** `auto` or `off`. Absent is `auto`, which is on: a form nobody touched leaves it on. */
  readonly compaction?: CompactionSetting;
  /** `brief`, `normal` or `full`. Absent is `normal`, which is what an untouched form sends. */
  readonly verbosity?: VerbosityLevel;
}

export interface NewTeamSpec {
  readonly name: string;
  readonly workspacePath: string;
  readonly turnBudget: number;
  /** Agents that already exist. A team is formed out of them, never the other way round. */
  readonly profileIds: readonly string[];
  /** Which of them leads: the team pane's recipient when the user names nobody. */
  readonly leadProfileId?: string;
  /** `nested` only: the repositories the user ticked. Omitted means every one of them. */
  readonly repoPaths?: readonly string[];
  /** The icon the user accepted or chose, as a `data:` URL. Omitted means faces alone. */
  readonly icon?: string;
}

/**
 * Why a team would not open. A Workspace that has been moved or deleted is the ordinary case,
 * and it has to reach the rail: a click that silently does nothing is the worst version of it.
 */
export interface TeamOpenResult {
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * An icon on offer, and where it came from.
 *
 * `from` is not decoration. An icon that appeared out of nowhere and is subtly wrong is worse
 * than no icon at all, because nothing on screen explains it — so the flow shows the file it
 * found and the user can turn it down.
 */
export interface UiTeamIcon {
  readonly dataUrl: string;
  readonly from: string;
}

/** A refusal a flow renders in place, rather than an exception it throws away. */
export interface TeamCreationResult {
  readonly ok: boolean;
  readonly teamId?: string;
  readonly error?: string;
}

export interface HireResult {
  readonly ok: boolean;
  readonly profileId?: string;
  readonly error?: string;
}

/**
 * What an edit to an agent's definition actually did, so the screen can say it rather than
 * imply it.
 *
 * An edit is not uniform across the teams the agent is on: the role, the standing instructions
 * and the face are restated on every one of them and land at that team's next start, while the
 * name and the runtime stay as they were, because a branch is under the old name and a session
 * belongs to the provider that opened it. ADR-0002 has the reasoning; this is the receipt.
 */
export interface EditAgentResult {
  readonly ok: boolean;
  readonly error?: string;
  /** Teams whose copy of role, instructions and face was restated. */
  readonly restated?: readonly string[];
  /** Teams that keep the former name, because their branch is under it. */
  readonly keepingName?: readonly string[];
  readonly formerName?: string;
  /** The runtime changed, so the next team it joins is the first that runs on it. */
  readonly runtimeChanged?: boolean;
}


/** One downloadable thing's state, for the Settings row: a model or the engine. */
export type UiSpeechFileState =
  | { readonly state: 'absent' }
  | { readonly state: 'downloading'; readonly received: number; readonly total?: number }
  | { readonly state: 'paused'; readonly received: number; readonly total?: number }
  | { readonly state: 'failed'; readonly received: number; readonly error: string }
  | { readonly state: 'installed'; readonly bytes: number }
  | { readonly state: 'unavailable'; readonly reason: string };

export type UiSpeechTarget = SpeechModelId | 'engine';

/** A remote provider, as the section draws it: a name, a retention sentence, and whether a key is held. */
export interface UiSpeechProvider {
  readonly id: string;
  readonly label: string;
  /** The provider's own retention sentence, from core's table (ADR-0005 clause 3). */
  readonly retention: string;
  readonly key:
    | { readonly state: 'none' }
    /** Saved by blobot, and in which form — the honest sentence depends on it. */
    | { readonly state: 'saved'; readonly form: 'encrypted' | 'plain' }
    /** From the environment: named, and not blobot's to remove. */
    | { readonly state: 'environment'; readonly variable: string };
}

/**
 * The Dictation section, whole (ticket 10). Read whole and replaced whole after every action,
 * the way the runtimes list is: there are a handful of rows and each depends on the others.
 */
export interface UiDictationSettings {
  readonly enabled: boolean;
  readonly transcriber: '' | 'local' | 'remote';
  readonly modelId: string;
  readonly providerId: string;
  readonly readiness: {
    /** `''` before the static scan has run. */
    readonly word: '' | SpeechReadiness;
    readonly figure: string;
    readonly reason?: string;
    readonly recommended?: SpeechModelId;
    readonly measuredRtf?: number;
    readonly measuredModelId?: string;
  };
  readonly models: readonly {
    readonly id: SpeechModelId;
    readonly label: string;
    readonly bytes: number;
    readonly state: UiSpeechFileState;
  }[];
  readonly engine: UiSpeechFileState;
  /** What is on disk, priced, for the switch row and *remove all*. */
  readonly footprint: { readonly models: number; readonly engine: boolean; readonly bytes: number };
  readonly providers: readonly UiSpeechProvider[];
  /** The composer's word, derived from all of the above. */
  readonly state: UiDictationState;
}

/** What Settings may change. Everything else is derived. */
export interface DictationPatch {
  readonly enabled?: boolean;
  readonly transcriber?: '' | 'local' | 'remote';
  readonly modelId?: string;
  readonly providerId?: string;
}

/** What *say something* measured: the sentence it heard and how fast, so the row can show both. */
export interface UiSpeechMeasurement {
  readonly text: string;
  readonly rtf: number;
  readonly word: 'fit' | 'slow';
}

/**
 * The place a *say something* recording is started on: not a team. Events for it come back on
 * `onDictation` with this as the team id, and the composer ignores them because it is not the
 * team on screen.
 */
export const SPEECH_TRYOUT_PLACE = 'settings:say-something';

/** The composer's word for dictation. Three states, one of which has a button. */
export type UiDictationState = 'off' | 'unconfigured' | 'ready';

/**
 * What main answers when a recording starts: two capabilities of the Transcriber it chose, and
 * never its name. `partials` says whether a ghost will ever be drawn; `takes` says what to send
 * — whole segments with the silence cut out, or the stream with the silence in it.
 */
export type UiDictationStart =
  | { readonly ok: true; readonly partials: boolean; readonly takes: 'segments' | 'stream' }
  | { readonly ok: false; readonly error: string };

export interface BlobotApi {
  machineIdleAfterMs(): Promise<number>;
  setMachineIdleAfterMs(value: number): Promise<number>;
  snapshot(): Promise<UiSnapshot>;
  /**
   * One thing the user typed, to everybody they addressed with it.
   *
   * A list rather than an id, because `@alice @bob` is one prompt and several messages: a row
   * per named agent, each carrying the user's own words, all sharing one timestamp because they
   * were typed once. It is not a broadcast — blobot never widens a list the user did not type.
   */
  prompt(
    agentIds: readonly string[],
    text: string,
    attachmentIds?: readonly string[],
  ): Promise<void>;
  resumeAfterBudget(): Promise<void>;
  /**
   * Pick a file up: the paperclip's own dialog, a dropped path, or bytes off the clipboard.
   *
   * Three doors and one check. The renderer never reads a file — a path goes to main and main
   * reads it — so the size and the kind are decided before any bytes cross. A paste is the
   * exception by necessity, and takes the same two checks on arrival.
   *
   * Resolves with a refusal rather than throwing one: a file that will not travel is an answer,
   * not a failure, and the composer says it in the field.
   */
  chooseAttachment(): Promise<UiAttachment | UiAttachmentRefusal | undefined>;
  attachPath(path: string): Promise<UiAttachment | UiAttachmentRefusal>;
  attachBytes(
    data: Uint8Array,
    mimeType: string,
    name?: string,
  ): Promise<UiAttachment | UiAttachmentRefusal>;
  /**
   * The picture for one chip, fetched when it is drawn.
   *
   * Never in the snapshot: the transcript carries records, and two hundred messages must not be
   * two hundred images on every re-render. Undefined for a text attachment, which has no
   * picture, and for an id nothing wrote.
   */
  attachmentUrl(id: string): Promise<string | undefined>;
  /**
   * The window of transcript above the one the pane is holding.
   *
   * `before` is the oldest `at` currently on screen. The team id travels because several teams
   * are live and the user can switch while this is in flight: a window that arrived after a
   * switch would prepend one team's history to another's, which is the worst version of being
   * late. Main answers `undefined` when the id is not the open team, and the pane drops it.
   */
  earlier(teamId: string, before: number): Promise<UiEarlier | undefined>;
  /** A dropped file's path, which only the preload can produce. Undefined for a virtual file. */
  pathOf(file: File): string | undefined;
  /** The creation flow. `chooseWorkspace` opens the OS picker; the rest take a path. */
  chooseWorkspace(): Promise<string | undefined>;
  inspectWorkspace(path: string): Promise<UiWorkspaceInspection | { error: string }>;
  initializeWorkspace(path: string): Promise<UiWorkspaceInspection | { error: string }>;
  /**
   * Make this team a folder of its own under `~/blobot`, as a git repository with one commit.
   * The other door out of the first step, for a user with no repository in mind.
   */
  prepareWorkspace(name: string): Promise<UiWorkspaceInspection | { error: string }>;
  /** Whatever image the project at this path already uses for itself, or nothing. */
  suggestTeamIcon(path: string): Promise<UiTeamIcon | undefined>;
  /** The OS file picker, for an icon of the user's own. `undefined` if they cancelled. */
  chooseTeamIcon(): Promise<UiTeamIcon | { error: string } | undefined>;
  /** Give a team an icon or take it off. Changes nothing else and restarts nothing. */
  setTeamIcon(teamId: string, icon: string | undefined): Promise<void>;
  detectRuntimes(): Promise<readonly UiRuntimeChoice[]>;
  /** Every model blobot can be asked about, with its working ceiling and where that came from. */
  contextCeilings(): Promise<readonly UiContextCeiling[]>;
  /**
   * Set one model's working ceiling, or hand it back to blobot with `undefined`.
   *
   * Takes effect on the running teams as well as the next one: a ceiling is a threshold blobot
   * checks after every turn, not a parameter a session was opened with, so unlike the model or
   * the trust level there is no restart to wait for.
   */
  setContextCeiling(
    runtimeId: string,
    model: string | undefined,
    tokens: number | undefined,
  ): Promise<readonly UiContextCeiling[]>;
  /** Every agent the user has hired, with the teams each is currently on. */
  listAgents(): Promise<readonly UiAgentProfile[]>;
  /**
   * What a runtime lets an agent be set to. Asked of the runtime itself, which means starting
   * it: a second or two, a scratch directory, and no model turn.
   */
  describeRuntimeOptions(runtimeId: string): Promise<UiRuntimeOptions>;
  hireAgent(spec: NewAgentSpec): Promise<HireResult>;
  /**
   * Restate an agent's definition. The whole of it, not a patch: this is what the agent is now.
   */
  editAgent(profileId: string, spec: NewAgentSpec): Promise<EditAgentResult>;
  /** Retires the agent. Teams it is on keep working — ending one is a separate decision. */
  retireAgent(profileId: string): Promise<void>;
  /**
   * Every Routine the user has, armed or not, newest run first. Not scoped to a team: the screen
   * is the whole set, and a Routine belongs to an agent rather than to whatever is on screen.
   */
  listRoutines(): Promise<readonly UiRoutine[]>;
  /** Everyone a Routine could be given to. Per agent, because a workspace and a session are. */
  routineTargets(): Promise<readonly UiRoutineTarget[]>;
  /**
   * Create a Routine, or restate one. The whole of it, not a patch, exactly as editing an agent
   * is. A Routine saved here is **disarmed unless it already was armed**: arming is its own act.
   */
  saveRoutine(spec: NewRoutineSpec, routineId?: string): Promise<RoutineSaveResult>;
  /** The only place authority enters a Routine, and the loudest control on its screen. */
  setRoutineArmed(routineId: string, armed: boolean): Promise<void>;
  /** Deleting a Routine, and discarding a proposal, which are the same act on the same row. */
  deleteRoutine(routineId: string): Promise<void>;
  /**
   * Fire it now. Issue 02 made this the whole of the missed-firing remedy, so it is on every
   * row and it is not a debug affordance. Answers when the turn has *started*, never when it ends.
   */
  runRoutineNow(routineId: string): Promise<{ ok: boolean; error?: string }>;
  /** What this Routine has done, newest first. The surface that says whether automation is real. */
  routineRuns(routineId: string): Promise<readonly UiRoutineRun[]>;
  /**
   * Take an entry out of an agent's Handbook.
   *
   * Reachable from the transcript block as well as from the pane, and they are the same act:
   * the whole justification for letting an agent write into its own persona is that you see it
   * happen and can undo it **there**. Sending the user to a panel to act turns a disclosure
   * into a notification. It takes at that team's next start, like every other persona change.
   */
  removeHandbookEntry(entryId: string): Promise<void>;
  /**
   * Start the briefing interview with an agent that has never been told anything.
   *
   * **No text travels.** What goes on the wire is core's `BRIEFING_KNOCK`, looked up on the far
   * side, so the renderer cannot compose a word of what an agent is sent. It never enters the
   * `messages` row either: there is no third party in the room, and the first words in the
   * transcript are the agent's own.
   */
  brief(agentId: string): Promise<void>;
  /** Opening that agent's pane, which is the only thing that clears issue 11's unread mark. */
  seenRoutineRuns(agentId: string): Promise<void>;
  createTeam(spec: NewTeamSpec): Promise<TeamCreationResult>;
  selectTeam(teamId: string): Promise<TeamOpenResult>;
  /**
   * Change who is on a team. The whole roster, not a delta: the screen shows a set of ticks
   * and this is what they say.
   */
  editTeam(
    teamId: string,
    profileIds: readonly string[],
    leadProfileId?: string,
  ): Promise<TeamDeletionResult>;
  /**
   * Removes every agent's workspace, then the team. The transcript stays in the database.
   *
   * `clean` is the **full clean**: every workspace deleted whatever it holds, unmerged branches
   * and copies included. It is the one call in this API that destroys work nothing can give
   * back, so it is never a default and the dialog that sets it has shown the size first.
   */
  deleteTeam(teamId: string, clean?: boolean): Promise<TeamDeletionResult>;
  /** How much disk this team's workspaces are holding, for the delete dialog to price a clean. */
  teamDiskUsage(teamId: string): Promise<UiTeamDiskUsage>;
  /**
   * Every agent's workspace on a team, read now.
   *
   * `forge` is the network and is therefore never implicit: the line draws itself from the git
   * half on arrival and asks GitHub only when the user opens or refreshes it. A backgrounded
   * team makes no request nobody asked for.
   */
  workspaceStatus(teamId: string, forge?: boolean): Promise<readonly UiWorkspaceStatus[]>;
  /**
   * Every branch this agent's worktree could be on, read when the menu opens.
   *
   * Local branches only, so this never touches the network, and it is asked on opening the menu
   * rather than kept current: a list of branches nobody is looking at is not worth a subprocess.
   */
  listBranches(teamId: string, agentId: string): Promise<UiBranches>;
  /**
   * Move this agent's worktree onto a branch, or onto a new one cut from where it stands.
   *
   * The user's own `git switch`. No runtime is told, nothing enters a session, and no agent has
   * a path to it: `git switch` prompts at every trust level and is on no allowlist.
   */
  switchBranch(
    teamId: string,
    agentId: string,
    branch: string,
    options?: { create?: boolean },
  ): Promise<UiSwitchResult>;
  /** The exact commands a commit would run, shown before the user agrees to them. */
  commitPlan(teamId: string, agentId: string, message: string): Promise<readonly string[]>;
  /**
   * Commit what is in this agent's workspace. The user's own git, at the user's own click.
   *
   * No runtime is told, nothing enters a session, and no agent has a path to it: `git commit`
   * prompts at every trust level and is on no allowlist.
   */
  commitWork(teamId: string, agentId: string, message: string): Promise<UiCommitResult>;
  /** The exact commands `publishBranch` would run, for the confirm to show before it does. */
  publishPlan(
    teamId: string,
    agentId: string,
    options?: { readonly title?: string; readonly draft?: boolean },
  ): Promise<readonly string[]>;
  /**
   * Push this agent's branch and open a pull request for it, as the user.
   *
   * Their `gh`, their credential, their click. No agent reaches this and nothing it returns
   * goes back into a session, which is what keeps it outside every permission posture.
   */
  publishBranch(
    teamId: string,
    agentId: string,
    options?: { readonly title?: string; readonly body?: string; readonly draft?: boolean },
  ): Promise<UiPublishResult>;
  /**
   * Answering a permission block. `reject` is a refusal of this call, not a standing rule;
   * `allow_always` is the only one of the three that leaves anything behind.
   */
  answerPermission(requestId: string, choice: PermissionChoice): Promise<void>;
  /**
   * Run a runtime's own sign-in, or its vendor's own installer, on a real terminal the user
   * watches and types into.
   *
   * Only the two ids travel: the argv is core's, looked up on the far side. The keystrokes go
   * straight through, and blobot reads none of them, which is how a login happens here without
   * a credential ever being in this process.
   */
  startRuntimeStep(
    /**
     * The pane's own id, minted where the pane is. It names one visit and carries no authority:
     * the command still comes from core's table. It exists because the pane is a React effect
     * and React runs effects twice in development, so a cleanup and a start are in flight at the
     * same time and only an id can say which session each of them meant.
     */
    stepId: string,
    runtimeId: string,
    kind: 'sign_in' | 'install',
  ): Promise<{ readonly ok: boolean; readonly error?: string }>;
  /**
   * Open a link in the user's own browser. `http` and `https` only, checked on the far side.
   *
   * It exists for the terminal, where a login prints a URL to visit and a person should be able
   * to click it rather than retype it by hand.
   */
  openLink(url: string): Promise<void>;
  /** A keypress in the pane. Never inspected, never logged. */
  sendRuntimeStepInput(stepId: string, data: string): Promise<void>;
  /** The pane measured itself. A terminal that is not told its size wraps its first line. */
  resizeRuntimeStep(stepId: string, cols: number, rows: number): Promise<void>;
  /** The pane closed. Ends that session, and does nothing if another one has since started. */
  closeRuntimeStep(stepId: string): Promise<void>;
  onRuntimeStepData(listener: (stepId: string, data: string) => void): () => void;
  /** It ended, and here is what the machine says about that runtime now. */
  onRuntimeStepExit(listener: (outcome: RuntimeStepOutcome) => void): () => void;
  /**
   * Every stream leads with the team it belongs to.
   *
   * More than one team is live at a time — switching promotes a team rather than restarting
   * it — so a listener that assumes these are all about the team on screen would eventually
   * draw a backgrounded team's words into the open transcript. The renderer keeps the ones it
   * is showing; nothing here decides that for it.
   */
  onEvent(listener: (teamId: string, event: AgentEvent) => void): () => void;
  onStatus(listener: (teamId: string, agentId: string, status: AgentStatus) => void): () => void;
  onCommands(
    listener: (teamId: string, agentId: string, commands: readonly UiCommand[]) => void,
  ): () => void;
  /**
   * A committed message. The third argument is the Routine that caused it, when one did: the
   * origin has to travel with the row, or a briefing that arrives while its pane is open draws
   * as the user speaking at 09:00 when the user was asleep.
   */
  onMessage(
    listener: (teamId: string, message: Message, routineName?: string) => void,
  ) : () => void;
  onBudget(listener: (teamId: string, turnsUsed: number, turnBudget: number) => void): () => void;
  /** An agent put itself on a schedule. It is already running when this arrives. */
  onRoutineScheduled(
    listener: (teamId: string, scheduled: UiScheduledRoutine) => void,
  ): () => void;
  /** An agent wrote to its own Handbook, or was refused because it is full. */
  onHandbookWrite(
    listener: (teamId: string, write: UiHandbookWrite) => void,
  ): () => void;
  onTurns(listener: (teamId: string, turnsThisPrompt: number) => void): () => void;
  /** An agent is blocked on you. Ticket 14's block, drawn where the turn stopped. */
  onPermission(listener: (teamId: string, request: UiPermissionRequest) => void): () => void;
  onPermissionSettled(
    listener: (teamId: string, requestId: string, outcome: UiPermissionOutcome) => void,
  ): () => void;
  /** The active team changed under the renderer: created, switched, or started at launch. */
  onTeamChanged(listener: () => void): () => void;
  /**
   * Dictation (`.scratch/dictation/`). The renderer opens the microphone and sends audio; main
   * holds the Transcriber. One recording at a time, for the team on screen.
   */
  startDictation(teamId: string): Promise<UiDictationStart>;
  /** One 100 ms chunk of 16 kHz mono Int16 PCM. `dropped` is backpressure, shown as `paused`. */
  feedDictation(pcm: Uint8Array): Promise<'taken' | 'dropped'>;
  /** A segment boundary the renderer found in the level. */
  markDictation(): void;
  stopDictation(): Promise<void>;
  onDictation(listener: (teamId: string, event: TranscriberEvent) => void): () => void;
  /** The Dictation section (ticket 10). Every action answers with the whole section again. */
  dictationSettings(): Promise<UiDictationSettings>;
  setDictation(patch: DictationPatch): Promise<UiDictationSettings>;
  /** The static readiness stage, asked again by hand. */
  checkSpeechReadiness(): Promise<UiDictationSettings>;
  downloadSpeech(target: UiSpeechTarget): Promise<UiDictationSettings>;
  cancelSpeechDownload(target: UiSpeechTarget): Promise<UiDictationSettings>;
  removeSpeech(target: UiSpeechTarget): Promise<UiDictationSettings>;
  /** Every model, every part, the engine. Priced first by `footprint`. */
  removeAllSpeech(): Promise<UiDictationSettings>;
  /**
   * *Say something*: a recording against the local Transcriber with no team behind it, whose
   * first committed segment is timed. Audio travels on the same `feedDictation`; the sentence
   * and the figure come back on `onSpeechMeasured`.
   */
  startSpeechTryout(): Promise<UiDictationStart>;
  /** A model or the engine changed state on disk: downloading, installed, gone. */
  onSpeechFile(listener: (target: UiSpeechTarget, state: UiSpeechFileState) => void): () => void;
  onSpeechMeasured(listener: (measurement: UiSpeechMeasurement) => void): () => void;
  /** The key for one provider, pasted. Validated with a zero-spend request before it is kept. */
  saveSpeechKey(providerId: string, key: string): Promise<UiDictationSettings & { readonly rejected?: string }>;
  removeSpeechKey(providerId: string): Promise<UiDictationSettings>;
}

declare global {
  interface Window {
    readonly blobot: BlobotApi;
  }
}
