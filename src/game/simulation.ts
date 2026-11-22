import { LEVEL_CONFIGS, getFollowersForLevel, getLevelConfig } from './levels';
import { buildLevelObstacles } from './obstacleSpawner';
import {
  getGroundHeightAt,
  getTrackCenterX,
  getTrackHalfWidth,
  getTrackPitchAt,
  getTrackSlopeTangentX,
  setActiveTrackProfile,
} from './trackData';
import type {
  FollowerYeti,
  GamePhase,
  HudSnapshot,
  InputState,
  JumpState,
  LevelConfig,
  PathSample,
  SimulationState,
  StepEvents,
  TrackRamp,
} from './types';
import {
  COLLECTIBLE_CONFIG,
  checkCollectiblePickups,
  resetCollectiblesInPlace,
  spawnLevelCollectibles,
  stepCollectibleAnimations,
} from './collectibleLogic';
import {
  CARVING_PASS_CONFIG,
  computeCarvingSpeedBleedRate,
} from './carvingPassLogic';
import {
  computeEdgeEscapeVelocity,
  computeLevelSteeringProfile,
} from './controlLogic';
import {
  STEEP_DESCENT_CONFIG,
  computeSpeedSteerBalance,
  evaluateFlatZoneAt,
  evaluateSteepDescentAt,
} from './steepDescentLogic';
import {
  createWindGustState,
  getWindGustSteeringAccel,
  resetWindGustState,
  stepWindGust,
} from './windGustLogic';
import {
  TRICK_CONFIG,
  applyCollectibleMultiplier,
  evaluateTrickLanding,
  getGrabStyleLabel,
  selectGrabTrickStyle,
  stepTrickMultiplierTimer,
} from './trickLogic';

export const SIM_CONFIG = {
  /** Default base forward cruise speed (m/s). */
  baseForwardSpeed: 25.4,
  /** Reference fallback speed after an obstacle hit on Level 1 (m/s). */
  hitSlowSpeed: 12.7,
  /** Speed drop subtracted from the active level's baseSpeed on obstacle impact (keeps 3-hit rule identical across Levels 1-10). */
  hitSpeedDrop: 12.7,
  /** Rate at which forward speed recovers back to cruise speed (m/s^2). */
  speedRecoveryRate: 10.8,
  /** Duration during which slowdown penalty feels heavier before full recovery (tuned for 3-hit tolerance). */
  slowdownDuration: 0.72,
  /** Lateral acceleration when steering on snow (m/s^2). */
  lateralAccel: 46.0,
  /** Maximum continuous lateral velocity on snow (m/s) — comfortably outpaces sharpest Level 3 switchbacks. */
  maxLateralSpeed: 18.5,
  /** Reduced lateral steering authority while AIRBORNE (keeps jumps controllable yet weighty). */
  airborneSteerFactor: 0.42,
  /** Reduced max lateral velocity while AIRBORNE. */
  airborneMaxLateralFactor: 0.68,
  /** Exponential damping when no steering input is applied (1/s). */
  lateralDamping: 7.5,
  /** Active counter-steering responsiveness multiplier when reversing direction. */
  counterSteerBoost: 1.45,
  /** Player collision circle radius in meters. */
  playerRadius: 0.72,
  /** Distance-indexed spacing in meters between consecutive followers along Lofi's trail. */
  followerSpacing: 2.55,
  /** Minimum arc-length step (meters) between recorded path history samples. */
  pathSampleStep: 0.32,
  /** Safe margin inside snowbank edge so Lofi stays visually inside the groomed snow. */
  edgePadding: 1.15,
  /** Brief invulnerability window after hitting an obstacle (seconds). */
  invulnDuration: 1.35,
  /** Visual hit feedback flash duration (seconds). */
  hitFlashDuration: 0.42,
  /** Downward gravity acceleration in m/s^2 for jump arcs (height relative to snow ground). */
  gravity: 24.5,
  /** Manual ollie jump launch velocity (W / ArrowUp / mobile LOMPAT) in m/s (~2.56m peak height). */
  manualJumpVy: 11.2,
  /** Pre-touchdown jump buffer window so slightly early Jump/Trick presses still pop cleanly on landing (seconds). */
  jumpBufferWindow: 0.18,
  /** Landing knee-bend squash & recovery duration (seconds). */
  landingDuration: 0.26,
  /** Minimum clean airborne hold time (seconds) matching visual grab lock so every visible Grab counts upon landing. */
  minGrabHoldSeconds: 0.08,
  /** Minimum height above snow required to engage Grab pose cleanly (meters). */
  minGrabAltitude: 0.35,
  /** Subtle extra speed burst on clean ramp/grab landing so jumps feel great & stay fair with avalanche. */
  grabLandingBoostSpeed: 1.8,
  /** Subtle momentum carry on normal clean ramp landing. */
  normalLandingBoostSpeed: 0.85,
  /** Starting avalanche margin behind player (meters). */
  avalancheStartDistance: 28.0,
  /** Maximum recoverable avalanche margin (meters — capped so 3 consecutive hits always trigger Game Over). */
  avalancheMaxDistance: 30.0,
  /** Default avalanche base pursuit speed. */
  avalancheCruiseSpeed: 23.6,
  /** Extra avalanche surge speed during the final third to keep tension alive. */
  avalancheLateBonus: 0.65,
  /** Maximum simulation dt clamp to prevent tunneling on tab switches. */
  maxDt: 0.05,
} as const;

export interface RampSurfaceSample {
  onRamp: boolean;
  ramp: TrackRamp | null;
  /** Normalized progress along ramp deck in [0, 1]. */
  progress: number;
  /** Vertical elevation of the snow ramp surface above local ground Y (meters). */
  surfaceHeight: number;
  /** Upward deck inclination angle in radians. */
  rampPitch: number;
}

/**
 * Shared concave kicker profile used by BOTH simulation physics and 3D ramp geometry:
 * Starts flush with the snow at t=0 and smoothly curves upward to peak height at t=1.
 */
export function evaluateRampDeckHeight(ramp: TrackRamp, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return ramp.height * (0.35 * clamped * clamped + 0.65 * clamped);
}

/**
 * Derivative d(height)/d(z) along the ramp deck for exact board inclination angle.
 */
export function evaluateRampDeckPitch(ramp: TrackRamp, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const dhDt = ramp.height * (0.7 * clamped + 0.65);
  return Math.atan2(dhDt, ramp.length);
}

/**
 * Evaluate whether a rider at `(distance, lateralOffset)` is horizontally aligned with a snow ramp deck.
 */
export function evaluateRampSurface(
  ramps: readonly TrackRamp[],
  distance: number,
  lateralOffset: number,
): RampSurfaceSample {
  for (let i = 0; i < ramps.length; i++) {
    const ramp = ramps[i];
    const zEnd = ramp.zStart + ramp.length;
    if (distance < ramp.zStart || distance > zEnd) continue;

    // Slight forgiving edge tolerance (+0.35m) so brushing the edge doesn't awkwardly drop off
    if (Math.abs(lateralOffset - ramp.offsetX) <= ramp.width * 0.5 + 0.35) {
      const progress = (distance - ramp.zStart) / ramp.length;
      return {
        onRamp: true,
        ramp,
        progress,
        surfaceHeight: evaluateRampDeckHeight(ramp, progress),
        rampPitch: evaluateRampDeckPitch(ramp, progress),
      };
    }
  }
  return {
    onRamp: false,
    ramp: null,
    progress: 0,
    surfaceHeight: 0,
    rampPitch: 0,
  };
}

