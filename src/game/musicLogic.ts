import type { GamePhase } from './types';

export interface BgmTrackEntry {
  readonly id: number;
  readonly src: string;
}

/**
 * Official continuous 2-track background music playlist for LOFI ICE ESCAPE.
 * Track 1 plays first; when it finishes naturally, Track 2 plays automatically;
 * when Track 2 finishes naturally, playback loops back to Track 1.
 * Level completions and level transitions never interrupt or reset the active song.
 */
export const BGM_TRACK_SRC = '/assets/aistudio/2_53b010d2.mp3' as const;
export const BGM_SECOND_TRACK_SRC =
  '/assets/aistudio/kontraa-false-alarm-future-bounce-music-254837_f0565bf5.mp3' as const;

export const BGM_PLAYLIST: readonly BgmTrackEntry[] = [
  { id: 1, src: BGM_TRACK_SRC },
  { id: 2, src: BGM_SECOND_TRACK_SRC },
] as const;

/**
 * Custom MP3 sound effects for key gameplay events:
 * - gameOver: played when Lofi is caught by the avalanche or crashes out
 * - collectible: played when picking up a Lil Yeti collectible item on the road
 * - finish: celebratory fanfare played when Lofi reaches the shelter
 */
export const SFX_TRACK_SRCS = {
  gameOver:
    '/assets/aistudio/freesound_community-negative_beeps-6008_1ac25b4a.mp3',
  collectible:
    '/assets/aistudio/freesound_gamestudio-bar-increase-cartoon-funny-jump-384919_f3db9b8f.mp3',
  finish:
    '/assets/aistudio/freesound_community-tada-fanfare-a-6313_5fa556d6.mp3',
} as const;

export type SfxClipKey = keyof typeof SFX_TRACK_SRCS;

export interface SfxClipConfig {
  readonly key: SfxClipKey;
  readonly src: string;
  readonly volume: number;
  readonly duckPeak: number;
  readonly duckDurationMs: number;
}

export const SFX_CLIP_CONFIG: Readonly<Record<SfxClipKey, SfxClipConfig>> = {
  gameOver: {
    key: 'gameOver',
    src: SFX_TRACK_SRCS.gameOver,
    volume: 0.34,
    duckPeak: 0.75,
    duckDurationMs: 1200,
  },
  collectible: {
    key: 'collectible',
    src: SFX_TRACK_SRCS.collectible,
    volume: 0.28,
    duckPeak: 0.25,
    duckDurationMs: 360,
  },
  finish: {
    key: 'finish',
    src: SFX_TRACK_SRCS.finish,
    volume: 0.38,
    duckPeak: 0.65,
    duckDurationMs: 1500,
  },
} as const;

export function getSfxClipConfig(key: SfxClipKey): SfxClipConfig {
  return SFX_CLIP_CONFIG[key];
}

export function computeSfxClipVolume(key: SfxClipKey, muted: boolean): number {
  if (muted) return 0;
  return Math.max(0, Math.min(1, SFX_CLIP_CONFIG[key].volume));
}

export interface BgmPlaylistState {
  currentIndex: number;
  trackSrc: string;
}

/**
 * Re-audited audio mix configuration:
 * Keeps the continuous soundtrack clear, warm, and present while moderating
 * spatial snow/wind loops and one-shot SFX so sound effects feel soft, crisp,
 * and pleasant without overpowering or pumping the background music.
 */
export const BGM_VOLUME_CONFIG = {
  /** Clear, balanced gameplay music bed that stays present alongside snow & action SFX */
  playingBase: 0.3,
  /** Subtle extra energy as the avalanche closes in (max 0.35) */
  playingDangerBoost: 0.05,
  /** Gentle audible level while paused */
  paused: 0.11,
  /** Warm celebratory level during shelter victory arrival (keeps active song playing) */
  victory: 0.16,
  /** Silent on title screen & Game Over */
  silent: 0,
  /** Gentle, musical sidechain dip (max 18%) on prominent SFX so BGM stays smooth without pumping */
  maxSfxDuckReduction: 0.18,
} as const;

/** Softened SFX gain multipliers keeping spatial loops & one-shots gentle below the music bed. */
export const SFX_MIX_CONFIG = {
  /** Softened spatial AudioListener master gain for snow crunch, wind, avalanche, and one-shots */
  spatialMasterGain: 0.46,
  /** Reduced one-shot SFX bus gain into a soft DynamicsCompressor safety limiter */
  oneShotBusGain: 0.55,
} as const;

