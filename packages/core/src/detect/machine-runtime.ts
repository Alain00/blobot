import { RUNTIME_PROBES, type CommandRunner, type RuntimeDetection, type RuntimeReadiness } from './runtimes.js';
import type { MachineReadiness } from '../machines/machine.js';
import type { MachinePower } from '../machines/power.js';

export type DetectionSubject =
  | { readonly kind: 'engine'; readonly engine: 'sbx' }
  | { readonly kind: 'agent'; readonly agentId: string };

export interface MachineDetection {
  readonly subject: DetectionSubject;
  readonly readiness: RuntimeReadiness;
  readonly detail: string;
  readonly runtimeId?: string;
}

export function engineDetection(value: MachineReadiness): MachineDetection {
  return { subject: { kind: 'engine', engine: 'sbx' }, readiness: value.state,
    detail: value.state === 'ready' ? 'Sandbox engine is ready on this computer.' : value.detail };
}

export interface AgentProbeAccess {
  readonly agentId: string;
  readonly runtimeId: string;
  readonly power: () => MachinePower;
  /** The execution owner serializes this with sleep; undefined means no awake execution. */
  readonly inspect: <T>(read: () => Promise<T>) => Promise<T | undefined>;
  /** Bound to this admitted Machine. Never the host discovery runner or a host home path. */
  readonly run: CommandRunner;
}

/** Four existing words, a mandatory subject, and no remembered login tick for sleeping Agents. */
export async function detectAgentRuntime(access: AgentProbeAccess): Promise<MachineDetection> {
  const base = { subject: { kind: 'agent' as const, agentId: access.agentId }, runtimeId: access.runtimeId };
  const probe = RUNTIME_PROBES.find((candidate) => candidate.runtimeId === access.runtimeId);
  if (probe === undefined) return { ...base, readiness: 'unknown', detail: 'This runtime has no readiness probe.' };
  try {
    const result = await access.inspect(async (): Promise<Pick<RuntimeDetection, 'readiness' | 'detail'>> => {
      const located = await access.run('command', ['-v', probe.binary], { timeoutMs: 3_000 });
      // A transport error must throw. Only the guest shell's definite absence is not_installed.
      if (located.code === 1 && located.stdout.trim() === '') {
        return { readiness: 'not_installed', detail: `${probe.label} is not installed in this Agent’s Machine.` };
      }
      if (located.code !== 0 || located.stdout.trim() === '') throw new Error('Guest executable could not be checked.');
      // Execute the fixed binary name, never a path supplied by stdout or the host picker.
      const auth = await probe.probeAuth(probe.binary, access.run);
      return { ...auth, detail: auth.detail.replaceAll('on this machine', 'in this Agent’s Machine') };
    });
    return { ...base, ...(result ?? { readiness: 'unknown', detail: access.power() === 'asleep'
      ? 'Status unknown: it is stopped.' : 'Status unknown: this Agent’s Machine is not available.' }) };
  } catch { return { ...base, readiness: 'unknown', detail: 'Status unknown: this Agent’s Machine could not be checked.' }; }
}
