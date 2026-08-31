import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { HandoffArchive, HandoffRecord } from '@blobot/core';

/**
 * Where a handoff is kept, beside the worktrees and never inside one.
 *
 * `~/.local/share/blobot/handoffs/`, which is decided ground rather than a preference. An
 * AgentWorkspace is a checkout of the user's repository, and an agent running `git add -A`
 * commits whatever blobot left there home to somebody's main branch. It is the same reason
 * `adapters/claude/permissions.ts` hands `allowedTools` over the wire instead of writing a
 * settings file, and the reason ticket 10 named the location before anything was built.
 *
 * The file is the user's record, never the agent's route to it: the handoff itself travels in
 * the fresh session's first prompt as text. A path handed to an agent would be an ungated read
 * outside its own workspace — `Read` never prompts — which is ADR-0004's refusal.
 */
export function defaultHandoffRoot(): string {
  return join(homedir(), '.local', 'share', 'blobot', 'handoffs');
}

/**
 * One Markdown file per handoff, named so a person can find the one they want.
 *
 * `<team>/<agent-name>-<timestamp>.md`. The name rather than the id in the filename, because
 * this directory is read by a human with a file browser and `agent_019...` is not a name.
 * Collisions are not a concern: the timestamp is the moment blobot decided, and one agent has
 * one session, so two cannot land in the same millisecond.
 *
 * A front matter block carries the ids, so a file found on its own can still be matched back to
 * a transcript.
 */
export class FileHandoffArchive implements HandoffArchive {
  readonly #root: string;

  constructor(root: string = defaultHandoffRoot()) {
    this.#root = root;
  }

  async write(record: HandoffRecord): Promise<string | undefined> {
    const directory = join(this.#root, record.teamId);
    const path = join(directory, `${slug(record.agentName)}-${record.at}.md`);
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(path, contentOf(record), 'utf8');
      return path;
    } catch {
      // Never fatal. The handoff is already going into the fresh session and into the
      // transcript; a full disk should not cost an agent its compaction.
      return undefined;
    }
  }
}

/** What the file says, so a handoff found six weeks later still knows what it was. */
function contentOf(record: HandoffRecord): string {
  return [
    '---',
    `agent: ${record.agentName}`,
    `agentId: ${record.agentId}`,
    `teamId: ${record.teamId}`,
    `session: ${record.sessionId}`,
    `written: ${new Date(record.at).toISOString()}`,
    '---',
    '',
    record.handoff,
    '',
  ].join('\n');
}

/** A filename an agent's name can safely become. Lowercase, and nothing a shell would eat. */
function slug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned === '' ? 'agent' : cleaned;
}
