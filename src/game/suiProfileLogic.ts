/**
 * Pure, decoupled Sui wallet address validation, compact profile progression,
 * avatar & locked username identity, Daily Check-In streak points (with 2-day
 * Streak Fire bonus), and 7 claimable badges (locked/ready/claimed) for
 * LOFI ICE ESCAPE.
 *
 * Strictly stores ONLY lightweight gameplay & hub metadata:
 * - highestCompletedLevel (0..10)
 * - lilYetisRecruited (0..9)
 * - loginStreak, lastLoginDate (YYYY-MM-DD), checkInPoints
 * - username (max 20 chars), usernameLocked, avatarId (allowlisted ID)
 * - badges & claimedBadges (allowlisted string IDs)
 *
 * NEVER stores private keys, secrets, music, images, or large binary assets.
 */

export const MAX_GAME_LEVEL = 10;
export const MAX_LIL_YETIS_RECRUITED = 9;
export const MAX_LOGIN_STREAK = 9999;
export const DAILY_STREAK_FIRE_THRESHOLD = 2;
export const DAILY_CHECKIN_BASE_POINTS = 100;
export const DAILY_STREAK_BONUS_POINTS = 50;
export const MAX_CHECKIN_POINTS = 999_999_999;
export const MAX_USERNAME_LENGTH = 20;
export const MAX_PROFILE_PAYLOAD_BYTES = 1024;
export const SUI_PROFILE_SCHEMA_VERSION = 2;

export type SuiAvatarId =
  | 'lofi_goggles'
  | 'lofi_beanie'
  | 'lofi_shades'
  | 'lofi_headphones';
export const DEFAULT_SUI_AVATAR_ID: SuiAvatarId = 'lofi_goggles';

export interface SuiAvatarOption {
  readonly id: SuiAvatarId;
  readonly label: string;
  readonly tagline: string;
  readonly imageSrc: string;
}

export const SUI_AVATAR_OPTIONS: readonly SuiAvatarOption[] = [
  {
    id: 'lofi_goggles',
    label: 'Lofi Goggles',
    tagline: 'Classic Rider',
    imageSrc: '/assets/aistudio/lofi-avatar-1-goggles_439b2dfb.png',
  },
  {
    id: 'lofi_beanie',
    label: 'Lofi Beanie',
    tagline: 'Cozy Knit',
    imageSrc: '/assets/aistudio/lofi-avatar-2-beanie_4742f5df.png',
  },
  {
    id: 'lofi_shades',
    label: 'Lofi Shades',
    tagline: 'Peak Vision',
    imageSrc: '/assets/aistudio/lofi-avatar-3-shades_b89ea6c1.png',
  },
  {
    id: 'lofi_headphones',
    label: 'Lofi Headphones',
    tagline: 'Snow Beats',
    imageSrc: '/assets/aistudio/lofi-avatar-4-headphones_24b7e03f.png',
  },
] as const;

const VALID_AVATAR_IDS = new Set<string>(SUI_AVATAR_OPTIONS.map((a) => a.id));

/** Backward-compatible migration map for earlier hub avatar IDs. */
const LEGACY_AVATAR_MIGRATION: Readonly<Record<string, SuiAvatarId>> = {
  lofi_hero: 'lofi_goggles',
  lil_yeti: 'lofi_beanie',
  summit_explorer: 'lofi_shades',
};

export type SuiBadgeId =
  | 'new_user_verified'
  | 'first_shelter'
  | 'growing_crew'
  | 'carving_master'
  | 'airborne_yeti'
  | 'slalom_pro'
  | 'summit_champion';

export type SuiBadgeClaimState = 'locked' | 'ready' | 'claimed';

export interface SuiBadgeDefinition {
  readonly id: SuiBadgeId;
  readonly title: string;
  readonly description: string;
  readonly imageSrc: string;
  readonly requiredLevel?: number;
  readonly requiresUsername?: boolean;
}

