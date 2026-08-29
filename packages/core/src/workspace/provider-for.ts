import { CopiedDirectoryWorkspaces } from './copied-directory.js';
import { GitWorktreeWorkspaces } from './git-worktrees.js';
import { NestedRepoWorkspaces } from './nested-repos.js';
import type { WorkspaceInspection, WorkspaceProvider } from './workspace.js';

/**
 * The one place that turns a kind of Workspace into the provider that serves it.
 *
 * It exists so the kind — which is stored on the team, because it decides which provider
 * brings the team back at launch — never has to be branched on anywhere else. Adding a
 * `DockerAgentWorkspace` is a case here and nothing else.
 */
export function workspaceProviderFor(
  kind: WorkspaceInspection['kind'],
): WorkspaceProvider {
  switch (kind) {
    case 'git':
      return new GitWorktreeWorkspaces();
    case 'nested':
      return new NestedRepoWorkspaces();
    case 'plain':
      return new CopiedDirectoryWorkspaces();
  }
}
