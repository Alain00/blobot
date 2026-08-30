import type { AgentEvent, AgentStatus, Message } from '@blobot/core/domain';

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
}

export interface UiTeam {
  readonly id: string;
  readonly name: string;
  readonly workspacePath: string;
  readonly turnBudget: number;
}

/** A row in the rail's team list. Every team the user has created, running or not. */
export interface UiTeamSummary {
  readonly id: string;
  readonly name: string;
  readonly workspacePath: string;
  readonly agentCount: number;
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

export interface UiSnapshot {
  /** Undefined before the first team exists — the app's genuine empty state. */
  readonly team?: UiTeam;
  readonly teams: readonly UiTeamSummary[];
  readonly agents: readonly UiAgent[];
  readonly statuses: Record<string, AgentStatus>;
  readonly messages: readonly Message[];
  /** The team's own words, so a restart shows a conversation rather than half of one. */
  readonly answers: readonly UiAgentMessage[];
  readonly turnsThisPrompt: number;
  /** Named so nobody mistakes the demo for real agents. */
  readonly demoMode: boolean;
  /**
   * Why the team this launch tried to open did not open, if one did not. Present with `team`
   * undefined and `teams` non-empty, which is the shape the empty state has to tell apart
   * from a genuine first run.
   */
  readonly openError?: string;
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
  /** A label to print. There is no runtime id here for the same reason there is none on
   *  `UiAgent`: the renderer would eventually branch on it. */
  readonly runtimeLabel: string;
  readonly instructions?: string;
  /** The blobatar's hue, when the user chose one. Absent means the name derives it. */
  readonly hue?: number;
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
}

export interface NewTeamSpec {
  readonly name: string;
  readonly workspacePath: string;
  readonly turnBudget: number;
  /** Agents that already exist. A team is formed out of them, never the other way round. */
  readonly profileIds: readonly string[];
  /** `nested` only: the repositories the user ticked. Omitted means every one of them. */
  readonly repoPaths?: readonly string[];
}

/**
 * Why a team would not open. A Workspace that has been moved or deleted is the ordinary case,
 * and it has to reach the rail: a click that silently does nothing is the worst version of it.
 */
export interface TeamOpenResult {
  readonly ok: boolean;
  readonly error?: string;
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

export interface BlobotApi {
  snapshot(): Promise<UiSnapshot>;
  prompt(agentId: string, text: string): Promise<void>;
  resumeAfterBudget(): Promise<void>;
  /** The creation flow. `chooseWorkspace` opens the OS picker; the rest take a path. */
  chooseWorkspace(): Promise<string | undefined>;
  inspectWorkspace(path: string): Promise<UiWorkspaceInspection | { error: string }>;
  initializeWorkspace(path: string): Promise<UiWorkspaceInspection | { error: string }>;
  detectRuntimes(): Promise<readonly UiRuntimeChoice[]>;
  /** Every agent the user has hired, with the teams each is currently on. */
  listAgents(): Promise<readonly UiAgentProfile[]>;
  hireAgent(spec: NewAgentSpec): Promise<HireResult>;
  /** Retires the agent. Teams it is on keep working — ending one is a separate decision. */
  retireAgent(profileId: string): Promise<void>;
  createTeam(spec: NewTeamSpec): Promise<TeamCreationResult>;
  selectTeam(teamId: string): Promise<TeamOpenResult>;
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
  onMessage(listener: (teamId: string, message: Message) => void): () => void;
  onBudget(listener: (teamId: string, turnsUsed: number, turnBudget: number) => void): () => void;
  onTurns(listener: (teamId: string, turnsThisPrompt: number) => void): () => void;
  /** The active team changed under the renderer: created, switched, or started at launch. */
  onTeamChanged(listener: () => void): () => void;
}

declare global {
  interface Window {
    readonly blobot: BlobotApi;
  }
}
