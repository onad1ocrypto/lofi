import { useEffect, useMemo, useState } from 'react';
import {
  buildSuiLeaderboard,
  type SuiLeaderboardEntry,
} from '../game/suiLeaderboardLogic';
import {
  SUI_AVATAR_OPTIONS,
  type SuiAvatarId,
  type SuiPlayerProfile,
} from '../game/suiProfileLogic';
import { loadAllSavedWalletSuiProfiles } from '../game/suiWalletService';
import { UI_COPY } from '../game/uiCopy';

interface LeaderboardModalProps {
  connectedAddress: string | null;
  activeWalletProfile: SuiPlayerProfile | null;
  onConnectWallet: () => void;
  onClose: () => void;
}

/** Resilient Lofi avatar thumbnail using the 4 local avatar portraits. */
function LeaderboardAvatar({ avatarId }: { avatarId: SuiAvatarId }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [avatarId]);

  const option =
    SUI_AVATAR_OPTIONS.find((item) => item.id === avatarId) ?? SUI_AVATAR_OPTIONS[0];

  return (
    <div className="w-9 h-9 rounded-xl overflow-hidden border border-[#8FD1FF]/35 bg-[#10213F] flex items-center justify-center shrink-0">
      {!failed ? (
        <img
          src={option.imageSrc}
          alt={option.label}
          referrerPolicy="no-referrer"
          decoding="async"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <svg viewBox="0 0 36 36" className="w-4/5 h-4/5" fill="none" aria-hidden="true">
          <circle cx="18" cy="15" r="8" fill="#F4F8FF" stroke="#18213A" strokeWidth="1.5" />
          <rect x="11.5" y="10.5" width="13" height="4.8" rx="2.4" fill="#F97316" stroke="#18213A" strokeWidth="1.2" />
          <path d="M9 29C10.8 23.2 25.2 23.2 27 29" fill="#2563EB" stroke="#18213A" strokeWidth="1.5" />
        </svg>
      )}
    </div>
  );
}

function getRankVisualStyle(rank: number): {
  rowClass: string;
  rankTextClass: string;
  medalClass: string;
} {
  if (rank === 1) {
    return {
      rowClass:
        'border-[#FFD15C]/45 bg-gradient-to-r from-[#F59E0B]/16 via-[#0E1E3A]/80 to-[#0B1730]/75',
      rankTextClass: 'text-[#FFD15C]',
      medalClass: 'border-[#FFD15C]/70 bg-[#F59E0B]/24 text-[#FEF3C7]',
    };
  }
  if (rank === 2) {
    return {
      rowClass:
        'border-[#CBD5E1]/35 bg-gradient-to-r from-[#94A3B8]/14 via-[#0D1C37]/78 to-[#0B1730]/75',
      rankTextClass: 'text-[#E2E8F0]',
      medalClass: 'border-[#CBD5E1]/55 bg-[#94A3B8]/22 text-[#F8FAFC]',
    };
  }
  if (rank === 3) {
    return {
      rowClass:
        'border-[#FB923C]/40 bg-gradient-to-r from-[#EA580C]/14 via-[#0D1C37]/78 to-[#0B1730]/75',
      rankTextClass: 'text-[#FDBA74]',
      medalClass: 'border-[#FB923C]/55 bg-[#EA580C]/22 text-[#FFEDD5]',
    };
  }
  return {
    rowClass: 'border-white/10 bg-white/[0.035]',
    rankTextClass: 'text-[#B8D0F0]',
    medalClass: 'border-white/12 bg-white/[0.04] text-[#C8DAF8]',
  };
}

