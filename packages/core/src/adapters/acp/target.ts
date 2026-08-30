import { isAbsolute, relative } from 'node:path';
import type { InjectableEvent } from '../../mock/mock-agent-runtime.js';
import type { SessionUpdate } from './wire.js';

/**
 * What a tool call is about, said the same way whichever runtime is behind it.
 *
 * The two runtimes title a file call differently, and neither title is wrong — they are each
 * the provider's own voice. Measured 2026-08-30 on the same edit:
 *
 * - Claude: `Edit notes.txt` — its verb, then a path relative to the workspace.
 * - OpenCode: `edit` while in flight, then `tmp/blobot-oc-kAIrDZ/notes.txt` on completion, which
 *   is the absolute path with its leading slash gone.
 *
 * So the transcript showed a short relative path for one agent and a long absolute one for the
 * other, on identical work. Reconciling the two title *strings* would mean a rule per vendor
 * about which words to take off and which slash to restore, in a place that is meant to know
 * neither. `locations` is the way out: it is ACP's own field, both runtimes populate it, and a
 * path carries no verb, so aligning on it settles the doubling and the shape at once.
 *
 * Relative to the AgentWorkspace, because that is what the path *means* to a reader: every agent
 * works in its own checkout, and the part of the path that differs between two agents on one
 * team is the part that says nothing about the work. A path outside the workspace keeps its
 * `../`, which is a fact worth seeing rather than one to tidy away.
 */
export function withTarget(event: InjectableEvent, update: SessionUpdate, cwd: string): InjectableEvent {
  if (event.type !== 'tool_call_started' && event.type !== 'tool_call_updated') return event;
  const target = targetOf(update, cwd);
  // No location is the ordinary case for a command: `npm run build` is about no path at all,
  // and its title is the whole of what there is to say.
  if (target === undefined) return event;
  return { ...event, title: target };
}

export function targetOf(update: SessionUpdate, cwd: string): string | undefined {
  const paths = [...locationPaths(update), ...(hasLocations(update) ? [] : diffPaths(update))];
  if (paths.length === 0) return undefined;
  const shown = paths.map((path) => display(path, cwd));
  // Several locations on one call: say how many rather than the first, which would be a claim
  // that the others did not happen.
  return shown.length === 1
    ? (shown[0] as string)
    : `${shown[0] as string} +${shown.length - 1} more`;
}

/**
 * The paths ACP's own `locations` names.
 *
 * Claude and OpenCode both populate it. **Codex does not**, measured 2026-08-30: its edit call
 * arrives titled `Editing files`, with the path inside the `diff` content block instead. So a
 * third runtime says the same fact in a second protocol-level field, and reading both is still
 * reading the protocol rather than learning a vendor's habits.
 */
function locationPaths(update: SessionUpdate): string[] {
  return (update.locations ?? [])
    .map((location) => location.path)
    .filter((path): path is string => typeof path === 'string' && path.length > 0);
}

function hasLocations(update: SessionUpdate): boolean {
  return locationPaths(update).length > 0;
}

/** The `path` on a `diff` block, which is where Codex says which file an edit is about. */
function diffPaths(update: SessionUpdate): string[] {
  const content = update.content;
  if (content === undefined || !Array.isArray(content)) return [];
  const paths = content
    .map((block) => block.path)
    .filter((path): path is string => typeof path === 'string' && path.length > 0);
  // The same file twice is one target: an edit block arrives narrow and again widened.
  return [...new Set(paths)];
}

function display(path: string, cwd: string): string {
  if (!isAbsolute(path)) return path;
  const inside = relative(cwd, path);
  // `relative` answers '' for the workspace root itself, which is a real target and not nothing.
  return inside === '' ? path : inside;
}
