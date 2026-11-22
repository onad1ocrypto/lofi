/**
 * Pure, zero-GC dynamic depth-based fog & alpine blizzard-zone logic for LOFI ICE ESCAPE.
 *
 * Thickens exponential depth fog (`THREE.FogExp2`), shifts atmospheric color toward icy
 * alpine mist, veils the sky dome horizon seamlessly, and intensifies snowfall whenever:
 * 1) The player ascends to higher-altitude mountain levels (Level 1 Foothills -> Level 10 Storm Peak Summit)
 * 2) The player enters designated blizzard sections along the mountain course
 * 3) Randomized crosswind gusts or the trailing avalanche kick up additional blowing snow haze
 *
 * Strictly visibility-bounded so Lofi (d ~ 10m) and immediate dodgeable obstacles (d ~ 25-40m)
 * remain readable even inside a Level 10 Summit whiteout while distant ridges disappear into mist.
 */

import type { GamePhase } from './types';

export interface BlizzardZone {
  /** Start distance along track (meters). */
  readonly zStart: number;
  /** End distance along track (meters). */
  readonly zEnd: number;
  /** Smooth entry/exit fade band width (meters). */
  readonly fadeMeters: number;
  /** Peak blizzard intensity in (0, 1] inside this section. */
  readonly peakIntensity: number;
}

export interface DynamicFogInput {
  phase: GamePhase;
  levelNumber: number;
  distance: number;
  levelLength: number;
  windGustIntensity?: number;
  avalancheDanger?: number;
  time?: number;
}

export interface DynamicFogState {
  /** Active `THREE.FogExp2` density. */
  density: number;
  /** Normalized mountain altitude factor in [0, 1]. */
  altitudeFactor: number;
  /** Normalized active blizzard section intensity in [0, 1]. */
  blizzardIntensity: number;
  /** Synchronized sky-dome horizon haze veil strength in [0, 0.84]. */
  skyHazeAmount: number;
  /** Subtle sun-key overcast dimming multiplier in [0.78, 1.0]. */
  keyLightScale: number;
  /** Fog sRGB color components in [0, 1] for zero-GC Three.Color updates. */
  colorR: number;
  colorG: number;
  colorB: number;
}

