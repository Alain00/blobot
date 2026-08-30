import { Blobatar } from '@blobatar/react';
import { idle, sleepy, surprised, thinking, type Expression } from 'blobatar/expression';
import type { AgentStatus } from '@blobot/core/domain';

/**
 * A blobatar, wrapped in the one element that carries status as motion. There is **one** body
 * animation now, a slow breathe worn by every state where something is happening, plus
 * `grayscale` for failed, because if saturation means identity then draining it means "not
 * alive". The prototype's six — still, breathe, bob-and-tilt, nod, pulse, flinch — were cut to
 * that: `bob` travelled 3px and tilted 2.5 degrees every .9s and read as fidgeting, and the
 * poses meant to separate thinking from responding are sub-pixel at 34px, so the distinction
 * they were bought for was never legible. The word says which state, the three dots beside it
 * say in flight, and the body is left saying the one thing a shape says well.
 *
 * All of it sits behind `prefers-reduced-motion`, where the mono word and the dots carry
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
  animated = false,
  face,
}: {
  name: string;
  size?: number;
  status?: AgentStatus | undefined;
  hue?: number | undefined;
  /**
   * Whether this surface's blobatars are alive: inline SVG, breathing at rest, and wearing the
   * pose for the states that have one.
   *
   * Off everywhere by default, and the two reasons are different. A settled transcript message
   * must not wear a pose at all, and must not move: both would be a claim about *now* on a
   * record of *then*, which is the same error the stillness rule exists to prevent. And this
   * switches the blobatar from one `<img>` to about a dozen inline SVG nodes running four
   * infinite animations — fine for the handful of faces in the rail, not for a transcript that
   * grows all day, which is the case the `<img>` default was chosen for.
   */
  animated?: boolean;
  /**
   * Marks this face as one that flies out of its team's folder when the team opens. Only the
   * rail's agent rows set it: `useFaceFlight` reads the roster off the document in row order,
   * and a face anywhere else would be a member of a team it is not on.
   */
  face?: string | undefined;
}): React.JSX.Element {
  if (!animated) {
    return (
      <span
        className={`b-${status ?? 'still'}`}
        style={{ width: size, height: size }}
        {...(face === undefined ? {} : { 'data-face': face })}
      >
        <span className="blob" style={{ width: size, height: size }}>
          <Blobatar name={name} size={size} {...(hue === undefined ? {} : { hue })} />
        </span>
      </span>
    );
  }

  return (
    <span
      className={`b-${status ?? 'still'}`}
      style={{ width: size, height: size }}
      {...(face === undefined ? {} : { 'data-face': face })}
    >
      <span className="blob" style={{ width: size, height: size }}>
        {/* `always` raises the library's `--mo-amp` to 1, which is the one variable every idle
            behaviour multiplies through: breathe, bob, blink and the glance, each phased off the
            agent's name so a roster reads as a crowd rather than a drill team.

            That is an ambient animation beside the one that means status, which DESIGN.md warns
            is almost always wrong, and the reason it is right here is amplitude. At 34px the
            idle bob travels 0.37px and the glance 0.38px, against 2.9px for the `thinking`
            seesaw and a 1.035 scale for the breathe. The floor is several times under the
            signal, so it reads as breathing beneath motion that reads as working. It gives the existing
            channel a floor rather than adding a second channel next to it.

            `expression` defaults to `idle`, which the library documents as byte-identical to
            passing nothing. Passing it explicitly rather than omitting it keeps the pose
            variables on the element at all times, so a status change morphs between two poses
            instead of appearing from nothing. */}
        <Blobatar
          name={name}
          size={size}
          animate="always"
          expression={poseFor(status) ?? idle}
          {...(hue === undefined ? {} : { hue })}
        />
      </span>
    </span>
  );
}

/**
 * Status, worn on the face. Three of the seven states, and the four gaps are deliberate.
 *
 * The roster is chosen against DESIGN.md's governing rule before anything else: `mad`, `love`,
 * `shy` and `sick` tint the palette, and colour here means *identity*. A green blob would say
 * "sick agent" on the one surface where saturation is the agent and the hue is a thing the user
 * picked. They are out permanently, not on taste.
 *
 * Of what is left:
 *
 * - `thinking` is the reason to do any of this. The library calls it "the two-dot loader, drawn
 *   with the two dots a blobatar already has", and it swings the eyes 8.4 viewBox units, which
 *   is 2.9px at the rail's 34px, and it is now the largest thing moving on a face, the `bob` it
 *   used to merely match having been withdrawn. It is also the dots idiom again, said by the
 *   only two dots a blobatar was already wearing.
 * - `starting` gets `sleepy`: an agent whose runtime is still coming up, said with the face
 *   rather than by dimming to 55%, which reads as disabled rather than as waking.
 * - `waiting` gets `surprised`, the only pose that grows the eyes. It does not read as surprise
 *   so much as *eyes on you*, which is the literal content of the one state where an agent sits
 *   forever until a human looks.
 *
 * `working` and `responding` keep the body channel alone: the library has no pose for hands, and
 * what separates them is a word, not a face. `idle` is still, because still is what tells you
 * nothing is happening. `failed` keeps the grayscale and no pose: the
 * drained saturation already says "not alive", and a sad face on top is a second claim made at
 * the moment the user has something to fix.
 *
 * The poses that are here are all scale channels — `surprised` is eyes at 1.34×, `sleepy` is
 * eyes at 0.22× — so they read the same at 34px as at 112px. The offsets inside them are
 * secondary, and the size-dependent effects the library warns about (the glance, at 0.38px on a
 * rail row) belong to the idle layer we hold at zero.
 */
function poseFor(status: AgentStatus | undefined): Expression | undefined {
  switch (status) {
    case 'thinking':
      return thinking;
    case 'starting':
      return sleepy;
    case 'waiting':
      return surprised;
    default:
      return undefined;
  }
}
