import type { Session } from 'electron';

/**
 * What the renderer may ask the browser for. An **allowlist**, and a short one.
 *
 * Electron's default with no handler installed is to *grant* — every permission, to every
 * origin — and blobot had no handler, so a `getUserMedia` from the renderer returned a track
 * with nothing decided by blobot (`.scratch/dictation/` ticket 04, measured on Electron 44).
 * This is the repo's own posture applied to the one place the platform's default is the
 * opposite: a menu that fails closed (ADR-0003).
 *
 * Two handlers, because the docs say one is incomplete: most web APIs *check* first and only
 * *request* if the check is denied, so a request handler alone answers half the questions.
 *
 * The microphone is the only thing granted, and only while dictation may use it. Chromium
 * asks about the camera on load, about `speaker-selection`, about `geolocation` and
 * `notifications` — all of it is refused, because nothing in blobot does any of it.
 */
export interface PermissionAsk {
  readonly permission: string;
  /** On a request: which media, as a list. */
  readonly mediaTypes?: readonly string[];
  /** On a check: which media, as one word. */
  readonly mediaType?: string;
  readonly requestingUrl?: string;
  readonly securityOrigin?: string;
}

export function permissionAllowed(
  ask: PermissionAsk,
  ownOrigins: readonly string[],
  microphoneAllowed: () => boolean,
): boolean {
  if (ask.permission !== 'media') return false;
  const from = ask.requestingUrl ?? ask.securityOrigin ?? '';
  if (!ownOrigins.some((origin) => from.startsWith(origin))) return false;
  const types = ask.mediaTypes ?? (ask.mediaType === undefined ? [] : [ask.mediaType]);
  if (types.length === 0 || types.some((type) => type !== 'audio')) return false;
  return microphoneAllowed();
}

/**
 * Where blobot's own renderer comes from. Production loads `file://…/index.html`; dev loads the
 * electron-vite server, whose origin is whatever `ELECTRON_RENDERER_URL` says.
 */
export function ownOriginsFor(devServerUrl: string | undefined): readonly string[] {
  if (devServerUrl === undefined) return ['file://'];
  try {
    return [new URL(devServerUrl).origin];
  } catch {
    return ['file://'];
  }
}

export function installWebPermissions(
  session: Session,
  ownOrigins: readonly string[],
  microphoneAllowed: () => boolean,
): void {
  session.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(permissionAllowed({ permission, ...asAsk(details) }, ownOrigins, microphoneAllowed));
  });
  session.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) =>
    permissionAllowed(
      { permission, requestingUrl: requestingOrigin, ...asAsk(details) },
      ownOrigins,
      microphoneAllowed,
    ),
  );
}

/** The fields the two handlers' detail objects may carry, read without trusting their shape. */
function asAsk(details: unknown): Omit<PermissionAsk, 'permission'> {
  const bag = (details ?? {}) as Record<string, unknown>;
  return {
    ...(Array.isArray(bag['mediaTypes'])
      ? { mediaTypes: bag['mediaTypes'].filter((it): it is string => typeof it === 'string') }
      : {}),
    ...(typeof bag['mediaType'] === 'string' ? { mediaType: bag['mediaType'] } : {}),
    ...(typeof bag['requestingUrl'] === 'string' ? { requestingUrl: bag['requestingUrl'] } : {}),
    ...(typeof bag['securityOrigin'] === 'string' ? { securityOrigin: bag['securityOrigin'] } : {}),
  };
}
