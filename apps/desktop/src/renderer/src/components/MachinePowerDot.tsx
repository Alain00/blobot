import type { MachinePower } from '@blobot/core/domain';

const LABEL: Record<MachinePower, string> = {
  awake: 'Machine is awake', asleep: 'Machine is asleep · send a message to wake it',
  waking: 'Machine is waking', sleeping: 'Machine is going to sleep',
  unknown: 'Machine state is unknown',
};

/** No polling or clock per avatar. Unknown is a hollow ring, not a false asleep claim. */
export function MachinePowerDot({ power }: { readonly power: MachinePower }): React.JSX.Element {
  return <span className={`machinepower is-${power}`} role="img" aria-label={LABEL[power]} title={LABEL[power]} />;
}