/** Normalize a playlist index cleanly within BGM_PLAYLIST bounds. */
export function normalizeBgmTrackIndex(index: number): number {
  const len = BGM_PLAYLIST.length;
  if (len <= 0) return 0;
  const safe = Number.isFinite(index) ? Math.floor(index) : 0;
  return ((safe % len) + len) % len;
}

/** Create initial playlist state starting on Track 1 (index 0). */
export function createBgmPlaylistState(initialIndex = 0): BgmPlaylistState {
  const idx = normalizeBgmTrackIndex(initialIndex);
  return {
    currentIndex: idx,
    trackSrc: BGM_PLAYLIST[idx].src,
  };
}

/**
 * Preserves the currently playing track index across level transitions so finishing
 * a level never restarts or forces a track switch mid-song.
 */
export function getBgmTrackIndexForLevel(
  _levelNumber: number,
  currentIndex = 0,
): number {
  return normalizeBgmTrackIndex(currentIndex);
}

/** Advances sequentially through BGM_PLAYLIST and wraps back to Track 1 (0 -> 1 -> 0). */
export function getNextBgmTrackIndex(currentIndex: number): number {
  const len = BGM_PLAYLIST.length;
  if (len <= 0) return 0;
  return (normalizeBgmTrackIndex(currentIndex) + 1) % len;
}

/** Advance playlist state in place when the current track finishes naturally (`ended`). */
export function advanceBgmPlaylistOnEnded(
  state: BgmPlaylistState,
): BgmPlaylistState {
  const nextIndex = getNextBgmTrackIndex(state.currentIndex);
  state.currentIndex = nextIndex;
  state.trackSrc = BGM_PLAYLIST[nextIndex].src;
  return state;
}

/** Reset playlist state back to Track 1 (only when returning to the main title screen). */
export function resetBgmPlaylistState(state: BgmPlaylistState): BgmPlaylistState {
  state.currentIndex = 0;
  state.trackSrc = BGM_PLAYLIST[0].src;
  return state;
}

/**
 * Only returning to the title screen resets the soundtrack to Track 1.
 * Level completion (`victory`), pausing, and advancing to the next level keep the
 * current song playing uninterrupted until it finishes naturally.
 */
export function shouldResetBgmOnPhaseChange(phase: GamePhase): boolean {
  return phase === 'title';
}

/**
 * Compute target BGM volume (0..1) from live game phase, mute state, avalanche danger,
 * and optional active SFX sidechain ducking intensity (`sfxDuckAmount` in [0, 1]).
 */
export function computeBgmTargetVolume(
  phase: GamePhase,
  muted: boolean,
  avalancheDanger: number,
  sfxDuckAmount = 0,
): number {
  if (muted) return BGM_VOLUME_CONFIG.silent;
  const clampedDanger = Math.max(0, Math.min(1, avalancheDanger));
  const clampedDuck = Math.max(0, Math.min(1, sfxDuckAmount));
  const duckMultiplier = 1 - clampedDuck * BGM_VOLUME_CONFIG.maxSfxDuckReduction;

  let baseVolume = 0;
  switch (phase) {
    case 'playing':
      baseVolume =
        BGM_VOLUME_CONFIG.playingBase +
        clampedDanger * BGM_VOLUME_CONFIG.playingDangerBoost;
      break;
    case 'paused':
      baseVolume = BGM_VOLUME_CONFIG.paused;
      break;
    case 'victory':
      baseVolume = BGM_VOLUME_CONFIG.victory;
      break;
    case 'gameover':
    case 'title':
    default:
      return BGM_VOLUME_CONFIG.silent;
  }

  return Number((baseVolume * duckMultiplier).toFixed(4));
}

/**
 * Compute remaining 0..1 SFX ducking envelope based on current timestamp (ms)
 * and the duck hold/release window.
 */
export function computeActiveSfxDuck(
  nowMs: number,
  duckPeak: number,
  duckStartMs: number,
  duckDurationMs: number,
): number {
  if (duckPeak <= 0 || duckDurationMs <= 0) return 0;
  const elapsed = nowMs - duckStartMs;
  if (elapsed <= 0) return Math.max(0, Math.min(1, duckPeak));
  if (elapsed >= duckDurationMs) return 0;
  const progress = elapsed / duckDurationMs;
  // Hold briefly on attack (first 25%), then release smoothly via quadratic ease-out
  if (progress <= 0.25) return Math.max(0, Math.min(1, duckPeak));
  const releaseT = (progress - 0.25) / 0.75;
  return Math.max(0, Math.min(1, duckPeak * (1 - releaseT) * (1 - releaseT)));
}
