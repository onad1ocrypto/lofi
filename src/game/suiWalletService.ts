/**
 * Real Sui Wallet Standard discovery, connection, disconnect, and compact
 * Sui profile persistence/RPC loading service.
 *
 * - Supports all standard Sui wallet extensions (Slush / Sui Wallet, Suiet,
 *   Nightly, Ethos, Surf, etc.) via the official Wallet Standard protocol
 *   (`wallet-standard:app-ready` / `wallet-standard:register-wallet`).
 * - Demo mode NEVER writes to Sui or to any wallet profile.
 * - Disconnect returns cleanly to Demo Mode without deleting local game data
 *   or previously saved wallet profile records.
 * - Never handles, stores, logs, or displays private keys or secrets.
 */

import {
  buildSuiProfileStorageKey,
  createEmptySuiProfile,
  deriveBadgesForProgress,
  isAllowedSuiRpcUrl,
  mergeSuiProfiles,
  normalizeSuiAddress,
  parseSuiProfilePayload,
  sanitizeWalletIconUrl,
  serializeSuiProfilePayload,
  type SuiBadgeId,
  type SuiPlayerProfile,
} from './suiProfileLogic';

const DEFAULT_SUI_RPC_URL = 'https://fullnode.testnet.sui.io:443';

interface WalletStandardAccount {
  address: string;
  chains?: readonly string[];
  label?: string;
}

interface WalletStandardConnectFeature {
  connect: () => Promise<{ accounts: readonly WalletStandardAccount[] }>;
}

interface WalletStandardDisconnectFeature {
  disconnect: () => Promise<void>;
}

interface WalletStandardEventsFeature {
  on: (
    event: 'change',
    listener: (properties: { accounts?: readonly WalletStandardAccount[] }) => void,
  ) => (() => void) | void;
}

export interface WalletStandardProvider {
  name: string;
  icon?: string;
  chains?: readonly string[];
  accounts?: readonly WalletStandardAccount[];
  features?: {
    'standard:connect'?: WalletStandardConnectFeature;
    'standard:disconnect'?: WalletStandardDisconnectFeature;
    'standard:events'?: WalletStandardEventsFeature;
    [featureName: string]: unknown;
  };
}

export interface DetectedSuiWallet {
  id: string;
  name: string;
  icon: string | null;
  provider: WalletStandardProvider;
}

export interface ConnectedSuiWalletSession {
  walletId: string;
  walletName: string;
  walletIcon: string | null;
  address: string;
  provider: WalletStandardProvider;
}

function isSuiCompatibleWallet(wallet: unknown): wallet is WalletStandardProvider {
  if (!wallet || typeof wallet !== 'object') return false;
  const candidate = wallet as Partial<WalletStandardProvider>;
  if (typeof candidate.name !== 'string' || candidate.name.trim().length === 0) {
    return false;
  }
  const features = candidate.features;
  if (!features || typeof features !== 'object') return false;
  const connectFeature = features['standard:connect'] as
    | Partial<WalletStandardConnectFeature>
    | undefined;
  if (!connectFeature || typeof connectFeature.connect !== 'function') {
    return false;
  }
  // Accept wallets advertising Sui chains or any sui:* Wallet Standard feature
  const hasSuiChain =
    Array.isArray(candidate.chains) &&
    candidate.chains.some((c) => typeof c === 'string' && c.startsWith('sui:'));
  const hasSuiFeature = Object.keys(features).some((k) => k.startsWith('sui:'));
  return hasSuiChain || hasSuiFeature;
}

const registeredWallets = new Map<string, DetectedSuiWallet>();
const walletListeners = new Set<(wallets: DetectedSuiWallet[]) => void>();
let discoveryInitialized = false;

