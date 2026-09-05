import { LocalMachine } from './local-machine.js';
import { MachineUnavailableError, type Machine, type MachineIdentity, type MachineKind } from './machine.js';

/** Kind dispatch belongs to core, like WorkspaceProvider. It knows no RuntimeProvider. */
export function machineFor(kind: MachineKind, identity: MachineIdentity): Machine {
  switch (kind) {
    case 'local':
      return new LocalMachine(identity);
    case 'box':
      throw new MachineUnavailableError(kind, 'Sandbox machines are not available yet.');
    default:
      throw new Error(`Unknown Machine kind: ${String(kind)}`);
  }
}