export const SUI_BADGE_DEFINITIONS: readonly SuiBadgeDefinition[] = [
  {
    id: 'new_user_verified',
    title: 'New User Verified',
    description: 'Connect your Sui wallet and save your rider username',
    imageSrc: '/assets/aistudio/lofi-badge-new-player__1_-removebg-preview_11abffc7.png',
    requiresUsername: true,
  },
  {
    id: 'first_shelter',
    title: 'First Shelter',
    description: 'Complete Level 1 to recruit your first Lil Yeti',
    imageSrc: '/assets/aistudio/lofi-badge-example__1_-removebg-preview_f18f842a.png',
    requiredLevel: 1,
  },
  {
    id: 'growing_crew',
    title: 'Growing Crew',
    description: 'Complete Level 3 and ride with 3 Lil Yetis',
    imageSrc: '/assets/aistudio/lofi-badge-growing-crew-removebg-preview_15809afa.png',
    requiredLevel: 3,
  },
  {
    id: 'carving_master',
    title: 'Carving Master',
    description: 'Master the S-curves in Level 4 Carving Pass',
    imageSrc: '/assets/aistudio/lofi-badge-carving-master-removebg-preview_7c79957f.png',
    requiredLevel: 4,
  },
  {
    id: 'airborne_yeti',
    title: 'Airborne Yeti',
    description: 'Conquer the jumps in Level 5 Drop & Jump',
    imageSrc: '/assets/aistudio/lofi-badge-airborne-yeti-removebg-preview_6c0022f5.png',
    requiredLevel: 5,
  },
  {
    id: 'slalom_pro',
    title: 'Slalom Pro',
    description: 'Clear the pine gates in Level 6 Pine Slalom',
    imageSrc: '/assets/aistudio/lofi-badge-slalom-pro-removebg-preview_6fc2a744.png',
    requiredLevel: 6,
  },
  {
    id: 'summit_champion',
    title: 'Summit Champion',
    description: 'Finish Level 10 Summit Run with all 9 Lil Yetis',
    imageSrc: '/assets/aistudio/lofi-badge-summit-champion__1_-removebg-preview_b49ee6b7.png',
    requiredLevel: 10,
  },
] as const;

const VALID_BADGE_IDS = new Set<string>(SUI_BADGE_DEFINITIONS.map((b) => b.id));

/** Backward-compatible migration map for badge IDs saved by v1 profiles. */
const LEGACY_BADGE_MIGRATION: Readonly<Record<string, SuiBadgeId>> = {
  steep_survivor: 'growing_crew',
  alpine_carver: 'airborne_yeti',
  yeti_squad: 'slalom_pro',
};

const CALENDAR_DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type SuiProfileSyncSource = 'sui-rpc' | 'wallet-storage';

export interface DailyCheckInReward {
  base: number;
  streakBonus: number;
  total: number;
}

export interface SuiPlayerProfile {
  walletAddress: string;
  username: string;
  usernameLocked: boolean;
  avatarId: SuiAvatarId;
  highestCompletedLevel: number;
  lilYetisRecruited: number;
  loginStreak: number;
  lastLoginDate: string | null;
  checkInPoints: number;
  badges: SuiBadgeId[];
  claimedBadges: SuiBadgeId[];
  updatedAt: string;
  syncSource: SuiProfileSyncSource;
  lastTxDigest?: string;
}

export interface SuiCompactPayload {
  v: number;
  username?: string;
  usernameLocked?: boolean;
  avatarId?: SuiAvatarId;
  highestCompletedLevel: number;
  lilYetisRecruited: number;
  loginStreak: number;
  lastLoginDate?: string;
  checkInPoints?: number;
  badges: SuiBadgeId[];
  claimedBadges?: SuiBadgeId[];
  updatedAt: string;
  lastTxDigest?: string;
}

const SUI_HEX_ADDRESS_RE = /^0x[0-9a-fA-F]{1,64}$/;
const SUI_TX_DIGEST_RE = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;

/** Strictly validates a Sui hexadecimal address (0x followed by 1..64 hex chars). */
export function isValidSuiAddress(raw: unknown): raw is string {
  return typeof raw === 'string' && SUI_HEX_ADDRESS_RE.test(raw.trim());
}

/**
 * Normalizes a valid Sui address to canonical 66-char lowercase form
 * (0x + zero-padded 64 hex chars). Returns null for invalid inputs.
 */
export function normalizeSuiAddress(raw: unknown): string | null {
  if (!isValidSuiAddress(raw)) return null;
  const hexBody = raw.trim().slice(2).toLowerCase();
  return `0x${hexBody.padStart(64, '0')}`;
}

/**
 * Formats a Sui address as a compact shortened label (e.g. "0x1a2b…9f0e")
 * for display on menus and profile headers without exposing long strings.
 */
export function shortenSuiAddress(
  address: string,
  prefixChars = 6,
  suffixChars = 4,
): string {
  const normalized = normalizeSuiAddress(address) ?? address.trim();
  if (normalized.length <= prefixChars + suffixChars + 1) {
    return normalized;
  }
  return `${normalized.slice(0, prefixChars)}…${normalized.slice(-suffixChars)}`;
}

/** Returns true if the value is an allowlisted hub avatar ID. */
export function isValidAvatarId(raw: unknown): raw is SuiAvatarId {
  return typeof raw === 'string' && VALID_AVATAR_IDS.has(raw);
}

