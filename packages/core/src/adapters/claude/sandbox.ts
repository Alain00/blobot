import type { MachineKind } from '../../machines/machine.js';

export const CLAUDE_LOCAL_PROTECTION =
  'Local shell commands use native protection, with project exceptions. Failures may surface when a command runs; other tools stay outside this sandbox.';

/**
 * Research42 found that the pinned CLI can acknowledge initialize while native backend
 * initialization has failed. The author accepted the native contract: missing dependencies
 * may refuse startup; a protected command may instead fail when the backend is first used.
 * An open session is not a positive sandbox-readiness observation (ADR-0006).
 *
 * Native reach is independent of approval posture (ADR-0006). Delivery uses the pinned
 * bridge's SDK options on both new and resumed sessions, never a workspace or user file.
 *
 * Claude merges array-valued rules from user/project/local settings into this tier. In
 * particular, project excludedCommands can still run outside the sandbox. This is a native
 * Bash fence with inherited rules, not confinement of the bridge, file tools or MCP servers.
 * See Machines research42 for the pinned CLI's measured settings precedence.
 */
export function claudeSandboxFor(kind: MachineKind) {
  if (kind === 'box') return { enabled: false } as const;
  return {
    enabled: true,
    failIfUnavailable: true,
    // The SDK default is true, which would auto-approve otherwise unvouched Bash commands.
    autoAllowBashIfSandboxed: false,
    allowUnsandboxedCommands: false,
  } as const;
}