export const DYNAMIC_FOG_CONFIG = {
  /** Baseline clear alpine foothills fog density (matches skyDome FOG_CONFIG.density). */
  baseDensity: 0.00215,
  /** Additional depth-fog thickness from ascending to highest mountain altitudes (Level 10 Summit). */
  maxAltitudeDensityBonus: 0.00465,
  /** Additional depth-fog thickness inside a full-strength blizzard section. */
  maxBlizzardDensityBonus: 0.0092,
  /** Subtle extra blowing-mist thickness during active wind gusts or close avalanche threat. */
  maxGustDensityBonus: 0.0011,
  maxAvalancheDensityBonus: 0.0008,
  /** Absolute maximum fog density cap so near/mid obstacles (<= 38m) always remain dodgeable. */
  maxDensityCap: 0.0175,
  /** Smooth damping rates (per second) for fog transitions (gentle roll-in, clean roll-out). */
  densityDampIn: 1.85,
  densityDampOut: 1.35,
  /** Base clear alpine fog color (#8aa6dc) */
  clearColorHex: 0x8aa6dc,
  /** High-altitude frosty ridge mist tint (#a4bde3) */
  altitudeColorHex: 0xa4bde3,
  /** Treacherous blizzard whiteout blue-silver tint (#c9daee) */
  blizzardColorHex: 0xc9daee,
} as const;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep01(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

function hexToRgb01(hex: number): readonly [number, number, number] {
  return [
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  ];
}

const CLEAR_RGB = hexToRgb01(DYNAMIC_FOG_CONFIG.clearColorHex);
const ALTITUDE_RGB = hexToRgb01(DYNAMIC_FOG_CONFIG.altitudeColorHex);
const BLIZZARD_RGB = hexToRgb01(DYNAMIC_FOG_CONFIG.blizzardColorHex);

/**
 * Return deterministic blizzard sections along the active level's mountain course.
 * Higher-altitude mountain levels feature wider, more frequent, and denser blizzard sections,
 * while always clearing smoothly before the warm shelter arrival plaza.
 */
export function getBlizzardZonesForLevel(
  levelNumber: number,
  levelLength: number,
): readonly BlizzardZone[] {
  const lv = Math.max(1, Math.min(10, Math.floor(levelNumber)));
  const len = Math.max(300, levelLength);

  if (lv <= 2) {
    // Lower foothills / ridge: one atmospheric mountain mist & snow-squall pocket mid-late run
    return [
      {
        zStart: len * 0.5,
        zEnd: len * 0.74,
        fadeMeters: 52,
        peakIntensity: lv === 1 ? 0.44 : 0.54,
      },
    ];
  }

  if (lv <= 4) {
    // Mid-mountain valleys & passes: two distinct rolling snow-squall pockets
    const boost = (lv - 3) * 0.08;
    return [
      {
        zStart: len * 0.25,
        zEnd: len * 0.43,
        fadeMeters: 50,
        peakIntensity: 0.56 + boost,
      },
      {
        zStart: len * 0.62,
        zEnd: len * 0.82,
        fadeMeters: 56,
        peakIntensity: 0.64 + boost,
      },
    ];
  }

  if (lv <= 6) {
    // Glacier Bend & Timber Chute: denser twin alpine blizzard sections
    const boost = (lv - 5) * 0.08;
    return [
      {
        zStart: len * 0.21,
        zEnd: len * 0.42,
        fadeMeters: 52,
        peakIntensity: 0.72 + boost,
      },
      {
        zStart: len * 0.58,
        zEnd: len * 0.83,
        fadeMeters: 58,
        peakIntensity: 0.78 + boost,
      },
    ];
  }

  if (lv === 7) {
    // Level 7: "Blizzard Gorge" — signature heavy twin blizzard corridor
    return [
      {
        zStart: len * 0.16,
        zEnd: len * 0.44,
        fadeMeters: 54,
        peakIntensity: 0.92,
      },
      {
        zStart: len * 0.54,
        zEnd: len * 0.85,
        fadeMeters: 62,
        peakIntensity: 0.96,
      },
    ];
  }

  // Levels 8..10 (Avalanche Run, Frostbite Ridge, Storm Peak Summit): treacherous high-altitude blizzards
  const summitBoost = (lv - 8) * 0.04;
  return [
    {
      zStart: len * 0.15,
      zEnd: len * 0.43,
      fadeMeters: 54,
      peakIntensity: Math.min(1, 0.88 + summitBoost),
    },
    {
      zStart: len * 0.53,
      zEnd: len * 0.86,
      fadeMeters: 64,
      peakIntensity: Math.min(1, 0.92 + summitBoost),
    },
  ];
}

/**
 * Evaluate smooth blizzard intensity in [0, 1] at a specific track distance.
 * Uses smooth cubic entry/exit ramps so fog rolls in organically without abrupt popping.
 */
export function sampleBlizzardSectionIntensity(
  levelNumber: number,
  distance: number,
  levelLength: number,
): number {
  const zones = getBlizzardZonesForLevel(levelNumber, levelLength);
  let maxIntensity = 0;

  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (distance <= z.zStart - z.fadeMeters || distance >= z.zEnd + z.fadeMeters) {
      continue;
    }
    const enterT = smoothstep01((distance - (z.zStart - z.fadeMeters)) / Math.max(1, z.fadeMeters * 1.4));
    const exitT = smoothstep01(((z.zEnd + z.fadeMeters) - distance) / Math.max(1, z.fadeMeters * 1.4));
    const val = Math.min(enterT, exitT) * z.peakIntensity;
    if (val > maxIntensity) {
      maxIntensity = val;
    }
  }

  // Always ease out approaching the warm mountain shelter so the cabin landmark reads clearly
  const progress = levelLength > 0 ? clamp01(distance / levelLength) : 0;
  const shelterClearMask = 1 - smoothstep01((progress - 0.87) / 0.11);
  return clamp01(maxIntensity * shelterClearMask);
}

/**
 * Compute normalized mountain altitude factor in [0, 1].
 * Climbs progressively from Level 1 (Snowy Foothills) up to Level 10 (Storm Peak Summit),
 * with a subtle upper-slope crest elevation lift along high exposed mountain runs.
 */
