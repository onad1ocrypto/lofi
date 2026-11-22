import {
  CARVING_PASS_CONFIG,
  computeCarvingCameraOutsideTarget,
} from './carvingPassLogic';
import type {
  CarvingPassConfig,
  FlatMomentumZone,
  SteepCameraPhase,
  SteepDescentZone,
} from './types';

export const STEEP_DESCENT_CONFIG = {
  /** Peak downhill gravity acceleration on the steep slope (m/s^2). */
  gravityAccelMax: 16.0,
  /** Maximum extra downhill speed above base cruise when riding unbraked down a steep drop (m/s). */
  maxOverspeedBonus: 12.5,
  /** Smooth braking deceleration rate while holding S / Down / BRAKE on snow (m/s^2). */
  brakeDecelRate: 18.5,
  /** Minimum rolling speed while holding Brake (never freezes/stops board, lets avalanche close in if held too long). */
  minBrakeSpeed: 13.5,
  /** Exponential smoothing rates for visual brakeAmount in [0, 1]. */
  brakeEngageRate: 7.5,
  brakeReleaseRate: 6.8,
  /** Smooth sideways speed-check snowboard angle while braking (~25 deg, never snapping 90 deg). */
  maxBrakeBoardYawRad: 0.44,
  /** Maximum steering acceleration reduction at peak unbraked overspeed (42% harder to turn). */
  highSpeedSteerAccelPenalty: 0.42,
  /** Maximum lateral damping reduction at peak unbraked overspeed (wider, trickier carving drift). */
  highSpeedDampingPenalty: 0.44,
  /** Steering authority retained while braking (remains responsive & active). */
  brakeSteerAccelFactor: 0.88,
  /** Slightly crisper lateral bite while braking on snow. */
  brakeDampingBoost: 1.15,
  /** Exponential time constant for steep-descent camera transitions (~0.95-1.1s for 95% blend). */
  cameraTransitionTau: 0.34,
  /** Distance past zStart where the approach warning fades out smoothly (meters). */
  warningHoldIntoDropMeters: 16,
  /** Extra follower spacing added smoothly when braking so Lil Yetis never stack or collide. */
  brakeExtraFollowerSpacing: 0.48,
} as const;

export interface SteepDescentSample {
  phase: SteepCameraPhase;
  zone: SteepDescentZone | null;
  /** True right before entering the steep slope (and briefly on crest entry). */
  warningActive: boolean;
  /** Smooth 0..1 steepness factor inside the drop (0 outside, 1 at steepest midpoint). */
  slopeFactor: number;
  /** Extra slope gradient (dy/dz magnitude) added to base SLOPE_GRADIENT at this z. */
  extraGradient: number;
}

export interface SteepCameraTargetOffsets {
  extraBack: number;
  extraHeight: number;
  extraLookAhead: number;
  lookDownBias: number;
}

export interface SteepCameraRigState {
  phase: SteepCameraPhase;
  extraBack: number;
  extraHeight: number;
  extraLookAhead: number;
  lookDownBias: number;
  /** Smooth lateral shift toward the outside of the active S-curve on Level 4 Carving Pass (0 on Level 3). */
  curveOutsideX: number;
  /** Subtle look-target lateral lead paired with curveOutsideX (0 on Level 3). */
  curveLookOffsetX: number;
}

function smoothstep01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * C^2-smooth extra gradient profile `extraGradient * sin^2(pi * u)` over [zStart, zEnd].
 * Zero at both endpoints so crest entry and bottom landing transition smoothly with zero kinks.
 */
export function computeSteepZonesExtraGradient(
  zones: readonly SteepDescentZone[] | undefined,
  z: number,
): number {
  if (!zones || zones.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    if (z <= zone.zStart || z >= zone.zEnd) continue;
    const span = zone.zEnd - zone.zStart;
    if (span <= 0) continue;
    const u = (z - zone.zStart) / span;
    const s = Math.sin(Math.PI * u);
    total += zone.extraGradient * s * s;
  }
  return total;
}

