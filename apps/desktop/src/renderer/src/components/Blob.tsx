import { useEffect, useRef } from 'react';
import { Blobatar } from '@blobatar/react';
import { useGaze, type GazeTarget, type UseGazeResult } from '@blobatar/react/gaze';
import { idle, sleepy, surprised, thinking, type Expression } from 'blobatar/expression';
import type { AgentStatus } from '@blobot/core/domain';
import { traitsFor } from '../blobatar-shapes';

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
 * `hue` and `shape` are the two things here the name does not decide. Both are absent for every
 * agent that kept the face its name gave it, which is most of them, and set for one the user
 * recoloured or reshaped while hiring. Passing `undefined` through is deliberate: the library
 * derives both from the name, and a default of our own would silently override every agent that
 * never asked for one. They are stored on the agent rather than on a screen, because one agent
 * has one face wherever it is drawn.
 */
export function Blob({
  name,
  size = 22,
  status,
  hue,
  shape,
  animated = false,
  wander = false,
  lookAt,
  travel = TRAVEL,
}: {
  name: string;
  size?: number;
  status?: AgentStatus | undefined;
  hue?: number | undefined;
  /**
   * Which of the nine silhouettes this face wears, when the user chose one.
   *
   * Absent means the name picks among all nine, which is the default and what almost every
   * agent has. A name the app does not know is the same as absent — see `traitsFor`.
   */
  shape?: string | undefined;
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
   * Whether this face glances around the room on its own. Ignored unless `animated`, and
   * ignored while anything else is aiming it.
   *
   * See `useWander`. Off by default and on in the rail alone: it is ambient motion, which is the
   * expensive kind, and the rail is the one column where a face is a creature you sit beside all
   * day rather than a label on a record.
   */
  wander?: boolean;
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
            traits={traitsFor(shape)}
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
      shape={shape}
      wander={wander}
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
  shape,
  wander,
  lookAt,
  travel,
}: {
  name: string;
  size: number;
  status: AgentStatus | undefined;
  hue: number | undefined;
  shape: string | undefined;
  wander: boolean;
  lookAt: GazeTarget | undefined;
  travel: number;
}): React.JSX.Element {
  const aim = aimOf(status, lookAt);
  const gaze = useGaze({ travel, lookAt: aim });
  const face = useRef<HTMLSpanElement | null>(null);
  useWander(gaze, face, wander && aim === null);

  return (
    <span
      className={`b-${status ?? 'still'}`}
      style={{ width: size, height: size }}
    >
      <span className="blob" ref={face} style={{ width: size, height: size }}>
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
          traits={traitsFor(shape)}
          animate="always"
          expression={poseFor(status) ?? idle}
          {...(hue === undefined ? {} : { hue })}
        />
      </span>
    </span>
  );
}

/**
 * How far from a face's own centre a glance lands, in CSS pixels.
 *
 * The driver takes a *point* and works out the direction itself, so what a wander has to choose
 * is somewhere in the room to look at. Anything past the near field is the full excursion —
 * `DEADZONE` eases the amplitude to zero over the face's own footprint and nowhere else — so
 * these two numbers do not set how far the eyes travel. They set how varied the *directions*
 * are: a point 140px away from a 44px face is a wide angle off centre, and one at 480px is
 * nearly the same direction for two faces one row apart, which is a rail glancing in unison.
 * The near end is what keeps them apart.
 */
const REACH_MIN = 140;
const REACH_MAX = 420;

/**
 * How long a face holds one glance before choosing another, in milliseconds.
 *
 * The library's own idle saccade runs a period drawn from the agent's name between 4.2s and
 * 7.6s. This is faster because it is doing a different thing: that one is a floor under a face
 * at rest, this is a creature looking around a room, and at a six second beat the movement
 * reads as a twitch every so often rather than as attention.
 *
 * Random per beat rather than a fixed interval, and phased by a random first beat, so a column
 * of faces never settles into a rhythm. Two blobatars flicking together once is a coincidence;
 * doing it every four seconds is a drill team, which is the thing the rail must never look like.
 */
const BEAT_MIN = 1_500;
const BEAT_MAX = 4_000;

/** How often a beat is spent looking at nothing instead, holding the centre. */
const REST_IN = 4;

