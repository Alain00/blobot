import type {
  AgentEvent,
  AgentStatus,
  AttachmentKind,
  AttachmentSupport,
  Message,
  StopReason,
  TrustLevel,
} from '@blobot/core/domain';

/**
 * Re-exported so the renderer takes it from here with everything else it is allowed to know.
 * The three words are blobot's own, so this is not the provider vocabulary the UI is barred
 * from: no component learns which runtime is behind them or what either one does with them.
 */
export type { TrustLevel };

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
  /** How much of that persona is the operator's own standing instructions. */
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
  /** What blobot put into each agent's turn, for the breakdown under the gauge. */
  readonly injection: Record<string, UiInjection>;
  readonly messages: readonly Message[];
  /** The team's own words, so a restart shows a conversation rather than half of one. */
  readonly answers: readonly UiAgentMessage[];
  /** Blocks nobody has answered yet, so a pane rebuilt mid-turn is not missing the question. */
  readonly permissions: readonly UiPermissionRequest[];
  readonly turnsThisPrompt: number;
  /** Named so nobody mistakes the demo for real agents. */
  readonly demoMode: boolean;
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

export interface BlobotApi {
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
  onMessage(listener: (teamId: string, message: Message) => void): () => void;
  onBudget(listener: (teamId: string, turnsUsed: number, turnBudget: number) => void): () => void;
  /**
   * An agent named a teammate you named, and wrote to nobody. An observation, never a repair:
   * there is no channel back and no button, because the message she did not send is not ours
   * to compose.
   */
  onSilentHandoff(
    listener: (teamId: string, agentId: string, named: readonly string[], at: number) => void,
  ): () => void;
  onTurns(listener: (teamId: string, turnsThisPrompt: number) => void): () => void;
  /** An agent is blocked on you. Ticket 14's block, drawn where the turn stopped. */
  onPermission(listener: (teamId: string, request: UiPermissionRequest) => void): () => void;
  onPermissionSettled(
    listener: (teamId: string, requestId: string, outcome: UiPermissionOutcome) => void,
  ): () => void;
  /** The active team changed under the renderer: created, switched, or started at launch. */
  onTeamChanged(listener: () => void): () => void;
}

declare global {
  interface Window {
    readonly blobot: BlobotApi;
  }
}