/**
 * Exact analytical elevation drop integral of `computeSteepZonesExtraGradient` from -inf to z.
 * Always returns <= 0 (downward drop). Remains permanently shifted downward after zEnd
 * so the track and shelter continue seamlessly at the lower elevation.
 */
export function computeSteepZonesElevationOffset(
  zones: readonly SteepDescentZone[] | undefined,
  z: number,
): number {
  if (!zones || zones.length === 0) return 0;
  let offset = 0;
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    if (z <= zone.zStart) continue;
    const span = zone.zEnd - zone.zStart;
    if (span <= 0) continue;
    const totalDrop = span * zone.extraGradient * 0.5;
    if (z >= zone.zEnd) {
      offset -= totalDrop;
    } else {
      const u = (z - zone.zStart) / span;
      const integralFrac = u - Math.sin(2 * Math.PI * u) / (2 * Math.PI);
      offset -= totalDrop * integralFrac;
    }
  }
  return offset;
}

/**
 * Smooth extra trail half-width across the steep slope and wide landing recovery area.
 */
export function computeSteepZonesExtraHalfWidth(
  zones: readonly SteepDescentZone[] | undefined,
  z: number,
): number {
  if (!zones || zones.length === 0) return 0;
  let extra = 0;
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    const startWide = zone.zStart - 28;
    const endWide = zone.zEnd + zone.recoveryDistance;
    const shoulder = 24;
    if (z <= startWide - shoulder || z >= endWide + shoulder) continue;
    const up = smoothstep01((z - (startWide - shoulder)) / shoulder);
    const down = smoothstep01((endWide + shoulder - z) / shoulder);
    extra = Math.max(extra, zone.extraHalfWidth * Math.min(up, down));
  }
  return extra;
}

export interface FlatZoneSample {
  active: boolean;
  /** Smooth 0..1 plateau weight inside the flat section. */
  factor: number;
  zone: FlatMomentumZone | null;
}

/**
 * C^1-smooth raised-cosine plateau weight in [0, 1] over [zStart, zEnd] with smooth entry/exit shoulders.
 */
function computeFlatPlateauWeight(zStart: number, zEnd: number, z: number): number {
  const span = zEnd - zStart;
  if (span <= 0 || z <= zStart || z >= zEnd) return 0;
  const shoulder = Math.min(24, span * 0.35);
  if (z < zStart + shoulder) {
    const u = (z - zStart) / shoulder;
    return 0.5 * (1 - Math.cos(Math.PI * u));
  }
  if (z > zEnd - shoulder) {
    const v = (z - (zEnd - shoulder)) / shoulder;
    return 0.5 * (1 + Math.cos(Math.PI * v));
  }
  return 1;
}

/**
 * Smooth gradient reduction subtracted from base SLOPE_GRADIENT across any flat momentum section.
 */
export function computeFlatZonesGradientReduction(
  zones: readonly FlatMomentumZone[] | undefined,
  baseSlopeGradient: number,
  z: number,
): number {
  if (!zones || zones.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    const w = computeFlatPlateauWeight(zone.zStart, zone.zEnd, z);
    if (w > 0) {
      total += baseSlopeGradient * Math.max(0, Math.min(0.85, zone.flattenFraction)) * w;
    }
  }
  return Math.min(baseSlopeGradient * 0.9, total);
}

/**
 * Exact analytical elevation integral of `computeFlatZonesGradientReduction` from -inf to z.
 * Always returns >= 0 (flattening reduces downward drop) and stays permanently offset past zEnd
 * so downstream terrain and shelter remain 100% seamless with zero vertical seams.
 */
