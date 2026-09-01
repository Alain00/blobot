/**
 * The closed list of remote Transcribers (ADR-0005 clause 3; `.scratch/dictation/research/03`).
 *
 * A provider is here only if its API is transcription and not a general model endpoint, if the
 * retention sentence blobot draws can be made true by something blobot controls on every
 * request, and if it takes a plain API key. Adding one that meets the criteria is ordinary
 * work in this table; changing a criterion reopens the ADR. Bring-your-own endpoint is refused,
 * because this list is what keeps a voice from being sent *anywhere*.
 *
 * Each entry carries the one header its key rides on, the zero-spend GET that answers *is this
 * key accepted* without audio, and **the retention sentence**, which is the thing the Settings
 * section prints under the provider's name and must stay true or the entry comes off.
 */
export type SpeechProviderId = 'openai' | 'deepgram' | 'mistral';

export interface SpeechProviderSpec {
  readonly id: SpeechProviderId;
  readonly label: string;
  readonly auth: { readonly header: 'Authorization'; readonly scheme: 'Bearer' | 'Token' };
  /** Key validation: a GET with the key and no audio, which costs nothing. */
  readonly probe: string;
  /** Whether it streams real partials over a socket. */
  readonly partials: boolean;
  /** The retention sentence, from the provider's own documents (research 03 §9). */
  readonly disclosure: string;
}

export const SPEECH_PROVIDERS: readonly SpeechProviderSpec[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    auth: { header: 'Authorization', scheme: 'Bearer' },
    probe: 'https://api.openai.com/v1/models',
    partials: true,
    disclosure:
      'Audio is sent to OpenAI and transcribed there. OpenAI does not train on API data; for ' +
      'live dictation an abuse-monitoring log is kept for up to 30 days.',
  },
  {
    id: 'deepgram',
    label: 'Deepgram',
    auth: { header: 'Authorization', scheme: 'Token' },
    probe: 'https://api.deepgram.com/v1/projects',
    partials: true,
    disclosure:
      "Audio is sent to Deepgram and transcribed there. blobot opts every request out of Deepgram's " +
      'model-improvement program, so the audio is kept only for the duration of the request and is ' +
      'not used for training.',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    auth: { header: 'Authorization', scheme: 'Bearer' },
    probe: 'https://api.mistral.ai/v1/models',
    partials: false,
    disclosure:
      'Audio is sent to Mistral and transcribed there. Mistral keeps it for 30 days to monitor ' +
      'abuse. A pay-as-you-go account is not trained on; a free Studio account is, unless you turn ' +
      "that off in Mistral's privacy settings.",
  },
];

export function speechProvider(id: string): SpeechProviderSpec | undefined {
  return SPEECH_PROVIDERS.find((provider) => provider.id === id);
}

/** The header a key rides on, spelled the provider's way. */
export function authorizationFor(provider: SpeechProviderSpec, key: string): Record<string, string> {
  return { [provider.auth.header]: `${provider.auth.scheme} ${key}` };
}

export type KeyValidation =
  | { readonly ok: true }
  /** The provider said no: 401 or 403. */
  | { readonly ok: false; readonly reason: 'rejected' }
  /** The provider could not be reached, or answered something that is not an answer. */
  | { readonly ok: false; readonly reason: 'network'; readonly detail: string };

/**
 * The paste-time check (ADR-0005 clause 4): the key's first trip out, to its own provider
 * only, against an endpoint that spends nothing. Never a regex — no provider documents a
 * key prefix.
 */
export async function validateSpeechKey(
  provider: SpeechProviderSpec,
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<KeyValidation> {
  let response: Response;
  try {
    response = await fetchImpl(provider.probe, {
      method: 'GET',
      headers: { ...authorizationFor(provider, key), Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    return { ok: false, reason: 'network', detail: error instanceof Error ? error.message : String(error) };
  }
  if (response.ok) return { ok: true };
  if (response.status === 401 || response.status === 403) return { ok: false, reason: 'rejected' };
  return { ok: false, reason: 'network', detail: `${response.status} ${response.statusText}`.trim() };
}
