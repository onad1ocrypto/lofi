import { computeArenaDifficultyProfile } from './arenaDifficulty';
import {
  computeCarvingPassBlend,
  computeCarvingPassCenterOffset,
} from './carvingPassLogic';
import {
  computeSteepZonesElevationOffset,
  computeSteepZonesExtraGradient,
  computeSteepZonesExtraHalfWidth,
} from './steepDescentLogic';
import type {
  CarvingPassConfig,
  ObstacleKind,
  SteepDescentZone,
  TrackObstacle,
  TrackSplitZone,
} from './types';

/** Maximum downhill distance supported by the shared snow terrain ribbon. */
export const TRACK_LENGTH = 1560;

/** Extra snow terrain extending before start and behind the shelter so world never ends abruptly. */
export const TRACK_START_PADDING = 55;
export const TRACK_END_PADDING = 90;

/** Downhill slope gradient (rise / run). ~11.5 degrees looks crisp and downhill in 3rd-person view. */
export const SLOPE_GRADIENT = 0.21;

export interface LevelTrackProfile {
  levelNumber: number;
  length: number;
  baseHalfWidth: number;
  widthBreathAmp: number;
  widthBreathFreq: number;
  /** Primary sweeping mountain bend amplitude & frequency */
  curveAmp1: number;
  curveFreq1: number;
  curvePhase1: number;
  /** Secondary S-curve harmonic amplitude & frequency */
  curveAmp2: number;
  curveFreq2: number;
  curvePhase2: number;
  /** Tertiary alpine chicane harmonic amplitude & frequency (escalates across levels) */
  curveAmp3: number;
  curveFreq3: number;
  curvePhase3: number;
  /** Minimum curve intensity multiplier near start of track (scales up toward finish) */
  earlyCurveScale: number;
  /** Additional curve intensity gained progressively from start to late track */
  lateCurveGain: number;
  /** Straightened/calmed ramp corridors so players never launch into a blind sharp turn */
  calmZones: ReadonlyArray<{ zStart: number; zEnd: number }>;
  /** Optional local dual-route wide bowl (Level 3: Safe lane vs Bonus ramp lane) */
  splitZone?: TrackSplitZone;
  /** Optional reusable steep-descent challenge zones (Level 3 steep drop, Level 4 Carving Pass) */
  steepDescents?: readonly SteepDescentZone[];
  /** Optional dedicated S-shaped carving downhill centerline & outside snow-mound config (Level 4) */
  carvingPass?: CarvingPassConfig;
}

/**
 * Hand-designed progressive 10-level track profiles:
 * Difficulty scales smoothly BOTH within each level (early -> mid -> late curves)
 * AND gradually across all 10 levels (Level 1 wide gentle foothills -> Level 10 Storm Peak Summit).
 */
