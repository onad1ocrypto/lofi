import { useState } from 'react';
import {
  MAX_GAME_LEVEL,
  MAX_LIL_YETIS_RECRUITED,
  SUI_BADGE_DEFINITIONS,
  hasStreakFireBadge,
  shortenSuiAddress,
  type SuiBadgeId,
  type SuiPlayerProfile,
} from '../game/suiProfileLogic';
import type {
  ConnectedSuiWalletSession,
  DetectedSuiWallet,
} from '../game/suiWalletService';
import { UI_COPY } from '../game/uiCopy';

interface WalletConnectModalProps {
  wallets: readonly DetectedSuiWallet[];
  connecting: boolean;
  errorMessage: string | null;
  onSelectWallet: (wallet: DetectedSuiWallet) => void;
  onRefreshWallets: () => void;
  onClose: () => void;
}

interface ProfileModalProps {
  session: ConnectedSuiWalletSession;
  profile: SuiPlayerProfile;
  loading: boolean;
  onDisconnect: () => void;
  onClose: () => void;
}

function FlameGlyph({
  active,
  className = 'w-4 h-4 shrink-0',
}: {
  active: boolean;
  className?: string;
}) {
  const outerStroke = active ? '#FB923C' : 'rgba(214,228,251,0.38)';
  const outerFill = active ? 'rgba(249,115,22,0.28)' : 'rgba(255,255,255,0.04)';
  const innerFill = active ? '#FFD15C' : 'rgba(214,228,251,0.24)';

  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M12.3 3C12.8 6.4 16.8 7.8 17.5 12.1C18.1 15.8 15.6 19.5 12 19.5C8.3 19.5 6 16.5 6.4 12.6C6.7 10.1 8.3 8.4 9.5 7C9.4 8.7 10.2 9.9 11.1 10.3C10.5 7.9 10.8 5.2 12.3 3Z"
        fill={outerFill}
        stroke={outerStroke}
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M12.1 11.4C13.4 12.8 14.3 14.1 14 15.8C13.8 17 13 17.8 12 17.8C10.9 17.8 10 16.9 10 15.6C10 14.3 11 12.9 12.1 11.4Z"
        fill={innerFill}
      />
    </svg>
  );
}

