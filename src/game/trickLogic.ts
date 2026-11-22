import type { GrabTrickStyle } from './types';

export const TRICK_CONFIG = {
  /** Base points awarded for a cleanly landed mid-air Grab trick before multiplier. */
  grabBasePoints: 150,
  /** Extra base points when the Grab was performed off a ramp, at high air, or held smoothly. */
  bigAirGrabBonus: 75,
  /** Base points awarded for a stylish clean jump/ramp air without a grab (peak >= minAirTrickHeight). */
  cleanAirBasePoints: 50,
  /** Minimum peak altitude (meters) for an ungrabbed jump to register as a stylish Air maneuver. */
  minAirTrickHeight: 1.15,
  /** Peak altitude threshold (meters) that qualifies a grab for the Big Air bonus. */
  bigAirHeightThreshold: 2.25,
  /** Grab hold duration (seconds) that also qualifies a grab for the stylish hold bonus. */
  stylishGrabHoldSeconds: 0.42,
  /** Starting score multiplier. */
  minMultiplier: 1,
  /** Maximum score multiplier achievable via chained tricks. */
  maxMultiplier: 5,
  /** Combo decay window (seconds) before multiplier resets back to 1x. */
  comboDurationSeconds: 9.0,
  /** Timer refresh granted when collecting a Lil Yeti while a multiplier > 1x is active. */
  collectibleTimerRefresh: 2.2,
  /** Duration of the HUD trick landing toast (seconds). */
  trickToastDuration: 1.65,
} as const;

export const GRAB_STYLE_LABELS: Record<GrabTrickStyle, string> = {
  INDY: 'INDY GRAB',
  TAIL: 'TAIL GRAB',
  METHOD: 'METHOD GRAB',
  NOSE: 'NOSE GRAB',
};

export function getGrabStyleLabel(style: GrabTrickStyle): string {
  return GRAB_STYLE_LABELS[style];
}

/**
 * Deterministically select a stylish snowboard grab variation based on steering direction,
 * ramp launch state, and grab count so consecutive tricks feel varied and expressive.
 */
export function selectGrabTrickStyle(
  steerAxis: number,
  launchedFromRamp: boolean,
  grabCount: number,
): GrabTrickStyle {
  if (steerAxis <= -0.35) return 'METHOD';
  if (steerAxis >= 0.35) return 'TAIL';
  if (launchedFromRamp) return grabCount % 2 === 0 ? 'METHOD' : 'NOSE';
  return grabCount % 2 === 0 ? 'INDY' : 'NOSE';
}

export interface TrickLandingInput {
  grabbed: boolean;
  grabHoldTime: number;
  minGrabHoldSeconds: number;
  peakAirHeight: number;
  launchedFromRamp: boolean;
  /** True when Lofi cleanly jumped over at least one track obstacle (fallen log, rock, pine) during this jump. */
  clearedObstacle: boolean;
  grabStyle: GrabTrickStyle;
  currentMultiplier: number;
  currentTimer: number;
}

export interface TrickLandingResult {
  /** Whether a Grab trick was cleanly completed on this landing. */
  awardedGrab: boolean;
  /** Whether any stylish maneuver (Grab, Ramp Air, or Obstacle Clear) awarded points. */
  awardedTrick: boolean;
  /** Display label for HUD toast (e.g., "INDY GRAB", "RAMP AIR", "OBSTACLE CLEAR", or null). */
  label: string | null;
  /** Final points awarded (already multiplied by the active scoreMultiplier). */
  points: number;
  /** Updated score multiplier (1..maxMultiplier). */
  nextMultiplier: number;
  /** Updated combo decay timer in seconds. */
  nextTimer: number;
}

/**
 * Evaluate trick points and score multiplier progression cleanly on touchdown.
 * Anti-farming rule:
 * - Plain flat-ground jumps and flat-ground grabs (neither launched off a ramp nor clearing an obstacle)
 *   strictly award 0 points, 0 multiplier gain, and 0 combo timer refresh.
 * - Clean Grab trick off a ramp or over an obstacle: awards grabBasePoints (+ bigAirGrabBonus on ramps/big air)
 *   × currentMultiplier, increments multiplier by +1 (up to 5x), and refills the combo timer.
 * - Clean Air jump off a ramp or over an obstacle (no grab): awards ramp/obstacle clear points × currentMultiplier
 *   and refreshes the combo timer if a multiplier > 1x is already active.
 */
