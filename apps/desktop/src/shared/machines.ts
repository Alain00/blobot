import type { MachineReadiness, MachinePlacement, MachinePower, MachineDetection, RuntimeLoginMethod } from '@blobot/core';

export interface SetupProgress {
  readonly id: string;
  readonly phase: 'starting' | 'downloading' | 'waiting' | 'checking' | 'done' | 'failed' | 'cancelled';
  readonly detail: string;
  readonly received?: number;
  readonly total?: number;
}
export interface EngineSetupView {
  readonly previewEnabled: boolean;
  readonly configuredMachines: readonly UiConfiguredMachine[];
  readonly readiness: MachineReadiness;
  readonly canInstall: boolean;
  readonly kvmAvailable: boolean;
  readonly operation?: SetupProgress;
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
  readonly placement: MachinePlacement;
  readonly power: MachinePower;
  readonly detection?: MachineDetection;
  readonly methods: readonly RuntimeLoginMethod[];
  readonly operation?: SetupProgress;
  readonly challenge?: UiLoginChallenge;
}
