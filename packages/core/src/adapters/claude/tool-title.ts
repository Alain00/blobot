import type { InjectableEvent } from '../../mock/mock-agent-runtime.js';
import type { SessionUpdate } from '../acp/wire.js';

/**
 * Takes Claude's own verb back off a tool title.
 *
 * The bridge titles a call `Edit notes.txt`, `Read notes.txt`, `Write src/desk.tsx` — measured
 * live, 2026-08-30. blobot already draws a verb of its own beside the title, from the four
 * `ToolKind` words both runtimes send, so the line read `edit  Edit src/pages/index.astro`:
 * the same fact twice, in two registers, with the target pushed out of the fixed column that
 * makes a folded run of calls scannable.
 *
 * Here rather than in `adapters/acp` because `Edit` and `Write` are Claude's words. The name is
 * not guessed off the title either — `_meta.claudeCode.toolName` says it, so this strips a
 * prefix the provider has confirmed rather than any capitalised first word.
 *
 * A placeholder title (`Read File`, before the arguments have streamed) loses its verb too and
 * reads as `File` for the moment before the refinement lands. That is a transient in-flight
 * line, and the alternative is a rule about which remainders look like paths.
 */
export function withoutToolVerb(event: InjectableEvent, update: SessionUpdate): InjectableEvent {
  if (event.type !== 'tool_call_started' && event.type !== 'tool_call_updated') return event;
  const verb = update._meta?.claudeCode?.toolName;
  const title = event.title;
  if (verb === undefined || verb === '' || title === undefined) return event;
  if (!title.startsWith(`${verb} `)) return event;
  const rest = title.slice(verb.length + 1).trim();
  return rest === '' ? event : { ...event, title: rest };
}