export function computeFlatZonesElevationOffset(
  zones: readonly FlatMomentumZone[] | undefined,
  baseSlopeGradient: number,
  z: number,
): number {
  if (!zones || zones.length === 0) return 0;
  let offset = 0;
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    if (z <= zone.zStart) continue;
    const span = zone.zEnd - zone.zStart;
    if (span <= 0) continue;
    const shoulder = Math.min(24, span * 0.35);
    const flatGrad = baseSlopeGradient * Math.max(0, Math.min(0.85, zone.flattenFraction));
    const plateauLen = Math.max(0, span - 2 * shoulder);

    if (z >= zone.zEnd) {
      offset += flatGrad * (plateauLen + shoulder);
      continue;
    }

    if (z <= zone.zStart + shoulder) {
      const u = (z - zone.zStart) / shoulder;
      offset += flatGrad * shoulder * (0.5 * u - Math.sin(Math.PI * u) / (2 * Math.PI));
    } else if (z <= zone.zEnd - shoulder) {
      offset += flatGrad * (0.5 * shoulder + (z - (zone.zStart + shoulder)));
    } else {
      const v = (z - (zone.zEnd - shoulder)) / shoulder;
      const rampDownIntegral =
        shoulder * (0.5 * v + Math.sin(Math.PI * v) / (2 * Math.PI));
      offset += flatGrad * (0.5 * shoulder + plateauLen + rampDownIntegral);
    }
  }
  return offset;
}

/** Smooth extra trail half-width across flat momentum sections. */
export function computeFlatZonesExtraHalfWidth(
  zones: readonly FlatMomentumZone[] | undefined,
  z: number,
): number {
  if (!zones || zones.length === 0) return 0;
  let extra = 0;
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    const shoulder = 24;
    if (z <= zone.zStart - shoulder || z >= zone.zEnd + shoulder) continue;
    const up = smoothstep01((z - (zone.zStart - shoulder)) / shoulder);
    const down = smoothstep01((zone.zEnd + shoulder - z) / shoulder);
    extra = Math.max(extra, zone.extraHalfWidth * Math.min(up, down));
  }
  return extra;
}

/** Evaluate whether distance `z` lies inside a flat momentum section and its smooth 0..1 weight. */
export function evaluateFlatZoneAt(
  zones: readonly FlatMomentumZone[] | undefined,
  z: number,
): FlatZoneSample {
  if (!zones || zones.length === 0) {
    return { active: false, factor: 0, zone: null };
  }
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    const w = computeFlatPlateauWeight(zone.zStart, zone.zEnd, z);
    if (w > 0.001) {
      return { active: true, factor: w, zone };
    }
  }
  return { active: false, factor: 0, zone: null };
}

/**
 * Evaluate which steep-descent state (NORMAL / APPROACH / DESCENT / RECOVERY) applies at distance `z`.
 */
export function evaluateSteepDescentAt(
  zones: readonly SteepDescentZone[] | undefined,
  z: number,
): SteepDescentSample {
  if (!zones || zones.length === 0) {
    return {
      phase: 'NORMAL',
      zone: null,
      warningActive: false,
      slopeFactor: 0,
      extraGradient: 0,
    };
  }

  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    const approachStart = zone.zStart - zone.approachDistance;
    const recoveryEnd = zone.zEnd + zone.recoveryDistance;

    if (z < approachStart || z > recoveryEnd) continue;

    const suppressWarning =
      zone.cameraMode === 'slalom' || zone.cameraMode === 'rockGarden';
    if (z < zone.zStart) {
      return {
        phase: 'APPROACH',
        zone,
        warningActive: !suppressWarning,
        slopeFactor: 0,
        extraGradient: 0,
      };
    }

    if (z <= zone.zEnd) {
      const span = Math.max(1, zone.zEnd - zone.zStart);
      const u = (z - zone.zStart) / span;
      const s = Math.sin(Math.PI * u);
      const slopeFactor = s * s;
      return {
        phase: 'DESCENT',
        zone,
        warningActive:
          !suppressWarning &&
          z <= zone.zStart + STEEP_DESCENT_CONFIG.warningHoldIntoDropMeters,
        slopeFactor,
        extraGradient: zone.extraGradient * slopeFactor,
      };
    }

    return {
      phase: 'RECOVERY',
      zone,
      warningActive: false,
      slopeFactor: 0,
      extraGradient: 0,
    };
  }

  return {
    phase: 'NORMAL',
    zone: null,
    warningActive: false,
    slopeFactor: 0,
    extraGradient: 0,
  };
}

