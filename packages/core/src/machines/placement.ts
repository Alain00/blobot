import { machineLimits, type MachineLimits } from './resources.js';

/** Chosen for one membership, never inherited from the reusable AgentProfile. */
export type MachinePlacement =
  | { readonly kind: 'local' }
  | { readonly kind: 'box'; readonly limits: MachineLimits };

/** A damaged persisted choice stays visible and cannot be mistaken for legacy local state. */
export type StoredMachinePlacement = MachinePlacement | {
  readonly kind: 'invalid';
  readonly detail: string;
};

/** IPC and persistence both refuse an unknown kind instead of silently running locally. */
export function machinePlacement(value: unknown): MachinePlacement {
  if (value === undefined) return { kind: 'local' };
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid Machine placement.');
  }
  if ('kind' in value && value.kind === 'local' && Object.keys(value).length === 1) return { kind: 'local' };
  if ('kind' in value && value.kind === 'box' && 'limits' in value && Object.keys(value).length === 2 &&
      typeof value.limits === 'object' && value.limits !== null && !Array.isArray(value.limits) &&
      'maxCpus' in value.limits && typeof value.limits.maxCpus === 'number' &&
      'maxMemoryBytes' in value.limits && typeof value.limits.maxMemoryBytes === 'number' &&
      Object.keys(value.limits).length === 2) {
    return { kind: 'box', limits: machineLimits({ maxCpus: value.limits.maxCpus, maxMemoryBytes: value.limits.maxMemoryBytes }) };
  }
  throw new Error('Invalid Machine placement.');
}