export function createInitialInput(): InputState {
  return {
    steerAxis: 0,
    left: false,
    right: false,
    dragSteer: 0,
    dragging: false,
    jumpQueued: false,
    grab: false,
    brake: false,
  };
}

/**
 * Build a clean pre-seeded trail history along the safe starting snow runway behind distance = 0
 * so level followers (levelNumber - 1) start staged cleanly behind Lofi from frame 0.
 */
function buildInitialPathHistory(followerCount: number, levelNumber: number): PathSample[] {
  const minRunway = Math.max(20, (followerCount + 3) * SIM_CONFIG.followerSpacing + 6);
  const startDist = -Math.min(48, minRunway);
  const step = 0.4;
  const samples: PathSample[] = [];

  for (let d = startDist; d <= 0; d += step) {
    const wx = getTrackCenterX(d);
    const wy = getGroundHeightAt(wx, d);
    const yaw = -Math.atan(getTrackSlopeTangentX(d));
    samples.push({
      travelDistance: d,
      distance: d,
      worldX: wx,
      worldY: wy,
      heightAboveGround: 0,
      jumpState: 'GROUNDED',
      landingProgress: 0,
      rampPitch: 0,
      grabAmount: 0,
      yaw,
      lean: 0,
      brakeAmount: 0,
      slopePitch: getTrackPitchAt(levelNumber, d),
    });
  }

  const last = samples[samples.length - 1];
  if (!last || Math.abs(last.distance) > 1e-4) {
    const wx = getTrackCenterX(0);
    const wy = getGroundHeightAt(wx, 0);
    const yaw = -Math.atan(getTrackSlopeTangentX(0));
    samples.push({
      travelDistance: 0,
      distance: 0,
      worldX: wx,
      worldY: wy,
      heightAboveGround: 0,
      jumpState: 'GROUNDED',
      landingProgress: 0,
      rampPitch: 0,
      grabAmount: 0,
      yaw,
      lean: 0,
      brakeAmount: 0,
      slopePitch: getTrackPitchAt(levelNumber, 0),
    });
  }

  return samples;
}

/**
 * Pure arc-length trail sampler:
 * Binary-searches `pathHistory` by `travelDistance` and linearly interpolates position, jump height,
 * ramp pitch, grab pose, yaw, and lean so followers carve & jump sequentially along Lofi's exact trail.
 */
export function samplePathAtTravelDistance(
  pathHistory: readonly PathSample[],
  targetTravelDistance: number,
): PathSample {
  const n = pathHistory.length;
  if (n === 0) {
    const wx = getTrackCenterX(0);
    return {
      travelDistance: targetTravelDistance,
      distance: 0,
      worldX: wx,
      worldY: getGroundHeightAt(wx, 0),
      heightAboveGround: 0,
      jumpState: 'GROUNDED',
      landingProgress: 0,
      rampPitch: 0,
      grabAmount: 0,
      yaw: 0,
      lean: 0,
      brakeAmount: 0,
      slopePitch: getTrackPitchAt(1, 0),
    };
  }
  if (targetTravelDistance <= pathHistory[0].travelDistance) {
    return pathHistory[0];
  }
  if (targetTravelDistance >= pathHistory[n - 1].travelDistance) {
    return pathHistory[n - 1];
  }

  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pathHistory[mid].travelDistance <= targetTravelDistance) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const a = pathHistory[lo];
  const b = pathHistory[hi];
  const span = b.travelDistance - a.travelDistance;
  const t = span > 1e-6 ? (targetTravelDistance - a.travelDistance) / span : 0;

  return {
    travelDistance: targetTravelDistance,
    distance: a.distance + (b.distance - a.distance) * t,
    worldX: a.worldX + (b.worldX - a.worldX) * t,
    worldY: a.worldY + (b.worldY - a.worldY) * t,
    heightAboveGround: a.heightAboveGround + (b.heightAboveGround - a.heightAboveGround) * t,
    jumpState: t < 0.5 ? a.jumpState : b.jumpState,
    landingProgress: a.landingProgress + (b.landingProgress - a.landingProgress) * t,
    rampPitch: a.rampPitch + (b.rampPitch - a.rampPitch) * t,
    grabAmount: a.grabAmount + (b.grabAmount - a.grabAmount) * t,
    yaw: a.yaw + (b.yaw - a.yaw) * t,
    lean: a.lean + (b.lean - a.lean) * t,
    brakeAmount: a.brakeAmount + (b.brakeAmount - a.brakeAmount) * t,
    slopePitch: a.slopePitch + (b.slopePitch - a.slopePitch) * t,
  };
}

/** Create staged follower entries behind Lofi strictly matching `followerCount = levelNumber - 1`. */
function buildLevelFollowers(
  followerCount: number,
  pathHistory: readonly PathSample[],
): FollowerYeti[] {
  const followers: FollowerYeti[] = [];
  for (let i = 0; i < followerCount; i++) {
    const targetTravel = -(i + 1) * SIM_CONFIG.followerSpacing;
    const sample = samplePathAtTravelDistance(pathHistory, targetTravel);
    followers.push({
      id: i + 1,
      slotIndex: i,
      worldX: sample.worldX,
      worldY: sample.worldY,
      heightAboveGround: 0,
      jumpState: 'GROUNDED',
      landingProgress: 0,
      rampPitch: 0,
      grabAmount: 0,
      distance: sample.distance,
      yaw: sample.yaw,
      lean: 0,
      brakeAmount: 0,
      slopePitch: sample.slopePitch,
    });
  }
  return followers;
}

/** Configure a SimulationState in place for a specific level using exact formula: followers = levelNumber - 1. */
function configureLevelInPlace(
  state: SimulationState,
  level: LevelConfig,
  targetPhase: GamePhase,
  seed: number,
  respawnLayout: boolean,
): void {
  // Always keep active track curve/width profile synced to this level BEFORE computing coordinates!
  setActiveTrackProfile(level.levelNumber);

  const followerCount = getFollowersForLevel(level.levelNumber);
  const pathHistory = buildInitialPathHistory(followerCount, level.levelNumber);

  state.phase = targetPhase;
  state.levelNumber = level.levelNumber;
  state.totalLevels = LEVEL_CONFIGS.length;
  state.levelName = level.name;
  state.levelLength = level.length;
  state.levelBaseSpeed = level.baseSpeed;
  state.levelAvalancheCruiseSpeed = level.avalancheCruiseSpeed;
  state.spawnSeed = seed;

  state.distance = 0;
  state.travelDistance = 0;
  state.lateralOffset = 0;
  state.lateralVelocity = 0;
  state.forwardSpeed = level.baseSpeed;
  state.elapsedTime = 0;
  state.avalancheDistance = level.avalancheStartDistance;
  state.invulnTimer = 0;
  state.hitFlashTimer = 0;
  state.slowdownTimer = 0;
  state.hitCount = 0;
  state.visualLean = 0;

  state.jumpState = 'GROUNDED';
  state.heightAboveGround = 0;
  state.verticalVelocity = 0;
  state.rampPitch = 0;
  state.landingTimer = 0;
  state.jumpBufferTimer = 0;
  state.grabAmount = 0;
  state.grabHeldInAir = false;
  state.grabAirHoldTime = 0;
  state.activeRampId = null;
  state.grabCount = 0;
  state.activeGrabStyle = 'INDY';
  state.airPeakHeight = 0;
  state.launchedFromRamp = false;
  state.scoreMultiplier = TRICK_CONFIG.minMultiplier;
  state.peakMultiplier = TRICK_CONFIG.minMultiplier;
  state.multiplierTimer = 0;
  state.lastTrickLabel = null;
  state.lastTrickPoints = 0;
  state.trickFeedbackTimer = 0;
  state.landingBoostTimer = 0;

  state.levelRewardGranted = false;
  state.unlockedFollowers = followerCount;
  state.outcomeSnapshot = null;
  state.ramps = level.ramps.map((r) => ({ ...r }));
  state.pathHistory = pathHistory;
  state.followers = buildLevelFollowers(followerCount, pathHistory);
  resetWindGustState(
    state.windGust,
    (seed ^ Math.imul(level.levelNumber, 2654435761)) >>> 0,
  );
  state.brakeAmount = 0;
  state.steepPhase = 'NORMAL';
  state.steepSlopeFactor = 0;
  state.steepWarningActive = false;

  state.score = 0;
  state.collectedCollectiblesCount = 0;
  state.lastScoreDelta = 0;
  state.scoreFeedbackTimer = 0;
  if (respawnLayout) {
    state.obstacles = buildLevelObstacles(level, seed);
    state.collectibles = spawnLevelCollectibles(level, state.obstacles, seed);
  } else {
    for (let i = 0; i < state.obstacles.length; i++) {
      state.obstacles[i].hit = false;
    }
    resetCollectiblesInPlace(state.collectibles);
  }
}

