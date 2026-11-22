/**
 * Pure, deterministic calculations for Lofi Ice Escape's atmospheric spatial audio:
 * - Soft, breathing alpine mountain wind (Three.js PositionalAudio around Lofi)
 * - Continuous snowboard-on-snow friction + granular "crunchy" packed-snow crystal contact layer
 * - Trailing avalanche spatial rumble
 * Zero DOM/WebGL dependencies so all curves and procedural buffers are unit-tested via node:test.
 */

export interface AmbientAudioInput {
  active: boolean;
  muted: boolean;
  /** Ratio of current forwardSpeed to levelBaseSpeed (typically 0.4..1.25). */
  speedRatio: number;
  /** Absolute forward speed in m/s. */
  forwardSpeed: number;
  /** Carving intensity in [0, 1] (0 when straight or airborne). */
  carveIntensity: number;
  /** Normalized avalanche danger in [0, 1]. */
  avalancheDanger: number;
  /** True while Lofi is airborne off a ramp or manual jump. */
  airborne: boolean;
  /** Signed visual carving lean in [-1, 1] for subtle stereo wind drift. */
  lean: number;
  /** Height above snow ground in meters. */
  heightAboveGround: number;
  /** Optional 0..1 intensity when edging along a raised snowbank wall. */
  edgeScrape?: number;
  /** Optional 0..1 randomized crosswind gust intensity for subtle spatial wind swell. */
  windGustIntensity?: number;
  /** Optional signed crosswind direction (-1 = left, +1 = right) for stereo wind shift. */
  windGustDirection?: number;
}

export interface AmbientAudioTargets {
  /** Gain for soft atmospheric mountain wind PositionalAudio (0..0.38). */
  windGain: number;
  /** Lowpass cutoff frequency in Hz for soft alpine mountain wind. */
  windFilterFreq: number;
  /** Playback rate multiplier for mountain wind pitch/rush feel. */
  windPlaybackRate: number;
  /** Lateral world-space X offset for the wind PositionalAudio anchor (meters). */
  windOffsetX: number;
  /** Gain for continuous snowboard-on-snow glide PositionalAudio (0 when airborne). */
  snowGain: number;
  /** Bandpass center frequency in Hz for snow friction & carving scrape. */
  snowFilterFreq: number;
  /** Playback rate multiplier for snow friction texture. */
  snowPlaybackRate: number;
  /** Gain for dedicated granular "crunchy" snow-crystal contact PositionalAudio (0 when airborne). */
  snowCrunchGain: number;
  /** Bandpass center frequency in Hz for crisp snow-crystal crunch presence. */
  snowCrunchFreq: number;
  /** Playback rate multiplier for crunchy snow crystal grain speed. */
  snowCrunchPlaybackRate: number;
  /** Gain for trailing avalanche rumble PositionalAudio. */
  avalancheGain: number;
  /** Lowpass cutoff frequency in Hz for trailing avalanche rumble. */
  avalancheFilterFreq: number;
}

export const AMBIENT_AUDIO_CONFIG = {
  /** Reference cruise speed in m/s corresponding to speedNorm = 1.0. */
  refCruiseSpeed: 26.0,
  /** Speed below which snow contact fades smoothly toward silence. */
  minAudibleSpeed: 2.0,
  /** Gentle, unobtrusive mountain breeze floor during active gameplay. */
  windBaseGain: 0.065,
  windMaxGain: 0.165,
  windAirborneBoost: 0.045,
  windMinFreq: 260,
  windMaxFreq: 1020,
  /** Balanced continuous snow glide & granular crunch contact gains (tactile without masking BGM). */
  snowBaseGain: 0.035,
  snowSpeedGain: 0.075,
  snowCarveBonusGain: 0.135,
  snowMinFreq: 760,
  snowMaxFreq: 2350,
  crunchBaseGain: 0.045,
  crunchSpeedGain: 0.085,
  crunchCarveBonusGain: 0.175,
  crunchMinFreq: 1180,
  crunchMaxFreq: 2800,
  avalancheThreshold: 0.12,
  avalancheMaxGain: 0.24,
  /** PositionalAudio distance tuning (meters). */
  windRefDistance: 12,
  windMaxDistance: 120,
  snowRefDistance: 8,
  snowMaxDistance: 72,
  avalancheRefDistance: 9,
  avalancheMaxDistance: 85,
} as const;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Compute target gains, filter cutoffs, playback rates, and spatial anchor offset
 * for Three.js PositionalAudio mountain wind, snow friction, crunchy snow crystals, and avalanche rumble.
 */