/** Normalizes an allowlisted or legacy avatar ID, falling back to DEFAULT_SUI_AVATAR_ID. */
export function normalizeAvatarId(raw: unknown): SuiAvatarId {
  if (isValidAvatarId(raw)) return raw;
  if (typeof raw === 'string' && raw in LEGACY_AVATAR_MIGRATION) {
    return LEGACY_AVATAR_MIGRATION[raw];
  }
  return DEFAULT_SUI_AVATAR_ID;
}

/** Sanitizes a rider display username (strips control chars, collapses whitespace, max 20 chars). */
export function sanitizeRiderUsername(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, MAX_USERNAME_LENGTH);
}

/** Normalizes a raw badge ID string (including v1 legacy IDs) to a canonical SuiBadgeId or null. */
function normalizeBadgeId(raw: unknown): SuiBadgeId | null {
  if (typeof raw !== 'string') return null;
  if (VALID_BADGE_IDS.has(raw)) return raw as SuiBadgeId;
  return LEGACY_BADGE_MIGRATION[raw] ?? null;
}

/** Orders and deduplicates allowlisted badge IDs in canonical definition order. */
function canonicalizeBadgeList(ids: Iterable<string>): SuiBadgeId[] {
  const valid = new Set<SuiBadgeId>();
  for (const raw of ids) {
    const normalized = normalizeBadgeId(raw);
    if (normalized) valid.add(normalized);
  }
  return SUI_BADGE_DEFINITIONS.map((d) => d.id).filter((id) => valid.has(id));
}

/** Formats a Date or validates a YYYY-MM-DD calendar date key in local calendar days. */
export function toCalendarDateKey(input: Date | string = new Date()): string | null {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    const match = CALENDAR_DATE_KEY_RE.exec(trimmed);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const utc = new Date(Date.UTC(year, month - 1, day));
    if (
      utc.getUTCFullYear() !== year ||
      utc.getUTCMonth() + 1 !== month ||
      utc.getUTCDate() !== day
    ) {
      return null;
    }
    return trimmed;
  }
  if (!(input instanceof Date) || Number.isNaN(input.getTime())) {
    return null;
  }
  const y = String(input.getFullYear()).padStart(4, '0');
  const m = String(input.getMonth() + 1).padStart(2, '0');
  const d = String(input.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Computes whole-day delta (toDateKey - fromDateKey) between two validated YYYY-MM-DD keys. */
export function computeCalendarDayDelta(
  fromDateKey: string,
  toDateKey: string,
): number | null {
  const safeFrom = toCalendarDateKey(fromDateKey);
  const safeTo = toCalendarDateKey(toDateKey);
  if (!safeFrom || !safeTo) return null;
  const [fy, fm, fd] = safeFrom.split('-').map(Number);
  const [ty, tm, td] = safeTo.split('-').map(Number);
  const fromMs = Date.UTC(fy, fm - 1, fd);
  const toMs = Date.UTC(ty, tm - 1, td);
  return Math.round((toMs - fromMs) / 86_400_000);
}

/** True when the connected wallet has already completed today's Daily Check-In. */
export function hasCheckedInToday(
  profile: Pick<SuiPlayerProfile, 'lastLoginDate'>,
  now: Date | string = new Date(),
): boolean {
  const todayKey = toCalendarDateKey(now);
  const lastKey = profile.lastLoginDate ? toCalendarDateKey(profile.lastLoginDate) : null;
  if (!todayKey || !lastKey) return false;
  const delta = computeCalendarDayDelta(lastKey, todayKey);
  return delta !== null && delta <= 0;
}

/** Clamps a raw login streak integer to [0..MAX_LOGIN_STREAK]. */
export function clampLoginStreak(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(MAX_LOGIN_STREAK, Math.floor(raw)));
}

/** Clamps check-in points integer to [0..MAX_CHECKIN_POINTS]. */
export function clampCheckInPoints(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(MAX_CHECKIN_POINTS, Math.floor(raw)));
}

/** True when the player currently has an active daily check-in streak (2+ consecutive days). */
export function hasStreakFireBadge(
  profileOrStreak: Pick<SuiPlayerProfile, 'loginStreak'> | number,
): boolean {
  const streak =
    typeof profileOrStreak === 'number'
      ? clampLoginStreak(profileOrStreak)
      : clampLoginStreak(profileOrStreak.loginStreak);
  return streak >= DAILY_STREAK_FIRE_THRESHOLD;
}

/** Computes points awarded for a Daily Check-In (base points + 2-day Streak Fire bonus). */
export function computeDailyCheckInPointsReward(nextStreak: number): DailyCheckInReward {
  const safeStreak = clampLoginStreak(nextStreak);
  const base = DAILY_CHECKIN_BASE_POINTS;
  const streakBonus =
    safeStreak >= DAILY_STREAK_FIRE_THRESHOLD ? DAILY_STREAK_BONUS_POINTS : 0;
  return {
    base,
    streakBonus,
    total: base + streakBonus,
  };
}

