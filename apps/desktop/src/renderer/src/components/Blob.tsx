import { Blobatar } from '@blobatar/react';
import { useGaze, type GazeTarget } from '@blobatar/react/gaze';
import { idle, sleepy, surprised, thinking, type Expression } from 'blobatar/expression';
import type { AgentStatus } from '@blobot/core/domain';
import { SHAPE_TRAITS } from '../blobatar-shapes';

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
 * the state alone. The gaze layer below is behind it too, and we did not have to build that:
 * the driver watches the query itself, along with `(hover: hover) and (pointer: fine)`, and
 * stands the eyes down rather than tracking a pointer that is not really there.
 *
 * **The eyes can follow something**, on the animated surfaces only. `lookAt` is the call site's
 * to aim, except for `waiting`, which claims the pointer — see `aimOf`. It costs an import of
 * `blobatar/gaze.css` in `main.tsx` and an excursion per face, and it is off for every face
 * that is not asked, since a driver aimed at nothing parks on its first frame.
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
  lookAt,
  travel = TRAVEL,
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
   * Where this face looks. Ignored unless `animated`, because the gaze layer writes onto the
   * `.mo-eyes` group and an `<img>` has no eyes.
   *
   * An element, a point, `"pointer"`, `"rest"` (held at centre, deliberately not looking) or
   * `null`. Omitted and `null` mean the same thing here, unlike in the library: this component
   * always aims declaratively, so there is no second caller for the two to disagree about.
   */
  lookAt?: GazeTarget;
  /**
   * How far the eyes travel, in viewBox units — 1% of the face each, at any drawn size.
   *
   * Defaults to `TRAVEL`, which is the floor. A surface raises it when it has a reason it can
   * state, and the two that do are the rail and the hire preview.
   */
  travel?: number;
}): React.JSX.Element {
  if (!animated) {
    return (
      <span
        className={`b-${status ?? 'still'}`}
        style={{ width: size, height: size }}
      >
        <span className="blob" style={{ width: size, height: size }}>
          <Blobatar
            name={name}
            size={size}
            traits={SHAPE_TRAITS}
            {...(hue === undefined ? {} : { hue })}
          />
        </span>
      </span>
    );
  }

  return (
    <LiveBlob
      name={name}
      size={size}
      status={status}
      hue={hue}
      lookAt={lookAt}
      travel={travel}
    />
  );
}

/**
 * The animated blobatar, and the only thing in the app that runs a gaze driver.
 *
 * It is a component rather than a branch inside `Blob` because `useGaze` is a hook and the
 * static branch must not pay for it. A driver is a `pointermove` listener, a scroll listener
 * and a `ResizeObserver` per face; mounting one per settled transcript message would be
 * hundreds of them behind a layer that cannot draw on an `<img>` anyway. Splitting here keeps
 * the cost exactly where the eyes are.
 */
function LiveBlob({
  name,
  size,
  status,
  hue,
  lookAt,
  travel,
}: {
  name: string;
  size: number;
  status: AgentStatus | undefined;
  hue: number | undefined;
  lookAt: GazeTarget | undefined;
  travel: number;
}): React.JSX.Element {
  const gaze = useGaze({ travel, lookAt: aimOf(status, lookAt) });

  return (
    <span
      className={`b-${status ?? 'still'}`}
      style={{ width: size, height: size }}
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
          ref={gaze.ref}
          name={name}
          size={size}
          traits={SHAPE_TRAITS}
          animate="always"
          expression={poseFor(status) ?? idle}
          {...(hue === undefined ? {} : { hue })}
        />
      </span>
    </span>
  );
}

/**
 * The gaze's excursion when a call site does not name one, in viewBox units — 1% of the face
 * each, so one number is the same proportion at every drawn size.
 *
 * The quiet setting, and the only one inside the range the library documents for a follow (1.5
 * to 4). It sits under the `thinking` seesaw's 8.4, so a face wearing this reads as attention
 * beneath motion that reads as working rather than as a second channel beside it. It is what
 * the transcript's pending face gets, where anything larger would be movement next to words
 * somebody is reading.
 */
export const TRAVEL = 2.5;

/**
 * The excursion where the gaze is meant to be *seen*: the rail, and the preview in the hire and
 * edit dialogs.
 *
 * Several times the floor and above the status signal rather than under it, which inverts the
 * amplitude argument the idle layer is admitted on. That reversal is deliberate and the author's
 * — a gaze pitched under the signal is a channel nobody notices, which is the same as not having
 * built it. What keeps it payable is the other half of DESIGN.md's rule rather than the first:
 * this moves nothing until a pointer moves, so it is answering the user's own hand, and the
 * driver stands itself down under `prefers-reduced-motion`.
 *
 * Short of the ceiling by a wide margin. The projection saturates at the limb, so a large
 * excursion cannot throw an eye off the face — but at 24 the turn is most of a head and the eye
 * arrives at the edge with almost no width, which reads as a face turning *away*. This is half
 * of that: a head turning to follow you.
 */
export const SEEN = 12;

/**
 * Where a face actually looks, once status has had its say.
 *
 * `waiting` takes the pointer and overrides whatever the call site asked for, and it is the one
 * status that reaches into this at all. The state's literal content is *an agent is blocked
 * until a human looks at it*, which is why it already wears `surprised` — the only pose that
 * grows the eyes. Following the cursor is that same sentence continued rather than a new claim:
 * the face tracks you until you answer, and stops the moment you do.
 *
 * It is bounded by the state being rare. At most one or two agents are ever `waiting`, so this
 * never becomes a column of faces turning in unison — which is the thing gaze must not do here,
 * and the reason the rail's idle behaviours are phased off each agent's name while this is not.
 *
 * Everything else defers to the call site, and `undefined` collapses to `null`: a face that was
 * not aimed looks at nothing and goes on living its own life.
 */
export function aimOf(status: AgentStatus | undefined, lookAt: GazeTarget | undefined): GazeTarget {
  if (status === 'waiting') return 'pointer';
  return lookAt ?? null;
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
