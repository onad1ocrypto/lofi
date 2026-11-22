import { evaluateRampSurface } from './simulation';
import { getGroundHeightAt, getTrackCenterX } from './trackData';
import type { TrackRamp } from './types';

export const SNOW_PARTICLE_PHYSICS = {
  /** Real gravitational acceleration (m/s^2). */
  gravity: 9.81,
  /** Normal impact speed below which a snow grain settles/slides instead of bouncing endlessly (m/s). */
  settleNormalSpeed: 0.68,
  /** First-impact normal speed threshold required to kick up secondary fine snow mist splash (m/s). */
  splashImpactThreshold: 2.05,
  /** Central-difference sample half-span for 3D snowpack & ramp surface normal calculation (meters). */
  normalSampleEps: 0.35,
} as const;

export const PARTICLE_KIND = {
  SPRAY: 0,
  CLUMP: 1,
  MIST: 2,
  SPARKLE: 3,
} as const;

export type ParticleKindCode = (typeof PARTICLE_KIND)[keyof typeof PARTICLE_KIND];

export interface Vec3Mutable {
  x: number;
  y: number;
  z: number;
}

export interface ParticleKinematics {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  gravityScale: number;
  drag: number;
  windFactor: number;
  restitution: number;
  friction: number;
  radius: number;
  kind: ParticleKindCode;
  bounceCount: number;
  settled: boolean;
}

export interface ParticleStepResult {
  collided: boolean;
  impactSpeed: number;
  shouldEmitSplash: boolean;
  groundY: number;
  nx: number;
  ny: number;
  nz: number;
}

const _windTmp: Vec3Mutable = { x: 0, y: 0, z: 0 };
const _normTmp: Vec3Mutable = { x: 0, y: 1, z: 0 };

/**
 * Sample the dynamic alpine wind vector (m/s) at a world position and time.
 * Combines:
 * - Prevailing mountain crosswind (gently stronger on higher alpine levels)
 * - Smooth spatiotemporal gust waves so snow plumes curl and billow organically
 * - Boundary-layer wind shear (calmer near snowpack, stronger higher in air)
 */
export function sampleAlpineWind(
  time: number,
  worldX: number,
  worldZ: number,
  heightAboveGround: number,
  levelNumber: number,
  out: Vec3Mutable,
  gustWindX = 0,
  gustWindZ = 0,
): Vec3Mutable {
  const levelBoost = 1 + Math.max(0, levelNumber - 1) * 0.24;
  // Boundary-layer shear: slower right against the snow surface, fuller strength above ~2m
  const shear = 0.42 + 0.58 * Math.min(1, Math.max(0, heightAboveGround) / 2.2);

  // Prevailing cross-slope breeze + rolling mountain gust waves
  const gustWave1 = Math.sin(time * 1.15 + worldZ * 0.045 + worldX * 0.06);
  const gustWave2 = Math.cos(time * 2.35 - worldZ * 0.09 + worldX * 0.11);
  const eddyWave = Math.sin(time * 1.7 + worldX * 0.16 - worldZ * 0.07);

  // Base prevailing alpine crosswind (+X) + active randomized crosswind gust surge
  const baseCrossX = (2.15 + gustWave1 * 1.35 + gustWave2 * 0.65) * levelBoost + gustWindX;
  const baseSlopeZ = (-0.55 + gustWave2 * 0.85 + eddyWave * 0.45) * levelBoost + gustWindZ;
  const gustSwirlY = Math.abs(gustWindX) * 0.04 * eddyWave;
  const baseUpdraftY =
    (0.12 + eddyWave * 0.32 + gustSwirlY) * Math.min(1, Math.max(0, heightAboveGround) / 1.4);

  out.x = baseCrossX * shear;
  out.y = baseUpdraftY;
  out.z = baseSlopeZ * shear;
  return out;
}

/**
 * Sample the exact snow collision height Y at (worldX, worldZ), accounting for:
 * - The active level's downhill snow slope, elevation rolls, concave snow dish, & flanking snowbanks
 * - Any inclined snow ramp deck directly underneath the particle
 */
