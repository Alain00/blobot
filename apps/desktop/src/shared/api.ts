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

/** What `inspect()` found at the path the user picked, in the words the flow renders. */
export interface UiWorkspaceInspection {
  readonly path: string;
  readonly kind: 'git' | 'plain';
  readonly hasCommits: boolean;
  readonly dirty: boolean;
  readonly branch?: string;
}

export interface NewTeamSpec {
  readonly name: string;
  readonly workspacePath: string;
  readonly turnBudget: number;
  readonly agents: readonly {
    readonly name: string;
    readonly role: string;
    readonly runtimeId: string;
  }[];
}

/** A refusal the creation flow renders in place, rather than an exception it throws away. */
export interface TeamCreationResult {
  readonly ok: boolean;
  readonly teamId?: string;
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
  createTeam(spec: NewTeamSpec): Promise<TeamCreationResult>;
  selectTeam(teamId: string): Promise<void>;
  onEvent(listener: (event: AgentEvent) => void): () => void;
  onStatus(listener: (agentId: string, status: AgentStatus) => void): () => void;
  onMessage(listener: (message: Message) => void): () => void;
  onBudget(listener: (turnsUsed: number, turnBudget: number) => void): () => void;
  onTurns(listener: (turnsThisPrompt: number) => void): () => void;
  /** The active team changed under the renderer: created, switched, or started at launch. */
  onTeamChanged(listener: () => void): () => void;
}

declare global {
  interface Window {
    readonly blobot: BlobotApi;
  }
}
