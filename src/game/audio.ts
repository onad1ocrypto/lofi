import * as THREE from 'three';
import {
  AMBIENT_AUDIO_CONFIG,
  computeAmbientAudioTargets,
  fillAlpineWindSamples,
  fillSnowCrunchSamples,
  fillSnowFrictionSamples,
} from './ambientAudioLogic';
import {
  SFX_MIX_CONFIG,
  advanceBgmPlaylistOnEnded,
  computeActiveSfxDuck,
  computeBgmTargetVolume,
  createBgmPlaylistState,
  resetBgmPlaylistState,
  shouldResetBgmOnPhaseChange,
} from './musicLogic';
import type { GamePhase } from './types';

/**
 * Spatial Web Audio & Three.js PositionalAudio soundscape + single looping MP3 BGM for LOFI ICE ESCAPE:
 * - Three.js `AudioListener` attached to the active gameplay `Camera`.
 * - Spatial `THREE.PositionalAudio` soft alpine mountain wind emitter floating around Lofi,
 *   dynamically scaling volume, warmth, pitch, and stereo drift with speed & altitude.
 * - Dual-layer spatial snow-contact emitters attached directly to Lofi's snowboard:
 *   1) Continuous snow-glide friction (`snowAudio`)
 *   2) Dedicated granular "crunchy" snow-crystal contact texture (`snowCrunchAudio`)
 *   Both scale crisply with forward speed, carving, and snowbank edging, and silence cleanly while airborne.
 * - Spatial `THREE.PositionalAudio` trailing avalanche rumble positioned behind Lofi in 3D space.
 * - Tactile one-shot procedural SFX (multi-grain crunchy snow landing, sharp carve edge crunch,
 *   obstacle thud, jump takeoff, victory, game over) sharing one Web Audio context and master volume.
 */

export interface GameAudioSceneRig {
  camera: THREE.Camera;
  scene: THREE.Scene;
  lofiRoot: THREE.Object3D;
}

export interface ContinuousAudioUpdate {
  active: boolean;
  speedRatio: number;
  forwardSpeed: number;
  carveIntensity: number;
  avalancheDanger: number;
  airborne?: boolean;
  lean?: number;
  heightAboveGround?: number;
  edgeScrape?: number;
  playerX?: number;
  playerY?: number;
  playerZ?: number;
  avalancheX?: number;
  avalancheY?: number;
  avalancheZ?: number;
  windGustIntensity?: number;
  windGustDirection?: number;
}

export interface GameAudio {
  unlock: () => void;
  setMuted: (muted: boolean) => void;
  isMuted: () => boolean;
  isSpatialReady: () => boolean;
  updateContinuous: (params: ContinuousAudioUpdate) => void;
  syncBackgroundMusic: (
    phase: GamePhase,
    levelNumber: number,
    avalancheDanger?: number,
  ) => void;
  playCarveCrunch: (intensity: number) => void;
  playHit: (kind: 'rock' | 'pine' | 'fallen_log') => void;
  playTakeoff: () => void;
  playGrab: () => void;
  playLanding: (withGrab: boolean, multiplier?: number) => void;
  playRescue: () => void;
  playVictory: () => void;
  playGameOver: () => void;
  silenceLoops: () => void;
  dispose: () => void;
}

