import { SPEECH_DISK_MARGIN, SPEECH_FIT_RTF, SPEECH_RAM_FLOORS_GB } from '../orchestrator/bounds.js';
import { SPEECH_MODELS, type SpeechModel, type SpeechModelId } from './catalog.js';

/**
 * Whether this machine can carry a local Transcriber (ticket 08). Four words, blobot's own,
 * monochrome like detection's: measured, never promised, never *supported*.
 *
 * - `unfit`: the static stage fails; remote only, with the figure that failed.
 * - `untested`: the static stage passes; nothing measured yet; sizes offered, one recommended.
 * - `fit`: measured, responsive. `slow`: measured, over the threshold; still eligible, and the
 *   line offers stepping down a size.
 */
export type SpeechReadiness = 'unfit' | 'untested' | 'fit' | 'slow';

/** What the static stage reads, all from Node and no subprocess. */
export interface MachineFacts {
  readonly totalMemBytes: number;
  readonly platform: string;
  readonly arch: string;
  /** Under blobot's data folder, where the weights would go. */
  readonly freeDiskBytes: number;
}

export interface StaticReadiness {
  readonly word: 'unfit' | 'untested';
  /** The largest size that fits, when one does. Quality is what is being bought. */
  readonly recommended?: SpeechModelId;
  /** The figure the row shows beside the word: `24 GB · Apple Silicon`, `3.2 GB RAM`. */
  readonly figure: string;
  /** Why it is unfit, when it is, in the row's own words. */
  readonly reason?: string;
}

/** Memory is sold and spoken of in GiB — a 24 GB machine reports 25.77e9 bytes — and disk in GB. */
const GIB = 1_073_741_824;
const GB = 1_000_000_000;

/**
 * RAM, then disk. No GPU probe: the binaries are Metal on Apple Silicon and CPU elsewhere, and
 * CPU reaches turbo, so speed is the measured stage's answer and not this one's.
 */
export function staticReadiness(facts: MachineFacts): StaticReadiness {
  const ramGb = facts.totalMemBytes / GIB;
  const figure = `${formatGb(ramGb)} · ${describeMachine(facts.platform, facts.arch)}`;
  const recommended = largestThatFits(ramGb);
  if (recommended === undefined) {
    return { word: 'unfit', figure: `${formatGb(ramGb)} RAM`, reason: 'not enough memory for a speech model' };
  }
  const needed = recommended.bytes * SPEECH_DISK_MARGIN;
  if (facts.freeDiskBytes < needed) {
    return {
      word: 'unfit',
      figure: `${formatGb(facts.freeDiskBytes / GB)} free`,
      reason: `${formatGb(needed / GB)} of free disk is needed for the ${recommended.label} model`,
    };
  }
  return { word: 'untested', recommended: recommended.id, figure };
}

function largestThatFits(ramGb: number): SpeechModel | undefined {
  const floors = SPEECH_RAM_FLOORS_GB;
  const id: SpeechModelId | undefined =
    ramGb >= floors.turbo ? 'turbo' : ramGb >= floors.small ? 'small' : ramGb >= floors.base ? 'base' : undefined;
  return id === undefined ? undefined : SPEECH_MODELS.find((model) => model.id === id);
}

/** The measured word: real-time factor from a real sentence in *say something*. */
export function measuredReadiness(rtf: number): 'fit' | 'slow' {
  return rtf <= SPEECH_FIT_RTF ? 'fit' : 'slow';
}

/** `0.4× real time`, the figure the measured line carries. */
export function describeRtf(rtf: number): string {
  return `${rtf < 0.1 ? rtf.toFixed(2) : rtf.toFixed(1)}× real time`;
}

function formatGb(gb: number): string {
  return gb >= 10 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`;
}

function describeMachine(platform: string, arch: string): string {
  if (platform === 'darwin' && arch === 'arm64') return 'Apple Silicon';
  if (platform === 'darwin') return 'Intel Mac';
  const os = platform === 'linux' ? 'Linux' : platform === 'win32' ? 'Windows' : platform;
  return `${os} ${arch}`;
}