export const LEVEL_TRACK_PROFILES: readonly LevelTrackProfile[] = [
  // LEVEL 1 — Snowy Foothills (780m, wide gentle intro bends)
  {
    levelNumber: 1,
    length: 780,
    baseHalfWidth: 12.8,
    widthBreathAmp: 0.5,
    widthBreathFreq: 0.0068,
    curveAmp1: 11.4,
    curveFreq1: 0.0082,
    curvePhase1: 0.0,
    curveAmp2: 3.4,
    curveFreq2: 0.0168,
    curvePhase2: 0.45,
    curveAmp3: 0.7,
    curveFreq3: 0.027,
    curvePhase3: -0.35,
    earlyCurveScale: 0.60,
    lateCurveGain: 0.42,
    calmZones: [{ zStart: 312, zEnd: 400 }],
  },
  // LEVEL 2 — Frosty Ridge (860m, gentle sweeping S-curves)
  {
    levelNumber: 2,
    length: 860,
    baseHalfWidth: 12.3,
    widthBreathAmp: 0.55,
    widthBreathFreq: 0.0074,
    curveAmp1: 13.0,
    curveFreq1: 0.0087,
    curvePhase1: 0.85,
    curveAmp2: 4.1,
    curveFreq2: 0.0178,
    curvePhase2: -0.7,
    curveAmp3: 0.9,
    curveFreq3: 0.029,
    curvePhase3: 0.45,
    earlyCurveScale: 0.61,
    lateCurveGain: 0.42,
    calmZones: [
      { zStart: 272, zEnd: 360 },
      { zStart: 542, zEnd: 632 },
    ],
  },
  // LEVEL 3 — Pine Valley (940m, smooth approachable bends + wide gentle dual-route split bowl)
  {
    levelNumber: 3,
    length: 940,
    baseHalfWidth: 11.8,
    widthBreathAmp: 0.6,
    widthBreathFreq: 0.008,
    curveAmp1: 15.8,
    curveFreq1: 0.0091,
    curvePhase1: -1.65,
    curveAmp2: 4.9,
    curveFreq2: 0.0188,
    curvePhase2: 1.05,
    curveAmp3: 1.15,
    curveFreq3: 0.031,
    curvePhase3: -0.55,
    earlyCurveScale: 0.20,
    lateCurveGain: 1.45,
    calmZones: [
      { zStart: 435, zEnd: 575 },
      { zStart: 594, zEnd: 736 },
    ],
    splitZone: {
      zStart: 420,
      zEnd: 590,
      extraHalfWidth: 6.2,
      dividerOffsetX: 0,
      safeSide: -1,
      bonusSide: 1,
    },
    steepDescents: [
      {
        id: 'lv3-steep-drop',
        zStart: 598,
        zEnd: 676,
        approachDistance: 46,
        recoveryDistance: 64,
        extraGradient: 0.36,
        extraHalfWidth: 4.0,
      },
    ],
  },
  // LEVEL 4 — Carving Pass (1020m, wide S-shaped downhill carving pass + flat recovery)
  {
    levelNumber: 4,
    length: 1020,
    baseHalfWidth: 11.4,
    widthBreathAmp: 0.65,
    widthBreathFreq: 0.0086,
    curveAmp1: 15.2,
    curveFreq1: 0.0094,
    curvePhase1: 1.55,
    curveAmp2: 5.0,
    curveFreq2: 0.0192,
    curvePhase2: -1.25,
    curveAmp3: 1.25,
    curveFreq3: 0.032,
    curvePhase3: 0.75,
    earlyCurveScale: 0.56,
    lateCurveGain: 0.42,
    calmZones: [
      { zStart: 252, zEnd: 344 },
      { zStart: 814, zEnd: 904 },
    ],
    steepDescents: [
      {
        id: 'lv4-carving-pass',
        zStart: 490,
        zEnd: 710,
        approachDistance: 54,
        recoveryDistance: 92,
        extraGradient: 0.27,
        extraHalfWidth: 4.8,
        cameraMode: 'carving',
        enableCarvingSpeedControl: true,
      },
    ],
    carvingPass: {
      zStart: 490,
      zEnd: 710,
      blendStart: 432,
      blendEnd: 856,
      sAmplitude: 11.5,
      firstBendSign: 1,
      moundSpacing: 6.5,
    },
  },
  // LEVEL 5 — Glacier Bend (1100m, expressive winding valley + dual-route glacier bowl)
  {
    levelNumber: 5,
    length: 1100,
    baseHalfWidth: 11.0,
    widthBreathAmp: 0.7,
    widthBreathFreq: 0.0092,
    curveAmp1: 16.5,
    curveFreq1: 0.0099,
    curvePhase1: -1.65,
    curveAmp2: 5.9,
    curveFreq2: 0.0204,
    curvePhase2: 0.65,
    curveAmp3: 1.55,
    curveFreq3: 0.0338,
    curvePhase3: -0.95,
    earlyCurveScale: 0.56,
    lateCurveGain: 0.52,
    calmZones: [
      { zStart: 455, zEnd: 615 },
      { zStart: 782, zEnd: 868 },
    ],
    splitZone: {
      zStart: 445,
      zEnd: 625,
      extraHalfWidth: 5.6,
      dividerOffsetX: 0,
      safeSide: -1,
      bonusSide: 1,
    },
  },
  // LEVEL 6 — Timber Chute (1180m, faster narrower S-curves through dense alpine pines)
  {
    levelNumber: 6,
    length: 1180,
    baseHalfWidth: 10.6,
    widthBreathAmp: 0.72,
    widthBreathFreq: 0.0098,
    curveAmp1: 17.5,
    curveFreq1: 0.0102,
    curvePhase1: 0.35,
    curveAmp2: 6.4,
    curveFreq2: 0.0211,
    curvePhase2: 1.85,
    curveAmp3: 1.75,
    curveFreq3: 0.0348,
    curvePhase3: 0.25,
    earlyCurveScale: 0.42,
    lateCurveGain: 0.72,
    calmZones: [
      { zStart: 322, zEnd: 412 },
      { zStart: 762, zEnd: 856 },
    ],
  },
  // LEVEL 7 — Blizzard Gorge (1260m, crisp technical switchbacks + dual-route bonus split)
  {
    levelNumber: 7,
    length: 1260,
    baseHalfWidth: 10.3,
    widthBreathAmp: 0.75,
    widthBreathFreq: 0.0104,
    curveAmp1: 18.0,
    curveFreq1: 0.0105,
    curvePhase1: -0.45,
    curveAmp2: 6.7,
    curveFreq2: 0.0217,
    curvePhase2: -1.75,
    curveAmp3: 1.9,
    curveFreq3: 0.0358,
    curvePhase3: 1.1,
    earlyCurveScale: 0.68,
    lateCurveGain: 0.40,
    calmZones: [
      { zStart: 470, zEnd: 655 },
      { zStart: 882, zEnd: 976 },
    ],
    splitZone: {
      zStart: 470,
      zEnd: 655,
      extraHalfWidth: 5.7,
      dividerOffsetX: 0,
      safeSide: -1,
      bonusSide: 1,
    },
  },
  // LEVEL 8 — Avalanche Run (1340m, sustained carving chicanes & 3 snow kickers)
  {
    levelNumber: 8,
    length: 1340,
    baseHalfWidth: 10.0,
    widthBreathAmp: 0.78,
    widthBreathFreq: 0.0108,
    curveAmp1: 18.1,
    curveFreq1: 0.0108,
    curvePhase1: 2.1,
    curveAmp2: 6.8,
    curveFreq2: 0.0222,
    curvePhase2: 0.35,
    curveAmp3: 2.0,
    curveFreq3: 0.0366,
    curvePhase3: -1.35,
    earlyCurveScale: 0.68,
    lateCurveGain: 0.40,
    calmZones: [
      { zStart: 282, zEnd: 372 },
      { zStart: 632, zEnd: 726 },
      { zStart: 972, zEnd: 1066 },
    ],
  },
  // LEVEL 9 — Frostbite Ridge (1420m, high-speed alpine switchbacks + dual-route ridge bowl)
  {
    levelNumber: 9,
    length: 1420,
    baseHalfWidth: 9.7,
    widthBreathAmp: 0.78,
    widthBreathFreq: 0.0112,
    curveAmp1: 20.6,
    curveFreq1: 0.0110,
    curvePhase1: -2.2,
    curveAmp2: 7.9,
    curveFreq2: 0.0226,
    curvePhase2: 1.45,
    curveAmp3: 2.25,
    curveFreq3: 0.0372,
    curvePhase3: 0.65,
    earlyCurveScale: 0.72,
    lateCurveGain: 0.39,
    calmZones: [
      { zStart: 485, zEnd: 635 },
      { zStart: 856, zEnd: 940 },
      { zStart: 1126, zEnd: 1210 },
    ],
    splitZone: {
      zStart: 465,
      zEnd: 655,
      extraHalfWidth: 5.8,
      dividerOffsetX: 0,
      safeSide: -1,
      bonusSide: 1,
    },
  },
  // LEVEL 10 — Storm Peak Summit (1500m, pinnacle alpine challenge with 9 Lil Yetis)
  {
    levelNumber: 10,
    length: 1500,
    baseHalfWidth: 9.5,
    widthBreathAmp: 0.8,
    widthBreathFreq: 0.0115,
    curveAmp1: 21.8,
    curveFreq1: 0.0112,
    curvePhase1: 1.15,
    curveAmp2: 8.3,
    curveFreq2: 0.0230,
    curvePhase2: -0.95,
    curveAmp3: 2.45,
    curveFreq3: 0.0378,
    curvePhase3: -0.45,
    earlyCurveScale: 0.74,
    lateCurveGain: 0.38,
    calmZones: [
      { zStart: 495, zEnd: 645 },
      { zStart: 896, zEnd: 980 },
      { zStart: 1186, zEnd: 1270 },
    ],
    splitZone: {
      zStart: 475,
      zEnd: 665,
      extraHalfWidth: 5.9,
      dividerOffsetX: 0,
      safeSide: -1,
      bonusSide: 1,
    },
  },
] as const;

