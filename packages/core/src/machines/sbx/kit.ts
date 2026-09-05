/** A root kit, never a mixin over a vendor's permissive agent kit. */
export interface SbxKitOptions {
  readonly image: string;
  readonly guestNode: string;
  readonly dataBytes: number;
  readonly workspaceBytes: number;
}

/** No slugging or truncation: two distinct Agent ids must never adopt the same volumes. */
export function sbxNameFor(agentId: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,95}$/.test(agentId)) throw new Error('Invalid Machine Agent id');
  return `blobot-${agentId}`;
}

export function sbxKit(options: SbxKitOptions) {
  if (options.image.trim() === '' || /[\s\0]/.test(options.image)) throw new Error('Invalid Machine image');
  if (!options.guestNode.startsWith('/') || options.guestNode.includes('\0')) throw new Error('Invalid guest Node path');
  for (const size of [options.dataBytes, options.workspaceBytes]) {
    if (!Number.isSafeInteger(size) || size < 512 * 1024 * 1024) throw new Error('Invalid Machine volume size');
  }
  return {
    schemaVersion: '2',
    kind: 'sandbox',
    name: 'blobot',
    sandbox: {
      image: options.image,
      // Creating/attaching the kit must not start a runtime outside our prepared exec path.
      entrypoint: [options.guestNode],
      command: { default: ['--version'] },
    },
    credentials: [],
    permissions: { network: { allow: [], deny: [] } },
    // Block volumes arrive owned by root. This synchronous setup must finish before any
    // user process writes a login or configuration; startup hooks do not gate exec.
    setup: { install: [{ user: '0', command: 'chown 1000:1000 /home/agent /workspace && chmod 0700 /home/agent /workspace' }] },
    volumes: [
      { path: '/home/agent', size: String(options.dataBytes), mode: '0700' },
      { path: '/workspace', size: String(options.workspaceBytes), mode: '0700' },
    ],
  } as const;
}

/** JSON is a YAML subset; values cannot inject extra kit fields through YAML syntax. */
export function renderSbxKit(options: SbxKitOptions): string {
  return `${JSON.stringify(sbxKit(options), null, 2)}\n`;
}
