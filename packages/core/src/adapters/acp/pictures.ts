import type { PictureArrived } from '../../events.js';
import type { PictureStore } from '../../runtime.js';
import type { ContentBlock, SessionUpdate, ToolContent } from './wire.js';

/**
 * Where a Picture is on the wire, and it is four different places.
 *
 * `.scratch/agent-media/01` ran one turn against four runtimes and found **four shapes, with no
 * two putting a picture in the same place**: Claude sends it canonically and twice more, Codex
 * sends it only in MCP's own envelope under `rawOutput`, OpenCode sends it canonically plus a
 * `data:` URL of its own, and fx stringifies the whole result into a text block and truncates it
 * at 200 characters mid-base64. That is the first measured thing the shared `adapters/acp/` half
 * does not cover, so the canonical reader is here and the two exceptions belong to their adapters.
 *
 * `annotations` are stripped by every bridge, so `audience` and `lastModified` are unavailable and
 * every fact on a frame is one blobot measured or one an agent claimed.
 */

/** One picture as it was found, before anything has been decided about it. */
export interface FoundPicture {
  readonly data: Uint8Array;
  readonly toolCallId?: string;
  /**
   * The bytes as they came over the wire, and the identity a duplicate is recognised by.
   *
   * Carried rather than recomputed because the de-duplication has to span the canonical reader
   * and an adapter's own: Codex puts a picture only in `rawOutput` **today**, and a version that
   * starts sending it canonically as well must produce one Picture rather than two.
   */
  readonly key: string;
}

/**
 * Every `image` block on one update, canonically.
 *
 * Covers an `agent_message_chunk` (the agent's own voice) and a `tool_call_update` (a result
 * blobot was watching), because ACP puts both in `content` and the difference is the update kind
 * rather than the block.
 *
 * **De-duplicated by bytes**, which is not tidiness: Claude sends the same picture three times
 * over, in `content`, in `rawOutput` and in `_meta.claudeCode.toolResponse`, and a reader that
 * took each would draw one screenshot three times. Only `content` is read here, and the identity
 * check is what keeps a provider that repeats itself inside one field from doing the same.
 */
export function picturesIn(update: SessionUpdate): FoundPicture[] {
  const blocks = blocksOf(update.content);
  const found: FoundPicture[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    if (block.type !== 'image') continue;
    const encoded = block.data;
    if (encoded === undefined || encoded === '') continue;
    if (seen.has(encoded)) continue;
    seen.add(encoded);
    found.push({
      data: decode(encoded),
      key: encoded,
      ...(update.toolCallId === undefined ? {} : { toolCallId: update.toolCallId }),
    });
  }
  return found;
}

/**
 * The blocks on an update, whichever of the two shapes it used.
 *
 * A message chunk's `content` is one block; a tool call's is a list of `{type:'content', content}`
 * wrappers. Both are read, because a picture can legally arrive on either.
 */
function blocksOf(content: SessionUpdate['content']): ContentBlock[] {
  if (content === undefined) return [];
  if (!Array.isArray(content)) return [content as ContentBlock];
  return (content as readonly ToolContent[]).flatMap((entry) => {
    if (entry.type === 'content' && entry.content !== undefined) return [entry.content];
    // Some bridges flatten the wrapper away and put the block itself in the list.
    return entry.type === 'image' ? [entry as unknown as ContentBlock] : [];
  });
}