export function sampleCollisionSurfaceHeight(
  worldX: number,
  worldZ: number,
  ramps: readonly TrackRamp[],
): number {
  const distanceZ = -worldZ;
  const terrainY = getGroundHeightAt(worldX, distanceZ);
  if (ramps.length === 0) {
    return terrainY;
  }

  const lateralOffset = worldX - getTrackCenterX(distanceZ);
  const rampEval = evaluateRampSurface(ramps, distanceZ, lateralOffset);
  if (rampEval.onRamp && rampEval.surfaceHeight > 0) {
    return terrainY + rampEval.surfaceHeight;
  }
  return terrainY;
}

/**
 * Compute the unit 3D outward surface normal (nx, ny, nz) of the snow terrain & ramps at (worldX, worldZ)
 * via central finite differences. Writes into `out` with zero allocations.
 */
export function sampleCollisionSurfaceNormal(
  worldX: number,
  worldZ: number,
  ramps: readonly TrackRamp[],
  out: Vec3Mutable,
): Vec3Mutable {
  const eps = SNOW_PARTICLE_PHYSICS.normalSampleEps;
  const hL = sampleCollisionSurfaceHeight(worldX - eps, worldZ, ramps);
  const hR = sampleCollisionSurfaceHeight(worldX + eps, worldZ, ramps);
  const hB = sampleCollisionSurfaceHeight(worldX, worldZ - eps, ramps);
  const hF = sampleCollisionSurfaceHeight(worldX, worldZ + eps, ramps);

  const dHdX = (hR - hL) / (2 * eps);
  const dHdZ = (hF - hB) / (2 * eps);

  // Surface z-height is y = h(x, z), so outward upward normal is proportional to (-dh/dx, 1, -dh/dz)
  const nx = -dHdX;
  const ny = 1.0;
  const nz = -dHdZ;
  const invLen = 1 / Math.hypot(nx, ny, nz);

  out.x = nx * invLen;
  out.y = ny * invLen;
  out.z = nz * invLen;
  return out;
}

/**
 * Advance a single snow spray particle by `dt` seconds with:
 * - Realistic gravity (`9.81 * gravityScale`)
 * - Dynamic 3D alpine wind field & aerodynamic drag (`v -> wind`)
 * - True 3D sloped terrain & snow ramp collision detection, normal reflection,
 *   snowpack restitution, tangential friction, ground settling, and secondary splash detection.
 */
