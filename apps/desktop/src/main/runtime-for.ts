import {
  ATTENDED_TRUST_LEVELS,
  CLAUDE_CEILINGS,
  CLAUDE_TRUST_LEVELS,
  CODEX_CEILINGS,
  CLAUDE_LOCAL_PROTECTION,
  CURSOR_LOCAL_PROTECTION,
  CODEX_LOCAL_PROTECTION,
  FX_LOCAL_PROTECTION,
  OPENCODE_LOCAL_PROTECTION,
  ClaudeAgentRuntime,
  CodexAgentRuntime,
  CursorAgentRuntime,
  FxAgentRuntime,
  OPENCODE_CEILINGS,
  OpencodeAgentRuntime,
  claudeCeiling,
  codexCeiling,
  opencodeCeiling,
  agentGitEnvironment,
  CLAUDE_MACHINE_IMAGE,
  CODEX_MACHINE_IMAGE,
  CURSOR_MACHINE_IMAGE,
  FX_MACHINE_IMAGE,
  OPENCODE_MACHINE_IMAGE,
  CLAUDE_LOGIN, CODEX_LOGIN, CURSOR_LOGIN, FX_LOGIN, OPENCODE_LOGIN,
  type AgentRuntime,
  type Machine,
  type PictureStore,
  type TrustLevel,
  type RuntimeImageDefinition,
  type RuntimeLogin,
} from '@blobot/core';

export interface RuntimeRequest {
  readonly machine?: Machine;
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
  /**
   * Where a Picture's bytes go. Handed in here rather than reached for, so `packages/core` still
   * has no idea SQLite exists and a test can count Pictures without a database.
   */
  readonly pictures?: PictureStore;
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
    ...(request.machine === undefined ? {} : { machine: request.machine }),
    agentId: request.agentId,
    cwd: request.cwd,
    persona: request.persona,
    env: agentGitEnvironment(request.agentName, request.machine?.kind === 'box' ? {} : process.env),
    ...(request.resumeSessionId === undefined ? {} : { resumeSessionId: request.resumeSessionId }),
    ...(request.options === undefined ? {} : { options: request.options }),
    ...(request.trust === undefined ? {} : { trust: request.trust }),
    mcpServers: request.mcpServers,
    onStderr: request.onStderr,
    ...(request.pictures === undefined ? {} : { pictures: request.pictures }),
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
    // fx and Cursor take no `agentName`: OpenCode needs one because the persona is an agent
    // definition with a key, and Codex because it names the agent in its own vocabulary. On
    // these two the persona rides the prompt, so passing one would be a field with nowhere
    // to go.
    case 'fx':
      return new FxAgentRuntime({
        ...shared,
        ...(request.executablePath === undefined ? {} : { fxExecutable: request.executablePath }),
      });
    case 'cursor':
      return new CursorAgentRuntime({
        ...shared,
        ...(request.executablePath === undefined
          ? {}
          : { cursorExecutable: request.executablePath }),
      });
    default:
      throw new Error(`${request.agentName} is set up for ${request.runtimeId}, which blobot cannot run`);
  }
}

const MACHINE_IMAGES: Readonly<Record<string, RuntimeImageDefinition>> = {
  'claude-code': CLAUDE_MACHINE_IMAGE, codex: CODEX_MACHINE_IMAGE,
  cursor: CURSOR_MACHINE_IMAGE, fx: FX_MACHINE_IMAGE, opencode: OPENCODE_MACHINE_IMAGE,
};

export function imageFor(runtimeId: string): RuntimeImageDefinition | undefined {
  return Object.hasOwn(MACHINE_IMAGES, runtimeId) ? MACHINE_IMAGES[runtimeId] : undefined;
}

const RUNTIME_LOGINS: Readonly<Record<string, RuntimeLogin>> = {
  'claude-code': CLAUDE_LOGIN, codex: CODEX_LOGIN, cursor: CURSOR_LOGIN, fx: FX_LOGIN, opencode: OPENCODE_LOGIN,
};
export function loginFor(runtimeId: string): RuntimeLogin | undefined {
  return Object.hasOwn(RUNTIME_LOGINS, runtimeId) ? RUNTIME_LOGINS[runtimeId] : undefined;
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

/**
 * Which trust positions are real on a runtime, which is not the same on all four.
 *
 * Here for the reason `ceilingFor` and `CEILING_TABLES` are here: this is the one module allowed
 * to know what a `runtime_id` means, and a second dispatch elsewhere is a second one to keep in
 * step. What crosses to the renderer is the list of levels, never the id that produced it, so the
 * agent form draws three rows or four and still cannot tell which provider it is looking at.
 *
 * Only Claude has a classifier, so only Claude answers with `unattended`. The other three each
 * have their own reason for stopping at three and each states it in its own adapter --
 * `CODEX_EXPRESSES_TRUST` and `FX_EXPRESSES_TRUST` go further and say the word moves nothing at
 * all there. An unknown id gets the three every runtime can express: refusing to draw a picker is
 * not the right answer to a runtime blobot cannot place, and `runtimeFor` will refuse the launch
 * anyway.
 */
export function trustLevelsFor(runtimeId: string): readonly TrustLevel[] {
  return runtimeId === 'claude-code' ? CLAUDE_TRUST_LEVELS : ATTENDED_TRUST_LEVELS;
}

/** Adapter-owned descriptions of local reach, not authentication or a live attestation. */
export function localProtectionFor(runtimeId: string): string | undefined {
  const descriptions: Readonly<Record<string, string>> = {
    'claude-code': CLAUDE_LOCAL_PROTECTION,
    cursor: CURSOR_LOCAL_PROTECTION,
    codex: CODEX_LOCAL_PROTECTION,
    fx: FX_LOCAL_PROTECTION,
    opencode: OPENCODE_LOCAL_PROTECTION,
  };
  return Object.hasOwn(descriptions, runtimeId) ? descriptions[runtimeId] : undefined;
}
