/**
 * The ACP wire shapes the adapters read, declared by us.
 *
 * Deliberately *not* imported from `@agentclientprotocol/*`: core exports no ACP type, and a
 * structural declaration of the handful of fields we consume is both smaller and honest about
 * what we actually depend on. Everything is optional because a wire message is untrusted
 * input, not a promise — and neither runtime is obliged to fill a field just because the spec
 * names it. A provider extension that only one adapter reads (OpenCode's `configOptions`,
 * say) belongs in that adapter's own wire file, not here.
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
  /**
   * What the agent takes in a prompt beyond the baseline. Text and `resource_link` are the
   * baseline every agent must accept; everything here is opt-in and absent means no.
   */
  readonly promptCapabilities?: PromptCapabilities;
}

export interface PromptCapabilities {
  readonly image?: boolean;
  readonly audio?: boolean;
  /** An embedded `resource` block: how a text file travels, since blobot never links one. */
  readonly embeddedContext?: boolean;
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
  readonly configOptions?: readonly ConfigOption[];
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
  /**
   * What the call is about, as paths. ACP's own field, and the one neutral fact both runtimes
   * agree on where their titles do not — see `target.ts`.
   */
  readonly locations?: readonly { readonly path?: string; readonly line?: number }[];
  /**
   * The provider's own extension block. **Only an adapter may read this** — it is where a
   * vendor's vocabulary lives, and the shared half is the protocol's shape and nothing else.
   * The Claude adapter uses `claudeCode.toolName` to take its own verb back off a title.
   */
  readonly _meta?: { readonly claudeCode?: { readonly toolName?: string } };
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
  /**
   * ACP's `diff` block, which a real Claude sends on every edit. It arrives twice: once with
   * the strings the tool was called with, and again widened with surrounding context. See
   * `line-diff.ts`, which is why both readings give the same count.
   */
  readonly path?: string;
  readonly oldText?: string;
  readonly newText?: string;
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

/**
 * The `configOptions` block, an extension both runtimes send on `session/new` and on
 * `session/set_config_option`'s reply. OpenCode sends it in place of `modes`; the Claude
 * bridge sends both.
 *
 * The `options` array is large — 34 models on OpenCode, five plus an effort scale on the
 * bridge — and it is resent on every session call. It is never logged verbatim.
 */
export interface ConfigOption {
  readonly id?: string;
  readonly name?: string;
  readonly type?: string;
  readonly currentValue?: string;
  readonly options?: readonly { readonly value?: string; readonly name?: string }[];
}

/** The half of `JsonRpcConnection` the option helpers need, so they can be tested without one. */
export interface JsonRpcRequester {
  request<T>(method: string, params?: unknown): Promise<T>;
}