export function evaluateTrickLanding(input: TrickLandingInput): TrickLandingResult {
  const safeMult = Math.max(
    TRICK_CONFIG.minMultiplier,
    Math.min(TRICK_CONFIG.maxMultiplier, Math.floor(input.currentMultiplier)),
  );

  // Strict anti-farming guard: empty flat-snow jumps/grabs NEVER award score or multiplier!
  const earnedByFeature = input.launchedFromRamp || input.clearedObstacle;
  if (!earnedByFeature) {
    return {
      awardedGrab: false,
      awardedTrick: false,
      label: null,
      points: 0,
      nextMultiplier: safeMult,
      nextTimer: input.currentTimer,
    };
  }

  if (input.grabbed && input.grabHoldTime >= input.minGrabHoldSeconds) {
    const isBigAir =
      input.launchedFromRamp ||
      input.peakAirHeight >= TRICK_CONFIG.bigAirHeightThreshold ||
      input.grabHoldTime >= TRICK_CONFIG.stylishGrabHoldSeconds;
    const basePoints =
      TRICK_CONFIG.grabBasePoints + (isBigAir ? TRICK_CONFIG.bigAirGrabBonus : 0);
    const points = basePoints * safeMult;
    const nextMultiplier = Math.min(TRICK_CONFIG.maxMultiplier, safeMult + 1);
    const label = isBigAir
      ? `SUPER ${getGrabStyleLabel(input.grabStyle)}`
      : getGrabStyleLabel(input.grabStyle);
    return {
      awardedGrab: true,
      awardedTrick: true,
      label,
      points,
      nextMultiplier,
      nextTimer: TRICK_CONFIG.comboDurationSeconds,
    };
  }

  if (input.peakAirHeight >= TRICK_CONFIG.minAirTrickHeight || input.clearedObstacle) {
    const basePoints = input.launchedFromRamp
      ? TRICK_CONFIG.cleanAirBasePoints + 25
      : TRICK_CONFIG.cleanAirBasePoints;
    const points = basePoints * safeMult;
    const label = input.launchedFromRamp ? 'RAMP AIR' : 'OBSTACLE CLEAR';
    const nextTimer =
      safeMult > TRICK_CONFIG.minMultiplier
        ? TRICK_CONFIG.comboDurationSeconds
        : input.currentTimer;
    return {
      awardedGrab: false,
      awardedTrick: true,
      label,
      points,
      nextMultiplier: safeMult,
      nextTimer,
    };
  }

  return {
    awardedGrab: false,
    awardedTrick: false,
    label: null,
    points: 0,
    nextMultiplier: safeMult,
    nextTimer: input.currentTimer,
  };
}

/**
 * Apply the active score multiplier to Lil Yeti collectible points and lightly refresh
 * the active combo timer so stylish descents multiply pickups too.
 */
export function applyCollectibleMultiplier(
  basePoints: number,
  currentMultiplier: number,
  currentTimer: number,
): { points: number; nextTimer: number } {
  const safeMult = Math.max(
    TRICK_CONFIG.minMultiplier,
    Math.min(TRICK_CONFIG.maxMultiplier, Math.floor(currentMultiplier)),
  );
  const points = Math.round(basePoints * safeMult);
  const nextTimer =
    safeMult > TRICK_CONFIG.minMultiplier
      ? Math.min(TRICK_CONFIG.comboDurationSeconds, currentTimer + TRICK_CONFIG.collectibleTimerRefresh)
      : currentTimer;
  return { points, nextTimer };
}

/**
 * Step the combo multiplier decay timer each simulation tick.
 * When the timer reaches 0, multiplier smoothly resets to 1x.
 */
export function stepTrickMultiplierTimer(
  currentMultiplier: number,
  currentTimer: number,
  dt: number,
): { multiplier: number; timer: number } {
  if (currentMultiplier <= TRICK_CONFIG.minMultiplier) {
    return { multiplier: TRICK_CONFIG.minMultiplier, timer: 0 };
  }
  const nextTimer = Math.max(0, currentTimer - Math.max(0, dt));
  if (nextTimer <= 0) {
    return { multiplier: TRICK_CONFIG.minMultiplier, timer: 0 };
  }
  return { multiplier: currentMultiplier, timer: nextTimer };
}
