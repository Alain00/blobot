import { describe, expect, it } from 'vitest';
import { ownOriginsFor, permissionAllowed } from './web-permissions.js';

const own = ['file://'];
const yes = (): boolean => true;
const no = (): boolean => false;

describe('the renderer permission allowlist', () => {
  it('grants the microphone, from its own origin, while dictation may use it', () => {
    const request = { permission: 'media', mediaTypes: ['audio'], requestingUrl: 'file:///app/index.html', securityOrigin: 'file:///' };
    expect(permissionAllowed(request, own, yes)).toBe(true);
    expect(permissionAllowed(request, own, no)).toBe(false);
    // The check handler's shape: one word rather than a list.
    expect(permissionAllowed({ permission: 'media', mediaType: 'audio', requestingUrl: 'file:///app/index.html' }, own, yes)).toBe(true);
  });

  it('refuses the camera, even beside the microphone', () => {
    expect(permissionAllowed({ permission: 'media', mediaTypes: ['video'], requestingUrl: 'file:///a' }, own, yes)).toBe(false);
    expect(permissionAllowed({ permission: 'media', mediaTypes: ['audio', 'video'], requestingUrl: 'file:///a' }, own, yes)).toBe(false);
    expect(permissionAllowed({ permission: 'media', mediaType: 'video', requestingUrl: 'file:///a' }, own, yes)).toBe(false);
    expect(permissionAllowed({ permission: 'media', mediaType: 'unknown', requestingUrl: 'file:///a' }, own, yes)).toBe(false);
  });

  it('refuses everything else Chromium asks about', () => {
    for (const permission of ['geolocation', 'notifications', 'speaker-selection', 'display-capture', 'clipboard-read', 'fullscreen']) {
      expect(permissionAllowed({ permission, requestingUrl: 'file:///a' }, own, yes)).toBe(false);
    }
  });

  it('refuses another origin outright', () => {
    expect(permissionAllowed({ permission: 'media', mediaTypes: ['audio'], requestingUrl: 'https://example.com/' }, own, yes)).toBe(false);
    expect(permissionAllowed({ permission: 'media', mediaTypes: ['audio'] }, own, yes)).toBe(false);
  });

  it('knows its own origin in dev and in production', () => {
    expect(ownOriginsFor(undefined)).toEqual(['file://']);
    expect(ownOriginsFor('http://localhost:5173/')).toEqual(['http://localhost:5173']);
    expect(permissionAllowed({ permission: 'media', mediaTypes: ['audio'], requestingUrl: 'http://localhost:5173/index.html' }, ownOriginsFor('http://localhost:5173/'), yes)).toBe(true);
  });
});