export function createInitialSimulationState(
  phase: GamePhase = 'title',
  seed?: number,
  levelNumber = 1,
): SimulationState {
  const level = getLevelConfig(levelNumber);
  setActiveTrackProfile(level.levelNumber);

  const chosenSeed = seed ?? level.spawnSeed;
  const followerCount = getFollowersForLevel(level.levelNumber);
  const obstacles = buildLevelObstacles(level, chosenSeed);
  const collectibles = spawnLevelCollectibles(level, obstacles, chosenSeed);
  const ramps = level.ramps.map((r) => ({ ...r }));
  const pathHistory = buildInitialPathHistory(followerCount, level.levelNumber);
  const followers = buildLevelFollowers(followerCount, pathHistory);

  return {
    phase,
    levelNumber: level.levelNumber,
    totalLevels: LEVEL_CONFIGS.length,
    levelName: level.name,
    levelLength: level.length,
    levelBaseSpeed: level.baseSpeed,
    levelAvalancheCruiseSpeed: level.avalancheCruiseSpeed,
    spawnSeed: chosenSeed,
    distance: 0,
    travelDistance: 0,
    lateralOffset: 0,
    lateralVelocity: 0,
    forwardSpeed: level.baseSpeed,
    elapsedTime: 0,
    avalancheDistance: level.avalancheStartDistance,
    invulnTimer: 0,
    hitFlashTimer: 0,
    slowdownTimer: 0,
    hitCount: 0,
    visualLean: 0,
    jumpState: 'GROUNDED',
    heightAboveGround: 0,
    verticalVelocity: 0,
    rampPitch: 0,
    landingTimer: 0,
    jumpBufferTimer: 0,
    grabAmount: 0,
    grabHeldInAir: false,
    grabAirHoldTime: 0,
    activeRampId: null,
    grabCount: 0,
    activeGrabStyle: 'INDY',
    airPeakHeight: 0,
    launchedFromRamp: false,
    scoreMultiplier: TRICK_CONFIG.minMultiplier,
    peakMultiplier: TRICK_CONFIG.minMultiplier,
    multiplierTimer: 0,
    lastTrickLabel: null,
    lastTrickPoints: 0,
    trickFeedbackTimer: 0,
    landingBoostTimer: 0,
    levelRewardGranted: false,
    unlockedFollowers: followerCount,
    outcomeSnapshot: null,
    ramps,
    obstacles,
    collectibles,
    score: 0,
    collectedCollectiblesCount: 0,
    lastScoreDelta: 0,
    scoreFeedbackTimer: 0,
    followers,
    pathHistory,
    windGust: createWindGustState(
      (chosenSeed ^ Math.imul(level.levelNumber, 2654435761)) >>> 0,
    ),
    brakeAmount: 0,
    steepPhase: 'NORMAL',
    steepSlopeFactor: 0,
    steepWarningActive: false,
  };
}

/**
 * Start a brand new game from Level 1 with Lofi alone (0 followers).
 */
export function startNewGame(
  state: SimulationState,
  targetPhase: GamePhase = 'playing',
  seed?: number,
): void {
  const level1 = getLevelConfig(1);
  configureLevelInPlace(
    state,
    level1,
    targetPhase,
    seed ?? level1.spawnSeed,
    true,
  );
}

/**
 * Retry the current level cleanly:
 * - Never adds a Yeti; strictly restores active followers to (levelNumber - 1).
 * - Resets obstacle hit flags, jump/grab state, distance, speed, timers, and avalanche.
 */
export function retryCurrentLevel(
  state: SimulationState,
  targetPhase: GamePhase = 'playing',
  newSeed?: number,
): void {
  const level = getLevelConfig(state.levelNumber);
  const respawnLayout = typeof newSeed === 'number';
  configureLevelInPlace(
    state,
    level,
    targetPhase,
    newSeed ?? state.spawnSeed,
    respawnLayout,
  );
}

/**
 * Advance to the next level strictly after completing the current level at the shelter:
 * - Idempotent: ignores calls unless `state.phase === 'victory'` so repeated button clicks
 *   never skip levels or add extra Yetis.
 * - Next level starts with exactly (nextLevelNumber - 1) followers staged behind Lofi.
 */
export function advanceToNextLevel(
  state: SimulationState,
  seed?: number,
): boolean {
  if (state.phase !== 'victory') {
    return false;
  }
  if (state.levelNumber >= LEVEL_CONFIGS.length) {
    return false;
  }
  const nextLevel = getLevelConfig(state.levelNumber + 1);
  configureLevelInPlace(
    state,
    nextLevel,
    'playing',
    seed ?? nextLevel.spawnSeed,
    true,
  );
  return true;
}

/**
 * Backward-compatible reset helper: retries current level cleanly.
 */
export function resetSimulationState(
  state: SimulationState,
  targetPhase: GamePhase = 'playing',
  newSeed?: number,
): void {
  retryCurrentLevel(state, targetPhase, newSeed);
}

/** Combine keyboard and pointer-drag input into a clamped continuous axis in [-1, 1]. */
export function resolveSteerAxis(input: InputState): number {
  const keyAxis = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (keyAxis !== 0) {
    return keyAxis;
  }
  if (input.dragging) {
    return Math.max(-1, Math.min(1, input.dragSteer));
  }
  return Math.max(-1, Math.min(1, input.steerAxis));
}

/**
 * Update every follower Yeti smoothly along Lofi's distance-indexed path history.
 * Because `pathHistory` stores `heightAboveGround`, `jumpState`, `rampPitch`, and `grabAmount`,
 * each follower automatically rides UP the ramp deck, launches sequentially at the exact takeoff spot,
 * mirrors the Grab pose during its own airborne arc, and lands cleanly on local snow ground!
 */
