/**
 * Pure deterministic selection and archetype metadata for 3D alpine pine trees
 * and snow-draped granite boulders. Kept free of Three.js dependencies so
 * distribution and fairness invariants can be verified directly via node:test.
 */

export const TRACK_PINE_VARIANT_COUNT = 4;
export const PERIMETER_PINE_VARIANT_COUNT = 5;
export const ROCK_VARIANT_COUNT = 3;

export type PineVariantId = 0 | 1 | 2 | 3 | 4;
export type RockVariantId = 0 | 1 | 2;

export interface PineVariantProfile {
  readonly id: PineVariantId;
  readonly name: string;
  /** True when the variant has full obstacle height (~5.0m+) suitable for track obstacles. */
  readonly trackEligible: boolean;
  /** Approximate unscaled visual crown height in meters. */
  readonly nominalHeight: number;
  /** Approximate unscaled lower canopy radius in meters. */
  readonly nominalRadius: number;
}

export const PINE_VARIANT_PROFILES: readonly PineVariantProfile[] = [
  {
    id: 0,
    name: 'tall-alpine-spruce',
    trackEligible: true,
    nominalHeight: 5.5,
    nominalRadius: 1.32,
  },
  {
    id: 1,
    name: 'broad-mountain-pine',
    trackEligible: true,
    nominalHeight: 5.05,
    nominalRadius: 1.72,
  },
  {
    id: 2,
    name: 'gnarled-wind-pine',
    trackEligible: true,
    nominalHeight: 4.85,
    nominalRadius: 1.56,
  },
  {
    id: 3,
    name: 'graceful-stepped-pine',
    trackEligible: true,
    nominalHeight: 5.28,
    nominalRadius: 1.46,
  },
  {
    id: 4,
    name: 'compact-snow-sapling',
    trackEligible: false,
    nominalHeight: 2.35,
    nominalRadius: 1.12,
  },
] as const;

export interface RockVariantProfile {
  readonly id: RockVariantId;
  readonly name: string;
  readonly nominalHeight: number;
  readonly nominalRadius: number;
}

export const ROCK_VARIANT_PROFILES: readonly RockVariantProfile[] = [
  {
    id: 0,
    name: 'peaked-alpine-crag',
    nominalHeight: 1.24,
    nominalRadius: 1.02,
  },
  {
    id: 1,
    name: 'wide-split-boulder',
    nominalHeight: 1.02,
    nominalRadius: 1.12,
  },
  {
    id: 2,
    name: 'clustered-outcrop',
    nominalHeight: 1.08,
    nominalRadius: 1.08,
  },
] as const;

/** Deterministic integer mix (Murmur-style finalizer) yielding unsigned 32-bit hash. */
function hashInts(a: number, b: number, c: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Pick one of the 4 full-height pine variants (0..3) deterministically for a track obstacle.
 * Spreads silhouettes organically across nearby pines without altering position or hitbox.
 */
export function pickTrackPineVariant(
  obstacleId: number,
  z: number,
  offsetX: number,
): 0 | 1 | 2 | 3 {
  const h = hashInts(obstacleId * 7 + 13, Math.round(z * 2), Math.round(offsetX * 10));
  // Combine sequential stride + spatial hash so consecutive pines rarely repeat identical silhouettes
  const idx = ((obstacleId + (h % 3)) % TRACK_PINE_VARIANT_COUNT) as 0 | 1 | 2 | 3;
  return idx;
}

/**
 * Pick one of the 5 pine variants (0..4) deterministically for perimeter snowbank groves.
 * Inner/front tiers occasionally place Variant 4 (compact bushy sapling) for layered forest depth,
 * while outer tiers favor the 4 taller alpine silhouettes.
 */
export function pickPerimeterPineVariant(
  index: number,
  distZ: number,
  side: number,
  tier: number,
): PineVariantId {
  const h = hashInts(index + 31, Math.round(distZ), side * 17 + tier * 53);
  const roll = (h % 100) / 100;

  // Front bank (tier === 0) gets a natural sprinkle (~18%) of compact bushy snow saplings
  if (tier === 0 && roll < 0.18) {
    return 4;
  }

  // Distribute remaining slots across all 4 tall pine archetypes with balanced variety
  const tallRoll = ((h >>> 7) % 100) / 100;
  if (tallRoll < 0.27) return 0; // Tall Narrow Alpine Spruce
  if (tallRoll < 0.54) return 1; // Broad Mountain Pine
  if (tallRoll < 0.77) return 2; // Gnarled Wind-Bent Pine
  return 3; // Graceful Stepped Pine
}

/**
 * Pick one of the 3 chiseled granite boulder variants (0..2) deterministically.
 */
export function pickRockVariant(
  indexOrId: number,
  z: number,
  offsetX: number,
): RockVariantId {
  const h = hashInts(indexOrId * 11 + 5, Math.round(z * 2), Math.round(offsetX * 10));
  return ((indexOrId + (h % 2)) % ROCK_VARIANT_COUNT) as RockVariantId;
}
