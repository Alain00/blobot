/**
 * The aggregates, as ticket 13 persists them. In-memory here; the SQLite store lands later
 * behind the same shapes.
 */

export interface Team {
  readonly id: string;
  /** Load-bearing: the branch is `blobot/<team>/<agent>`. */
  readonly name: string;
  readonly workspacePath: string;
  /**
   * Which of the amendment's three kinds of Workspace this is, and therefore which
   * WorkspaceProvider brings the team back at launch. `nested` is a folder of repositories.
   */
  readonly workspaceKind: 'git' | 'plain' | 'nested';
  /**
   * The repositories the user put in scope, relative to the Workspace. `nested` only, and
   * empty on a team created before the picker existed — which the provider reads as "all of
   * them", so an old team still comes back.
   */
  readonly workspaceRepos?: readonly string[];
  /** Total agent turns per user prompt, before the team halts and asks. */
  readonly turnBudget: number;
}

/**
 * An **AgentProfile**: an Agent that exists on its own, independently of any Team.
 *
 * Agents are hired once and can be on several teams at the same time — the marketing
 * specialist is one profile, not one per team. What a second team reuses is this definition;
 * what it cannot reuse is the Workspace copy, the Session, the mailbox and the Status, all of
 * which a Team gives an Agent. So joining a Team instantiates an {@link Agent} from a profile.
 * See `docs/adr/0001-agents-exist-independently-of-teams.md`.
 */
export interface AgentProfile {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  /** Which runtime this agent runs on. Read by whatever constructs a runtime; never by the UI. */
  readonly runtimeId: string;
  readonly executablePath?: string;
  readonly model?: string;
  /** Standing instructions, folded into every persona composed for it. */
  readonly instructions?: string;
  /**
   * The blobatar's hue, 0 to 359, when the user picked one. Absent means the name derives it.
   *
   * The one thing in this file that only the UI reads, and it is here rather than in the
   * renderer because the face has to follow the agent onto every team it joins. It is not a
   * provider fact: nothing may branch on it, and nothing does.
   */
  readonly hue?: number;
}

export interface Agent {
  readonly id: string;
  readonly teamId: string;
  /** The AgentProfile this Agent was instantiated from, when it came from one. */
  readonly profileId?: string;
  readonly name: string;
  readonly role: string;
  /** Copied from the profile at creation, so the persona stays auditable after an edit. */
  readonly instructions?: string;
  /** Copied for the same reason: a transcript shows the face this agent wore at the time. */
  readonly hue?: number;
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
