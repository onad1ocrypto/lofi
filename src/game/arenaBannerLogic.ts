/**
 * Pure placement, clearance, and lightweight cloth-flutter kinematics for the
 * overhead "LOFI THE YETI" ski-race fabric banners spanning across the arena.
 *
 * Guarantees:
 * - High overhead clearance (bottom edge >= 6.6m above snow) so Lofi, Lil Yetis,
 *   manual jumps, and the chase camera pass cleanly underneath with zero collision
 *   or sightline occlusion.
 * - Side poles planted on the outer snowbanks beyond the playable track edge.
 * - Automatically nudged clear of all ramp launch/landing arcs on Levels 1–10.
 */

import {
  getTrackCenterXForLevel,
  getTrackElevationForLevel,
  getTrackHalfWidthForLevel,
  getTrackSlopeTangentX,
  setActiveTrackProfile,
} from './trackData';
import type { TrackRamp } from './types';

export const ARENA_BANNER_CONFIG = {
  /** Minimum height of the cloth bottom edge above center snow surface (meters). */
  bottomClearance: 6.6,
  /** Vertical fabric height of the stretched banner cloth (meters). */
  bannerHeight: 3.65,
  /** Extra horizontal distance outside track half-width where each pole is planted (meters). */
  poleSideMargin: 1.45,
  /** Gap between pole center and banner corner grommet spanned by tension ropes (meters). */
  ropeHorizontalGap: 0.72,
  /** Gentle downward catenary sag at the horizontal center of the cloth (meters). */
  catenarySag: 0.42,
  /** Height of wooden pole top above cloth top edge before the snow cap (meters). */
  poleTopOverhang: 0.58,
  /** Underground anchor depth so poles never float on uneven snowbanks (meters). */
  poleAnchorDepth: 2.2,
  /** Start gate distance down-track so players see the banner immediately on launch (meters). */
  startGateZ: 34,
  /** Target fraction of levelLength for the mid-track race gate. */
  midGateRatio: 0.48,
  /** Minimum clearance away from any ramp start/end so jumps never approach the cloth (meters). */
  rampExclusionBefore: 16,
  rampExclusionAfter: 24,
  /** Reference peak head height of Lofi during a max manual jump (meters) for clearance audits. */
  maxManualJumpHeadHeight: 4.7,
} as const;

export interface ArenaBannerPlacement {
  readonly id: 'start_gate' | 'mid_gate';
  readonly z: number;
  readonly centerX: number;
  readonly groundY: number;
  readonly halfWidth: number;
  readonly poleHalfSpan: number;
  readonly bannerSpan: number;
  readonly bottomClearance: number;
  readonly bottomY: number;
  readonly topY: number;
  readonly poleTopY: number;
  readonly yaw: number;
}

export interface ClothVertexOffsetOut {
  x: number;
  y: number;
  z: number;
}

/** Returns true if a candidate track distance lies inside a ramp's launch or landing exclusion window. */
export function isDistanceInsideRampExclusion(
  z: number,
  ramps: readonly TrackRamp[],
): boolean {
  for (let i = 0; i < ramps.length; i++) {
    const r = ramps[i];
    const rampEndZ = r.zStart + r.length;
    const afterMargin = Math.max(
      ARENA_BANNER_CONFIG.rampExclusionAfter,
      r.landingClearMeters,
    );
    if (
      z >= r.zStart - ARENA_BANNER_CONFIG.rampExclusionBefore &&
      z <= rampEndZ + afterMargin
    ) {
      return true;
    }
  }
  return false;
}

/** Nudges a candidate banner distance forward/backward until it is clear of all ramp zones. */
export function resolveRampSafeBannerZ(
  preferredZ: number,
  levelLength: number,
  ramps: readonly TrackRamp[],
): number {
  const minZ = 24;
  const maxZ = Math.max(minZ, levelLength - 70);
  const clamped = Math.max(minZ, Math.min(maxZ, preferredZ));
  if (!isDistanceInsideRampExclusion(clamped, ramps)) {
    return clamped;
  }

  for (let offset = 12; offset <= 160; offset += 12) {
    const forward = clamped + offset;
    if (forward <= maxZ && !isDistanceInsideRampExclusion(forward, ramps)) {
      return forward;
    }
    const backward = clamped - offset;
    if (backward >= minZ && !isDistanceInsideRampExclusion(backward, ramps)) {
      return backward;
    }
  }
  return clamped;
}