let activeLevelNumber = 1;

export function getLevelTrackProfile(levelNumber: number): LevelTrackProfile {
  const clamped = Math.max(
    1,
    Math.min(LEVEL_TRACK_PROFILES.length, Math.floor(levelNumber)),
  );
  return LEVEL_TRACK_PROFILES[clamped - 1];
}

export function setActiveTrackProfile(levelNumber: number): void {
  activeLevelNumber = getLevelTrackProfile(levelNumber).levelNumber;
}

export function getActiveTrackLevelNumber(): number {
  return activeLevelNumber;
}

function smoothstep01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Smooth bump envelope in [0, 1] peaking inside [zStart, zEnd] with smooth transition shoulders.
 */
function smoothZoneBlend(z: number, zStart: number, zEnd: number, shoulder = 32): number {
  if (z <= zStart - shoulder || z >= zEnd + shoulder) return 0;
  const up = smoothstep01((z - (zStart - shoulder)) / shoulder);
  const down = smoothstep01((zEnd + shoulder - z) / shoulder);
  return Math.min(up, down);
}

/** Usable snow track half-width at distance z for a specific level profile. */
export function getTrackHalfWidthForLevel(levelNumber: number, z: number): number {
  const profile = getLevelTrackProfile(levelNumber);
  if (z < 105) {
    return Math.max(11.4, profile.baseHalfWidth);
  }
  if (z > profile.length - 85) {
    // Generous arrival plaza opening smoothly into the wooden shelter
    const blend = smoothstep01((z - (profile.length - 85)) / 45);
    const plazaHalfW = 13.2;
    const regular =
      profile.baseHalfWidth + Math.sin(z * profile.widthBreathFreq) * profile.widthBreathAmp;
    return regular * (1 - blend) + plazaHalfW * blend;
  }

  // Subtle progressive narrowing as the rider descends deeper into the mountain
  const progress = Math.max(0, Math.min(1, (z - 105) / Math.max(200, profile.length - 190)));
  const progressiveNarrow = progress * (0.30 + (profile.levelNumber - 1) * 0.08);

  let halfW =
    profile.baseHalfWidth -
    progressiveNarrow +
    Math.sin(z * profile.widthBreathFreq) * profile.widthBreathAmp;

  // Widen smoothly inside Level 3's dual-route split arena so both Safe and Bonus lanes feel spacious
  if (profile.splitZone) {
    const splitBlend = smoothZoneBlend(
      z,
      profile.splitZone.zStart,
      profile.splitZone.zEnd,
      36,
    );
    halfW += profile.splitZone.extraHalfWidth * splitBlend;
  }

  // Widen smoothly across steep-descent slopes and their landing/recovery zones
  if (profile.steepDescents && profile.steepDescents.length > 0) {
    halfW += computeSteepZonesExtraHalfWidth(profile.steepDescents, z);
  }

  return Math.max(8.4, halfW);
}

