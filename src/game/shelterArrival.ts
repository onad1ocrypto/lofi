/**
 * Pure layout constants and outcome sequence state helpers for LOFI ICE ESCAPE:
 * - Victory Arrival Sequence: coasting -> recruiting (+1 new Yeti) -> ready (shows Victory UI buttons).
 * - Game Over Snow-Burial Sequence: cartoon snow-mound transition -> ready (shows Game Over UI buttons).
 * Zero Three.js/DOM dependencies so unit tests deterministically verify timing, idempotency, and resets.
 */

export interface GreeterSlot {
  /** Longitudinal distance past the finish line (meters, strictly > 0 so never mid-track). */
  offsetFromFinishZ: number;
  /** Lateral offset from track centerline (meters, strictly on the sides of the arrival plaza). */
  offsetX: number;
  /** Facing angle bias toward the incoming hero/plaza center (radians). */
  facingBias: number;
  /** Staggered celebration hop/wave phase offset (radians). */
  phaseOffset: number;
}

export const SHELTER_LAYOUT = {
  /** Distance from finish line (z = levelLength) to shelter cabin center (meters). */
  cabinOffsetFromFinish: 21.5,
  /** Half-depth of the main cabin body along Z (meters). */
  cabinHalfDepth: 4.3,
  /** Wide wooden mountain cabin body width (meters). */
  cabinWidth: 15.6,
  /** Main timber wall height from snow grade to eaves (meters). */
  cabinWallHeight: 5.4,
  /** Central arched doorway dimensions (strictly wider & taller than Lofi ~1.0m x 1.85m). */
  doorWidth: 3.4,
  doorHeight: 4.1,
  /** Depth of the checkered finish strip along the downhill slope (meters). */
  finishStripDepth: 3.6,
  /** Visual distance Lofi coasts past the checkered finish line onto the open arrival plaza (meters). */
  arrivalCoastDistance: 4.8,
  /** Duration of the smooth visual coast into the arrival plaza after crossing finish (seconds). */
  arrivalCoastDuration: 0.85,
  /** Time when the +1 new recruit Yeti begins stepping out from the shelter doorway — strictly AFTER arrival finishes (seconds). */
  recruitStartDelay: 0.90,
  /** Duration of the +1 new recruit Yeti joining at its distinct introduction spot (seconds). */
  recruitJoinDuration: 0.70,
  /** Minimum elapsed arrival time before Victory panel & Next Level buttons become visible/clickable (seconds). */
  victoryUiReadyDelay: 1.65,
  /** Duration of the cartoon snow-mound burial transition on Game Over (seconds). */
  gameoverBurialDuration: 0.68,
  /** Elapsed time before Game Over panel & Try Again buttons appear (seconds). */
  gameoverUiReadyDelay: 0.62,
  /**
   * 2 welcoming shelter NPCs stationed strictly back beside the shelter cabin porch flanks
   * (far behind the foreground arrival spot and never surrounding Lofi like track followers).
   */
  greeterSlots: [
    { offsetFromFinishZ: 14.8, offsetX: -6.4, facingBias: -0.28, phaseOffset: 0.0 },
    { offsetFromFinishZ: 14.8, offsetX: 6.4, facingBias: 0.28, phaseOffset: 1.6 },
  ] as readonly GreeterSlot[],
} as const;

/** Clear snow distance between the finish line and the shelter's front wall (meters). */
export function getArrivalPlazaDepth(): number {
  return SHELTER_LAYOUT.cabinOffsetFromFinish - SHELTER_LAYOUT.cabinHalfDepth;
}

export type ArrivalStage = 'idle' | 'coasting' | 'recruiting' | 'ready';

export interface ShelterArrivalState {
  /** True once the finish event has triggered the shelter celebration. */
  celebrating: boolean;
  /** Guard ensuring the celebration trigger fires at most once per level finish. */
  triggeredOnce: boolean;
  /** Elapsed time since celebration started (seconds). */
  celebrationTime: number;
  /** Smooth 0..1 visual coast progress into the arrival plaza after crossing finish. */
  arrivalGlideProgress: number;
  /** Smooth 0..1 blend for Lofi's front-facing one-arm deadpan victory pose. */
  victoryPoseProgress: number;
  /** Smooth 0..1 progress of the single +1 new recruit Yeti emerging from the shelter to join Lofi. */
  recruitJoinProgress: number;
  /** Current discrete victory arrival stage. */
  stage: ArrivalStage;
  /** Strictly true ONLY after Lofi's arrival & recruit sequence completes (gates Victory buttons!). */
  victoryUiReady: boolean;

  /** True once avalanche catch-up Game Over visual sequence has started. */
  gameoverActive: boolean;
  /** Elapsed time since Game Over triggered (seconds). */
  gameoverTime: number;
  /** Smooth 0..1 progress of the cartoon snow-mound covering Lofi's lower body. */
  gameoverBurialProgress: number;
  /** True once the short snow-burial transition finishes and Game Over overlay appears. */
  gameoverUiReady: boolean;
}

