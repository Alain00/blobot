/**
 * What blobot can download for a local Transcriber, pinned here (ticket 09): one URL and one
 * sha256 per file. Nothing is run or loaded unverified, and no URL that is not on this page is
 * ever fetched — the closed list is what keeps *downloaded and installed in-app* from meaning
 * *fetches whatever a page says*.
 */

/** The three sizes, named the way the Settings row names them. */
export type SpeechModelId = 'base' | 'small' | 'turbo';

export interface SpeechModel {
  readonly id: SpeechModelId;
  /** What the row says. */
  readonly label: string;
  readonly file: string;
  readonly url: string;
  readonly bytes: number;
  readonly sha256: string;
  /** Peak resident memory measured on ticket 02, rounded up: the floor readiness reads. */
  readonly ramGb: number;
}

/**
 * whisper.cpp's ggml weights on Hugging Face, sha256 from the LFS API and verified locally on
 * ticket 02. Sizes are what the row shows and what *recovers about* prices.
 */
export const SPEECH_MODELS: readonly SpeechModel[] = [
  {
    id: 'base',
    label: 'small',
    file: 'ggml-base.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    bytes: 147_951_465,
    sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
    ramGb: 0.4,
  },
  {
    id: 'small',
    label: 'medium',
    file: 'ggml-small-q5_1.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin',
    bytes: 190_085_487,
    sha256: 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb',
    ramGb: 0.6,
  },
  {
    id: 'turbo',
    label: 'large',
    file: 'ggml-large-v3-turbo-q5_0.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin',
    bytes: 574_041_195,
    sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
    ramGb: 1.0,
  },
];

export function speechModel(id: string): SpeechModel | undefined {
  return SPEECH_MODELS.find((model) => model.id === id);
}

/**
 * The engine: `whisper-cli` from whisper.cpp `b4938`, **built by blobot's own CI** for every
 * OS (`.github/workflows/whisper-cli.yml`) and published as a GitHub release under blobot's own
 * tag. Upstream's Linux and Windows assets exist and are not used: one provenance, one URL
 * pattern, one checksum flow. Metal on Apple Silicon, CPU elsewhere; Linux GPU is not offered.
 */
export const WHISPER_SOURCE_TAG = 'b4938';
export const WHISPER_RELEASE_TAG = 'whisper-b4938-1';
const RELEASE = `https://github.com/Alain00/blobot/releases/download/${WHISPER_RELEASE_TAG}`;

export interface EngineBuild {
  readonly platform: 'darwin' | 'linux' | 'win32';
  readonly arch: 'arm64' | 'x64';
  readonly asset: string;
  readonly url: string;
  /**
   * Pinned once the release exists. `undefined` is a refusal, not a skip: a build without a
   * hash is not fetched, and the Settings row says so.
   */
  readonly sha256?: string;
  readonly bytes?: number;
}

export const ENGINE_BUILDS: readonly EngineBuild[] = [
  { platform: 'darwin', arch: 'arm64', asset: 'whisper-cli-darwin-arm64', url: `${RELEASE}/whisper-cli-darwin-arm64` },
  { platform: 'linux', arch: 'x64', asset: 'whisper-cli-linux-x64', url: `${RELEASE}/whisper-cli-linux-x64` },
  { platform: 'linux', arch: 'arm64', asset: 'whisper-cli-linux-arm64', url: `${RELEASE}/whisper-cli-linux-arm64` },
  { platform: 'win32', arch: 'x64', asset: 'whisper-cli-win32-x64.exe', url: `${RELEASE}/whisper-cli-win32-x64.exe` },
];

export function engineBuildFor(platform: string, arch: string): EngineBuild | undefined {
  return ENGINE_BUILDS.find((build) => build.platform === platform && build.arch === arch);
}