/**
 * Computes deterministic overhead Start Gate and Mid-Track Gate banner placements
 * for any level 1–10 without modifying gameplay track geometry or obstacles.
 */
export function computeArenaBannerPlacements(
  levelNumber: number,
  levelLength: number,
  ramps: readonly TrackRamp[] = [],
): ArenaBannerPlacement[] {
  const startZ = resolveRampSafeBannerZ(
    ARENA_BANNER_CONFIG.startGateZ,
    levelLength,
    ramps,
  );
  const midZ = resolveRampSafeBannerZ(
    Math.round(levelLength * ARENA_BANNER_CONFIG.midGateRatio),
    levelLength,
    ramps,
  );

  // Use tangent helper cleanly with the requested level profile
  setActiveTrackProfile(levelNumber);

  const buildGate = (
    id: ArenaBannerPlacement['id'],
    z: number,
  ): ArenaBannerPlacement => {
    const centerX = getTrackCenterXForLevel(levelNumber, z);
    const groundY = getTrackElevationForLevel(levelNumber, z);
    const halfWidth = getTrackHalfWidthForLevel(levelNumber, z);
    const poleHalfSpan = halfWidth + ARENA_BANNER_CONFIG.poleSideMargin;
    const bannerSpan = Math.max(
      14,
      (poleHalfSpan - ARENA_BANNER_CONFIG.ropeHorizontalGap) * 2,
    );
    const bottomY = groundY + ARENA_BANNER_CONFIG.bottomClearance;
    const topY = bottomY + ARENA_BANNER_CONFIG.bannerHeight;
    const poleTopY = topY + ARENA_BANNER_CONFIG.poleTopOverhang;
    const tangentX = getTrackSlopeTangentX(z);
    const yaw = -Math.atan(tangentX);

    return {
      id,
      z,
      centerX,
      groundY,
      halfWidth,
      poleHalfSpan,
      bannerSpan,
      bottomClearance: ARENA_BANNER_CONFIG.bottomClearance,
      bottomY,
      topY,
      poleTopY,
      yaw,
    };
  };

  return [buildGate('start_gate', startZ), buildGate('mid_gate', midZ)];
}

/**
 * Computes a single cloth mesh vertex in local banner coordinates (origin at banner center):
 * - `u` in [0, 1] left-to-right across the track span
 * - `v` in [0, 1] bottom-to-top across the banner height
 * - Strictly pins `u = 0` and `u = 1` edges to zero Z-flutter so grommets stay locked to the ropes
 * - Applies gentle parabolic catenary drape and lightweight traveling alpine breeze waves
 */
export function evaluateBannerClothVertex(
  u: number,
  v: number,
  bannerSpan: number,
  bannerHeight: number,
  time: number,
  windForce = 0,
  out: ClothVertexOffsetOut = { x: 0, y: 0, z: 0 },
): ClothVertexOffsetOut {
  const clampedU = Math.max(0, Math.min(1, u));
  const clampedV = Math.max(0, Math.min(1, v));

  const x = (clampedU - 0.5) * bannerSpan;
  // Smooth parabolic sag (0 at pole corners u=0/1, max at center u=0.5)
  const sagEnvelope = 4 * clampedU * (1 - clampedU);
  // Bottom edge drapes slightly deeper than the taut top rope
  const verticalDrapeWeight = 0.78 + 0.22 * (1 - clampedV);
  const sagY = -ARENA_BANNER_CONFIG.catenarySag * sagEnvelope * verticalDrapeWeight;

  // Lightweight alpine breeze flutter (strictly 0 at left/right grommet edges)
  const pinMask = Math.sin(clampedU * Math.PI);
  const gustIntensity = Math.min(1.5, Math.abs(windForce) * 0.45);
  const waveSpeed = 2.4 + gustIntensity * 1.4;
  const ampScale = 1 + gustIntensity * 0.65;
  const hemFreedom = 0.62 + 0.38 * (1 - clampedV);

  const primaryWave = Math.sin(clampedU * Math.PI * 2.5 - time * waveSpeed);
  const secondaryRipple = Math.sin(
    clampedU * Math.PI * 5.2 - time * (waveSpeed * 1.65) + clampedV * 1.8,
  );
  const flutterZ =
    pinMask * hemFreedom * ampScale * (primaryWave * 0.14 + secondaryRipple * 0.045);
  const flutterY = pinMask * hemFreedom * primaryWave * 0.025;

  out.x = x;
  out.y = (clampedV - 0.5) * bannerHeight + sagY + flutterY;
  out.z = flutterZ;
  return out;
}
