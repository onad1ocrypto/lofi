import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHUD } from './components/GameHUD';
import { LeaderboardModal } from './components/LeaderboardModal';
import { ProfileModal, WalletConnectModal } from './components/WalletModals';
import { createGameEngine, type GameEngineController } from './game/engine';
import { createHeroInspector } from './game/heroInspector';
import { LEVEL_CONFIGS } from './game/levels';
import { OUTCOME_ASSETS } from './game/outcomeOverlayLogic';
import {
  buildHudSnapshot,
  createInitialSimulationState,
} from './game/simulation';
import {
  applyLevelCompletionToProfile,
  applySignedHighScoreToProfile,
  createEmptySuiProfile,
  isNewHighScore,
  type SuiPlayerProfile,
} from './game/suiProfileLogic';
import {
  connectSuiWallet,
  disconnectSuiWallet,
  loadWalletSuiProfile,
  refreshDetectedSuiWallets,
  saveWalletSuiProfile,
  signSuiProfileAction,
  subscribeDetectedSuiWallets,
  subscribeWalletAccountChanges,
  type ConnectedSuiWalletSession,
  type DetectedSuiWallet,
} from './game/suiWalletService';
import type { HudSnapshot } from './game/types';
import { UI_COPY } from './game/uiCopy';

function getInitialQueryOptions(): {
  autostart: boolean;
  initialLevel: number;
  nearFinish: boolean;
  nearRamp: boolean;
  nearLog: boolean;
  nearGameOver: boolean;
  nearDescent: boolean;
  forceWindGust: boolean;
  inBlizzard: boolean;
  inspectHero: boolean;
  inspectFraming: 'face' | 'full';
} {
  if (typeof window === 'undefined') {
    return {
      autostart: false,
      initialLevel: 1,
      nearFinish: false,
      nearRamp: false,
      nearLog: false,
      nearGameOver: false,
      nearDescent: false,
      forceWindGust: false,
      inBlizzard: false,
      inspectHero: false,
      inspectFraming: 'face',
    };
  }
  const params = new URLSearchParams(window.location.search);
  const autostart = params.get('autostart') === '1';
  const nearFinish = params.get('nearfinish') === '1';
  const nearRamp = params.get('nearramp') === '1';
  const nearLog = params.get('nearlog') === '1';
  const nearGameOver = params.get('neargameover') === '1';
  const nearDescent = params.get('neardescent') === '1';
  const forceWindGust = params.get('windgust') === '1';
  const inBlizzard = params.get('blizzard') === '1';
  const inspectHero = params.get('inspectHero') === '1';
  const inspectFraming = params.get('framing') === 'full' ? 'full' : 'face';
  const rawLevel = Number.parseInt(params.get('level') ?? '1', 10);
  const initialLevel =
    Number.isFinite(rawLevel) && rawLevel >= 1 && rawLevel <= LEVEL_CONFIGS.length
      ? rawLevel
      : 1;
  return {
    autostart,
    initialLevel,
    nearFinish,
    nearRamp,
    nearLog,
    nearGameOver,
    nearDescent,
    forceWindGust,
    inBlizzard,
    inspectHero,
    inspectFraming,
  };
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngineController | null>(null);
  const [inspectMode] = useState(() => getInitialQueryOptions().inspectHero);

  const [hud, setHud] = useState<HudSnapshot>(() => {
    const { autostart, initialLevel } = getInitialQueryOptions();
    return buildHudSnapshot(
      createInitialSimulationState(
        autostart ? 'playing' : 'title',
        undefined,
        initialLevel,
      ),
      null,
    );
  });
  const [muted, setMuted] = useState(false);

  // ==================== SUI WALLET & PROFILE STATE (OPTIONAL LAYER OVER DEMO MODE) ====================
  const [detectedWallets, setDetectedWallets] = useState<DetectedSuiWallet[]>([]);
  const [walletSession, setWalletSession] = useState<ConnectedSuiWalletSession | null>(null);
  const [walletProfile, setWalletProfile] = useState<SuiPlayerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [leaderboardModalOpen, setLeaderboardModalOpen] = useState(false);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const savedVictoryKeyRef = useRef<string | null>(null);

  // Cumulative run score across a continuous multi-level run (reset on Game Over / New Game / Title)
  const [bankedRunScore, setBankedRunScore] = useState(0);
  // Session-only best score for Demo Mode (never written to Sui wallet storage or Leaderboard)
  const [demoBestScore, setDemoBestScore] = useState(0);
  const [highScoreSaving, setHighScoreSaving] = useState(false);
  const [highScoreSavedForRun, setHighScoreSavedForRun] = useState(false);
  const [highScoreError, setHighScoreError] = useState<string | null>(null);

  // Discover standard Sui browser wallets without interfering with gameplay or Demo Mode
  useEffect(() => {
    return subscribeDetectedSuiWallets((wallets) => {
      setDetectedWallets(wallets);
    });
  }, []);

  // Warm outcome PNGs in the background after initial opening paint so Victory & Game Over appear instantly
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const urls = [
        OUTCOME_ASSETS.victoryHero,
        OUTCOME_ASSETS.defeatHero,
        OUTCOME_ASSETS.smallYeti,
      ];
      for (const src of urls) {
        const img = new Image();
        img.decoding = 'async';
        img.src = src;
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, []);

  // Load compact Sui profile whenever a wallet logs in or switches account.
  // Daily Check-In is triggered explicitly via sui:signPersonalMessage in the Player Hub.
  const loadProfileForAddress = useCallback(async (address: string) => {
    setProfileLoading(true);
    setWalletProfile(createEmptySuiProfile(address));
    try {
      const loaded = await loadWalletSuiProfile(address, { recordDailyLogin: false });
      setWalletProfile(loaded);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const handleUpdateWalletProfile = useCallback(
    (nextProfile: SuiPlayerProfile) => {
      if (!walletSession || nextProfile.walletAddress !== walletSession.address) return;
      saveWalletSuiProfile(walletSession.address, nextProfile);
      setWalletProfile(nextProfile);
    },
    [walletSession],
  );

  const handleDisconnectWallet = useCallback(() => {
    const active = walletSession;
    setWalletSession(null);
    setWalletProfile(null);
    setProfileModalOpen(false);
    setWalletError(null);
    setHighScoreSaving(false);
    setHighScoreSavedForRun(false);
    setHighScoreError(null);
    savedVictoryKeyRef.current = null;
    // Disconnect wallet cleanly without deleting local game data or saved wallet profiles
    void disconnectSuiWallet(active);
  }, [walletSession]);

  // Listen for wallet-initiated account changes or disconnects
  useEffect(() => {
    if (!walletSession) return;
    return subscribeWalletAccountChanges(walletSession, {
      onAccountChanged: (nextAddress) => {
        setWalletSession((prev) => (prev ? { ...prev, address: nextAddress } : null));
        savedVictoryKeyRef.current = null;
        void loadProfileForAddress(nextAddress);
      },
      onDisconnected: () => {
        setWalletSession(null);
        setWalletProfile(null);
        setProfileModalOpen(false);
        savedVictoryKeyRef.current = null;
      },
    });
  }, [walletSession, loadProfileForAddress]);

  const handleSelectWallet = useCallback(
    async (wallet: DetectedSuiWallet) => {
      setWalletConnecting(true);
      setWalletError(null);
      try {
        const session = await connectSuiWallet(wallet);
        setWalletSession(session);
        setConnectModalOpen(false);
        setProfileModalOpen(true);
        savedVictoryKeyRef.current = null;
        await loadProfileForAddress(session.address);
      } catch (err) {
        const msg =
          err instanceof Error && err.message.trim().length > 0
            ? err.message
            : UI_COPY.wallet.connectFailedFallback;
        setWalletError(msg);
      } finally {
        setWalletConnecting(false);
      }
    },
    [loadProfileForAddress],
  );

  // Persist compact progress ONLY when a Sui wallet is connected (never in Demo Mode)
  useEffect(() => {
    if (!walletSession) {
      savedVictoryKeyRef.current = null;
      return;
    }
    if (hud.phase !== 'victory') {
      savedVictoryKeyRef.current = null;
      return;
    }
    const victoryKey = `${walletSession.address}:lv${hud.levelNumber}`;
    if (savedVictoryKeyRef.current === victoryKey) return;
    savedVictoryKeyRef.current = victoryKey;

    setWalletProfile((prev) => {
      const base =
        prev && prev.walletAddress === walletSession.address
          ? prev
          : createEmptySuiProfile(walletSession.address);
      const updated = applyLevelCompletionToProfile(base, hud.levelNumber);
      saveWalletSuiProfile(walletSession.address, updated);
      return updated;
    });
  }, [walletSession, hud.phase, hud.levelNumber]);

  // Reset per-outcome high score save status whenever entering active play or title screen
  useEffect(() => {
    if (hud.phase === 'playing' || hud.phase === 'title') {
      setHighScoreSavedForRun(false);
      setHighScoreError(null);
    }
  }, [hud.phase, hud.levelNumber]);

  const runTotalScore = bankedRunScore + Math.max(0, Math.round(hud.score));
  const savedHighScore = walletSession
    ? (walletProfile?.highScore ?? 0)
    : demoBestScore;

  // Update Demo Mode session-only best score on outcome (never touches Sui Leaderboard storage)
  useEffect(() => {
    if (walletSession) return;
    if (hud.phase === 'victory' || hud.phase === 'gameover') {
      if (runTotalScore > demoBestScore) {
        setDemoBestScore(runTotalScore);
      }
    }
  }, [walletSession, hud.phase, runTotalScore, demoBestScore]);

  // Require real Sui wallet signature (sui:signPersonalMessage) before saving a New High Score to the Leaderboard
  const handleSaveHighScore = useCallback(async () => {
    if (!walletSession || highScoreSaving) return;
    const currentBest = walletProfile?.highScore ?? 0;
    if (!isNewHighScore({ highScore: currentBest }, runTotalScore)) return;

    setHighScoreSaving(true);
    setHighScoreError(null);
    try {
      const signResult = await signSuiProfileAction(
        walletSession,
        `Save High Score: ${runTotalScore} (Level ${hud.levelNumber})`,
      );
      if (!signResult.ok) {
        setHighScoreError(signResult.message);
        return;
      }

      setWalletProfile((prev) => {
        const base =
          prev && prev.walletAddress === walletSession.address
            ? prev
            : createEmptySuiProfile(walletSession.address);
        const updated = applySignedHighScoreToProfile(base, runTotalScore);
        saveWalletSuiProfile(walletSession.address, updated);
        return updated;
      });
      setHighScoreSavedForRun(true);
    } finally {
      setHighScoreSaving(false);
    }
  }, [walletSession, walletProfile, highScoreSaving, runTotalScore, hud.levelNumber]);

  // Close wallet/profile/leaderboard overlays if gameplay starts
  useEffect(() => {
    if (hud.phase === 'playing') {
      setConnectModalOpen(false);
      setProfileModalOpen(false);
      setLeaderboardModalOpen(false);
    }
  }, [hud.phase]);

  // Expose wallet mode cleanly for automated browser testing (never exposes private keys)
  useEffect(() => {
    document.body.dataset.walletMode = walletSession ? 'connected' : 'demo';
  }, [walletSession]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const {
      autostart,
      initialLevel,
      nearFinish,
      nearRamp,
      nearLog,
      nearGameOver,
      nearDescent,
      forceWindGust,
      inBlizzard,
      inspectHero,
      inspectFraming,
    } = getInitialQueryOptions();

    if (inspectHero) {
      const inspector = createHeroInspector({
        container,
        framing: inspectFraming,
      });
      return () => {
        inspector.dispose();
      };
    }

    const controller = createGameEngine({
      container,
      autostart,
      initialLevel,
      nearFinish,
      nearRamp,
      nearLog,
      nearGameOver,
      nearDescent,
      forceWindGust,
      inBlizzard,
      onHudUpdate: (snapshot) => setHud(snapshot),
      onMuteChange: (nextMuted) => setMuted(nextMuted),
    });
    engineRef.current = controller;

    return () => {
      controller.dispose();
      engineRef.current = null;
    };
  }, []);

  if (inspectMode) {
    return (
      <main className="relative w-screen h-screen overflow-hidden bg-[#c5d2e8]">
        <div
          ref={mountRef}
          className="absolute inset-0 w-full h-full"
          aria-label={UI_COPY.app.inspectAriaLabel}
        />
        <div className="pointer-events-none fixed inset-y-0 left-1/2 w-px bg-[#1b2747]/20" />
        <div className="pointer-events-none fixed bottom-4 left-4 rounded bg-[#1b2747]/80 px-3 py-1 text-xs font-semibold tracking-wide text-white">
          {UI_COPY.app.inspectFrontTag}
        </div>
        <div className="pointer-events-none fixed bottom-4 right-4 rounded bg-[#1b2747]/80 px-3 py-1 text-xs font-semibold tracking-wide text-white">
          {UI_COPY.app.inspectThreeQuarterTag}
        </div>
      </main>
    );
  }

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#1b233a]">
      {/* Isolated WebGL canvas mount so React HUD updates never tear down the 3D scene */}
      <div
        ref={mountRef}
        className="absolute inset-0 w-full h-full"
        aria-label={UI_COPY.app.arenaAriaLabel}
      />

      <GameHUD
        hud={hud}
        muted={muted}
        walletSession={walletSession}
        highScoreProps={{
          runTotalScore,
          savedHighScore,
          walletConnected: walletSession !== null,
          isNewHighScore:
            walletSession !== null &&
            isNewHighScore({ highScore: walletProfile?.highScore ?? 0 }, runTotalScore),
          saving: highScoreSaving,
          saved: highScoreSavedForRun,
          errorMessage: highScoreError,
          onSaveHighScore: () => {
            void handleSaveHighScore();
          },
        }}
        onOpenConnectWallet={() => {
          setWalletError(null);
          setDetectedWallets(refreshDetectedSuiWallets());
          setLeaderboardModalOpen(false);
          setConnectModalOpen(true);
        }}
        onOpenProfile={() => {
          if (!walletSession) return;
          setLeaderboardModalOpen(false);
          setProfileModalOpen(true);
        }}
        onOpenLeaderboard={() => {
          setConnectModalOpen(false);
          setProfileModalOpen(false);
          setLeaderboardModalOpen(true);
        }}
        onDisconnectWallet={handleDisconnectWallet}
        onStart={() => {
          setBankedRunScore(0);
          engineRef.current?.startGame();
        }}
        onPause={() => engineRef.current?.pauseGame()}
        onResume={() => engineRef.current?.resumeGame()}
        onRetryLevel={() => engineRef.current?.retryLevel()}
        onNextLevel={() => {
          setBankedRunScore((prev) => prev + Math.max(0, Math.round(hud.score)));
          engineRef.current?.nextLevel();
        }}
        onNewGame={() => {
          setBankedRunScore(0);
          engineRef.current?.newGame();
        }}
        onReturnToTitle={() => {
          setBankedRunScore(0);
          engineRef.current?.returnToTitle();
        }}
        onJump={() => engineRef.current?.triggerJump()}
        onGrabChange={(held) => engineRef.current?.setGrabHeld(held)}
        onTrickChange={(held) => engineRef.current?.setTrickHeld(held)}
        onBrakeChange={(held) => engineRef.current?.setBrakeHeld(held)}
        onToggleMute={() => {
          engineRef.current?.toggleMute();
        }}
      />

      {connectModalOpen && !walletSession && (
        <WalletConnectModal
          wallets={detectedWallets}
          connecting={walletConnecting}
          errorMessage={walletError}
          onSelectWallet={handleSelectWallet}
          onRefreshWallets={() => {
            setDetectedWallets(refreshDetectedSuiWallets());
          }}
          onClose={() => {
            if (!walletConnecting) setConnectModalOpen(false);
          }}
        />
      )}

      {profileModalOpen && walletSession && (
        <ProfileModal
          session={walletSession}
          profile={walletProfile ?? createEmptySuiProfile(walletSession.address)}
          loading={profileLoading}
          onProfileChange={handleUpdateWalletProfile}
          onDisconnect={handleDisconnectWallet}
          onClose={() => setProfileModalOpen(false)}
        />
      )}

      {leaderboardModalOpen && (
        <LeaderboardModal
          connectedAddress={walletSession?.address ?? null}
          activeWalletProfile={walletSession ? walletProfile : null}
          onConnectWallet={() => {
            setLeaderboardModalOpen(false);
            setWalletError(null);
            setDetectedWallets(refreshDetectedSuiWallets());
            setConnectModalOpen(true);
          }}
          onClose={() => setLeaderboardModalOpen(false)}
        />
      )}
    </main>
  );
}
