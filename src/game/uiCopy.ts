/**
 * Centralized English UI copy dictionary and singular/plural formatting helpers
 * for LOFI ICE ESCAPE.
 *
 * Terminology standard:
 * - Singular companion: "Lil Yeti"
 * - Plural companions: "Lil Yetis"
 * - Companion group accompanying Lofi: "Crew"
 * - Counts strictly reflect active level state and always exclude Lofi.
 */

function normalizeCount(count: number): number {
  return Math.max(0, Math.floor(count));
}

/** Format a count of Lil Yetis with exact English singular/plural grammar ("1 Lil Yeti", "2 Lil Yetis"). */
export function formatLilYetiCount(count: number): string {
  const safe = normalizeCount(count);
  return safe === 1 ? '1 Lil Yeti' : `${safe} Lil Yetis`;
}

/**
 * Level-start callout driven directly from actual level companion count (never hardcoded by level):
 * - 0 -> "Lofi rides solo!"
 * - 1 -> "Ride with 1 Lil Yeti!"
 * - 2+ -> "Ride with {count} Lil Yetis!"
 */
export function formatLevelStartCallout(followerCount: number): string {
  const safe = normalizeCount(followerCount);
  if (safe === 0) return 'Lofi rides solo!';
  return `Ride with ${formatLilYetiCount(safe)}!`;
}

/**
 * Victory arrival summary reflecting only companions who actually ran and arrived in this level:
 * - 0 -> "Lofi arrived safely!"
 * - 1 -> "1 Lil Yeti arrived safely!"
 * - 2+ -> "{count} Lil Yetis arrived safely!"
 */
export function formatArrivalSummary(arrivedCount: number): string {
  const safe = normalizeCount(arrivedCount);
  if (safe === 0) return 'Lofi arrived safely!';
  return `${formatLilYetiCount(safe)} arrived safely!`;
}

/**
 * Next-level companion preview shown on Victory after the new Lil Yeti joins:
 * - 1 -> "Next level: 1 Lil Yeti"
 * - 2+ -> "Next level: {count} Lil Yetis"
 */
export function formatNextLevelCrew(nextCount: number): string {
  return `Next level: ${formatLilYetiCount(nextCount)}`;
}

/** Game Over level & progress summary ("Level {level} · Progress {progress}%"). */
export function formatGameOverLevelInfo(
  levelNumber: number,
  progressPct: number,
): string {
  const lv = Math.max(1, Math.floor(levelNumber));
  const pct = Math.max(0, Math.min(100, Math.round(progressPct)));
  return `Level ${lv} · Progress ${pct}%`;
}

/**
 * Crew status line for Game Over & Pause screens:
 * - 0 -> "Riding solo"
 * - 1 -> "Crew: 1 Lil Yeti"
 * - 2+ -> "Crew: {count} Lil Yetis"
 */
export function formatCrewStatus(activeCount: number): string {
  const safe = normalizeCount(activeCount);
  if (safe === 0) return 'Riding solo';
  return `Crew: ${formatLilYetiCount(safe)}`;
}

/** Compact HUD subline under the Lil Yetis badge. */
export function formatHudCrewSubline(activeCount: number): string {
  const safe = normalizeCount(activeCount);
  if (safe === 0) return 'Riding solo';
  return formatLilYetiCount(safe);
}

/** Pause dialog status summary. */
export function formatPauseSummary(
  activeCount: number,
  progressPct: number,
): string {
  const pct = Math.max(0, Math.min(100, Math.round(progressPct)));
  return `${formatCrewStatus(activeCount)} · Progress ${pct}%`;
}

/** Accessible label for the top-down Mini Map. */
export function formatMiniMapAriaLabel(
  levelNumber: number,
  difficultyLabel: string,
): string {
  return `Level ${levelNumber} ${difficultyLabel} track mini map`;
}

/**
 * Strictly true only AFTER the newly recruited Lil Yeti has actually completed
 * stepping out and joining Lofi's crew at the shelter (never before recruitment occurs).
 */
