/** An agent must never use blobot as a host filesystem or shell proxy around its Machine. */
export const MACHINE_CLIENT_CAPABILITIES = Object.freeze({
  fs: Object.freeze({ readTextFile: false as const, writeTextFile: false as const }),
  terminal: false as const,
});
