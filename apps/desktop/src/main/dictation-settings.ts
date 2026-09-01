import {
  SPEECH_MODELS,
  SPEECH_PROVIDERS,
  WhisperTranscriber,
  measuredReadiness,
  speechModel,
  speechProvider,
  staticReadiness,
  validateSpeechKey,
  type DictationRecord,
  type KeyValidation,
  type SpeechProviderSpec,
  type SqliteStore,
  type Transcriber,
} from '@blobot/core';
import type {
  DictationPatch,
  UiDictationSettings,
  UiDictationState,
  UiSpeechFileState,
  UiSpeechProvider,
} from '../shared/api.js';
import type { SpeechFiles, SpeechFileState, SpeechTarget } from './speech-files.js';
import type { SpeechKeys } from './speech-keys.js';

/**
 * The Dictation section, composed (ticket 10): the row in SQLite, what is on disk, which keys
 * are held and in what form, and the one word the composer needs from all of it.
 *
 * Read whole and replaced whole after every action, so the section never draws two rows that
 * disagree. The composer's word is derived and never stored: `ready` is the row saying *on*
 * **and** the chosen Transcriber actually being there — a model on disk beside an engine, or a
 * provider with a key that was accepted.
 */
export interface DictationSettingsOptions {
  readonly store: () => SqliteStore | undefined;
  readonly files: SpeechFiles;
  readonly keys: SpeechKeys;
  readonly now: () => number;
  /** Every change that could move the composer's word: main pushes a snapshot on it. */
  readonly onChange?: () => void;
  readonly validate?: (provider: SpeechProviderSpec, key: string) => Promise<KeyValidation>;
  /** The remote Transcriber for a provider, with its key. Absent until the adapters exist. */
  readonly remoteFor?: (provider: SpeechProviderSpec, key: string) => Transcriber;
  readonly onStderr?: (line: string) => void;
}

export class DictationSettingsHost {
  readonly #options: DictationSettingsOptions;
  /** What is on disk, cached, because `snapshot()` is synchronous and asks for the word. */
  #states: Partial<Record<SpeechTarget, SpeechFileState>> = {};

  constructor(options: DictationSettingsOptions) {
    this.#options = options;
  }

  /** Read the disk once at launch, and after that only when a file changes. */
  async refresh(): Promise<void> {
    this.#states = await this.#options.files.states();
  }

  noteFile(target: SpeechTarget, state: SpeechFileState): void {
    this.#states[target] = state;
    this.#options.onChange?.();
  }

  record(): DictationRecord | undefined {
    return this.#options.store()?.dictationSettings();
  }

  /** The composer's word, from the row and the disk. Synchronous, for the snapshot. */
  state(): UiDictationState {
    const row = this.record();
    if (row === undefined || !row.enabled) return 'off';
    if (row.transcriber === 'local') {
      return this.#localReady(row.modelId) ? 'ready' : 'unconfigured';
    }
    if (row.transcriber === 'remote') {
      return this.#remoteReady(row.providerId) ? 'ready' : 'unconfigured';
    }
    return 'unconfigured';
  }

