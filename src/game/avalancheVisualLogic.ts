/**
 * Pure, camera-safe geometry and placement rules for the trailing 3D avalanche wave.
 *
 * Guarantees that the pursuing snow surge stays visually dramatic along the lower edge
 * and outer flanks behind Lofi's snowboard without EVER entering the chase camera's
 * near-plane or obstructing the sightline to Lofi, obstacles, or the downhill track.
 */

export interface AvalanchePuffLayout {
  readonly baseX: number;
  readonly baseY: number;
  readonly baseZ: number;
  readonly baseRadius: number;
  readonly heightSquash: number;
  readonly phase: number;
  readonly isFlank: boolean;
  readonly isMist: boolean;
}

export interface AvalancheVisualPose {
  /** Whether the 3D avalanche wave should be rendered at all this frame. */
  shouldRender: boolean;
  /** Track distance (meters, positive downhill) where the avalanche group is anchored. */
  groupTrackDistance: number;
  /** Normalized danger/closeness factor in [0, 1] once inside the visible chase range. */
  closeness: number;
  /** Overall smooth fade/scale factor in [0, 1] so the wave enters gently instead of popping. */
  visibilityScale: number;
}

export interface AvalanchePuffTransform {
  localX: number;
  localY: number;
  localZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  /** Camera clearance multiplier in [0, 1]; 0 means hidden to prevent camera clipping. */
  cameraClearance: number;
}

export const AVALANCHE_VISUAL_CONFIG = {
  /** Avalanche stays hidden while farther than this many meters behind Lofi. */
  visibleRangeMeters: 16.5,
  /** Distance (m) at which the low trailing snow wave reaches full visual scale. */
  fullPresenceMeters: 9.5,
  /** Minimum track distance (m) behind Lofi's snowboard tail at 0m avalanche gap. */
  minLagBehindPlayer: 1.85,
  /** Maximum track distance (m) behind Lofi when just entering the lower frame. */
  maxLagBehindPlayer: 5.2,
  /** Minimum forward clearance (m) kept strictly in front of the camera lens along track Z. */
  minForwardOfCamera: 4.35,
  /** Hard surface-distance cutoff (m) from camera center where any puff shrinks to 0. */
  cameraHardCutoffMeters: 2.6,
  /** Surface-distance (m) from camera center where a puff reaches 100% scale. */
  cameraSoftClearMeters: 4.6,
  /** Absolute maximum top height (m) above snow surface for center-lane puffs. */
  maxCenterTopHeight: 1.05,
  /** Absolute maximum top height (m) above snow surface for outer flank puffs. */
  maxFlankTopHeight: 2.1,
} as const;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Build a deterministic U-shaped low rolling snow-wave layout (14 compact puffs):
 * - Center lane (|x| <= 3.6m): low, ground-hugging frothy snow rollers that stay strictly
 *   below Lofi's knees/camera sightline.
 * - Outer flanks (|x| >= 4.2m): slightly fuller cartoon snow plumes framing the lower-left
 *   and lower-right edges of the track without crossing the center corridor.
 */
