import { openMicrophone, type Microphone } from './capture.js';
import { Segmenter, chunkEnergy } from './segmenter.js';

/**
 * One recording from the renderer's side: the microphone open, the segmenter cutting, the
 * chunks and the marks going to main. Shared by the composer's hook and by Settings' *say
 * something* row, which is the same recording with a different place behind it.
 */
export interface Recording {
  /** The microphone's RMS, 0..1, for the wave. */
  level(): number;
  /** Close the microphone, flush what the segmenter holds, and mark the open segment. */
  stop(): Promise<void>;
}

export interface RecordingOptions {
  readonly takes: 'segments' | 'stream';
  /** Told when a chunk was dropped by main — backpressure — so the word can say `paused`. */
  readonly onDrop?: () => void;
}

export async function startRecording(options: RecordingOptions): Promise<Recording> {
  const segmenter = new Segmenter({ takes: options.takes });
  let open = true;
  const mic = await openMicrophone((pcm) => {
    if (!open) return;
    const chunk = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    for (const action of segmenter.push(chunk, chunkEnergy(pcm))) {
      if (action.kind === 'mark') window.blobot.markDictation();
      else
        void window.blobot.feedDictation(action.chunk).then((answer) => {
          if (answer === 'dropped') options.onDrop?.();
        });
    }
  });
  return {
    level: mic.level,
    stop: async () => {
      if (!open) return;
      open = false;
      await mic.stop();
      for (const action of segmenter.flush()) {
        if (action.kind === 'mark') window.blobot.markDictation();
        else void window.blobot.feedDictation(action.chunk);
      }
    },
  };
}

/** A spoken-sentence envelope, for a screenshot with nobody at the microphone. */
export function simulatedLevel(began: number): () => number {
  return () => {
    const t = (performance.now() - began) / 1000;
    // Syllables at ~4 Hz under a phrase that swells and falls every 2.4 s, with a pause.
    const phrase = Math.max(0, Math.sin((t / 2.4) * Math.PI));
    return phrase * (0.55 + 0.45 * Math.abs(Math.sin(t * Math.PI * 4))) * 0.08;
  };
}