export function createGameAudio(rig: GameAudioSceneRig): GameAudio {
  const { camera, scene, lofiRoot } = rig;

  let muted = false;
  let unlocked = false;
  let disposed = false;
  let lastCarveCrunchTime = -1;

  let listener: THREE.AudioListener | null = null;
  let ctx: AudioContext | null = null;

  // Spatial 3D anchors & Three.js PositionalAudio nodes
  const windAnchor = new THREE.Object3D();
  windAnchor.name = 'AmbientMountainWindAnchor';
  const avalancheAnchor = new THREE.Object3D();
  avalancheAnchor.name = 'AvalancheRumbleAnchor';

  let windAudio: THREE.PositionalAudio | null = null;
  let windFilter: BiquadFilterNode | null = null;

  let snowAudio: THREE.PositionalAudio | null = null;
  let snowFilter: BiquadFilterNode | null = null;

  let snowCrunchAudio: THREE.PositionalAudio | null = null;
  let snowCrunchFilter: BiquadFilterNode | null = null;

  let avalancheAudio: THREE.PositionalAudio | null = null;
  let avalancheFilter: BiquadFilterNode | null = null;

  // Shared procedural buffers (synthesized once at init/unlock, zero per-frame allocations)
  let windBuffer: AudioBuffer | null = null;
  let snowBuffer: AudioBuffer | null = null;
  let snowCrunchBuffer: AudioBuffer | null = null;
  let oneShotNoiseBuffer: AudioBuffer | null = null;

  // Dedicated boosted one-shot SFX bus + soft DynamicsCompressor limiter (bold SFX, zero clipping)
  let sfxBusGain: GainNode | null = null;
  let sfxLimiter: DynamicsCompressorNode | null = null;

  // Continuous 2-track MP3 background music controller (Track 1 -> Track 2 -> Track 1 on natural ended)
  // Level completion & level transitions keep the active song playing without interrupting or resetting.
  const bgmPlaylist = createBgmPlaylistState(0);
  let bgmElement: HTMLAudioElement | null = null;
  let bgmPhase: GamePhase = 'title';
  let bgmDanger = 0;
  let bgmInitializedOnce = false;
  let sfxDuckPeak = 0;
  let sfxDuckStartMs = 0;
  let sfxDuckDurationMs = 0;

  const getNowMs = (): number =>
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  const triggerSfxDuck = (peak: number, durationMs: number) => {
    const nowMs = getNowMs();
    const current = computeActiveSfxDuck(
      nowMs,
      sfxDuckPeak,
      sfxDuckStartMs,
      sfxDuckDurationMs,
    );
    if (peak >= current * 0.9) {
      sfxDuckPeak = Math.max(0, Math.min(1, peak));
      sfxDuckStartMs = nowMs;
      sfxDuckDurationMs = durationMs;
    }
    if (bgmElement && unlocked && !muted && !bgmElement.paused) {
      const targetVol = computeBgmTargetVolume(
        bgmPhase,
        muted,
        bgmDanger,
        sfxDuckPeak,
      );
      bgmElement.volume = Math.max(0, Math.min(1, Math.min(bgmElement.volume, targetVol)));
    }
  };

  const handleBgmEnded = () => {
    if (disposed || !bgmElement) return;
    advanceBgmPlaylistOnEnded(bgmPlaylist);
    bgmElement.loop = false;
    bgmElement.src = bgmPlaylist.trackSrc;
    try {
      bgmElement.currentTime = 0;
    } catch {
      // Ignore seek errors before metadata loads
    }

    const activeDuck = computeActiveSfxDuck(
      getNowMs(),
      sfxDuckPeak,
      sfxDuckStartMs,
      sfxDuckDurationMs,
    );
    const targetVol = computeBgmTargetVolume(bgmPhase, muted, bgmDanger, activeDuck);
    bgmElement.muted = muted;

    if (unlocked && !muted && targetVol > 0.001) {
      bgmElement.volume = Math.max(0, Math.min(1, targetVol));
      bgmElement.play().catch(() => {});
    }
  };

  const ensureBgmElement = (): HTMLAudioElement | null => {
    if (disposed || typeof window === 'undefined' || typeof Audio === 'undefined') {
      return null;
    }
    if (!bgmElement) {
      try {
        const el = new Audio(bgmPlaylist.trackSrc);
        el.preload = 'none';
        // Never single-track loop: allow natural `ended` event to advance Track 1 -> Track 2 -> Track 1
        el.loop = false;
        el.volume = 0;
        el.muted = muted;
        el.addEventListener('ended', handleBgmEnded);
        bgmElement = el;
      } catch {
        return null;
      }
    }
    return bgmElement;
  };

  const applyBackgroundMusic = (
    phase: GamePhase,
    _levelNumber: number,
    avalancheDanger = 0,
  ) => {
    bgmPhase = phase;
    bgmDanger = avalancheDanger;
    bgmInitializedOnce = true;

    const activeDuck = computeActiveSfxDuck(
      getNowMs(),
      sfxDuckPeak,
      sfxDuckStartMs,
      sfxDuckDurationMs,
    );
    const targetVol = computeBgmTargetVolume(phase, muted, avalancheDanger, activeDuck);

    if (disposed || !unlocked) return;

    const el = ensureBgmElement();
    if (!el) return;

    // Never force a track switch on level changes or level completion; only sync src if unset/out-of-sync
    if (!el.src || !el.src.endsWith(bgmPlaylist.trackSrc)) {
      el.src = bgmPlaylist.trackSrc;
      el.loop = false;
      el.currentTime = 0;
    } else if (el.loop) {
      el.loop = false;
    }

    el.muted = muted;

    if (targetVol <= 0.001) {
      el.volume = 0;
      if (!el.paused) {
        el.pause();
      }
      if (shouldResetBgmOnPhaseChange(phase)) {
        resetBgmPlaylistState(bgmPlaylist);
        if (!el.src || !el.src.endsWith(bgmPlaylist.trackSrc)) {
          el.src = bgmPlaylist.trackSrc;
        }
        try {
          el.currentTime = 0;
        } catch {
          // Ignore seek errors before metadata loads
        }
      }
      return;
    }

    // If the active track already finished while paused/muted, advance seamlessly to the next track
    if (el.ended) {
      advanceBgmPlaylistOnEnded(bgmPlaylist);
      el.src = bgmPlaylist.trackSrc;
      el.loop = false;
      try {
        el.currentTime = 0;
      } catch {
        // Ignore seek errors before metadata loads
      }
    }

    // Smooth musical duck-down & release so BGM stays clear and steady
    const rampRate = targetVol < el.volume ? 0.3 : 0.18;
    const nextVol =
      Math.abs(el.volume - targetVol) < 0.005
        ? targetVol
        : el.volume + (targetVol - el.volume) * rampRate;
    el.volume = Math.max(0, Math.min(1, nextVol));

    if (el.paused) {
      el.play().catch(() => {});
    }
  };

  const ensureSpatialGraph = (): AudioContext | null => {
    if (disposed || typeof window === 'undefined') return null;

    if (!listener) {
      try {
        listener = new THREE.AudioListener();
        camera.add(listener);
        ctx = listener.context;
        listener.setMasterVolume(muted ? 0 : SFX_MIX_CONFIG.spatialMasterGain);

        // Dedicated one-shot SFX bus with gentle compressor limiter so SFX stay clean & balanced
        sfxBusGain = ctx.createGain();
        sfxBusGain.gain.value = SFX_MIX_CONFIG.oneShotBusGain;
        sfxLimiter = ctx.createDynamicsCompressor();
        sfxLimiter.threshold.value = -8;
        sfxLimiter.knee.value = 12;
        sfxLimiter.ratio.value = 6;
        sfxLimiter.attack.value = 0.004;
        sfxLimiter.release.value = 0.12;
        sfxBusGain.connect(sfxLimiter);
        sfxLimiter.connect(listener.getInput());

        const sampleRate = ctx.sampleRate;

        // 1. Procedural seamless 4s soft alpine mountain wind buffer
        windBuffer = ctx.createBuffer(1, Math.floor(sampleRate * 4.0), sampleRate);
        fillAlpineWindSamples(windBuffer.getChannelData(0), 1337);

        // 2. Procedural seamless 2.5s crisp snow-glide friction buffer
        snowBuffer = ctx.createBuffer(1, Math.floor(sampleRate * 2.5), sampleRate);
        fillSnowFrictionSamples(snowBuffer.getChannelData(0), 4242);

        // 3. Procedural seamless 2.5s granular "crunchy" snow-crystal contact buffer
        snowCrunchBuffer = ctx.createBuffer(1, Math.floor(sampleRate * 2.5), sampleRate);
        fillSnowCrunchSamples(snowCrunchBuffer.getChannelData(0), sampleRate, 9001);

        // 4. Shared 1.5s white-noise buffer for crunchy landing/carve/impact bursts
        const burstLen = Math.floor(sampleRate * 1.5);
        oneShotNoiseBuffer = ctx.createBuffer(1, burstLen, sampleRate);
        const burstData = oneShotNoiseBuffer.getChannelData(0);
        for (let i = 0; i < burstLen; i++) {
          burstData[i] = Math.random() * 2 - 1;
        }

        // --- Soft Mountain Wind PositionalAudio (3D anchor around Lofi) ---
        windAudio = new THREE.PositionalAudio(listener);
        windAudio.setBuffer(windBuffer);
        windAudio.setLoop(true);
        windAudio.setDistanceModel('inverse');
        windAudio.setRefDistance(AMBIENT_AUDIO_CONFIG.windRefDistance);
        windAudio.setMaxDistance(AMBIENT_AUDIO_CONFIG.windMaxDistance);
        windAudio.setRolloffFactor(0.75);
        windAudio.gain.gain.value = 0;

        windFilter = ctx.createBiquadFilter();
        windFilter.type = 'lowpass';
        windFilter.frequency.value = AMBIENT_AUDIO_CONFIG.windMinFreq;
        windFilter.Q.value = 0.85;
        windAudio.setFilter(windFilter);

        windAnchor.add(windAudio);
        scene.add(windAnchor);

        // --- Snow Glide Friction PositionalAudio (attached directly to Lofi's snowboard) ---
        snowAudio = new THREE.PositionalAudio(listener);
        snowAudio.setBuffer(snowBuffer);
        snowAudio.setLoop(true);
        snowAudio.setDistanceModel('inverse');
        snowAudio.setRefDistance(AMBIENT_AUDIO_CONFIG.snowRefDistance);
        snowAudio.setMaxDistance(AMBIENT_AUDIO_CONFIG.snowMaxDistance);
        snowAudio.setRolloffFactor(1.05);
        snowAudio.position.set(0, 0.12, 0);
        snowAudio.gain.gain.value = 0;

        snowFilter = ctx.createBiquadFilter();
        snowFilter.type = 'bandpass';
        snowFilter.frequency.value = AMBIENT_AUDIO_CONFIG.snowMinFreq;
        snowFilter.Q.value = 0.85;
        snowAudio.setFilter(snowFilter);

        lofiRoot.add(snowAudio);

        // --- Granular "Crunchy" Snow-Crystal Contact PositionalAudio (attached to Lofi's snowboard) ---
        snowCrunchAudio = new THREE.PositionalAudio(listener);
        snowCrunchAudio.setBuffer(snowCrunchBuffer);
        snowCrunchAudio.setLoop(true);
        snowCrunchAudio.setDistanceModel('inverse');
        snowCrunchAudio.setRefDistance(AMBIENT_AUDIO_CONFIG.snowRefDistance);
        snowCrunchAudio.setMaxDistance(AMBIENT_AUDIO_CONFIG.snowMaxDistance);
        snowCrunchAudio.setRolloffFactor(1.0);
        snowCrunchAudio.position.set(0, 0.08, 0.15);
        snowCrunchAudio.gain.gain.value = 0;

        snowCrunchFilter = ctx.createBiquadFilter();
        snowCrunchFilter.type = 'bandpass';
        snowCrunchFilter.frequency.value = AMBIENT_AUDIO_CONFIG.crunchMinFreq;
        snowCrunchFilter.Q.value = 1.45;
        snowCrunchAudio.setFilter(snowCrunchFilter);

        lofiRoot.add(snowCrunchAudio);

        // --- Trailing Avalanche Rumble PositionalAudio (positioned behind Lofi) ---
        avalancheAudio = new THREE.PositionalAudio(listener);
        avalancheAudio.setBuffer(windBuffer);
        avalancheAudio.setLoop(true);
        avalancheAudio.setDistanceModel('inverse');
        avalancheAudio.setRefDistance(AMBIENT_AUDIO_CONFIG.avalancheRefDistance);
        avalancheAudio.setMaxDistance(AMBIENT_AUDIO_CONFIG.avalancheMaxDistance);
        avalancheAudio.setRolloffFactor(1.0);
        avalancheAudio.gain.gain.value = 0;

        avalancheFilter = ctx.createBiquadFilter();
        avalancheFilter.type = 'lowpass';
        avalancheFilter.frequency.value = 135;
        avalancheFilter.Q.value = 0.9;
        avalancheAudio.setFilter(avalancheFilter);

        avalancheAnchor.add(avalancheAudio);
        scene.add(avalancheAnchor);
      } catch {
        // Gracefully degrade if Web Audio is unavailable in this environment
        listener = null;
        ctx = null;
        return null;
      }
    }

    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    // Start looping PositionalAudio sources once unlocked by user gesture
    if (unlocked && windAudio && snowAudio && snowCrunchAudio && avalancheAudio) {
      try {
        if (!windAudio.isPlaying) windAudio.play();
        if (!snowAudio.isPlaying) snowAudio.play();
        if (!snowCrunchAudio.isPlaying) snowCrunchAudio.play();
        if (!avalancheAudio.isPlaying) avalancheAudio.play();
      } catch {
        // Ignore if autoplay gate temporarily rejects playback
      }
    }

    return ctx;
  };

  const getOneShotDestination = (): AudioNode | null => {
    if (!listener || !ctx) return null;
    return sfxBusGain ?? listener.getInput();
  };

  const silenceLoops = () => {
    if (!ctx) return;
    const now = ctx.currentTime;
    if (windAudio) windAudio.gain.gain.setTargetAtTime(0, now, 0.06);
    if (snowAudio) snowAudio.gain.gain.setTargetAtTime(0, now, 0.05);
    if (snowCrunchAudio) snowCrunchAudio.gain.gain.setTargetAtTime(0, now, 0.045);
    if (avalancheAudio) avalancheAudio.gain.gain.setTargetAtTime(0, now, 0.07);
  };

  return {
    unlock() {
      unlocked = true;
      ensureSpatialGraph();
      if (bgmInitializedOnce) {
        applyBackgroundMusic(bgmPhase, 1, bgmDanger);
      }
    },

    setMuted(next) {
      muted = next;
      if (listener) {
        listener.setMasterVolume(muted ? 0 : SFX_MIX_CONFIG.spatialMasterGain);
      }
      if (muted) {
        silenceLoops();
      }
      if (bgmElement) {
        bgmElement.muted = muted;
        if (muted) {
          bgmElement.volume = 0;
          if (!bgmElement.paused) bgmElement.pause();
        } else if (bgmInitializedOnce) {
          applyBackgroundMusic(bgmPhase, 1, bgmDanger);
        }
      }
    },

    syncBackgroundMusic(phase, levelNumber, avalancheDanger = 0) {
      applyBackgroundMusic(phase, levelNumber, avalancheDanger);
    },

    isMuted() {
      return muted;
    },

    isSpatialReady() {
      return Boolean(
        listener && windAudio && snowAudio && snowCrunchAudio && avalancheAudio,
      );
    },

    updateContinuous({
      active,
      speedRatio,
      forwardSpeed,
      carveIntensity,
      avalancheDanger,
      airborne = false,
      lean = 0,
      heightAboveGround = 0,
      edgeScrape = 0,
      playerX = 0,
      playerY = 0,
      playerZ = 0,
      avalancheX = playerX,
      avalancheY = playerY + 1.5,
      avalancheZ = playerZ + 28,
      windGustIntensity = 0,
      windGustDirection = 0,
    }) {
      if (!ctx || !windAudio || !snowAudio || !snowCrunchAudio || !avalancheAudio) return;

      // Keep loops active if context resumed asynchronously after user gesture
      if (unlocked && active && !muted && ctx.state === 'running') {
        try {
          if (!windAudio.isPlaying) windAudio.play();
          if (!snowAudio.isPlaying) snowAudio.play();
          if (!snowCrunchAudio.isPlaying) snowCrunchAudio.play();
          if (!avalancheAudio.isPlaying) avalancheAudio.play();
        } catch {
          // Ignore transient autoplay errors
        }
      }

      const targets = computeAmbientAudioTargets({
        active,
        muted,
        speedRatio,
        forwardSpeed,
        carveIntensity,
        avalancheDanger,
        airborne,
        lean,
        heightAboveGround,
        edgeScrape,
        windGustIntensity,
        windGustDirection,
      });

      // Update 3D PositionalAudio anchor world coordinates (zero heap allocations)
      windAnchor.position.set(
        playerX + targets.windOffsetX,
        playerY + 2.4 + heightAboveGround * 0.65,
        playerZ - 2.2,
      );
      avalancheAnchor.position.set(avalancheX, avalancheY, avalancheZ);

      const now = ctx.currentTime;

      // 1. Soft atmospheric mountain wind spatial modulation
      windAudio.gain.gain.setTargetAtTime(targets.windGain, now, 0.09);
      if (windFilter) {
        windFilter.frequency.setTargetAtTime(targets.windFilterFreq, now, 0.1);
      }
      if (
        windAudio.isPlaying &&
        windAudio.source &&
        'playbackRate' in windAudio.source
      ) {
        (windAudio.source as AudioBufferSourceNode).playbackRate.setTargetAtTime(
          targets.windPlaybackRate,
          now,
          0.11,
        );
      }

      // 2. Snow glide friction modulation (originating at Lofi's snowboard)
      snowAudio.gain.gain.setTargetAtTime(targets.snowGain, now, 0.045);
      if (snowFilter) {
        snowFilter.frequency.setTargetAtTime(targets.snowFilterFreq, now, 0.05);
      }
      if (
        snowAudio.isPlaying &&
        snowAudio.source &&
        'playbackRate' in snowAudio.source
      ) {
        (snowAudio.source as AudioBufferSourceNode).playbackRate.setTargetAtTime(
          targets.snowPlaybackRate,
          now,
          0.06,
        );
      }

      // 3. Granular "crunchy" snow-crystal contact modulation (silences instantly when airborne)
      snowCrunchAudio.gain.gain.setTargetAtTime(targets.snowCrunchGain, now, 0.035);
      if (snowCrunchFilter) {
        snowCrunchFilter.frequency.setTargetAtTime(targets.snowCrunchFreq, now, 0.045);
      }
      if (
        snowCrunchAudio.isPlaying &&
        snowCrunchAudio.source &&
        'playbackRate' in snowCrunchAudio.source
      ) {
        (snowCrunchAudio.source as AudioBufferSourceNode).playbackRate.setTargetAtTime(
          targets.snowCrunchPlaybackRate,
          now,
          0.055,
        );
      }

      // 4. Trailing avalanche spatial rumble modulation
      avalancheAudio.gain.gain.setTargetAtTime(targets.avalancheGain, now, 0.1);
      if (avalancheFilter) {
        avalancheFilter.frequency.setTargetAtTime(
          targets.avalancheFilterFreq,
          now,
          0.1,
        );
      }
    },

    playCarveCrunch(intensity) {
      if (muted || intensity < 0.28) return;
      const audio = ensureSpatialGraph();
      const dest = getOneShotDestination();
      if (!audio || !dest || !snowCrunchBuffer) return;

      const now = audio.currentTime;
      if (now - lastCarveCrunchTime < 0.24) return;
      lastCarveCrunchTime = now;

      const clamped = Math.max(0.25, Math.min(1, intensity));
      triggerSfxDuck(0.12 * clamped, 160);

      const src = audio.createBufferSource();
      src.buffer = snowCrunchBuffer;
      const startOffset = (now * 0.73) % Math.max(0.2, snowCrunchBuffer.duration - 0.25);

      const filt = audio.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.setValueAtTime(1450 + clamped * 680, now);
      filt.Q.value = 1.65;

      const gain = audio.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.09 * clamped, now + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      src.connect(filt);
      filt.connect(gain);
      gain.connect(dest);
      src.start(now, startOffset, 0.17);
    },

    playHit(kind) {
      if (muted) return;
      unlocked = true;
      const audio = ensureSpatialGraph();
      const dest = getOneShotDestination();
      if (!audio || !dest) return;
      const now = audio.currentTime;
      triggerSfxDuck(0.85, 360);

      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = kind === 'rock' ? 'triangle' : 'sine';
      const basePitch = kind === 'rock' ? 128 : kind === 'fallen_log' ? 148 : 165;
      osc.frequency.setValueAtTime(basePitch, now);
      osc.frequency.exponentialRampToValueAtTime(
        kind === 'fallen_log' ? 54 : 42,
        now + 0.18,
      );

      gain.gain.setValueAtTime(0.21, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.25);

      if (oneShotNoiseBuffer) {
        const burst = audio.createBufferSource();
        burst.buffer = oneShotNoiseBuffer;
        const filt = audio.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.value =
          kind === 'rock' ? 620 : kind === 'fallen_log' ? 840 : 1250;
        const nGain = audio.createGain();
        nGain.gain.setValueAtTime(0.14, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        burst.connect(filt);
        filt.connect(nGain);
        nGain.connect(dest);
        burst.start(now);
        burst.stop(now + 0.19);
      }
    },

    playTakeoff() {
      if (muted) return;
      unlocked = true;
      const audio = ensureSpatialGraph();
      const dest = getOneShotDestination();
      if (!audio || !dest) return;
      const now = audio.currentTime;
      triggerSfxDuck(0.25, 200);

      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(430, now + 0.14);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.095, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.19);

      if (oneShotNoiseBuffer) {
        const whoosh = audio.createBufferSource();
        whoosh.buffer = oneShotNoiseBuffer;
        const filt = audio.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.setValueAtTime(650, now);
        filt.frequency.exponentialRampToValueAtTime(1650, now + 0.16);
        const nGain = audio.createGain();
        nGain.gain.setValueAtTime(0.07, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
        whoosh.connect(filt);
        filt.connect(nGain);
        nGain.connect(dest);
        whoosh.start(now);
        whoosh.stop(now + 0.18);
      }
    },

    playGrab() {
      if (muted) return;
      unlocked = true;
      const audio = ensureSpatialGraph();
      const dest = getOneShotDestination();
      if (!audio || !dest) return;
      const now = audio.currentTime;
      triggerSfxDuck(0.22, 160);

      // Crisp mid-air grab-lock pop + subtle fabric wind snap
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(590, now + 0.085);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.085, now + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.12);

      if (oneShotNoiseBuffer) {
        const snap = audio.createBufferSource();
        snap.buffer = oneShotNoiseBuffer;
        const filt = audio.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.setValueAtTime(1400, now);
        filt.frequency.exponentialRampToValueAtTime(2400, now + 0.08);
        filt.Q.value = 1.6;
        const nGain = audio.createGain();
        nGain.gain.setValueAtTime(0.055, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        snap.connect(filt);
        filt.connect(nGain);
        nGain.connect(dest);
        snap.start(now);
        snap.stop(now + 0.1);
      }
    },

    playLanding(withGrab, multiplier = 1) {
      if (muted) return;
      unlocked = true;
      const audio = ensureSpatialGraph();
      const dest = getOneShotDestination();
      if (!audio || !dest) return;
      const now = audio.currentTime;
      triggerSfxDuck(withGrab ? 0.55 : 0.35, withGrab ? 340 : 240);

      // 1. Packed-snow compression thump
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(132, now);
      osc.frequency.exponentialRampToValueAtTime(52, now + 0.14);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.18);

      // 2. Multi-grain tactile "crunchy" snow-touchdown burst (3 staggered ice-crystal crackles)
      const crunchSourceBuf = snowCrunchBuffer ?? oneShotNoiseBuffer;
      if (crunchSourceBuf) {
        const grains: Array<{ delay: number; freq: number; q: number; amp: number; dur: number }> = [
          { delay: 0.0, freq: 1380, q: 1.5, amp: 0.14, dur: 0.105 },
          { delay: 0.022, freq: 2150, q: 1.9, amp: 0.11, dur: 0.095 },
          { delay: 0.052, freq: 1120, q: 1.3, amp: 0.085, dur: 0.12 },
        ];
        grains.forEach((g, idx) => {
          const start = now + g.delay;
          const burst = audio.createBufferSource();
          burst.buffer = crunchSourceBuf;
          const filt = audio.createBiquadFilter();
          filt.type = 'bandpass';
          filt.frequency.setValueAtTime(g.freq, start);
          filt.Q.value = g.q;
          const nGain = audio.createGain();
          nGain.gain.setValueAtTime(0.001, start);
          nGain.gain.linearRampToValueAtTime(g.amp, start + 0.009);
          nGain.gain.exponentialRampToValueAtTime(0.001, start + g.dur);
          burst.connect(filt);
          filt.connect(nGain);
          nGain.connect(dest);
          const offset = (idx * 0.37) % Math.max(0.2, crunchSourceBuf.duration - 0.2);
          burst.start(start, offset, g.dur + 0.02);
        });
      }

      // 3. Bright ascending chime scaled to active trick multiplier when landing a clean Grab trick
      if (withGrab) {
        const multStep = Math.max(0, Math.min(4, Math.floor(multiplier) - 1));
        const pitchScale = Math.pow(2, (multStep * 2) / 12);
        const notes = multStep >= 2 ? [523.25, 659.25, 783.99] : [523.25, 783.99];
        notes.forEach((freq, idx) => {
          const chime = audio.createOscillator();
          const cGain = audio.createGain();
          chime.type = 'triangle';
          const start = now + idx * 0.05;
          chime.frequency.setValueAtTime(freq * pitchScale, start);
          cGain.gain.setValueAtTime(0.001, start);
          cGain.gain.linearRampToValueAtTime(0.135, start + 0.015);
          cGain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
          chime.connect(cGain);
          cGain.connect(dest);
          chime.start(start);
          chime.stop(start + 0.3);
        });
      }
    },

    playRescue() {
      if (muted) return;
      unlocked = true;
      const audio = ensureSpatialGraph();
      const dest = getOneShotDestination();
      if (!audio || !dest) return;
      const now = audio.currentTime;
      triggerSfxDuck(0.45, 300);
      const notes = [587.33, 739.99, 880.0];
      notes.forEach((freq, idx) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'triangle';
        const start = now + idx * 0.055;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(start);
        osc.stop(start + 0.32);
      });
    },

    playVictory() {
      silenceLoops();
      if (muted) return;
      unlocked = true;
      const audio = ensureSpatialGraph();
      const dest = getOneShotDestination();
      if (!audio || !dest) return;
      const now = audio.currentTime;
      triggerSfxDuck(0.75, 900);
      const notes = [392.0, 493.88, 587.33, 783.99];
      notes.forEach((freq, idx) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'triangle';
        const start = now + idx * 0.095;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.16, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.58);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(start);
        osc.stop(start + 0.6);
      });
    },

    playGameOver() {
      silenceLoops();
      if (muted) return;
      unlocked = true;
      const audio = ensureSpatialGraph();
      const dest = getOneShotDestination();
      if (!audio || !dest) return;
      const now = audio.currentTime;
      triggerSfxDuck(1.0, 700);
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.55);

      const filt = audio.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 320;

      gain.gain.setValueAtTime(0.17, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.64);

      osc.connect(filt);
      filt.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.66);
    },

    silenceLoops,

    dispose() {
      disposed = true;
      silenceLoops();

      const stopAndDetach = (node: THREE.PositionalAudio | null) => {
        if (!node) return;
        try {
          if (node.isPlaying) node.stop();
          node.disconnect();
        } catch {
          // Ignore teardown errors if never started
        }
        node.parent?.remove(node);
      };

      stopAndDetach(windAudio);
      stopAndDetach(snowAudio);
      stopAndDetach(snowCrunchAudio);
      stopAndDetach(avalancheAudio);

      windAnchor.parent?.remove(windAnchor);
      avalancheAnchor.parent?.remove(avalancheAnchor);

      if (listener) {
        listener.parent?.remove(listener);
        listener = null;
      }

      if (bgmElement) {
        try {
          bgmElement.removeEventListener('ended', handleBgmEnded);
          bgmElement.pause();
          bgmElement.removeAttribute('src');
          bgmElement.load();
        } catch {
          // Ignore teardown errors
        }
        bgmElement = null;
      }

      if (sfxBusGain) {
        try {
          sfxBusGain.disconnect();
        } catch {
          // Ignore teardown errors
        }
        sfxBusGain = null;
      }
      if (sfxLimiter) {
        try {
          sfxLimiter.disconnect();
        } catch {
          // Ignore teardown errors
        }
        sfxLimiter = null;
      }

      windAudio = null;
      snowAudio = null;
      snowCrunchAudio = null;
      avalancheAudio = null;
      windFilter = null;
      snowFilter = null;
      snowCrunchFilter = null;
      avalancheFilter = null;
      windBuffer = null;
      snowBuffer = null;
      snowCrunchBuffer = null;
      oneShotNoiseBuffer = null;
      ctx = null;
    },
  };
}