/** Predicts the streak & points reward the player will receive if they check in today. */
export function previewNextDailyCheckInReward(
  profile: Pick<SuiPlayerProfile, 'loginStreak' | 'lastLoginDate'>,
  now: Date | string = new Date(),
): DailyCheckInReward {
  const todayKey = toCalendarDateKey(now);
  const prevDate = profile.lastLoginDate ? toCalendarDateKey(profile.lastLoginDate) : null;
  const prevStreak = clampLoginStreak(profile.loginStreak);

  let projectedStreak = 1;
  if (todayKey && prevDate) {
    const delta = computeCalendarDayDelta(prevDate, todayKey);
    if (delta === 1) {
      projectedStreak = Math.min(MAX_LOGIN_STREAK, Math.max(1, prevStreak) + 1);
    } else if (delta === 0) {
      projectedStreak = Math.max(1, prevStreak);
    }
  }
  return computeDailyCheckInPointsReward(projectedStreak);
}

/** Computes recruited Lil Yetis count from highest completed level (strictly capped at 9). */
export function computeRecruitedLilYetis(highestCompletedLevel: number): number {
  if (!Number.isFinite(highestCompletedLevel)) return 0;
  const clamped = Math.max(0, Math.min(MAX_GAME_LEVEL, Math.floor(highestCompletedLevel)));
  return Math.min(MAX_LIL_YETIS_RECRUITED, clamped);
}

/**
 * Deterministically derives unlocked badges from verified wallet username and
 * level/recruitment milestones. Daily Check-In Streak awards points ONLY and
 * never unlocks a badge.
 */
export function deriveBadgesForProgress(
  highestCompletedLevel: number,
  lilYetisRecruited: number,
  existingBadges: readonly string[] = [],
  hasSavedUsername = false,
): SuiBadgeId[] {
  const safeLevel = Math.max(0, Math.min(MAX_GAME_LEVEL, Math.floor(highestCompletedLevel)));
  const safeYetis = Math.max(
    0,
    Math.min(MAX_LIL_YETIS_RECRUITED, Math.floor(lilYetisRecruited)),
  );
  const earned = new Set<SuiBadgeId>();

  for (const rawId of existingBadges) {
    const id = normalizeBadgeId(rawId);
    if (id && id !== 'new_user_verified') {
      earned.add(id);
    }
  }

  for (const def of SUI_BADGE_DEFINITIONS) {
    if (def.requiresUsername && hasSavedUsername) {
      earned.add(def.id);
    }
    if (def.requiredLevel !== undefined && safeLevel >= def.requiredLevel) {
      earned.add(def.id);
    }
  }
  if (safeYetis >= 3) {
    earned.add('growing_crew');
  }

  return SUI_BADGE_DEFINITIONS.map((d) => d.id).filter((id) => earned.has(id));
}

/**
 * Returns the 3-state visual & interaction status for a badge in the Player Hub:
 * - 'locked': unlock task not yet completed (dimmed + blurred)
 * - 'ready': task completed, awaiting wallet signature claim (dimmed + slightly blurred)
 * - 'claimed': verified & claimed via wallet signature (crisp, full-color, no blur)
 */
export function getBadgeClaimState(
  profile: Pick<SuiPlayerProfile, 'badges' | 'claimedBadges'>,
  badgeId: SuiBadgeId,
): SuiBadgeClaimState {
  const isUnlocked = profile.badges.includes(badgeId);
  if (!isUnlocked) return 'locked';
  return profile.claimedBadges.includes(badgeId) ? 'claimed' : 'ready';
}

/** Returns the canonical ordered list of badge definitions the player has claimed. */
export function getClaimedBadgeDefinitions(
  profile: Pick<SuiPlayerProfile, 'badges' | 'claimedBadges'>,
): SuiBadgeDefinition[] {
  return SUI_BADGE_DEFINITIONS.filter(
    (def) => getBadgeClaimState(profile, def.id) === 'claimed',
  );
}

/** Returns the canonical ordered list of unlocked badges awaiting wallet signature claim. */
export function getReadyBadgeDefinitions(
  profile: Pick<SuiPlayerProfile, 'badges' | 'claimedBadges'>,
): SuiBadgeDefinition[] {
  return SUI_BADGE_DEFINITIONS.filter(
    (def) => getBadgeClaimState(profile, def.id) === 'ready',
  );
}

/**
 * Marks a 'ready' badge as 'claimed' after a successful wallet signature.
 * Refuses to claim locked badges and is idempotent for already-claimed badges.
 */
