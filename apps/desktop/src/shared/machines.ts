import type { MachineReadiness, StoredMachinePlacement, MachinePower, MachineDetection, RuntimeLoginMethod } from '@blobot/core';

export interface SetupProgress {
  readonly id: string;
  readonly phase: 'starting' | 'downloading' | 'waiting' | 'checking' | 'done' | 'failed' | 'cancelled';
  readonly detail: string;
  readonly received?: number;
  readonly total?: number;
}
export interface EngineSetupView {
  readonly host?: { readonly cpus: number; readonly memoryBytes: number };
  readonly previewEnabled: boolean;
  readonly configuredMachines: readonly UiConfiguredMachine[];
  readonly readiness: MachineReadiness;
  readonly canInstall: boolean;
  readonly kvmAvailable: boolean;
  readonly operation?: SetupProgress;
  readonly sleepError?: string;
  readonly inventory?: UiMachineInventory;
}
export interface UiMachineInventory {
  readonly state: 'ready' | 'unknown';
  readonly detail?: string;
  readonly entries: readonly UiMachineInventoryEntry[];
  /** Download archives only; engine-managed images and private disks have no verified byte metric. */
  readonly downloadCacheBytes: number | null;
}
export interface UiMachineInventoryEntry {
  readonly id: string;
  readonly name: string;
  readonly agentId?: string;
  readonly agentName?: string;
  readonly teamName?: string;
  readonly kind: 'active' | 'retained' | 'pending' | 'unclaimed' | 'unverified';
  readonly presence: 'present' | 'missing' | 'unknown';
  readonly canRemove: boolean;
  readonly detail: string;
}
export interface UiConfiguredMachine {
  readonly teamId: string;
  readonly agentId: string;
  readonly teamName: string;
  readonly agentName: string;
  readonly limits: { readonly maxCpus: number; readonly maxMemoryBytes: number };
}
export type UiLoginChallenge =
  | { readonly kind: 'browser'; readonly url: string; readonly code?: string; readonly input?: string; readonly detail?: string }
  | { readonly kind: 'choice'; readonly label: string; readonly choices: readonly { readonly value: string; readonly label: string }[] };
export interface UiAgentMachine {
  readonly pendingMessages: number;
  readonly placement: StoredMachinePlacement;
  readonly power: MachinePower;
  readonly detection?: MachineDetection;
  readonly methods: readonly RuntimeLoginMethod[];
  readonly operation?: SetupProgress;
  readonly challenge?: UiLoginChallenge;
  readonly failure?: string;
  readonly preparation?: SetupProgress;
  readonly storage?: { readonly homeBytes: number; readonly softwareBytes: number };
}