export function computeAmbientAudioTargets(
  input: AmbientAudioInput,
): AmbientAudioTargets {
  if (!input.active || input.muted) {
    return {
      windGain: 0,
      windFilterFreq: AMBIENT_AUDIO_CONFIG.windMinFreq,
      windPlaybackRate: 0.9,
      windOffsetX: 0,
      snowGain: 0,
      snowFilterFreq: AMBIENT_AUDIO_CONFIG.snowMinFreq,
      snowPlaybackRate: 0.9,
      snowCrunchGain: 0,
      snowCrunchFreq: AMBIENT_AUDIO_CONFIG.crunchMinFreq,
      snowCrunchPlaybackRate: 0.92,
      avalancheGain: 0,
      avalancheFilterFreq: 120,
    };
  }

  const speed = Math.max(0, input.forwardSpeed);
  const speedNorm = clamp(
    (speed - AMBIENT_AUDIO_CONFIG.minAudibleSpeed) /
      (AMBIENT_AUDIO_CONFIG.refCruiseSpeed - AMBIENT_AUDIO_CONFIG.minAudibleSpeed),
    0,
    1.35,
  );
  const speedRatioClamped = clamp(input.speedRatio, 0, 1.35);
  const effectiveSpeed = clamp(speedNorm * 0.6 + speedRatioClamped * 0.4, 0, 1.35);
  const carve = input.airborne ? 0 : clamp(input.carveIntensity, 0, 1);
  const edgeScrape = input.airborne ? 0 : clamp(input.edgeScrape ?? 0, 0, 1);
  const altitudeFactor = input.airborne
    ? clamp(input.heightAboveGround / 4.5, 0, 1)
    : 0;

  const gustIntensity = clamp(input.windGustIntensity ?? 0, 0, 1);
  const gustDirection = clamp(input.windGustDirection ?? 0, -1, 1);

  // 1. Soft Atmospheric Mountain Wind: gentle soothing alpine breeze that swells smoothly with speed, jump air & gusts
  const windCurve = Math.pow(Math.min(1.25, effectiveSpeed), 1.25);
  const windGain = clamp(
    AMBIENT_AUDIO_CONFIG.windBaseGain +
      windCurve * (AMBIENT_AUDIO_CONFIG.windMaxGain - AMBIENT_AUDIO_CONFIG.windBaseGain) +
      altitudeFactor * AMBIENT_AUDIO_CONFIG.windAirborneBoost +
      gustIntensity * 0.075,
    0,
    0.29,
  );
  const windFilterFreq =
    AMBIENT_AUDIO_CONFIG.windMinFreq +
    clamp(effectiveSpeed, 0, 1.25) *
      (AMBIENT_AUDIO_CONFIG.windMaxFreq - AMBIENT_AUDIO_CONFIG.windMinFreq) +
    altitudeFactor * 240 +
    gustIntensity * 360;
  const windPlaybackRate = clamp(
    0.82 + effectiveSpeed * 0.34 + altitudeFactor * 0.08 + gustIntensity * 0.14,
    0.75,
    1.52,
  );
  // Subtle lateral drift so carving turns & crosswind gusts pan the mountain breeze gently across stereo space
  const windOffsetX = clamp(input.lean, -1, 1) * 2.8 - gustDirection * gustIntensity * 3.4;

  // 2. Continuous Snow Glide Friction: strictly grounded (0 when airborne)
  const contactCarve = clamp(carve + edgeScrape * 0.45, 0, 1.15);
  const snowGain = input.airborne
    ? 0
    : clamp(
        effectiveSpeed > 0.02
          ? AMBIENT_AUDIO_CONFIG.snowBaseGain * Math.min(1, effectiveSpeed * 2.5) +
              effectiveSpeed * AMBIENT_AUDIO_CONFIG.snowSpeedGain +
              contactCarve * effectiveSpeed * AMBIENT_AUDIO_CONFIG.snowCarveBonusGain
          : 0,
        0,
        0.28,
      );
  const snowFilterFreq =
    AMBIENT_AUDIO_CONFIG.snowMinFreq +
    clamp(effectiveSpeed, 0, 1.25) * 440 +
    contactCarve * (AMBIENT_AUDIO_CONFIG.snowMaxFreq - AMBIENT_AUDIO_CONFIG.snowMinFreq - 440);
  const snowPlaybackRate = clamp(
    0.82 + effectiveSpeed * 0.3 + contactCarve * 0.16,
    0.75,
    1.48,
  );

  // 3. Granular "Crunchy" Snow-Crystal Contact Layer: crisp tactile crunch whenever snowboard touches snow
  const snowCrunchGain = input.airborne
    ? 0
    : clamp(
        effectiveSpeed > 0.02
          ? AMBIENT_AUDIO_CONFIG.crunchBaseGain * Math.min(1, effectiveSpeed * 2.2) +
              effectiveSpeed * AMBIENT_AUDIO_CONFIG.crunchSpeedGain +
              contactCarve * Math.max(0.45, effectiveSpeed) * AMBIENT_AUDIO_CONFIG.crunchCarveBonusGain
          : 0,
        0,
        0.36,
      );
  const snowCrunchFreq =
    AMBIENT_AUDIO_CONFIG.crunchMinFreq +
    clamp(effectiveSpeed, 0, 1.25) * 460 +
    contactCarve * (AMBIENT_AUDIO_CONFIG.crunchMaxFreq - AMBIENT_AUDIO_CONFIG.crunchMinFreq - 460);
  const snowCrunchPlaybackRate = clamp(
    0.78 + effectiveSpeed * 0.38 + contactCarve * 0.22,
    0.72,
    1.55,
  );

  // 4. Trailing Avalanche Spatial Rumble
  const danger = clamp(input.avalancheDanger, 0, 1);
  const avalancheNorm =
    danger > AMBIENT_AUDIO_CONFIG.avalancheThreshold
      ? (danger - AMBIENT_AUDIO_CONFIG.avalancheThreshold) /
        (1 - AMBIENT_AUDIO_CONFIG.avalancheThreshold)
      : 0;
  const avalancheGain = avalancheNorm * avalancheNorm * AMBIENT_AUDIO_CONFIG.avalancheMaxGain;
  const avalancheFilterFreq = 115 + avalancheNorm * 135;

  return {
    windGain,
    windFilterFreq,
    windPlaybackRate,
    windOffsetX,
    snowGain,
    snowFilterFreq,
    snowPlaybackRate,
    snowCrunchGain,
    snowCrunchFreq,
    snowCrunchPlaybackRate,
    avalancheGain,
    avalancheFilterFreq,
  };
}

