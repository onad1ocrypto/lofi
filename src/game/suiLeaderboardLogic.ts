/**
 * Pure, decoupled Sui Leaderboard ranking, points calculation, and seed-rider
 * fallback logic for LOFI ICE ESCAPE.
 *
 * Ranking rules (strict priority order):
 * 1. Highest completed level (0..10)
 * 2. Total points (level completion points + daily check-in points)
 * 3. Claimed badges count (0..7)
 *
 * Isolation rules:
 * - Demo Mode runs are NEVER written to wallet profiles or submitted here.
 * - Connected wallet players are automatically ranked from their saved wallet profile.
 * - If fewer than 5 saved wallet profiles exist, clean sample/seed riders fill out
 *   the board so the Top 10 view never feels empty.
 */

import {
  DEFAULT_SUI_AVATAR_ID,
  MAX_GAME_LEVEL,
  SUI_BADGE_DEFINITIONS,
  clampCheckInPoints,
  normalizeAvatarId,
  normalizeSuiAddress,
  sanitizeRiderUsername,
  shortenSuiAddress,
  type SuiAvatarId,
  type SuiPlayerProfile,
} from './suiProfileLogic';

export const LEADERBOARD_MAX_ENTRIES = 10;
export const LEADERBOARD_MIN_REAL_PROFILES_FOR_NO_SEEDS = 5;
export const LEADERBOARD_POINTS_PER_LEVEL = 500;
export const LEADERBOARD_TOTAL_BADGES = SUI_BADGE_DEFINITIONS.length;

export interface SuiLeaderboardEntry {
  readonly rank: number;
  readonly walletAddress: string;
  readonly shortAddress: string;
  readonly displayName: string;
  readonly hasCustomUsername: boolean;
  readonly avatarId: SuiAvatarId;
  readonly highestCompletedLevel: number;
  readonly levelPoints: number;
  readonly checkInPoints: number;
  readonly totalPoints: number;
  readonly claimedBadgesCount: number;
  readonly totalBadgesCount: number;
  readonly isCurrentPlayer: boolean;
  readonly isSeed: boolean;
}

export interface SuiLeaderboardResult {
  readonly topEntries: readonly SuiLeaderboardEntry[];
  readonly currentPlayerEntry: SuiLeaderboardEntry | null;
  readonly realProfileCount: number;
  readonly includesSeedRiders: boolean;
}

interface RawLeaderboardRecord {
  walletAddress: string;
  username: string;
  avatarId: SuiAvatarId;
  highestCompletedLevel: number;
  checkInPoints: number;
  claimedBadgesCount: number;
  isSeed: boolean;
}

/**
 * Clean sample riders shown ONLY when fewer than 5 real saved wallet profiles
 * exist locally, ensuring the Top 10 board feels lively without overshadowing
 * real players who complete high levels or earn check-in points.
 */
export const SEED_LEADERBOARD_RIDERS: readonly RawLeaderboardRecord[] = [
  {
    walletAddress:
      '0x7a9e4c1b82f03d65a1c4e9b2f8037d61a5c9e2b4f7013d85a6c2e9b1f4087d31',
    username: 'GlacierKing',
    avatarId: 'lofi_shades',
    highestCompletedLevel: 9,
    checkInPoints: 650,
    claimedBadgesCount: 6,
    isSeed: true,
  },
  {
    walletAddress:
      '0x3b8c1f90e4a72d56c8f1a3e904b7d265f8c1a4e093b7d562f8c1a4e093b7d502',
    username: 'FrostCarver',
    avatarId: 'lofi_goggles',
    highestCompletedLevel: 7,
    checkInPoints: 500,
    claimedBadgesCount: 5,
    isSeed: true,
  },
  {
    walletAddress:
      '0x9d2f6a41c8e35b70d2f6a41c8e35b709d2f6a41c8e35b709d2f6a41c8e35b703',
    username: 'YetiBeats',
    avatarId: 'lofi_headphones',
    highestCompletedLevel: 5,
    checkInPoints: 400,
    claimedBadgesCount: 4,
    isSeed: true,
  },
  {
    walletAddress:
      '0x5e1a8b34f7c29d60e1a8b34f7c29d605e1a8b34f7c29d605e1a8b34f7c29d604',
    username: 'PowderScout',
    avatarId: 'lofi_beanie',
    highestCompletedLevel: 4,
    checkInPoints: 250,
    claimedBadgesCount: 3,
    isSeed: true,
  },
  {
    walletAddress:
      '0x2c6d9f18a4b73e50c6d9f18a4b73e502c6d9f18a4b73e502c6d9f18a4b73e505',
    username: 'AlpineDrift',
    avatarId: 'lofi_goggles',
    highestCompletedLevel: 3,
    checkInPoints: 250,
    claimedBadgesCount: 2,
    isSeed: true,
  },
  {
    walletAddress:
      '0x8f4b2e71d9c60a35f4b2e71d9c60a358f4b2e71d9c60a358f4b2e71d9c60a306',
    username: 'SnowySui',
    avatarId: 'lofi_beanie',
    highestCompletedLevel: 1,
    checkInPoints: 100,
    claimedBadgesCount: 1,
    isSeed: true,
  },
] as const;

