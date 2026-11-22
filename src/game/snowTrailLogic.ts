import type { JumpState } from './types';

export interface TrailNode {
  x: number;
  y: number;
  z: number;
  /** Unit right-hand perpendicular vector on XZ plane for ribbon extrusion. */
  rightX: number;
  rightZ: number;
  /** Half-width of the carved snow groove in meters. */
  halfWidth: number;
  /** Elapsed age in seconds (0 = freshly carved). */
  age: number;
  /** Persistence lifetime in seconds before fully faded. */
  maxAge: number;
  /** Visual intensity in [0, 1] (stronger & deeper during turns). */
  intensity: number;
  /** True when this node starts a new detached stroke (e.g. first node or right after landing). */
  segmentStart: boolean;
}

export interface SnowTrailBuffer {
  readonly maxNodes: number;
  readonly minStepMeters: number;
  readonly nodes: TrailNode[];
  /** True when the next grounded sample must begin a fresh disconnected segment (e.g. after a jump). */
  pendingBreak: boolean;
}

export const TRAIL_CONFIG = {
  maxNodes: 150,
  minStepMeters: 0.45,
  straightLifetime: 2.6,
  carveLifetime: 3.6,
  baseHalfWidth: 0.23,
  maxCarveExtraHalfWidth: 0.14,
  straightIntensity: 0.44,
  maxCarveIntensity: 0.96,
} as const;

/** Compute trail visual width, intensity, and persistence from carving lean in [-1, 1]. */
export function computeTrailStyle(lean: number): {
  halfWidth: number;
  intensity: number;
  maxAge: number;
  carveFactor: number;
} {
  const absLean = Math.min(1, Math.abs(lean));
  const carveFactor = absLean < 0.12 ? 0 : Math.min(1, (absLean - 0.12) / 0.88);
  return {
    halfWidth:
      TRAIL_CONFIG.baseHalfWidth + carveFactor * TRAIL_CONFIG.maxCarveExtraHalfWidth,
    intensity:
      TRAIL_CONFIG.straightIntensity +
      carveFactor * (TRAIL_CONFIG.maxCarveIntensity - TRAIL_CONFIG.straightIntensity),
    maxAge:
      TRAIL_CONFIG.straightLifetime +
      carveFactor * (TRAIL_CONFIG.carveLifetime - TRAIL_CONFIG.straightLifetime),
    carveFactor,
  };
}

export function createSnowTrailBuffer(
  maxNodes: number = TRAIL_CONFIG.maxNodes,
  minStepMeters: number = TRAIL_CONFIG.minStepMeters,
): SnowTrailBuffer {
  return {
    maxNodes,
    minStepMeters,
    nodes: [],
    pendingBreak: true,
  };
}

/**
 * Record the snowboard's ground position into the trail buffer.
 * - While `AIRBORNE` (or moving too slowly), marks a clean segment break so no floating line draws in mid-air.
 * - While grounded/landing, appends spaced nodes with tangent-aligned perpendicular normals.
 */
export function pushTrailSample(
  buf: SnowTrailBuffer,
  x: number,
  y: number,
  z: number,
  lean: number,
  forwardSpeed: number,
  boardYaw: number,
  jumpState: JumpState,
): boolean {
  if (jumpState === 'AIRBORNE' || forwardSpeed <= 2.5) {
    buf.pendingBreak = true;
    return false;
  }

  const prev = buf.nodes.length > 0 ? buf.nodes[buf.nodes.length - 1] : null;

  if (!buf.pendingBreak && prev) {
    const dx = x - prev.x;
    const dz = z - prev.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < buf.minStepMeters * buf.minStepMeters) {
      return false;
    }
  }

  // Compute perpendicular right vector from actual motion direction (falling back to boardYaw on segment start)
  let rightX = Math.cos(boardYaw);
  let rightZ = -Math.sin(boardYaw);

  if (!buf.pendingBreak && prev) {
    const dx = x - prev.x;
    const dz = z - prev.z;
    const len = Math.hypot(dx, dz);
    if (len > 1e-4) {
      // Forward vector F = (dx/len, dz/len) moving toward -Z; Right = F x Up(0,1,0) = (-dz/len, dx/len)
      rightX = -dz / len;
      rightZ = dx / len;
    }
  }

  const style = computeTrailStyle(lean);
  const node: TrailNode = {
    x,
    y,
    z,
    rightX,
    rightZ,
    halfWidth: style.halfWidth,
    age: 0,
    maxAge: style.maxAge,
    intensity: style.intensity,
    segmentStart: buf.pendingBreak || buf.nodes.length === 0,
  };

  buf.nodes.push(node);
  buf.pendingBreak = false;

  // Keep ring bounded to maxNodes
  if (buf.nodes.length > buf.maxNodes) {
    const overflow = buf.nodes.length - buf.maxNodes;
    buf.nodes.splice(0, overflow);
    if (buf.nodes.length > 0) {
      buf.nodes[0].segmentStart = true;
    }
  }

  return true;
}

/** Advance ages of all persistent trail nodes and prune fully faded tail nodes. */
export function stepTrailBuffer(buf: SnowTrailBuffer, dt: number): void {
  if (dt <= 0 || buf.nodes.length === 0) return;

  for (let i = 0; i < buf.nodes.length; i++) {
    buf.nodes[i].age += dt;
  }

  let expiredPrefix = 0;
  while (
    expiredPrefix < buf.nodes.length &&
    buf.nodes[expiredPrefix].age >= buf.nodes[expiredPrefix].maxAge
  ) {
    expiredPrefix++;
  }

  if (expiredPrefix > 0) {
    buf.nodes.splice(0, expiredPrefix);
    if (buf.nodes.length > 0) {
      buf.nodes[0].segmentStart = true;
    }
  }
}

/** Compute smooth fading opacity in [0, 1] for a node based on age & intensity. */
export function computeTrailNodeAlpha(node: TrailNode): number {
  if (node.age >= node.maxAge) return 0;
  const lifeRemain = Math.max(0, 1 - node.age / node.maxAge);
  // Smooth ease-out curve so recent carved tracks read crisply and dissolve softly into the snow
  const fade = lifeRemain * lifeRemain * (3 - 2 * lifeRemain);
  return Math.max(0, Math.min(1, fade * node.intensity));
}

export function resetTrailBuffer(buf: SnowTrailBuffer): void {
  buf.nodes.length = 0;
  buf.pendingBreak = true;
}