function updateFollowersAlongPath(
  state: SimulationState,
  levelCfg: LevelConfig,
): void {
  const followers = state.followers;
  const path = state.pathHistory;
  if (followers.length === 0 || path.length === 0) return;

  // Dynamic controlled spacing keeps Lil Yetis safely separated during braking & steep acceleration (zero stacking/colliding!)
  const dynamicSpacing =
    SIM_CONFIG.followerSpacing +
    state.brakeAmount * STEEP_DESCENT_CONFIG.brakeExtraFollowerSpacing;
  let prevLeadTravel = state.travelDistance;

  for (let i = 0; i < followers.length; i++) {
    const f = followers[i];
    const desiredTravel = Math.min(
      prevLeadTravel - dynamicSpacing,
      state.travelDistance - (f.slotIndex + 1) * dynamicSpacing,
    );
    const sample = samplePathAtTravelDistance(path, desiredTravel);
    prevLeadTravel = desiredTravel;
    const localGroundY = getGroundHeightAt(sample.worldX, sample.distance);

    // Guarantee follower never penetrates a snow ramp deck underneath its own coordinates
    const followerLat = sample.worldX - getTrackCenterX(sample.distance);
    const rampUnder = evaluateRampSurface(state.ramps, sample.distance, followerLat);
    const heightAboveGround = Math.max(
      0,
      sample.heightAboveGround,
      rampUnder.onRamp ? rampUnder.surfaceHeight : 0,
    );

    const fSteep = evaluateSteepDescentAt(levelCfg.steepDescents, sample.distance);

    f.worldX = sample.worldX;
    f.worldY = localGroundY;
    f.heightAboveGround = heightAboveGround;
    f.jumpState = sample.jumpState;
    f.landingProgress = sample.landingProgress;
    f.rampPitch = rampUnder.onRamp && sample.jumpState !== 'AIRBORNE'
      ? Math.max(sample.rampPitch, rampUnder.rampPitch)
      : sample.rampPitch;
    f.grabAmount = sample.grabAmount;
    f.distance = sample.distance;
    f.yaw = sample.yaw;
    f.lean = sample.lean;
    // Mimic Lofi's braking along the trail AND smoothly speed-check when reaching the steep section
    f.brakeAmount = Math.max(sample.brakeAmount, fSteep.slopeFactor * 0.52);
    f.slopePitch = getTrackPitchAt(state.levelNumber, sample.distance);
  }
}

/**
 * Advance the game simulation by rawDt seconds.
 * Pure logic: mutates `state` deterministically and returns discrete events for audio/particles/HUD.
 * Note: Zero mid-track Yeti pickups — followers strictly come from level progression (levelNumber - 1).
 */