export function createSteepCameraRigState(): SteepCameraRigState {
  return {
    phase: 'NORMAL',
    extraBack: 0,
    extraHeight: 0,
    extraLookAhead: 0,
    lookDownBias: 0,
    curveOutsideX: 0,
    curveLookOffsetX: 0,
  };
}

export function resetSteepCameraRigState(state: SteepCameraRigState): void {
  state.phase = 'NORMAL';
  state.extraBack = 0;
  state.extraHeight = 0;
  state.extraLookAhead = 0;
  state.lookDownBias = 0;
  state.curveOutsideX = 0;
  state.curveLookOffsetX = 0;
}

/**
 * Target rear-chase camera offsets for each SteepCameraPhase:
 * Always strictly behind Lofi — elevates & pulls back to reveal the steep slope and wide landing area.
 * - `cameraMode === 'carving'` (Level 4): keeps chase framing close while shifting toward curve outside.
 * - `cameraMode === 'dropJump'` (Level 5): gently raises & pulls back across the short downhill and ramp
 *   jump so both Lofi and the wide landing area stay clearly visible, then smoothly returns after landing.
 */
export function computeSteepCameraTargetOffsets(
  phase: SteepCameraPhase,
  slopeFactor: number,
  isPortrait: boolean,
  cameraMode: 'steep' | 'carving' | 'dropJump' | 'slalom' | 'alley' | 'rockGarden' = 'steep',
  keepElevatedForJump = false,
): SteepCameraTargetOffsets {
  const pScale = isPortrait ? 1.12 : 1.0;

  if (cameraMode === 'rockGarden') {
    if (phase === 'APPROACH') {
      return {
        extraBack: 1.65 * pScale,
        extraHeight: 1.6 * pScale,
        extraLookAhead: 7.5 * pScale,
        lookDownBias: -0.75 * pScale,
      };
    }
    if (phase === 'DESCENT') {
      return {
        extraBack: 2.9 * pScale,
        extraHeight: 2.85 * pScale,
        extraLookAhead: 12.8 * pScale,
        lookDownBias: -1.25 * pScale,
      };
    }
    return {
      extraBack: 0,
      extraHeight: 0,
      extraLookAhead: 0,
      lookDownBias: 0,
    };
  }

  if (cameraMode === 'alley') {
    if (phase === 'APPROACH') {
      return {
        extraBack: 1.6 * pScale,
        extraHeight: 1.45 * pScale,
        extraLookAhead: 7.0 * pScale,
        lookDownBias: -0.75 * pScale,
      };
    }
    if (phase === 'DESCENT') {
      const boost = 0.78 + 0.22 * Math.max(0, Math.min(1, slopeFactor));
      return {
        extraBack: 3.1 * boost * pScale,
        extraHeight: 2.75 * boost * pScale,
        extraLookAhead: 12.5 * boost * pScale,
        lookDownBias: -1.55 * boost * pScale,
      };
    }
    // Flat section (NORMAL) and post-downhill RECOVERY both smoothly return to normal chase camera
    return {
      extraBack: 0,
      extraHeight: 0,
      extraLookAhead: 0,
      lookDownBias: 0,
    };
  }

  if (cameraMode === 'slalom') {
    if (phase === 'APPROACH') {
      return {
        extraBack: 1.45 * pScale,
        extraHeight: 1.4 * pScale,
        extraLookAhead: 6.5 * pScale,
        lookDownBias: -0.65 * pScale,
      };
    }
    if (phase === 'DESCENT') {
      return {
        extraBack: 2.65 * pScale,
        extraHeight: 2.6 * pScale,
        extraLookAhead: 11.5 * pScale,
        lookDownBias: -1.15 * pScale,
      };
    }
    return {
      extraBack: 0,
      extraHeight: 0,
      extraLookAhead: 0,
      lookDownBias: 0,
    };
  }

  if (cameraMode === 'dropJump') {
    if (phase === 'APPROACH') {
      return {
        extraBack: 1.55 * pScale,
        extraHeight: 1.35 * pScale,
        extraLookAhead: 6.5 * pScale,
        lookDownBias: -0.7 * pScale,
      };
    }
    if (phase === 'DESCENT' || (phase === 'RECOVERY' && keepElevatedForJump)) {
      const boost =
        phase === 'DESCENT'
          ? 0.78 + 0.22 * Math.max(0, Math.min(1, slopeFactor))
          : 1.0;
      return {
        extraBack: 2.95 * boost * pScale,
        extraHeight: 2.55 * boost * pScale,
        extraLookAhead: 12.0 * boost * pScale,
        lookDownBias: -1.45 * boost * pScale,
      };
    }
    return {
      extraBack: 0,
      extraHeight: 0,
      extraLookAhead: 0,
      lookDownBias: 0,
    };
  }

  if (cameraMode === 'carving') {
    if (phase === 'APPROACH') {
      return {
        extraBack: 0.75 * pScale,
        extraHeight: 0.6 * pScale,
        extraLookAhead: 3.2 * pScale,
        lookDownBias: -0.32 * pScale,
      };
    }
    if (phase === 'DESCENT') {
      const boost = 0.75 + 0.25 * Math.max(0, Math.min(1, slopeFactor));
      return {
        extraBack: 1.45 * boost * pScale,
        extraHeight: 1.2 * boost * pScale,
        extraLookAhead: 5.8 * boost * pScale,
        lookDownBias: -0.65 * boost * pScale,
      };
    }
    return {
      extraBack: 0,
      extraHeight: 0,
      extraLookAhead: 0,
      lookDownBias: 0,
    };
  }

  if (phase === 'APPROACH') {
    return {
      extraBack: 2.6 * pScale,
      extraHeight: 2.2 * pScale,
      extraLookAhead: 8.5 * pScale,
      lookDownBias: -1.05 * pScale,
    };
  }

  if (phase === 'DESCENT') {
    const steepBoost = 0.72 + 0.28 * Math.max(0, Math.min(1, slopeFactor));
    return {
      extraBack: 5.0 * steepBoost * pScale,
      extraHeight: 4.35 * steepBoost * pScale,
      extraLookAhead: 15.5 * steepBoost * pScale,
      lookDownBias: -2.45 * steepBoost * pScale,
    };
  }

  // NORMAL and RECOVERY both target the standard behind-Lofi camera cleanly
  return {
    extraBack: 0,
    extraHeight: 0,
    extraLookAhead: 0,
    lookDownBias: 0,
  };
}