export function computeMountainAltitudeFactor(
  levelNumber: number,
  distance: number,
  levelLength: number,
): number {
  const campaignAltitude = clamp01((Math.max(1, levelNumber) - 1) / 9);
  const progress = levelLength > 0 ? clamp01(distance / levelLength) : 0;
  // Upper-ridge exposure lift on mid/upper levels (peaks on exposed mid-mountain crests, settles near valley shelter)
  const ridgeLift =
    campaignAltitude > 0
      ? Math.sin(progress * Math.PI) * 0.12 * (0.35 + 0.65 * campaignAltitude)
      : 0;
  return clamp01(campaignAltitude * 0.92 + ridgeLift);
}

/** Create a zero-allocation mutable fog state initialized to baseline clear alpine fog. */
export function createDynamicFogState(): DynamicFogState {
  return {
    density: DYNAMIC_FOG_CONFIG.baseDensity,
    altitudeFactor: 0,
    blizzardIntensity: 0,
    skyHazeAmount: 0,
    keyLightScale: 1,
    colorR: CLEAR_RGB[0],
    colorG: CLEAR_RGB[1],
    colorB: CLEAR_RGB[2],
  };
}

/**
 * Compute target depth fog density, atmospheric color, sky horizon haze, and overcast lighting
 * directly into `out` (zero heap allocations).
 */
export function computeDynamicFogTargets(
  input: DynamicFogInput,
  out: DynamicFogState = createDynamicFogState(),
): DynamicFogState {
  const levelNumber = Math.max(1, Math.min(10, Math.floor(input.levelNumber)));
  const levelLength = Math.max(300, input.levelLength);
  const distance = Math.max(0, input.distance);
  const gust = clamp01(input.windGustIntensity ?? 0);
  const avalanche = clamp01(input.avalancheDanger ?? 0);
  const time = input.time ?? 0;

  if (input.phase === 'title') {
    out.density = DYNAMIC_FOG_CONFIG.baseDensity;
    out.altitudeFactor = 0;
    out.blizzardIntensity = 0;
    out.skyHazeAmount = 0;
    out.keyLightScale = 1;
    out.colorR = CLEAR_RGB[0];
    out.colorG = CLEAR_RGB[1];
    out.colorB = CLEAR_RGB[2];
    return out;
  }

  const altitudeFactor = computeMountainAltitudeFactor(levelNumber, distance, levelLength);

  if (input.phase === 'victory') {
    // Cozy warm shelter clearing: retain subtle high-altitude depth atmosphere without obscuring celebration
    const victoryAltitudeMix = altitudeFactor * 0.35;
    out.altitudeFactor = altitudeFactor;
    out.blizzardIntensity = 0;
    out.density =
      DYNAMIC_FOG_CONFIG.baseDensity +
      victoryAltitudeMix * DYNAMIC_FOG_CONFIG.maxAltitudeDensityBonus;
    out.skyHazeAmount = victoryAltitudeMix * 0.25;
    out.keyLightScale = 1 - victoryAltitudeMix * 0.06;
    out.colorR = CLEAR_RGB[0] + (ALTITUDE_RGB[0] - CLEAR_RGB[0]) * victoryAltitudeMix;
    out.colorG = CLEAR_RGB[1] + (ALTITUDE_RGB[1] - CLEAR_RGB[1]) * victoryAltitudeMix;
    out.colorB = CLEAR_RGB[2] + (ALTITUDE_RGB[2] - CLEAR_RGB[2]) * victoryAltitudeMix;
    return out;
  }

  const rawBlizzard = sampleBlizzardSectionIntensity(levelNumber, distance, levelLength);
  // Active wind gusts amplify perceived blizzard whiteout slightly when snow is whipping across the slope
  const blizzardIntensity = clamp01(rawBlizzard + gust * (0.1 + rawBlizzard * 0.14));

  // Subtle slow mountain-cloud breathing modulation (±3.5% only when mist/blizzard is present)
  const breath =
    1 + (Math.sin(time * 0.72) * 0.6 + Math.cos(time * 1.31) * 0.4) * 0.035 * Math.max(altitudeFactor * 0.5, blizzardIntensity);

  // Smooth non-linear altitude & blizzard depth-fog buildup
  const altitudeDensity =
    Math.pow(altitudeFactor, 1.15) * DYNAMIC_FOG_CONFIG.maxAltitudeDensityBonus;
  const blizzardDensity =
    Math.pow(blizzardIntensity, 1.08) * DYNAMIC_FOG_CONFIG.maxBlizzardDensityBonus;
  const gustDensity = gust * DYNAMIC_FOG_CONFIG.maxGustDensityBonus;
  const avalancheDensity =
    (input.phase === 'gameover' ? 0.85 : avalanche) *
    DYNAMIC_FOG_CONFIG.maxAvalancheDensityBonus;

  const rawDensity =
    (DYNAMIC_FOG_CONFIG.baseDensity +
      altitudeDensity +
      blizzardDensity +
      gustDensity +
      avalancheDensity) *
    breath;

  out.density = Math.max(
    DYNAMIC_FOG_CONFIG.baseDensity,
    Math.min(DYNAMIC_FOG_CONFIG.maxDensityCap, rawDensity),
  );
  out.altitudeFactor = altitudeFactor;
  out.blizzardIntensity = blizzardIntensity;

  // Blend fog color: Clear azure alpine haze -> Frosty high-altitude ridge -> Silver-blue blizzard mist
  const altR = CLEAR_RGB[0] + (ALTITUDE_RGB[0] - CLEAR_RGB[0]) * altitudeFactor;
  const altG = CLEAR_RGB[1] + (ALTITUDE_RGB[1] - CLEAR_RGB[1]) * altitudeFactor;
  const altB = CLEAR_RGB[2] + (ALTITUDE_RGB[2] - CLEAR_RGB[2]) * altitudeFactor;

  const blizzColorMix = clamp01(blizzardIntensity * 0.88 + avalanche * 0.1);
  out.colorR = altR + (BLIZZARD_RGB[0] - altR) * blizzColorMix;
  out.colorG = altG + (BLIZZARD_RGB[1] - altG) * blizzColorMix;
  out.colorB = altB + (BLIZZARD_RGB[2] - altB) * blizzColorMix;

  // Synchronized sky-dome horizon haze veil so distant fogged slopes melt seamlessly into the sky
  out.skyHazeAmount = clamp01(altitudeFactor * 0.28 + blizzardIntensity * 0.62);
  // Subtle moody overcast dimming of warm key sunlight inside deep blizzards
  out.keyLightScale = Math.max(0.78, 1 - altitudeFactor * 0.06 - blizzardIntensity * 0.16);

  return out;
}

