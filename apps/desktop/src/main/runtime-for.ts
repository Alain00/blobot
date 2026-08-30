import {
  ClaudeAgentRuntime,
  OpencodeAgentRuntime,
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
    default:
      throw new Error(`${request.agentName} is set up for ${request.runtimeId}, which blobot cannot run`);
  }
}
