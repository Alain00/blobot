import {
  CLAUDE_CEILINGS,
  CODEX_CEILINGS,
  ClaudeAgentRuntime,
  CodexAgentRuntime,
  FxAgentRuntime,
  OPENCODE_CEILINGS,
  OpencodeAgentRuntime,
  claudeCeiling,
  codexCeiling,
  opencodeCeiling,
  type AgentRuntime,
  type TrustLevel,
} from '@blobot/core';

export interface RuntimeRequest {
  readonly runtimeId: string;
  readonly agentId: string;
  /** The human name. OpenCode needs it: the persona is an agent definition with a key. */
  readonly agentName: string;
  readonly cwd: string;
  readonly persona: string;
  readonly resumeSessionId?: string;
  /** The user's own binary, as detection found it. Ticket 07: never a bundled copy. */
  readonly executablePath?: string;
  /** The user's choices among what the runtime advertises. Opaque here: the ids are the
   *  provider's, and this file is the last place that is allowed not to care. */
  readonly options?: Readonly<Record<string, string>>;
  /** blobot's own, not the provider's: how much of the agent's work it vouches for. Both
   *  adapters take the same three words and each translates it into what it can express. */
  readonly trust?: TrustLevel;
  readonly mcpServers: readonly {
    readonly type: 'http';
    readonly name: string;
    readonly url: string;
    readonly headers?: readonly { readonly name: string; readonly value: string }[];
  }[];
  readonly onStderr: (line: string) => void;
}

/**
 * The one place a `runtime_id` becomes a class, next to the one place it becomes a label.
 *
 * It lives in the main process for the same reason `runtime-labels.ts` does: the renderer
 * sends an id back and never learns what it means. Everything below this line is
 * provider-agnostic — `startTeam` holds `AgentRuntime`, and the orchestrator holds a Map of
 * them — which is the permanent rule doing its job at the only seam where it can be paid for.
 *
 * An unknown id throws rather than falling back to a runtime the user did not choose. An
 * agent hired against a runtime blobot has since dropped should say so, not quietly become
 * somebody else's agent.
 */
export function runtimeFor(request: RuntimeRequest): AgentRuntime {
  const shared = {
    agentId: request.agentId,
    cwd: request.cwd,
    persona: request.persona,
    ...(request.resumeSessionId === undefined ? {} : { resumeSessionId: request.resumeSessionId }),
    ...(request.options === undefined ? {} : { options: request.options }),
    ...(request.trust === undefined ? {} : { trust: request.trust }),
    mcpServers: request.mcpServers,
    onStderr: request.onStderr,
  };
  switch (request.runtimeId) {
    case 'claude-code':
      return new ClaudeAgentRuntime({
        ...shared,
        ...(request.executablePath === undefined
          ? {}
          : { claudeExecutable: request.executablePath }),
      });
    case 'opencode':
      return new OpencodeAgentRuntime({
        ...shared,
        agentName: request.agentName,
        ...(request.executablePath === undefined
          ? {}
          : { opencodeExecutable: request.executablePath }),
      });
    case 'codex':
      return new CodexAgentRuntime({
        ...shared,
        agentName: request.agentName,
        ...(request.executablePath === undefined
          ? {}
          : { codexExecutable: request.executablePath }),
      });
    // fx takes no `agentName`: OpenCode needs one because the persona is an agent definition
    // with a key, and Codex because it names the agent in its own vocabulary. fx has neither —
    // the persona rides the prompt — so passing one would be a field with nowhere to go.
    case 'fx':
      return new FxAgentRuntime({
        ...shared,
        ...(request.executablePath === undefined ? {} : { fxExecutable: request.executablePath }),
      });
    default:
      throw new Error(`${request.agentName} is set up for ${request.runtimeId}, which blobot cannot run`);
  }
}

/**
 * The other thing a `runtime_id` becomes: what its adapter knows about this model's usable
 * context, as a plain token count or nothing at all.
 *
 * Here rather than in a file of its own, because this is already the one place allowed to know
 * what an id means, and a second dispatch elsewhere would be a second place to keep in step.
 * Only the *lookup* is here. The arithmetic — the clamp to the reported window, and the
 * conservative fallback for a model nobody measured — is `core/context-ceiling.ts`, and it runs
 * in the renderer against whatever window the runtime actually went on to report. So the number
 * that crosses this boundary carries no provider in it, and `undefined` is the ordinary case
 * rather than a failure: it means nobody has measured this model, which is true of nearly all
 * of them.
 *
 * An unknown id returns `undefined` rather than throwing, unlike `runtimeFor`. Refusing to
 * launch an agent whose runtime blobot cannot run is right; refusing to draw its gauge is not.
 */
export function ceilingFor(runtimeId: string, model: string | undefined): number | undefined {
  switch (runtimeId) {
    case 'claude-code':
      return claudeCeiling(model);
    case 'opencode':
      return opencodeCeiling(model);
    case 'codex':
      return codexCeiling(model);
    default:
      return undefined;
  }
}

/**
 * The same knowledge as a table rather than a question, for the one screen that lists it.
 *
 * Settings draws a row per model blobot has an entry for, so that a number blobot ships is
 * visible before it surprises somebody — and that needs the keys, which a lookup cannot give.
 * It is here for the reason everything else in this file is: this is the one module allowed to
 * know what a `runtime_id` means, and a second dispatch elsewhere is a second one to keep in
 * step. What crosses to the renderer is rows, never this.
 */
export const CEILING_TABLES: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'claude-code': CLAUDE_CEILINGS,
  opencode: OPENCODE_CEILINGS,
  codex: CODEX_CEILINGS,
};
