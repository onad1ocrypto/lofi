/**
 * Pure, decoupled Sui wallet address validation, compact profile progression,
 * badge derivation, and serialization logic for LOFI ICE ESCAPE.
 *
 * Strictly stores ONLY lightweight gameplay metadata:
 * - highestCompletedLevel (0..10)
 * - lilYetisRecruited (0..9)
 * - badges (allowlisted string IDs)
 *
 * NEVER stores private keys, secrets, music, images, or large binary assets.
 */

export const MAX_GAME_LEVEL = 10;
export const MAX_LIL_YETIS_RECRUITED = 9;
export const MAX_PROFILE_PAYLOAD_BYTES = 1024;
export const SUI_PROFILE_SCHEMA_VERSION = 1;

export type SuiBadgeId =
  | 'first_shelter'
  | 'steep_survivor'
  | 'alpine_carver'
  | 'yeti_squad'
  | 'summit_champion';

export interface SuiBadgeDefinition {
  readonly id: SuiBadgeId;
  readonly title: string;
  readonly description: string;
  readonly requiredLevel: number;
}

export const SUI_BADGE_DEFINITIONS: readonly SuiBadgeDefinition[] = [
  {
    id: 'first_shelter',
    title: 'First Shelter',
    description: 'Complete Level 1 and recruit your first Lil Yeti',
    requiredLevel: 1,
  },
  {
    id: 'steep_survivor',
    title: 'Steep Drop Survivor',
    description: 'Master the steep descent in Level 3',
    requiredLevel: 3,
  },
  {
    id: 'alpine_carver',
    title: 'Alpine Carver',
    description: 'Conquer Level 5 Drop & Jump',
    requiredLevel: 5,
  },
  {
    id: 'yeti_squad',
    title: 'Full Yeti Squad',
    description: 'Recruit all 9 Lil Yetis by completing Level 9',
    requiredLevel: 9,
  },
  {
    id: 'summit_champion',
    title: 'Summit Champion',
    description: 'Finish Level 10 Summit Run with all 9 Lil Yetis',
    requiredLevel: 10,
  },
] as const;

const VALID_BADGE_IDS = new Set<string>(SUI_BADGE_DEFINITIONS.map((b) => b.id));

export type SuiProfileSyncSource = 'sui-rpc' | 'wallet-storage';

export interface SuiPlayerProfile {
  walletAddress: string;
  highestCompletedLevel: number;
  lilYetisRecruited: number;
  badges: SuiBadgeId[];
  updatedAt: string;
  syncSource: SuiProfileSyncSource;
  lastTxDigest?: string;
}

export interface SuiCompactPayload {
  v: number;
  highestCompletedLevel: number;
  lilYetisRecruited: number;
  badges: SuiBadgeId[];
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

/** Computes recruited Lil Yetis count from highest completed level (strictly capped at 9). */
export function computeRecruitedLilYetis(highestCompletedLevel: number): number {
  if (!Number.isFinite(highestCompletedLevel)) return 0;
  const clamped = Math.max(0, Math.min(MAX_GAME_LEVEL, Math.floor(highestCompletedLevel)));
  return Math.min(MAX_LIL_YETIS_RECRUITED, clamped);
}

/** Deterministically derives earned badges from verified level & recruitment milestones. */
export function deriveBadgesForProgress(
  highestCompletedLevel: number,
  lilYetisRecruited: number,
  existingBadges: readonly SuiBadgeId[] = [],
): SuiBadgeId[] {
  const safeLevel = Math.max(0, Math.min(MAX_GAME_LEVEL, Math.floor(highestCompletedLevel)));
  const safeYetis = Math.max(
    0,
    Math.min(MAX_LIL_YETIS_RECRUITED, Math.floor(lilYetisRecruited)),
  );
  const earned = new Set<SuiBadgeId>();

  for (const id of existingBadges) {
    if (VALID_BADGE_IDS.has(id)) {
      earned.add(id);
    }
  }

  for (const def of SUI_BADGE_DEFINITIONS) {
    if (safeLevel >= def.requiredLevel) {
      earned.add(def.id);
    }
  }
  if (safeYetis >= MAX_LIL_YETIS_RECRUITED) {
    earned.add('yeti_squad');
  }

  // Preserve deterministic canonical badge ordering
  return SUI_BADGE_DEFINITIONS.map((d) => d.id).filter((id) => earned.has(id));
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
    highestCompletedLevel: 0,
    lilYetisRecruited: 0,
    badges: [],
    updatedAt: nowIso,
    syncSource: 'wallet-storage',
  };
}

/**
 * Monotonically applies a completed level to a connected wallet's Sui profile.
 * Never decreases highestCompletedLevel, lilYetisRecruited, or earned badges.
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
  const nextBadges = deriveBadgesForProgress(nextHighest, nextYetis, profile.badges);

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
  const badges = deriveBadgesForProgress(highestCompletedLevel, lilYetisRecruited, [
    ...a.badges,
    ...b.badges,
  ]);
  const updatedAt = a.updatedAt >= b.updatedAt ? a.updatedAt : b.updatedAt;
  const syncSource: SuiProfileSyncSource =
    a.syncSource === 'sui-rpc' || b.syncSource === 'sui-rpc'
      ? 'sui-rpc'
      : 'wallet-storage';
  const lastTxDigest = a.lastTxDigest ?? b.lastTxDigest;

  return {
    walletAddress: addrA,
    highestCompletedLevel,
    lilYetisRecruited,
    badges,
    updatedAt,
    syncSource,
    ...(lastTxDigest ? { lastTxDigest } : {}),
  };
}

/**
 * Serializes ONLY compact, allowlisted gameplay metadata for Sui storage.
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
  const safeBadges = deriveBadgesForProgress(safeLevel, safeYetis, profile.badges);
  const payload: SuiCompactPayload = {
    v: SUI_PROFILE_SCHEMA_VERSION,
    highestCompletedLevel: safeLevel,
    lilYetisRecruited: safeYetis,
    badges: safeBadges,
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

    const rawBadges = Array.isArray(obj.badges)
      ? obj.badges.filter((b): b is SuiBadgeId => typeof b === 'string' && VALID_BADGE_IDS.has(b))
      : [];
    const badges = deriveBadgesForProgress(
      highestCompletedLevel,
      lilYetisRecruited,
      rawBadges,
    );
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
      highestCompletedLevel,
      lilYetisRecruited,
      badges,
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