export function hasRecruitJoined(recruitJoinProgress: number): boolean {
  return recruitJoinProgress >= 0.92;
}

export const UI_COPY = {
  app: {
    arenaAriaLabel: 'LOFI ICE ESCAPE 3D snowboard arena',
    inspectAriaLabel: 'Lofi 3D model neutral pose inspection',
    inspectFrontTag: 'DEV INSPECT · FRONT VIEW (NEUTRAL POSE)',
    inspectThreeQuarterTag: 'DEV INSPECT · 3/4 VIEW (NEUTRAL POSE)',
  },
  title: {
    play: 'PLAY',
    soundOn: 'SOUND ON',
    soundOff: 'SOUND OFF',
    muteAria: 'Mute audio',
    unmuteAria: 'Unmute audio',
    howToPlayHeading: 'How to Play',
    mobileControlsGuideBeforeJump: 'Drag left or right to steer · Tap ',
    mobileControlsGuideBetween: ' to clear obstacles · Press & hold ',
    mobileControlsGuideAfterTrick:
      ' to jump & grab for score multipliers · Reach the Shelter!',
    desktopControls:
      'A / D or Arrows: Steer · W / Up: Jump · Space / Trick: Jump & Grab (Multiplier) · S / Down: Brake',
  },
  hud: {
    shelter: 'SHELTER',
    shelterAria: 'Level progress toward shelter',
    distanceLeft: 'DISTANCE LEFT',
    lilYetisLabel: 'LIL YETIS',
    lilYetisAria: 'Lil Yetis in your crew',
    scoreLabel: 'SCORE',
    scoreAria: 'Run score and trick multiplier',
    avalanche: 'AVALANCHE',
    avalancheAria: 'Avalanche threat meter',
    threatDanger: 'DANGER!',
    threatClosing: 'CLOSING IN',
    threatSafe: 'SAFE',
    speedUnit: 'km/h',
    pauseAria: 'Pause game',
    resumeAria: 'Resume game',
    grabBadge: 'GRAB!',
    grabActive: 'GRAB ACTIVE',
    holdSpaceGrab: 'Hold SPACE · GRAB',
    grabsPrefix: 'Grabs',
    mobileJump: 'JUMP',
    mobileJumpAria: 'Jump over obstacles',
    mobileTrick: 'TRICK',
    mobileTrickAria: 'Press to jump and hold in mid-air for a Grab trick',
    trickKeyHint: 'SPACE',
    trickGroundSub: 'JUMP + GRAB',
    trickAirSub: 'HOLD GRAB',
    mobileBrake: 'BRAKE',
    mobileBrakeAria: 'Hold to brake smoothly while steering',
    steepDropWarning: 'STEEP DROP — HOLD TO BRAKE',
    steepDropDesktopHint: 'Hold S or Down Arrow',
    steepDropMobileHint: 'Hold BRAKE while steering',
    mapHeader: 'MAP',
  },
  pause: {
    heading: 'PAUSED',
    resume: 'RESUME',
    restartLevel: 'RESTART LEVEL',
    newGame: 'NEW GAME (LEVEL 1)',
    mainMenu: 'MAIN MENU',
  },
  victory: {
    heading: 'LEVEL COMPLETE',
    heroAlt: 'Lofi celebrating at the Shelter',
    arrivedHeading: 'ARRIVAL',
    recruitMessage: 'A Lil Yeti joined your crew!',
    nextLevelButton: 'NEXT LEVEL',
    playAgainButton: 'PLAY AGAIN',
    replayLevelButton: 'REPLAY LEVEL',
    mainMenuButton: 'MAIN MENU',
  },
  gameover: {
    heading: 'GAME OVER',
    message: 'Caught by the snow!',
    heroAlt: 'Lofi buried in the snow',
    tryAgainButton: 'TRY AGAIN',
    mainMenuButton: 'MAIN MENU',
  },
  lilYetiAltPrefix: 'Lil Yeti',
} as const;
