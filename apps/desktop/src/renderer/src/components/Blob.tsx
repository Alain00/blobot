import { Blobatar } from '@blobatar/react';
import type { AgentStatus } from '@blobot/core/ui';

/**
 * A blobatar, wrapped in the one element that carries status as motion. The animation classes
 * are the prototype's: still, breathe, bob-and-tilt, nod, pulse, flinch — and `grayscale` for
 * failed, because if saturation means identity then draining it means "not alive".
 *
 * All of it sits behind `prefers-reduced-motion`, where the mono word and the hairline carry
 * the state alone.
 */
export function Blob({
  name,
  size = 22,
  status,
}: {
  name: string;
  size?: number;
  status?: AgentStatus;
}): React.JSX.Element {
  return (
    <span className={`b-${status ?? 'still'}`} style={{ width: size, height: size }}>
      <span className="blob" style={{ width: size, height: size }}>
        <Blobatar name={name} size={size} />
      </span>
    </span>
  );
}
