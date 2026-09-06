import type { MachineLimits } from './resources.js';
import type { MachineDetection } from '../detect/machine-runtime.js';

/** Optional guest-runtime management; consumers do not depend on a desktop implementation. */
export interface MachineRuntimeAccess {
  readonly lastDetection: MachineDetection | undefined;
  check(): Promise<MachineDetection>;
  beforeStart(): Promise<void>;
}

/** A process channel, independent of ACP, Electron and any particular engine. */
export interface MachineTransport {
  write(line: string): void;
  lines(): AsyncIterable<string>;
  close(): Promise<void>;
  onClose(listener: (reason: string | undefined) => void): () => void;
}

export type MachineKind = 'local' | 'box';

/** Paths are in the Machine's namespace, never implicitly paths on the host. */
export type MachineCommand =
  | { readonly kind: 'exec'; readonly executable: string; readonly args: readonly string[] }
  | {
      readonly kind: 'node-module';
      readonly package: string;
      readonly version: string;
      readonly entry: string;
      /** Packaging overrides for local execution only. A box resolves its own package. */
      readonly localEntryPath?: string;
    };

export interface MachineSpawnRequest {
  readonly command: MachineCommand;
  readonly cwd: string;
  /** Only explicitly supplied entries travel. Host inheritance belongs to LocalMachine. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly onStderr?: (line: string) => void;
  /** Adapter-owned configuration applied in the guest before spawning its process. */
  readonly configs?: readonly MachineConfigPatch[];
}

export interface MachineConfigPatch {
  readonly root: string;
  readonly relativePath: string;
  readonly patch: Readonly<Record<string, unknown>>;
}

/** Adapter-owned image requirement, with no runtime-id switch or provider domain catalog. */
export interface MachineRuntimeRequirements {
  readonly image: string;
}

export interface MachineIdentity {
  readonly agentId: string;
  readonly workspacePath: string;
}

export interface MachineLocation extends MachineIdentity {
  readonly kind: MachineKind;
  /** An operator directory explicitly shared readonly; never the whole operator home. */
  readonly sharedSkillsPath?: string;
  /** Local execution has no owned volumes. Never describe the user's home as our volume. */
  readonly volumes: { readonly data: string; readonly workspace: string | null } | null;
}

export type MachineReadiness =
  | { readonly state: 'ready' }
  | { readonly state: 'not_installed' | 'needs_sign_in' | 'unknown'; readonly detail: string };

export type MachineReconcileOutcome =
  | { readonly state: 'ok' | 'repaired'; readonly location: MachineLocation }
  | { readonly state: 'absent' | 'lost'; readonly detail: string };

export interface MachineStartRequest {
  /** Cancel preparation between native operations, retaining any already-created storage. */
  readonly signal?: AbortSignal;
  readonly mailboxPort: number;
  readonly runtime?: MachineRuntimeRequirements;
}

/**
 * One instance per Agent. A stop keeps all work and login state; destroy is an explicit,
 * separate operation, called only after the Workspace provider has preserved the work.
 * Engine readiness is not a runtime login check, nor evidence of the mailbox handshake.
 */
export interface Machine {
  readonly kind: MachineKind;
  readonly runtimeAccess?: MachineRuntimeAccess;
  location(): MachineLocation;
  readiness(): Promise<MachineReadiness>;
  reconcile(): Promise<MachineReconcileOutcome>;
  start(request: MachineStartRequest): Promise<MachineLocation>;
  /** Fresh engine check before a turn; implementations must not silently relocate execution. */
  beforeWork?(): Promise<void>;
  /** Intentional same-Agent replacement; callers first quiesce runtime work with consent. */
  reconfigure?(limits: MachineLimits, options?: { readonly signal?: AbortSignal; readonly timeoutMs?: number }): Promise<void>;
  spawn(request: MachineSpawnRequest): MachineTransport;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  /** Only engine-owned storage; null means it could not be measured, never zero. */
  measure(): Promise<number | null>;
  /** The address seen by the agent. The server itself always binds host loopback. */
  readonly mailboxHostname: '127.0.0.1' | 'host.docker.internal';
}

export class MachineUnavailableError extends Error {
  constructor(readonly kind: MachineKind, message: string) {
    super(message);
    this.name = 'MachineUnavailableError';
  }
}