export function stepSnowParticlePhysics(
  p: ParticleKinematics,
  dt: number,
  time: number,
  levelNumber: number,
  ramps: readonly TrackRamp[],
  out: ParticleStepResult,
  gustWindX = 0,
  gustWindZ = 0,
): ParticleStepResult {
  out.collided = false;
  out.impactSpeed = 0;
  out.shouldEmitSplash = false;

  const preGroundY = sampleCollisionSurfaceHeight(p.x, p.z, ramps);
  const preHeightAbove = Math.max(0, p.y - preGroundY);

  // 1. Sample alpine wind field (including active randomized gust push) and couple particle velocity through aerodynamic drag
  sampleAlpineWind(time, p.x, p.z, preHeightAbove, levelNumber, _windTmp, gustWindX, gustWindZ);
  const windCouple = 1 - Math.exp(-p.drag * dt);
  const targetVx = _windTmp.x * p.windFactor;
  const targetVy = _windTmp.y * p.windFactor;
  const targetVz = _windTmp.z * p.windFactor;

  p.vx += (targetVx - p.vx) * windCouple;
  p.vz += (targetVz - p.vz) * windCouple;
  // Subtle vertical air drag/updraft + real downward gravity
  p.vy += (targetVy - p.vy) * (windCouple * 0.25);
  p.vy -= SNOW_PARTICLE_PHYSICS.gravity * p.gravityScale * dt;

  // 2. Integrate position
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;

  // 3. Test collision against sloped snow terrain + ramps at the new (x, z)
  const surfaceY = sampleCollisionSurfaceHeight(p.x, p.z, ramps);
  const minAllowedY = surfaceY + p.radius;
  out.groundY = surfaceY;

  if (p.y <= minAllowedY) {
    // Clamp strictly onto the snow surface (zero ground tunneling)
    p.y = minAllowedY;

    // Sample exact 3D sloped surface normal at the impact location
    sampleCollisionSurfaceNormal(p.x, p.z, ramps, _normTmp);
    const nx = _normTmp.x;
    const ny = _normTmp.y;
    const nz = _normTmp.z;
    out.nx = nx;
    out.ny = ny;
    out.nz = nz;

    // Decompose velocity into normal and tangential components relative to the sloped snowpack
    const vn = p.vx * nx + p.vy * ny + p.vz * nz;
    if (vn < 0) {
      const impactSpeed = -vn;
      out.collided = true;
      out.impactSpeed = impactSpeed;

      const vtx = p.vx - vn * nx;
      const vty = p.vy - vn * ny;
      const vtz = p.vz - vn * nz;

      // Tangential snowpack friction slows sliding/skittering grains realistically
      const keepTan = Math.max(0, 1 - p.friction);

      if (impactSpeed >= SNOW_PARTICLE_PHYSICS.settleNormalSpeed && p.bounceCount < 3) {
        // Real elastic-inelastic bounce off the sloped snow normal
        const vnOut = impactSpeed * p.restitution;
        p.vx = vtx * keepTan + vnOut * nx;
        p.vy = vty * keepTan + vnOut * ny;
        p.vz = vtz * keepTan + vnOut * nz;
        p.bounceCount += 1;
        p.settled = false;

        // First high-energy impact of heavier grains/spray kicks up fine secondary powder mist
        if (
          p.bounceCount === 1 &&
          impactSpeed >= SNOW_PARTICLE_PHYSICS.splashImpactThreshold &&
          (p.kind === PARTICLE_KIND.CLUMP || p.kind === PARTICLE_KIND.SPRAY)
        ) {
          out.shouldEmitSplash = true;
        }
      } else {
        // Soft settle / snow-skimming slide along the slope without micro-jitter
        const slideKeep = Math.exp(-5.5 * dt);
        p.vx = vtx * keepTan * slideKeep;
        p.vy = vty * keepTan * slideKeep;
        p.vz = vtz * keepTan * slideKeep;
        p.settled = true;
      }
    } else if (p.settled) {
      // Gentle surface drag while skimming across snowpack
      const slideDrag = Math.exp(-4.2 * dt);
      p.vx *= slideDrag;
      p.vz *= slideDrag;
    }
  } else {
    p.settled = false;
    out.nx = 0;
    out.ny = 1;
    out.nz = 0;
  }

  return out;
}

/**
 * Compute non-uniform 3D scale (sx, sy, sz) for an instanced snow puff with zero allocations:
 * - Quick elastic bloom right after emission (age 0..0.16)
 * - Smooth organic shrink-to-zero toward end of life (eliminates transparent overdraw & popping)
 * - Slight horizontal spread + vertical flattening when settled on the snowpack
 * - Subtle flight stretch on fast airborne spray grains
 */
export function computeInstancedSnowScale(
  ageFrac: number,
  baseScale: number,
  kind: ParticleKindCode,
  bounceCount: number,
  settled: boolean,
  speedSq: number,
  out: Vec3Mutable,
): Vec3Mutable {
  const clampedAge = Math.max(0, Math.min(1, ageFrac));
  if (clampedAge >= 1 || baseScale <= 0) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }

  // Smooth bloom-in then cubic ease-out shrink to 0
  let env: number;
  if (clampedAge < 0.16) {
    const t = clampedAge / 0.16;
    env = 0.52 + t * (2 - t) * 0.62;
  } else {
    const rem = 1 - (clampedAge - 0.16) / 0.84;
    env = 1.14 * Math.pow(rem, 1.35);
  }

  const impactBloom = bounceCount > 0 ? 1.08 : 1.0;
  const s = baseScale * env * impactBloom;

  if (settled) {
    // Settled snow puffs flatten softly into the snowpack
    out.x = s * 1.18;
    out.y = s * 0.52;
    out.z = s * 1.18;
    return out;
  }

  if (kind === PARTICLE_KIND.MIST) {
    // Billowy wind-carried powder mist expands wider as it drifts downwind
    const billow = 1 + clampedAge * 0.42;
    out.x = s * billow;
    out.y = s * (billow * 0.86);
    out.z = s * billow;
    return out;
  }

  // Crisp airborne snow clumps & spray grains gain subtle dynamic elongation at high speed
  const stretch = 1 + Math.min(0.32, speedSq * 0.0045);
  const squash = 1 / Math.sqrt(stretch);
  out.x = s * squash;
  out.y = s * stretch;
  out.z = s * squash;
  return out;
}

