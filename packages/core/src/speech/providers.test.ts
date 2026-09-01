import { describe, expect, it } from 'vitest';
import { SPEECH_PROVIDERS, authorizationFor, speechProvider, validateSpeechKey } from './providers.js';

const answer = (status: number): typeof fetch => async () => new Response('{}', { status, statusText: 'x' });

describe('the closed provider list', () => {
  it('has three entries, each with a retention sentence that names the provider', () => {
    expect(SPEECH_PROVIDERS.map((p) => p.id)).toEqual(['openai', 'deepgram', 'mistral']);
    for (const provider of SPEECH_PROVIDERS) expect(provider.disclosure).toContain(provider.label);
  });

  it('spells the header the provider’s way', () => {
    expect(authorizationFor(speechProvider('deepgram')!, 'k')).toEqual({ Authorization: 'Token k' });
    expect(authorizationFor(speechProvider('openai')!, 'k')).toEqual({ Authorization: 'Bearer k' });
  });

  it('validates a key with the probe and never a regex', async () => {
    const openai = speechProvider('openai')!;
    let seen: { url: string; headers: Record<string, string> } | undefined;
    const spy: typeof fetch = async (url, init) => {
      seen = { url: String(url), headers: (init?.headers ?? {}) as Record<string, string> };
      return new Response('{}', { status: 200 });
    };
    expect(await validateSpeechKey(openai, 'anything-at-all', spy)).toEqual({ ok: true });
    expect(seen?.url).toBe('https://api.openai.com/v1/models');
    expect(seen?.headers['Authorization']).toBe('Bearer anything-at-all');
    expect(await validateSpeechKey(openai, 'bad', answer(401))).toEqual({ ok: false, reason: 'rejected' });
    expect(await validateSpeechKey(openai, 'bad', answer(500))).toEqual({ ok: false, reason: 'network', detail: '500 x' });
    const down: typeof fetch = async () => {
      throw new Error('ENOTFOUND');
    };
    expect(await validateSpeechKey(openai, 'k', down)).toEqual({ ok: false, reason: 'network', detail: 'ENOTFOUND' });
  });
});