/** Usable snow track half-width for the currently active level. */
export function getTrackHalfWidth(z: number): number {
  return getTrackHalfWidthForLevel(activeLevelNumber, z);
}

/**
 * Smooth centerline X curve along distance z (in meters) for a specific level profile.
 * Curves intensify progressively from start toward the late mountain stretch and across levels.
 * In Three.js world space, the player rides toward -Z (worldZ = -distance).
 */
export function getTrackCenterXForLevel(levelNumber: number, z: number): number {
  const profile = getLevelTrackProfile(levelNumber);
  const clamped = Math.max(0, Math.min(z, profile.length + TRACK_END_PADDING));

  // Smooth straight runway at start (0..95m) and clean straight approach into the shelter
  const startSmooth = smoothstep01(clamped / 95);
  const endDist = Math.max(0, profile.length - clamped);
  const endSmooth = smoothstep01(endDist / 105);
  const envelope = startSmooth * endSmooth;

  // Progressive within-level difficulty ramp: gentler opening bends -> sharper winding bends deeper down
  const progress = Math.max(0, Math.min(1, clamped / Math.max(1, profile.length)));
  const difficultyRamp = profile.earlyCurveScale + profile.lateCurveGain * smoothstep01(progress);

  // Gently ease curvature through ramp takeoff & landing corridors with wide smooth shoulders
  let calmDamp = 1.0;
  for (let i = 0; i < profile.calmZones.length; i++) {
    const cz = profile.calmZones[i];
    const b = smoothZoneBlend(clamped, cz.zStart, cz.zEnd, 74);
    if (b > 0) {
      calmDamp = Math.min(calmDamp, 1 - b * 0.44);
    }
  }

  const difficultyCurveScale =
    computeArenaDifficultyProfile(levelNumber).curveIntensityScale;
  const wave1 =
    Math.sin(clamped * profile.curveFreq1 + profile.curvePhase1) * profile.curveAmp1;
  const wave2 =
    Math.sin(clamped * profile.curveFreq2 + profile.curvePhase2) * profile.curveAmp2;
  const wave3 =
    Math.sin(clamped * profile.curveFreq3 + profile.curvePhase3) * profile.curveAmp3;
  const baseCenterX =
    (wave1 + wave2 + wave3) *
    envelope *
    difficultyRamp *
    calmDamp *
    difficultyCurveScale;

  if (!profile.carvingPass) {
    return baseCenterX;
  }

  // Smoothly replace background harmonics across the Carving Pass approach, S-descent,
  // and flat recovery area so the S-shaped route is unmistakable and exits straight with zero sharp turn.
  const passBlend = computeCarvingPassBlend(profile.carvingPass, clamped);
  const sCurveX = computeCarvingPassCenterOffset(profile.carvingPass, clamped);
  return baseCenterX * (1 - passBlend) + sCurveX;
}

