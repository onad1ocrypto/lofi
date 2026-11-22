/**
 * Pure, deterministic-when-seeded randomized alpine wind gust system for LOFI ICE ESCAPE.
 *
 * Drives three tightly synchronized effects with zero per-frame heap allocations:
 * 1) Subtle crosswind steering push on Lofi's snowboard (makes holding a line slightly harder
 *    without ever overpowering manual carving authority on any level 1..10).
 * 2) Lateral & turbulent particle-pushing velocity applied to both ambient snowfall flakes
 *    and 3D instanced snowboard snow spray / powder mist.
 * 3) Subtle spatial mountain-wind audio swell synced to gust intensity and direction.
 *
 * Camera screen-shake is intentionally disabled (strictly 0) for steady, vibration-free readability.
 */

export const WIND_GUST_CONFIG = {
  /** Calm opening grace period after level start before the first gust can arrive (seconds). */
  initialGraceMin: 3.0,
  initialGraceMax: 4.8,
  /** Randomized calm interval between consecutive gusts on Level 1 (seconds). */
  cooldownMin: 4.6,
  cooldownMax: 8.6,
  /** Randomized gust duration (seconds). */
  durationMin: 2.3,
  durationMax: 4.0,
  /** Randomized peak normalized gust strength in (0, 1]. */
  minPeakStrength: 0.62,
  maxPeakStrength: 1.0,
  /**
   * Subtle lateral crosswind acceleration on snow at peak strength on Level 1 (m/s^2).
   * Player lateralAccel is 46 m/s^2, so even at peak gust the rider keeps >80% steering authority.
   */
  baseSteeringPushAccel: 6.0,
  /** Gentle alpine altitude scaling per level above Level 1 (reaches ~1.32x at Level 10). */
  levelStrengthBonus: 0.036,
  /** Airborne crosswind push multiplier so jumps feel wind-kissed without unfair mid-air derailment. */
  airbornePushFactor: 0.65,
  /** Camera screen-shake is disabled (strictly 0) so the viewport never vibrates or jitters. */
  shakeMaxPosXLandscape: 0,
  shakeMaxPosYLandscape: 0,
  shakeMaxLookXLandscape: 0,
  shakeMaxLookYLandscape: 0,
  shakeMaxPosXPortrait: 0,
  shakeMaxPosYPortrait: 0,
  shakeMaxLookXPortrait: 0,
  shakeMaxLookYPortrait: 0,
  /** Snowfall & snow-spray lateral particle push speed at full gust strength (m/s). */
  snowfallPushSpeedX: 15.5,
  snowfallPushSpeedZ: -3.2,
  sprayPushSpeedX: 9.8,
  sprayPushSpeedZ: -1.8,
} as const;

export interface WindGustState {
  /** Internal 32-bit LCG PRNG state for randomized gust timing, direction, and strength. */
  rngState: number;
  /** True while a wind gust is currently blowing across the trail. */
  active: boolean;
  /** Seconds remaining until the next gust starts (when inactive). */
  cooldown: number;
  /** Seconds elapsed inside the current active gust. */
  elapsed: number;
  /** Total duration of the current active gust (seconds). */
  duration: number;
  /** Crosswind direction: -1 pushes left (-X), +1 pushes right (+X). */
  direction: -1 | 1;
  /** Randomized peak intensity cap for the current gust in [minPeakStrength, maxPeakStrength]. */
  peakStrength: number;
  /** Current smooth gust envelope intensity in [0, 1]. */
  intensity: number;
  /** Signed effective gust force in [-1, 1] (`direction * intensity`). */
  signedForce: number;
  /** Total number of gusts triggered in the current run. */
  gustCount: number;
}

export interface WindGustCameraShakeOut {
  offsetX: number;
  offsetY: number;
  lookOffsetX: number;
  lookOffsetY: number;
}

export interface WindGustParticlePushOut {
  snowfallPushX: number;
  snowfallPushZ: number;
  sprayPushX: number;
  sprayPushZ: number;
  flutterBoost: number;
}

function nextUnitRand(state: WindGustState): number {
  state.rngState = (Math.imul(1664525, state.rngState) + 1013904223) >>> 0;
  return state.rngState / 4294967296;
}

function randRange(state: WindGustState, min: number, max: number): number {
  return min + nextUnitRand(state) * (max - min);
}

function smoothstep01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Create a fresh wind gust state with a calm opening grace period so the player
 * always gets a clean, steady launch before randomized gusts begin.
 */
export function createWindGustState(seed = 202611): WindGustState {
  const safeSeed = (seed >>> 0) || 1337;
  const state: WindGustState = {
    rngState: safeSeed,
    active: false,
    cooldown: 0,
    elapsed: 0,
    duration: 0,
    direction: 1,
    peakStrength: 0,
    intensity: 0,
    signedForce: 0,
    gustCount: 0,
  };
  state.cooldown = randRange(
    state,
    WIND_GUST_CONFIG.initialGraceMin,
    WIND_GUST_CONFIG.initialGraceMax,
  );
  return state;
}

/**
 * Reset wind gust state in place (zero allocation) on retry, next level, or restart.
 */
export function resetWindGustState(state: WindGustState, seed: number): void {
  state.rngState = (seed >>> 0) || 1337;
  state.active = false;
  state.elapsed = 0;
  state.duration = 0;
  state.direction = 1;
  state.peakStrength = 0;
  state.intensity = 0;
  state.signedForce = 0;
  state.gustCount = 0;
  state.cooldown = randRange(
    state,
    WIND_GUST_CONFIG.initialGraceMin,
    WIND_GUST_CONFIG.initialGraceMax,
  );
}

