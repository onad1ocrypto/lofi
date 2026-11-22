import { useEffect, useRef, useState } from 'react';
import type { HudSnapshot } from '../game/types';
import {
  UI_COPY,
  formatArrivalSummary,
  formatHudCrewSubline,
  formatLevelStartCallout,
  formatPauseSummary,
  hasRecruitJoined,
} from '../game/uiCopy';
import { MiniMap } from './MiniMap';
import { OutcomeOverlay } from './OutcomeOverlay';

interface GameHUDProps {
  hud: HudSnapshot;
  muted: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onRetryLevel: () => void;
  onNextLevel: () => void;
  onNewGame: () => void;
  onReturnToTitle: () => void;
  onJump: () => void;
  onGrabChange: (held: boolean) => void;
  onTrickChange?: (held: boolean) => void;
  onBrakeChange: (held: boolean) => void;
  onToggleMute: () => void;
}

const OPENING_VIDEO_SRC = '/assets/aistudio/202611221927_31369b59.mp4';

/** Custom SVG warm cabin icon matching the in-world finish shelter. */
function ShelterIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M3 11.5L12 4L21 11.5"
        stroke="#F4F8FF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 11V20H18.5V11"
        fill="#6C4128"
        stroke="#1C2540"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <rect x="9.5" y="13.5" width="5" height="6.5" rx="1" fill="#FFB347" />
      <rect x="16" y="5.5" width="2.4" height="4" rx="0.6" fill="#4D5669" />
    </svg>
  );
}

/** Custom SVG Small Yeti badge icon matching lofi-small-yeti.png (white fur, blue horns/face, purple goggles, yellow scarf). */
function SmallYetiIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      {/* Two short blue horns */}
      <path d="M7.5 6.5L6.2 3.2L9.2 5.2Z" fill="#67B8F0" stroke="#18213A" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M16.5 6.5L17.8 3.2L14.8 5.2Z" fill="#67B8F0" stroke="#18213A" strokeWidth="1.2" strokeLinejoin="round" />
      {/* Fluffy white head */}
      <circle cx="12" cy="11.5" r="6.4" fill="#F4F8FF" stroke="#18213A" strokeWidth="1.5" />
      {/* Purple forehead goggles */}
      <rect x="7.5" y="6.8" width="9" height="3.2" rx="1.6" fill="#7B3378" stroke="#18213A" strokeWidth="1.1" />
      {/* Blue deadpan face */}
      <rect x="8.2" y="10.4" width="7.6" height="4.8" rx="2.2" fill="#559DE2" />
      <circle cx="10.4" cy="12.2" r="0.9" fill="#151B2C" />
      <circle cx="13.6" cy="12.2" r="0.9" fill="#151B2C" />
      {/* Yellow scarf + purple vest shoulders */}
      <path d="M6.8 18.2C8.2 16.5 15.8 16.5 17.2 18.2L18 21H6L6.8 18.2Z" fill="#722E6F" stroke="#18213A" strokeWidth="1.3" strokeLinejoin="round" />
      <rect x="7.4" y="16.2" width="9.2" height="2.4" rx="1.2" fill="#F0B12E" stroke="#18213A" strokeWidth="1.1" />
    </svg>
  );
}

/** Custom SVG avalanche snow-wave icon matching the trailing snow cloud. */
function AvalancheIcon({
  danger,
  className = 'w-5 h-5',
}: {
  danger: number;
  className?: string;
}) {
  const fill = danger > 0.65 ? '#FF6B4A' : danger > 0.35 ? '#FFB347' : '#8FD1FF';
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M3 17.5C4.5 13 7.5 10 11.5 9.5C10.5 12 12 13.5 14 13.2C15.5 13 17 14 18.2 15.5C19.5 14.8 21 15.8 21 17.5H3Z"
        fill={fill}
        stroke="#18213A"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="7" r="2.2" fill="#EEF5FF" stroke="#18213A" strokeWidth="1.3" />
      <circle cx="14.5" cy="8.2" r="1.7" fill="#EEF5FF" stroke="#18213A" strokeWidth="1.2" />
    </svg>
  );
}

