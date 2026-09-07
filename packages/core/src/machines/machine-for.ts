import { LocalMachine } from './local-machine.js';
import { MachineUnavailableError, type Machine, type MachineIdentity, type MachineKind } from './machine.js';

/** Local execution is built in; the host supplies owned-Machine storage and preview policy. */
export function machineFor(kind: MachineKind, identity: MachineIdentity, create?: (kind: MachineKind, identity: MachineIdentity) => Machine): Machine {
  if (create !== undefined) {
    const machine = create(kind, identity);
    if (machine.kind !== kind) throw new Error('The Machine factory returned a different execution location.');
    return machine;
  }
  switch (kind) {
    case 'local':
      return new LocalMachine(identity);
    case 'box':
      throw new MachineUnavailableError(kind, 'Sandbox execution requires a host Machine factory.');
    default:
      throw new Error(`Unknown Machine kind: ${String(kind)}`);
  }
}