export function claimBadgeInProfile(
  profile: SuiPlayerProfile,
  badgeId: SuiBadgeId,
  nowIso = new Date().toISOString(),
): SuiPlayerProfile {
  if (getBadgeClaimState(profile, badgeId) !== 'ready') {
    return profile;
  }
  const nextClaimed = canonicalizeBadgeList([...profile.claimedBadges, badgeId]);
  return {
    ...profile,
    claimedBadges: nextClaimed,
    updatedAt: nowIso,
  };
}

/**
 * Updates rider hub identity fields (username and/or avatarId) for the connected wallet.
 * Once `usernameLocked` is true, the username is immutable and cannot be modified.
 */
export function updateProfileIdentity(
  profile: SuiPlayerProfile,
  updates: { username?: string; avatarId?: SuiAvatarId },
  nowIso = new Date().toISOString(),
): SuiPlayerProfile {
  const isLocked = Boolean(profile.usernameLocked && profile.username.length > 0);
  const nextUsername = isLocked
    ? profile.username
    : updates.username !== undefined
      ? sanitizeRiderUsername(updates.username)
      : profile.username;
  const nextAvatarId =
    updates.avatarId !== undefined && isValidAvatarId(updates.avatarId)
      ? updates.avatarId
      : profile.avatarId;
  const nextBadges = deriveBadgesForProgress(
    profile.highestCompletedLevel,
    profile.lilYetisRecruited,
    profile.badges,
    nextUsername.length > 0,
  );
  const earnedSet = new Set<SuiBadgeId>(nextBadges);
  const nextClaimed = canonicalizeBadgeList(
    profile.claimedBadges.filter((id) => earnedSet.has(id)),
  );
  return {
    ...profile,
    username: nextUsername,
    usernameLocked: isLocked,
    avatarId: nextAvatarId,
    badges: nextBadges,
    claimedBadges: nextClaimed,
    updatedAt: nowIso,
  };
}

/**
 * Permanently sets and locks a rider's username after a verified Sui wallet signature,
 * unlocking the "New User Verified" badge as Ready to Claim.
 * Refuses empty usernames and cannot modify a username that is already locked.
 */
export function lockProfileUsername(
  profile: SuiPlayerProfile,
  rawUsername: string,
  nowIso = new Date().toISOString(),
): SuiPlayerProfile {
  if (profile.usernameLocked && profile.username.length > 0) {
    return profile;
  }
  const cleaned = sanitizeRiderUsername(rawUsername);
  if (!cleaned) {
    return profile;
  }
  const nextBadges = deriveBadgesForProgress(
    profile.highestCompletedLevel,
    profile.lilYetisRecruited,
    profile.badges,
    true,
  );
  return {
    ...profile,
    username: cleaned,
    usernameLocked: true,
    badges: nextBadges,
    updatedAt: nowIso,
  };
}

/** Creates an empty initial Sui player profile for a newly connected wallet. */
export function createEmptySuiProfile(
  walletAddress: string,
  nowIso = new Date().toISOString(),
): SuiPlayerProfile {
  const normalized = normalizeSuiAddress(walletAddress);
  if (!normalized) {
    throw new Error('Invalid Sui wallet address');
  }
  return {
    walletAddress: normalized,
    username: '',
    usernameLocked: false,
    avatarId: DEFAULT_SUI_AVATAR_ID,
    highestCompletedLevel: 0,
    lilYetisRecruited: 0,
    loginStreak: 0,
    lastLoginDate: null,
    checkInPoints: 0,
    badges: [],
    claimedBadges: [],
    updatedAt: nowIso,
    syncSource: 'wallet-storage',
  };
}

/**
 * Records a verified wallet daily check-in for a calendar day, updates the streak,
 * and awards check-in points (base + 2-day Streak Fire bonus). Does NOT unlock a badge.
 * - First check-in (no lastLoginDate): streak becomes 1, awards base points (+100).
 * - Same calendar day (delta === 0): idempotent (no duplicate points).
 * - Consecutive next day (delta === 1): increments streak by 1, awards base + bonus (+150 at 2+ days).
 * - Missed day(s) (delta > 1): resets streak to 1, awards base points (+100).
 * - Clock skew behind stored date (delta < 0): safely preserves existing streak, date, and points.
 */
