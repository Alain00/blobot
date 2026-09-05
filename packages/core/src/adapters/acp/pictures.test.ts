import { describe, expect, it } from 'vitest';
import type { PictureStore } from '../../runtime.js';
import { PictureWatch, picturesIn } from './pictures.js';
import { picturesInRawOutput } from '../codex/pictures.js';

/** A one-pixel PNG, which is a real file and therefore a real measurement. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const base64 = PNG.toString('base64');

/** Keeps whatever it is handed, so a test can count Pictures without a database. */
function keeper(): PictureStore & { readonly kept: Uint8Array[] } {
  const kept: Uint8Array[] = [];
  return {
    kept,
    keep(picture) {
      kept.push(picture.data);
      return { pictureId: `pic_${kept.length}`, width: 1, height: 1, bytes: picture.data.byteLength };
    },
  };
}

describe('the silent drop', () => {
  it('turns an image in the agent voice into an event, where there used to be nothing', () => {
    // The whole defect: `session-updates.ts` reads the text of a block and returns `[]` when
    // there is none, so an image produced no event at all -- not a note, an absence.
    const watch = new PictureWatch(keeper());
    const events = watch.from(
      { sessionUpdate: 'agent_message_chunk', content: { type: 'image', mimeType: 'image/png', data: base64 } },
      'alice',
      10,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.pictureId).toBe('pic_1');
    expect(events[0]?.source).toBe('observed');
  });

  it('turns an image in a tool result into an event, and names the tool', () => {
    const watch = new PictureWatch(keeper());
    // The name arrives on the call that opens the run and the picture on the one that closes it,
    // which is the only reason this thing has memory at all.
    watch.from(
      { sessionUpdate: 'tool_call', toolCallId: 'call_1', title: 'playwright_screenshot' },
      'alice',
      10,
    );
    const events = watch.from(
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'call_1',
        content: [{ type: 'content', content: { type: 'image', mimeType: 'image/png', data: base64 } }],
      },
      'alice',
      11,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.toolName).toBe('playwright_screenshot');
    expect(events[0]?.toolCallId).toBe('call_1');
  });

  it('says blobot could not keep it rather than going quiet, with nowhere to put one', () => {
    const events = new PictureWatch().from(
      { sessionUpdate: 'agent_message_chunk', content: { type: 'image', data: base64 } },
      'alice',
      10,
    );
    expect(events[0]?.notDrawn).toBe('not_kept');
    expect(events[0]?.pictureId).toBeUndefined();
  });

  it('leaves an ordinary text update alone', () => {
    const events = new PictureWatch(keeper()).from(
      { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hello' } },
      'alice',
      10,
    );
    expect(events).toEqual([]);
  });
});

describe('the four shapes, and one Picture each', () => {
  it('draws one Picture when Claude sends the same one three times over', () => {
    // Measured on a real `claude`: the picture is in `content`, in `rawOutput` and in
    // `_meta.claudeCode.toolResponse`. Only `content` is read, and identical bytes inside it
    // collapse, so a provider that repeats itself cannot turn one screenshot into three.
    const store = keeper();
    const events = new PictureWatch(store).from(
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'call_1',
        content: [
          { type: 'content', content: { type: 'image', mimeType: 'image/png', data: base64 } },
          { type: 'content', content: { type: 'image', mimeType: 'image/png', data: base64 } },
        ],
        rawOutput: { content: [{ type: 'image', data: base64 }] },
      },
      'alice',
      10,
    );
    expect(events).toHaveLength(1);
    expect(store.kept).toHaveLength(1);
  });

  it("reads Codex's MCP envelope, which is nowhere in ACP's own", () => {
    // Codex is the one runtime that puts a picture only in `rawOutput.result.content`. The
    // canonical reader finds nothing, which is the first measured thing `adapters/acp/` does
    // not cover.
    const update = {
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call_1',
      content: [{ type: 'content', content: { type: 'text', text: 'took a screenshot' } }],
      rawOutput: { result: { content: [{ type: 'image', data: base64 }] } },
    };
    expect(picturesIn(update)).toHaveLength(0);
    expect(picturesInRawOutput(update)).toHaveLength(1);
    const events = new PictureWatch(keeper()).from(update, 'alice', 10, picturesInRawOutput(update));
    expect(events).toHaveLength(1);
  });

  it('still draws one if a later Codex starts sending it canonically as well', () => {
    // The version this guards against does not exist yet, which is the point: a runtime that
    // adds the canonical block must not silently double every screenshot.
    const update = {
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call_1',
      content: [{ type: 'content', content: { type: 'image', mimeType: 'image/png', data: base64 } }],
      rawOutput: { result: { content: [{ type: 'image', data: base64 }] } },
    };
    const events = new PictureWatch(keeper()).from(update, 'alice', 10, picturesInRawOutput(update));
    expect(events).toHaveLength(1);
  });

  it("does not read OpenCode's own data: URL, which would draw every screenshot twice", () => {
    const found = picturesIn({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call_1',
      content: [{ type: 'content', content: { type: 'image', mimeType: 'image/png', data: base64 } }],
      rawOutput: { attachments: [{ url: `data:image/png;base64,${base64}` }] },
    });
    expect(found).toHaveLength(1);
  });
});