function getWalletListSnapshot(): DetectedSuiWallet[] {
  return Array.from(registeredWallets.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

function emitWalletList(): void {
  const snapshot = getWalletListSnapshot();
  walletListeners.forEach((cb) => cb(snapshot));
}

function registerWalletCandidate(candidate: unknown): () => void {
  if (!isSuiCompatibleWallet(candidate)) {
    return () => {};
  }
  const cleanName = candidate.name.trim().slice(0, 48);
  const id = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  registeredWallets.set(id, {
    id,
    name: cleanName,
    icon: sanitizeWalletIconUrl(candidate.icon),
    provider: candidate,
  });
  emitWalletList();
  return () => {
    registeredWallets.delete(id);
    emitWalletList();
  };
}

/** Initializes browser Wallet Standard discovery for Sui extensions (idempotent). */
export function ensureSuiWalletDiscovery(): void {
  if (discoveryInitialized || typeof window === 'undefined') return;
  discoveryInitialized = true;

  const registerApi = {
    register: (...wallets: unknown[]) => {
      const unregisters = wallets.map((w) => registerWalletCandidate(w));
      return () => {
        unregisters.forEach((fn) => fn());
      };
    },
  };

  // Listen for wallets registering after app boot
  window.addEventListener('wallet-standard:register-wallet', (event: Event) => {
    const custom = event as CustomEvent<(api: typeof registerApi) => void>;
    if (typeof custom.detail === 'function') {
      try {
        custom.detail(registerApi);
      } catch {
        // Ignore malformed external provider registration
      }
    }
  });

  // Announce app readiness so already-installed Sui extensions register immediately
  try {
    window.dispatchEvent(
      new CustomEvent('wallet-standard:app-ready', {
        detail: registerApi,
      }),
    );
  } catch {
    // Ignore in restricted environments
  }
}

/** Re-announces app-ready so newly unlocked Sui extensions can register on demand. */
export function refreshDetectedSuiWallets(): DetectedSuiWallet[] {
  if (typeof window !== 'undefined') {
    ensureSuiWalletDiscovery();
    try {
      window.dispatchEvent(
        new CustomEvent('wallet-standard:app-ready', {
          detail: {
            register: (...wallets: unknown[]) => {
              const unregisters = wallets.map((w) => registerWalletCandidate(w));
              return () => unregisters.forEach((fn) => fn());
            },
          },
        }),
      );
    } catch {
      // Ignore dispatch errors
    }
  }
  return getWalletListSnapshot();
}

/** Subscribes to the live list of detected Sui browser wallets. */
export function subscribeDetectedSuiWallets(
  listener: (wallets: DetectedSuiWallet[]) => void,
): () => void {
  ensureSuiWalletDiscovery();
  walletListeners.add(listener);
  listener(getWalletListSnapshot());
  return () => {
    walletListeners.delete(listener);
  };
}

/**
 * Connects to a detected Sui Wallet Standard provider and returns the verified
 * public Sui address. Never requests or exposes private keys.
 */
export async function connectSuiWallet(
  wallet: DetectedSuiWallet,
): Promise<ConnectedSuiWalletSession> {
  const connectFeature = wallet.provider.features?.['standard:connect'];
  if (!connectFeature || typeof connectFeature.connect !== 'function') {
    throw new Error(`${wallet.name} does not expose standard:connect`);
  }

  const result = await connectFeature.connect();
  const accounts = result?.accounts ?? wallet.provider.accounts ?? [];
  const suiAccount =
    accounts.find(
      (acc) =>
        normalizeSuiAddress(acc?.address) !== null &&
        (!acc.chains || acc.chains.some((c) => c.startsWith('sui:'))),
    ) ?? accounts.find((acc) => normalizeSuiAddress(acc?.address) !== null);

  const normalizedAddress = suiAccount ? normalizeSuiAddress(suiAccount.address) : null;
  if (!normalizedAddress) {
    throw new Error(`No valid Sui account returned by ${wallet.name}`);
  }

  return {
    walletId: wallet.id,
    walletName: wallet.name,
    walletIcon: wallet.icon,
    address: normalizedAddress,
    provider: wallet.provider,
  };
}

/**
 * Disconnects the active Sui wallet session cleanly.
 * Never deletes local game data or saved Sui profiles.
 */
export async function disconnectSuiWallet(
  session: ConnectedSuiWalletSession | null,
): Promise<void> {
  if (!session) return;
  const disconnectFeature = session.provider.features?.['standard:disconnect'];
  if (disconnectFeature && typeof disconnectFeature.disconnect === 'function') {
    try {
      await disconnectFeature.disconnect();
    } catch {
      // Some wallet extensions reject programmatic disconnect; returning to Demo Mode still succeeds
    }
  }
}

/** Subscribes to wallet-initiated account changes or disconnects. */
export function subscribeWalletAccountChanges(
  session: ConnectedSuiWalletSession,
  handlers: {
    onAccountChanged: (nextAddress: string) => void;
    onDisconnected: () => void;
  },
): () => void {
  const eventsFeature = session.provider.features?.['standard:events'];
  if (!eventsFeature || typeof eventsFeature.on !== 'function') {
    return () => {};
  }

  try {
    const off = eventsFeature.on('change', (props) => {
      if (!props || !Array.isArray(props.accounts)) return;
      if (props.accounts.length === 0) {
        handlers.onDisconnected();
        return;
      }
      const nextAddr = normalizeSuiAddress(props.accounts[0]?.address);
      if (!nextAddr) {
        handlers.onDisconnected();
        return;
      }
      if (nextAddr !== session.address) {
        handlers.onAccountChanged(nextAddr);
      }
    });
    return typeof off === 'function' ? off : () => {};
  } catch {
    return () => {};
  }
}

function getConfiguredSuiRpcUrl(): string {
  const envUrl =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUI_RPC_URL
      ? String(import.meta.env.VITE_SUI_RPC_URL)
      : '';
  if (envUrl && isAllowedSuiRpcUrl(envUrl)) {
    return envUrl.trim();
  }
  return DEFAULT_SUI_RPC_URL;
}

function getConfiguredProfilePackageId(): string | null {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUI_PROFILE_PACKAGE_ID
      ? String(import.meta.env.VITE_SUI_PROFILE_PACKAGE_ID).trim()
      : '';
  return normalizeSuiAddress(raw);
}

/**
 * Optional read-only Sui JSON-RPC query for an owned Move `PlayerProfile` object
 * when `VITE_SUI_PROFILE_PACKAGE_ID` is configured. Returns null gracefully if
 * no Move package is configured or no on-chain object exists yet.
 */
async function fetchOnChainSuiProfile(
  walletAddress: string,
): Promise<SuiPlayerProfile | null> {
  const packageId = getConfiguredProfilePackageId();
  if (!packageId || typeof fetch !== 'function') return null;

  const rpcUrl = getConfiguredSuiRpcUrl();
  if (!isAllowedSuiRpcUrl(rpcUrl)) return null;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller ? window.setTimeout(() => controller.abort(), 4500) : null;

  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller?.signal,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'suix_getOwnedObjects',
        params: [
          walletAddress,
          {
            filter: {
              StructType: `${packageId}::lofi_profile::PlayerProfile`,
            },
            options: { showContent: true },
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: {
        data?: Array<{
          data?: {
            content?: {
              fields?: Record<string, unknown>;
            };
          };
        }>;
      };
    };
    const fields = json?.result?.data?.[0]?.data?.content?.fields;
    if (!fields || typeof fields !== 'object') return null;

    const highestCompletedLevel = Number(fields.highest_completed_level ?? 0);
    const lilYetisRecruited = Number(fields.lil_yetis_recruited ?? 0);
    const rawBadges = Array.isArray(fields.badges)
      ? fields.badges.filter((x): x is SuiBadgeId => typeof x === 'string')
      : [];

    return {
      walletAddress,
      highestCompletedLevel: Number.isFinite(highestCompletedLevel)
        ? Math.max(0, Math.min(10, Math.floor(highestCompletedLevel)))
        : 0,
      lilYetisRecruited: Number.isFinite(lilYetisRecruited)
        ? Math.max(0, Math.min(9, Math.floor(lilYetisRecruited)))
        : 0,
      badges: deriveBadgesForProgress(
        highestCompletedLevel,
        lilYetisRecruited,
        rawBadges,
      ),
      updatedAt: new Date().toISOString(),
      syncSource: 'sui-rpc',
    };
  } catch {
    return null;
  } finally {
    if (timeout !== null) {
      window.clearTimeout(timeout);
    }
  }
}

/**
 * Loads the compact Sui profile for a connected wallet address.
 * Combines wallet-scoped storage with on-chain Sui RPC state (if configured)
 * using monotonic merge so earned progress is preserved across logins.
 */
export async function loadWalletSuiProfile(
  walletAddress: string,
): Promise<SuiPlayerProfile> {
  const normalized = normalizeSuiAddress(walletAddress);
  if (!normalized) {
    throw new Error('Cannot load Sui profile without a valid Sui address');
  }

  let stored: SuiPlayerProfile | null = null;
  const key = buildSuiProfileStorageKey(normalized);
  if (key && typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(key);
      stored = parseSuiProfilePayload(normalized, raw, 'wallet-storage');
    } catch {
      stored = null;
    }
  }

  const onChain = await fetchOnChainSuiProfile(normalized);

  if (stored && onChain) {
    const merged = mergeSuiProfiles(onChain, stored);
    saveWalletSuiProfile(normalized, merged);
    return merged;
  }
  if (onChain) {
    saveWalletSuiProfile(normalized, onChain);
    return onChain;
  }
  if (stored) {
    return stored;
  }
  return createEmptySuiProfile(normalized);
}

/**
 * Persists compact Sui profile metadata (highest level, Lil Yetis, badges)
 * strictly for a connected Sui wallet. Refuses to write in Demo Mode.
 */
export function saveWalletSuiProfile(
  walletAddress: string | null,
  profile: SuiPlayerProfile | null,
): boolean {
  if (!walletAddress || !profile) return false;
  const normalized = normalizeSuiAddress(walletAddress);
  const profileAddress = normalizeSuiAddress(profile.walletAddress);
  if (!normalized || normalized !== profileAddress) return false;

  const key = buildSuiProfileStorageKey(normalized);
  if (!key || typeof window === 'undefined' || !window.localStorage) return false;

  try {
    const encoded = serializeSuiProfilePayload(profile);
    window.localStorage.setItem(key, encoded);
    return true;
  } catch {
    return false;
  }
}
