import { useEffect, useState, type FormEvent } from 'react';
import {
  MAX_GAME_LEVEL,
  MAX_LIL_YETIS_RECRUITED,
  MAX_USERNAME_LENGTH,
  SUI_AVATAR_OPTIONS,
  SUI_BADGE_DEFINITIONS,
  applyDailyLoginToProfile,
  claimBadgeInProfile,
  getBadgeClaimState,
  getClaimedBadgeDefinitions,
  getReadyBadgeDefinitions,
  hasCheckedInToday,
  hasStreakFireBadge,
  lockProfileUsername,
  previewNextDailyCheckInReward,
  sanitizeRiderUsername,
  shortenSuiAddress,
  toCalendarDateKey,
  updateProfileIdentity,
  type SuiAvatarId,
  type SuiBadgeDefinition,
  type SuiBadgeId,
  type SuiPlayerProfile,
} from '../game/suiProfileLogic';
import {
  getActiveSuiNetworkLabel,
  signSuiProfileAction,
  type ConnectedSuiWalletSession,
  type DetectedSuiWallet,
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
  onProfileChange: (nextProfile: SuiPlayerProfile) => void;
  onDisconnect: () => void;
  onClose: () => void;
}

/** Enamel-medallion Streak Fire icon matching the 7 Lofi badge medallions for Daily Check-In points. */
function StreakFireMedallion({
  active,
  className = 'w-11 h-11 shrink-0',
}: {
  active: boolean;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="streak-rim-grad" x1="6" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={active ? '#FDBA74' : '#94A3B8'} />
          <stop offset="50%" stopColor={active ? '#F97316' : '#64748B'} />
          <stop offset="100%" stopColor={active ? '#C2410C' : '#475569'} />
        </linearGradient>
        <radialGradient id="streak-disc-grad" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor={active ? '#1E3A5F' : '#162542'} />
          <stop offset="100%" stopColor="#0A152C" />
        </radialGradient>
        <linearGradient id="streak-flame-outer" x1="24" y1="10" x2="24" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={active ? '#FDE047' : '#CBD5E1'} />
          <stop offset="52%" stopColor={active ? '#FB923C' : '#94A3B8'} />
          <stop offset="100%" stopColor={active ? '#EA580C' : '#64748B'} />
        </linearGradient>
        <linearGradient id="streak-flame-inner" x1="24" y1="19" x2="24" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={active ? '#FFFBEB' : '#F1F5F9'} />
          <stop offset="100%" stopColor={active ? '#FACC15' : '#CBD5E1'} />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22.5" fill="url(#streak-rim-grad)" stroke="#172554" strokeWidth="1.2" />
      <circle cx="24" cy="24" r="18.6" fill="url(#streak-disc-grad)" stroke="#FDE68A" strokeOpacity={active ? '0.6' : '0.25'} strokeWidth="1" />
      <circle cx="13.5" cy="15.5" r="1.1" fill="#BAE6FD" fillOpacity={active ? '0.9' : '0.45'} />
      <circle cx="35.5" cy="16.5" r="1.2" fill="#FDE68A" fillOpacity={active ? '0.9' : '0.4'} />
      <circle cx="33.5" cy="31.5" r="0.9" fill="#BAE6FD" fillOpacity={active ? '0.8' : '0.35'} />
      <path
        d="M24.6 10.5C25.5 16.4 32.6 18.8 33.8 25.8C34.8 31.8 30.4 37.5 24 37.5C17.6 37.5 13.7 32.5 14.4 26.2C14.9 22 17.5 19.3 19.6 17C19.4 19.8 20.8 21.7 22.3 22.3C21.3 18.4 22 14 24.6 10.5Z"
        fill="url(#streak-flame-outer)"
        stroke="#1E1B4B"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M24.2 22.6C26.5 25 28 27.4 27.5 30.4C27.1 32.6 25.7 34.1 24 34.1C22.1 34.1 20.6 32.4 20.6 30.1C20.6 27.7 22.3 25.2 24.2 22.6Z"
        fill="url(#streak-flame-inner)"
      />
    </svg>
  );
}

function LockGlyph({ className = 'w-3.5 h-3.5 shrink-0' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect
        x="5"
        y="11"
        width="14"
        height="9.5"
        rx="2.2"
        fill="rgba(16,185,129,0.22)"
        stroke="#6EE7B7"
        strokeWidth="1.8"
      />
      <path
        d="M8.5 11V8.2C8.5 6.2 10.1 4.5 12 4.5C13.9 4.5 15.5 6.2 15.5 8.2V11"
        stroke="#6EE7B7"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Renders the chosen Lofi avatar portrait using the local asset with resilient fallback. */
function AvatarPortrait({
  avatarId,
  size = 'md',
}: {
  avatarId: SuiAvatarId;
  size?: 'sm' | 'md';
}) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [avatarId]);

  const option =
    SUI_AVATAR_OPTIONS.find((item) => item.id === avatarId) ?? SUI_AVATAR_OPTIONS[0];
  const boxClass = size === 'md' ? 'w-14 h-14 rounded-2xl' : 'w-12 h-12 rounded-xl';

  return (
    <div
      className={`${boxClass} relative overflow-hidden border border-[#8FD1FF]/45 bg-[#112240] flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]`}
    >
      {!imgFailed ? (
        <img
          src={option.imageSrc}
          alt={option.label}
          decoding="async"
          onError={() => setImgFailed(true)}
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

/** Renders an attached claimable badge PNG inside a uniform circular medal frame with resilient fallback. */
function BadgeArtwork({ badge }: { badge: SuiBadgeDefinition }) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [badge.imageSrc]);

  if (imgFailed) {
    return (
      <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0" fill="none" aria-hidden="true">
        <path
          d="M12 3.5L14.6 8.8L20.4 9.6L16.2 13.7L17.2 19.5L12 16.7L6.8 19.5L7.8 13.7L3.6 9.6L9.4 8.8L12 3.5Z"
          fill="rgba(245,158,11,0.28)"
          stroke="#FFD15C"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <img
      src={badge.imageSrc}
      alt={badge.title}
      decoding="async"
      onError={() => setImgFailed(true)}
      className="w-full h-full object-cover object-center select-none pointer-events-none"
    />
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
        className="w-full max-w-[320px] rounded-2xl p-4 border border-white/18 bg-[#0a1428]/58 backdrop-blur-lg shadow-[0_12px_32px_rgba(6,10,24,0.34)] text-left"
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
  onProfileChange,
  onDisconnect,
  onClose,
}: ProfileModalProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'my-badges'>('overview');
  const [inspectedBadgeId, setInspectedBadgeId] = useState<SuiBadgeId | null>(null);
  const [usernameDraft, setUsernameDraft] = useState(() => {
    if (profile.username) return profile.username;
    try {
      const legacyKey = `lofi_sui_username_${session.address.toLowerCase()}`;
      return sanitizeRiderUsername(window.localStorage.getItem(legacyKey) ?? '');
    } catch {
      return '';
    }
  });
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  );

  // Keep username draft synced when profile loads or connected wallet changes
  useEffect(() => {
    if (profile.username) {
      setUsernameDraft(profile.username);
      return;
    }
    try {
      const legacyKey = `lofi_sui_username_${session.address.toLowerCase()}`;
      const legacy = sanitizeRiderUsername(window.localStorage.getItem(legacyKey) ?? '');
      setUsernameDraft(legacy);
    } catch {
      setUsernameDraft('');
    }
  }, [session.address, profile.username]);

  const shortAddr = shortenSuiAddress(session.address);
  const networkLabel = getActiveSuiNetworkLabel();
  const checkedInToday = !loading && hasCheckedInToday(profile);
  const streakFireActive = !loading && hasStreakFireBadge(profile);
  const nextCheckInReward = previewNextDailyCheckInReward(profile);
  const streakLabel =
    profile.loginStreak === 1 ? '1 Day' : `${profile.loginStreak} Days`;
  const isUsernameLocked = Boolean(profile.usernameLocked && profile.username.length > 0);
  const cleanedUsernameDraft = sanitizeRiderUsername(usernameDraft);

  const selectedAvatarOption =
    SUI_AVATAR_OPTIONS.find((opt) => opt.id === profile.avatarId) ?? SUI_AVATAR_OPTIONS[0];
  const displayName = profile.username || selectedAvatarOption.label;

  const badgeStates = SUI_BADGE_DEFINITIONS.map((badge) => ({
    badge,
    state: getBadgeClaimState(profile, badge.id),
  }));
  const claimedBadges = getClaimedBadgeDefinitions(profile);
  const readyBadges = getReadyBadgeDefinitions(profile);
  const claimedCount = claimedBadges.length;
  const readyCount = readyBadges.length;
  const inspectedBadge =
    claimedBadges.find((b) => b.id === inspectedBadgeId) ?? claimedBadges[0] ?? null;
  const collectionPct = Math.round((claimedCount / SUI_BADGE_DEFINITIONS.length) * 100);

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(session.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard may be unavailable in restricted frames
    }
  };

  const handleSelectAvatar = (avatarId: SuiAvatarId) => {
    if (loading || avatarId === profile.avatarId) return;
    const next = updateProfileIdentity(profile, { avatarId });
    onProfileChange(next);
    setFeedback({
      tone: 'success',
      text: `Avatar updated to ${SUI_AVATAR_OPTIONS.find((a) => a.id === avatarId)?.label ?? avatarId}.`,
    });
  };

  const handleSaveUsername = async (e: FormEvent) => {
    e.preventDefault();
    if (loading || isUsernameLocked || busyAction !== null) return;
    const cleaned = sanitizeRiderUsername(usernameDraft);
    setUsernameDraft(cleaned);
    if (!cleaned) {
      setFeedback({ tone: 'error', text: 'Please enter a rider username first.' });
      return;
    }

    setBusyAction('username');
    setFeedback(null);

    const res = await signSuiProfileAction(session, `Lock Rider Username: ${cleaned}`);
    setBusyAction(null);

    if (!res.ok) {
      setFeedback({ tone: 'error', text: res.message });
      return;
    }

    const next = lockProfileUsername(profile, cleaned);
    onProfileChange(next);
    setFeedback({
      tone: 'success',
      text: `Username "${cleaned}" locked with your Sui wallet! New User Verified badge is ready to claim.`,
    });
  };

  const handleDailyCheckIn = async () => {
    if (loading || checkedInToday || busyAction !== null) return;
    const todayKey = toCalendarDateKey(new Date()) ?? new Date().toISOString().slice(0, 10);
    setBusyAction('checkin');
    setFeedback(null);

    const res = await signSuiProfileAction(session, `Daily Check-In (${todayKey})`);
    setBusyAction(null);

    if (!res.ok) {
      setFeedback({ tone: 'error', text: res.message });
      return;
    }

    const updated = applyDailyLoginToProfile(profile, new Date());
    const pointsAwarded = Math.max(0, updated.checkInPoints - profile.checkInPoints);
    const hasBonus = hasStreakFireBadge(updated);
    onProfileChange(updated);
    setFeedback({
      tone: 'success',
      text: `Checked in with ${session.walletName}! +${pointsAwarded} pts${
        hasBonus ? ' (+50 Streak Fire bonus)' : ''
      } · Streak: ${updated.loginStreak === 1 ? '1 Day' : `${updated.loginStreak} Days`}.`,
    });
  };

  const handleClaimBadge = async (badgeId: SuiBadgeId, badgeTitle: string) => {
    if (loading || busyAction !== null) return;
    if (getBadgeClaimState(profile, badgeId) !== 'ready') return;

    setBusyAction(`claim:${badgeId}`);
    setFeedback(null);

    const res = await signSuiProfileAction(session, `Claim Badge: ${badgeTitle}`);
    setBusyAction(null);

    if (!res.ok) {
      setFeedback({ tone: 'error', text: res.message });
      return;
    }

    const updated = claimBadgeInProfile(profile, badgeId);
    onProfileChange(updated);
    setFeedback({
      tone: 'success',
      text: `${badgeTitle} badge claimed and unlocked!`,
    });
  };

  return (
    <div
      className="fixed inset-0 z-40 pointer-events-auto flex items-center justify-center p-3 sm:p-4 bg-[#071020]/50 backdrop-blur-[6px]"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClose}
      data-testid="profile-modal"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[468px] max-h-[88vh] flex flex-col overflow-hidden rounded-2xl border border-white/20 bg-[#081224]/82 backdrop-blur-xl shadow-[0_18px_48px_rgba(4,9,22,0.52)] text-left"
      >
        {/* Pinned Top Bar: Hub Title + Active Network Badge + Close */}
        <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-white/10 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#8FD1FF]">
                {session.walletName}
              </span>
              <span
                data-testid="profile-network-badge"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 border border-[#34D399]/35 bg-[#10B981]/14 text-[9.5px] font-extrabold uppercase tracking-wider text-[#A7F3D0]"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" aria-hidden="true" />
                {networkLabel}
              </span>
            </div>
            <h2
              id="profile-modal-title"
              className="mt-0.5 font-display text-xl sm:text-2xl font-bold tracking-wide uppercase text-white leading-tight"
            >
              {UI_COPY.wallet.profileTitle}
            </h2>
          </div>

          <button
            type="button"
            aria-label={UI_COPY.wallet.closeAria}
            onClick={onClose}
            data-testid="btn-profile-close"
            className="cursor-pointer w-8 h-8 rounded-lg flex items-center justify-center border border-white/15 bg-white/8 hover:bg-white/16 text-[#DCEBFF] text-xs font-bold transition-colors shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Pinned Menu Tabs: Overview | My Badges */}
        <div
          role="tablist"
          aria-label="Profile menu"
          data-testid="profile-menu-tabs"
          className="px-4 sm:px-5 py-2 border-b border-white/10 bg-[#060E1D]/45 flex items-center gap-2 shrink-0"
        >
          <button
            type="button"
            role="tab"
            id="profile-tab-overview"
            aria-selected={activeTab === 'overview'}
            aria-controls="profile-panel-overview"
            onClick={() => setActiveTab('overview')}
            data-testid="tab-profile-overview"
            className={`cursor-pointer flex-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider border transition-colors ${
              activeTab === 'overview'
                ? 'border-[#8FD1FF]/65 bg-[#38BDF8]/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]'
                : 'border-white/10 bg-white/[0.04] hover:bg-white/10 text-[#B8D0F0]'
            }`}
          >
            <span>{UI_COPY.wallet.tabOverview}</span>
            {readyCount > 0 && (
              <span
                className="rounded-md px-1.5 py-0.5 bg-[#F59E0B]/28 border border-[#FFD15C]/55 text-[9.5px] font-extrabold text-[#FEF3C7] tabular-nums leading-none"
                title={`${readyCount} ready to claim`}
              >
                {readyCount}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            id="profile-tab-my-badges"
            aria-selected={activeTab === 'my-badges'}
            aria-controls="profile-panel-my-badges"
            onClick={() => setActiveTab('my-badges')}
            data-testid="tab-profile-my-badges"
            className={`cursor-pointer flex-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider border transition-colors ${
              activeTab === 'my-badges'
                ? 'border-[#FFD15C]/70 bg-[#F59E0B]/22 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]'
                : 'border-white/10 bg-white/[0.04] hover:bg-white/10 text-[#B8D0F0]'
            }`}
          >
            <span>{UI_COPY.wallet.tabMyBadges}</span>
            <span
              data-testid="tab-my-badges-count"
              className={`rounded-md px-1.5 py-0.5 text-[9.5px] font-extrabold tabular-nums leading-none border ${
                activeTab === 'my-badges'
                  ? 'border-[#FFD15C]/55 bg-[#F59E0B]/30 text-[#FEF3C7]'
                  : 'border-white/14 bg-white/8 text-[#DCEBFF]'
              }`}
            >
              {loading ? '…' : `${claimedCount}/${SUI_BADGE_DEFINITIONS.length}`}
            </span>
          </button>
        </div>

        {/* Scrollable Hub Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-3.5 space-y-3">
        {activeTab === 'my-badges' ? (
          <div
            role="tabpanel"
            id="profile-panel-my-badges"
            aria-labelledby="profile-tab-my-badges"
            data-testid="profile-my-badges-panel"
            className="space-y-3"
          >
            {/* Collection Progress Header */}
            <section className="rounded-2xl p-3.5 border border-[#FFD15C]/30 bg-gradient-to-br from-[#F59E0B]/12 via-[#0B1730]/65 to-[#10B981]/10 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#FDE68A]">
                    {UI_COPY.wallet.myBadgesHeading}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#DCEBFF]/85">
                    {UI_COPY.wallet.myBadgesSubtitle}
                  </p>
                </div>
                <span
                  data-testid="my-badges-collected-count"
                  className="font-display text-lg font-bold text-[#FFD15C] tabular-nums shrink-0 leading-tight"
                >
                  {loading ? '…' : `${claimedCount}/${SUI_BADGE_DEFINITIONS.length}`}
                </span>
              </div>

              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#F59E0B] via-[#FFD15C] to-[#34D399] transition-[width] duration-300"
                  style={{ width: `${loading ? 0 : collectionPct}%` }}
                />
              </div>

              {readyCount > 0 && !loading && (
                <div className="pt-0.5 flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-bold text-[#FDE68A]">
                    {readyCount === 1
                      ? '1 unlocked badge ready to claim'
                      : `${readyCount} unlocked badges ready to claim`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('overview')}
                    data-testid="btn-my-badges-go-claim"
                    className="cursor-pointer px-2.5 py-1 rounded-lg border border-[#FFD15C]/60 bg-[#F59E0B]/24 hover:bg-[#F59E0B]/38 text-[10px] font-extrabold uppercase tracking-wider text-[#FEF3C7] transition-colors shrink-0"
                  >
                    Claim Now →
                  </button>
                </div>
              )}
            </section>

            {/* Collected Badges Spotlight + Gallery OR Empty State */}
            {loading ? (
              <div className="rounded-2xl p-6 border border-white/12 bg-white/[0.04] text-center">
                <p className="text-xs font-bold text-[#CFE0FA]">Loading your badges…</p>
              </div>
            ) : claimedBadges.length === 0 ? (
              <div
                data-testid="my-badges-empty"
                className="rounded-2xl p-6 border border-white/12 bg-white/[0.04] text-center space-y-2.5"
              >
                <div className="mx-auto w-14 h-14 rounded-full border border-white/15 bg-white/[0.05] flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" aria-hidden="true">
                    <path
                      d="M12 3.5L14.6 8.8L20.4 9.6L16.2 13.7L17.2 19.5L12 16.7L6.8 19.5L7.8 13.7L3.6 9.6L9.4 8.8L12 3.5Z"
                      fill="rgba(255,209,92,0.12)"
                      stroke="rgba(214,228,251,0.5)"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <p className="font-display text-base font-bold uppercase tracking-wide text-white">
                  {UI_COPY.wallet.myBadgesEmptyTitle}
                </p>
                <p className="text-[11.5px] text-[#CFE0FA]/80 leading-relaxed max-w-[300px] mx-auto">
                  {UI_COPY.wallet.myBadgesEmptyBody}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  data-testid="btn-my-badges-to-overview"
                  className="cursor-pointer mt-1 px-4 py-2 rounded-xl border border-[#8FD1FF]/55 bg-[#38BDF8]/20 hover:bg-[#38BDF8]/32 text-[11px] font-extrabold uppercase tracking-wider text-[#E0F2FE] transition-colors"
                >
                  {UI_COPY.wallet.myBadgesGoToTasks}
                </button>
              </div>
            ) : (
              <>
                {/* Enlarged Spotlight Card for the Selected Collected Badge */}
                {inspectedBadge && (
                  <section
                    aria-label="Selected badge details"
                    data-testid="my-badges-spotlight"
                    data-badge-id={inspectedBadge.id}
                    className="rounded-2xl p-3.5 border border-[#34D399]/50 bg-gradient-to-r from-[#10B981]/16 via-[#0C1B36]/80 to-[#0EA5E9]/14 flex items-center gap-3.5"
                  >
                    <div className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-[#FFD15C]/85 shadow-[0_0_20px_rgba(255,209,92,0.3)] bg-[#0A152C] shrink-0">
                      <BadgeArtwork badge={inspectedBadge} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 border border-[#34D399]/50 bg-[#10B981]/20 text-[9.5px] font-extrabold uppercase tracking-wider text-[#6EE7B7]">
                        ✓ {UI_COPY.wallet.badgeClaimed}
                      </span>
                      <h3
                        data-testid="my-badges-spotlight-title"
                        className="mt-1 font-display text-lg font-bold tracking-wide text-white leading-tight"
                      >
                        {inspectedBadge.title}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-[#DCEBFF]/88 leading-snug">
                        {inspectedBadge.description}
                      </p>
                      <p className="mt-1 text-[9.5px] font-semibold text-[#A7F3D0]/80">
                        {UI_COPY.wallet.myBadgesVerifiedNote}
                      </p>
                    </div>
                  </section>
                )}

                {/* Collected Badge Showcase Grid */}
                <div
                  data-testid="my-badges-grid"
                  className="grid grid-cols-2 sm:grid-cols-3 gap-2"
                >
                  {claimedBadges.map((badge) => {
                    const isSelected = inspectedBadge?.id === badge.id;
                    return (
                      <button
                        key={badge.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setInspectedBadgeId(badge.id)}
                        data-testid={`my-badge-card-${badge.id}`}
                        className={`cursor-pointer flex flex-col items-center text-center gap-2 rounded-2xl p-3 border transition-all ${
                          isSelected
                            ? 'border-[#FFD15C]/75 bg-[#F59E0B]/16 shadow-[0_0_0_1px_rgba(255,209,92,0.3)]'
                            : 'border-white/14 bg-white/[0.05] hover:bg-white/10'
                        }`}
                      >
                        <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-[#FFD15C]/75 bg-[#0A152C] shrink-0">
                          <BadgeArtwork badge={badge} />
                        </div>
                        <div className="min-w-0 w-full">
                          <p className="text-[11px] font-extrabold text-white leading-tight truncate">
                            {badge.title}
                          </p>
                          <p className="mt-0.5 text-[9.5px] font-bold uppercase tracking-wider text-[#6EE7B7]">
                            ✓ {UI_COPY.wallet.badgeClaimed}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : (
          <div
            role="tabpanel"
            id="profile-panel-overview"
            aria-labelledby="profile-tab-overview"
            className="space-y-3"
          >
        {/* SECTION 1: PROFILE HEADER (AVATAR + USERNAME + WALLET) */}
        <section
          aria-label="Profile identity"
          className="rounded-2xl p-3.5 border border-white/14 bg-white/[0.05] space-y-3"
        >
          {/* Active Avatar + Rider Display Name + Shortened Sui Address + Copy */}
          <div className="flex items-center gap-3">
            <AvatarPortrait avatarId={profile.avatarId} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <p
                  className="text-sm font-extrabold text-white tracking-wide truncate"
                  data-testid="profile-display-name"
                >
                  {displayName}
                </p>
                {isUsernameLocked && (
                  <span
                    title={UI_COPY.wallet.usernameLockedNote}
                    className="inline-flex items-center shrink-0"
                  >
                    <LockGlyph className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className="font-mono text-xs font-bold text-[#BAE6FD] tabular-nums"
                  data-testid="profile-wallet-address"
                >
                  {shortAddr}
                </span>
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  data-testid="btn-copy-address"
                  className="cursor-pointer px-2 py-0.5 rounded-md border border-white/16 bg-white/8 hover:bg-white/16 text-[10px] font-extrabold uppercase tracking-wider text-[#E2EEFF] transition-colors shrink-0"
                >
                  {copied ? UI_COPY.wallet.copied : UI_COPY.wallet.copy}
                </button>
              </div>
            </div>
          </div>

          {/* Avatar Picker */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#B8D0F0] mb-1.5">
              {UI_COPY.wallet.avatarPickerLabel}
            </p>
            <div
              className="grid grid-cols-2 sm:grid-cols-4 gap-1.5"
              role="group"
              aria-label={UI_COPY.wallet.avatarPickerLabel}
              data-testid="avatar-picker"
            >
              {SUI_AVATAR_OPTIONS.map((option) => {
                const isSelected = profile.avatarId === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={loading}
                    onClick={() => handleSelectAvatar(option.id)}
                    data-testid={`btn-avatar-${option.id}`}
                    className={`cursor-pointer flex flex-col items-center gap-1.5 rounded-xl px-1.5 py-2 border text-center transition-all ${
                      isSelected
                        ? 'border-[#8FD1FF]/80 bg-[#38BDF8]/20 text-white shadow-[0_0_0_1px_rgba(143,209,255,0.35)]'
                        : 'border-white/12 bg-white/[0.04] hover:bg-white/10 text-[#CFE0FA]'
                    }`}
                  >
                    <AvatarPortrait avatarId={option.id} size="sm" />
                    <span className="text-[10px] font-extrabold leading-tight w-full">
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Username Input (Sign with Sui Wallet to Lock) or Locked Verified Display */}
          {isUsernameLocked ? (
            <div
              data-testid="profile-username-locked"
              className="space-y-1"
            >
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#B8D0F0]">
                {UI_COPY.wallet.usernameLabel}
              </p>
              <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 border border-[#34D399]/40 bg-[#10B981]/10">
                <div className="flex items-center gap-2 min-w-0">
                  <LockGlyph className="w-4 h-4 shrink-0" />
                  <span
                    className="text-xs font-extrabold text-white truncate"
                    data-testid="profile-locked-username-value"
                  >
                    {profile.username}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 border border-[#34D399]/50 bg-[#10B981]/20 text-[9.5px] font-extrabold uppercase tracking-wider text-[#6EE7B7] shrink-0">
                  {UI_COPY.wallet.usernameLocked}
                </span>
              </div>
              <p className="text-[10px] text-[#A7F3D0]/80">
                {UI_COPY.wallet.usernameLockedNote}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSaveUsername} className="space-y-1">
              <label
                htmlFor="rider-username-input"
                className="block text-[10px] font-extrabold uppercase tracking-wider text-[#B8D0F0]"
              >
                {UI_COPY.wallet.usernameLabel}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="rider-username-input"
                  type="text"
                  maxLength={MAX_USERNAME_LENGTH}
                  value={usernameDraft}
                  onChange={(e) => setUsernameDraft(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder={UI_COPY.wallet.usernamePlaceholder}
                  disabled={loading || busyAction !== null}
                  data-testid="input-profile-username"
                  className="flex-1 min-w-0 px-3 py-1.5 rounded-xl border border-white/16 bg-[#060E1D]/70 text-xs font-semibold text-white placeholder-[#9BB6D6]/55 focus:outline-none focus:border-[#8FD1FF] disabled:opacity-55"
                />
                <button
                  type="submit"
                  disabled={loading || busyAction !== null || cleanedUsernameDraft.length === 0}
                  data-testid="btn-save-username"
                  className="cursor-pointer px-3.5 py-1.5 rounded-xl border border-[#38BDF8]/50 bg-[#38BDF8]/20 hover:bg-[#38BDF8]/32 disabled:opacity-45 text-[11px] font-extrabold uppercase tracking-wider text-[#E0F2FE] transition-colors shrink-0"
                >
                  {busyAction === 'username'
                    ? UI_COPY.wallet.usernameSigning
                    : UI_COPY.wallet.usernameSave}
                </button>
              </div>
              <p className="text-[10px] text-[#9BB6D6]/85">
                {UI_COPY.wallet.usernameLockHint}
              </p>
            </form>
          )}

          {/* Compact Progress Summary */}
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <div className="rounded-xl px-3 py-2 border border-white/12 bg-[#060E1D]/45 flex items-baseline justify-between gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#B8D0F0]">
                {UI_COPY.wallet.highestLevelLabel}
              </span>
              <span
                className="font-display text-base font-bold text-[#FFD15C] tabular-nums"
                data-testid="profile-highest-level"
              >
                {loading ? '…' : `${profile.highestCompletedLevel}/${MAX_GAME_LEVEL}`}
              </span>
            </div>

            <div className="rounded-xl px-3 py-2 border border-white/12 bg-[#060E1D]/45 flex items-baseline justify-between gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#B8D0F0]">
                {UI_COPY.wallet.lilYetisLabel}
              </span>
              <span
                className="font-display text-base font-bold text-[#FFD15C] tabular-nums"
                data-testid="profile-lil-yetis"
              >
                {loading ? '…' : `${profile.lilYetisRecruited}/${MAX_LIL_YETIS_RECRUITED}`}
              </span>
            </div>
          </div>
        </section>

        {/* SECTION 2: DAILY CHECK-IN / STREAK FIRE (POINTS ONLY, NOT A BADGE) */}
        <section
          aria-label="Daily Check-In"
          data-testid="profile-daily-streak-card"
          data-streak-fire={streakFireActive ? 'true' : 'false'}
          data-checked-in-today={checkedInToday ? 'true' : 'false'}
          className={`rounded-2xl p-3.5 border transition-colors ${
            checkedInToday
              ? 'border-[#34D399]/40 bg-[#10B981]/10'
              : streakFireActive
                ? 'border-[#FB923C]/55 bg-[#F97316]/12'
                : 'border-[#8FD1FF]/35 bg-[#38BDF8]/10'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                data-testid="streak-fire-icon"
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
              >
                <StreakFireMedallion active={streakFireActive || checkedInToday} className="w-11 h-11" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#C8DAF8]">
                    {UI_COPY.wallet.dailyStreakLabel}
                  </p>
                  {streakFireActive && (
                    <span
                      data-testid="profile-streak-fire-badge"
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 border border-[#FB923C]/55 bg-[#F97316]/24 text-[9px] font-extrabold uppercase tracking-wider text-[#FDE68A]"
                    >
                      {UI_COPY.wallet.streakFireBadge}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-baseline gap-2 flex-wrap">
                  <span
                    className={`font-display text-lg font-bold tabular-nums leading-tight ${
                      streakFireActive ? 'text-[#FDBA74]' : 'text-[#FFD15C]'
                    }`}
                    data-testid="profile-login-streak"
                  >
                    {loading ? '…' : streakLabel}
                  </span>
                  <span
                    data-testid="profile-checkin-points"
                    className="inline-flex items-center rounded-md px-1.5 py-0.5 border border-[#FFD15C]/35 bg-[#F59E0B]/16 text-[10.5px] font-extrabold tabular-nums text-[#FDE68A]"
                  >
                    {loading ? '…' : `${profile.checkInPoints.toLocaleString()} pts`}
                  </span>
                  <span
                    data-testid="daily-checkin-status"
                    className={`text-[10.5px] font-bold ${
                      checkedInToday ? 'text-[#6EE7B7]' : 'text-[#BAE6FD]'
                    }`}
                  >
                    {loading
                      ? 'Loading…'
                      : checkedInToday
                        ? UI_COPY.wallet.checkInDone
                        : UI_COPY.wallet.checkInReady}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={loading || checkedInToday || busyAction !== null}
              onClick={handleDailyCheckIn}
              data-testid="btn-daily-checkin"
              className={`cursor-pointer px-3 py-2 rounded-xl text-[11px] font-extrabold uppercase tracking-wider transition-colors shrink-0 ${
                checkedInToday
                  ? 'border border-[#34D399]/40 bg-[#10B981]/18 text-[#A7F3D0] cursor-default'
                  : 'border border-[#FFD15C]/65 bg-[#F59E0B]/28 hover:bg-[#F59E0B]/42 disabled:opacity-50 text-[#FEF3C7]'
              }`}
            >
              {busyAction === 'checkin'
                ? UI_COPY.wallet.checkInSigning
                : checkedInToday
                  ? 'Checked In'
                  : UI_COPY.wallet.checkInButton}
            </button>
          </div>
          {!loading && (
            <p className="mt-2 text-[10.5px] text-[#CFE0FA]/80 leading-snug">
              {checkedInToday
                ? `Points earned for today · ${UI_COPY.wallet.streakKeepGoing}.`
                : nextCheckInReward.streakBonus > 0
                  ? `Sign with your Sui wallet for +${nextCheckInReward.total} pts (${nextCheckInReward.base} base + ${nextCheckInReward.streakBonus} Streak Fire bonus).`
                  : `Sign with your Sui wallet for +${nextCheckInReward.base} pts · ${UI_COPY.wallet.streakKeepGoing}.`}
            </p>
          )}
        </section>

        {/* Action Feedback Banner (Signature Approved / Rejected / Saved) */}
        {feedback && (
          <div
            role={feedback.tone === 'error' ? 'alert' : 'status'}
            data-testid="profile-action-feedback"
            className={`rounded-xl px-3 py-2 border text-[11px] font-semibold ${
              feedback.tone === 'error'
                ? 'border-[#F87171]/55 bg-[#EF4444]/16 text-[#FECACA]'
                : 'border-[#34D399]/45 bg-[#10B981]/14 text-[#A7F3D0]'
            }`}
          >
            {feedback.text}
          </div>
        )}

        {/* SECTION 3: TASKS & CLAIMABLE BADGES (BLURRED UNTIL CLAIMED) */}
        <section aria-label="Tasks and Claimable Badges">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-[#C8DAF8]">
              {UI_COPY.wallet.badgesHeading}
            </p>
            <div className="flex items-center gap-2 text-[10.5px] font-extrabold tabular-nums">
              {readyCount > 0 && (
                <span className="text-[#FFD15C]">{readyCount} Ready</span>
              )}
              <span className="text-[#93C5FD]" data-testid="profile-badges-count">
                {claimedCount}/{SUI_BADGE_DEFINITIONS.length} Claimed
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5" data-testid="profile-badges-list">
            {badgeStates.map(({ badge, state }) => {
              const isLocked = state === 'locked';
              const isReady = state === 'ready';
              const isClaimed = state === 'claimed';
              const isClaimingThis = busyAction === `claim:${badge.id}`;
              const requirementText = badge.requiresUsername
                ? 'USERNAME'
                : `LV ${badge.requiredLevel ?? 1}`;

              return (
                <div
                  key={badge.id}
                  data-testid={`profile-badge-${badge.id}`}
                  data-claim-state={state}
                  data-unlocked={isLocked ? 'false' : 'true'}
                  className={`flex items-center justify-between gap-2.5 rounded-xl px-3 py-2 border transition-all ${
                    isClaimed
                      ? 'border-[#34D399]/55 bg-gradient-to-r from-[#10B981]/18 to-[#0EA5E9]/10 text-white'
                      : isReady
                        ? 'border-[#FFD15C]/60 bg-[#F59E0B]/14 text-white'
                        : 'border-white/10 bg-white/[0.03] text-[#C8DAF8]/70 opacity-65'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Attached Badge PNG: blurred & dimmed until claimed; crisp full-color once claimed */}
                    <div
                      data-testid={`badge-visual-${badge.id}`}
                      className={`w-11 h-11 rounded-full overflow-hidden flex items-center justify-center bg-[#0A152C]/80 shrink-0 transition-[filter,opacity,transform] duration-150 ${
                        isClaimed
                          ? 'ring-2 ring-[#FFD15C]/80 shadow-[0_0_12px_rgba(255,209,92,0.28)] blur-none opacity-100 saturate-100'
                          : isReady
                            ? 'ring-1 ring-[#FFD15C]/45 blur-[2px] opacity-75 saturate-75'
                            : 'ring-1 ring-white/15 blur-[2.5px] opacity-60 saturate-50'
                      }`}
                    >
                      <BadgeArtwork badge={badge} />
                    </div>

                    <div className="min-w-0">
                      <p
                        className={`text-xs font-extrabold leading-tight truncate transition-[filter] duration-150 ${
                          isLocked
                            ? 'blur-[1px] text-[#CFE0FA]'
                            : isReady
                              ? 'text-[#FEF3C7]'
                              : 'blur-none text-white'
                        }`}
                      >
                        {badge.title}
                      </p>
                      <p className="mt-0.5 text-[10.5px] leading-snug text-[#DCEBFF]/80">
                        {badge.description}
                      </p>
                    </div>
                  </div>

                  {/* Right Status / Action */}
                  {isClaimed ? (
                    <span
                      data-testid={`badge-status-${badge.id}`}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 border border-[#34D399]/55 bg-[#10B981]/22 text-[10px] font-extrabold uppercase tracking-wider text-[#6EE7B7] shrink-0"
                    >
                      ✓ {UI_COPY.wallet.badgeClaimed}
                    </span>
                  ) : isReady ? (
                    <button
                      type="button"
                      disabled={loading || busyAction !== null}
                      onClick={() => handleClaimBadge(badge.id, badge.title)}
                      data-testid={`btn-claim-badge-${badge.id}`}
                      className="cursor-pointer px-2.5 py-1.5 rounded-lg border border-[#FFD15C]/65 bg-[#F59E0B]/28 hover:bg-[#F59E0B]/42 disabled:opacity-45 text-[10px] font-extrabold uppercase tracking-wider text-[#FEF3C7] transition-colors shrink-0"
                    >
                      {isClaimingThis
                        ? UI_COPY.wallet.badgeClaiming
                        : UI_COPY.wallet.badgeClaimButton}
                    </button>
                  ) : (
                    <span
                      data-testid={`badge-status-${badge.id}`}
                      className="text-[10px] font-extrabold uppercase tracking-wider text-white/45 shrink-0"
                    >
                      {requirementText}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
          </div>
        )}
        </div>

        {/* Pinned Footer Actions: Compact Data Note + Disconnect & Close */}
        <div className="px-4 sm:px-5 pt-2.5 pb-4 border-t border-white/12 bg-[#060E1D]/65 shrink-0">
          <p className="text-[10px] font-semibold text-[#C8DAF8]/70 text-center">
            {UI_COPY.wallet.compactDataNote}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
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
              data-testid="btn-profile-close-done"
              className="cursor-pointer px-5 py-2 rounded-xl border border-white/16 bg-white/8 hover:bg-white/16 text-white text-xs font-extrabold uppercase tracking-wider transition-colors"
            >
              {UI_COPY.wallet.done}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