export function applyDailyLoginToProfile(
  profile: SuiPlayerProfile,
  now: Date | string = new Date(),
  nowIso = now instanceof Date ? now.toISOString() : new Date().toISOString(),
): SuiPlayerProfile {
  const todayKey = toCalendarDateKey(now);
  if (!todayKey) return profile;

  const prevStreak = clampLoginStreak(profile.loginStreak);
  const prevPoints = clampCheckInPoints(profile.checkInPoints);
  const prevDate = profile.lastLoginDate ? toCalendarDateKey(profile.lastLoginDate) : null;

  let nextStreak = prevStreak;
  let nextDate: string = todayKey;
  let awardedPoints = 0;

  if (!prevDate) {
    nextStreak = Math.max(1, prevStreak);
    awardedPoints = computeDailyCheckInPointsReward(nextStreak).total;
  } else {
    const delta = computeCalendarDayDelta(prevDate, todayKey);
    if (delta === null || delta > 1) {
      nextStreak = 1;
      awardedPoints = computeDailyCheckInPointsReward(nextStreak).total;
    } else if (delta === 1) {
      nextStreak = Math.min(MAX_LOGIN_STREAK, Math.max(1, prevStreak) + 1);
      awardedPoints = computeDailyCheckInPointsReward(nextStreak).total;
    } else if (delta === 0) {
      nextStreak = Math.max(1, prevStreak);
      nextDate = prevDate;
      awardedPoints = 0;
    } else {
      // Clock skew behind stored date: keep stored streak/date/points untouched
      nextStreak = Math.max(1, prevStreak);
      nextDate = prevDate;
      awardedPoints = 0;
    }
  }

  const nextPoints = clampCheckInPoints(prevPoints + awardedPoints);
  const nextBadges = deriveBadgesForProgress(
    profile.highestCompletedLevel,
    profile.lilYetisRecruited,
    profile.badges,
    profile.username.length > 0,
  );
  const earnedSet = new Set<SuiBadgeId>(nextBadges);
  const nextClaimed = canonicalizeBadgeList(
    profile.claimedBadges.filter((id) => earnedSet.has(id)),
  );

  return {
    ...profile,
    loginStreak: nextStreak,
    lastLoginDate: nextDate,
    checkInPoints: nextPoints,
    badges: nextBadges,
    claimedBadges: nextClaimed,
    updatedAt: nowIso,
  };
}

/**
 * Monotonically applies a completed level to a connected wallet's Sui profile.
 * Never decreases highestCompletedLevel, lilYetisRecruited, or earned/claimed badges.
 */
export function applyLevelCompletionToProfile(
  profile: SuiPlayerProfile,
  completedLevel: number,
  nowIso = new Date().toISOString(),
): SuiPlayerProfile {
  const safeCompleted = Math.max(1, Math.min(MAX_GAME_LEVEL, Math.floor(completedLevel)));
  const nextHighest = Math.max(profile.highestCompletedLevel, safeCompleted);
  const nextYetis = Math.max(
    profile.lilYetisRecruited,
    computeRecruitedLilYetis(nextHighest),
  );
  const nextBadges = deriveBadgesForProgress(
    nextHighest,
    nextYetis,
    profile.badges,
    profile.username.length > 0,
  );

  return {
    ...profile,
    highestCompletedLevel: nextHighest,
    lilYetisRecruited: nextYetis,
    badges: nextBadges,
    updatedAt: nowIso,
  };
}

/**
 * Monotonically merges two profile snapshots for the same Sui wallet address
 * (e.g., on-chain Sui RPC state + per-wallet browser cache).
 */
