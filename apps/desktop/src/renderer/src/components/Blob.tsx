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
 * **`name` is the agent's name, never its id.** The library derives the whole face from this
 * string, so a surface that seeds it with a row id draws a different creature for the same
 * agent: that is exactly what happened once the rail seeded by Agent id, the roster lists by
 * profile id and the hire preview by the name being typed, and one agent had three faces. The
 * colour picker already says out loud that the name gives the face; this is that sentence
 * enforced.
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
  status?: AgentStatus | undefined;
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