  /** The Transcriber the row names, built, or why there is none. */
  transcriberFor(): Transcriber | { readonly error: string } {
    const row = this.record();
    if (row === undefined || !row.enabled) return { error: 'Dictation is off.' };
    if (row.transcriber === 'local') {
      const binary = this.#options.files.enginePath();
      const model = this.#options.files.modelPath(row.modelId as never);
      if (!this.#localReady(row.modelId) || binary === undefined || model === undefined) {
        return { error: 'no speech model · choose one in Settings' };
      }
      return new WhisperTranscriber({
        binary,
        model,
        ...(this.#options.onStderr === undefined ? {} : { onStderr: this.#options.onStderr }),
      });
    }
    if (row.transcriber === 'remote') {
      const provider = speechProvider(row.providerId);
      const key = provider === undefined ? undefined : this.#options.keys.keyFor(provider.id);
      if (provider === undefined || key === undefined) return { error: 'no provider key · paste one in Settings' };
      if (this.#options.remoteFor === undefined) return { error: `${provider.label} is not available yet` };
      return this.#options.remoteFor(provider, key);
    }
    return { error: 'Dictation is on, but nothing is chosen yet. Choose a speech model or a provider in Settings.' };
  }

  /** The local Transcriber for *say something*: the chosen model, or the recommended one. */
  tryoutTranscriber(): Transcriber | { readonly error: string } {
    const row = this.record();
    const modelId = row?.modelId ?? '';
    if (modelId === '' || !this.#localReady(modelId)) return { error: 'download a speech model first' };
    const binary = this.#options.files.enginePath();
    const model = this.#options.files.modelPath(modelId as never);
    if (binary === undefined || model === undefined) return { error: 'download a speech model first' };
    return new WhisperTranscriber({ binary, model });
  }

  async view(): Promise<UiDictationSettings> {
    const row = this.record() ?? {
      enabled: false,
      transcriber: '' as const,
      modelId: '',
      providerId: '',
      readiness: '' as const,
      measuredModelId: '',
      at: 0,
    };
    const facts = await this.#options.files.machineFacts();
    const scan = staticReadiness(facts);
    const footprint = await this.#options.files.footprint();
    const measured = row.measuredRtf !== undefined && row.measuredModelId === row.modelId;
    return {
      enabled: row.enabled,
      transcriber: row.transcriber,
      modelId: row.modelId,
      providerId: row.providerId,
      readiness: {
        word: row.readiness,
        figure: scan.figure,
        ...(scan.reason === undefined ? {} : { reason: scan.reason }),
        ...(scan.recommended === undefined ? {} : { recommended: scan.recommended }),
        ...(measured && row.measuredRtf !== undefined ? { measuredRtf: row.measuredRtf, measuredModelId: row.measuredModelId } : {}),
      },
      models: SPEECH_MODELS.map((model) => ({
        id: model.id,
        label: model.label,
        bytes: model.bytes,
        state: asUiFileState(this.#states[model.id] ?? { state: 'absent' }),
      })),
      engine: asUiFileState(this.#states['engine'] ?? { state: 'absent' }),
      footprint,
      providers: SPEECH_PROVIDERS.map((provider): UiSpeechProvider => ({
        id: provider.id,
        label: provider.label,
        retention: provider.disclosure,
        key: this.#options.keys.describe(provider.id),
      })),
      state: this.state(),
    };
  }

  async set(patch: DictationPatch): Promise<UiDictationSettings> {
    const store = this.#options.store();
    if (store === undefined) return this.view();
    const before = store.dictationSettings();
    let next: DictationRecord = {
      ...before,
      ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
      ...(patch.transcriber === undefined ? {} : { transcriber: patch.transcriber }),
      ...(patch.modelId === undefined ? {} : { modelId: patch.modelId }),
      ...(patch.providerId === undefined ? {} : { providerId: patch.providerId }),
      at: this.#options.now(),
    };
    // Choosing a model is choosing the local Transcriber; choosing a provider, the remote one.
    if (patch.modelId !== undefined && patch.modelId !== '') next = { ...next, transcriber: 'local' };
    if (patch.providerId !== undefined && patch.providerId !== '') next = { ...next, transcriber: 'remote' };
    // The static scan runs when the switch goes on, and never on its own after that.
    if (next.enabled && !before.enabled) {
      next = { ...next, ...this.#scanWith(await this.#options.files.machineFacts(), next) };
    }
    store.saveDictationSettings(next);
    this.#options.onChange?.();
    return this.view();
  }

  /** *check again*: the static stage, by hand. */
  async checkReadiness(): Promise<UiDictationSettings> {
    const store = this.#options.store();
    if (store === undefined) return this.view();
    // The facts before the row, and no await between reading the row and saving it: two of
    // these can run beside each other (a download landing while *check again* is pressed),
    // and a row read across an await is a row somebody else has since written.
    const facts = await this.#options.files.machineFacts();
    const row = store.dictationSettings();
    store.saveDictationSettings({ ...row, ...this.#scanWith(facts, row), at: this.#options.now() });
    this.#options.onChange?.();
    return this.view();
  }

  /** What *say something* measured, kept against the model it measured. */
  recordMeasurement(rtf: number): void {
    const store = this.#options.store();
    if (store === undefined) return;
    const row = store.dictationSettings();
    store.saveDictationSettings({
      ...row,
      readiness: measuredReadiness(rtf),
      measuredRtf: rtf,
      measuredModelId: row.modelId,
      at: this.#options.now(),
    });
    this.#options.onChange?.();
  }

  async download(target: SpeechTarget): Promise<UiDictationSettings> {
    // Not awaited: the row draws the figure as it moves, through `noteFile`.
    void this.#options.files.download(target).then(() => this.#afterDownload(target));
    this.#states[target] = { state: 'downloading', received: 0 };
    return this.view();
  }

  async #afterDownload(target: SpeechTarget): Promise<void> {
    await this.refresh();
    const store = this.#options.store();
    const facts = store === undefined ? undefined : await this.#options.files.machineFacts();
    // The row is read after every await and saved with none in between: the engine and a model
    // finish downloading beside each other, and the one that read the row first must not put
    // it back over the one that wrote it second.
    const row = store?.dictationSettings();
    // After every download the static stage runs again (ticket 08), and a size change returns
    // the measured word to `untested` because the measurement was of the other model.
    if (store !== undefined && row !== undefined && facts !== undefined && row.enabled) {
      let next = { ...row, ...this.#scanWith(facts, row), at: this.#options.now() };
      // A model that just landed becomes the Transcriber **when nothing was chosen yet**:
      // pressing *download* on a size is already the choice, and the first real user stood in
      // front of an installed model, no tick, and no microphone. Never when something is
      // chosen — the user's choice is not overridden by a second download.
      if (
        target !== 'engine' &&
        row.modelId === '' &&
        this.#states[target]?.state === 'installed'
      ) {
        next = { ...next, modelId: target, transcriber: 'local' };
      }
      store.saveDictationSettings(next);
    }
    this.#options.onChange?.();
  }

  async cancelDownload(target: SpeechTarget): Promise<UiDictationSettings> {
    this.#options.files.cancel(target);
    await this.refresh();
    return this.view();
  }

  async remove(target: SpeechTarget): Promise<UiDictationSettings> {
    await this.#options.files.remove(target);
    await this.refresh();
    this.#options.onChange?.();
    return this.view();
  }

  async removeAll(): Promise<UiDictationSettings> {
    await this.#options.files.removeAll();
    await this.refresh();
    this.#options.onChange?.();
    return this.view();
  }

  /**
   * A pasted key: validated against its provider — the key's first trip out — and kept only
   * if accepted. The answer carries why not, in the row's words, never the key.
   */
  async saveKey(providerId: string, key: string): Promise<UiDictationSettings & { readonly rejected?: string }> {
    const provider = speechProvider(providerId);
    if (provider === undefined) return { ...(await this.view()), rejected: 'no such provider' };
    const trimmed = key.trim();
    if (trimmed === '') return { ...(await this.view()), rejected: 'paste a key' };
    const validate = this.#options.validate ?? ((spec, value) => validateSpeechKey(spec, value));
    const outcome = await validate(provider, trimmed);
    if (!outcome.ok) {
      return {
        ...(await this.view()),
        rejected: outcome.reason === 'rejected' ? 'key rejected' : `could not reach ${provider.label} · ${outcome.detail}`,
      };
    }
    this.#options.keys.save(provider.id, trimmed);
    this.#options.onChange?.();
    return this.view();
  }

  async removeKey(providerId: string): Promise<UiDictationSettings> {
    this.#options.keys.remove(providerId);
    this.#options.onChange?.();
    return this.view();
  }

  #scanWith(
    facts: Awaited<ReturnType<SpeechFiles['machineFacts']>>,
    row: DictationRecord,
  ): Pick<DictationRecord, 'readiness' | 'measuredRtf' | 'measuredModelId'> {
    const scan = staticReadiness(facts);
    const measured = row.measuredRtf !== undefined && row.measuredModelId === row.modelId && row.modelId !== '';
    // The measurement wins over the static word, while it is of the model that is chosen.
    if (scan.word === 'untested' && measured && row.measuredRtf !== undefined) {
      return { readiness: measuredReadiness(row.measuredRtf), measuredRtf: row.measuredRtf, measuredModelId: row.measuredModelId };
    }
    return { readiness: scan.word, measuredModelId: '' };
  }

  #localReady(modelId: string): boolean {
    if (speechModel(modelId) === undefined) return false;
    const model = this.#states[modelId as SpeechTarget];
    const engine = this.#states['engine'];
    return model?.state === 'installed' && engine?.state === 'installed';
  }

  #remoteReady(providerId: string): boolean {
    return speechProvider(providerId) !== undefined && this.#options.keys.keyFor(providerId) !== undefined;
  }
}

function asUiFileState(state: SpeechFileState): UiSpeechFileState {
  return state;
}
