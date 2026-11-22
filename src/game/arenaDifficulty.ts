/**
 * Pure progressive arena difficulty scaling for LOFI ICE ESCAPE.
 * Higher levels escalate BOTH obstacle density (tighter cluster rhythm & richer formations)
 * AND track curvature (stronger winding bends & narrower carving corridors) while always
 * preserving a safe, fair passable line (>= 4.5m) and carvable cornering speeds.
 */

export interface ArenaDifficultyProfile {
  levelNumber: number;
  /** Effective obstacle density multiplier (strictly increases with level). */
  densityScale: number;
  /** Starting longitudinal step between procedural obstacle clusters (meters, shrinks with level). */
  baseRowStepMeters: number;
  /** Minimum longitudinal step between procedural obstacle clusters (meters, shrinks with level). */
  minRowStepMeters: number;
  /** Longitudinal separation buffer against nearby obstacles when spawning clusters (meters). */
  minObstacleSpacingZ: number;
  /** Lateral separation buffer against nearby obstacles (meters). */
  minObstacleSpacingX: number;
  /** Maximum obstacles allowed in a single procedural row cluster (Lv1=2, Lv2=3, Lv3+=4). */
  maxClusterPerRow: number;
  /** Safe carving corridor half-width at level start (meters; always leaves >= 5.2m full gap). */
  corridorHalfWidthBase: number;
  /** Progressive curve amplitude multiplier applied to the level's track bends. */
  curveIntensityScale: number;
  /** Short English difficulty tier label for HUD & Mini Map. */
  difficultyLabel: string;
}

/**
 * Hand-tuned 10-level progressive arena difficulty table.
 * Escalates gently from Level 1 -> Level 3 (fixing the steep Level 3 spike),
 * builds technical slaloms through Levels 4-7, and peaks cleanly at Levels 8-10.
 */
