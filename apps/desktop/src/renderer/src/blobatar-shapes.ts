/**
 * The silhouettes blobot draws blobatars from: the library's ten, minus `organic`.
 *
 * Blobatar 2 partitions [0, 1) into ten bands and reads the `shape` trait against them, so
 * `organic` is not something a name asks for and can be talked out of. It is a region of the
 * hash, and the only way to not have it is to not offer it. `traits.shape` as a **list** is the
 * library's own word for that: each number is a position inside one band, and the key's own hash
 * picks among the ones we name, which keeps every property an unconfigured shape had. Per name,
 * stable, independent of every other trait, and still not a shape blobot chose for anybody.
 *
 * The numbers are band midpoints rather than edges, so a retune of the bands inside a minor
 * cannot walk one of them into its neighbour. The weighting is gone with the pinning: the library
 * makes rounds and pebbles everyday and the loud shapes a find, and a list is uniform over what
 * it lists. That is the price of the exclusion, paid once here, and it is why this is one
 * constant rather than a call each site writes for itself: two rosters listing different shapes
 * would give one agent two faces, which is the same failure the `name` rule exists to prevent.
 *
 * A **name** is what gets stored when a user picks one, and the number never leaves this file.
 * A position inside a band is only meaningful against bands the library owns, so persisting one
 * would mean a retune inside a minor silently moving every face somebody chose; `round` keeps
 * meaning round. It is also the only word either end of this can say out loud.
 */
export const SHAPE_BANDS = {
  round: 0.11,
  boxy: 0.54,
  capsule: 0.65,
  nub: 0.745,
  cloud: 0.825,
  droplet: 0.887,
  hexagon: 0.93,
  sun: 0.965,
  triangle: 0.99,
} as const;

/** The silhouettes a user may choose, in the library's own band order, warm shapes first. */
export const SHAPE_NAMES = Object.keys(SHAPE_BANDS) as readonly BlobatarShape[];

export type BlobatarShape = keyof typeof SHAPE_BANDS;

export const SHAPES: number[] = Object.values(SHAPE_BANDS);

/** What every `<Blobatar>` in the app spreads, so no surface can draw an organic one. */
export const SHAPE_TRAITS = { shape: SHAPES };

/**
 * The traits for one face: the list above, or a list of one when a shape was chosen for it.
 *
 * A one-entry list is the library's own way to pin a trait, read against the same bands and in
 * the same units as the nine, so a chosen shape is not a different mechanism from a derived one
 * — it is the same mechanism with less to choose from. An unknown name falls back to all nine
 * rather than to a shape of blobot's choosing: a row written by a version that named a shape
 * this one does not have should draw the face the name gives, not a silhouette we invented for
 * the occasion.
 */
export function traitsFor(shape: string | undefined): { shape: number[] } {
  if (shape === undefined) return SHAPE_TRAITS;
  const band = (SHAPE_BANDS as Record<string, number | undefined>)[shape];
  return band === undefined ? SHAPE_TRAITS : { shape: [band] };
}
