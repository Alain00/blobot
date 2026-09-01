import { PCM_16K_MONO_INT16 } from '@blobot/core/domain';

/**
 * The microphone, as a stream of 100 ms Int16 chunks at 16 kHz (ticket 04, measured).
 *
 * `AudioContext({sampleRate: 16000})` makes Chromium resample the device's 48 kHz for free, so
 * no resampler is written or shipped; an AudioWorklet accumulates 1,600 frames and posts them
 * as one transferred buffer. The level for the wave comes from an `AnalyserNode` on the same
 * source, read on demand and never sent anywhere.
 *
 * Nothing here names a device or a path. The renderer ships samples, and only samples.
 */
export interface Microphone {
  /** RMS of the last few milliseconds, 0..1. Cheap; read it every frame. */
  level(): number;
  stop(): Promise<void>;
}

const FRAMES_PER_CHUNK = (PCM_16K_MONO_INT16.sampleRate * PCM_16K_MONO_INT16.chunkMs) / 1000;

/**
 * The worklet, as source. It runs on the audio thread and must return quickly, so it does the
 * one cheap thing — clamp, scale, fill — and posts once per chunk rather than once per render
 * quantum (125 times a second). A blob URL rather than a file, because the bundler has no
 * notion of an AudioWorklet module and a stray asset path is one more thing to package.
 */
const WORKLET = `
class BlobotPcm16 extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(${FRAMES_PER_CHUNK});
    this.filled = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, channel[i]));
      this.buffer[this.filled] = sample < 0 ? sample * 32768 : sample * 32767;
      this.filled += 1;
      if (this.filled === this.buffer.length) {
        const out = this.buffer;
        this.port.postMessage(out, [out.buffer]);
        this.buffer = new Int16Array(${FRAMES_PER_CHUNK});
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor('blobot-pcm16', BlobotPcm16);
`;

export class MicrophoneRefused extends Error {
  constructor(readonly sentence: string) {
    super(sentence);
  }
}

export async function openMicrophone(onChunk: (pcm: Int16Array) => void): Promise<Microphone> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError')
      throw new MicrophoneRefused('stopped · the microphone was refused');
    if (name === 'NotFoundError' || name === 'OverconstrainedError')
      throw new MicrophoneRefused('stopped · no microphone was found');
    throw new MicrophoneRefused('stopped · the microphone could not be opened');
  }

  const context = new AudioContext({ sampleRate: PCM_16K_MONO_INT16.sampleRate });
  const moduleUrl = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
  try {
    await context.audioWorklet.addModule(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  const samples = new Float32Array(analyser.fftSize);
  const worklet = new AudioWorkletNode(context, 'blobot-pcm16', {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
    channelCountMode: 'explicit',
  });
  worklet.port.onmessage = (event: MessageEvent<Int16Array>) => onChunk(event.data);
  source.connect(analyser);
  source.connect(worklet);
  if (context.state !== 'running') await context.resume();

  return {
    level: () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i += 1) sum += (samples[i] as number) ** 2;
      return Math.sqrt(sum / samples.length);
    },
    stop: async () => {
      worklet.port.onmessage = null;
      source.disconnect();
      worklet.disconnect();
      analyser.disconnect();
      for (const track of stream.getTracks()) track.stop();
      // The audio is discarded once transcribed (the map's rule); closing the context is the
      // last of it going.
      await context.close().catch(() => undefined);
    },
  };
}
