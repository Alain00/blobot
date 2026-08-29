/**
 * The aggregates, as ticket 13 persists them. In-memory here; the SQLite store lands later
 * behind the same shapes.
 */

export interface Team {
  readonly id: string;
  /** Load-bearing: the branch is `blobot/<team>/<agent>`. */
  readonly name: string;
  readonly workspacePath: string;
  readonly workspaceKind: 'git' | 'plain';
  /** Total agent turns per user prompt, before the team halts and asks. */
  readonly turnBudget: number;
}

export interface Agent {
  readonly id: string;
  readonly teamId: string;
  readonly name: string;
  readonly role: string;
  /** The Agent's own isolated copy of the Workspace. A git worktree today. */
  readonly workspacePath: string;
}

/**
 * A Message: something said to an Agent, by the user or by a peer. One row either way —
 * `fromAgentId === null` is the discriminator, and the mailbox is `deliveredAt === undefined`.
 */
export interface Message {
  readonly id: string;
  readonly teamId: string;
  readonly fromAgentId: string | null;
  readonly toAgentId: string;
  readonly body: string;
  /** The sender's own one-line situation. We never summarize on her behalf. */
  readonly context?: string;
  readonly idempotencyKey?: string;
  readonly at: number;
  readonly deliveredAt?: number;
}