export function createShelterArrivalState(): ShelterArrivalState {
  return {
    celebrating: false,
    triggeredOnce: false,
    celebrationTime: 0,
    arrivalGlideProgress: 0,
    victoryPoseProgress: 0,
    recruitJoinProgress: 0,
    stage: 'idle',
    victoryUiReady: false,
    gameoverActive: false,
    gameoverTime: 0,
    gameoverBurialProgress: 0,
    gameoverUiReady: false,
  };
}

/**
 * Trigger shelter NPC celebration strictly once when the existing finish event fires.
 * Returns true only on the first trigger; repeated calls return false (idempotent).
 * Also guarantees Game Over sequence is inactive (mutually exclusive).
 */
export function triggerShelterCelebrationOnce(state: ShelterArrivalState): boolean {
  if (state.triggeredOnce || state.gameoverActive) {
    return false;
  }
  state.triggeredOnce = true;
  state.celebrating = true;
  state.celebrationTime = 0;
  state.arrivalGlideProgress = 0;
  state.victoryPoseProgress = 0;
  state.recruitJoinProgress = 0;
  state.stage = 'coasting';
  state.victoryUiReady = false;
  return true;
}

/**
 * Trigger the cartoon snow-mound Game Over sequence strictly once.
 * Mutually exclusive with victory celebration.
 */
export function triggerGameOverSequenceOnce(state: ShelterArrivalState): boolean {
  if (state.gameoverActive || state.celebrating) {
    return false;
  }
  state.gameoverActive = true;
  state.gameoverTime = 0;
  state.gameoverBurialProgress = 0;
  state.gameoverUiReady = false;
  return true;
}

/** Advance victory arrival celebration clock, hero victory pose, +1 recruit join, and UI readiness gate. */
export function stepShelterArrival(state: ShelterArrivalState, rawDt: number): void {
  if (!state.celebrating) return;
  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  state.celebrationTime += dt;

  state.arrivalGlideProgress = Math.min(
    1,
    state.celebrationTime / SHELTER_LAYOUT.arrivalCoastDuration,
  );

  // Lofi turns smoothly toward camera and raises one arm as he settles into the plaza stop
  const poseStart = SHELTER_LAYOUT.arrivalCoastDuration * 0.58;
  const poseSpan = 0.52;
  state.victoryPoseProgress = Math.max(
    0,
    Math.min(1, (state.celebrationTime - poseStart) / poseSpan),
  );

  // Single +1 new recruit Yeti steps forward out of the shelter doorway to join beside Lofi
  state.recruitJoinProgress = Math.max(
    0,
    Math.min(
      1,
      (state.celebrationTime - SHELTER_LAYOUT.recruitStartDelay) /
        SHELTER_LAYOUT.recruitJoinDuration,
    ),
  );

  if (state.celebrationTime >= SHELTER_LAYOUT.victoryUiReadyDelay) {
    state.stage = 'ready';
    state.victoryUiReady = true;
  } else if (state.arrivalGlideProgress >= 1 || state.recruitJoinProgress > 0) {
    state.stage = 'recruiting';
  } else {
    state.stage = 'coasting';
  }
}

/** Advance cartoon Game Over snow-burial transition clock and UI readiness gate. */
export function stepGameOverSequence(state: ShelterArrivalState, rawDt: number): void {
  if (!state.gameoverActive) return;
  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  state.gameoverTime += dt;
  state.gameoverBurialProgress = Math.min(
    1,
    state.gameoverTime / SHELTER_LAYOUT.gameoverBurialDuration,
  );
  if (state.gameoverTime >= SHELTER_LAYOUT.gameoverUiReadyDelay) {
    state.gameoverUiReady = true;
  }
}

/** Reset both victory celebration and game-over snow burial cleanly on Retry, Next Level, or New Game. */
export function resetShelterArrival(state: ShelterArrivalState): void {
  state.celebrating = false;
  state.triggeredOnce = false;
  state.celebrationTime = 0;
  state.arrivalGlideProgress = 0;
  state.victoryPoseProgress = 0;
  state.recruitJoinProgress = 0;
  state.stage = 'idle';
  state.victoryUiReady = false;
  state.gameoverActive = false;
  state.gameoverTime = 0;
  state.gameoverBurialProgress = 0;
  state.gameoverUiReady = false;
}

/** Smooth ease-out curve for Lofi's post-finish coast onto the arrival plaza. */
export function computeArrivalCoastMeters(arrivalGlideProgress: number): number {
  const t = Math.max(0, Math.min(1, arrivalGlideProgress));
  const eased = 1 - (1 - t) * (1 - t) * (1 - t);
  return eased * SHELTER_LAYOUT.arrivalCoastDistance;
}

/**
 * Non-negative vertical hop offset for welcoming shelter NPCs.
 * Strictly >= 0 so boots & mini-snowboards never penetrate below the snow surface.
 */
export function computeGreeterHopY(
  celebrating: boolean,
  celebrationTime: number,
  phaseOffset: number,
): number {
  if (!celebrating || celebrationTime <= 0) {
    return 0;
  }
  const wave = Math.abs(Math.sin(celebrationTime * 5.0 + phaseOffset));
  return Math.pow(wave, 0.85) * 0.44;
}
