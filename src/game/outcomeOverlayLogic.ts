import type { HudSnapshot } from './types';
import {
  UI_COPY,
  formatArrivalSummary,
  formatCrewStatus,
  formatGameOverLevelInfo,
  formatLilYetiCount,
  formatNextLevelCrew,
} from './uiCopy';

export const OUTCOME_ASSETS = {
  victoryHero: '/assets/outcome/lofi-victory-alpha.png',
  defeatHero: '/assets/outcome/lofi-defeat-alpha.png',
  smallYeti: '/assets/outcome/small-yeti-alpha.png',
} as const;

export type OutcomeKind = 'victory' | 'gameover';

export interface OutcomeFollowerSlot {
  /** Stable 1-based follower index matching level progression (1..N-1). */
  index: number;
  /** Which side of the hero this Lil Yeti stands on. */
  side: 'left' | 'right';
  /** Outward tier index on that side (0 = closest beside hero, 1 = next outward). */
  tier: number;
  /** Gentle animation stagger delay in seconds so sprites feel natural without distorting. */
  delaySeconds: number;
  /** Local transparent PNG path for the approved Lil Yeti cutout. */
  src: string;
}

export interface OutcomeOverlayModel {
  kind: OutcomeKind;
  heroSrc: string;
  heroAlt: string;
  levelNumber: number;
  levelName: string;
  progressPct: number;
  /** Exact number of Lil Yetis active during this level attempt (strictly levelNumber - 1). */
  arrivedFollowerCount: number;
  /** Flanking Lil Yeti slots for the left side of the hero. */
  leftFollowers: readonly OutcomeFollowerSlot[];
  /** Flanking Lil Yeti slots for the right side of the hero. */
  rightFollowers: readonly OutcomeFollowerSlot[];
  /** Strictly false on gameover; strictly true only on victory once recruitment occurs. */
  showRecruitBanner: boolean;
  /** Newly recruited Lil Yetis from this outcome (strictly 1 on victory, 0 on gameover). */
  recruitedFollowers: number;
  /** True if another level follows after victory. */
  hasNextLevel: boolean;
  /** Distinct English summary of Lofi/Lil Yetis who actually arrived (or crew status on defeat). */
  arrivedFollowersLabel: string;
  /** Distinct English recruitment message after the new Lil Yeti joins (null on gameover). */
  recruitLabel: string | null;
  /** Next-level companion count preview on victory (null on gameover). */
  nextLevelCrewLabel: string | null;
  /** Formatted Game Over level & progress line ("Level {level} · Progress {progress}%"). */
  levelInfoLabel: string;
  /** Final run score frozen on Victory or Game Over. */
  score: number;
  /** Landed grab trick count frozen on Victory or Game Over. */
  grabCount: number;
  /** Highest score multiplier reached during this run (1..5). */
  peakMultiplier: number;
}

/**
 * Pure slot distributor for Lil Yetis flanking Lofi on outcome overlays:
 * - Level 1 (0 Lil Yetis): [] left, [] right (Hero alone).
 * - Level 2 (1 Lil Yeti): [1] left, [] right (Hero + 1 Lil Yeti).
 * - Level 3 (2 Lil Yetis): [1] left, [2] right (Hero + 2 Lil Yetis).
 * - Level N (N-1 Lil Yetis): alternates left/right cleanly with zero hardcoded illustration counts.
 */
export function buildOutcomeFollowerSlots(followerCount: number): {
  leftFollowers: OutcomeFollowerSlot[];
  rightFollowers: OutcomeFollowerSlot[];
} {
  const safeCount = Math.max(0, Math.floor(followerCount));
  const leftFollowers: OutcomeFollowerSlot[] = [];
  const rightFollowers: OutcomeFollowerSlot[] = [];

  for (let i = 0; i < safeCount; i++) {
    const side: 'left' | 'right' = i % 2 === 0 ? 'left' : 'right';
    const tier = Math.floor(i / 2);
    const slot: OutcomeFollowerSlot = {
      index: i + 1,
      side,
      tier,
      delaySeconds: Number(((i + 1) * 0.08).toFixed(2)),
      src: OUTCOME_ASSETS.smallYeti,
    };
    if (side === 'left') {
      // Push outward-left slots first so inner slot sits nearest to Lofi
      leftFollowers.unshift(slot);
    } else {
      rightFollowers.push(slot);
    }
  }

  return { leftFollowers, rightFollowers };
}

