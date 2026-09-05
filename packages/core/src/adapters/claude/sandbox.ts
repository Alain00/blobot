import type { MachineKind } from '../../machines/machine.js';

export const CLAUDE_LOCAL_PROTECTION =
  'Local execution does not require a shell sandbox yet. Your runtime and project settings may enable one; approval rules still apply.';

/**
 * Prepared native policy, NOT connected to session startup yet. Research42 found that the
 * pinned CLI can acknowledge initialize while native backend initialization has failed;
 * failIfUnavailable only refuses detected missing dependencies at startup. The accepted
 * startup requirement therefore needs a further decision before this policy can activate.
 *
 * Native reach is independent of approval posture (ADR-0006). Delivery will use the pinned
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