const _targetScratch: DynamicFogState = createDynamicFogState();

/**
 * Smoothly advance live fog state toward targets using frame-rate-independent exponential damping.
 * Pass `immediate = true` on initial mount or level switch to snap cleanly without transition lag.
 */
export function stepDynamicFogState(
  current: DynamicFogState,
  input: DynamicFogInput,
  dt: number,
  immediate = false,
): DynamicFogState {
  computeDynamicFogTargets(input, _targetScratch);

  if (immediate || dt <= 0) {
    current.density = _targetScratch.density;
    current.altitudeFactor = _targetScratch.altitudeFactor;
    current.blizzardIntensity = _targetScratch.blizzardIntensity;
    current.skyHazeAmount = _targetScratch.skyHazeAmount;
    current.keyLightScale = _targetScratch.keyLightScale;
    current.colorR = _targetScratch.colorR;
    current.colorG = _targetScratch.colorG;
    current.colorB = _targetScratch.colorB;
    return current;
  }

  const thickening = _targetScratch.density > current.density;
  const lambda = thickening
    ? DYNAMIC_FOG_CONFIG.densityDampIn
    : DYNAMIC_FOG_CONFIG.densityDampOut;
  const alpha = 1 - Math.exp(-lambda * Math.min(0.1, dt));

  current.density += (_targetScratch.density - current.density) * alpha;
  current.altitudeFactor += (_targetScratch.altitudeFactor - current.altitudeFactor) * alpha;
  current.blizzardIntensity += (_targetScratch.blizzardIntensity - current.blizzardIntensity) * alpha;
  current.skyHazeAmount += (_targetScratch.skyHazeAmount - current.skyHazeAmount) * alpha;
  current.keyLightScale += (_targetScratch.keyLightScale - current.keyLightScale) * alpha;
  current.colorR += (_targetScratch.colorR - current.colorR) * alpha;
  current.colorG += (_targetScratch.colorG - current.colorG) * alpha;
  current.colorB += (_targetScratch.colorB - current.colorB) * alpha;

  return current;
}