export function GameHUD({
  hud,
  muted,
  onStart,
  onPause,
  onResume,
  onRetryLevel,
  onNextLevel,
  onNewGame,
  onReturnToTitle,
  onJump,
  onGrabChange,
  onTrickChange,
  onBrakeChange,
  onToggleMute,
}: GameHUDProps) {
  const applyTrickHeld = onTrickChange ?? onGrabChange;
  const isPlaying = hud.phase === 'playing';
  const isTitle = hud.phase === 'title';
  const isPaused = hud.phase === 'paused';
  const isVictory = hud.phase === 'victory';
  const isGameOver = hud.phase === 'gameover';

  // Opening video playback state: PLAY button is revealed once the intro video reaches its final frame
  const introVideoRef = useRef<HTMLVideoElement | null>(null);
  const [introVideoEnded, setIntroVideoEnded] = useState(false);

  useEffect(() => {
    if (!isTitle) return;
    setIntroVideoEnded(false);
    const video = introVideoRef.current;
    if (!video) return;
    try {
      video.currentTime = 0;
    } catch {
      // Ignore if metadata is not yet loaded
    }
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Fallback if browser blocks autoplay so the player can still start immediately
        setIntroVideoEnded(true);
      });
    }
  }, [isTitle]);

  const handleSkipIntroVideo = () => {
    if (introVideoEnded) return;
    const video = introVideoRef.current;
    if (video) {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        try {
          video.currentTime = video.duration;
        } catch {
          // Ignore seek errors before metadata is ready
        }
      }
      video.pause();
    }
    setIntroVideoEnded(true);
  };

  // Isolated pointerId tracking so holding TRICK or BRAKE never interferes with canvas drag steering
  const trickPointerIdRef = useRef<number | null>(null);
  const [trickPressed, setTrickPressed] = useState(false);
  const brakePointerIdRef = useRef<number | null>(null);
  const [brakePressed, setBrakePressed] = useState(false);

  const releaseTrickTouch = (pointerId?: number) => {
    if (
      pointerId !== undefined &&
      trickPointerIdRef.current !== null &&
      trickPointerIdRef.current !== pointerId
    ) {
      return;
    }
    trickPointerIdRef.current = null;
    setTrickPressed(false);
    applyTrickHeld(false);
  };

  const releaseBrakeTouch = (pointerId?: number) => {
    if (
      pointerId !== undefined &&
      brakePointerIdRef.current !== null &&
      brakePointerIdRef.current !== pointerId
    ) {
      return;
    }
    brakePointerIdRef.current = null;
    setBrakePressed(false);
    onBrakeChange(false);
  };

  // Guarantee mobile/desktop TRICK and BRAKE buttons never get stuck pressed on phase change,
  // pointer release outside button bounds, window blur, or lost pointer capture.
  const applyTrickHeldRef = useRef(applyTrickHeld);
  applyTrickHeldRef.current = applyTrickHeld;
  const onBrakeChangeRef = useRef(onBrakeChange);
  onBrakeChangeRef.current = onBrakeChange;

  useEffect(() => {
    if (!isPlaying) {
      trickPointerIdRef.current = null;
      setTrickPressed(false);
      brakePointerIdRef.current = null;
      setBrakePressed(false);
      return;
    }

    const handleWindowPointerEnd = (e: PointerEvent) => {
      if (trickPointerIdRef.current !== null && trickPointerIdRef.current === e.pointerId) {
        trickPointerIdRef.current = null;
        setTrickPressed(false);
        applyTrickHeldRef.current(false);
      }
      if (brakePointerIdRef.current !== null && brakePointerIdRef.current === e.pointerId) {
        brakePointerIdRef.current = null;
        setBrakePressed(false);
        onBrakeChangeRef.current(false);
      }
    };

    const handleWindowReset = () => {
      if (trickPointerIdRef.current !== null) {
        trickPointerIdRef.current = null;
        setTrickPressed(false);
        applyTrickHeldRef.current(false);
      }
      if (brakePointerIdRef.current !== null) {
        brakePointerIdRef.current = null;
        setBrakePressed(false);
        onBrakeChangeRef.current(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) handleWindowReset();
    };

    window.addEventListener('pointerup', handleWindowPointerEnd);
    window.addEventListener('pointercancel', handleWindowPointerEnd);
    window.addEventListener('blur', handleWindowReset);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pointerup', handleWindowPointerEnd);
      window.removeEventListener('pointercancel', handleWindowPointerEnd);
      window.removeEventListener('blur', handleWindowReset);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying]);

  // Increment a monotonic key each time Victory or Game Over overlay becomes visible so CSS animations reset cleanly on Retry
  const outcomeVisible =
    (isVictory && hud.victoryUiReady) || (isGameOver && hud.gameoverUiReady);
  const prevOutcomeVisibleRef = useRef(false);
  const [outcomeOverlayKey, setOutcomeOverlayKey] = useState(0);
  useEffect(() => {
    if (outcomeVisible && !prevOutcomeVisibleRef.current) {
      setOutcomeOverlayKey((k) => k + 1);
    }
    prevOutcomeVisibleRef.current = outcomeVisible;
  }, [outcomeVisible]);

  // Non-blocking Level Start callout ("Lofi rides solo!", "Ride with 1 Lil Yeti!", "Ride with 2 Lil Yetis!")
  const [levelStartBannerText, setLevelStartBannerText] = useState<string | null>(null);
  const prevPhaseRef = useRef(hud.phase);
  const prevLevelRef = useRef(hud.levelNumber);
  const startBannerMountedRef = useRef(false);

  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    const prevLevel = prevLevelRef.current;
    prevPhaseRef.current = hud.phase;
    prevLevelRef.current = hud.levelNumber;

    if (!isPlaying) {
      if (hud.phase !== 'paused') {
        setLevelStartBannerText(null);
      }
      return;
    }

    const enteredFreshRun =
      !startBannerMountedRef.current ||
      (prevPhase !== 'playing' && prevPhase !== 'paused') ||
      prevLevel !== hud.levelNumber;
    startBannerMountedRef.current = true;

    if (enteredFreshRun && hud.progressPct <= 15) {
      setLevelStartBannerText(formatLevelStartCallout(hud.followerCount));
    }
  }, [isPlaying, hud.phase, hud.levelNumber, hud.followerCount, hud.progressPct]);

  useEffect(() => {
    if (!levelStartBannerText) return;
    const timer = window.setTimeout(() => {
      setLevelStartBannerText(null);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [levelStartBannerText]);

  const dangerColor =
    hud.avalancheDanger > 0.65
      ? '#EF4444'
      : hud.avalancheDanger > 0.35
        ? '#F59E0B'
        : '#60A5FA';

  const threatLabel =
    hud.avalancheDanger > 0.65
      ? UI_COPY.hud.threatDanger
      : hud.avalancheDanger > 0.35
        ? UI_COPY.hud.threatClosing
        : UI_COPY.hud.threatSafe;

  return (
    <div className="fixed inset-0 pointer-events-none z-10 flex flex-col justify-between">
      {/* Subtle hit / critical avalanche peripheral vignette (non-blocking, no backdrop-filter) */}
      {(hud.hitFeedback || (isPlaying && hud.avalancheDanger > 0.65)) && (
        <div
          className="fixed inset-0 pointer-events-none transition-opacity duration-150"
          style={{
            boxShadow: hud.hitFeedback
              ? 'inset 0 0 90px rgba(239, 98, 42, 0.55)'
              : 'inset 0 0 85px rgba(239, 68, 68, 0.34)',
          }}
        />
      )}

      {/* ==================== OPENING VIDEO / TITLE SCREEN ==================== */}
      {isTitle && (
        <div
          className="fixed inset-0 pointer-events-auto flex flex-col justify-between overflow-hidden select-none"
          style={{
            background:
              'radial-gradient(circle at 50% 34%, #2F6BB0 0%, #1E3A6B 52%, #141F3A 100%)',
          }}
          data-testid="title-screen"
          data-intro-ended={introVideoEnded ? 'true' : 'false'}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Centerpiece Opening Game Video — plays once and holds cleanly on the final title frame */}
          <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center gap-5 px-3.5 py-4 sm:px-6 sm:pt-4 sm:pb-2.5">
            <video
              ref={introVideoRef}
              src={OPENING_VIDEO_SRC}
              aria-label="LOFI ICE ESCAPE opening video"
              data-testid="opening-video"
              autoPlay
              muted
              playsInline
              preload="auto"
              onEnded={() => setIntroVideoEnded(true)}
              onError={() => setIntroVideoEnded(true)}
              onClick={handleSkipIntroVideo}
              className="max-w-full max-h-full w-auto h-auto object-contain rounded-2xl border-[3px] border-[#16203B]/95 shadow-[0_18px_48px_rgba(8,13,28,0.62)] cursor-pointer bg-[#0e1830]"
            />

            {/* Compact Mobile-only control guide card below opening video for balanced portrait rhythm */}
            <div className="flex sm:hidden flex-col gap-1.5 w-full max-w-[366px] rounded-2xl px-4 py-3 border border-white/20 bg-[#0d1833]/52 backdrop-blur-md text-left shadow-[0_10px_26px_rgba(9,14,30,0.32)]">
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#FFD15C]">
                {UI_COPY.title.howToPlayHeading}
              </p>
              <p className="text-xs font-semibold text-[#EDF4FF] leading-relaxed">
                {UI_COPY.title.mobileControlsGuideBeforeJump}
                <strong className="text-white">{UI_COPY.hud.mobileJump}</strong>
                {UI_COPY.title.mobileControlsGuideBetween}
                <strong className="text-white">{UI_COPY.hud.mobileTrick}</strong>
                {UI_COPY.title.mobileControlsGuideAfterTrick}
              </p>
            </div>
          </div>

          {/* Dedicated Bottom Action Bar — reserves steady height and reveals PLAY at the end of the video */}
          <div className="w-full shrink-0 px-4 pt-3 pb-5 sm:px-6 sm:pt-3 sm:pb-4 flex flex-col items-center gap-2 border-t border-white/16 bg-[#0c1630]/60 backdrop-blur-md">
            <div className="flex items-center justify-center gap-3 w-full max-w-2xl min-h-[58px]">
              {introVideoEnded && (
                <button
                  type="button"
                  data-start="true"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={onStart}
                  className="intro-play-reveal font-display cursor-pointer px-14 py-3 sm:py-3 rounded-2xl bg-[#EB7A28] hover:bg-[#F58838] active:translate-y-0.5 text-white text-2xl sm:text-[26px] font-bold tracking-wider uppercase border-[3px] border-[#161E36] shadow-[0_5px_0_#161E36,0_12px_26px_rgba(12,18,36,0.4)] transition-transform focus:outline-none focus-visible:ring-4 focus-visible:ring-[#8FD1FF]"
                >
                  {UI_COPY.title.play}
                </button>
              )}

              <button
                type="button"
                aria-label={muted ? UI_COPY.title.unmuteAria : UI_COPY.title.muteAria}
                data-testid="btn-cover-mute"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onToggleMute}
                className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-3 sm:py-3.5 rounded-2xl border border-white/25 bg-[#152447]/60 hover:bg-[#1e325e]/75 backdrop-blur-md text-[#F4F8FF] active:translate-y-0.5 shadow-[0_4px_14px_rgba(8,14,32,0.3)] text-xs font-extrabold uppercase tracking-wider shrink-0 transition-colors"
              >
                {muted ? (
                  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.3" aria-hidden="true">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" strokeLinejoin="round" />
                    <path d="M22 9l-6 6M16 9l6 6" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.3" aria-hidden="true">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" strokeLinejoin="round" />
                    <path d="M15.5 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" strokeLinecap="round" />
                  </svg>
                )}
                <span>{muted ? UI_COPY.title.soundOff : UI_COPY.title.soundOn}</span>
              </button>
            </div>

            <p className="hidden sm:block text-[13px] font-semibold tracking-wide text-[#D6E4FB] text-center max-w-3xl leading-snug">
              {UI_COPY.title.desktopControls}
            </p>
          </div>
        </div>
      )}

      {/* ==================== ACTIVE PLAYING HUD ==================== */}
      {(isPlaying || isPaused) && (
        <div className="w-full px-2.5 pt-2.5 sm:px-5 sm:pt-3.5 flex flex-col gap-1.5">
          <div className="w-full flex items-stretch justify-between gap-2 sm:gap-3">
            {/* Neatly aligned translucent telemetry columns */}
            <div className="flex flex-1 sm:flex-none items-stretch gap-1.5 sm:gap-3 min-w-0">
              {/* Column 1: Level & Progress toward Shelter */}
              <div
                className="flex-1 min-w-0 sm:flex-none sm:w-[216px] flex flex-col justify-between gap-1 rounded-xl sm:rounded-2xl px-2.5 py-1.5 sm:px-3.5 sm:py-2 border border-white/25 bg-[#0e1a36]/36 backdrop-blur-md shadow-[0_6px_20px_rgba(8,14,32,0.18)]"
                aria-label={UI_COPY.hud.shelterAria}
              >
                <div className="flex items-center justify-between gap-1 sm:gap-1.5">
                  <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                    <ShelterIcon className="w-3.5 h-3.5 sm:w-[18px] sm:h-[18px] shrink-0" />
                    <span
                      className="text-[8.5px] sm:text-[11px] font-extrabold uppercase tracking-tight sm:tracking-wider text-[#F0F6FF] drop-shadow-[0_1px_2px_rgba(8,14,32,0.75)] whitespace-nowrap truncate"
                      data-testid="hud-level"
                    >
                      LV {hud.levelNumber} · {UI_COPY.hud.shelter}
                    </span>
                  </div>
                  <span
                    className="font-display text-xs sm:text-base font-bold text-white drop-shadow-[0_1px_2px_rgba(8,14,32,0.75)] leading-none tabular-nums shrink-0"
                    data-testid="hud-progress"
                  >
                    {hud.progressPct}%
                  </span>
                </div>
                <div className="w-full h-1.5 sm:h-2 rounded-full bg-[#0a1328]/40 overflow-hidden border border-white/18">
                  <div
                    className="h-full rounded-full bg-[#F59E0B] transition-[width] duration-100"
                    style={{ width: `${hud.progressPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-1.5 text-[8.5px] sm:text-[10px] font-bold tracking-normal sm:tracking-wider uppercase text-[#DCEBFF] drop-shadow-[0_1px_2px_rgba(8,14,32,0.75)] tabular-nums">
                  <span className="whitespace-nowrap">{UI_COPY.hud.distanceLeft}</span>
                  <span className="shrink-0 text-white">{hud.remainingMeters}m</span>
                </div>
              </div>

              {/* Column 2 (Desktop): Run Score + Stylish Trick Multiplier */}
              <div
                className={`hidden sm:flex flex-col justify-between gap-1 w-[192px] rounded-2xl px-3.5 py-2 border bg-[#0e1a36]/36 backdrop-blur-md shadow-[0_6px_20px_rgba(8,14,32,0.18)] transition-colors duration-150 ${
                  hud.scoreFeedbackActive || hud.scoreMultiplier > 1
                    ? 'border-[#FFD15C]/85'
                    : 'border-[#FFD15C]/38'
                }`}
                aria-label={UI_COPY.hud.scoreAria}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <SmallYetiIcon className="w-[18px] h-[18px] shrink-0" />
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#FFF3C4] drop-shadow-[0_1px_2px_rgba(8,14,32,0.75)] whitespace-nowrap">
                      {UI_COPY.hud.scoreLabel}
                    </span>
                    {hud.scoreMultiplier > 1 && (
                      <span
                        className="px-1.5 py-0.5 rounded-md bg-[#F59E0B] text-[#141E36] font-display text-[11px] font-extrabold leading-none tabular-nums shadow-[0_2px_8px_rgba(245,158,11,0.45)]"
                        data-testid="hud-multiplier-desktop"
                      >
                        ×{hud.scoreMultiplier}
                      </span>
                    )}
                  </div>
                  <span
                    className={`font-display text-lg font-bold drop-shadow-[0_1px_2px_rgba(8,14,32,0.75)] leading-none tabular-nums transition-transform duration-150 ${
                      hud.scoreFeedbackActive
                        ? 'text-white scale-110'
                        : 'text-[#FFD15C] scale-100'
                    }`}
                    data-testid="hud-score"
                  >
                    {hud.score}
                  </span>
                </div>
                {hud.scoreMultiplier > 1 && (
                  <div className="h-1 w-full rounded-full bg-white/18 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#FFD15C] transition-[width] duration-75"
                      style={{ width: `${Math.round(hud.multiplierTimerRatio * 100)}%` }}
                    />
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 text-[10px] font-bold tracking-wider uppercase text-[#DCEBFF] drop-shadow-[0_1px_2px_rgba(8,14,32,0.75)] tabular-nums">
                  <span className="whitespace-nowrap" data-testid="hud-collectibles-desktop">
                    {hud.collectedCollectibles}/{hud.totalCollectibles}
                  </span>
                  <span
                    className={`whitespace-nowrap ${
                      hud.scoreFeedbackActive || hud.scoreMultiplier > 1
                        ? 'text-[#FFD15C]'
                        : 'text-white'
                    }`}
                  >
                    {hud.scoreFeedbackActive && hud.lastScoreDelta > 0
                      ? `+${hud.lastScoreDelta}`
                      : hud.scoreMultiplier > 1
                        ? `STYLE ×${hud.scoreMultiplier}`
                        : UI_COPY.hud.lilYetisLabel}
                  </span>
                </div>
              </div>

              {/* Column 3 (Desktop): Active Lil Yetis (levelNumber - 1, excludes Lofi) */}
              <div
                className="hidden sm:flex flex-col justify-between gap-1 w-[196px] rounded-2xl px-3.5 py-2 border border-[#d69be8]/38 bg-[#0e1a36]/36 backdrop-blur-md shadow-[0_6px_20px_rgba(8,14,32,0.18)]"
                aria-label={UI_COPY.hud.lilYetisAria}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <SmallYetiIcon className="w-[18px] h-[18px] shrink-0" />
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#F6E6FC] drop-shadow-[0_1px_2px_rgba(8,14,32,0.75)] whitespace-nowrap">
                      {UI_COPY.hud.lilYetisLabel}
                    </span>
                  </div>
                  <span
                    className="font-display text-lg font-bold text-[#FFD15C] drop-shadow-[0_1px_2px_rgba(8,14,32,0.75)] leading-none tabular-nums"
                    data-testid="hud-followers-desktop"
                  >
                    {hud.followerCount}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[10px] font-bold tracking-wider uppercase text-[#DCEBFF] drop-shadow-[0_1px_2px_rgba(8,14,32,0.75)] tabular-nums">
                  <span className="whitespace-nowrap">
                    Level {hud.levelNumber}/{hud.totalLevels}
                  </span>
                  <span className="text-white whitespace-nowrap" data-testid="hud-convoy-status">
                    {formatHudCrewSubline(hud.followerCount)}
                  </span>
                </div>
              </div>

              {/* Column 4: Avalanche Threat Meter */}
              <div
                className={`flex-1 min-w-0 sm:flex-none sm:w-[216px] flex flex-col justify-between gap-1 rounded-xl sm:rounded-2xl px-2.5 py-1.5 sm:px-3.5 sm:py-2 border bg-[#0e1a36]/36 backdrop-blur-md shadow-[0_6px_20px_rgba(8,14,32,0.18)] ${
                  hud.avalancheDanger > 0.65 ? 'border-[#EF4444]/85' : 'border-white/25'
                }`}
                aria-label={UI_COPY.hud.avalancheAria}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <AvalancheIcon
                      danger={hud.avalancheDanger}
                      className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0"
                    />
                    <span className="text-[9.5px] sm:text-[11px] font-extrabold uppercase tracking-wide sm:tracking-wider text-[#F0F6FF] drop-shadow-[0_1px_2px_rgba(8,14,32,0.75)] whitespace-nowrap">
                      {UI_COPY.hud.avalanche}
                    </span>
                  </div>
                  <span
                    className="font-display text-sm sm:text-base font-bold drop-shadow-[0_1px_2px_rgba(8,14,32,0.75)] tabular-nums leading-none shrink-0"
                    style={{ color: dangerColor }}
                    data-testid="hud-avalanche"
                  >
                    {hud.avalancheMeters}m
                  </span>
                </div>
                <div className="w-full h-1.5 sm:h-2 rounded-full bg-[#0a1328]/40 overflow-hidden border border-white/18">
                  <div
                    className="h-full rounded-full transition-[width,background-color] duration-100"
                    style={{
                      width: `${Math.max(8, Math.round(hud.avalancheDanger * 100))}%`,
                      backgroundColor: dangerColor,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between gap-1.5 text-[9px] sm:text-[10px] font-bold tracking-wide sm:tracking-wider uppercase drop-shadow-[0_1px_2px_rgba(8,14,32,0.75)]">
                  <span className="whitespace-nowrap" style={{ color: dangerColor }}>
                    {threatLabel}
                  </span>
                  <span className="text-[#DCEBFF] tabular-nums hidden sm:inline shrink-0">
                    {hud.speedKmh} {UI_COPY.hud.speedUnit}
                  </span>
                </div>
              </div>
            </div>

            {/* Top-Right Utility Controls: Mute & Pause */}
            <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto shrink-0">
              <button
                type="button"
                tabIndex={-1}
                aria-label={muted ? UI_COPY.title.unmuteAria : UI_COPY.title.muteAria}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleMute();
                }}
                className="cursor-pointer w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center border border-white/25 bg-[#0e1a36]/36 hover:bg-[#192c57]/64 backdrop-blur-md text-white active:translate-y-0.5 shadow-[0_6px_18px_rgba(8,14,32,0.18)] transition-colors"
              >
                {muted ? (
                  <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" strokeLinejoin="round" />
                    <path d="M22 9l-6 6M16 9l6 6" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" strokeLinejoin="round" />
                    <path d="M15.5 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" strokeLinecap="round" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label={isPaused ? UI_COPY.hud.resumeAria : UI_COPY.hud.pauseAria}
                onClick={(e) => {
                  e.currentTarget.blur();
                  if (isPaused) onResume();
                  else onPause();
                }}
                className="cursor-pointer w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center border border-white/25 bg-[#0e1a36]/36 hover:bg-[#192c57]/64 backdrop-blur-md text-white active:translate-y-0.5 shadow-[0_6px_18px_rgba(8,14,32,0.18)] transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor">
                  <rect x="6" y="5" width="4.2" height="14" rx="1.2" />
                  <rect x="13.8" y="5" width="4.2" height="14" rx="1.2" />
                </svg>
              </button>
            </div>
          </div>

          {/* Compact Mobile Score & Lil Yetis Row (guarantees zero horizontal clipping at 390px) */}
          <div className="flex sm:hidden items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 border bg-[#0e1a36]/46 backdrop-blur-md shadow-[0_4px_14px_rgba(8,14,32,0.2)] transition-colors duration-150 ${
                  hud.scoreFeedbackActive || hud.scoreMultiplier > 1
                    ? 'border-[#FFD15C]/90'
                    : 'border-[#FFD15C]/42'
                }`}
                aria-label={UI_COPY.hud.scoreAria}
                data-testid="hud-score-mobile"
              >
                <SmallYetiIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FFF3C4] drop-shadow-[0_1px_2px_rgba(8,14,32,0.65)]">
                  {UI_COPY.hud.scoreLabel}
                </span>
                <span className="font-display text-xs font-bold text-[#FFD15C] tabular-nums leading-none">
                  {hud.score}
                </span>
                {hud.scoreMultiplier > 1 ? (
                  <span
                    className="px-1 py-0.5 rounded bg-[#F59E0B] text-[#141E36] font-display text-[10px] font-extrabold leading-none tabular-nums"
                    data-testid="hud-multiplier-mobile"
                  >
                    ×{hud.scoreMultiplier}
                  </span>
                ) : (
                  <span className="text-[9.5px] font-bold text-[#DCEBFF] tabular-nums leading-none">
                    ({hud.collectedCollectibles}/{hud.totalCollectibles})
                  </span>
                )}
              </div>

              <div
                className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 border border-[#d69be8]/35 bg-[#0e1a36]/46 backdrop-blur-md shadow-[0_4px_14px_rgba(8,14,32,0.2)]"
                aria-label={UI_COPY.hud.lilYetisAria}
                data-testid="hud-followers-mobile"
              >
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#F1DDF8] drop-shadow-[0_1px_2px_rgba(8,14,32,0.65)]">
                  {UI_COPY.hud.lilYetisLabel}
                </span>
                <span className="font-display text-xs font-bold text-[#FFD15C] tabular-nums leading-none">
                  {hud.followerCount}
                </span>
              </div>
            </div>

            {hud.grabCount > 0 && (
              <div
                className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 border border-[#FFB952]/55 bg-[#0e1a36]/46 backdrop-blur-md shadow-[0_4px_14px_rgba(8,14,32,0.2)] shrink-0"
                data-testid="hud-grabs-mobile"
              >
                <span className="text-[11px] font-extrabold text-[#FFD15C] tabular-nums">
                  {UI_COPY.hud.grabsPrefix} {hud.grabCount}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== NON-BLOCKING LEVEL START CREW CALLOUT ==================== */}
      {isPlaying && levelStartBannerText && !hud.steepWarningActive && (
        <div className="fixed inset-x-0 top-[116px] sm:top-[88px] pointer-events-none flex justify-center px-4 z-10">
          <div
            className="rounded-2xl px-4 py-1.5 sm:px-5 sm:py-2 border border-[#FFD15C]/50 bg-[#0e1a36]/54 backdrop-blur-md shadow-[0_8px_22px_rgba(8,14,32,0.28)] text-center"
            data-testid="level-start-callout"
          >
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#CFE0FA] drop-shadow-[0_1px_2px_rgba(8,14,32,0.65)]">
              Level {hud.levelNumber} · {hud.levelName}
            </p>
            <p className="font-display text-sm sm:text-base font-bold tracking-wide text-[#FFD15C] drop-shadow-[0_1px_2px_rgba(8,14,32,0.7)]">
              {levelStartBannerText}
            </p>
          </div>
        </div>
      )}

      {/* ==================== NON-BLOCKING STEEP DESCENT WARNING BANNER ==================== */}
      {isPlaying && hud.steepWarningActive && (
        <div className="fixed left-3 right-[104px] sm:inset-x-0 top-[112px] sm:top-[86px] pointer-events-none flex justify-center sm:px-4 z-10">
          <div
            role="status"
            aria-live="polite"
            className="w-full sm:w-auto max-w-full rounded-2xl px-3 py-1.5 sm:px-6 sm:py-2.5 border-2 border-[#FFB347]/90 bg-[#0d1936]/76 backdrop-blur-md shadow-[0_10px_28px_rgba(8,14,32,0.42)] text-center"
            data-testid="steep-drop-warning"
          >
            <p className="font-display text-[11px] sm:text-lg font-bold tracking-wide sm:tracking-wider uppercase leading-tight text-[#FFD15C] drop-shadow-[0_1px_2px_rgba(8,14,32,0.8)]">
              {UI_COPY.hud.steepDropWarning}
            </p>
            <p className="hidden sm:block text-[11px] font-extrabold uppercase tracking-wider text-[#E2EEFF] mt-0.5">
              {UI_COPY.hud.steepDropDesktopHint}
            </p>
            <p className="block sm:hidden text-[9px] font-extrabold uppercase tracking-wide leading-tight text-[#E2EEFF] mt-0.5">
              {UI_COPY.hud.steepDropMobileHint}
            </p>
          </div>
        </div>
      )}

      {/* ==================== TOP-DOWN ALPINE MINI MAP (ACTIVE PLAY & PAUSE) ==================== */}
      {(isPlaying || isPaused) && hud.miniMap && (
        <div className="fixed right-2.5 top-[92px] sm:right-5 sm:top-[86px] pointer-events-none z-10">
          <MiniMap miniMap={hud.miniMap} avalancheDanger={hud.avalancheDanger} />
        </div>
      )}

      {/* ==================== BOTTOM AIRBORNE / BRAKE / GRAB CONTROLS & FEEDBACK ==================== */}
      {isPlaying && (
        <div className="w-full px-3.5 pb-4 sm:px-6 sm:pb-5 flex items-end justify-between gap-3">
          {/* Left-bottom: Mobile holdable BRAKE button (isolated pointerId) + post-landing GRAB feedback badge */}
          <div className="flex items-end gap-2 min-h-[40px]">
            <button
              type="button"
              tabIndex={-1}
              aria-label={UI_COPY.hud.mobileBrakeAria}
              data-testid="btn-brake-mobile"
              onPointerDown={(e) => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                e.stopPropagation();
                e.preventDefault();
                if (brakePointerIdRef.current !== null) return;
                brakePointerIdRef.current = e.pointerId;
                setBrakePressed(true);
                onBrakeChange(true);
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  // Ignore in synthetic pointer environments
                }
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                releaseBrakeTouch(e.pointerId);
              }}
              onPointerCancel={(e) => {
                e.stopPropagation();
                releaseBrakeTouch(e.pointerId);
              }}
              onLostPointerCapture={() => {
                releaseBrakeTouch();
              }}
              onContextMenu={(e) => e.preventDefault()}
              className={`flex sm:hidden pointer-events-auto select-none touch-none items-center justify-center rounded-2xl w-20 h-16 border-2 backdrop-blur-md font-display text-sm font-bold tracking-wider uppercase transition-transform ${
                brakePressed || hud.isBraking
                  ? 'scale-95 bg-[#38BDF8]/88 text-[#0F1B35] border-[#E0F2FE] shadow-[0_4px_14px_rgba(8,14,32,0.32)]'
                  : hud.steepPhase === 'APPROACH' || hud.steepPhase === 'DESCENT'
                    ? 'bg-[#EB7A28]/86 text-white border-[#FFD15C] shadow-[0_6px_20px_rgba(8,14,32,0.36)]'
                    : 'bg-[#0e1a36]/52 text-white border-white/28 shadow-[0_6px_18px_rgba(8,14,32,0.26)]'
              }`}
            >
              {UI_COPY.hud.mobileBrake}
            </button>

            {hud.isGrabbing && (
              <div className="fixed bottom-24 sm:bottom-20 inset-x-0 flex justify-center pointer-events-none z-10">
                <div
                  className="rounded-xl px-3.5 py-1.5 border border-[#FFD15C]/90 bg-[#0e1a36]/82 shadow-[0_8px_22px_rgba(8,14,32,0.38)] inline-flex items-center gap-2 whitespace-nowrap"
                  data-testid="hud-live-grab"
                >
                  <span className="font-display text-xs sm:text-base font-bold tracking-wider text-[#FFD15C] uppercase">
                    {hud.activeGrabLabel}
                  </span>
                  <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-[#DCEBFF]">
                    ×{Math.min(5, hud.scoreMultiplier + 1)} NEXT
                  </span>
                </div>
              </div>
            )}

            {!hud.isGrabbing && hud.trickFeedbackActive && (
              <div
                className="fixed bottom-24 inset-x-0 flex justify-center pointer-events-none sm:static sm:inset-auto sm:block"
              >
                <div
                  className="rounded-xl px-3.5 py-1.5 border border-[#FFB952]/85 bg-[#0e1a36]/78 shadow-[0_8px_22px_rgba(8,14,32,0.34)] inline-flex items-center gap-2 whitespace-nowrap"
                  data-testid="hud-grab-toast"
                >
                  <span className="font-display text-xs sm:text-base font-bold tracking-wider text-[#FFD15C] uppercase">
                    {hud.lastTrickLabel ?? UI_COPY.hud.grabBadge}
                  </span>
                  {hud.lastTrickPoints > 0 && (
                    <span className="text-[11px] sm:text-xs font-extrabold text-white tabular-nums">
                      +{hud.lastTrickPoints}
                    </span>
                  )}
                  {hud.scoreMultiplier > 1 && (
                    <span className="px-1.5 py-0.5 rounded bg-[#F59E0B] text-[#141E36] font-display text-[11px] font-extrabold leading-none tabular-nums">
                      ×{hud.scoreMultiplier}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right-bottom: Dedicated TRICK button (Desktop & Mobile) + Mobile JUMP button */}
          <div className="flex items-center gap-2">
            {/* Desktop compact grab count readout beside the dedicated TRICK button (hidden while TRICK button already displays active grab name) */}
            {hud.grabCount > 0 && !hud.isGrabbing && (
              <div
                className="hidden sm:flex items-center gap-2 rounded-xl px-3 py-1.5 border border-white/22 bg-[#0e1a36]/62"
                data-testid="hud-grab-desktop"
              >
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#FFD15C] drop-shadow-[0_1px_2px_rgba(8,14,32,0.65)]">
                  {`${UI_COPY.hud.grabsPrefix}: ${hud.grabCount}`}
                </span>
              </div>
            )}

            {/* Mobile jump button (JUMP) — isolated pointer so steering drag never conflicts */}
            <button
              type="button"
              tabIndex={-1}
              aria-label={UI_COPY.hud.mobileJumpAria}
              data-testid="btn-jump-mobile"
              onPointerDown={(e) => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                e.stopPropagation();
                e.preventDefault();
                onJump();
              }}
              onContextMenu={(e) => e.preventDefault()}
              className="flex sm:hidden pointer-events-auto select-none touch-none items-center justify-center rounded-2xl w-20 h-16 border-2 font-display text-sm font-bold tracking-wider uppercase active:scale-95 transition-transform bg-[#172952]/72 text-white border-[#8FD1FF]/70 shadow-[0_6px_18px_rgba(8,14,32,0.28)]"
            >
              {UI_COPY.hud.mobileJump}
            </button>

            {/* Dedicated TRICK button (visible on BOTH Desktop & Mobile): press to jump, hold in mid-air to Grab! */}
            <button
              type="button"
              tabIndex={-1}
              aria-label={UI_COPY.hud.mobileTrickAria}
              data-testid="btn-trick"
              onPointerDown={(e) => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                e.stopPropagation();
                e.preventDefault();
                if (trickPointerIdRef.current !== null) return;
                trickPointerIdRef.current = e.pointerId;
                setTrickPressed(true);
                applyTrickHeld(true);
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  // Ignore in synthetic pointer environments
                }
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                releaseTrickTouch(e.pointerId);
              }}
              onPointerCancel={(e) => {
                e.stopPropagation();
                releaseTrickTouch(e.pointerId);
              }}
              onLostPointerCapture={() => {
                releaseTrickTouch();
              }}
              onContextMenu={(e) => e.preventDefault()}
              className={`flex pointer-events-auto cursor-pointer select-none touch-none flex-col items-center justify-center rounded-2xl w-20 h-16 sm:w-auto sm:min-w-[138px] sm:h-14 sm:px-4 border-2 transition-transform ${
                trickPressed || hud.isGrabbing
                  ? 'scale-95 bg-[#F59E0B]/95 text-[#141E36] border-[#FFF3C4] shadow-[0_6px_18px_rgba(245,158,11,0.45)]'
                  : hud.jumpState === 'AIRBORNE'
                    ? 'bg-[#DF722D]/90 text-white border-[#FFD15C] shadow-[0_6px_20px_rgba(8,14,32,0.36)]'
                    : 'bg-[#0e1a36]/72 text-white border-[#FFD15C]/70 hover:bg-[#172952]/85 shadow-[0_6px_18px_rgba(8,14,32,0.28)]'
              }`}
            >
              <span className="flex items-center gap-1.5 font-display text-sm sm:text-base font-bold tracking-wider uppercase leading-none whitespace-nowrap">
                <span>
                  {hud.isGrabbing ? UI_COPY.hud.grabBadge : UI_COPY.hud.mobileTrick}
                </span>
                {!hud.isGrabbing && (
                  <span className="hidden sm:inline-block rounded bg-white/18 px-1.5 py-0.5 font-sans text-[9px] font-extrabold tracking-wider text-[#FFF3C4]">
                    {UI_COPY.hud.trickKeyHint}
                  </span>
                )}
              </span>
              <span
                className={`hidden sm:block text-[9px] font-extrabold uppercase tracking-wider mt-0.5 leading-none whitespace-nowrap ${
                  trickPressed || hud.isGrabbing ? 'text-[#141E36]/85' : 'text-[#DCEBFF]'
                }`}
              >
                {hud.isGrabbing
                  ? UI_COPY.hud.grabActive
                  : hud.jumpState === 'AIRBORNE'
                    ? UI_COPY.hud.trickAirSub
                    : UI_COPY.hud.trickGroundSub}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ==================== PAUSE MODAL ==================== */}
      {isPaused && (
        <div
          className="fixed inset-0 z-30 pointer-events-auto flex items-center justify-center p-4 bg-[#0b1329]/40 backdrop-blur-sm"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pause-title"
            className="w-full max-w-sm rounded-3xl p-6 border border-white/25 bg-[#0f1c3a]/56 backdrop-blur-xl shadow-[0_18px_46px_rgba(6,10,24,0.42)] text-center"
          >
            <p className="text-xs font-extrabold uppercase tracking-widest text-[#FFD15C]">
              Level {hud.levelNumber} / {hud.totalLevels} · {hud.levelName}
            </p>
            <h2
              id="pause-title"
              className="font-display text-3xl font-bold tracking-wide uppercase text-white mt-0.5"
            >
              {UI_COPY.pause.heading}
            </h2>
            <p className="mt-1.5 text-sm font-medium text-[#D6E4FB]">
              {formatPauseSummary(hud.followerCount, hud.progressPct)}
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onResume}
                className="font-display cursor-pointer w-full py-3 rounded-2xl bg-[#EB7A28] hover:bg-[#F58838] text-white text-lg font-bold tracking-wide uppercase border-2 border-[#161E36] shadow-[0_4px_0_#161E36]"
              >
                {UI_COPY.pause.resume}
              </button>
              <button
                type="button"
                onClick={onRetryLevel}
                className="cursor-pointer w-full py-2.5 rounded-2xl bg-white/14 hover:bg-white/22 text-white text-sm font-extrabold uppercase tracking-wider border border-white/22 transition-colors"
              >
                {UI_COPY.pause.restartLevel}
              </button>
              <button
                type="button"
                onClick={onNewGame}
                className="cursor-pointer w-full py-2 rounded-2xl bg-white/8 hover:bg-white/16 text-[#E2EEFF] text-xs font-bold uppercase tracking-wider border border-white/16 transition-colors"
              >
                {UI_COPY.pause.newGame}
              </button>
              <button
                type="button"
                onClick={onReturnToTitle}
                className="cursor-pointer w-full py-1.5 rounded-xl text-[#C9DAF7] hover:text-white text-xs font-bold uppercase tracking-wider transition-colors"
              >
                {UI_COPY.pause.mainMenu}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== VICTORY ARRIVAL BANNER (PRE-OVERLAY 3D ARRIVAL PHASE) ==================== */}
      {isVictory && !hud.victoryUiReady && (
        <div className="fixed inset-0 pointer-events-none flex flex-col justify-start">
          <div
            className="w-full flex flex-col items-center px-4 pt-5 pb-6 sm:pt-7 sm:pb-8 text-center"
            style={{
              background:
                'linear-gradient(180deg, rgba(16, 26, 52, 0.54) 0%, rgba(16, 26, 52, 0.14) 68%, rgba(16, 26, 52, 0) 100%)',
            }}
          >
            <div
              className="rounded-2xl px-4 py-2 border border-[#FFD15C]/60 bg-[#0e1a36]/54 backdrop-blur-md shadow-[0_6px_18px_rgba(8,14,32,0.28)]"
              data-testid="victory-arriving-banner"
            >
              <span className="font-display text-sm sm:text-base font-bold tracking-wide text-[#FFD15C]">
                {hasRecruitJoined(hud.recruitJoinProgress)
                  ? UI_COPY.victory.recruitMessage
                  : formatArrivalSummary(hud.followerCount)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TRANSPARENT PNG VICTORY & GAME OVER OVERLAY ==================== */}
      {outcomeVisible && (
        <OutcomeOverlay
          hud={hud}
          overlayKey={outcomeOverlayKey}
          onRetryLevel={onRetryLevel}
          onNextLevel={onNextLevel}
          onNewGame={onNewGame}
          onReturnToTitle={onReturnToTitle}
        />
      )}
    </div>
  );
}