/** Smooth centerline X curve for the currently active level. */
export function getTrackCenterX(z: number): number {
  return getTrackCenterXForLevel(activeLevelNumber, z);
}

/**
 * Measure winding curve difficulty metrics for a level (total lateral turning distance,
 * average slope, and peak curve slope) for deterministic progression tests.
 */
export function measureLevelCurveMetrics(levelNumber: number): {
  totalLateralTurnMeters: number;
  meanAbsSlope: number;
  peakAbsSlope: number;
  earlyMeanSlope: number;
  lateMeanSlope: number;
} {
  const profile = getLevelTrackProfile(levelNumber);
  const step = 4;
  let totalTurn = 0;
  let peakSlope = 0;
  let sumSlope = 0;
  let samples = 0;
  let earlySum = 0;
  let earlyCount = 0;
  let lateSum = 0;
  let lateCount = 0;

  const startZ = 100;
  const endZ = profile.length - 110;
  const midZ = (startZ + endZ) * 0.5;

  for (let z = startZ; z < endZ; z += step) {
    const dx = getTrackCenterXForLevel(levelNumber, z + step) - getTrackCenterXForLevel(levelNumber, z);
    const absDx = Math.abs(dx);
    const slope = absDx / step;
    totalTurn += absDx;
    sumSlope += slope;
    samples++;
    if (slope > peakSlope) peakSlope = slope;

    if (z < midZ) {
      earlySum += slope;
      earlyCount++;
    } else {
      lateSum += slope;
      lateCount++;
    }
  }

  return {
    totalLateralTurnMeters: totalTurn,
    meanAbsSlope: samples > 0 ? sumSlope / samples : 0,
    peakAbsSlope: peakSlope,
    earlyMeanSlope: earlyCount > 0 ? earlySum / earlyCount : 0,
    lateMeanSlope: lateCount > 0 ? lateSum / lateCount : 0,
  };
}

/**
 * Derivative d(centerX)/dz for orienting track geometry, character, and camera tangentially.
 */
export function getTrackSlopeTangentX(z: number): number {
  const eps = 0.5;
  return (getTrackCenterX(z + eps) - getTrackCenterX(z - eps)) / (2 * eps);
}

/**
 * Extra slope gradient contributed by any active steep-descent zone at (levelNumber, z).
 * Returns 0 on Levels 1, 2, and all levels without steepDescents.
 */
export function getTrackExtraGradientForLevel(levelNumber: number, z: number): number {
  const profile = getLevelTrackProfile(levelNumber);
  return computeSteepZonesExtraGradient(profile.steepDescents, z);
}