/** Computes level-progression points from highest completed level (0..10). */
export function computeLeaderboardLevelPoints(highestCompletedLevel: number): number {
  if (!Number.isFinite(highestCompletedLevel)) return 0;
  const clamped = Math.max(0, Math.min(MAX_GAME_LEVEL, Math.floor(highestCompletedLevel)));
  return clamped * LEADERBOARD_POINTS_PER_LEVEL;
}

/**
 * Computes total Leaderboard points for a player profile:
 * level completion points + daily check-in points.
 */
export function computeLeaderboardTotalPoints(
  profile: Pick<SuiPlayerProfile, 'highestCompletedLevel' | 'checkInPoints'>,
): number {
  return (
    computeLeaderboardLevelPoints(profile.highestCompletedLevel) +
    clampCheckInPoints(profile.checkInPoints)
  );
}

/** Counts valid claimed badges for a profile (strictly clamped to 0..7). */
export function countClaimedBadges(
  profile: Pick<SuiPlayerProfile, 'claimedBadges'>,
): number {
  if (!Array.isArray(profile.claimedBadges)) return 0;
  const unique = new Set(profile.claimedBadges);
  return Math.max(0, Math.min(LEADERBOARD_TOTAL_BADGES, unique.size));
}

function toUnrankedEntry(
  record: RawLeaderboardRecord,
  connectedNormalizedAddress: string | null,
): Omit<SuiLeaderboardEntry, 'rank'> | null {
  const normalizedAddr = normalizeSuiAddress(record.walletAddress);
  if (!normalizedAddr) return null;

  const shortAddress = shortenSuiAddress(normalizedAddr);
  const cleanedUsername = sanitizeRiderUsername(record.username);
  const highestCompletedLevel = Math.max(
    0,
    Math.min(MAX_GAME_LEVEL, Math.floor(record.highestCompletedLevel || 0)),
  );
  const levelPoints = computeLeaderboardLevelPoints(highestCompletedLevel);
  const checkInPoints = clampCheckInPoints(record.checkInPoints);
  const totalPoints = levelPoints + checkInPoints;
  const claimedBadgesCount = Math.max(
    0,
    Math.min(LEADERBOARD_TOTAL_BADGES, Math.floor(record.claimedBadgesCount || 0)),
  );

  return {
    walletAddress: normalizedAddr,
    shortAddress,
    displayName: cleanedUsername || shortAddress,
    hasCustomUsername: cleanedUsername.length > 0,
    avatarId: normalizeAvatarId(record.avatarId ?? DEFAULT_SUI_AVATAR_ID),
    highestCompletedLevel,
    levelPoints,
    checkInPoints,
    totalPoints,
    claimedBadgesCount,
    totalBadgesCount: LEADERBOARD_TOTAL_BADGES,
    isCurrentPlayer:
      connectedNormalizedAddress !== null &&
      normalizedAddr === connectedNormalizedAddress,
    isSeed: record.isSeed,
  };
}

/**
 * Deterministic leaderboard comparator:
 * 1. Highest completed level (desc)
 * 2. Total points (desc)
 * 3. Badges claimed (desc)
 * 4. Real profile over seed rider, then current player, then canonical address
 */
