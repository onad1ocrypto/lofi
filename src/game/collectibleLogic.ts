import { getGroundHeightAt, getTrackCenterX, getTrackHalfWidth } from './trackData';
import type {
  LevelConfig,
  LilYetiCollectible,
  TrackObstacle,
  TrackRamp,
} from './types';

export const COLLECTIBLE_CONFIG = {
  /** Score awarded per Lil Yeti collectible picked up during a run. */
  pointsPerLilYeti: 100,
  /** Horizontal pickup radius around Lofi's snowboard (meters). */
  pickupRadiusXZ: 2.35,
  /** Vertical pickup tolerance so both grounded & airborne passes feel crisp (meters). */
  pickupRadiusY: 2.55,
  /** Guaranteed opening straightaway collectible distance (meters) — visible right at launch. */
  firstCollectibleZ: 44,
  /** Minimum clearance from circular rocks & pines (meters beyond obstacle radius). */
  minObstacleClearance: 3.1,
  /** Minimum Z spacing from fallen logs unless placed at jump height above the log. */
  fallenLogClearanceZ: 4.8,
  /** Default floating height above snow surface (meters). */
  defaultHoverHeight: 1.05,
  /** Bonus floating height along ramp jump arcs (meters). */
  rampArcHoverHeight: 2.15,
  /** Vertical bobbing amplitude (meters). */
  bobAmplitude: 0.2,
  /** Vertical bobbing angular speed (rad/s). */
  bobSpeed: 3.1,
  /** Turntable spin speed (rad/s). */
  spinSpeed: 2.0,
  /** Collection pop-out animation duration (seconds). */
  collectAnimDuration: 0.28,
  /** HUD highlight pulse duration on pickup (seconds). */
  scoreFeedbackDuration: 0.65,
  /** Maximum pooled collectibles per level. */
  maxCollectibles: 24,
} as const;

export interface CollectiblePickupResult {
  collectedCount: number;
  collectedPoints: number;
  lastCollectedPos: { x: number; y: number; z: number } | null;
}

/** Lightweight deterministic Mulberry32 PRNG for reproducible collectible trails. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Find a ramp whose post-lip jump arc spans `z`, if any. */
function findRampArcAt(ramps: readonly TrackRamp[], z: number): TrackRamp | null {
  for (let i = 0; i < ramps.length; i++) {
    const r = ramps[i];
    const lipZ = r.zStart + r.length;
    if (z >= lipZ + 3.5 && z <= lipZ + 14.5) {
      return r;
    }
  }
  return null;
}

/** Check whether `(z, offsetX, hoverHeight)` is cleanly separated from every track obstacle. */
function isClearOfObstacles(
  z: number,
  offsetX: number,
  hoverHeight: number,
  obstacles: readonly TrackObstacle[],
): boolean {
  const worldX = getTrackCenterX(z) + offsetX;
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const dz = Math.abs(obs.z - z);
    if (dz > 7.5) continue;

    if (obs.kind === 'fallen_log') {
      if (dz < COLLECTIBLE_CONFIG.fallenLogClearanceZ && hoverHeight < obs.clearanceHeight + 0.75) {
        return false;
      }
      continue;
    }

    const dx = obs.worldX - worldX;
    const minDist = obs.radius + COLLECTIBLE_CONFIG.minObstacleClearance;
    if (dx * dx + dz * dz < minDist * minDist) {
      return false;
    }
  }
  return true;
}

/**
 * Deterministically spawn glowing 'Lil Yeti' collectibles along a level's snow path.
 * - Always places Collectible #1 cleanly on the opening straightaway (`z = 44m, offsetX = 0`)
 *   so the player spots it immediately and can ride through it naturally.
 * - Spaces remaining collectibles smoothly along carvable curves & occasional ramp arcs,
 *   strictly inside playable snow bounds and clear of every obstacle.
 */