/**
 * Smooth exponential damping step for steep-descent, carving-pass, & drop-jump camera offsets (~0.95-1.2s 95% transition).
 */
export function stepSteepCameraRigState(
  state: SteepCameraRigState,
  phase: SteepCameraPhase,
  slopeFactor: number,
  isPortrait: boolean,
  dt: number,
  immediate = false,
  options?: {
    cameraMode?: 'steep' | 'carving' | 'dropJump' | 'slalom' | 'alley' | 'rockGarden';
    carvingPass?: CarvingPassConfig;
    playerDistance?: number;
    playerJumpHeight?: number;
    activeZone?: SteepDescentZone;
  },
): SteepCameraRigState {
  state.phase = phase;
  const cameraMode = options?.cameraMode ?? 'steep';
  const playerDist = options?.playerDistance ?? 0;
  const jumpHeight = options?.playerJumpHeight ?? 0;
  const zoneEnd = options?.activeZone?.zEnd;
  const keepElevatedForJump =
    cameraMode === 'dropJump' &&
    phase === 'RECOVERY' &&
    (jumpHeight > 0.12 ||
      (zoneEnd !== undefined && playerDist >= zoneEnd && playerDist <= zoneEnd + 22));
  const target = computeSteepCameraTargetOffsets(
    phase,
    slopeFactor,
    isPortrait,
    cameraMode,
    keepElevatedForJump,
  );
  const curveTarget = computeCarvingCameraOutsideTarget(
    options?.carvingPass,
    phase,
    playerDist,
    isPortrait,
  );

  if (immediate || dt <= 0) {
    state.extraBack = target.extraBack;
    state.extraHeight = target.extraHeight;
    state.extraLookAhead = target.extraLookAhead;
    state.lookDownBias = target.lookDownBias;
    state.curveOutsideX = curveTarget.curveOutsideX;
    state.curveLookOffsetX = curveTarget.curveLookOffsetX;
    return state;
  }

  const tau =
    phase === 'RECOVERY' || phase === 'NORMAL'
      ? STEEP_DESCENT_CONFIG.cameraTransitionTau *
        ((cameraMode === 'dropJump' && !keepElevatedForJump) ||
        cameraMode === 'slalom' ||
        cameraMode === 'rockGarden'
          ? 1.32
          : cameraMode === 'alley'
            ? 1.15
            : 1.1)
      : STEEP_DESCENT_CONFIG.cameraTransitionTau;
  const alpha = 1 - Math.exp(-dt / Math.max(0.05, tau));

  state.extraBack += (target.extraBack - state.extraBack) * alpha;
  state.extraHeight += (target.extraHeight - state.extraHeight) * alpha;
  state.extraLookAhead += (target.extraLookAhead - state.extraLookAhead) * alpha;
  state.lookDownBias += (target.lookDownBias - state.lookDownBias) * alpha;

  const curveTau =
    phase === 'RECOVERY' || phase === 'NORMAL'
      ? CARVING_PASS_CONFIG.cameraCurveShiftTau * 1.15
      : CARVING_PASS_CONFIG.cameraCurveShiftTau;
  const curveAlpha = 1 - Math.exp(-dt / Math.max(0.05, curveTau));
  state.curveOutsideX += (curveTarget.curveOutsideX - state.curveOutsideX) * curveAlpha;
  state.curveLookOffsetX +=
    (curveTarget.curveLookOffsetX - state.curveLookOffsetX) * curveAlpha;

  return state;
}

