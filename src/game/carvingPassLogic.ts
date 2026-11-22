import type { CarvingPassConfig, SteepCameraPhase } from './types';

/**
 * Pure deterministic geometry, carving speed-control, outside-curve snow mound placement,
 * and smooth outside-curve camera shift logic for Level 4 — Carving Pass.
 * Zero Three.js dependencies so every behavior can be unit-tested headlessly.
 */

export const CARVING_PASS_CONFIG = {
  /** Active snow-edge carving speed bleed rate (m/s^2) on the Carving Pass downhill. */
  carveDecelRate: 13.5,
  /** Proportional downhill gravity scale for Level 4's longer 220m S-curve pass (vs Level 3's short 78m drop). */
  gravityScale: 0.62,
  /** Speed floor relative to levelBaseSpeed that carving alone decelerates toward (keeps board gliding smoothly). */
  carveFloorBelowBase: 1.4,
  /** Minimum steering/lean magnitude before carving edge-bite speed control engages. */
  minCarveMagnitude: 0.16,
  /** Curvature magnitude threshold (1/m) above which outside-curve snow mounds are placed. */
  moundCurvatureThreshold: 0.0014,
  /** Peak reference curvature (1/m) used to normalize outside-curve snow mound scale & camera shift. */
  referencePeakCurvature: 0.0044,
  /** Maximum subtle camera shift toward the outside of the current S-curve on desktop (meters). */
  cameraOutsideShiftDesktop: 2.35,
  /** Maximum subtle camera shift toward the outside of the current S-curve on portrait mobile (meters). */
  cameraOutsideShiftPortrait: 1.55,
  /** Subtle look-target lateral lead aligned with outside-curve shift on desktop (meters). */
  cameraOutsideLookShiftDesktop: 0.55,
  /** Subtle look-target lateral lead aligned with outside-curve shift on portrait mobile (meters). */
  cameraOutsideLookShiftPortrait: 0.35,
  /** Exponential damping time constant for outside-curve camera shift (seconds — smooth, never a sudden cut). */
  cameraCurveShiftTau: 0.42,
} as const;

export interface CarvingSnowMoundSpec {
  z: number;
  /** Lateral offset from track centerline (meters). Strictly outside the groomed carving lane. */
  offsetX: number;
  /** Which edge of the curve this mound borders (-1 = left outside, +1 = right outside). */
  side: -1 | 1;
  /** Normalized curve intensity in [0, 1] at this mound's position. */
  curveStrength: number;
  /** Local slope tangent dx/dz so elongated snowdrifts hug the bend naturally. */
  tangentX: number;
  /** Sculpted snowdrift dimensions (meters). */
  radiusX: number;
  radiusY: number;
  radiusZ: number;
  /** Subtle organic tint multiplier in [0.94, 1.04]. */
  tint: number;
  /** True for secondary backing snowdrifts tucked behind peak apex mounds. */
  isOuterTier: boolean;
}

export interface CarvingSpeedBleedParams {
  forwardSpeed: number;
  baseSpeed: number;
  steerAxis: number;
  visualLean: number;
  isAirborne: boolean;
  isBraking: boolean;
  slopeFactor: number;
}

function smoothstep01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Smooth 0..1 blend envelope covering the straight approach, S-shaped downhill, and flat recovery area.
 * - Equals 0 outside [blendStart, blendEnd].
 * - Equals 1 across [zStart, recoveryFlatEnd] so the S-curve and post-descent recovery are crystal clear
 *   and free of abrupt background harmonic kinks.
 */
export function computeCarvingPassBlend(
  cfg: CarvingPassConfig | undefined,
  z: number,
  recoveryFlatEnd?: number,
): number {
  if (!cfg) return 0;
  const flatEnd = recoveryFlatEnd ?? Math.min(cfg.blendEnd - 36, cfg.zEnd + 86);
  if (z <= cfg.blendStart || z >= cfg.blendEnd) return 0;
  const upSpan = Math.max(1, cfg.zStart - cfg.blendStart);
  const downSpan = Math.max(1, cfg.blendEnd - flatEnd);
  const up = smoothstep01((z - cfg.blendStart) / upSpan);
  const down = smoothstep01((cfg.blendEnd - z) / downSpan);
  return Math.min(up, down);
}

/**
 * C^1-smooth S-shaped centerline displacement over [zStart, zEnd]:
 *   X(u) = firstBendSign * sAmplitude * sin(2*pi*u) * sin(pi*u)
 * - X(0) = 0, X'(0) = 0 (clean straight approach entry)
 * - Sweeps smoothly to +side on Bend 1, inflects cleanly at midpoint, sweeps to -side on Bend 2
 * - X(1) = 0, X'(1) = 0 (clean straight exit into flat recovery area — zero sharp turn after landing!)
 */
export function computeCarvingPassCenterOffset(
  cfg: CarvingPassConfig | undefined,
  z: number,
): number {
  if (!cfg) return 0;
  if (z <= cfg.zStart || z >= cfg.zEnd) return 0;
  const span = Math.max(1, cfg.zEnd - cfg.zStart);
  const u = (z - cfg.zStart) / span;
  return cfg.firstBendSign * cfg.sAmplitude * Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * u);
}