/**
 * Downhill terrain pitch angle in radians for orienting riders cleanly along both regular slopes
 * and steep-descent faces (strictly equals `-Math.atan(SLOPE_GRADIENT)` outside steep descents).
 */
export function getTrackPitchAt(levelNumber: number, z: number): number {
  const extraGrad = getTrackExtraGradientForLevel(levelNumber, z);
  return -Math.atan(SLOPE_GRADIENT + extraGrad);
}

/**
 * Ground elevation Y at distance z along the slope, smoothly integrating any steep-descent drops
 * and flattening cleanly right at the active level's shelter plaza.
 */
export function getTrackElevationForLevel(levelNumber: number, z: number): number {
  const profile = getLevelTrackProfile(levelNumber);
  const baseDrop = -z * SLOPE_GRADIENT;
  const steepOffset = computeSteepZonesElevationOffset(profile.steepDescents, z);
  const rollAmp = 0.50 + (profile.levelNumber - 1) * 0.05;
  const gentleRoll = Math.sin(z * 0.018 + levelNumber * 0.8) * rollAmp;

  // Flatten gently into the active level's shelter plaza so the cabin sits level on snow
  const shelterBlend = smoothstep01((z - (profile.length - 32)) / 48);
  const totalSteepAtShelter = computeSteepZonesElevationOffset(
    profile.steepDescents,
    profile.length,
  );
  const flatY = -profile.length * SLOPE_GRADIENT + totalSteepAtShelter;
  const slopedY = baseDrop + steepOffset + gentleRoll;
  return slopedY * (1 - shelterBlend) + flatY * shelterBlend;
}

export function getTrackElevation(z: number): number {
  return getTrackElevationForLevel(activeLevelNumber, z);
}

/**
 * World-space ground height including raised snowbanks flanking the playable track.
 */
export function getGroundHeightAt(worldX: number, distanceZ: number): number {
  const centerX = getTrackCenterX(distanceZ);
  const halfW = getTrackHalfWidth(distanceZ);
  const baseY = getTrackElevation(distanceZ);
  const distFromCenter = Math.abs(worldX - centerX);

  if (distFromCenter <= halfW) {
    // Subtle concave dish across the groomed trail so snowbanks hug the edges
    const edgeT = Math.max(0, (distFromCenter - (halfW - 2.4)) / 2.4);
    return baseY + edgeT * edgeT * 0.45;
  }

  const bankDist = distFromCenter - halfW;
  // Snowbank shoulder rising into alpine ridge walls
  const bankRise = Math.min(5.2, bankDist * 0.52) + Math.pow(Math.min(bankDist, 18), 1.25) * 0.14;
  const undulation = Math.sin(distanceZ * 0.065 + (worldX > centerX ? 1.4 : -0.7)) * 0.65;
  return baseY + 0.45 + bankRise + Math.max(0, undulation * Math.min(1, bankDist / 4));
}

/** Legacy helper preserved for compatibility if anything references it directly. */
export function buildTrackObstacles(): TrackObstacle[] {
  const sampleSpecs: Array<{ z: number; laneFrac: number; kind: ObstacleKind; scale: number }> = [
    { z: 130, laneFrac: -0.55, kind: 'rock', scale: 1.05 },
    { z: 175, laneFrac: 0.52, kind: 'pine', scale: 1.08 },
  ];
  return sampleSpecs.map((bp, idx) => {
    const halfW = getTrackHalfWidth(bp.z);
    const offsetX = bp.laneFrac * (halfW - 1.5);
    const worldX = getTrackCenterX(bp.z) + offsetX;
    const worldY = getGroundHeightAt(worldX, bp.z);
    const baseRadius = bp.kind === 'rock' ? 1.22 : 1.02;
    return {
      id: idx,
      kind: bp.kind,
      z: bp.z,
      offsetX,
      worldX,
      worldY,
      radius: baseRadius * bp.scale,
      clearanceHeight: bp.kind === 'rock' ? 1.35 * bp.scale : 5.0 * bp.scale,
      scale: bp.scale,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      rotationY: (idx * 1.9) % (Math.PI * 2),
      tiltX: 0,
      tiltZ: 0,
      tint: 1,
      hit: false,
    };
  });
}
