import { useRef } from 'react';
import {
  buildOutcomeOverlayModel,
  type OutcomeFollowerSlot,
} from '../game/outcomeOverlayLogic';
import type { HudSnapshot } from '../game/types';
import { UI_COPY } from '../game/uiCopy';

interface OutcomeOverlayProps {
  hud: HudSnapshot;
  /** Monotonic key incremented on each outcome appearance so CSS entrance animations reset cleanly on retry. */
  overlayKey: number;
  onRetryLevel: () => void;
  onNextLevel: () => void;
  onNewGame: () => void;
  onReturnToTitle: () => void;
}

function FollowerSprite({
  slot,
  isVictory,
  totalFollowers,
}: {
  slot: OutcomeFollowerSlot;
  isVictory: boolean;
  totalFollowers: number;
}) {
  // Keep aspect ratio 100% original (object-contain) with zero box border or background.
  // Scale responsively from 1 up to 9 Lil Yetis (Level 10) so zero overflow or cropping occurs on 390px or 1440px.
  const sizeClass =
    totalFollowers >= 7
      ? 'w-auto h-auto max-h-[68px] max-w-[16vw] sm:max-h-[126px] sm:max-w-[92px] md:max-h-[146px] md:max-w-[106px]'
      : totalFollowers >= 5
        ? 'w-auto h-auto max-h-[76px] max-w-[18vw] sm:max-h-[146px] sm:max-w-[116px] md:max-h-[168px] md:max-w-[132px]'
        : totalFollowers >= 3
          ? 'w-auto h-auto max-h-[96px] max-w-[15vw] sm:max-h-[166px] sm:max-w-[144px] md:max-h-[186px] md:max-w-[162px]'
          : totalFollowers >= 2
            ? 'w-auto h-auto max-h-[118px] max-w-[23vw] sm:max-h-[192px] sm:max-w-[185px] md:max-h-[214px] md:max-w-[205px]'
            : 'w-auto h-auto max-h-[142px] max-w-[30vw] sm:max-h-[208px] sm:max-w-[205px] md:max-h-[228px] md:max-w-[220px]';

  const overlapClass =
    totalFollowers >= 7
      ? 'sm:-mx-2 md:-mx-1.5'
      : totalFollowers >= 5
        ? 'sm:-mx-1.5'
        : '';

  return (
    <div
      className={`shrink-0 flex items-end justify-center ${overlapClass} ${
        isVictory ? 'outcome-victory-float' : 'outcome-defeat-settle'
      }`}
      style={{
        animationDelay: `${slot.delaySeconds}s`,
      }}
      data-testid="outcome-follower-yeti"
      data-follower-index={slot.index}
      data-follower-side={slot.side}
    >
      <img
        src={slot.src}
        alt={`${UI_COPY.lilYetiAltPrefix} ${slot.index}`}
        draggable={false}
        className={`${sizeClass} object-contain select-none pointer-events-none bg-transparent border-0 border-none`}
        style={{
          filter: 'drop-shadow(0 12px 18px rgba(10, 18, 38, 0.42))',
        }}
      />
    </div>
  );
}

