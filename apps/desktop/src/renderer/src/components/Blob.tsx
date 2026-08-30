import { Blobatar } from '@blobatar/react';
import type { AgentStatus } from '@blobot/core/domain';

/**
 * A blobatar, wrapped in the one element that carries status as motion. The animation classes
 * are the prototype's: still, breathe, bob-and-tilt, nod, pulse, flinch — and `grayscale` for
 * failed, because if saturation means identity then draining it means "not alive".
 *
 * All of it sits behind `prefers-reduced-motion`, where the mono word and the hairline carry
 * the state alone.
 *
 * `hue` is the one thing here the name does not decide. It is absent for every agent that kept
 * the face its name gave it, which is most of them, and set for one the user recoloured while
 * hiring. Passing `undefined` through is deliberate: the library derives the hue from the name,
 * and a default of our own would silently override every agent that never asked for one.
 */
export function Blob({
  name,
  size = 22,
  status,
  hue,
}: {
  name: string;
  size?: number;
  status?: AgentStatus;
  hue?: number | undefined;
}): React.JSX.Element {
  return (
    <span className={`b-${status ?? 'still'}`} style={{ width: size, height: size }}>
      <span className="blob" style={{ width: size, height: size }}>
        <Blobatar name={name} size={size} {...(hue === undefined ? {} : { hue })} />
      </span>
    </span>
  );
}