export function stepSimulation(
  state: SimulationState,
  input: InputState,
  rawDt: number,
): StepEvents {
  const events: StepEvents = {
    collidedObstacle: null,
    becameVictory: false,
    becameGameOver: false,
    carveIntensity: 0,
    tookOff: false,
    startedGrab: false,
    landed: false,
    landedGrabTrick: false,
    landedTrickPoints: 0,
    landedTrickLabel: null,
    collectedCount: 0,
    collectedPoints: 0,
    lastCollectedPos: null,
  };

  if (state.phase !== 'playing') {
    return events;
  }

  // Ensure track math evaluates the state's exact level profile even across multi-level test harnesses
  setActiveTrackProfile(state.levelNumber);

  const dt = Math.min(Math.max(rawDt, 0), SIM_CONFIG.maxDt);
  if (dt <= 0) {
    return events;
  }

  const prevDistance = state.distance;
  const prevLateralOffset = state.lateralOffset;
  const prevPlayerX = getTrackCenterX(prevDistance) + prevLateralOffset;
  const prevRampSample = evaluateRampSurface(state.ramps, prevDistance, prevLateralOffset);

  state.elapsedTime += dt;

  // Tick status timers
  if (state.invulnTimer > 0) {
    state.invulnTimer = Math.max(0, state.invulnTimer - dt);
  }
  if (state.hitFlashTimer > 0) {
    state.hitFlashTimer = Math.max(0, state.hitFlashTimer - dt);
  }
  if (state.slowdownTimer > 0) {
    state.slowdownTimer = Math.max(0, state.slowdownTimer - dt);
  }
  if (state.trickFeedbackTimer > 0) {
    state.trickFeedbackTimer = Math.max(0, state.trickFeedbackTimer - dt);
  }
  if (state.landingBoostTimer > 0) {
    state.landingBoostTimer = Math.max(0, state.landingBoostTimer - dt);
  }
  if (state.scoreFeedbackTimer > 0) {
    state.scoreFeedbackTimer = Math.max(0, state.scoreFeedbackTimer - dt);
  }
  if (state.scoreMultiplier > TRICK_CONFIG.minMultiplier) {
    const stepped = stepTrickMultiplierTimer(state.scoreMultiplier, state.multiplierTimer, dt);
    state.scoreMultiplier = stepped.multiplier;
    state.multiplierTimer = stepped.timer;
  }
  if (input.jumpQueued) {
    state.jumpBufferTimer = SIM_CONFIG.jumpBufferWindow;
    input.jumpQueued = false;
  } else if (state.jumpBufferTimer > 0) {
    state.jumpBufferTimer = Math.max(0, state.jumpBufferTimer - dt);
  }

  // Evaluate steep-descent zone & smooth braking pose blend
  const levelCfg = getLevelConfig(state.levelNumber);
  const steepSample = evaluateSteepDescentAt(levelCfg.steepDescents, state.distance);
  state.steepPhase = steepSample.phase;
  state.steepSlopeFactor = steepSample.slopeFactor;
  state.steepWarningActive = steepSample.warningActive;

  const isAirborneBeforeMove = state.jumpState === 'AIRBORNE';
  const brakingNow = input.brake && !isAirborneBeforeMove;
  const targetBrake = brakingNow ? 1 : 0;
  const brakeRate = brakingNow
    ? STEEP_DESCENT_CONFIG.brakeEngageRate
    : STEEP_DESCENT_CONFIG.brakeReleaseRate;
  state.brakeAmount += (targetBrake - state.brakeAmount) * (1 - Math.exp(-brakeRate * dt));
  if (!brakingNow && state.brakeAmount < 0.008) {
    state.brakeAmount = 0;
  }

  // Forward speed: cruise recovery + steep-slope gravity acceleration + smooth speed-check braking
  const progressRatio = Math.min(1, state.distance / state.levelLength);
  const boostBonus =
    state.landingBoostTimer > 0
      ? Math.min(1, state.landingBoostTimer / 0.35) *
        (state.trickFeedbackTimer > 0.6
          ? SIM_CONFIG.grabLandingBoostSpeed
          : SIM_CONFIG.normalLandingBoostSpeed)
      : 0;
  const targetCruiseSpeed = state.levelBaseSpeed + progressRatio * 1.6 + boostBonus;
  const maxSteepSpeed = targetCruiseSpeed + STEEP_DESCENT_CONFIG.maxOverspeedBonus;

  const steer = resolveSteerAxis(input);

  const isGravityDescentZone =
    steepSample.zone !== null &&
    steepSample.zone.cameraMode !== 'slalom' &&
    steepSample.zone.cameraMode !== 'rockGarden';

  if (isGravityDescentZone && steepSample.slopeFactor > 0 && !isAirborneBeforeMove) {
    // Gravity gradually builds downhill speed on the steep slope
    const gravScale = steepSample.zone?.enableCarvingSpeedControl
      ? CARVING_PASS_CONFIG.gravityScale
      : 1.0;
    const gravAccel =
      STEEP_DESCENT_CONFIG.gravityAccelMax * gravScale * steepSample.slopeFactor;
    state.forwardSpeed = Math.min(maxSteepSpeed, state.forwardSpeed + gravAccel * dt);

    // On Level 4 Carving Pass, active carving through the S-curves smoothly bleeds excess downhill speed
    if (steepSample.zone?.enableCarvingSpeedControl) {
      const carveBleed = computeCarvingSpeedBleedRate({
        forwardSpeed: state.forwardSpeed,
        baseSpeed: state.levelBaseSpeed,
        steerAxis: steer,
        visualLean: state.visualLean,
        isAirborne: isAirborneBeforeMove,
        isBraking: brakingNow,
        slopeFactor: steepSample.slopeFactor,
      });
      if (carveBleed > 0) {
        const carveFloor = state.levelBaseSpeed - CARVING_PASS_CONFIG.carveFloorBelowBase;
        state.forwardSpeed = Math.max(carveFloor, state.forwardSpeed - carveBleed * dt);
      }
    }
  }

  const flatSample = evaluateFlatZoneAt(levelCfg.flatZones, state.distance);
  const flatCruiseDrop =
    flatSample.active && flatSample.zone
      ? flatSample.zone.cruiseSpeedDrop * flatSample.factor
      : 0;
  const effectiveCruiseSpeed = Math.max(
    STEEP_DESCENT_CONFIG.minBrakeSpeed + 3.0,
    targetCruiseSpeed - flatCruiseDrop,
  );

  if (brakingNow) {
    // Smooth speed-check deceleration (never stops instantly, keeps board gliding & controllable)
    state.forwardSpeed = Math.max(
      STEEP_DESCENT_CONFIG.minBrakeSpeed,
      state.forwardSpeed - STEEP_DESCENT_CONFIG.brakeDecelRate * dt,
    );
  } else if (state.forwardSpeed < effectiveCruiseSpeed) {
    const recoveryMult =
      (state.slowdownTimer > 0 ? 0.45 : 1.0) *
      (flatSample.active ? 1 - 0.35 * flatSample.factor : 1.0);
    state.forwardSpeed = Math.min(
      effectiveCruiseSpeed,
      state.forwardSpeed + SIM_CONFIG.speedRecoveryRate * recoveryMult * dt,
    );
  } else if (!isGravityDescentZone || steepSample.slopeFactor <= 0.02) {
    // Gentle momentum carry & natural deceleration back to cruise speed after steep landing or boost;
    // on a flat snow section (Level 7), momentum decays gradually so entering with clean speed matters.
    const easeRate =
      flatSample.active && flatSample.zone
        ? flatSample.zone.naturalCoastDecayRate
        : state.forwardSpeed > effectiveCruiseSpeed + 2.2
          ? 1.85
          : 4.5;
    const ease = 1 - Math.exp(-easeRate * dt);
    state.forwardSpeed += (effectiveCruiseSpeed - state.forwardSpeed) * ease;
  }

  // Advance randomized alpine wind gusts (subtle crosswind push after opening calm grace window)
  stepWindGust(state.windGust, dt, state.levelNumber);

  // Continuous lateral steering — level-scaled for crisp switchbacks on Levels 6-10 while preserving Levels 1-5 baseline.
  // Only steep-descent gravity overspeed applies steering difficulty penalty (normal cruise, flat slalom & ramp boosts never nerf turning).
  const steerProfile = computeLevelSteeringProfile(state.levelNumber);
  const balanceRefSpeed =
    isGravityDescentZone &&
    (steepSample.slopeFactor > 0.02 || state.steepPhase === 'RECOVERY')
      ? state.levelBaseSpeed
      : targetCruiseSpeed;
  const speedBalance = computeSpeedSteerBalance(
    state.forwardSpeed,
    balanceRefSpeed,
    state.brakeAmount,
    isAirborneBeforeMove,
  );
  const accelMult =
    (isAirborneBeforeMove ? SIM_CONFIG.airborneSteerFactor : 1.0) *
    speedBalance.steerAccelMult;
  const maxLatSpeed =
    steerProfile.maxLateralSpeed *
    (isAirborneBeforeMove ? steerProfile.airborneMaxLateralFactor : 1.0);
  const dampingRate =
    (isAirborneBeforeMove ? SIM_CONFIG.lateralDamping * 0.45 : SIM_CONFIG.lateralDamping) *
    speedBalance.lateralDampingMult;
  const windPushAccel = getWindGustSteeringAccel(
    state.windGust,
    state.levelNumber,
    isAirborneBeforeMove,
  );

  if (Math.abs(steer) > 0.01) {
    const reversing =
      (steer > 0 && state.lateralVelocity < -0.5) ||
      (steer < 0 && state.lateralVelocity > 0.5);
    const boost = reversing && !isAirborneBeforeMove ? steerProfile.counterSteerBoost : 1.0;
    state.lateralVelocity += steer * steerProfile.lateralAccel * accelMult * boost * dt;

    const dragCoeff = isAirborneBeforeMove
      ? 0.9
      : steerProfile.activeDrag * (1 - speedBalance.overspeedRatio * 0.32);
    const activeDrag = Math.exp(-dragCoeff * dt);
    state.lateralVelocity *= activeDrag;
  } else {
    state.lateralVelocity *= Math.exp(-dampingRate * dt);
    if (Math.abs(windPushAccel) === 0 && Math.abs(state.lateralVelocity) < 0.04) {
      state.lateralVelocity = 0;
    }
  }

  // Apply subtle crosswind gust lateral force (makes holding line & counter-steering slightly harder)
  if (windPushAccel !== 0) {
    state.lateralVelocity += windPushAccel * dt;
  }

  // Clamp lateral speed
  if (state.lateralVelocity > maxLatSpeed) {
    state.lateralVelocity = maxLatSpeed;
  } else if (state.lateralVelocity < -maxLatSpeed) {
    state.lateralVelocity = -maxLatSpeed;
  }

  // Apply forward displacement and TRUE world-space lateral momentum:
  // Subtracting the track centerline's curve delta guarantees Lofi NEVER turns automatically
  // along bends when no steering input is held — the player must actively carve every curve!
  const nextDistance = state.distance + state.forwardSpeed * dt;
  const trackCurveShiftX =
    getTrackCenterX(nextDistance) - getTrackCenterX(state.distance);
  state.distance = nextDistance;
  state.lateralOffset += state.lateralVelocity * dt - trackCurveShiftX;

  // Enforce clear snowbank track boundaries (outer bank wall catches the board cleanly without auto-centering,
  // and immediately allows crisp inward peel-off when the player actively steers away from the bank)
  const maxOffset = Math.max(
    2.5,
    getTrackHalfWidth(state.distance) - SIM_CONFIG.edgePadding,
  );
  const trackCurveSpeedX = dt > 1e-4 ? trackCurveShiftX / dt : 0;
  if (state.lateralOffset > maxOffset) {
    state.lateralOffset = maxOffset;
    state.lateralVelocity = computeEdgeEscapeVelocity(
      state.lateralVelocity,
      steer,
      1,
      trackCurveSpeedX,
      maxLatSpeed,
    );
  } else if (state.lateralOffset < -maxOffset) {
    state.lateralOffset = -maxOffset;
    state.lateralVelocity = computeEdgeEscapeVelocity(
      state.lateralVelocity,
      steer,
      -1,
      trackCurveSpeedX,
      maxLatSpeed,
    );
  }

  // --- Ramp Deck Tracking & Vertical Jump State Machine (GROUNDED -> AIRBORNE -> LANDING -> GROUNDED) ---
  const currRampSample = evaluateRampSurface(state.ramps, state.distance, state.lateralOffset);

  // Check if player crossed a ramp lip during this step (automatic takeoff!)
  let crossedLipRamp: TrackRamp | null = null;
  if (state.jumpState !== 'AIRBORNE') {
    for (let i = 0; i < state.ramps.length; i++) {
      const r = state.ramps[i];
      const lipZ = r.zStart + r.length;
      if (prevDistance < lipZ && state.distance >= lipZ) {
        const midLat = (prevLateralOffset + state.lateralOffset) * 0.5;
        if (
          Math.abs(midLat - r.offsetX) <= r.width * 0.5 + 0.45 ||
          state.activeRampId === r.id
        ) {
          crossedLipRamp = r;
          break;
        }
      }
    }
    // Also launch cleanly if rider was near the top of the ramp deck and carved off the top lip corner
    if (
      !crossedLipRamp &&
      prevRampSample.onRamp &&
      prevRampSample.ramp &&
      !currRampSample.onRamp &&
      prevRampSample.progress >= 0.72
    ) {
      crossedLipRamp = prevRampSample.ramp;
    }
  }

  if (crossedLipRamp) {
    // Automatic Ramp Takeoff -> AIRBORNE
    state.jumpState = 'AIRBORNE';
    state.heightAboveGround = Math.max(state.heightAboveGround, crossedLipRamp.height);
    // Scale launch slightly if rider was slowed down heavily by an earlier hit, while keeping a satisfying hop
    const speedScale = Math.max(0.75, Math.min(1.08, state.forwardSpeed / state.levelBaseSpeed));
    state.verticalVelocity = crossedLipRamp.launchVy * speedScale;
    state.rampPitch = evaluateRampDeckPitch(crossedLipRamp, 1.0);
    state.landingTimer = 0;
    state.jumpBufferTimer = 0;
    state.activeRampId = null;
    state.grabHeldInAir = false;
    state.grabAirHoldTime = 0;
    state.airPeakHeight = state.heightAboveGround;
    state.launchedFromRamp = true;
    state.activeGrabStyle = selectGrabTrickStyle(steer, true, state.grabCount);
    events.tookOff = true;
  } else if (
    state.jumpState !== 'AIRBORNE' &&
    state.jumpBufferTimer > 0 &&
    (state.jumpState === 'GROUNDED' || state.landingTimer <= 0.14)
  ) {
    // Manual Ollie / Trick Jump (W / ArrowUp / JUMP / dedicated TRICK button) -> AIRBORNE
    const rampBonusVy =
      currRampSample.onRamp && currRampSample.ramp
        ? currRampSample.ramp.launchVy * 0.96
        : 0;
    const onRampNow = Boolean(currRampSample.onRamp && currRampSample.ramp);
    state.jumpState = 'AIRBORNE';
    state.heightAboveGround = Math.max(
      state.heightAboveGround,
      currRampSample.onRamp ? currRampSample.surfaceHeight : 0,
    );
    state.verticalVelocity = Math.max(SIM_CONFIG.manualJumpVy, rampBonusVy);
    state.rampPitch = Math.max(state.rampPitch, 0.24);
    state.landingTimer = 0;
    state.jumpBufferTimer = 0;
    state.activeRampId = null;
    state.grabHeldInAir = false;
    state.grabAirHoldTime = 0;
    state.airPeakHeight = state.heightAboveGround;
    state.launchedFromRamp = onRampNow;
    state.activeGrabStyle = selectGrabTrickStyle(steer, onRampNow, state.grabCount);
    events.tookOff = true;
  } else if (state.jumpState === 'AIRBORNE') {
    // Integrate vertical jump kinematics relative to local snow ground
    state.verticalVelocity -= SIM_CONFIG.gravity * dt;
    state.heightAboveGround += state.verticalVelocity * dt;
    if (state.heightAboveGround > state.airPeakHeight) {
      state.airPeakHeight = state.heightAboveGround;
    }

    // Smooth board nose pitch matching vertical flight arc (no backflips or spins!)
    const targetAirPitch = Math.max(-0.22, Math.min(0.32, state.verticalVelocity * 0.028));
    state.rampPitch += (targetAirPitch - state.rampPitch) * (1 - Math.exp(-10 * dt));

    // Grab trick: only active while AIRBORNE & clearly above snow; releases smoothly back to landing pose
    const canGrabNow =
      input.grab && state.heightAboveGround >= SIM_CONFIG.minGrabAltitude;
    if (canGrabNow) {
      if (!state.grabHeldInAir) {
        state.activeGrabStyle = selectGrabTrickStyle(
          steer,
          state.launchedFromRamp,
          state.grabCount,
        );
        events.startedGrab = true;
      }
      state.grabAmount += (1 - state.grabAmount) * (1 - Math.exp(-14 * dt));
      state.grabHeldInAir = true;
      state.grabAirHoldTime += dt;
    } else {
      state.grabAmount += (0 - state.grabAmount) * (1 - Math.exp(-16 * dt));
      if (state.grabAmount < 0.01) state.grabAmount = 0;
    }

    // Touchdown check against local snow (or another ramp deck if overlapping)
    const floorHeight = currRampSample.onRamp ? currRampSample.surfaceHeight : 0;
    if (state.heightAboveGround <= floorHeight) {
      state.heightAboveGround = floorHeight;
      state.verticalVelocity = 0;
      state.jumpState = 'LANDING';
      state.landingTimer = SIM_CONFIG.landingDuration;
      state.rampPitch = currRampSample.onRamp ? currRampSample.rampPitch : 0;
      state.activeRampId = currRampSample.ramp ? currRampSample.ramp.id : null;
      events.landed = true;

      // Award trick points & score multiplier strictly upon clean LANDING (never per-frame in mid-air!)
      const trickResult = evaluateTrickLanding({
        grabbed: state.grabHeldInAir,
        grabHoldTime: state.grabAirHoldTime,
        minGrabHoldSeconds: SIM_CONFIG.minGrabHoldSeconds,
        peakAirHeight: state.airPeakHeight,
        launchedFromRamp: state.launchedFromRamp,
        grabStyle: state.activeGrabStyle,
        currentMultiplier: state.scoreMultiplier,
        currentTimer: state.multiplierTimer,
      });

      state.scoreMultiplier = trickResult.nextMultiplier;
      state.peakMultiplier = Math.max(state.peakMultiplier, trickResult.nextMultiplier);
      state.multiplierTimer = trickResult.nextTimer;

      if (trickResult.awardedGrab) {
        state.grabCount += 1;
        state.score += trickResult.points;
        state.lastTrickLabel = trickResult.label;
        state.lastTrickPoints = trickResult.points;
        state.lastScoreDelta = trickResult.points;
        state.trickFeedbackTimer = TRICK_CONFIG.trickToastDuration;
        state.scoreFeedbackTimer = COLLECTIBLE_CONFIG.scoreFeedbackDuration;
        state.landingBoostTimer = 0.75;
        events.landedGrabTrick = true;
        events.landedTrickPoints = trickResult.points;
        events.landedTrickLabel = trickResult.label;
      } else if (trickResult.awardedTrick) {
        state.score += trickResult.points;
        state.lastTrickLabel = trickResult.label;
        state.lastTrickPoints = trickResult.points;
        state.lastScoreDelta = trickResult.points;
        state.trickFeedbackTimer = 1.15;
        state.scoreFeedbackTimer = COLLECTIBLE_CONFIG.scoreFeedbackDuration;
        state.landingBoostTimer = 0.35;
        events.landedTrickPoints = trickResult.points;
        events.landedTrickLabel = trickResult.label;
      } else {
        state.landingBoostTimer = 0.35;
      }
      state.grabHeldInAir = false;
      state.grabAirHoldTime = 0;
      state.airPeakHeight = 0;
      state.launchedFromRamp = false;
    }
  } else {
    // GROUNDED or LANDING state
    if (state.jumpState === 'LANDING') {
      state.landingTimer = Math.max(0, state.landingTimer - dt);
      if (state.landingTimer <= 0) {
        state.jumpState = 'GROUNDED';
      }
    }

    // Smoothly release any residual Grab animation blend on the snow
    if (state.grabAmount > 0) {
      state.grabAmount = Math.max(0, state.grabAmount - dt * 8.5);
    }

    if (currRampSample.onRamp && currRampSample.ramp) {
      state.activeRampId = currRampSample.ramp.id;
      state.heightAboveGround = currRampSample.surfaceHeight;
      state.rampPitch +=
        (currRampSample.rampPitch - state.rampPitch) * (1 - Math.exp(-16 * dt));
    } else {
      state.activeRampId = null;
      // Gentle drop if player carved sideways off the lower edge of a ramp
      if (state.heightAboveGround > 0.02) {
        state.heightAboveGround = Math.max(0, state.heightAboveGround - dt * 6.5);
      } else {
        state.heightAboveGround = 0;
      }
      state.rampPitch += (0 - state.rampPitch) * (1 - Math.exp(-14 * dt));
    }
  }

  // Smooth visual lean proportional to lateral velocity & steering intent
  const targetLean = Math.max(
    -1,
    Math.min(1, state.lateralVelocity / SIM_CONFIG.maxLateralSpeed),
  );
  const leanAlpha = 1 - Math.exp(-10 * dt);
  state.visualLean += (targetLean - state.visualLean) * leanAlpha;
  events.carveIntensity =
    state.jumpState === 'AIRBORNE' ? 0 : Math.min(1, Math.abs(state.visualLean));

  // Record distance-indexed path sample for smooth curved convoy following & sequential follower jumps
  const playerWorldX = getTrackCenterX(state.distance) + state.lateralOffset;
  const playerWorldY = getGroundHeightAt(playerWorldX, state.distance);
  const stepArc = Math.hypot(playerWorldX - prevPlayerX, state.distance - prevDistance);
  state.travelDistance += stepArc;

  const headingYaw =
    state.lateralVelocity === 0
      ? 0
      : -Math.atan2(state.lateralVelocity, Math.max(8, state.forwardSpeed));
  const landingProgress =
    state.jumpState === 'LANDING'
      ? Math.max(0, Math.min(1, 1 - state.landingTimer / SIM_CONFIG.landingDuration))
      : 0;

  const lastSample = state.pathHistory[state.pathHistory.length - 1];
  if (
    !lastSample ||
    state.travelDistance - lastSample.travelDistance >= SIM_CONFIG.pathSampleStep ||
    events.tookOff ||
    events.landed
  ) {
    state.pathHistory.push({
      travelDistance: state.travelDistance,
      distance: state.distance,
      worldX: playerWorldX,
      worldY: playerWorldY,
      heightAboveGround: state.heightAboveGround,
      jumpState: state.jumpState,
      landingProgress,
      rampPitch: state.rampPitch,
      grabAmount: state.grabAmount,
      yaw: headingYaw,
      lean: state.visualLean,
      brakeAmount: state.brakeAmount,
      slopePitch: getTrackPitchAt(state.levelNumber, state.distance),
    });

    const keepSpan = (state.followers.length + 6) * SIM_CONFIG.followerSpacing + 22;
    const minKeepTravel = state.travelDistance - keepSpan;
    let pruneCount = 0;
    while (
      pruneCount < state.pathHistory.length - 4 &&
      state.pathHistory[pruneCount + 1].travelDistance < minKeepTravel
    ) {
      pruneCount++;
    }
    if (pruneCount > 16) {
      state.pathHistory.splice(0, pruneCount);
    }
  }

  // --- Height-Aware Collision on LOFI ONLY (circles for rocks/pines, full-width bar for fallen_log) ---
  if (state.invulnTimer <= 0) {
    for (let i = 0; i < state.obstacles.length; i++) {
      const obs = state.obstacles[i];
      if (obs.hit) continue;

      const dz = obs.z - state.distance;
      if (dz < -3.0) continue;
      if (dz > 3.5) break;

      const dx = obs.worldX - playerWorldX;
      let overlapsFootprint = false;

      if (obs.kind === 'fallen_log') {
        const halfW = (obs.barHalfWidth ?? obs.radius) + SIM_CONFIG.playerRadius * 0.45;
        const halfD = (obs.halfDepthZ ?? 0.72) + SIM_CONFIG.playerRadius * 0.6;
        overlapsFootprint = Math.abs(dx) <= halfW && Math.abs(dz) <= halfD;
      } else {
        const combinedR = obs.radius + SIM_CONFIG.playerRadius;
        overlapsFootprint = dx * dx + dz * dz <= combinedR * combinedR;
      }

      if (overlapsFootprint) {
        // Height-aware check: if airborne strictly above this obstacle's clearance height (fallen log or low rock), sail over cleanly!
        if (state.heightAboveGround > obs.clearanceHeight) {
          continue;
        }

        obs.hit = true;
        state.hitCount += 1;
        const levelHitSlowSpeed = Math.max(
          11.0,
          state.levelBaseSpeed - SIM_CONFIG.hitSpeedDrop,
        );
        state.forwardSpeed = Math.min(state.forwardSpeed, levelHitSlowSpeed);
        state.invulnTimer = SIM_CONFIG.invulnDuration;
        state.hitFlashTimer = SIM_CONFIG.hitFlashDuration;
        state.slowdownTimer = SIM_CONFIG.slowdownDuration;
        state.landingBoostTimer = 0;
        // Obstacle crash breaks active trick combo multiplier back to 1x
        state.scoreMultiplier = TRICK_CONFIG.minMultiplier;
        state.multiplierTimer = 0;

        if (obs.kind !== 'fallen_log') {
          const pushDir = dx >= 0 ? -1 : 1;
          state.lateralVelocity = pushDir * 5.2;
        }

        events.collidedObstacle = obs;
        break;
      }
    }
  }

  // --- Lil Yeti Collectible Pickups along the snow path (multiplied by active trick scoreMultiplier!) ---
  stepCollectibleAnimations(state.collectibles, dt);
  const pickup = checkCollectiblePickups(
    state.collectibles,
    playerWorldX,
    playerWorldY,
    state.heightAboveGround,
    state.distance,
  );
  if (pickup.collectedCount > 0) {
    const multResult = applyCollectibleMultiplier(
      pickup.collectedPoints,
      state.scoreMultiplier,
      state.multiplierTimer,
    );
    state.score += multResult.points;
    state.multiplierTimer = multResult.nextTimer;
    state.collectedCollectiblesCount += pickup.collectedCount;
    state.lastScoreDelta = multResult.points;
    state.scoreFeedbackTimer = COLLECTIBLE_CONFIG.scoreFeedbackDuration;
    events.collectedCount = pickup.collectedCount;
    events.collectedPoints = multResult.points;
    events.lastCollectedPos = pickup.lastCollectedPos;
  }

  // Advance active level followers smoothly along Lofi's historical curved trail (including sequential jumps & braking!)
  updateFollowersAlongPath(state, levelCfg);

  // Update avalanche threat distance
  const avalancheSpeed =
    state.levelAvalancheCruiseSpeed +
    progressRatio * SIM_CONFIG.avalancheLateBonus;
  const speedDelta = state.forwardSpeed - avalancheSpeed;

  const gapChangeRate = speedDelta > 0 ? speedDelta * 0.52 : speedDelta * 1.12;
  state.avalancheDistance = Math.min(
    SIM_CONFIG.avalancheMaxDistance,
    state.avalancheDistance + gapChangeRate * dt,
  );

  // Check victory when Lofi crosses the shelter finish line (completes immediately without waiting for followers)
  if (state.distance >= state.levelLength) {
    state.distance = state.levelLength;
    state.phase = 'victory';
    state.jumpState = 'GROUNDED';
    state.heightAboveGround = 0;
    state.verticalVelocity = 0;
    state.grabAmount = 0;
    // Grant strictly ONE new Yeti for the next level, guarded idempotently
    if (!state.levelRewardGranted) {
      state.levelRewardGranted = true;
      state.unlockedFollowers = getFollowersForLevel(state.levelNumber) + 1;
    }
    state.outcomeSnapshot = {
      kind: 'victory',
      levelNumber: state.levelNumber,
      levelName: state.levelName,
      activeFollowers: state.followers.length,
      recruitedFollowers: 1,
      progressPct: 100,
      score: state.score,
      grabCount: state.grabCount,
      peakMultiplier: state.peakMultiplier,
    };
    events.becameVictory = true;
    return events;
  }

  // Check avalanche catch-up defeat — capture exact live level & follower snapshot (NEVER add recruit or advance level!)
  if (state.avalancheDistance <= 0) {
    state.avalancheDistance = 0;
    state.phase = 'gameover';
    const defeatProgressPct = Math.round(
      Math.max(0, Math.min(100, (state.distance / state.levelLength) * 100)),
    );
    state.outcomeSnapshot = {
      kind: 'gameover',
      levelNumber: state.levelNumber,
      levelName: state.levelName,
      activeFollowers: state.followers.length,
      recruitedFollowers: 0,
      progressPct: defeatProgressPct,
      score: state.score,
      grabCount: state.grabCount,
      peakMultiplier: state.peakMultiplier,
    };
    events.becameGameOver = true;
  }

  return events;
}

