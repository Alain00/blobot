import { DICTATION_RECORDING_LIMIT_MS } from '../orchestrator/bounds.js';
import { PCM_BYTES_PER_SECOND, type SpeechHint, type Transcriber, type TranscriberEvent } from './domain.js';

/**
 * One recording may listen for this long and no longer (ticket 06).
 *
 * Wrapped around any Transcriber rather than written into each, because the ceiling is
 * blobot's and not the engine's: it counts the audio it was *offered* — taken or dropped, since
 * a dropped chunk was still a moment the user spent talking — and at the limit stops the inner
 * one itself and reports `ended · ceiling` where the inner one would have said `user`.
 */
export function withRecordingCeiling(
  inner: Transcriber,
  limitMs = DICTATION_RECORDING_LIMIT_MS,
): Transcriber {
  let offeredMs = 0;
  let hitCeiling = false;
  let stopping: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    stopping ??= inner.stop();
    return stopping;
  };
  return {
    id: inner.id,
    partials: inner.partials,
    takes: inner.takes,
    start: (hint: SpeechHint) => inner.start(hint),
    feed(pcm) {
      if (hitCeiling) return 'dropped';
      offeredMs += (pcm.byteLength / PCM_BYTES_PER_SECOND) * 1000;
      const answer = inner.feed(pcm);
      if (offeredMs >= limitMs) {
        hitCeiling = true;
        void stop();
      }
      return answer;
    },
    mark: () => inner.mark(),
    stop,
    events: {
      async *[Symbol.asyncIterator](): AsyncIterator<TranscriberEvent> {
        for await (const event of inner.events) {
          if (event.type === 'ended' && hitCeiling) yield { type: 'ended', reason: 'ceiling' };
          else yield event;
        }
      },
    },
  };
}
