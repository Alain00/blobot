import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { inspectWorkspace } from './inspect.js';
import { directorySize } from './size.js';
import {
  refSlug,
  requireWorkspaceExists,
  WorkspaceError,
  type AgentWorkspace,
  type ProvisionRequest,
  type ReconcileOutcome,
  type RemovalOutcome,
  type WorkspaceInspection,
  type WorkspaceProvider,
} from './workspace.js';

/**
 * AgentWorkspaces as plain copies, for a Workspace git cannot hold.
 *
 * The amendment to ticket 10 admits folders that are not repositories, because the original
 * answer said git was the *mechanism* and then refused every workspace git could not carry.
 * The isolation here is as real as the git provider's — each agent edits its own tree, nobody
 * corrupts anybody — but **none of the guarantees are**, and the difference is the reason this
 * is a separate class rather than a flag:
 *
 * - No branch. "Review Bob's work" is a directory comparison, not a diff.
 * - **A lost copy is `lost`, never `repaired`.** The copy *is* the work; there is no second
 *   place holding it, so a missing directory is data loss rather than an inconvenience.
 * - Deleting an agent **keeps** the copy and says where it is. `-d` versus `-D` asks git
 *   whether a branch holds unmerged commits and nothing can ask that of a directory, so the
 *   ticket's own rule decides: never put unrecoverable loss behind a dialog people click
 *   through. The cost is that copies accumulate until the user removes them.
 */
export class CopiedDirectoryWorkspaces implements WorkspaceProvider {
  readonly #root: string;

  constructor(root = defaultCopyRoot()) {
    this.#root = root;
  }

  get root(): string {
    return this.#root;
  }

  async inspect(workspacePath: string): Promise<WorkspaceInspection> {
    return inspectWorkspace(workspacePath);
  }

  /** Still offered on a plain folder — a choice now rather than a gate. */
  async initialize(workspacePath: string): Promise<void> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    await promisify(execFile)('git', ['-C', workspacePath, 'init']);
  }

  async provision(request: ProvisionRequest): Promise<AgentWorkspace> {
    const workspace = this.workspaceFor(request);
    if (existsSync(workspace.path)) {
      // Reuse rather than refuse, for the same reason as the git provider: recreating an agent
      // of the same name in the same team is ordinary, and its copy is where its work is.
      return workspace;
    }
    // A copy has no branch and no recovery, so a Workspace that is gone is the end of it.
    requireWorkspaceExists(request.workspacePath);

    await mkdir(dirname(workspace.path), { recursive: true });
    await copyTree(request.workspacePath, workspace.path);
    await this.#writeMarker(request, workspace);
    return workspace;
  }

  /**
   * The reconcile table, with the middle row gone.
   *
   * The git provider can repair a missing directory because the branch still holds the work.
   * Here there is no branch, so the same finding is the *bottom* row: `lost`. The marker file
   * is what separates it from `absent` — without one, a first run and a destroyed workspace
   * look identical, which is the exact confusion the original ticket cares most about.
   */
  async reconcile(request: ProvisionRequest): Promise<ReconcileOutcome> {
    const workspace = this.workspaceFor(request);
    const provisioned = existsSync(this.#markerPath(request));
    if (!provisioned && !existsSync(workspace.path)) return { state: 'absent' };
    if (existsSync(workspace.path)) return { state: 'ok', workspace };
    return {
      state: 'lost',
      detail: `${workspace.path} is gone. This workspace is a copy with no branch behind it, so the work in it is not recoverable by blobot.`,
    };
  }

  /** Keeps the copy, always, and reports the path. See the class comment for why. */
  async remove(request: ProvisionRequest): Promise<RemovalOutcome> {
    const workspace = this.workspaceFor(request);
    if (!existsSync(workspace.path)) {
      await rm(this.#markerPath(request), { force: true });
      return { work: 'discarded' };
    }
    return {
      work: 'kept',
      detail: `${workspace.path} was kept: it is a copy with no branch behind it, so deleting it would be unrecoverable. Remove it by hand when you are done with it.`,
    };
  }

  /**
   * Deletes the copy. This is the one place blobot will, and it exists because the alternative
   * was worse: `remove` keeps every copy forever, so a user who made teams out of a folder of
   * documents accumulates whole trees of them with nothing in the app that will ever mention
   * one again. The rule the class comment states is unbroken, because this is not behind a
   * dialog people click through: it is a choice made by name, with the size attached.
   */
  async purge(request: ProvisionRequest): Promise<RemovalOutcome> {
    const workspace = this.workspaceFor(request);
    await rm(workspace.path, { recursive: true, force: true });
    await rm(this.#markerPath(request), { force: true });
    return { work: 'discarded' };
  }

  /** The copy *is* the work, so its size is the whole of what a purge here recovers. */
  async measure(request: ProvisionRequest): Promise<number> {
    return directorySize(this.workspaceFor(request).path);
  }

  /** Where an agent's copy lives. Pure: no filesystem. */
  workspaceFor(request: ProvisionRequest): AgentWorkspace {
    return {
      agentId: request.agentId,
      path: join(this.#root, refSlug(request.teamName), refSlug(request.agentName)),
    };
  }

  /**
   * Beside the copy rather than inside it, so an agent that deletes everything in its own
   * workspace cannot erase the evidence that the workspace was ever provisioned.
   */
  #markerPath(request: ProvisionRequest): string {
    return join(this.#root, refSlug(request.teamName), `${refSlug(request.agentName)}.json`);
  }

  async #writeMarker(request: ProvisionRequest, workspace: AgentWorkspace): Promise<void> {
    await writeFile(
      this.#markerPath(request),
      `${JSON.stringify(
        {
          agentId: request.agentId,
          agentName: request.agentName,
          source: request.workspacePath,
          path: workspace.path,
          provisionedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  }
}

/** Whether this provider has a record of ever having provisioned that agent. */
export async function readCopyMarker(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * A copy, with the one exclusion that is not an opinion about the user's files: `.git`.
 *
 * Copying a repository's history into a workspace that is not managed as a repository produces
 * a tree that looks version-controlled and is not — an agent would commit into a copy nobody
 * ever reads. A `plain` Workspace has no `.git` by definition, so this only bites inside the
 * mirrored tree, where the repositories are worktrees and their history is already handled.
 */
export async function copyTree(from: string, to: string): Promise<void> {
  try {
    await cp(from, to, {
      recursive: true,
      // Symlinks are copied as symlinks: following them can leave the Workspace entirely.
      verbatimSymlinks: true,
      filter: (source) => !source.endsWith(`${sep()}.git`),
    });
  } catch (error) {
    throw new WorkspaceError('copy_failed', `could not copy ${from} to ${to}: ${String(error)}`);
  }
}

function sep(): string {
  return process.platform === 'win32' ? '\\' : '/';
}

/** `XDG_DATA_HOME` when set, `~/.local/share` otherwise — beside `worktrees/`. */
export function defaultCopyRoot(): string {
  const xdg = process.env['XDG_DATA_HOME'];
  const base = xdg !== undefined && xdg.length > 0 ? xdg : join(homedir(), '.local', 'share');
  return join(base, 'blobot', 'copies');
}