/**
 * Somewhere in the room, from this face's own box.
 *
 * A uniform angle and a distance in `[REACH_MIN, REACH_MAX)`. It is client coordinates because
 * that is the only thing the driver takes, and off the live box rather than off a remembered
 * one because the rail scrolls.
 *
 * Pure, and `roll` is injected, which is what makes it the part of this that a test can hold
 * still. Everything around it is a timer and a driver and neither has anything assertable in
 * jsdom, where there is no layout and no `getBBox`.
 */
export function wanderPoint(face: DOMRect, roll: () => number): { x: number; y: number } {
  const angle = roll() * 2 * Math.PI;
  const reach = REACH_MIN + roll() * (REACH_MAX - REACH_MIN);
  return {
    x: face.left + face.width / 2 + Math.cos(angle) * reach,
    y: face.top + face.height / 2 + Math.sin(angle) * reach,
  };
}

/**
 * A face that looks around the room on its own.
 *
 * The library already runs an idle glance — `mo-saccade`, six fixations on a per-name clock —
 * and this is deliberately **not** that turned up. The saccade's amplitude is a plain translate
 * of the eye pair, and the foreshortening keyframe beside it multiplies `--mo-look-x` by
 * `--mo-look-y`: raising the pair far enough to be seen at 44px puts tens of degrees of rotation
 * on each eye, because the coefficient is quadratic in something that was tuned around 1.4. That
 * layer is a floor and cannot be a channel.
 *
 * So a wander goes through the gaze driver instead, which is the thing built for an excursion
 * this size: the mark is lifted onto a sphere, rotated and projected, so the foreshortening, the
 * convergence tilt and the limb clamp all come out of the geometry and an eye cannot leave the
 * head however far it is asked to look. `SEEN` is the excursion the rail already passes, and it
 * was chosen for exactly this — a head turning to follow you.
 *
 * **It is aimed, not eased.** `SNAP` is a threshold on how far the target moved in one frame,
 * and a point across the room is always past it, so the driver saccades rather than pursuing.
 * That is the correct oculomotor answer and the reason this does not read as floating eyeballs:
 * a glance is ballistic, and the smoothing exists for a target that is genuinely being followed.
 *
 * `active` is false whenever anything else is aiming the face, which today is `waiting` claiming
 * the pointer. Two systems writing one pair of eyes is the failure `--mo-track-hold` exists to
 * prevent one level down, and a face that owes the user an answer must not be caught looking
 * out of the window.
 *
 * Reduced motion is the driver's own to honour and it halts entirely there, but the timer is
 * ours: it is stood down on the same query, live, so turning the setting on mid-session stops
 * the scheduling too and not only what it would have drawn.
 */
function useWander(
  gaze: UseGazeResult,
  face: React.RefObject<HTMLSpanElement | null>,
  active: boolean,
): void {
  const { lookAt } = gaze;

  useEffect(() => {
    if (!active) return;

    const still = matchMedia('(prefers-reduced-motion: reduce)');
    let timer: ReturnType<typeof setTimeout> | undefined;

    const beat = (): void => {
      const box = face.current?.getBoundingClientRect();
      // A face with no box is one that has not been laid out, or is scrolled out of the rail's
      // own overflow. Nothing to look out of, and nothing to measure a direction from.
      if (box !== undefined && box.width > 0) {
        lookAt(Math.random() < 1 / REST_IN ? 'rest' : wanderPoint(box, Math.random));
      }
      timer = setTimeout(beat, BEAT_MIN + Math.random() * (BEAT_MAX - BEAT_MIN));
    };

    const sync = (): void => {
      clearTimeout(timer);
      timer = undefined;
      if (still.matches) {
        lookAt(null);
        return;
      }
      // The first beat is a fraction of one, so faces mounting together do not start together.
      timer = setTimeout(beat, Math.random() * BEAT_MAX);
    };

    sync();
    still.addEventListener('change', sync);
    return () => {
      still.removeEventListener('change', sync);
      clearTimeout(timer);
      // Home, and the library's own glance comes back with it — `null` is the empty target and
      // `rest` is a pose. A face this stops driving should go back to being a creature.
      lookAt(null);
    };
  }, [active, face, lookAt]);
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
