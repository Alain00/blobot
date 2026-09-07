/** Execution ceilings, not reservations or a measurement of host consumption. */
export interface MachineLimits {
  readonly maxCpus: number;
  readonly maxMemoryBytes: number;
}

export const DEFAULT_MACHINE_LIMITS: MachineLimits = Object.freeze({
  maxCpus: 2,
  maxMemoryBytes: 4 * 1024 ** 3,
});

export function machineLimits(value: MachineLimits): MachineLimits {
  if (!Number.isSafeInteger(value.maxCpus) || value.maxCpus < 1 || value.maxCpus > 1024) {
    throw new Error('Maximum CPUs must be a whole number between 1 and 1024.');
  }
  if (!Number.isSafeInteger(value.maxMemoryBytes) || value.maxMemoryBytes < 64 * 1024 ** 2 ||
      value.maxMemoryBytes % (1024 ** 2) !== 0) {
    throw new Error('Maximum RAM must be a whole number of MiB, at least 64 MiB.');
  }
  return Object.freeze({ maxCpus: value.maxCpus, maxMemoryBytes: value.maxMemoryBytes });
}

export function sameMachineLimits(a: MachineLimits, b: MachineLimits): boolean {
  return a.maxCpus === b.maxCpus && a.maxMemoryBytes === b.maxMemoryBytes;
}