function decode(base64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

/**
 * The four adapters' one seam onto all of this.
 *
 * It is a small object with memory rather than a function, for one reason: the tool's own name
 * arrives on the `tool_call` that opens a run and the picture arrives on a `tool_call_update`
 * that closes it, so the only way the frame can say `from playwright_screenshot` is to have kept
 * the first. Nothing else here is stateful.
 *
 * A runtime constructs one and hands it every update. `undefined` for the store is a real
 * configuration -- a headless demo, a test -- and it reports `blobot could not keep it` rather
 * than going quiet, because going quiet is the defect.
 */
export class PictureWatch {
  readonly #store: PictureStore | undefined;
  readonly #toolNames = new Map<string, string>();

  constructor(store?: PictureStore) {
    this.#store = store;
  }

  /**
   * Every Picture on one update, as events, already de-duplicated.
   *
   * `also` is where an adapter contributes what the canonical reader cannot see -- Codex's MCP
   * envelope under `rawOutput`. It is merged rather than appended, so a provider that sends the
   * same bytes in both places produces one Picture and not two.
   */
  from(
    update: SessionUpdate,
    agentId: string,
    at: number,
    also: readonly FoundPicture[] = [],
  ): Omit<PictureArrived, 'agentId' | 'sessionId' | 'at'>[] {
    this.#remember(update);
    const seen = new Set<string>();
    const events: Omit<PictureArrived, 'agentId' | 'sessionId' | 'at'>[] = [];
    for (const found of [...picturesIn(update), ...also]) {
      if (seen.has(found.key)) continue;
      seen.add(found.key);
      events.push(pictureEvent(this.#store, found, agentId, at, this.#toolNameOf(update)));
    }
    return events;
  }

  /** Told when a session ends, so a long-lived runtime does not accumulate every call it saw. */
  forget(): void {
    this.#toolNames.clear();
  }

  #remember(update: SessionUpdate): void {
    const toolCallId = update.toolCallId;
    if (toolCallId === undefined) return;
    const name = nameOf(update);
    if (name !== undefined && !this.#toolNames.has(toolCallId)) this.#toolNames.set(toolCallId, name);
  }

  #toolNameOf(update: SessionUpdate): string | undefined {
    const toolCallId = update.toolCallId;
    if (toolCallId === undefined) return undefined;
    return this.#toolNames.get(toolCallId);
  }
}

/**
 * What to call the tool, in the tool's own terms.
 *
 * `rawInput.tool` first, because it is the name the server actually registered and it is what an
 * operator would recognise; the title is a provider's prose about it and is the fallback. Never
 * blobot's own words: this is a fact about somebody else's software.
 */
function nameOf(update: SessionUpdate): string | undefined {
  const raw = update.rawInput;
  if (typeof raw === 'object' && raw !== null) {
    const tool = (raw as { readonly tool?: unknown }).tool;
    if (typeof tool === 'string' && tool !== '') return tool;
  }
  return update.title === undefined || update.title === '' ? undefined : update.title;
}

/**
 * A found picture, kept, as the event the transcript is built from.
 *
 * The store measures and refuses; the adapter only says where it looked. That is what keeps the
 * four shapes inside the four adapters and out of the vocabulary, and it means there is never a
 * bytes-carrying event to forget to strip.
 */
export function pictureEvent(
  store: PictureStore | undefined,
  found: FoundPicture,
  agentId: string,
  at: number,
  toolName?: string,
): Omit<PictureArrived, 'agentId' | 'sessionId' | 'at'> {
  const common = {
    type: 'picture_arrived' as const,
    source: 'observed' as const,
    ...(found.toolCallId === undefined ? {} : { toolCallId: found.toolCallId }),
    ...(toolName === undefined || toolName === '' ? {} : { toolName }),
  };
  // No store is not a silent drop. blobot saw a picture and has nowhere to put it, which is
  // exactly what that sentence says, and saying nothing is the defect this whole effort is about.
  if (store === undefined) {
    return { ...common, notDrawn: 'not_kept', bytes: found.data.byteLength };
  }
  const kept = store.keep({ agentId, source: 'observed', data: found.data, at });
  return 'pictureId' in kept
    ? { ...common, pictureId: kept.pictureId, width: kept.width, height: kept.height, bytes: kept.bytes }
    : { ...common, notDrawn: kept.notDrawn, bytes: kept.bytes };
}