/** Build an integer-formatted HUD snapshot from live simulation state (or frozen outcome snapshot on Victory/Game Over). */
export function buildHudSnapshot(
  state: SimulationState,
  bestTimeSeconds: number | null,
  outcomeUi?: {
    victoryUiReady?: boolean;
    recruitJoinProgress?: number;
    gameoverUiReady?: boolean;
  },
): HudSnapshot {
  const outcome =
    (state.phase === 'victory' || state.phase === 'gameover') && state.outcomeSnapshot
      ? state.outcomeSnapshot
      : null;

  const activeLevelNumber = outcome ? outcome.levelNumber : state.levelNumber;
  const activeLevelName = outcome ? outcome.levelName : state.levelName;
  const activeFollowerCount = outcome ? outcome.activeFollowers : state.followers.length;
  const recruitedFollowers = outcome ? outcome.recruitedFollowers : 0;

  const progressPct = outcome
    ? outcome.progressPct
    : Math.round(Math.max(0, Math.min(100, (state.distance / state.levelLength) * 100)));
  const remainingMeters = Math.max(0, Math.round(state.levelLength - state.distance));
  const avalancheMeters = Math.max(0, Math.round(state.avalancheDistance));
  const avalancheDanger = Math.max(
    0,
    Math.min(1, 1 - state.avalancheDistance / SIM_CONFIG.avalancheStartDistance),
  );

  return {
    phase: state.phase,
    levelNumber: activeLevelNumber,
    totalLevels: state.totalLevels,
    levelName: activeLevelName,
    hasNextLevel: activeLevelNumber < state.totalLevels,
    progressPct,
    remainingMeters,
    avalancheMeters,
    avalancheDanger,
    elapsedSeconds: state.elapsedTime,
    speedKmh: Math.round(state.forwardSpeed * 2.2),
    hitCount: state.hitCount,
    hitFeedback: state.hitFlashTimer > 0,
    jumpState: state.jumpState,
    isGrabbing: state.jumpState === 'AIRBORNE' && state.grabAmount > 0.25,
    grabCount: outcome ? outcome.grabCount : state.grabCount,
    trickFeedbackActive: state.trickFeedbackTimer > 0,
    followerCount: activeFollowerCount,
    recruitedFollowers,
    unlockedFollowers: state.unlockedFollowers,
    victoryUiReady: Boolean(outcomeUi?.victoryUiReady),
    recruitJoinProgress: outcomeUi?.recruitJoinProgress ?? 0,
    gameoverUiReady: Boolean(outcomeUi?.gameoverUiReady),
    bestTimeSeconds,
    score: outcome ? outcome.score : state.score,
    collectedCollectibles: state.collectedCollectiblesCount,
    totalCollectibles: state.collectibles.length,
    scoreMultiplier: state.scoreMultiplier,
    peakMultiplier: outcome ? outcome.peakMultiplier : state.peakMultiplier,
    multiplierTimerRatio:
      state.scoreMultiplier > TRICK_CONFIG.minMultiplier
        ? Math.max(0, Math.min(1, state.multiplierTimer / TRICK_CONFIG.comboDurationSeconds))
        : 0,
    activeGrabLabel: getGrabStyleLabel(state.activeGrabStyle),
    lastTrickLabel: state.lastTrickLabel,
    lastTrickPoints: state.lastTrickPoints,
    lastScoreDelta: state.lastScoreDelta,
    scoreFeedbackActive: state.scoreFeedbackTimer > 0,
    isBraking: state.brakeAmount > 0.12,
    steepPhase: state.steepPhase,
    steepWarningActive: state.steepWarningActive,
    hasSteepDescent: Boolean(getLevelConfig(activeLevelNumber).steepDescents?.length),
  };
}