/**
 * Analytical first derivative dX/dz of the S-shaped carving pass centerline.
 */
export function computeCarvingPassSlope(
  cfg: CarvingPassConfig | undefined,
  z: number,
): number {
  if (!cfg) return 0;
  if (z <= cfg.zStart || z >= cfg.zEnd) return 0;
  const span = Math.max(1, cfg.zEnd - cfg.zStart);
  const u = (z - cfg.zStart) / span;
  const dXdu =
    cfg.firstBendSign *
    cfg.sAmplitude *
    (2 * Math.PI * Math.cos(2 * Math.PI * u) * Math.sin(Math.PI * u) +
      Math.PI * Math.sin(2 * Math.PI * u) * Math.cos(Math.PI * u));
  return dXdu / span;
}

/**
 * Analytical second derivative d^2X/dz^2 (curvature) of the S-shaped carving pass centerline.
 * Physics convention:
 * - curvature < 0 => track curves LEFT => outside of the curve is +1 (RIGHT edge).
 * - curvature > 0 => track curves RIGHT => outside of the curve is -1 (LEFT edge).
 */
export function computeCarvingPassCurvature(
  cfg: CarvingPassConfig | undefined,
  z: number,
): number {
  if (!cfg) return 0;
  if (z <= cfg.zStart || z >= cfg.zEnd) return 0;
  const span = Math.max(1, cfg.zEnd - cfg.zStart);
  const u = (z - cfg.zStart) / span;
  const pi2 = Math.PI * Math.PI;
  const d2Xdu2 =
    cfg.firstBendSign *
    cfg.sAmplitude *
    (-5 * pi2 * Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * u) +
      4 * pi2 * Math.cos(2 * Math.PI * u) * Math.cos(Math.PI * u));
  return d2Xdu2 / (span * span);
}

/**
 * Return the outside side (-1 = left, +1 = right, 0 = straight/inflection) of the S-curve at distance z.
 */
export function getCarvingCurveOutsideSide(
  cfg: CarvingPassConfig | undefined,
  z: number,
  threshold = CARVING_PASS_CONFIG.moundCurvatureThreshold,
): -1 | 0 | 1 {
  const kappa = computeCarvingPassCurvature(cfg, z);
  if (Math.abs(kappa) < threshold) return 0;
  return kappa < 0 ? 1 : -1;
}

/**
 * Deterministically generate sculpted snow mound boundary specs strictly along the OUTSIDE
 * of each curve in the S-shaped carving pass.
 * Every mound sits cleanly outside the wide groomed path (`|offsetX| >= halfWidth + 0.55`)
 * so it serves as a clear visual boundary without ever creating a cliff, gap, or instant-fail hazard.
 */
export function generateCarvingPassSnowMounds(
  cfg: CarvingPassConfig | undefined,
  getHalfWidthAt: (z: number) => number,
): CarvingSnowMoundSpec[] {
  if (!cfg) return [];
  const mounds: CarvingSnowMoundSpec[] = [];
  const spacing = Math.max(4.5, cfg.moundSpacing);
  const zFirst = cfg.zStart + 10;
  const zLast = cfg.zEnd - 10;

  let idx = 0;
  for (let z = zFirst; z <= zLast; z += spacing) {
    const kappa = computeCarvingPassCurvature(cfg, z);
    const absKappa = Math.abs(kappa);
    if (absKappa < CARVING_PASS_CONFIG.moundCurvatureThreshold) {
      idx++;
      continue;
    }

    const side: -1 | 1 = kappa < 0 ? 1 : -1;
    const curveStrength = Math.max(
      0,
      Math.min(
        1,
        (absKappa - CARVING_PASS_CONFIG.moundCurvatureThreshold) /
          Math.max(
            0.0005,
            CARVING_PASS_CONFIG.referencePeakCurvature -
              CARVING_PASS_CONFIG.moundCurvatureThreshold,
          ),
      ),
    );
    const halfW = getHalfWidthAt(z);
    const tangentX = computeCarvingPassSlope(cfg, z);
    const wave = Math.sin(idx * 1.9 + z * 0.09);

    // Primary boundary snowdrift hugging the outer edge of the curve (strictly outside playable lane)
    const edgeMargin = 0.72 + (1 - curveStrength) * 0.42 + Math.abs(wave) * 0.22;
    const radiusX = 2.05 + curveStrength * 0.85 + Math.abs(wave) * 0.25;
    const radiusY = 1.35 + curveStrength * 0.82 + (wave * 0.5 + 0.5) * 0.22;
    const radiusZ = 3.25 + curveStrength * 1.05;

    mounds.push({
      z,
      offsetX: side * (halfW + edgeMargin),
      side,
      curveStrength,
      tangentX,
      radiusX,
      radiusY,
      radiusZ,
      tint: 0.96 + (wave * 0.5 + 0.5) * 0.06,
      isOuterTier: false,
    });

    // Secondary tucked snowbank mound behind high-curvature apexes for a rich, readable alpine berm
    if (curveStrength >= 0.45) {
      const zBack = z + spacing * 0.48;
      if (zBack <= zLast) {
        const halfWBack = getHalfWidthAt(zBack);
        mounds.push({
          z: zBack,
          offsetX: side * (halfWBack + 2.35 + Math.abs(wave) * 0.35),
          side,
          curveStrength,
          tangentX: computeCarvingPassSlope(cfg, zBack),
          radiusX: radiusX * 1.15,
          radiusY: radiusY * 1.18,
          radiusZ: radiusZ * 1.08,
          tint: 0.93 + Math.abs(wave) * 0.05,
          isOuterTier: true,
        });
      }
    }

    idx++;
  }

  return mounds;
}

