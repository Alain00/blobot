import type { ConfigOption } from '../acp/wire.js';

/**
 * OpenCode's own reading of the ACP wire.
 *
 * The shapes live in `../acp/wire.ts`, `configOptions` among them, because both runtimes send
 * that block. What is here is what it *means* on OpenCode: the `mode` option **is** the agent
 * concept, one to one, so reading its current value back is how blobot checks that the persona
 * is live without spending a model turn.
 */
export interface OpencodeSessionResult {
  readonly sessionId?: string;
  readonly configOptions?: readonly ConfigOption[];
}

/** The `mode` option's current value, or nothing when the session did not report one. */
export function currentModeOf(result: OpencodeSessionResult): string | undefined {
  return result.configOptions?.find((option) => option.id === 'mode')?.currentValue;
}