function LeaderboardRow({ entry }: { entry: SuiLeaderboardEntry }) {
  const visual = getRankVisualStyle(entry.rank);
  const isTopThree = entry.rank <= 3;

  const containerClass = entry.isCurrentPlayer
    ? 'border-[#38BDF8]/80 bg-gradient-to-r from-[#0EA5E9]/24 via-[#0E2447]/88 to-[#10294F]/84 shadow-[0_0_0_1px_rgba(56,189,248,0.28)]'
    : visual.rowClass;

  return (
    <div
      role="row"
      data-testid={`leaderboard-row-${entry.rank}`}
      data-current-player={entry.isCurrentPlayer ? 'true' : 'false'}
      data-seed={entry.isSeed ? 'true' : 'false'}
      className={`grid grid-cols-[44px_minmax(0,1fr)_52px_56px_74px] sm:grid-cols-[50px_minmax(0,1fr)_64px_66px_86px] items-center gap-2 rounded-xl px-2.5 sm:px-3 py-2 border transition-colors ${containerClass}`}
    >
      {/* Rank (#1, #2, #3 highlighted) */}
      <div role="cell" className="flex items-center justify-center">
        <span
          className={`inline-flex items-center justify-center w-8 h-7 rounded-lg border font-display text-xs sm:text-sm font-bold tabular-nums leading-none ${
            isTopThree
              ? visual.medalClass
              : entry.isCurrentPlayer
                ? 'border-[#8FD1FF]/55 bg-[#38BDF8]/20 text-white'
                : visual.medalClass
          }`}
        >
          #{entry.rank}
        </span>
      </div>

      {/* Avatar + Username (or shortened Sui address if no username) */}
      <div role="cell" className="flex items-center gap-2.5 min-w-0">
        <LeaderboardAvatar avatarId={entry.avatarId} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`text-xs sm:text-[13px] font-extrabold truncate leading-tight ${
                entry.hasCustomUsername ? 'text-white' : 'font-mono text-[#BAE6FD]'
              }`}
              data-testid={`leaderboard-name-${entry.rank}`}
            >
              {entry.displayName}
            </span>
            {entry.isCurrentPlayer && (
              <span
                data-testid="leaderboard-you-tag"
                className="text-[10px] font-extrabold uppercase tracking-wider text-[#7DD3FC] shrink-0"
              >
                ({UI_COPY.leaderboard.youTag})
              </span>
            )}
          </div>
          {entry.hasCustomUsername && (
            <p className="mt-0.5 font-mono text-[10px] text-[#9BB6D6]/85 tabular-nums truncate leading-none">
              {entry.shortAddress}
            </p>
          )}
        </div>
      </div>

      {/* Highest Completed Level */}
      <div role="cell" className="text-right">
        <span
          className="font-display text-xs sm:text-sm font-bold text-white tabular-nums"
          data-testid={`leaderboard-level-${entry.rank}`}
        >
          LV {entry.highestCompletedLevel}
        </span>
      </div>

      {/* Claimed Badges (X/7) */}
      <div role="cell" className="text-right">
        <span
          className={`text-xs font-bold tabular-nums ${
            entry.claimedBadgesCount > 0 ? 'text-[#A7F3D0]' : 'text-[#9BB6D6]/80'
          }`}
          data-testid={`leaderboard-badges-${entry.rank}`}
        >
          {entry.claimedBadgesCount}/{entry.totalBadgesCount}
        </span>
      </div>

      {/* Total Points (Levels + Daily Check-Ins) */}
      <div role="cell" className="text-right">
        <span
          className={`font-display text-xs sm:text-sm font-bold tabular-nums ${
            isTopThree || entry.isCurrentPlayer ? 'text-[#FFD15C]' : 'text-[#E8F2FF]'
          }`}
          data-testid={`leaderboard-points-${entry.rank}`}
        >
          {entry.totalPoints.toLocaleString('en-US')}
        </span>
      </div>
    </div>
  );
}

