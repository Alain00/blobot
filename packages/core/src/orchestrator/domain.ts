/**
 * The aggregates, as ticket 13 persists them. In-memory here; the SQLite store lands later
 * behind the same shapes.
 */

import type { AttachmentKind } from '../runtime.js';
import type { TrustLevel } from '../trust.js';

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
  /**
   * The team's icon as a `data:` URL, when it has one. Absent is the ordinary case: a team is
   * drawn as a folder with its members' faces in it, and the icon is a label on that folder,
   * never a replacement for it.
   */
  readonly icon?: string;
  /** Total agent turns per user prompt, before the team halts and asks. */
  readonly turnBudget: number;
  /**
   * The **lead**: who the team pane is talking to when the user names nobody.
   *
   * Addressing only. The lead receives the message as itself, exactly as an `@mention` would
   * have delivered it, and nothing forwards it onward — a message still lands in exactly one
   * agent's session. Absent is a real state: the team pane then behaves as ticket 12 specified
   * and waits for a mention.
   */
  readonly leadAgentId?: string;
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
export interface AgentProfile extends AgentDefinition {
  readonly id: string;
}

/**
 * An AgentProfile without its identity: everything an edit can change.
 *
 * Named apart from the profile because editing is *restating the whole definition*, not
 * patching fields — and because each of these behaves differently towards the teams the agent
 * is already on. See `docs/adr/0002-editing-an-agents-definition.md`.
 */
export interface AgentDefinition {
  readonly name: string;
  readonly role: string;
  /** Which runtime this agent runs on. Read by whatever constructs a runtime; never by the UI. */
  readonly runtimeId: string;
  readonly executablePath?: string;
  /**
   * What this agent was set to among the options its runtime advertises, keyed by the
   * provider's own group id: `{model: 'sonnet', effort: 'high'}`.
   *
   * Opaque here on purpose. Nothing in core, and nothing in the UI, may know that `effort` is
   * a Claude word and `model` is spelled `openai/gpt-5.4` on the other one — the adapter
   * advertises the groups and the adapter applies them. An absent key is the runtime's own
   * default, which is why not choosing stores nothing rather than storing a word for it.
   */
  readonly runtimeOptions?: Readonly<Record<string, string>>;
  /**
   * How much of the agent's own work blobot vouches for before its runtime starts asking.
   *
   * Blobot's own vocabulary rather than a provider's, which is why it sits beside
   * `runtimeOptions` instead of inside it: both adapters answer to the same three words and
   * neither runtime has ever advertised them. Absent is `normal`. See `trust.ts`.
   */
  readonly trust?: TrustLevel;
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
  /**
   * What the user attached. Never present on a peer message: only the user attaches, and the
   * `message_agent` tool has nowhere to put one.
   *
   * Metadata only — the bytes live in the attachment store and are fetched by id, so a
   * transcript of two hundred messages does not carry two hundred images through every
   * snapshot.
   */
  readonly attachments?: readonly Attachment[];
}

/**
 * An **Attachment**: bytes the user attached to a Message.
 *
 * This is the record of one, not its content. One Attachment can be on several Messages — a
 * message addressed to three agents is three rows and one attachment — so it has an identity of
 * its own rather than being a field on a row.
 */
export interface Attachment {
  readonly id: string;
  readonly kind: AttachmentKind;
  readonly mimeType: string;
  /** The file's own name. A pasted image has none, and blobot does not invent one. */
  readonly name?: string;
  /** The size of the original bytes, which is what the composer and the gauge report. */
  readonly bytes: number;
}

/** An Attachment with its content, as the store holds it and the runtime is handed it. */
export interface AttachmentContent extends Attachment {
  readonly data: Uint8Array;
  /** When the bytes were stored. A fact about the blob, not about any message carrying it. */
  readonly at: number;
}
