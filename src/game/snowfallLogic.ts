/**
 * Pure, deterministic calculations for LOFI ICE ESCAPE's atmospheric snowfall system.
 *
 * Snowfall starts as light, delicate alpine flurries at the top of the slope and
 * progressively increases in density, drift velocity, and visibility as:
 * 1) The player approaches the mountain shelter (`progress` 0 -> 1)
 * 2) The trailing avalanche closes in (`avalancheDanger` 0 -> 1)
 *
 * Zero DOM or Three.js dependencies so every density ramp, avalanche surge, volume
 * wrap, and camera-lens exclusion invariant can be unit-tested via node:test.
 */

import type { GamePhase } from './types';
import {
  computeWindGustParticlePush,
  type WindGustParticlePushOut,
} from './windGustLogic';

export interface SnowfallConfig {
  readonly minFlakes: number;
  readonly maxFlakes: number;
  /** Half-width of the player-centered snowfall volume along world X (meters). */
  readonly boxHalfWidth: number;
  /** Half-height of the snowfall volume along world Y (meters). */
  readonly boxHalfHeight: number;
  /** Half-depth of the snowfall volume along world Z (meters). */
  readonly boxHalfDepth: number;
  /** Forward bias ahead of the player along -Z so flakes fill the camera frustum. */
  readonly forwardBiasZ: number;
  /** Minimum clearance distance around camera lens so giant blurred flakes never pop in front. */
  readonly cameraClearanceRadius: number;
}

export const SNOWFALL_CONFIG: SnowfallConfig = {
  minFlakes: 150,
  maxFlakes: 780,
  boxHalfWidth: 30,
  boxHalfHeight: 13,
  boxHalfDepth: 36,
  forwardBiasZ: -16,
  cameraClearanceRadius: 2.8,
} as const;

export interface SnowfallInput {
  /** Player progress toward shelter in [0, 1]. */
  progress: number;
  /** Normalized avalanche proximity threat in [0, 1] (0 = safe, 1 = right behind). */
  avalancheDanger: number;
  /** Current simulation phase. */
  phase: GamePhase;
  /** Active level number (1..10) adds a subtle alpine-altitude gust flavor. */
  levelNumber: number;
  /** Optional signed randomized wind gust force in [-1, 1] (-1 pushes left, +1 pushes right). */
  windGustForce?: number;
  /** Optional active blizzard section intensity in [0, 1] that thickens snowfall alongside depth fog. */
  blizzardIntensity?: number;
}

export interface SnowfallTargets {
  /** Combined normalized snowfall intensity in [0, 1]. */
  intensity: number;
  /** Exact active particle count to render in [minFlakes, maxFlakes]. */
  activeCount: number;
  /** Base downward settling speed (m/s). */
  fallSpeed: number;
  /** Prevailing crosswind horizontal drift speed (m/s). */
  windDriftX: number;
  /** Downhill wind surge blowing past the rider along -Z (m/s, negative = forward down-slope). */
  windDriftZ: number;
  /** Organic flutter amplitude (m/s). */
  flutterAmp: number;
  /** Material opacity kept atmospheric & obstacle-safe (0.38..0.76). */
  opacity: number;
  /** World-space point size for crisp yet light snowflakes. */
  flakeSize: number;
}

export interface SnowflakeStepInput {
  x: number;
  y: number;
  z: number;
  speedScale: number;
  phase: number;
  dt: number;
  time: number;
  targets: SnowfallTargets;
  centerX: number;
  centerY: number;
  centerZ: number;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
}