export function LeaderboardModal({
  connectedAddress,
  activeWalletProfile,
  onConnectWallet,
  onClose,
}: LeaderboardModalProps) {
  // Close cleanly on Escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const board = useMemo(() => {
    const saved = loadAllSavedWalletSuiProfiles();
    return buildSuiLeaderboard(saved, connectedAddress, activeWalletProfile);
  }, [connectedAddress, activeWalletProfile]);

  const currentPlayerOutsideTopTen =
    board.currentPlayerEntry !== null &&
    !board.topEntries.some((entry) => entry.isCurrentPlayer);

  return (
    <div
      className="fixed inset-0 z-40 pointer-events-auto flex items-center justify-center p-3 sm:p-4 bg-[#071020]/54 backdrop-blur-[6px]"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClose}
      data-testid="leaderboard-modal"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leaderboard-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] max-h-[88vh] flex flex-col overflow-hidden rounded-2xl border border-white/20 bg-[#081224]/88 backdrop-blur-xl shadow-[0_18px_48px_rgba(4,9,22,0.56)] text-left"
      >
        {/* Pinned Header */}
        <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-white/10 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#8FD1FF]">
              {UI_COPY.leaderboard.networkKicker}
            </p>
            <h2
              id="leaderboard-modal-title"
              className="mt-0.5 font-display text-xl sm:text-2xl font-bold tracking-wide uppercase text-white leading-tight"
            >
              {UI_COPY.leaderboard.title}
            </h2>
            <p className="mt-0.5 text-[11px] font-medium text-[#C8DAF8]/85 leading-snug">
              {UI_COPY.leaderboard.subtitle}
            </p>
          </div>

          <button
            type="button"
            aria-label={UI_COPY.leaderboard.closeAria}
            onClick={onClose}
            data-testid="btn-leaderboard-close"
            className="cursor-pointer w-8 h-8 rounded-lg flex items-center justify-center border border-white/15 bg-white/8 hover:bg-white/16 text-[#DCEBFF] text-xs font-bold transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8FD1FF]"
          >
            ✕
          </button>
        </div>

        {/* Column Header Bar */}
        <div
          role="row"
          className="px-4 sm:px-5 py-2 border-b border-white/10 bg-[#060E1D]/55 shrink-0"
        >
          <div className="grid grid-cols-[44px_minmax(0,1fr)_52px_56px_74px] sm:grid-cols-[50px_minmax(0,1fr)_64px_66px_86px] items-center gap-2 px-2.5 sm:px-3 text-[10px] font-extrabold uppercase tracking-wider text-[#9BB6D6]">
            <span role="columnheader" className="text-center">
              {UI_COPY.leaderboard.colRank}
            </span>
            <span role="columnheader">{UI_COPY.leaderboard.colRider}</span>
            <span role="columnheader" className="text-right">
              {UI_COPY.leaderboard.colLevel}
            </span>
            <span role="columnheader" className="text-right">
              {UI_COPY.leaderboard.colBadges}
            </span>
            <span role="columnheader" className="text-right">
              {UI_COPY.leaderboard.colPoints}
            </span>
          </div>
        </div>

        {/* Scrollable Top 10 Rows */}
        <div
          role="table"
          aria-label="Top 10 Sui riders"
          data-testid="leaderboard-list"
          className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-3 space-y-1.5"
        >
          {board.topEntries.map((entry) => (
            <LeaderboardRow key={entry.walletAddress} entry={entry} />
          ))}

          {currentPlayerOutsideTopTen && board.currentPlayerEntry && (
            <div className="pt-2 mt-2 border-t border-white/12 space-y-1.5">
              <p className="px-1 text-[10px] font-extrabold uppercase tracking-wider text-[#8FD1FF]">
                {UI_COPY.leaderboard.yourRankPrefix}
              </p>
              <LeaderboardRow entry={board.currentPlayerEntry} />
            </div>
          )}
        </div>

        {/* Pinned Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-white/10 bg-[#060E1D]/60 flex items-center justify-between gap-3 shrink-0">
          {connectedAddress && board.currentPlayerEntry ? (
            <div
              data-testid="leaderboard-player-summary"
              className="flex items-center gap-1.5 text-[11px] font-semibold text-[#CFE0FA] tabular-nums min-w-0 truncate"
            >
              <span className="text-[#8FD1FF] font-extrabold">
                #{board.currentPlayerEntry.rank}
              </span>
              <span aria-hidden="true" className="text-white/35">·</span>
              <span>LV {board.currentPlayerEntry.highestCompletedLevel}</span>
              <span aria-hidden="true" className="text-white/35">·</span>
              <span>
                {board.currentPlayerEntry.claimedBadgesCount}/
                {board.currentPlayerEntry.totalBadgesCount} Badges
              </span>
              <span aria-hidden="true" className="text-white/35">·</span>
              <span className="text-[#FFD15C] font-bold">
                {board.currentPlayerEntry.totalPoints.toLocaleString('en-US')} pts
              </span>
            </div>
          ) : (
            <p
              data-testid="leaderboard-demo-note"
              className="text-[11px] font-medium text-[#C8DAF8]/85 leading-snug"
            >
              {UI_COPY.leaderboard.demoFooterNote}
            </p>
          )}

          {connectedAddress ? (
            <button
              type="button"
              onClick={onClose}
              data-testid="btn-leaderboard-done"
              className="cursor-pointer px-4 py-1.5 rounded-xl border border-white/16 bg-white/8 hover:bg-white/16 text-[11px] font-extrabold uppercase tracking-wider text-white transition-colors whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8FD1FF]"
            >
              {UI_COPY.leaderboard.closeButton}
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnectWallet}
              data-testid="btn-leaderboard-connect"
              className="cursor-pointer px-3.5 py-1.5 rounded-xl border border-[#8FD1FF]/55 bg-[#38BDF8]/20 hover:bg-[#38BDF8]/32 text-[11px] font-extrabold uppercase tracking-wider text-[#E0F2FE] transition-colors whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8FD1FF]"
            >
              {UI_COPY.leaderboard.connectToRankButton}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