export function spawnLevelCollectibles(
  level: LevelConfig,
  obstacles: readonly TrackObstacle[],
  spawnSeed: number,
): LilYetiCollectible[] {
  const rng = mulberry32((spawnSeed ^ Math.imul(level.levelNumber, 0x9e3779b1)) >>> 0);
  const collectibles: LilYetiCollectible[] = [];

  const pushCollectible = (z: number, offsetX: number, hoverHeight: number): void => {
    const worldX = getTrackCenterX(z) + offsetX;
    const worldY = getGroundHeightAt(worldX, z);
    collectibles.push({
      id: collectibles.length + 1,
      z,
      offsetX,
      worldX,
      worldY,
      hoverHeight,
      points: COLLECTIBLE_CONFIG.pointsPerLilYeti,
      collected: false,
      collectAnimProgress: 0,
    });
  };

  // 1. Guaranteed opening collectible dead-center ahead of Lofi
  const firstZ = Math.min(COLLECTIBLE_CONFIG.firstCollectibleZ, Math.max(28, level.length * 0.08));
  if (isClearOfObstacles(firstZ, 0, COLLECTIBLE_CONFIG.defaultHoverHeight, obstacles)) {
    pushCollectible(firstZ, 0, COLLECTIBLE_CONFIG.defaultHoverHeight);
  }

  // 2. Rhythmic collectibles weaving down the mountain toward the shelter
  const maxZ = level.length - 68;
  const targetCount = Math.min(
    COLLECTIBLE_CONFIG.maxCollectibles,
    Math.max(10, Math.round(level.length / 72)),
  );
  const usableSpan = Math.max(120, maxZ - 104);
  const baseStep = usableSpan / Math.max(1, targetCount - 1);

  let laneSign: -1 | 1 = rng() < 0.5 ? -1 : 1;
  let zCursor = 104;

  while (zCursor <= maxZ && collectibles.length < COLLECTIBLE_CONFIG.maxCollectibles) {
    const jitterZ = (rng() - 0.5) * Math.min(12, baseStep * 0.24);
    const z = Math.max(96, Math.min(maxZ, Math.round((zCursor + jitterZ) * 10) / 10));
    const halfW = getTrackHalfWidth(z);
    const maxSafeOffset = Math.max(1.8, halfW - 2.65);

    const arcRamp = findRampArcAt(level.ramps, z);
    if (arcRamp) {
      const rampLat = Math.max(-maxSafeOffset, Math.min(maxSafeOffset, arcRamp.offsetX));
      if (isClearOfObstacles(z, rampLat, COLLECTIBLE_CONFIG.rampArcHoverHeight, obstacles)) {
        pushCollectible(z, rampLat, COLLECTIBLE_CONFIG.rampArcHoverHeight);
        zCursor += baseStep;
        continue;
      }
    }

    // Build preferred carving line with rhythmic side-to-side alternation
    const preferredFrac = 0.22 + rng() * 0.42;
    const preferredOffset = Math.max(
      -maxSafeOffset,
      Math.min(maxSafeOffset, laneSign * maxSafeOffset * preferredFrac),
    );
    const candidates = [
      preferredOffset,
      0,
      -preferredOffset,
      laneSign * Math.min(maxSafeOffset, 3.2),
      -laneSign * Math.min(maxSafeOffset, 3.2),
      laneSign * Math.min(maxSafeOffset, 5.0),
      -laneSign * Math.min(maxSafeOffset, 5.0),
    ];

    for (let c = 0; c < candidates.length; c++) {
      const candOffset = Math.max(-maxSafeOffset, Math.min(maxSafeOffset, candidates[c]));
      if (isClearOfObstacles(z, candOffset, COLLECTIBLE_CONFIG.defaultHoverHeight, obstacles)) {
        pushCollectible(z, candOffset, COLLECTIBLE_CONFIG.defaultHoverHeight);
        break;
      }
    }

    laneSign = laneSign === 1 ? -1 : 1;
    zCursor += baseStep;
  }

  collectibles.sort((a, b) => a.z - b.z);
  for (let i = 0; i < collectibles.length; i++) {
    collectibles[i].id = i + 1;
  }
  return collectibles;
}

/** Reset collected flags & animations cleanly for an in-place level retry. */
export function resetCollectiblesInPlace(collectibles: LilYetiCollectible[]): void {
  for (let i = 0; i < collectibles.length; i++) {
    collectibles[i].collected = false;
    collectibles[i].collectAnimProgress = 0;
  }
}

/**
 * Pure pickup detection along Lofi's snowboard path.
 * Never alters player speed, steering, or follower convoy counts.
 */
export function checkCollectiblePickups(
  collectibles: LilYetiCollectible[],
  playerWorldX: number,
  playerGroundY: number,
  playerHeightAboveGround: number,
  playerDistance: number,
): CollectiblePickupResult {
  const radiusXZSq = COLLECTIBLE_CONFIG.pickupRadiusXZ * COLLECTIBLE_CONFIG.pickupRadiusXZ;
  const playerCenterY = playerGroundY + playerHeightAboveGround + 0.9;

  let collectedCount = 0;
  let collectedPoints = 0;
  let lastCollectedPos: { x: number; y: number; z: number } | null = null;

  for (let i = 0; i < collectibles.length; i++) {
    const item = collectibles[i];
    if (item.collected) continue;

    const dz = item.z - playerDistance;
    if (dz < -COLLECTIBLE_CONFIG.pickupRadiusXZ - 1.2) continue;
    if (dz > COLLECTIBLE_CONFIG.pickupRadiusXZ + 1.2) break;

    const dx = item.worldX - playerWorldX;
    if (dx * dx + dz * dz > radiusXZSq) continue;

    const itemY = item.worldY + item.hoverHeight;
    if (Math.abs(itemY - playerCenterY) > COLLECTIBLE_CONFIG.pickupRadiusY) continue;

    item.collected = true;
    item.collectAnimProgress = 0;
    collectedCount += 1;
    collectedPoints += item.points;
    lastCollectedPos = { x: item.worldX, y: itemY, z: -item.z };
  }

  return {
    collectedCount,
    collectedPoints,
    lastCollectedPos,
  };
}

/** Advance collection pop-out progress in [0, 1] for collected items. */
export function stepCollectibleAnimations(
  collectibles: LilYetiCollectible[],
  dt: number,
): void {
  if (dt <= 0) return;
  const invDur = 1 / COLLECTIBLE_CONFIG.collectAnimDuration;
  for (let i = 0; i < collectibles.length; i++) {
    const item = collectibles[i];
    if (item.collected && item.collectAnimProgress < 1) {
      item.collectAnimProgress = Math.min(1, item.collectAnimProgress + dt * invDur);
    }
  }
}