export function compareLeaderboardEntries(
  a: Omit<SuiLeaderboardEntry, 'rank'>,
  b: Omit<SuiLeaderboardEntry, 'rank'>,
): number {
  if (b.highestCompletedLevel !== a.highestCompletedLevel) {
    return b.highestCompletedLevel - a.highestCompletedLevel;
  }
  if (b.totalPoints !== a.totalPoints) {
    return b.totalPoints - a.totalPoints;
  }
  if (b.claimedBadgesCount !== a.claimedBadgesCount) {
    return b.claimedBadgesCount - a.claimedBadgesCount;
  }
  if (a.isSeed !== b.isSeed) {
    return a.isSeed ? 1 : -1;
  }
  if (a.isCurrentPlayer !== b.isCurrentPlayer) {
    return a.isCurrentPlayer ? -1 : 1;
  }
  return a.walletAddress.localeCompare(b.walletAddress);
}

/**
 * Builds the ranked Top 10 Sui Leaderboard from saved wallet profiles (plus the
 * active connected wallet profile if provided).
 *
 * - Deduplicates by canonical Sui wallet address (preferring the live connected
 *   profile when present).
 * - Adds clean seed riders only when fewer than 5 real saved profiles exist.
 * - Never includes Demo Mode runs (Demo Mode has no wallet profile).
 */
export function buildSuiLeaderboard(
  savedProfiles: readonly SuiPlayerProfile[],
  connectedWalletAddress: string | null = null,
  activeWalletProfile: SuiPlayerProfile | null = null,
): SuiLeaderboardResult {
  const normalizedConnected = connectedWalletAddress
    ? normalizeSuiAddress(connectedWalletAddress)
    : null;

  const realByAddress = new Map<string, RawLeaderboardRecord>();

  const upsertRealProfile = (profile: SuiPlayerProfile) => {
    const normalizedAddr = normalizeSuiAddress(profile.walletAddress);
    if (!normalizedAddr) return;
    realByAddress.set(normalizedAddr, {
      walletAddress: normalizedAddr,
      username: sanitizeRiderUsername(profile.username),
      avatarId: normalizeAvatarId(profile.avatarId),
      highestCompletedLevel: profile.highestCompletedLevel,
      checkInPoints: clampCheckInPoints(profile.checkInPoints),
      claimedBadgesCount: countClaimedBadges(profile),
      isSeed: false,
    });
  };

  for (let i = 0; i < savedProfiles.length; i++) {
    upsertRealProfile(savedProfiles[i]);
  }
  if (activeWalletProfile) {
    upsertRealProfile(activeWalletProfile);
  }

  const realProfileCount = realByAddress.size;
  const includesSeedRiders =
    realProfileCount < LEADERBOARD_MIN_REAL_PROFILES_FOR_NO_SEEDS;

  const combinedRecords: RawLeaderboardRecord[] = Array.from(realByAddress.values());
  if (includesSeedRiders) {
    for (let i = 0; i < SEED_LEADERBOARD_RIDERS.length; i++) {
      const seed = SEED_LEADERBOARD_RIDERS[i];
      const seedAddr = normalizeSuiAddress(seed.walletAddress);
      if (seedAddr && !realByAddress.has(seedAddr)) {
        combinedRecords.push(seed);
      }
    }
  }

  const unranked: Array<Omit<SuiLeaderboardEntry, 'rank'>> = [];
  for (let i = 0; i < combinedRecords.length; i++) {
    const entry = toUnrankedEntry(combinedRecords[i], normalizedConnected);
    if (entry) unranked.push(entry);
  }

  unranked.sort(compareLeaderboardEntries);

  const rankedAll: SuiLeaderboardEntry[] = unranked.map((entry, idx) => ({
    ...entry,
    rank: idx + 1,
  }));

  const topEntries = rankedAll.slice(0, LEADERBOARD_MAX_ENTRIES);
  const currentPlayerEntry =
    rankedAll.find((entry) => entry.isCurrentPlayer) ?? null;

  return {
    topEntries,
    currentPlayerEntry,
    realProfileCount,
    includesSeedRiders,
  };
}
