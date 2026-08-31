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
 */
export const SHAPES: number[] = [
  0.11, // round
  0.54, // boxy
  0.65, // capsule
  0.745, // nub
  0.825, // cloud
  0.887, // droplet
  0.93, // hexagon
  0.965, // sun
  0.99, // triangle
];

/** What every `<Blobatar>` in the app spreads, so no surface can draw an organic one. */
export const SHAPE_TRAITS = { shape: SHAPES };