/**
 * Fill a mono sample array with seamless loopable soft atmospheric mountain wind
 * (warm pink/brown alpine air blend + slow organic breathing gusts, cross-faded at seam).
 */
export function fillAlpineWindSamples(out: Float32Array, seed = 1337): void {
  const n = out.length;
  if (n === 0) return;

  let s = seed >>> 0;
  const nextRand = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };

  // Paul Kellet pink-noise + warm brown-air smoother for gentle, soothing alpine breeze
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let brown = 0;

  for (let i = 0; i < n; i++) {
    const white = nextRand();
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;

    brown = clamp(brown * 0.985 + white * 0.045, -1, 1);

    // Gentle organic mountain gust breathing (integer cycle count for seamless wrap)
    const phase = (i / n) * Math.PI * 2;
    const gust =
      0.74 +
      0.17 * Math.sin(phase * 2) +
      0.09 * Math.sin(phase * 3 + 1.1) * Math.cos(phase);
    const softAir = pink * 0.72 + brown * 0.42;
    out[i] = clamp(softAir * gust, -1, 1);
  }

  // Smooth loop-seam crossfade (last 5% blended into start)
  const fadeLen = Math.min(Math.floor(n * 0.05), 2048);
  for (let i = 0; i < fadeLen; i++) {
    const t = i / fadeLen;
    const endIdx = n - fadeLen + i;
    out[endIdx] = out[endIdx] * (1 - t) + out[i] * t;
  }
}

