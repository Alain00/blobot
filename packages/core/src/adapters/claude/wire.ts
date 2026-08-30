/**
 * The wire shapes this adapter reads off the bridge, declared by us.
 *
 * Deliberately *not* imported from `@agentclientprotocol/*`: core exports no ACP type, and a
 * structural declaration of the handful of fields we consume is both smaller and honest about
 * what we actually depend on. The bridge is pinned to an exact version and checked at startup,
 * so drift is a loud failure rather than a silent mis-parse. Everything is optional because a
 * wire message is untrusted input, not a promise.
 */

export interface InitializeResult {
  readonly protocolVersion?: number;
  readonly agentInfo?: { readonly name?: string; readonly version?: string };
  /** Empty when the user's own `claude` login already covers us — the whole credential story. */
  readonly authMethods?: readonly AuthMethod[];
  readonly agentCapabilities?: AgentCapabilities;
}

export interface AgentCapabilities {
  /** Whether `session/load` exists at all. Checked rather than assumed: a bridge without it
   *  would otherwise turn every resumed agent into a JSON-RPC error at launch. */
  readonly loadSession?: boolean;
}

export interface AuthMethod {
  readonly id?: string;
  readonly name?: string;
  readonly description?: string;
  readonly _meta?: { readonly terminal?: { readonly command?: string } };
}

export interface NewSessionResult {
  readonly sessionId?: string;
  readonly modes?: { readonly currentModeId?: string };
}

export interface PromptResult {
  readonly stopReason?: string;
}

export interface SessionNotification {
  readonly sessionId?: string;
  readonly update?: SessionUpdate;
}

export interface SessionUpdate {
  readonly sessionUpdate?: string;
  readonly messageId?: string;
  readonly content?: ContentBlock | readonly ToolContent[];
  readonly toolCallId?: string;
  readonly title?: string;
  readonly kind?: string;
  readonly status?: string;
  readonly rawInput?: unknown;
  readonly rawOutput?: unknown;
  readonly used?: number;
  readonly size?: number;
  readonly cost?: { readonly amount?: number; readonly currency?: string };
  readonly currentModeId?: string;
  readonly availableCommands?: readonly AvailableCommandWire[];
}

/** The menu entry as the bridge sends it. Normalized into blobot's `AvailableCommand`. */
export interface AvailableCommandWire {
  readonly name?: string;
  readonly description?: string;
  readonly input?: { readonly hint?: string };
}

export interface ContentBlock {
  readonly type?: string;
  readonly text?: string;
}

export interface ToolContent {
  readonly type?: string;
  readonly content?: ContentBlock;
}

export interface PermissionRequestParams {
  readonly sessionId?: string;
  readonly toolCall?: { readonly toolCallId?: string; readonly title?: string };
  readonly options?: readonly {
    readonly optionId?: string;
    readonly name?: string;
    readonly kind?: string;
  }[];
}