export function createAvalanchePuffLayouts(): readonly AvalanchePuffLayout[] {
  const specs: ReadonlyArray<{
    x: number;
    z: number;
    r: number;
    y: number;
    squash: number;
    flank: boolean;
    mist: boolean;
  }> = [
    // Low center frothy tongue (strictly <= 1.05m top height so sightline stays 100% open)
    { x: -3.2, z: -0.35, r: 0.62, y: 0.34, squash: 0.68, flank: false, mist: false },
    { x: -1.9, z: -0.55, r: 0.56, y: 0.30, squash: 0.64, flank: false, mist: true },
    { x: -0.65, z: -0.65, r: 0.52, y: 0.28, squash: 0.62, flank: false, mist: false },
    { x: 0.65, z: -0.62, r: 0.54, y: 0.29, squash: 0.62, flank: false, mist: true },
    { x: 1.95, z: -0.52, r: 0.58, y: 0.31, squash: 0.65, flank: false, mist: false },
    { x: 3.25, z: -0.32, r: 0.62, y: 0.34, squash: 0.68, flank: false, mist: true },

    // Left flanking rolling snow plumes (outer trail edge, never blocking Lofi)
    { x: -4.9, z: -0.15, r: 0.92, y: 0.54, squash: 0.78, flank: true, mist: false },
    { x: -6.4, z: 0.15, r: 1.12, y: 0.68, squash: 0.80, flank: true, mist: true },
    { x: -7.9, z: 0.45, r: 1.24, y: 0.78, squash: 0.82, flank: true, mist: false },
    { x: -9.3, z: 0.75, r: 1.10, y: 0.72, squash: 0.82, flank: true, mist: true },

    // Right flanking rolling snow plumes (outer trail edge, never blocking Lofi)
    { x: 4.9, z: -0.12, r: 0.92, y: 0.54, squash: 0.78, flank: true, mist: false },
    { x: 6.4, z: 0.18, r: 1.12, y: 0.68, squash: 0.80, flank: true, mist: true },
    { x: 7.9, z: 0.48, r: 1.24, y: 0.78, squash: 0.82, flank: true, mist: false },
    { x: 9.3, z: 0.78, r: 1.10, y: 0.72, squash: 0.82, flank: true, mist: true },
  ];

  return specs.map((s, i) => ({
    baseX: s.x,
    baseY: s.y,
    baseZ: s.z,
    baseRadius: s.r,
    heightSquash: s.squash,
    phase: i * 1.17,
    isFlank: s.flank,
    isMist: s.mist,
  }));
}

/**
 * Compute where and how strongly to show the 3D avalanche wave for the current frame.
 * Keeps the wave strictly inside the camera-safe trailing band behind Lofi's heels.
 */
export function computeAvalancheVisualPose(params: {
  playerDistance: number;
  avalancheDistance: number;
  cameraWorldZ: number;
  visible: boolean;
}): AvalancheVisualPose {
  const { playerDistance, avalancheDistance, cameraWorldZ, visible } = params;
  if (!visible || avalancheDistance >= AVALANCHE_VISUAL_CONFIG.visibleRangeMeters) {
    return {
      shouldRender: false,
      groupTrackDistance: playerDistance - AVALANCHE_VISUAL_CONFIG.maxLagBehindPlayer,
      closeness: 0,
      visibilityScale: 0,
    };
  }

  const closeness = clamp(
    1 - avalancheDistance / AVALANCHE_VISUAL_CONFIG.visibleRangeMeters,
    0,
    1,
  );
  const visibilityScale =
    1 -
    smoothstep(
      AVALANCHE_VISUAL_CONFIG.fullPresenceMeters,
      AVALANCHE_VISUAL_CONFIG.visibleRangeMeters,
      avalancheDistance,
    );

  // Camera track distance along downhill axis (worldZ = -trackDistance)
  const cameraTrackDistance = -cameraWorldZ;
  const cameraSafeMinTrackDist =
    cameraTrackDistance + AVALANCHE_VISUAL_CONFIG.minForwardOfCamera;
  const maxSafeTrackDist = playerDistance - AVALANCHE_VISUAL_CONFIG.minLagBehindPlayer;

  // Map closeness [0..1] smoothly from maxLagBehindPlayer down to minLagBehindPlayer
  const desiredLag =
    AVALANCHE_VISUAL_CONFIG.maxLagBehindPlayer -
    closeness *
      (AVALANCHE_VISUAL_CONFIG.maxLagBehindPlayer -
        AVALANCHE_VISUAL_CONFIG.minLagBehindPlayer);
  const desiredTrackDist = playerDistance - desiredLag;

  // Never allow the avalanche group behind or too close to the camera lens,
  // and never allow it to overtake Lofi's snowboard tail during active gameplay.
  const groupTrackDistance = Math.min(
    maxSafeTrackDist,
    Math.max(cameraSafeMinTrackDist, desiredTrackDist),
  );

  // If camera is somehow closer to Lofi than the safe corridor (e.g. non-gameplay cut),
  // hide rather than clipping into the lens.
  if (cameraSafeMinTrackDist > maxSafeTrackDist + 0.25) {
    return {
      shouldRender: false,
      groupTrackDistance: maxSafeTrackDist,
      closeness,
      visibilityScale: 0,
    };
  }

  return {
    shouldRender: visibilityScale > 0.01,
    groupTrackDistance,
    closeness,
    visibilityScale,
  };
}