/**
 * Fill a mono sample array with seamless loopable crisp snow-friction grain noise
 * evoking a snowboard base gliding over groomed winter snow.
 */
export function fillSnowFrictionSamples(out: Float32Array, seed = 4242): void {
  const n = out.length;
  if (n === 0) return;

  let s = seed >>> 0;
  const nextRand = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };

  let prev = 0;
  for (let i = 0; i < n; i++) {
    const white = nextRand();
    // Subtle differentiation emphasizes crisp snow crystals without harsh aliasing
    const crisp = white * 0.72 - prev * 0.28;
    prev = white;

    // Micro-granular surface ripple (integer cycles for seamless looping)
    const phase = (i / n) * Math.PI * 2;
    const grain = 0.84 + 0.16 * Math.sin(phase * 13) * Math.cos(phase * 5);
    out[i] = clamp(crisp * grain * 0.84, -1, 1);
  }

  const fadeLen = Math.min(Math.floor(n * 0.05), 2048);
  for (let i = 0; i < fadeLen; i++) {
    const t = i / fadeLen;
    const endIdx = n - fadeLen + i;
    out[endIdx] = out[endIdx] * (1 - t) + out[i] * t;
  }
}

/**
 * Fill a mono sample array with seamless loopable granular "crunchy" packed-snow crystal bursts:
 * layers hundreds of crisp short micro-fracture snow grains (4-15ms envelopes) with cyclic wrap
 * so gliding and carving on snow produces a tactile, crunchy winter-snow texture instead of flat hiss.
 */
export function fillSnowCrunchSamples(
  out: Float32Array,
  sampleRate = 44100,
  seed = 9001,
): void {
  const n = out.length;
  if (n === 0) return;
  out.fill(0);

  let s = seed >>> 0;
  const nextUnit = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };

  // Light underlying granular bed so crunch never feels hollow between bursts
  let prevBed = 0;
  for (let i = 0; i < n; i++) {
    const w = nextUnit() * 2 - 1;
    const hp = w * 0.65 - prevBed * 0.35;
    prevBed = w;
    out[i] = hp * 0.16;
  }

  // Scatter dense organic ice-crystal crunch micro-grains (~75 grains per second)
  const durationSec = Math.max(0.2, n / Math.max(8000, sampleRate));
  const grainCount = Math.max(24, Math.floor(durationSec * 78));

  for (let g = 0; g < grainCount; g++) {
    const startIdx = Math.floor(nextUnit() * n);
    const grainSec = 0.0045 + nextUnit() * 0.012; // 4.5ms .. 16.5ms snappy crunch grain
    const grainLen = Math.max(16, Math.floor(grainSec * sampleRate));
    const attackLen = Math.max(3, Math.floor(grainLen * 0.16));
    const amp = 0.24 + nextUnit() * 0.56;
    // Resonant crystal fracture tone mixed with band-limited noise impulse
    const resonantFreq = 950 + nextUnit() * 2100;
    const omega = (Math.PI * 2 * resonantFreq) / Math.max(8000, sampleRate);
    let prevNoise = 0;

    for (let j = 0; j < grainLen; j++) {
      const env =
        j < attackLen
          ? j / attackLen
          : Math.exp(-((j - attackLen) / Math.max(1, grainLen - attackLen)) * 4.2);
      const raw = nextUnit() * 2 - 1;
      const crispNoise = raw * 0.78 - prevNoise * 0.22;
      prevNoise = raw;
      const crystalPing = Math.sin(j * omega) * 0.28;
      const sample = (crispNoise * 0.85 + crystalPing) * env * amp;
      const idx = (startIdx + j) % n;
      out[idx] += sample;
    }
  }

  // Soft saturation & loop-seam crossfade for click-free seamless looping
  for (let i = 0; i < n; i++) {
    out[i] = Math.tanh(out[i] * 1.15);
  }
  const fadeLen = Math.min(Math.floor(n * 0.05), 2048);
  for (let i = 0; i < fadeLen; i++) {
    const t = i / fadeLen;
    const endIdx = n - fadeLen + i;
    out[endIdx] = out[endIdx] * (1 - t) + out[i] * t;
  }
}