export function mergeSuiProfiles(
  a: SuiPlayerProfile,
  b: SuiPlayerProfile,
): SuiPlayerProfile {
  const addrA = normalizeSuiAddress(a.walletAddress);
  const addrB = normalizeSuiAddress(b.walletAddress);
  if (!addrA || addrA !== addrB) {
    throw new Error('Cannot merge profiles for different Sui wallet addresses');
  }

  const highestCompletedLevel = Math.max(a.highestCompletedLevel, b.highestCompletedLevel);
  const lilYetisRecruited = Math.max(
    a.lilYetisRecruited,
    b.lilYetisRecruited,
    computeRecruitedLilYetis(highestCompletedLevel),
  );

  const dateA = a.lastLoginDate ? toCalendarDateKey(a.lastLoginDate) : null;
  const dateB = b.lastLoginDate ? toCalendarDateKey(b.lastLoginDate) : null;
  let lastLoginDate: string | null = null;
  let loginStreak = 0;

  if (dateA && dateB) {
    if (dateA > dateB) {
      lastLoginDate = dateA;
      loginStreak = clampLoginStreak(a.loginStreak);
    } else if (dateB > dateA) {
      lastLoginDate = dateB;
      loginStreak = clampLoginStreak(b.loginStreak);
    } else {
      lastLoginDate = dateA;
      loginStreak = Math.max(clampLoginStreak(a.loginStreak), clampLoginStreak(b.loginStreak));
    }
  } else if (dateA) {
    lastLoginDate = dateA;
    loginStreak = clampLoginStreak(a.loginStreak);
  } else if (dateB) {
    lastLoginDate = dateB;
    loginStreak = clampLoginStreak(b.loginStreak);
  } else {
    loginStreak = Math.max(clampLoginStreak(a.loginStreak), clampLoginStreak(b.loginStreak));
  }

  const checkInPoints = Math.max(
    clampCheckInPoints(a.checkInPoints),
    clampCheckInPoints(b.checkInPoints),
  );

  const aIsNewer = a.updatedAt >= b.updatedAt;
  const updatedAt = aIsNewer ? a.updatedAt : b.updatedAt;
  const primary = aIsNewer ? a : b;
  const secondary = aIsNewer ? b : a;
  const aLocked = Boolean(a.usernameLocked && sanitizeRiderUsername(a.username));
  const bLocked = Boolean(b.usernameLocked && sanitizeRiderUsername(b.username));
  let username = '';
  let usernameLocked = false;
  if (aLocked && bLocked) {
    username = sanitizeRiderUsername(primary.username);
    usernameLocked = true;
  } else if (aLocked) {
    username = sanitizeRiderUsername(a.username);
    usernameLocked = true;
  } else if (bLocked) {
    username = sanitizeRiderUsername(b.username);
    usernameLocked = true;
  } else {
    username = sanitizeRiderUsername(primary.username) || sanitizeRiderUsername(secondary.username);
    usernameLocked = false;
  }
  const avatarId = isValidAvatarId(primary.avatarId)
    ? primary.avatarId
    : isValidAvatarId(secondary.avatarId)
      ? secondary.avatarId
      : DEFAULT_SUI_AVATAR_ID;

  const badges = deriveBadgesForProgress(
    highestCompletedLevel,
    lilYetisRecruited,
    [...a.badges, ...b.badges],
    username.length > 0,
  );
  const earnedSet = new Set<SuiBadgeId>(badges);
  const claimedBadges = canonicalizeBadgeList(
    [...a.claimedBadges, ...b.claimedBadges].filter((id) => earnedSet.has(id)),
  );

  const syncSource: SuiProfileSyncSource =
    a.syncSource === 'sui-rpc' || b.syncSource === 'sui-rpc'
      ? 'sui-rpc'
      : 'wallet-storage';
  const lastTxDigest = a.lastTxDigest ?? b.lastTxDigest;

  return {
    walletAddress: addrA,
    username,
    usernameLocked,
    avatarId,
    highestCompletedLevel,
    lilYetisRecruited,
    loginStreak,
    lastLoginDate,
    checkInPoints,
    badges,
    claimedBadges,
    updatedAt,
    syncSource,
    ...(lastTxDigest ? { lastTxDigest } : {}),
  };
}

/**
 * Serializes ONLY compact, allowlisted gameplay & hub metadata for Sui storage.
 * Enforces a strict byte ceiling so music, images, or large files can never be stored.
 */
export function serializeSuiProfilePayload(profile: SuiPlayerProfile): string {
  const safeLevel = Math.max(
    0,
    Math.min(MAX_GAME_LEVEL, Math.floor(profile.highestCompletedLevel)),
  );
  const safeYetis = Math.max(
    0,
    Math.min(MAX_LIL_YETIS_RECRUITED, Math.floor(profile.lilYetisRecruited)),
  );
  const safeStreak = clampLoginStreak(profile.loginStreak);
  const safePoints = clampCheckInPoints(profile.checkInPoints);
  const safeLastLoginDate = profile.lastLoginDate
    ? toCalendarDateKey(profile.lastLoginDate)
    : null;
  const safeUsername = sanitizeRiderUsername(profile.username);
  const safeAvatarId = isValidAvatarId(profile.avatarId)
    ? profile.avatarId
    : DEFAULT_SUI_AVATAR_ID;
  const safeBadges = deriveBadgesForProgress(
    safeLevel,
    safeYetis,
    profile.badges,
    safeUsername.length > 0,
  );
  const earnedSet = new Set<SuiBadgeId>(safeBadges);
  const safeClaimed = canonicalizeBadgeList(
    (profile.claimedBadges ?? []).filter((id) => earnedSet.has(id)),
  );

  const payload: SuiCompactPayload = {
    v: SUI_PROFILE_SCHEMA_VERSION,
    ...(safeUsername ? { username: safeUsername } : {}),
    ...(safeUsername && profile.usernameLocked ? { usernameLocked: true } : {}),
    avatarId: safeAvatarId,
    highestCompletedLevel: safeLevel,
    lilYetisRecruited: safeYetis,
    loginStreak: safeStreak,
    ...(safeLastLoginDate ? { lastLoginDate: safeLastLoginDate } : {}),
    ...(safePoints > 0 ? { checkInPoints: safePoints } : {}),
    badges: safeBadges,
    ...(safeClaimed.length > 0 ? { claimedBadges: safeClaimed } : {}),
    updatedAt:
      typeof profile.updatedAt === 'string' && profile.updatedAt.length <= 40
        ? profile.updatedAt
        : new Date().toISOString(),
    ...(profile.lastTxDigest && SUI_TX_DIGEST_RE.test(profile.lastTxDigest)
      ? { lastTxDigest: profile.lastTxDigest }
      : {}),
  };
  const encoded = JSON.stringify(payload);
  if (encoded.length > MAX_PROFILE_PAYLOAD_BYTES) {
    throw new Error('Sui profile payload exceeded compact size limit');
  }
  return encoded;
}