export function OutcomeOverlay({
  hud,
  overlayKey,
  onRetryLevel,
  onNextLevel,
  onNewGame,
  onReturnToTitle,
}: OutcomeOverlayProps) {
  const model = buildOutcomeOverlayModel(hud);
  const actionLockedRef = useRef(false);

  // Unlock action guard whenever a new overlay appears
  const lastKeyRef = useRef<number>(overlayKey);
  if (lastKeyRef.current !== overlayKey) {
    lastKeyRef.current = overlayKey;
    actionLockedRef.current = false;
  }

  if (!model) {
    return null;
  }

  const isVictory = model.kind === 'victory';

  const handleNextOnce = () => {
    if (actionLockedRef.current) return;
    actionLockedRef.current = true;
    onNextLevel();
  };

  const handleNewGameOnce = () => {
    if (actionLockedRef.current) return;
    actionLockedRef.current = true;
    onNewGame();
  };

  const handleRetryOnce = () => {
    if (actionLockedRef.current) return;
    actionLockedRef.current = true;
    onRetryLevel();
  };

  const hasLargeCrew = model.arrivedFollowerCount >= 5;

  const heroSizeClass =
    model.arrivedFollowerCount >= 7
      ? isVictory
        ? 'w-auto h-auto max-h-[168px] max-w-[54vw] sm:max-h-[246px] sm:max-w-[230px] md:max-h-[282px] md:max-w-[260px]'
        : 'w-auto h-auto max-h-[160px] max-w-[56vw] sm:max-h-[234px] sm:max-w-[260px] md:max-h-[268px] md:max-w-[295px]'
      : model.arrivedFollowerCount >= 5
        ? isVictory
          ? 'w-auto h-auto max-h-[178px] max-w-[56vw] sm:max-h-[268px] sm:max-w-[265px] md:max-h-[304px] md:max-w-[295px]'
          : 'w-auto h-auto max-h-[168px] max-w-[58vw] sm:max-h-[254px] sm:max-w-[300px] md:max-h-[288px] md:max-w-[335px]'
        : model.arrivedFollowerCount >= 3
          ? isVictory
            ? 'w-auto h-auto max-h-[176px] max-w-[34vw] sm:max-h-[282px] sm:max-w-[295px] md:max-h-[318px] md:max-w-[325px]'
            : 'w-auto h-auto max-h-[168px] max-w-[36vw] sm:max-h-[268px] sm:max-w-[335px] md:max-h-[302px] md:max-w-[365px]'
          : model.arrivedFollowerCount >= 2
            ? isVictory
              ? 'w-auto h-auto max-h-[196px] max-w-[42vw] sm:max-h-[296px] sm:max-w-[320px] md:max-h-[332px] md:max-w-[350px]'
              : 'w-auto h-auto max-h-[186px] max-w-[44vw] sm:max-h-[282px] sm:max-w-[365px] md:max-h-[316px] md:max-w-[395px]'
            : model.arrivedFollowerCount === 1
              ? isVictory
                ? 'w-auto h-auto max-h-[228px] max-w-[54vw] sm:max-h-[314px] sm:max-w-[345px] md:max-h-[348px] md:max-w-[375px]'
                : 'w-auto h-auto max-h-[214px] max-w-[56vw] sm:max-h-[296px] sm:max-w-[390px] md:max-h-[330px] md:max-w-[420px]'
              : isVictory
                ? 'w-auto h-auto max-h-[268px] max-w-[82vw] sm:max-h-[344px] sm:max-w-[400px] md:max-h-[382px] md:max-w-[430px]'
                : 'w-auto h-auto max-h-[252px] max-w-[86vw] sm:max-h-[324px] sm:max-w-[445px] md:max-h-[360px] md:max-w-[480px]';

  return (
    <div
      key={`${model.kind}-${model.levelNumber}-${overlayKey}`}
      className="fixed inset-0 z-20 pointer-events-auto flex flex-col items-center px-3 py-2 sm:px-6 sm:py-2 overflow-x-hidden overflow-y-auto touch-pan-y outcome-backdrop-fade"
      style={{
        background: isVictory
          ? 'radial-gradient(circle at 50% 44%, rgba(14, 24, 50, 0.24) 0%, rgba(9, 15, 32, 0.48) 100%)'
          : 'radial-gradient(circle at 50% 44%, rgba(12, 22, 44, 0.28) 0%, rgba(8, 14, 30, 0.52) 100%)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
      }}
      data-testid={isVictory ? 'outcome-overlay-victory' : 'outcome-overlay-gameover'}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Scroll-safe inner stack: vertically centered when viewport has room, top-aligned scrollable fallback on short screens */}
      <div className="my-auto w-full flex flex-col items-center gap-1.5 sm:gap-2">
        {/* 1. Compact Header strictly above hero raised hand/head */}
        <header
          role="dialog"
          aria-modal="true"
          aria-labelledby={isVictory ? 'victory-title' : 'gameover-title'}
          className="w-full max-w-xl flex flex-col items-center text-center shrink-0"
          data-testid={isVictory ? 'victory-panel' : 'gameover-panel'}
        >
          <h2
            id={isVictory ? 'victory-title' : 'gameover-title'}
            className="font-display text-[clamp(26px,4vw,46px)] font-bold tracking-wide uppercase text-white hud-text-stroke leading-[1.02]"
          >
            {isVictory ? UI_COPY.victory.heading : UI_COPY.gameover.heading}
          </h2>
          <p
            className="mt-0.5 text-[clamp(12px,1.2vw,16px)] font-bold text-[#F2F7FF] hud-text-stroke leading-tight"
            data-testid={isVictory ? 'victory-level-subtitle' : 'gameover-subtitle'}
          >
            {isVictory
              ? `Level ${model.levelNumber} · ${model.levelName}`
              : UI_COPY.gameover.message}
          </p>
        </header>

        {/* 2. Pure Transparent PNG Hero & Lil Yeti Stage — shrink-0 preserves full hero dimensions with zero overlap */}
        <div
          className="shrink-0 w-full max-w-6xl flex items-end justify-center pt-2 pb-1"
          data-testid="outcome-character-stage"
          data-follower-count={model.arrivedFollowerCount}
        >
          <div
            className={`flex items-end justify-center max-w-full ${
              hasLargeCrew
                ? 'flex-wrap sm:flex-nowrap gap-x-1 gap-y-1.5 sm:gap-0'
                : 'flex-nowrap gap-1 sm:gap-4'
            }`}
          >
            {model.leftFollowers.map((slot) => (
              <FollowerSprite
                key={`left-${slot.index}`}
                slot={slot}
                isVictory={isVictory}
                totalFollowers={model.arrivedFollowerCount}
              />
            ))}

            <div
              className={`shrink-0 flex items-end justify-center ${
                hasLargeCrew ? 'order-first basis-full sm:order-none sm:basis-auto z-10' : 'z-10'
              } ${isVictory ? 'outcome-victory-float' : 'outcome-defeat-settle'}`}
            >
              <img
                src={model.heroSrc}
                alt={model.heroAlt}
                draggable={false}
                data-testid="outcome-hero-img"
                data-outcome-kind={model.kind}
                className={`${heroSizeClass} object-contain select-none pointer-events-none bg-transparent border-0 border-none`}
                style={{
                  filter: 'drop-shadow(0 16px 26px rgba(10, 16, 36, 0.48))',
                }}
              />
            </div>

            {model.rightFollowers.map((slot) => (
              <FollowerSprite
                key={`right-${slot.index}`}
                slot={slot}
                isVictory={isVictory}
                totalFollowers={model.arrivedFollowerCount}
              />
            ))}
          </div>
        </div>

        {/* 3. Arrival / Summary Card & Action Buttons strictly below hero and snowboard in normal flow */}
        <div className="w-full max-w-md shrink-0 flex flex-col items-center gap-1.5 pb-0.5">
          {isVictory ? (
            <div
              className="w-full rounded-xl px-3 py-1.5 sm:px-3.5 sm:py-2 border border-white/16 bg-[#0a1428]/28 backdrop-blur-md shadow-[0_6px_18px_rgba(8,14,32,0.18)] flex flex-col gap-1 text-center text-[clamp(12px,1.1vw,15px)] leading-snug"
              data-testid="victory-arrival-card"
            >
              <div
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 font-bold text-[#EDF4FF] border-b border-white/12 pb-1"
                data-testid="victory-arrived-followers"
              >
                <span className="text-[#C8DAF8] uppercase tracking-wider text-[clamp(10px,0.95vw,12px)]">
                  {UI_COPY.victory.arrivedHeading}
                </span>
                <span className="text-white tabular-nums">
                  {model.arrivedFollowersLabel}
                </span>
              </div>

              <div
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 font-bold text-[#EDF4FF] border-b border-white/12 pb-1"
                data-testid="victory-score-summary"
              >
                <span className="text-[#C8DAF8] uppercase tracking-wider text-[clamp(10px,0.95vw,12px)]">
                  {UI_COPY.hud.scoreLabel}
                </span>
                <span className="flex items-center gap-2 text-white tabular-nums">
                  <span className="font-display text-[#FFD15C]" data-testid="victory-score-value">
                    {model.score.toLocaleString()}
                  </span>
                  {model.grabCount > 0 && (
                    <span className="text-[clamp(11px,1vw,13px)] text-[#DCEAFF]">
                      · {model.grabCount} {model.grabCount === 1 ? 'Grab' : 'Grabs'}
                      {model.peakMultiplier > 1 ? ` · Max ×${model.peakMultiplier}` : ''}
                    </span>
                  )}
                </span>
              </div>

              {model.showRecruitBanner && model.recruitLabel && (
                <div
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 font-extrabold text-[#FFD15C] pt-0.5 text-left"
                  data-testid="victory-recruit-info"
                >
                  <span className="text-[#FFD15C]">{model.recruitLabel}</span>
                  {model.nextLevelCrewLabel && (
                    <span
                      className="text-[#DCEAFF] font-bold text-[clamp(11px,1vw,13px)] tabular-nums shrink-0"
                      data-testid="victory-next-crew"
                    >
                      {model.nextLevelCrewLabel}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div
              className="w-full rounded-xl px-3 py-1.5 sm:px-3.5 sm:py-2 border border-white/16 bg-[#0a1428]/28 backdrop-blur-md shadow-[0_6px_18px_rgba(8,14,32,0.18)] flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5 text-[clamp(12px,1.1vw,15px)] leading-snug font-bold text-[#EDF4FF]"
              data-testid="gameover-summary"
            >
              <span className="tabular-nums" data-testid="gameover-level-info">
                {model.levelInfoLabel}
              </span>
              <span className="text-white/40" aria-hidden="true">·</span>
              <span className="text-[#FFD15C]" data-testid="gameover-follower-info">
                {model.arrivedFollowersLabel}
              </span>
              {(model.score > 0 || model.grabCount > 0) && (
                <>
                  <span className="text-white/40" aria-hidden="true">·</span>
                  <span className="tabular-nums text-white" data-testid="gameover-score-info">
                    Score {model.score.toLocaleString()}
                    {model.peakMultiplier > 1 ? ` (Max ×${model.peakMultiplier})` : ''}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Action Buttons */}
          {isVictory ? (
            <div className="flex flex-col items-center gap-1.5 w-full">
              {model.hasNextLevel ? (
                <button
                  type="button"
                  data-start="true"
                  data-testid="btn-next-level"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={handleNextOnce}
                  className="font-display cursor-pointer px-7 sm:px-9 py-2 rounded-xl bg-[#EB7A28] hover:bg-[#F58838] active:translate-y-0.5 text-white text-[clamp(16px,1.6vw,20px)] leading-tight font-bold tracking-wider uppercase border-2 border-[#161E36] shadow-[0_3px_0_#161E36,0_8px_18px_rgba(10,16,32,0.34)] transition-transform focus:outline-none focus-visible:ring-4 focus-visible:ring-[#8FD1FF]"
                >
                  {UI_COPY.victory.nextLevelButton}
                </button>
              ) : (
                <button
                  type="button"
                  data-start="true"
                  data-testid="btn-new-game"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={handleNewGameOnce}
                  className="font-display cursor-pointer px-7 sm:px-9 py-2 rounded-xl bg-[#EB7A28] hover:bg-[#F58838] active:translate-y-0.5 text-white text-[clamp(16px,1.6vw,20px)] leading-tight font-bold tracking-wider uppercase border-2 border-[#161E36] shadow-[0_3px_0_#161E36,0_8px_18px_rgba(10,16,32,0.34)] transition-transform focus:outline-none focus-visible:ring-4 focus-visible:ring-[#8FD1FF]"
                >
                  {UI_COPY.victory.playAgainButton}
                </button>
              )}

              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  data-testid="btn-victory-retry"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={handleRetryOnce}
                  className="cursor-pointer px-3.5 py-1 min-h-[34px] rounded-lg bg-[#0a1428]/28 hover:bg-[#14254a]/46 backdrop-blur-md text-white text-[clamp(10.5px,0.95vw,12px)] font-extrabold uppercase tracking-wider border border-white/16 shadow-[0_2px_10px_rgba(8,14,32,0.16)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8FD1FF]"
                >
                  {UI_COPY.victory.replayLevelButton}
                </button>
                <button
                  type="button"
                  data-testid="btn-victory-menu"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={onReturnToTitle}
                  className="cursor-pointer px-3.5 py-1 min-h-[34px] rounded-lg bg-[#0a1428]/22 hover:bg-[#14254a]/42 backdrop-blur-md text-[#E2EEFF] text-[clamp(10.5px,0.95vw,12px)] font-extrabold uppercase tracking-wider border border-white/14 shadow-[0_2px_10px_rgba(8,14,32,0.14)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8FD1FF]"
                >
                  {UI_COPY.victory.mainMenuButton}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 w-full">
              <button
                type="button"
                data-start="true"
                data-testid="btn-retry-level"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleRetryOnce}
                className="font-display cursor-pointer px-8 py-2 rounded-xl bg-[#EB7A28] hover:bg-[#F58838] active:translate-y-0.5 text-white text-[clamp(16px,1.6vw,20px)] leading-tight font-bold tracking-wider uppercase border-2 border-[#161E36] shadow-[0_3px_0_#161E36,0_8px_18px_rgba(10,16,32,0.34)] transition-transform focus:outline-none focus-visible:ring-4 focus-visible:ring-[#8FD1FF]"
              >
                {UI_COPY.gameover.tryAgainButton}
              </button>
              <button
                type="button"
                data-testid="btn-gameover-menu"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onReturnToTitle}
                className="cursor-pointer px-4 py-1 min-h-[34px] rounded-lg bg-[#0a1428]/24 hover:bg-[#14254a]/42 backdrop-blur-md text-[#E2EEFF] text-[clamp(10.5px,0.95vw,12px)] font-extrabold uppercase tracking-wider border border-white/14 shadow-[0_2px_10px_rgba(8,14,32,0.14)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8FD1FF]"
              >
                {UI_COPY.gameover.mainMenuButton}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