/**
 * Derive the complete presentation model for the Victory or Game Over transparent PNG overlay
 * strictly from the frozen live `HudSnapshot` (no secondary progression system).
 */
export function buildOutcomeOverlayModel(
  hud: HudSnapshot,
): OutcomeOverlayModel | null {
  if (hud.phase === 'victory') {
    if (!hud.victoryUiReady) {
      return null;
    }
    const arrivedCount = Math.max(0, Math.floor(hud.followerCount));
    const { leftFollowers, rightFollowers } = buildOutcomeFollowerSlots(arrivedCount);
    const recruitCount = Math.max(0, Math.min(1, Math.floor(hud.recruitedFollowers)));
    const nextCrewCount = Math.max(arrivedCount + recruitCount, Math.floor(hud.unlockedFollowers));

    const arrivedFollowersLabel = formatArrivalSummary(arrivedCount);
    const recruitLabel = recruitCount > 0 ? UI_COPY.victory.recruitMessage : null;
    const nextLevelCrewLabel =
      recruitCount > 0
        ? hud.hasNextLevel
          ? formatNextLevelCrew(nextCrewCount)
          : `Crew: ${formatLilYetiCount(nextCrewCount)}`
        : null;

    return {
      kind: 'victory',
      heroSrc: OUTCOME_ASSETS.victoryHero,
      heroAlt: UI_COPY.victory.heroAlt,
      levelNumber: hud.levelNumber,
      levelName: hud.levelName,
      progressPct: hud.progressPct,
      arrivedFollowerCount: arrivedCount,
      leftFollowers,
      rightFollowers,
      showRecruitBanner: recruitCount > 0,
      recruitedFollowers: recruitCount,
      hasNextLevel: hud.hasNextLevel,
      arrivedFollowersLabel,
      recruitLabel,
      nextLevelCrewLabel,
      levelInfoLabel: formatGameOverLevelInfo(hud.levelNumber, hud.progressPct),
      score: Math.max(0, Math.round(hud.score)),
      grabCount: Math.max(0, Math.floor(hud.grabCount)),
      peakMultiplier: Math.max(1, Math.floor(hud.peakMultiplier)),
    };
  }

  if (hud.phase === 'gameover') {
    if (!hud.gameoverUiReady) {
      return null;
    }
    const activeCount = Math.max(0, Math.floor(hud.followerCount));
    const { leftFollowers, rightFollowers } = buildOutcomeFollowerSlots(activeCount);

    return {
      kind: 'gameover',
      heroSrc: OUTCOME_ASSETS.defeatHero,
      heroAlt: UI_COPY.gameover.heroAlt,
      levelNumber: hud.levelNumber,
      levelName: hud.levelName,
      progressPct: hud.progressPct,
      arrivedFollowerCount: activeCount,
      leftFollowers,
      rightFollowers,
      // Strictly never show shelter NPCs or new recruit on Game Over
      showRecruitBanner: false,
      recruitedFollowers: 0,
      hasNextLevel: false,
      arrivedFollowersLabel: formatCrewStatus(activeCount),
      recruitLabel: null,
      nextLevelCrewLabel: null,
      levelInfoLabel: formatGameOverLevelInfo(hud.levelNumber, hud.progressPct),
      score: Math.max(0, Math.round(hud.score)),
      grabCount: Math.max(0, Math.floor(hud.grabCount)),
      peakMultiplier: Math.max(1, Math.floor(hud.peakMultiplier)),
    };
  }

  return null;
}