/**
 * Pure carving speed-control deceleration (m/s^2) for Level 4 — Carving Pass:
 * - Edging/carving through the S-curves on snow smoothly bleeds excess downhill speed.
 * - Never stalls Lofi below `(baseSpeed - carveFloorBelowBase)` so carving feels rhythmic and fast.
 * - Combining carving with tactical braking keeps speed balanced and steering crisp;
 *   riding straight unbraked skips this speed bleed and builds excessive speed.
 */
export function computeCarvingSpeedBleedRate(
  params: CarvingSpeedBleedParams,
): number {
  const {
    forwardSpeed,
    baseSpeed,
    steerAxis,
    visualLean,
    isAirborne,
    isBraking,
    slopeFactor,
  } = params;

  if (isAirborne || slopeFactor <= 0.01) return 0;

  const carveFloor = baseSpeed - CARVING_PASS_CONFIG.carveFloorBelowBase;
  if (forwardSpeed <= carveFloor) return 0;

  const carveEffort = Math.min(1, Math.max(Math.abs(steerAxis), Math.abs(visualLean)));
  if (carveEffort <= CARVING_PASS_CONFIG.minCarveMagnitude) return 0;

  const normCarve =
    (carveEffort - CARVING_PASS_CONFIG.minCarveMagnitude) /
    (1 - CARVING_PASS_CONFIG.minCarveMagnitude);
  const overspeedFactor = Math.min(1, (forwardSpeed - carveFloor) / 8.0);
  const rawBleed =
    CARVING_PASS_CONFIG.carveDecelRate *
    normCarve *
    (0.45 + 0.55 * overspeedFactor);

  // When already holding Brake, apply a lighter edge-bite synergy so speed stays smooth & never stalls abruptly
  return isBraking ? rawBleed * 0.32 : rawBleed;
}

/**
 * Compute target outside-curve camera lateral offset during the S-shaped carving descent.
 * - Shifts slightly toward the OUTSIDE of the current curve (`-sign(curvature)`).
 * - Smoothly ramps in on descent entry and returns cleanly to 0 in RECOVERY / NORMAL.
 * - Independent of jump/grab tricks (never rotates or jumps camera during tricks).
 */
export function computeCarvingCameraOutsideTarget(
  cfg: CarvingPassConfig | undefined,
  phase: SteepCameraPhase,
  playerDistance: number,
  isPortrait: boolean,
): { curveOutsideX: number; curveLookOffsetX: number } {
  if (!cfg || (phase !== 'APPROACH' && phase !== 'DESCENT')) {
    return { curveOutsideX: 0, curveLookOffsetX: 0 };
  }

  // Slight look-ahead blend so the camera begins gliding toward the curve outside smoothly ahead of the apex
  const kNow = computeCarvingPassCurvature(cfg, playerDistance);
  const kAhead = computeCarvingPassCurvature(cfg, playerDistance + 16);
  const weightedKappa = kNow * 0.62 + kAhead * 0.38;

  // Outside of the curve is strictly opposite the curvature sign
  const normalizedOutside = Math.max(
    -1,
    Math.min(1, -weightedKappa / CARVING_PASS_CONFIG.referencePeakCurvature),
  );

  // Smooth entry/exit fade so camera glides in gently at zStart and returns smoothly before zEnd
  const span = Math.max(1, cfg.zEnd - cfg.zStart);
  const u = (playerDistance - cfg.zStart) / span;
  let zoneFade = 0;
  if (phase === 'APPROACH') {
    const approachT = smoothstep01((playerDistance - (cfg.zStart - 26)) / 26);
    zoneFade = approachT * 0.45;
  } else if (u >= 0 && u <= 1) {
    const entryFade = smoothstep01(u / 0.08);
    const exitFade = smoothstep01((1 - u) / 0.12);
    zoneFade = Math.min(entryFade, exitFade);
  }

  const maxCamX = isPortrait
    ? CARVING_PASS_CONFIG.cameraOutsideShiftPortrait
    : CARVING_PASS_CONFIG.cameraOutsideShiftDesktop;
  const maxLookX = isPortrait
    ? CARVING_PASS_CONFIG.cameraOutsideLookShiftPortrait
    : CARVING_PASS_CONFIG.cameraOutsideLookShiftDesktop;

  return {
    curveOutsideX: normalizedOutside * zoneFade * maxCamX,
    curveLookOffsetX: normalizedOutside * zoneFade * maxLookX,
  };
}
