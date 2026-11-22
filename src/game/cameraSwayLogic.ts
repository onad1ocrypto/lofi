import type { GamePhase } from './types';

/**
 * Comfort-tuned horizontal camera sway parameters for carving turns.
 * Keeps horizon strictly level (zero roll) and uses low-pass exponential damping
 * with hard amplitude limits so turns feel fast and expressive without motion sickness.
 */
export const CAMERA_SWAY_CONFIG = {
  /** Deadzone on |lean| to prevent micro-sway during straight glides. */
  leanDeadzone: 0.05,
  /** Maximum horizontal camera offset in meters (landscape). Negative shifts to outer edge of right turn. */
  maxCameraOffsetLandscape: 0.82,
  /** Maximum horizontal camera offset in meters (portrait, tighter for narrow screens). */
  maxCameraOffsetPortrait: 0.48,
  /** Maximum look-ahead horizontal lead into the turn in meters (landscape). */
  maxLookLeadLandscape: 1.95,
  /** Maximum look-ahead horizontal lead into the turn in meters (portrait). */
  maxLookLeadPortrait: 1.18,
  /** Exponential damping rate for camera horizontal sway (1/s) — soft & comfortable. */
  cameraSwayLambda: 4.2,
  /** Exponential damping rate for look-ahead turn lead (1/s) — slightly more eager into the apex. */
  lookLeadLambda: 4.8,
  /** Return-to-center decay rate when leaving active gameplay phases (1/s). */
  resetDecayLambda: 5.5,
  /** Minimum sway multiplier while fully airborne so jump arcs stay steady and readable. */
  airborneMinFactor: 0.5,
  /** Jump height (meters) at which airborne sway attenuation reaches its minimum factor. */
  airborneAttenuationHeight: 1.8,
} as const;

export interface CameraSwayState {
  /** Smoothed horizontal offset applied to camera position X (meters). */
  cameraOffsetX: number;
  /** Smoothed horizontal lead applied to camera look-ahead target X (meters). */
  lookOffsetX: number;
}

export interface CameraSwayTarget {
  cameraOffsetX: number;
  lookOffsetX: number;
}

export interface CameraSwayStepParams {
  dt: number;
  phase: GamePhase;
  /** Character normalized lean angle in [-1, 1] (+ right turn, - left turn). */
  lean: number;
  /** Forward speed normalized by level base speed (0 when stopped, ~1 at cruise). */
  speedRatio: number;
  /** Current height above snow surface in meters (attenuates sway mid-jump). */
  jumpHeight: number;
  isPortrait: boolean;
  immediate?: boolean;
}

export function createCameraSwayState(): CameraSwayState {
  return {
    cameraOffsetX: 0,
    lookOffsetX: 0,
  };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Compute target horizontal camera sway & look-ahead lead from the character's lean angle.
 * - Camera position gently drifts toward the outside of the carve (-lean) like a trailing skier.
 * - Look target leads subtly into the inside of the turn (+lean) so oncoming obstacles read earlier.
 * - Zero camera roll/tilt: strictly horizontal offsets in world X.
 */
export function computeCameraSwayTarget(
  params: Pick<
    CameraSwayStepParams,
    'phase' | 'lean' | 'speedRatio' | 'jumpHeight' | 'isPortrait'
  >,
  out: CameraSwayTarget = { cameraOffsetX: 0, lookOffsetX: 0 },
): CameraSwayTarget {
  if (params.phase !== 'playing') {
    out.cameraOffsetX = 0;
    out.lookOffsetX = 0;
    return out;
  }

  const clampedLean = clamp(params.lean, -1, 1);
  const absLean = Math.abs(clampedLean);
  if (absLean <= CAMERA_SWAY_CONFIG.leanDeadzone || params.speedRatio <= 0.05) {
    out.cameraOffsetX = 0;
    out.lookOffsetX = 0;
    return out;
  }

  // Smooth deadzone + gentle ease curve (filters small steering micro-corrections)
  const u = (absLean - CAMERA_SWAY_CONFIG.leanDeadzone) / (1 - CAMERA_SWAY_CONFIG.leanDeadzone);
  const smoothstepU = u * u * (3 - 2 * u);
  const shapedLean = (0.4 * u + 0.6 * smoothstepU) * (clampedLean > 0 ? 1 : -1);

  // Speed modulation: feels livelier at full alpine speed, gentler when slowed after an obstacle hit
  const speedScale = clamp(0.45 + 0.55 * clamp(params.speedRatio, 0, 1.15), 0.45, 1.08);

  // Airborne attenuation: keep jump arcs steady and comfortable
  const airT = clamp(
    Math.max(0, params.jumpHeight) / CAMERA_SWAY_CONFIG.airborneAttenuationHeight,
    0,
    1,
  );
  const airScale = 1 - airT * (1 - CAMERA_SWAY_CONFIG.airborneMinFactor);

  const maxCam = params.isPortrait
    ? CAMERA_SWAY_CONFIG.maxCameraOffsetPortrait
    : CAMERA_SWAY_CONFIG.maxCameraOffsetLandscape;
  const maxLook = params.isPortrait
    ? CAMERA_SWAY_CONFIG.maxLookLeadPortrait
    : CAMERA_SWAY_CONFIG.maxLookLeadLandscape;

  const gain = shapedLean * speedScale * airScale;

  // Hard clamp to strict comfort bounds
  out.cameraOffsetX = clamp(-gain * maxCam, -maxCam, maxCam);
  out.lookOffsetX = clamp(gain * maxLook, -maxLook, maxLook);
  return out;
}

const _targetScratch: CameraSwayTarget = { cameraOffsetX: 0, lookOffsetX: 0 };

/**
 * Advance smoothed horizontal camera sway state with frame-rate-independent exponential damping.
 * Zero heap allocations per frame.
 */
export function stepCameraSway(
  state: CameraSwayState,
  params: CameraSwayStepParams,
): CameraSwayState {
  // Freeze sway smoothly while paused so resuming feels seamless
  if (params.phase === 'paused' && !params.immediate) {
    return state;
  }

  const target = computeCameraSwayTarget(params, _targetScratch);

  if (params.immediate) {
    state.cameraOffsetX = target.cameraOffsetX;
    state.lookOffsetX = target.lookOffsetX;
    return state;
  }

  const dt = Math.max(0, Math.min(params.dt, 0.1));
  if (dt <= 0) {
    return state;
  }

  const isPlaying = params.phase === 'playing';
  const camLambda = isPlaying
    ? CAMERA_SWAY_CONFIG.cameraSwayLambda
    : CAMERA_SWAY_CONFIG.resetDecayLambda;
  const lookLambda = isPlaying
    ? CAMERA_SWAY_CONFIG.lookLeadLambda
    : CAMERA_SWAY_CONFIG.resetDecayLambda;

  const camAlpha = 1 - Math.exp(-camLambda * dt);
  const lookAlpha = 1 - Math.exp(-lookLambda * dt);

  state.cameraOffsetX += (target.cameraOffsetX - state.cameraOffsetX) * camAlpha;
  state.lookOffsetX += (target.lookOffsetX - state.lookOffsetX) * lookAlpha;

  // Clean snap to exact zero when negligible
  if (Math.abs(target.cameraOffsetX) === 0 && Math.abs(state.cameraOffsetX) < 0.001) {
    state.cameraOffsetX = 0;
  }
  if (Math.abs(target.lookOffsetX) === 0 && Math.abs(state.lookOffsetX) < 0.001) {
    state.lookOffsetX = 0;
  }

  return state;
}