export interface SnowflakePosOut {
  x: number;
  y: number;
  z: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Compute target snowfall density, wind surge, opacity, and flake sizing from
 * shelter approach progress, avalanche threat, and current phase.
 */
export function computeSnowfallTargets(input: SnowfallInput): SnowfallTargets {
  const progress = clamp01(input.progress);
  const danger = clamp01(input.avalancheDanger);
  const altitudeBias = clamp01((Math.max(1, input.levelNumber) - 1) / 9) * 0.08;

  let intensity: number;
  let surgeBoost = 0;

  switch (input.phase) {
    case 'playing':
    case 'paused': {
      // Smoothly escalating flurry as Lofi nears the shelter + urgent snow-squall boost when avalanche closes in
      const shelterRamp = Math.pow(progress, 1.32) * 0.56;
      surgeBoost = Math.pow(danger, 1.15) * 0.36;
      intensity = clamp01(0.08 + altitudeBias + shelterRamp + surgeBoost);
      break;
    }
    case 'victory': {
      // Cozy, celebratory alpine snowfall drifting peacefully around the warm shelter
      intensity = 0.36;
      break;
    }
    case 'gameover': {
      // Post-avalanche swirling snow squall settling over the slope
      intensity = 0.58;
      surgeBoost = 0.16;
      break;
    }
    case 'title':
    default: {
      // Gentle welcoming light mountain flurries
      intensity = 0.12;
      break;
    }
  }

  const gustPush: WindGustParticlePushOut = {
    snowfallPushX: 0,
    snowfallPushZ: 0,
    sprayPushX: 0,
    sprayPushZ: 0,
    flutterBoost: 0,
  };
  const activeGustForce = input.phase === 'playing' ? (input.windGustForce ?? 0) : 0;
  if (Math.abs(activeGustForce) > 0.002) {
    computeWindGustParticlePush(activeGustForce, gustPush);
  }
  const gustMag = Math.min(1, Math.abs(activeGustForce));
  const blizzardBoost =
    input.phase === 'playing' || input.phase === 'paused'
      ? clamp01(input.blizzardIntensity ?? 0)
      : 0;

  const combinedIntensity = clamp01(intensity + blizzardBoost * 0.34);

  const activeCount = Math.min(
    SNOWFALL_CONFIG.maxFlakes,
    Math.round(
      SNOWFALL_CONFIG.minFlakes +
        clamp01(combinedIntensity + gustMag * 0.14) *
          (SNOWFALL_CONFIG.maxFlakes - SNOWFALL_CONFIG.minFlakes),
    ),
  );

  // Calm gentle flurries at start -> brisk wind-swept snow near shelter, avalanche, blizzard sections, or active wind gusts
  const fallSpeed = 2.3 + combinedIntensity * 2.4 + surgeBoost * 1.1 + blizzardBoost * 0.65;
  const windDriftX =
    0.85 + combinedIntensity * 2.5 + surgeBoost * 2.2 + blizzardBoost * 3.4 + gustPush.snowfallPushX;
  const windDriftZ =
    -(0.5 + combinedIntensity * 2.4 + surgeBoost * 3.4 + blizzardBoost * 1.8) + gustPush.snowfallPushZ;
  const flutterAmp = 0.65 + combinedIntensity * 0.85 + blizzardBoost * 0.65 + gustPush.flutterBoost;
  const opacity = Math.min(0.8, 0.44 + combinedIntensity * 0.32 + gustMag * 0.06);
  const flakeSize = 0.23 + combinedIntensity * 0.09;

  return {
    intensity: combinedIntensity,
    activeCount,
    fallSpeed,
    windDriftX,
    windDriftZ,
    flutterAmp,
    opacity,
    flakeSize,
  };
}

/**
 * Wrap a world coordinate seamlessly into [center - halfExtent, center + halfExtent].
 * Works cleanly even when the volume jumps across arbitrary distances on level resets.
 */
export function wrapSnowflakeCoord(
  value: number,
  center: number,
  halfExtent: number,
): number {
  const span = halfExtent * 2;
  if (span <= 0) return center;
  const rel = value - (center - halfExtent);
  const wrapped = ((rel % span) + span) % span;
  return center - halfExtent + wrapped;
}

/**
 * Advance a single ambient snowflake with gentle gravity, alpine crosswind/avalanche
 * tailwind, sinusoidal flutter, seamless volume wrapping, and camera-lens clearance.
 */
export function stepSnowflakePosition(
  input: SnowflakeStepInput,
  out: SnowflakePosOut,
): void {
  const { dt, time, targets, speedScale, phase } = input;

  // Individual sinusoidal flutter so flakes drift organically rather than in rigid straight lines
  const swayX = Math.sin(time * 1.45 + phase) * targets.flutterAmp;
  const swayZ = Math.cos(time * 1.18 + phase * 1.37) * targets.flutterAmp * 0.7;

  const nextX = input.x + (targets.windDriftX * speedScale + swayX) * dt;
  const nextY = input.y - targets.fallSpeed * speedScale * dt;
  const nextZ = input.z + (targets.windDriftZ * speedScale + swayZ) * dt;

  let wx = wrapSnowflakeCoord(nextX, input.centerX, SNOWFALL_CONFIG.boxHalfWidth);
  let wy = wrapSnowflakeCoord(nextY, input.centerY, SNOWFALL_CONFIG.boxHalfHeight);
  let wz = wrapSnowflakeCoord(nextZ, input.centerZ, SNOWFALL_CONFIG.boxHalfDepth);

  // Camera-lens exclusion zone: gently nudge any flake that drifts too close to the lens
  const dx = wx - input.cameraX;
  const dy = wy - input.cameraY;
  const dz = wz - input.cameraZ;
  const distSq = dx * dx + dy * dy + dz * dz;
  const minR = SNOWFALL_CONFIG.cameraClearanceRadius;
  if (distSq < minR * minR) {
    // Push cleanly outward along X/Z ahead of camera so it never flashes across the lens
    const pushSide = (phase % 2) > 1 ? 1 : -1;
    wx = input.cameraX + pushSide * (minR + 1.4);
    wz = input.cameraZ - (minR + 1.8);
    wy = wrapSnowflakeCoord(wy, input.centerY, SNOWFALL_CONFIG.boxHalfHeight);
  }

  out.x = wx;
  out.y = wy;
  out.z = wz;
}