/**
 * Hard 3D camera-clearance shield for any individual avalanche puff.
 * Returns 0 if the puff's outer surface comes within `cameraHardCutoffMeters` of the camera,
 * smoothly ramping to 1 by `cameraSoftClearMeters`.
 */
export function computePuffCameraClearance(
  puffWorldX: number,
  puffWorldY: number,
  puffWorldZ: number,
  puffMaxRadius: number,
  cameraX: number,
  cameraY: number,
  cameraZ: number,
): number {
  const dx = puffWorldX - cameraX;
  const dy = puffWorldY - cameraY;
  const dz = puffWorldZ - cameraZ;
  const centerDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const surfaceDist = centerDist - puffMaxRadius;
  return smoothstep(
    AVALANCHE_VISUAL_CONFIG.cameraHardCutoffMeters,
    AVALANCHE_VISUAL_CONFIG.cameraSoftClearMeters,
    surfaceDist,
  );
}

/**
 * Compute the final animated local transform and camera-safe scale for a single puff.
 */
export function computeAvalanchePuffTransform(params: {
  puff: AvalanchePuffLayout;
  pose: AvalancheVisualPose;
  groupWorldX: number;
  groupWorldY: number;
  groupWorldZ: number;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  time: number;
}): AvalanchePuffTransform {
  const {
    puff,
    pose,
    groupWorldX,
    groupWorldY,
    groupWorldZ,
    cameraX,
    cameraY,
    cameraZ,
    time,
  } = params;

  const billow = Math.sin(time * 5.2 + puff.phase);
  const roll = Math.cos(time * 3.8 + puff.phase * 1.35);

  const grow = (0.72 + pose.closeness * 0.28) * pose.visibilityScale;
  const rawRadius = puff.baseRadius * grow * (0.94 + billow * 0.06);

  const localX = puff.baseX + roll * (puff.isFlank ? 0.35 : 0.22);
  let localY = puff.baseY * grow + Math.max(0, billow) * (puff.isFlank ? 0.14 : 0.08);
  const localZ = puff.baseZ + billow * 0.18;

  let scaleX = rawRadius * 1.18;
  let scaleY = rawRadius * puff.heightSquash;
  let scaleZ = rawRadius * 0.96;

  // Enforce strict top-height ceiling above the snow surface so puffs never rise into sightline
  const maxTop = puff.isFlank
    ? AVALANCHE_VISUAL_CONFIG.maxFlankTopHeight
    : AVALANCHE_VISUAL_CONFIG.maxCenterTopHeight;
  if (localY + scaleY > maxTop) {
    const excess = localY + scaleY - maxTop;
    localY = Math.max(0.16, localY - excess * 0.65);
    scaleY = Math.max(0.12, maxTop - localY);
  }

  const maxRad = Math.max(scaleX, scaleY, scaleZ);
  const clearance = computePuffCameraClearance(
    groupWorldX + localX,
    groupWorldY + localY,
    groupWorldZ + localZ,
    maxRad,
    cameraX,
    cameraY,
    cameraZ,
  );

  scaleX *= clearance;
  scaleY *= clearance;
  scaleZ *= clearance;

  return {
    localX,
    localY,
    localZ,
    scaleX,
    scaleY,
    scaleZ,
    cameraClearance: clearance,
  };
}
