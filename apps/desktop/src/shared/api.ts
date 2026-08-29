import type { AgentEvent, AgentStatus, Message } from '@blobot/core/ui';

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

export interface UiSnapshot {
  readonly team: UiTeam;
  readonly agents: readonly UiAgent[];
  readonly statuses: Record<string, AgentStatus>;
  readonly messages: readonly Message[];
  readonly turnsThisPrompt: number;
  /** Named so nobody mistakes the demo for real agents. */
  readonly demoMode: boolean;
}

export interface BlobotApi {
  snapshot(): Promise<UiSnapshot>;
  prompt(agentId: string, text: string): Promise<void>;
  resumeAfterBudget(): Promise<void>;
  onEvent(listener: (event: AgentEvent) => void): () => void;
  onStatus(listener: (agentId: string, status: AgentStatus) => void): () => void;
  onMessage(listener: (message: Message) => void): () => void;
  onBudget(listener: (turnsUsed: number, turnBudget: number) => void): () => void;
  onTurns(listener: (turnsThisPrompt: number) => void): () => void;
}

declare global {
  interface Window {
    readonly blobot: BlobotApi;
  }
}