export interface CarveDustProfile {
  /** Whether snow dust particles should be emitted on this step. */
  active: boolean;
  /** Outward spray direction opposite to the turn (-1 = sprays left, +1 = sprays right). */
  sprayDir: number;
  /** Number of puffs/dust particles to spawn in this burst (0..10). */
  burstCount: number;
  /** Spawn interval in seconds (shorter when carving harder or braking). */
  cooldown: number;
  /** Normalized carving/braking strength in [0, 1]. */
  carveStrength: number;
}

/** Pure calculation of dynamic snow-spray emission from the snowboard edge — emits when carving OR braking on snow. */
export function computeCarveDustProfile(
  lean: number,
  forwardSpeed: number,
  jumpState: JumpState = 'GROUNDED',
  brakeAmount = 0,
): CarveDustProfile {
  if (forwardSpeed <= 5 || jumpState === 'AIRBORNE') {
    return {
      active: false,
      sprayDir: 0,
      burstCount: 0,
      cooldown: 0.1,
      carveStrength: 0,
    };
  }

  const absLean = Math.min(1, Math.abs(lean));
  const clampedBrake = Math.max(0, Math.min(1, brakeAmount));
  const speedFactor = Math.min(1.15, forwardSpeed / SIM_CONFIG.baseForwardSpeed);

  // Straight glide with zero brake: zero emission (snow spray triggers on turns, braking, or landing!)
  if (absLean < 0.12 && clampedBrake < 0.08) {
    return {
      active: false,
      sprayDir: 0,
      burstCount: 0,
      cooldown: 0.08,
      carveStrength: 0,
    };
  }

  const rawCarve =
    absLean >= 0.12 ? Math.min(1, ((absLean - 0.12) / 0.88) * speedFactor) : 0;
  const rawBrake =
    clampedBrake >= 0.08 ? Math.min(1, clampedBrake * Math.max(0.75, speedFactor)) : 0;
  const carveStrength = Math.max(rawCarve, rawBrake);
  const burstCount =
    3 + Math.round(carveStrength * 4) + (rawBrake > 0.1 ? Math.round(rawBrake * 3) : 0);
  const cooldown = Math.max(0.014, 0.038 - carveStrength * 0.022 - rawBrake * 0.004);
  const sprayDir =
    absLean >= 0.12 ? (lean > 0 ? -1 : 1) : -1;

  return {
    active: true,
    sprayDir,
    burstCount,
    cooldown,
    carveStrength,
  };
}