const DIFFICULTY_TABLE: ReadonlyArray<Omit<ArenaDifficultyProfile, 'levelNumber'>> = [
  // Level 1: Wide, inviting intro run
  {
    densityScale: 0.65,
    baseRowStepMeters: 52,
    minRowStepMeters: 30.0,
    minObstacleSpacingZ: 15.5,
    minObstacleSpacingX: 4.6,
    maxClusterPerRow: 2,
    corridorHalfWidthBase: 3.55,
    curveIntensityScale: 0.72,
    difficultyLabel: 'Easy',
  },
  // Level 2: Gentle step up with first Lil Yeti
  {
    densityScale: 0.78,
    baseRowStepMeters: 47,
    minRowStepMeters: 27.0,
    minObstacleSpacingZ: 14.4,
    minObstacleSpacingX: 4.35,
    maxClusterPerRow: 2,
    corridorHalfWidthBase: 3.4,
    curveIntensityScale: 0.78,
    difficultyLabel: 'Easy',
  },
  // Level 3: Approachable pine valley with 1 fallen log & gentle split bowl
  {
    densityScale: 0.92,
    baseRowStepMeters: 42,
    minRowStepMeters: 24.5,
    minObstacleSpacingZ: 13.4,
    minObstacleSpacingX: 4.15,
    maxClusterPerRow: 2,
    corridorHalfWidthBase: 3.28,
    curveIntensityScale: 0.84,
    difficultyLabel: 'Easy',
  },
  // Level 4: Smooth transition into Medium slalom rhythm
  {
    densityScale: 1.04,
    baseRowStepMeters: 39,
    minRowStepMeters: 22.0,
    minObstacleSpacingZ: 12.4,
    minObstacleSpacingX: 3.95,
    maxClusterPerRow: 3,
    corridorHalfWidthBase: 3.16,
    curveIntensityScale: 0.89,
    difficultyLabel: 'Medium',
  },
  // Level 5: Expressive S-curves & dual-route glacier bowl
  {
    densityScale: 1.16,
    baseRowStepMeters: 36,
    minRowStepMeters: 20.0,
    minObstacleSpacingZ: 11.6,
    minObstacleSpacingX: 3.8,
    maxClusterPerRow: 3,
    corridorHalfWidthBase: 3.06,
    curveIntensityScale: 0.94,
    difficultyLabel: 'Medium',
  },
  // Level 6: Brisk alpine timber weave
  {
    densityScale: 1.28,
    baseRowStepMeters: 33,
    minRowStepMeters: 18.4,
    minObstacleSpacingZ: 10.9,
    minObstacleSpacingX: 3.65,
    maxClusterPerRow: 3,
    corridorHalfWidthBase: 2.96,
    curveIntensityScale: 0.98,
    difficultyLabel: 'Medium',
  },
  // Level 7: Hard blizzard gorge with tighter slalom clusters
  {
    densityScale: 1.38,
    baseRowStepMeters: 31,
    minRowStepMeters: 17.0,
    minObstacleSpacingZ: 10.3,
    minObstacleSpacingX: 3.5,
    maxClusterPerRow: 3,
    corridorHalfWidthBase: 2.88,
    curveIntensityScale: 1.02,
    difficultyLabel: 'Hard',
  },
  // Level 8: Fast avalanche run with 3 fallen logs & dense slaloms
  {
    densityScale: 1.48,
    baseRowStepMeters: 29,
    minRowStepMeters: 15.8,
    minObstacleSpacingZ: 9.8,
    minObstacleSpacingX: 3.38,
    maxClusterPerRow: 4,
    corridorHalfWidthBase: 2.8,
    curveIntensityScale: 1.06,
    difficultyLabel: 'Hard',
  },
  // Level 9: Expert frostbite ridge with demanding bends
  {
    densityScale: 1.56,
    baseRowStepMeters: 27.5,
    minRowStepMeters: 14.8,
    minObstacleSpacingZ: 9.3,
    minObstacleSpacingX: 3.26,
    maxClusterPerRow: 4,
    corridorHalfWidthBase: 2.74,
    curveIntensityScale: 1.09,
    difficultyLabel: 'Expert',
  },
  // Level 10: Peak Storm Summit finale with 9 Lil Yetis
  {
    densityScale: 1.66,
    baseRowStepMeters: 26,
    minRowStepMeters: 13.8,
    minObstacleSpacingZ: 8.9,
    minObstacleSpacingX: 3.15,
    maxClusterPerRow: 4,
    corridorHalfWidthBase: 2.68,
    curveIntensityScale: 1.12,
    difficultyLabel: 'Expert',
  },
];

/**
 * Compute deterministic progressive arena generation parameters for any 1-based level number (1..10+).
 */
export function computeArenaDifficultyProfile(
  levelNumber: number,
): ArenaDifficultyProfile {
  const lv = Math.max(1, Math.floor(levelNumber));
  if (lv <= DIFFICULTY_TABLE.length) {
    return {
      levelNumber: lv,
      ...DIFFICULTY_TABLE[lv - 1],
    };
  }

  const extra = lv - DIFFICULTY_TABLE.length;
  const peak = DIFFICULTY_TABLE[DIFFICULTY_TABLE.length - 1];
  return {
    levelNumber: lv,
    densityScale: Number((peak.densityScale + extra * 0.08).toFixed(2)),
    baseRowStepMeters: Math.max(22, peak.baseRowStepMeters - extra),
    minRowStepMeters: Math.max(12.2, Number((peak.minRowStepMeters - extra * 0.4).toFixed(1))),
    minObstacleSpacingZ: Math.max(8.0, Number((peak.minObstacleSpacingZ - extra * 0.2).toFixed(1))),
    minObstacleSpacingX: Math.max(2.85, Number((peak.minObstacleSpacingX - extra * 0.08).toFixed(2))),
    maxClusterPerRow: 4,
    corridorHalfWidthBase: Math.max(2.58, Number((peak.corridorHalfWidthBase - extra * 0.03).toFixed(2))),
    curveIntensityScale: Math.min(1.22, Number((peak.curveIntensityScale + extra * 0.02).toFixed(2))),
    difficultyLabel: 'Expert',
  };
}
