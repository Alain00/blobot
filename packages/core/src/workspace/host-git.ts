/**
 * Blobot's host Git commands must not trigger a repository's monitor, hooks or diff programs.
 * Worktrees share writable configuration with their Agent, including an Agent in a sandbox.
 * The same rule covers reads, explicit UI writes and workspace provisioning; it does not edit
 * the shared config or change the Agent's own Git behavior.
 *
 * This is defense in depth, not a claim that arbitrary repository configuration is safe.
 * Filters, credential helpers and the repository's metadata remain part of Git's trust model.
 */
export function hostGitArguments(args: readonly string[]): string[] {
  const config = [
    'core.fsmonitor=false',
    'core.hooksPath=/dev/null',
    'core.sshCommand=ssh',
    'maintenance.auto=false',
    'gc.auto=0',
  ];
  return [
    '--no-pager',
    ...config.flatMap((value) => ['-c', value]),
    ...args.slice(0, 1),
    ...(args[0] === 'diff' ? ['--no-ext-diff', '--no-textconv'] : []),
    ...args.slice(1),
  ];
}

/** Overrides even a per-protocol allow entry in the writable repository configuration. */
export const HOST_GIT_ENVIRONMENT = { GIT_ALLOW_PROTOCOL: 'http:https:ssh:git:file' } as const;
