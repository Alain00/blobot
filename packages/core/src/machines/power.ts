/** Execution power is independent of the Agent's turn status and runtime sign-in. */
export type MachinePower = 'awake' | 'asleep' | 'waking' | 'sleeping' | 'unknown';

export const DEFAULT_MACHINE_IDLE_MS = 2 * 60 * 60_000;

export function machineIdleMs(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 365 * 24 * 60 * 60_000) {
    throw new Error('Idle sleep must be a nonnegative duration of at most one year.');
  }
  return value; // zero explicitly disables automatic sleep
}