/**
 * Strictly parses and validates a stored compact Sui profile JSON string.
 * Returns null if missing, oversized, or corrupted.
 */
export function parseSuiProfilePayload(
  walletAddress: string,
  rawJson: string | null,
  syncSource: SuiProfileSyncSource = 'wallet-storage',
): SuiPlayerProfile | null {
  const normalized = normalizeSuiAddress(walletAddress);
  if (!normalized || !rawJson || rawJson.length > MAX_PROFILE_PAYLOAD_BYTES) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const obj = parsed as Record<string, unknown>;
    const rawLevel = typeof obj.highestCompletedLevel === 'number' ? obj.highestCompletedLevel : 0;
    const rawYetis = typeof obj.lilYetisRecruited === 'number' ? obj.lilYetisRecruited : 0;
    const highestCompletedLevel = Number.isFinite(rawLevel)
      ? Math.max(0, Math.min(MAX_GAME_LEVEL, Math.floor(rawLevel)))
      : 0;
    const lilYetisRecruited = Number.isFinite(rawYetis)
      ? Math.max(
          computeRecruitedLilYetis(highestCompletedLevel),
          Math.min(MAX_LIL_YETIS_RECRUITED, Math.floor(rawYetis)),
        )
      : computeRecruitedLilYetis(highestCompletedLevel);

    const loginStreak = clampLoginStreak(obj.loginStreak);
    const checkInPoints = clampCheckInPoints(obj.checkInPoints);
    const lastLoginDate =
      typeof obj.lastLoginDate === 'string' ? toCalendarDateKey(obj.lastLoginDate) : null;
    const username = sanitizeRiderUsername(obj.username);
    const usernameLocked = Boolean(obj.usernameLocked === true && username.length > 0);
    const avatarId = normalizeAvatarId(obj.avatarId);

    const rawBadges = Array.isArray(obj.badges)
      ? obj.badges.filter((b): b is string => typeof b === 'string')
      : [];
    const badges = deriveBadgesForProgress(
      highestCompletedLevel,
      lilYetisRecruited,
      rawBadges,
      username.length > 0,
    );
    const earnedSet = new Set<SuiBadgeId>(badges);
    const rawClaimed = Array.isArray(obj.claimedBadges)
      ? obj.claimedBadges.filter((b): b is string => typeof b === 'string')
      : [];
    const claimedBadges = canonicalizeBadgeList(rawClaimed).filter((id) => earnedSet.has(id));

    const updatedAt =
      typeof obj.updatedAt === 'string' && obj.updatedAt.length <= 40
        ? obj.updatedAt
        : new Date().toISOString();
    const lastTxDigest =
      typeof obj.lastTxDigest === 'string' && SUI_TX_DIGEST_RE.test(obj.lastTxDigest)
        ? obj.lastTxDigest
        : undefined;

    return {
      walletAddress: normalized,
      username,
      usernameLocked,
      avatarId,
      highestCompletedLevel,
      lilYetisRecruited,
      loginStreak,
      lastLoginDate,
      checkInPoints,
      badges,
      claimedBadges,
      updatedAt,
      syncSource,
      ...(lastTxDigest ? { lastTxDigest } : {}),
    };
  } catch {
    return null;
  }
}

/** Storage key scoped strictly to a canonical Sui wallet address (never shared with Demo Mode). */
export function buildSuiProfileStorageKey(walletAddress: string): string | null {
  const normalized = normalizeSuiAddress(walletAddress);
  if (!normalized) return null;
  return `lofi_ice_escape_sui_profile_v1:${normalized}`;
}

const ALLOWED_SUI_RPC_HOSTS = new Set([
  'fullnode.mainnet.sui.io',
  'fullnode.testnet.sui.io',
  'fullnode.devnet.sui.io',
  'sui-mainnet.mystenlabs.com',
  'sui-testnet.mystenlabs.com',
  'sui-devnet.mystenlabs.com',
]);

/** Strictly validates an optional Sui JSON-RPC URL against https + trusted Sui endpoints. */
export function isAllowedSuiRpcUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_SUI_RPC_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Sanitizes wallet provider icon URLs to prevent unsafe schemes. */
export function sanitizeWalletIconUrl(raw?: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 65536) return null;
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:image/png;base64,') ||
    trimmed.startsWith('data:image/webp;base64,') ||
    trimmed.startsWith('data:image/svg+xml;base64,')
  ) {
    return trimmed;
  }
  return null;
}