export interface SpeedSteerBalance {
  /** Multiplier applied to lateral steering acceleration (< 1 at excessive speed). */
  steerAccelMult: number;
  /** Multiplier applied to lateral damping (< 1 at excessive speed -> wider drift). */
  lateralDampingMult: number;
  /** Normalized overspeed ratio in [0, 1] (0 at normal cruise, 1 at peak steep speed). */
  overspeedRatio: number;
}

/**
 * Pure gameplay balance helper:
 * - Excessive downhill speed makes steering & line-holding noticeably harder.
 * - Braking keeps steering active and slightly crisper while reducing speed smoothly.
 */
export function computeSpeedSteerBalance(
  forwardSpeed: number,
  baseSpeed: number,
  brakeAmount: number,
  isAirborne: boolean,
): SpeedSteerBalance {
  const excess = Math.max(0, forwardSpeed - (baseSpeed + 1.8));
  const overspeedRatio = Math.max(
    0,
    Math.min(1, excess / Math.max(1, STEEP_DESCENT_CONFIG.maxOverspeedBonus - 1.8)),
  );

  let steerAccelMult = 1 - overspeedRatio * STEEP_DESCENT_CONFIG.highSpeedSteerAccelPenalty;
  let lateralDampingMult = 1 - overspeedRatio * STEEP_DESCENT_CONFIG.highSpeedDampingPenalty;

  if (!isAirborne && brakeAmount > 0.01) {
    const b = Math.max(0, Math.min(1, brakeAmount));
    steerAccelMult *= 1 - b * (1 - STEEP_DESCENT_CONFIG.brakeSteerAccelFactor);
    lateralDampingMult *= 1 + b * (STEEP_DESCENT_CONFIG.brakeDampingBoost - 1);
  }

  return {
    steerAccelMult,
    lateralDampingMult,
    overspeedRatio,
  };
}