function BadgeGlyph({ id, unlocked }: { id: SuiBadgeId; unlocked: boolean }) {
  const stroke = unlocked ? '#FFD15C' : 'rgba(214,228,251,0.38)';
  const fill = unlocked ? 'rgba(245,158,11,0.22)' : 'rgba(255,255,255,0.04)';

  if (id === 'streak_fire') {
    return <FlameGlyph active={unlocked} />;
  }
  if (id === 'first_shelter') {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" aria-hidden="true">
        <path d="M4 11.5L12 5L20 11.5V19H4V11.5Z" fill={fill} stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" />
        <rect x="10" y="13" width="4" height="6" rx="0.8" fill={stroke} />
      </svg>
    );
  }
  if (id === 'steep_survivor') {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" aria-hidden="true">
        <path d="M3 18L10 7L14.5 13L17.5 9.5L21 18H3Z" fill={fill} stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === 'alpine_carver') {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" aria-hidden="true">
        <path d="M5 17C8 14 9 10 12 10C15 10 16 7 19 6" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="10" r="2.2" fill={stroke} />
      </svg>
    );
  }
  if (id === 'yeti_squad') {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" aria-hidden="true">
        <circle cx="12" cy="9" r="3.2" fill={fill} stroke={stroke} strokeWidth="1.8" />
        <circle cx="6.2" cy="11.5" r="2.2" fill={fill} stroke={stroke} strokeWidth="1.6" />
        <circle cx="17.8" cy="11.5" r="2.2" fill={fill} stroke={stroke} strokeWidth="1.6" />
        <path d="M4.5 18.5C6.2 15.8 17.8 15.8 19.5 18.5" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" aria-hidden="true">
      <path d="M12 3.5L14.6 8.8L20.4 9.6L16.2 13.7L17.2 19.5L12 16.7L6.8 19.5L7.8 13.7L3.6 9.6L9.4 8.8L12 3.5Z" fill={fill} stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function WalletConnectModal({
  wallets,
  connecting,
  errorMessage,
  onSelectWallet,
  onRefreshWallets,
  onClose,
}: WalletConnectModalProps) {
  return (
    <div
      className="fixed inset-0 z-40 pointer-events-auto flex items-center justify-center p-4 bg-[#091224]/34 backdrop-blur-[5px]"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClose}
      data-testid="wallet-connect-modal"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-connect-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[320px] rounded-2xl p-4 border border-white/18 bg-[#0a1428]/46 backdrop-blur-lg shadow-[0_12px_32px_rgba(6,10,24,0.34)] text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[9.5px] font-extrabold uppercase tracking-widest text-[#8FD1FF]">
              {UI_COPY.wallet.suiNetworkLabel}
            </p>
            <h2
              id="wallet-connect-title"
              className="font-display text-xl font-bold tracking-wide uppercase text-white leading-tight"
            >
              {UI_COPY.wallet.connectTitle}
            </h2>
          </div>
          <button
            type="button"
            aria-label={UI_COPY.wallet.closeAria}
            onClick={onClose}
            data-testid="btn-wallet-modal-close"
            className="cursor-pointer w-7 h-7 rounded-lg flex items-center justify-center border border-white/14 bg-white/6 hover:bg-white/16 text-[#DCEBFF] text-xs font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        <p className="mt-1.5 text-[11.5px] text-[#DCEBFF]/90 leading-snug">
          {UI_COPY.wallet.connectSubtitle}
        </p>

        {errorMessage && (
          <div
            role="alert"
            data-testid="wallet-connect-error"
            className="mt-2.5 rounded-xl px-2.5 py-1.5 border border-[#EF4444]/55 bg-[#EF4444]/16 text-[11px] font-semibold text-[#FECACA]"
          >
            {errorMessage}
          </div>
        )}

        <div className="mt-3 flex flex-col gap-1.5">
          {wallets.length > 0 ? (
            wallets.map((wallet) => (
              <button
                key={wallet.id}
                type="button"
                disabled={connecting}
                onClick={() => onSelectWallet(wallet)}
                data-testid={`btn-sui-wallet-${wallet.id}`}
                className="cursor-pointer w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl border border-white/18 bg-white/8 hover:bg-white/16 disabled:opacity-55 text-white transition-colors"
              >
                <span className="flex items-center gap-2 min-w-0">
                  {wallet.icon ? (
                    <img
                      src={wallet.icon}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-5 h-5 rounded-md object-contain shrink-0"
                    />
                  ) : (
                    <span className="w-5 h-5 rounded-md bg-[#38BDF8]/24 border border-[#8FD1FF]/40 flex items-center justify-center text-[10px] font-extrabold text-[#8FD1FF] shrink-0">
                      S
                    </span>
                  )}
                  <span className="text-xs font-extrabold tracking-wide truncate">
                    {wallet.name}
                  </span>
                </span>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FFD15C] shrink-0">
                  {connecting ? UI_COPY.wallet.connecting : UI_COPY.wallet.connectAction}
                </span>
              </button>
            ))
          ) : (
            <div
              className="rounded-xl p-3 border border-white/14 bg-white/5 text-center"
              data-testid="wallet-none-detected"
            >
              <p className="text-xs font-bold text-white">
                {UI_COPY.wallet.noWalletTitle}
              </p>
              <p className="mt-1 text-[11px] text-[#CFE0FA]/90 leading-snug">
                {UI_COPY.wallet.noWalletBody}
              </p>
              <button
                type="button"
                onClick={onRefreshWallets}
                data-testid="btn-wallet-refresh"
                className="mt-2.5 cursor-pointer px-3 py-1 rounded-lg border border-white/18 bg-white/10 hover:bg-white/18 text-[10.5px] font-extrabold uppercase tracking-wider text-white transition-colors"
              >
                {UI_COPY.wallet.refreshWallets}
              </button>
            </div>
          )}
        </div>

        <div className="mt-3 pt-2.5 border-t border-white/10">
          <p className="text-[9.5px] font-extrabold uppercase tracking-wider text-[#9BB6D6] mb-1.5">
            Supported Sui Wallets
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[
              { name: 'Backpack', url: 'https://backpack.app/' },
              { name: 'Nightly', url: 'https://nightly.app/' },
              { name: 'OKX Wallet', url: 'https://www.okx.com/web3' },
              { name: 'Surf', url: 'https://surf.tech/' },
              { name: 'Slush', url: 'https://slush.app/' },
            ]
              .filter(
                (item) =>
                  !wallets.some((w) =>
                    w.name.toLowerCase().includes(item.name.toLowerCase().split(' ')[0]),
                  ),
              )
              .map((item) => (
                <a
                  key={item.name}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 rounded-lg border border-white/12 bg-white/5 hover:bg-white/14 text-[10px] font-semibold text-[#DCEBFF] transition-colors"
                >
                  {item.name} ↗
                </a>
              ))}
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-white/12 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold text-[#C8DAF8]/85">
            {UI_COPY.wallet.demoFallbackNote}
          </span>
          <button
            type="button"
            onClick={onClose}
            data-testid="btn-continue-demo"
            className="cursor-pointer px-2.5 py-1 rounded-lg text-[10.5px] font-extrabold uppercase tracking-wider text-[#FFD15C] hover:text-white transition-colors shrink-0"
          >
            {UI_COPY.wallet.continueDemo}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProfileModal({
  session,
  profile,
  loading,
  onDisconnect,
  onClose,
}: ProfileModalProps) {
  const [copied, setCopied] = useState(false);
  const shortAddr = shortenSuiAddress(session.address);
  const earnedSet = new Set<SuiBadgeId>(profile.badges);
  const streakFireActive = !loading && hasStreakFireBadge(profile);
  const streakLabel =
    profile.loginStreak === 1 ? '1 Day' : `${profile.loginStreak} Days`;

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(session.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard may be unavailable in restricted frames
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 pointer-events-auto flex items-center justify-center p-4 bg-[#091224]/34 backdrop-blur-[5px]"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClose}
      data-testid="profile-modal"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[348px] max-h-[90vh] overflow-y-auto rounded-2xl p-4 border border-white/18 bg-[#0a1428]/44 backdrop-blur-lg shadow-[0_12px_32px_rgba(6,10,24,0.34)] text-left"
      >
        {/* Header: Title + Shortened Public Sui Address */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[9.5px] font-extrabold uppercase tracking-widest text-[#8FD1FF]">
              {session.walletName} · {UI_COPY.wallet.suiProfileTag}
            </p>
            <h2
              id="profile-modal-title"
              className="font-display text-xl font-bold tracking-wide uppercase text-white leading-tight"
            >
              {UI_COPY.wallet.profileTitle}
            </h2>
          </div>
          <button
            type="button"
            aria-label={UI_COPY.wallet.closeAria}
            onClick={onClose}
            data-testid="btn-profile-close"
            className="cursor-pointer w-7 h-7 rounded-lg flex items-center justify-center border border-white/14 bg-white/6 hover:bg-white/16 text-[#DCEBFF] text-xs font-bold transition-colors shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Shortened Wallet Address Row (Strictly Public Address Only) */}
        <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl px-3 py-2 border border-white/14 bg-white/6">
          <div className="min-w-0">
            <p className="text-[9px] font-extrabold uppercase tracking-wider text-[#C8DAF8]">
              {UI_COPY.wallet.addressLabel}
            </p>
            <p
              className="font-mono text-xs font-bold text-white tabular-nums"
              data-testid="profile-wallet-address"
            >
              {shortAddr}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopyAddress}
            className="cursor-pointer px-2 py-1 rounded-lg border border-white/16 bg-white/8 hover:bg-white/16 text-[10px] font-extrabold uppercase tracking-wider text-[#E2EEFF] transition-colors shrink-0"
          >
            {copied ? UI_COPY.wallet.copied : UI_COPY.wallet.copy}
          </button>
        </div>

        {/* Progress Stats: Highest Completed Level & Recruited Lil Yetis */}
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <div className="rounded-xl px-3 py-2 border border-white/14 bg-white/6">
            <p className="text-[9px] font-extrabold uppercase tracking-wider text-[#C8DAF8]">
              {UI_COPY.wallet.highestLevelLabel}
            </p>
            <p
              className="mt-0.5 font-display text-lg font-bold text-[#FFD15C] tabular-nums leading-tight"
              data-testid="profile-highest-level"
            >
              {loading
                ? '…'
                : profile.highestCompletedLevel > 0
                  ? `${profile.highestCompletedLevel}/${MAX_GAME_LEVEL}`
                  : '0/10'}
            </p>
          </div>

          <div className="rounded-xl px-3 py-2 border border-white/14 bg-white/6">
            <p className="text-[9px] font-extrabold uppercase tracking-wider text-[#C8DAF8]">
              {UI_COPY.wallet.lilYetisLabel}
            </p>
            <p
              className="mt-0.5 font-display text-lg font-bold text-[#FFD15C] tabular-nums leading-tight"
              data-testid="profile-lil-yetis"
            >
              {loading
                ? '…'
                : `${profile.lilYetisRecruited}/${MAX_LIL_YETIS_RECRUITED}`}
            </p>
          </div>
        </div>

        {/* Daily Login Streak Counter + Streak Fire Badge */}
        <div
          data-testid="profile-daily-streak-card"
          data-streak-fire={streakFireActive ? 'true' : 'false'}
          className={`mt-2 flex items-center justify-between gap-2 rounded-xl px-3 py-2 border ${
            streakFireActive
              ? 'border-[#FB923C]/55 bg-[#F97316]/14'
              : 'border-white/14 bg-white/6'
          }`}
        >
          <div className="min-w-0">
            <p className="text-[9px] font-extrabold uppercase tracking-wider text-[#C8DAF8]">
              {UI_COPY.wallet.dailyStreakLabel}
            </p>
            <p
              className={`mt-0.5 font-display text-lg font-bold tabular-nums leading-tight ${
                streakFireActive ? 'text-[#FDBA74]' : 'text-[#FFD15C]'
              }`}
              data-testid="profile-login-streak"
            >
              {loading ? '…' : streakLabel}
            </p>
          </div>

          {streakFireActive ? (
            <span
              data-testid="profile-streak-fire-badge"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 border border-[#FB923C]/60 bg-[#F97316]/24 text-[10px] font-extrabold uppercase tracking-wider text-[#FFD15C] shrink-0"
            >
              <FlameGlyph active className="w-3.5 h-3.5 shrink-0" />
              {UI_COPY.wallet.streakFireBadge}
            </span>
          ) : (
            <span className="text-[9.5px] font-semibold text-[#C8DAF8]/75 text-right leading-tight max-w-[130px]">
              {UI_COPY.wallet.streakKeepGoing}
            </span>
          )}
        </div>

        {/* Earned Badges List */}
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <p className="text-[9.5px] font-extrabold uppercase tracking-wider text-[#C8DAF8]">
              {UI_COPY.wallet.badgesHeading}
            </p>
            <span
              className="text-[10px] font-extrabold text-[#FFD15C] tabular-nums"
              data-testid="profile-badges-count"
            >
              {profile.badges.length}/{SUI_BADGE_DEFINITIONS.length}
            </span>
          </div>

          <div className="flex flex-col gap-1.5" data-testid="profile-badges-list">
            {SUI_BADGE_DEFINITIONS.map((badge) => {
              const unlocked = earnedSet.has(badge.id);
              const isFireBadge = badge.id === 'streak_fire';
              const requirementText =
                badge.requiredStreak !== undefined
                  ? `${badge.requiredStreak}+ DAYS`
                  : `LV ${badge.requiredLevel}`;
              return (
                <div
                  key={badge.id}
                  data-testid={`profile-badge-${badge.id}`}
                  data-unlocked={unlocked ? 'true' : 'false'}
                  className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 border ${
                    unlocked
                      ? isFireBadge
                        ? 'border-[#FB923C]/55 bg-[#F97316]/16 text-white'
                        : 'border-[#FFD15C]/45 bg-[#F59E0B]/12 text-white'
                      : 'border-white/10 bg-white/4 text-[#C8DAF8]/70'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <BadgeGlyph id={badge.id} unlocked={unlocked} />
                    <div className="min-w-0">
                      <p className="text-[11px] font-extrabold leading-tight truncate">
                        {badge.title}
                      </p>
                      <p className="text-[9.5px] leading-tight text-[#DCEBFF]/75 truncate">
                        {badge.description}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[9px] font-extrabold uppercase tracking-wider shrink-0 ${
                      unlocked
                        ? isFireBadge
                          ? 'text-[#FDBA74]'
                          : 'text-[#FFD15C]'
                        : 'text-white/40'
                    }`}
                  >
                    {unlocked ? UI_COPY.wallet.badgeEarned : requirementText}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <p className="mt-2.5 text-[9.5px] font-semibold text-[#C8DAF8]/75 text-center">
          {UI_COPY.wallet.compactDataNote}
        </p>

        {/* Actions: Disconnect & Close */}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onDisconnect}
            data-testid="btn-profile-disconnect"
            className="cursor-pointer flex-1 py-2 rounded-xl border border-[#F87171]/45 bg-[#EF4444]/18 hover:bg-[#EF4444]/30 text-[#FECACA] hover:text-white text-xs font-extrabold uppercase tracking-wider transition-colors"
          >
            {UI_COPY.wallet.disconnect}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer px-4 py-2 rounded-xl border border-white/16 bg-white/8 hover:bg-white/16 text-white text-xs font-extrabold uppercase tracking-wider transition-colors"
          >
            {UI_COPY.wallet.done}
          </button>
        </div>
      </div>
    </div>
  );
}