/**
 * Advance the randomized alpine wind gust scheduler and smooth intensity envelope.
 */
export function stepWindGust(
  state: WindGustState,
  dt: number,
  levelNumber: number,
): void {
  if (dt <= 0) return;

  const lvNorm = Math.max(0, Math.min(9, levelNumber - 1)) / 9;

  if (!state.active) {
    state.cooldown -= dt;
    if (state.cooldown <= 0) {
      // Begin a new randomized crosswind gust
      state.active = true;
      state.elapsed = Math.min(0.05, Math.max(0, -state.cooldown));
      state.duration = randRange(
        state,
        WIND_GUST_CONFIG.durationMin,
        WIND_GUST_CONFIG.durationMax,
      );
      // Favor lively variety: 62% chance to flip direction vs previous gust, 38% chance to repeat
      if (state.gustCount === 0) {
        state.direction = nextUnitRand(state) < 0.5 ? -1 : 1;
      } else {
        state.direction = nextUnitRand(state) < 0.62 ? (state.direction === 1 ? -1 : 1) : state.direction;
      }
      state.peakStrength = randRange(
        state,
        WIND_GUST_CONFIG.minPeakStrength + lvNorm * 0.08,
        WIND_GUST_CONFIG.maxPeakStrength,
      );
      state.gustCount += 1;
    } else {
      state.intensity = 0;
      state.signedForce = 0;
      return;
    }
  } else {
    state.elapsed += dt;
  }

  if (state.elapsed >= state.duration) {
    // End gust cleanly and schedule next randomized calm interval (gently brisker on higher levels)
    state.active = false;
    state.elapsed = 0;
    state.duration = 0;
    state.intensity = 0;
    state.signedForce = 0;
    const freqScale = 1 - lvNorm * 0.24;
    state.cooldown = randRange(
      state,
      WIND_GUST_CONFIG.cooldownMin * freqScale,
      WIND_GUST_CONFIG.cooldownMax * freqScale,
    );
    return;
  }

  // Smooth attack -> organic turbulent sustain -> smooth decay envelope
  const u = Math.max(0, Math.min(1, state.elapsed / Math.max(0.1, state.duration)));
  const attack = smoothstep01(u / 0.22);
  const decay = smoothstep01((1 - u) / 0.3);
  const baseEnv = attack * decay;
  // Subtle internal turbulent ripple during the gust plateau so it feels like real mountain wind
  const ripple = 0.88 + 0.12 * Math.sin(u * Math.PI * 5.0 + state.gustCount * 1.7);

  state.intensity = Math.max(0, Math.min(1, baseEnv * ripple * state.peakStrength));
  state.signedForce = state.direction * state.intensity;
}

/**
 * Compute lateral crosswind steering push acceleration (m/s^2) acting on Lofi's snowboard.
 * Returns exact 0 when no gust is active.
 */
export function getWindGustSteeringAccel(
  state: Readonly<WindGustState>,
  levelNumber: number,
  airborne: boolean,
): number {
  if (!state.active || state.intensity <= 0.001) {
    return 0;
  }
  const levelScale =
    1 + Math.max(0, Math.min(9, levelNumber - 1)) * WIND_GUST_CONFIG.levelStrengthBonus;
  const airScale = airborne ? WIND_GUST_CONFIG.airbornePushFactor : 1.0;
  return state.signedForce * WIND_GUST_CONFIG.baseSteeringPushAccel * levelScale * airScale;
}

/**
 * Camera screen-shake is disabled for steady, vibration-free gameplay readability.
 * Always writes and returns exact zeros with zero allocations.
 */
export function computeWindGustCameraShake(
  _gustIntensity: number,
  _gustDirection: number,
  _time: number,
  _isPortrait: boolean,
  out: WindGustCameraShakeOut = {
    offsetX: 0,
    offsetY: 0,
    lookOffsetX: 0,
    lookOffsetY: 0,
  },
): WindGustCameraShakeOut {
  out.offsetX = 0;
  out.offsetY = 0;
  out.lookOffsetX = 0;
  out.lookOffsetY = 0;
  return out;
}

/**
 * Compute particle-pushing wind velocities (m/s) applied to ambient snowfall and 3D snow spray.
 */
export function computeWindGustParticlePush(
  signedForce: number,
  out: WindGustParticlePushOut = {
    snowfallPushX: 0,
    snowfallPushZ: 0,
    sprayPushX: 0,
    sprayPushZ: 0,
    flutterBoost: 0,
  },
): WindGustParticlePushOut {
  const clamped = Math.max(-1, Math.min(1, signedForce));
  const mag = Math.abs(clamped);
  if (mag <= 0.002) {
    out.snowfallPushX = 0;
    out.snowfallPushZ = 0;
    out.sprayPushX = 0;
    out.sprayPushZ = 0;
    out.flutterBoost = 0;
    return out;
  }

  out.snowfallPushX = clamped * WIND_GUST_CONFIG.snowfallPushSpeedX;
  out.snowfallPushZ = mag * WIND_GUST_CONFIG.snowfallPushSpeedZ;
  out.sprayPushX = clamped * WIND_GUST_CONFIG.sprayPushSpeedX;
  out.sprayPushZ = mag * WIND_GUST_CONFIG.sprayPushSpeedZ;
  out.flutterBoost = mag * 1.45;
  return out;
}
