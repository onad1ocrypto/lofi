import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  OUTCOME_ASSETS,
  buildOutcomeFollowerSlots,
  buildOutcomeOverlayModel,
} from './outcomeOverlayLogic';
import {
  UI_COPY,
  formatArrivalSummary,
  formatCrewStatus,
  formatGameOverLevelInfo,
  formatLevelStartCallout,
  formatLilYetiCount,
  formatNextLevelCrew,
  formatPauseSummary,
  hasRecruitJoined,
} from './uiCopy';
import {
  BGM_PLAYLIST,
  BGM_SECOND_TRACK_SRC,
  BGM_TRACK_SRC,
  SFX_CLIP_CONFIG,
  SFX_MIX_CONFIG,
  SFX_TRACK_SRCS,
  advanceBgmPlaylistOnEnded,
  computeActiveSfxDuck,
  computeBgmTargetVolume,
  computeSfxClipVolume,
  createBgmPlaylistState,
  getBgmTrackIndexForLevel,
  getNextBgmTrackIndex,
  getSfxClipConfig,
  resetBgmPlaylistState,
  shouldResetBgmOnPhaseChange,
} from './musicLogic';
import {
  PERIMETER_PINE_VARIANT_COUNT,
  PINE_VARIANT_PROFILES,
  ROCK_VARIANT_COUNT,
  TRACK_PINE_VARIANT_COUNT,
  pickPerimeterPineVariant,
  pickRockVariant,
  pickTrackPineVariant,
} from './alpinePropsLogic';
import { computeArenaDifficultyProfile } from './arenaDifficulty';
import {
  AVALANCHE_VISUAL_CONFIG,
  computeAvalanchePuffTransform,
  computeAvalancheVisualPose,
  createAvalanchePuffLayouts,
} from './avalancheVisualLogic';
import {
  BACKGROUND_MOUNTAIN_ARCHETYPES,
  BACKGROUND_MOUNTAIN_SPECS,
  computeMountainSurfaceColor,
  sampleMountainHeight,
} from './backgroundMountainLogic';
import {
  COLLECTIBLE_CONFIG,
  spawnLevelCollectibles,
} from './collectibleLogic';
import { LEVEL_CONFIGS, getFollowersForLevel } from './levels';
import {
  MINIMAP_VIEWBOX,
  buildMiniMapLayout,
  buildMiniMapSnapshot,
} from './miniMapLogic';
import {
  DEFAULT_SPAWN_SEED,
  buildLevelObstacles,
  isInsideRampSafetyZone,
  spawnTrackObstacles,
} from './obstacleSpawner';
import {
  computeCarvingCameraOutsideTarget,
  computeCarvingPassCenterOffset,
  computeCarvingPassCurvature,
  computeCarvingSpeedBleedRate,
  generateCarvingPassSnowMounds,
  getCarvingCurveOutsideSide,
} from './carvingPassLogic';
import {
  STEEP_DESCENT_CONFIG,
  computeSpeedSteerBalance,
  createSteepCameraRigState,
  evaluateFlatZoneAt,
  evaluateSteepDescentAt,
  resetSteepCameraRigState,
  stepSteepCameraRigState,
} from './steepDescentLogic';
import {
  TRICK_CONFIG,
  applyCollectibleMultiplier,
  evaluateTrickLanding,
  selectGrabTrickStyle,
  stepTrickMultiplierTimer,
} from './trickLogic';
import {
  SLOPE_GRADIENT,
  getLevelTrackProfile,
  getTrackCenterX,
  getTrackCenterXForLevel,
  getTrackElevationForLevel,
  getTrackHalfWidth,
  getTrackHalfWidthForLevel,
  getTrackPitchAt,
  measureLevelCurveMetrics,
  setActiveTrackProfile,
} from './trackData';
import {
  SHELTER_LAYOUT,
  computeArrivalCoastMeters,
  computeGreeterHopY,
  createShelterArrivalState,
  getArrivalPlazaDepth,
  resetShelterArrival,
  stepGameOverSequence,
  stepShelterArrival,
  triggerGameOverSequenceOnce,
  triggerShelterCelebrationOnce,
} from './shelterArrival';
import {
  DAILY_STREAK_FIRE_THRESHOLD,
  MAX_PROFILE_PAYLOAD_BYTES,
  SUI_BADGE_DEFINITIONS,
  applyDailyLoginToProfile,
  applyLevelCompletionToProfile,
  buildSuiProfileStorageKey,
  computeCalendarDayDelta,
  computeRecruitedLilYetis,
  createEmptySuiProfile,
  deriveBadgesForProgress,
  hasStreakFireBadge,
  isAllowedSuiRpcUrl,
  isValidSuiAddress,
  mergeSuiProfiles,
  normalizeSuiAddress,
  parseSuiProfilePayload,
  sanitizeWalletIconUrl,
  serializeSuiProfilePayload,
  shortenSuiAddress,
  toCalendarDateKey,
} from './suiProfileLogic';
import { saveWalletSuiProfile } from './suiWalletService';
import { SHELTER_ARCHITECTURE } from './shelterBuilder';
import { DAYLIGHT_RIG, FOG_CONFIG, SKY_PALETTE } from './skyDome';
import {
  SIM_CONFIG,
  advanceToNextLevel,
  buildHudSnapshot,
  computeCarveDustProfile,
  createInitialInput,
  createInitialSimulationState,
  evaluateRampSurface,
  resetSimulationState,
  retryCurrentLevel,
  samplePathAtTravelDistance,
  startNewGame,
  stepSimulation,
} from './simulation';
import {
  SNOWFALL_CONFIG,
  computeSnowfallTargets,
  stepSnowflakePosition,
  wrapSnowflakeCoord,
} from './snowfallLogic';
import {
  TRAIL_CONFIG,
  computeTrailNodeAlpha,
  computeTrailStyle,
  createSnowTrailBuffer,
  pushTrailSample,
  resetTrailBuffer,
  stepTrailBuffer,
} from './snowTrailLogic';
import {
  computeAmbientAudioTargets,
  fillAlpineWindSamples,
  fillSnowCrunchSamples,
  fillSnowFrictionSamples,
} from './ambientAudioLogic';
import {
  clearHeldActionKeyTracker,
  clearKeyboardSteerTracker,
  computeDragRangePixels,
  computeDragSteerNormalized,
  computeEdgeEscapeVelocity,
  computeLevelSteeringProfile,
  createHeldActionKeyTracker,
  createKeyboardSteerTracker,
  pressActionKey,
  pressSteerKey,
  releaseActionKey,
  releaseSteerKey,
  stepDragSteer,
} from './controlLogic';
import {
  PARTICLE_KIND,
  SNOW_PARTICLE_PHYSICS,
  computeInstancedSnowScale,
  sampleAlpineWind,
  sampleCollisionSurfaceHeight,
  sampleCollisionSurfaceNormal,
  stepSnowParticlePhysics,
  type ParticleKinematics,
  type ParticleStepResult,
} from './snowParticlePhysics';
import {
  CAMERA_SWAY_CONFIG,
  computeCameraSwayTarget,
  createCameraSwayState,
  stepCameraSway,
} from './cameraSwayLogic';
import {
  WIND_GUST_CONFIG,
  computeWindGustCameraShake,
  computeWindGustParticlePush,
  createWindGustState,
  getWindGustSteeringAccel,
  stepWindGust,
} from './windGustLogic';
import {
  DYNAMIC_FOG_CONFIG,
  computeDynamicFogTargets,
  computeMountainAltitudeFactor,
  createDynamicFogState,
  getBlizzardZonesForLevel,
  sampleBlizzardSectionIntensity,
  stepDynamicFogState,
} from './dynamicFogLogic';

test('opening runway is completely clear so player survives initial seconds without input', () => {
  const state = createInitialSimulationState('playing');
  const input = createInitialInput();

  // Simulate 4.2 seconds with zero input
  for (let i = 0; i < 84; i++) {
    const ev = stepSimulation(state, input, 0.05);
    assert.equal(ev.collidedObstacle, null, 'No collision should occur in opening seconds');
    assert.equal(state.phase, 'playing');
  }
  assert.ok(state.distance > 100, 'Player should glide downhill automatically');
  assert.ok(state.avalancheDistance >= SIM_CONFIG.avalancheStartDistance, 'Avalanche stays at safe margin at cruise speed');
});

test('organic obstacle spawner produces varied pine & rock scales/rotations and passable gaps >= 4.5m across seeds', () => {
  const seeds = [DEFAULT_SPAWN_SEED, 101, 202, 303, 404, 505, 777, 1337, 4242, 9999, 54321, 88888];

  for (const seed of seeds) {
    const obstacles = spawnTrackObstacles(seed);
    const pines = obstacles.filter((o) => o.kind === 'pine');
    const rocks = obstacles.filter((o) => o.kind === 'rock');

    assert.ok(obstacles.length >= 45, `Seed ${seed}: expected rich obstacle density, got ${obstacles.length}`);
    assert.ok(pines.length >= 15, `Seed ${seed}: expected ample pine trees, got ${pines.length}`);
    assert.ok(rocks.length >= 15, `Seed ${seed}: expected ample rocks, got ${rocks.length}`);

    const scales = obstacles.map((o) => o.scale);
    const rotYs = obstacles.map((o) => o.rotationY);
    assert.ok(
      Math.max(...scales) - Math.min(...scales) >= 0.35,
      `Seed ${seed}: expected organic scale spread >= 0.35`,
    );
    assert.ok(
      Math.max(...rotYs) - Math.min(...rotYs) >= Math.PI,
      `Seed ${seed}: expected wide random rotation spread`,
    );

    for (let i = 0; i < obstacles.length; i++) {
      const zRef = obstacles[i].z;
      const halfW = getTrackHalfWidth(zRef) - SIM_CONFIG.edgePadding;
      const windowObs = obstacles.filter((o) => Math.abs(o.z - zRef) <= 8);

      const intervals = windowObs
        .map((o) => ({
          start: o.offsetX - o.radius - SIM_CONFIG.playerRadius,
          end: o.offsetX + o.radius + SIM_CONFIG.playerRadius,
        }))
        .sort((a, b) => a.start - b.start);

      let cursor = -halfW;
      let maxGap = 0;
      for (const seg of intervals) {
        if (seg.start > cursor) {
          maxGap = Math.max(maxGap, seg.start - cursor);
        }
        cursor = Math.max(cursor, seg.end);
      }
      if (halfW > cursor) {
        maxGap = Math.max(maxGap, halfW - cursor);
      }

      assert.ok(
        maxGap >= 4.5,
        `Seed ${seed}: passable gap at z=${zRef.toFixed(1)}m was only ${maxGap.toFixed(2)}m (expected >= 4.5m)`,
      );
    }
  }

  const runA = spawnTrackObstacles(101);
  const runB = spawnTrackObstacles(202);
  const differs = runA.some(
    (o, idx) => !runB[idx] || Math.abs(o.offsetX - runB[idx].offsetX) > 0.25,
  );
  assert.equal(differs, true, 'Different spawn seeds should generate distinct obstacle layouts');
});

test('continuous lateral steering accelerates, damps on release, and clamps to track edges', () => {
  const state = createInitialSimulationState('playing');
  const input = createInitialInput();

  input.right = true;
  for (let i = 0; i < 7; i++) {
    stepSimulation(state, input, 0.05);
  }
  const speedBeforeRelease = Math.abs(state.lateralVelocity);
  assert.ok(speedBeforeRelease > 4, 'Steering right accelerates lateral velocity');

  input.right = false;
  for (let i = 0; i < 10; i++) {
    stepSimulation(state, input, 0.05);
  }
  assert.ok(
    Math.abs(state.lateralVelocity) < speedBeforeRelease * 0.15,
    'Lateral velocity damps smoothly after releasing input',
  );

  input.right = true;
  for (let i = 0; i < 40; i++) {
    stepSimulation(state, input, 0.05);
  }
  assert.ok(state.lateralOffset > 5, 'Sustained steering moves Lofi toward right bank');
  assert.ok(
    state.lateralOffset <= getTrackHalfWidth(state.distance) - SIM_CONFIG.edgePadding + 1e-6,
    'Lateral offset stays within snowbank boundary',
  );
});

test('collision slows Lofi once, grants invulnerability, never double-counts, and never removes followers', () => {
  // Level 3 starts with strictly 2 followers (levelNumber - 1)
  const state = createInitialSimulationState('playing', undefined, 3);
  const input = createInitialInput();
  assert.equal(state.followers.length, 2);

  const target = state.obstacles[0];
  state.distance = target.z - 0.5;
  state.lateralOffset = target.offsetX;

  const firstStep = stepSimulation(state, input, 0.02);
  assert.equal(firstStep.collidedObstacle?.id, target.id);
  assert.equal(state.hitCount, 1);
  assert.equal(target.hit, true);
  assert.ok(state.forwardSpeed <= state.levelBaseSpeed - SIM_CONFIG.hitSpeedDrop + 0.5);
  assert.ok(state.invulnTimer > 1.0);
  assert.equal(state.followers.length, 2, 'Obstacle collision on Lofi must never remove followers');

  state.distance = target.z;
  state.lateralOffset = target.offsetX;
  const secondStep = stepSimulation(state, input, 0.02);
  assert.equal(secondStep.collidedObstacle, null);
  assert.equal(state.hitCount, 1);
  assert.equal(state.followers.length, 2);
});

test('repeated slowdowns cause the avalanche to catch Lofi and trigger gameover', () => {
  const state = createInitialSimulationState('playing');
  const input = createInitialInput();

  let lost = false;
  for (let i = 0; i < 200; i++) {
    state.forwardSpeed = SIM_CONFIG.hitSlowSpeed;
    state.slowdownTimer = 0.5;
    const ev = stepSimulation(state, input, 0.05);
    if (ev.becameGameOver) {
      lost = true;
      break;
    }
  }
  assert.equal(lost, true, 'Avalanche should catch player if slowed down repeatedly');
  assert.equal(state.phase, 'gameover');
  assert.equal(state.avalancheDistance, 0);
});

test('snow spray emits strictly when turning on snow (zero when straight or airborne) and sprays opposite the turn', () => {
  const straight = computeCarveDustProfile(0, SIM_CONFIG.baseForwardSpeed, 'GROUNDED');
  const airborne = computeCarveDustProfile(0.9, SIM_CONFIG.baseForwardSpeed, 'AIRBORNE');
  const rightCarve = computeCarveDustProfile(0.85, SIM_CONFIG.baseForwardSpeed, 'GROUNDED');
  const leftCarve = computeCarveDustProfile(-0.85, SIM_CONFIG.baseForwardSpeed, 'GROUNDED');

  assert.equal(straight.active, false, 'Straight gliding must emit zero snow spray');
  assert.equal(straight.burstCount, 0);
  assert.equal(airborne.active, false, 'Airborne riding must emit zero carving spray');
  assert.equal(airborne.burstCount, 0);

  assert.equal(rightCarve.active, true);
  assert.equal(rightCarve.sprayDir, -1, 'Turning right sprays snow dust to the left (outer edge)');
  assert.equal(leftCarve.active, true);
  assert.equal(leftCarve.sprayDir, 1, 'Turning left sprays snow dust to the right (outer edge)');
  assert.ok(rightCarve.burstCount >= 3, 'Carving emits visible snow spray burst');
  assert.ok(rightCarve.cooldown < 0.04, 'Hard carving emits rapid spray bursts');
});

test('strict formula: active followers equal (levelNumber - 1) across all 10 levels with zero mid-track pickups', () => {
  assert.equal(LEVEL_CONFIGS.length, 10);
  for (let lv = 1; lv <= 10; lv++) {
    assert.equal(getFollowersForLevel(lv), lv - 1);
  }

  // Level 1: starts solo (0 followers), zero pickups across entire track, reaches shelter alone
  const state = createInitialSimulationState('playing', undefined, 1);
  const input = createInitialInput();

  assert.equal(state.levelNumber, 1);
  assert.equal(state.followers.length, 0, 'Level 1 must start with 0 followers');
  assert.equal(state.unlockedFollowers, 0);
  assert.equal('strandedYetis' in state, false, 'Mid-track strandedYetis must not exist in state');

  // Ride all the way across Level 1, steering across lanes -> followers MUST stay strictly 0
  let ticks = 0;
  while (state.phase === 'playing' && ticks < 2000) {
    // Dodge any obstacle directly ahead so Lofi reaches the shelter cleanly
    state.invulnTimer = 0.5;
    input.left = ticks % 40 < 15;
    input.right = ticks % 40 >= 20 && ticks % 40 < 35;
    stepSimulation(state, input, 0.05);
    assert.equal(state.followers.length, 0, 'Level 1 must have 0 followers throughout the entire track');
    ticks++;
  }

  assert.equal(state.phase, 'victory', 'Level 1 must finish immediately upon crossing shelter line alone');
  assert.equal(state.followers.length, 0, 'Hero arrives at Level 1 finish alone (0 active followers)');
  assert.equal(state.levelRewardGranted, true);
  assert.equal(state.unlockedFollowers, 1, 'Exactly ONE new Yeti joins at shelter after Level 1');

  const lv1WinHud = buildHudSnapshot(state, null);
  assert.equal(lv1WinHud.followerCount, 0);
  assert.equal(lv1WinHud.unlockedFollowers, 1);

  // Extra step calls during victory must be no-ops (never double-grant Yeti)
  stepSimulation(state, input, 0.05);
  assert.equal(state.unlockedFollowers, 1);
});

test('level progression 1 -> 2 -> 3 strictly follows (levelNumber - 1) and is idempotent against repeated clicks', () => {
  const state = createInitialSimulationState('playing', undefined, 1);
  const input = createInitialInput();

  // Calling advanceToNextLevel BEFORE winning must be ignored
  assert.equal(advanceToNextLevel(state), false);
  assert.equal(state.levelNumber, 1);
  assert.equal(state.followers.length, 0);

  // Finish Level 1 alone
  state.distance = state.levelLength - 0.5;
  const lv1Win = stepSimulation(state, input, 0.05);
  assert.equal(lv1Win.becameVictory, true);
  assert.equal(state.phase, 'victory');
  assert.equal(state.followers.length, 0);
  assert.equal(state.unlockedFollowers, 1);

  // Advance to Level 2 -> strictly 1 follower behind Lofi from start
  assert.equal(advanceToNextLevel(state), true);
  assert.equal(state.phase, 'playing');
  assert.equal(state.levelNumber, 2);
  assert.equal(state.followers.length, 1, 'Level 2 must start with exact 1 follower');
  assert.ok(state.followers[0].distance < 0, 'Level 2 follower starts staged behind Lofi');

  // Repeated button press / call to advanceToNextLevel right after transitioning MUST NOT skip to Level 3 or add Yetis!
  assert.equal(advanceToNextLevel(state), false);
  assert.equal(state.levelNumber, 2);
  assert.equal(state.followers.length, 1);

  // Finish Level 2 with 1 follower
  state.distance = state.levelLength - 0.5;
  const lv2Win = stepSimulation(state, input, 0.05);
  assert.equal(lv2Win.becameVictory, true);
  assert.equal(state.phase, 'victory');
  assert.equal(state.followers.length, 1);
  assert.equal(state.unlockedFollowers, 2, 'Exactly ONE additional Yeti joins at Level 2 shelter (total 2 for Level 3)');

  // Advance to Level 3 -> strictly 2 followers behind Lofi from start
  assert.equal(advanceToNextLevel(state), true);
  assert.equal(state.phase, 'playing');
  assert.equal(state.levelNumber, 3);
  assert.equal(state.followers.length, 2, 'Level 3 must start with exact 2 followers');
  assert.ok(state.followers[0].distance < 0);
  assert.ok(state.followers[1].distance < state.followers[0].distance);

  // Repeated advance call ignored
  assert.equal(advanceToNextLevel(state), false);
  assert.equal(state.levelNumber, 3);
  assert.equal(state.followers.length, 2);

  // Finish Level 3 -> advances cleanly all the way through Level 10 (9 Lil Yetis)
  for (let lv = 3; lv <= 10; lv++) {
    assert.equal(state.levelNumber, lv);
    assert.equal(state.followers.length, lv - 1, `Level ${lv} must have exact ${lv - 1} Lil Yetis`);
    state.distance = state.levelLength - 0.5;
    const winEv = stepSimulation(state, input, 0.05);
    assert.equal(winEv.becameVictory, true, `Level ${lv} should complete cleanly`);
    assert.equal(state.unlockedFollowers, lv);
    if (lv < 10) {
      assert.equal(advanceToNextLevel(state), true, `Should advance from Level ${lv} to ${lv + 1}`);
      assert.equal(advanceToNextLevel(state), false, 'Repeated advance right after transition must be ignored');
    } else {
      assert.equal(advanceToNextLevel(state), false, 'No Level 11 -> advance returns false cleanly');
      assert.equal(state.levelNumber, 10);
    }
  }
});

test('retry never adds Yetis, pause freezes state, and New Game resets to Level 1 with 0 followers', () => {
  const state = createInitialSimulationState('playing', undefined, 2);
  const input = createInitialInput();

  assert.equal(state.levelNumber, 2);
  assert.equal(state.followers.length, 1);

  // Ride a bit then pause -> verify pause strictly freezes distance, elapsedTime, and follower coordinates
  for (let i = 0; i < 10; i++) {
    stepSimulation(state, input, 0.05);
  }
  state.phase = 'paused';
  const frozenDist = state.distance;
  const frozenTime = state.elapsedTime;
  const frozenFollowerDist = state.followers[0].distance;
  stepSimulation(state, input, 0.05);
  assert.equal(state.distance, frozenDist);
  assert.equal(state.elapsedTime, frozenTime);
  assert.equal(state.followers[0].distance, frozenFollowerDist);

  // Win Level 2 (unlockedFollowers becomes 2), then RETRY Level 2 -> MUST stay at 1 follower (never add Yeti!)
  state.phase = 'playing';
  state.distance = state.levelLength - 0.5;
  stepSimulation(state, input, 0.05);
  assert.equal(state.phase, 'victory');
  assert.equal(state.unlockedFollowers, 2);

  retryCurrentLevel(state, 'playing');
  assert.equal(state.levelNumber, 2);
  assert.equal(state.followers.length, 1, 'Retry Level 2 must keep strictly 1 follower');
  assert.equal(state.unlockedFollowers, 1);
  assert.equal(state.levelRewardGranted, false);

  // Repeated retries via resetSimulationState never add Yetis
  resetSimulationState(state, 'playing');
  assert.equal(state.levelNumber, 2);
  assert.equal(state.followers.length, 1);

  // New Game always starts at Level 1 with 0 followers
  startNewGame(state, 'playing');
  assert.equal(state.levelNumber, 1);
  assert.equal(state.followers.length, 0, 'New Game must start at Level 1 with 0 followers');
  assert.equal(state.unlockedFollowers, 0);
});

test('followers trace distance-indexed curved path history without cutting corners or stacking', () => {
  // Level 3 provides 2 followers from start to validate curved spacing & slowdown stability
  const state = createInitialSimulationState('playing', undefined, 3);
  const input = createInitialInput();
  assert.equal(state.followers.length, 2);

  // Carve sharply right for 0.8s, then sharply left for 0.8s
  input.right = true;
  for (let i = 0; i < 16; i++) {
    stepSimulation(state, input, 0.05);
  }
  const peakRightTravel = state.travelDistance;
  const peakRightX = getTrackCenterX(state.distance) + state.lateralOffset;

  input.right = false;
  input.left = true;
  for (let i = 0; i < 16; i++) {
    stepSimulation(state, input, 0.05);
  }

  const historicSample = samplePathAtTravelDistance(state.pathHistory, peakRightTravel);
  assert.ok(
    Math.abs(historicSample.worldX - peakRightX) < 0.75,
    'Distance-indexed path history should faithfully preserve curved excursion X',
  );

  for (let i = 0; i < 12; i++) {
    stepSimulation(state, input, 0.05);
  }

  // Verify the 2 followers maintain distinct non-overlapping spacing (~2.55m)
  const sep1 = Math.hypot(
    state.followers[0].worldX - state.followers[1].worldX,
    state.followers[0].distance - state.followers[1].distance,
  );
  assert.ok(
    sep1 >= SIM_CONFIG.followerSpacing * 0.82 && sep1 <= SIM_CONFIG.followerSpacing * 1.18,
    `Followers spacing was ${sep1.toFixed(2)}m (expected ~${SIM_CONFIG.followerSpacing}m, never stacked)`,
  );

  // Slow Lofi down sharply and verify spacing remains stable (arc-length indexed, not time-indexed)
  state.forwardSpeed = SIM_CONFIG.hitSlowSpeed;
  state.slowdownTimer = 0.8;
  input.left = false;
  for (let i = 0; i < 10; i++) {
    stepSimulation(state, input, 0.05);
  }
  const sepSlow = Math.hypot(
    state.followers[0].worldX - state.followers[1].worldX,
    state.followers[0].distance - state.followers[1].distance,
  );
  assert.ok(
    sepSlow >= SIM_CONFIG.followerSpacing * 0.8,
    `Followers must not pile up during slowdown (got ${sepSlow.toFixed(2)}m)`,
  );
});

test('shelter layout gives spacious obstacle-free arrival plaza, oversized doorway, and side-only welcoming NPCs', () => {
  // Door must be clearly taller & wider than Lofi (~1.0m wide x 1.85m tall)
  assert.ok(SHELTER_LAYOUT.doorWidth >= 3.0, 'Shelter doorway must be wider than hero');
  assert.ok(SHELTER_LAYOUT.doorHeight >= 3.6, 'Shelter doorway must be taller than hero');

  // Arrival plaza between checkered finish line and cabin front wall must give ample stopping space
  const plazaDepth = getArrivalPlazaDepth();
  assert.ok(plazaDepth >= 14, `Expected arrival plaza >= 14m, got ${plazaDepth}m`);
  assert.ok(
    computeArrivalCoastMeters(1) < plazaDepth - 6,
    'Hero coast stop must remain comfortably clear of the shelter front wall',
  );

  // All welcoming NPCs must stand strictly past the finish line and outside the central arrival lane
  assert.ok(SHELTER_LAYOUT.greeterSlots.length >= 2);
  for (const slot of SHELTER_LAYOUT.greeterSlots) {
    assert.ok(slot.offsetFromFinishZ > 4, 'Welcoming NPC must never stand mid-track');
    assert.ok(slot.offsetFromFinishZ < plazaDepth - 2, 'Welcoming NPC must not clip cabin front wall');
    assert.ok(Math.abs(slot.offsetX) >= 5.5, 'Welcoming NPC must flank the sides, leaving center arrival clear');
  }

  // Verify no obstacles spawn near the finish line or shelter approach across all levels
  for (const level of LEVEL_CONFIGS) {
    const obstacles = spawnTrackObstacles(level.spawnSeed, {
      levelLength: level.length,
      densityScale: level.densityScale,
    });
    const lastObsZ = obstacles.length > 0 ? obstacles[obstacles.length - 1].z : 0;
    assert.ok(
      level.length - lastObsZ >= 80,
      `Level ${level.levelNumber}: approach before finish must stay clear of rocks & pines`,
    );
  }
});

test('shelter NPC celebration triggers strictly once per finish, resets on retry, and hops never penetrate ground', () => {
  const arrival = createShelterArrivalState();
  assert.equal(arrival.celebrating, false);
  assert.equal(computeGreeterHopY(arrival.celebrating, arrival.celebrationTime, 0), 0);

  // First trigger succeeds; repeated trigger calls are idempotent no-ops
  assert.equal(triggerShelterCelebrationOnce(arrival), true);
  assert.equal(arrival.celebrating, true);
  assert.equal(triggerShelterCelebrationOnce(arrival), false);
  assert.equal(triggerShelterCelebrationOnce(arrival), false);

  // Step through a full celebration cycle -> hop offset must NEVER go negative (zero foot-ground clipping)
  let maxHop = 0;
  for (let i = 0; i < 60; i++) {
    stepShelterArrival(arrival, 0.05);
    for (const slot of SHELTER_LAYOUT.greeterSlots) {
      const y = computeGreeterHopY(arrival.celebrating, arrival.celebrationTime, slot.phaseOffset);
      assert.ok(y >= 0, `Greeter hop Y must never be negative (got ${y})`);
      maxHop = Math.max(maxHop, y);
    }
  }
  assert.ok(maxHop > 0.3, 'Celebrating greeters should perform a visible joyful hop');
  assert.equal(arrival.arrivalGlideProgress, 1);

  // Retry resets celebration animation cleanly back to idle and allows re-triggering on next finish
  resetShelterArrival(arrival);
  assert.equal(arrival.celebrating, false);
  assert.equal(arrival.triggeredOnce, false);
  assert.equal(arrival.celebrationTime, 0);
  assert.equal(arrival.arrivalGlideProgress, 0);
  assert.equal(computeGreeterHopY(arrival.celebrating, arrival.celebrationTime, 0), 0);
  assert.equal(triggerShelterCelebrationOnce(arrival), true);
});

test('Levels 1, 2, and 3 have genuinely distinct arena curves, widths, ramps, and clear landing zones', () => {
  const [lv1, lv2, lv3] = LEVEL_CONFIGS;

  // Verify curve centerlines diverge materially across levels (not identical tracks!)
  let diff12 = 0;
  let diff23 = 0;
  let diff13 = 0;
  for (let z = 140; z <= 760; z += 40) {
    const x1 = getTrackCenterXForLevel(1, z);
    const x2 = getTrackCenterXForLevel(2, z);
    const x3 = getTrackCenterXForLevel(3, z);
    diff12 = Math.max(diff12, Math.abs(x1 - x2));
    diff23 = Math.max(diff23, Math.abs(x2 - x3));
    diff13 = Math.max(diff13, Math.abs(x1 - x3));
  }
  assert.ok(diff12 >= 8, `Expected distinct curve between Lv1 and Lv2 (max diff ${diff12.toFixed(1)}m)`);
  assert.ok(diff23 >= 8, `Expected distinct curve between Lv2 and Lv3 (max diff ${diff23.toFixed(1)}m)`);
  assert.ok(diff13 >= 8, `Expected distinct curve between Lv1 and Lv3 (max diff ${diff13.toFixed(1)}m)`);

  // Verify progressive width narrowing across Levels 1..10 + Level 3 wide dual-route split bowl
  const w1 = getTrackHalfWidthForLevel(1, 240);
  const w2 = getTrackHalfWidthForLevel(2, 240);
  const w3Regular = getTrackHalfWidthForLevel(3, 240);
  const w3Split = getTrackHalfWidthForLevel(3, 505);
  const w10Regular = getTrackHalfWidthForLevel(10, 240);
  assert.ok(w1 > w2 && w2 > w3Regular && w3Regular > w10Regular, `Expected progressive narrowing Lv1 (${w1}) > Lv2 (${w2}) > Lv3 (${w3Regular}) > Lv10 (${w10Regular})`);
  assert.ok(w3Split >= w3Regular + 4.5, `Expected Level 3 split bowl to widen substantially (${w3Split.toFixed(1)}m)`);

  // Verify ramp progression across levels
  assert.equal(lv1.ramps.length, 1, 'Level 1 should have 1 optional introductory ramp');
  assert.equal(lv1.ramps[0].kind, 'small');
  assert.equal(lv2.ramps.length, 2, 'Level 2 should have 2 ramps');
  assert.equal(lv3.ramps.length, 2, 'Level 3 should have 2 ramps including the bonus split-lane ramp');
  assert.ok(lv3.ramps.some((r) => r.kind === 'bonus'), 'Level 3 should include a bonus ramp lane');

  // Verify zero obstacles encroach into any ramp approach or landing runway across all 10 levels
  for (const level of LEVEL_CONFIGS) {
    setActiveTrackProfile(level.levelNumber);
    const obstacles = buildLevelObstacles(level, level.spawnSeed);
    for (const obs of obstacles) {
      assert.equal(
        isInsideRampSafetyZone(level.ramps, obs.z, obs.offsetX, obs.radius),
        false,
        `Level ${level.levelNumber}: obstacle at z=${obs.z.toFixed(1)}, x=${obs.offsetX.toFixed(1)} violates ramp landing zone`,
      );
    }
    // Ensure no ramp sits near the finish line / shelter
    for (const ramp of level.ramps) {
      assert.ok(
        level.length - (ramp.zStart + ramp.length) >= 160,
        `Level ${level.levelNumber}: ramp ${ramp.id} must stay well clear of the finish shelter`,
      );
    }

    // Level 3 must preserve its central split-route pine/rock divider between Safe Left & Bonus Right lanes
    if (level.levelNumber === 3) {
      const dividerObs = obstacles.filter(
        (o) => o.z >= 440 && o.z <= 555 && Math.abs(o.offsetX) <= 2.2,
      );
      assert.ok(
        dividerObs.length >= 5,
        `Level 3 split divider must spawn intact (found ${dividerObs.length} divider obstacles)`,
      );
    }
  }
});

test('snow ramp jump state machine transitions GROUNDED -> AIRBORNE -> LANDING -> GROUNDED with real vertical height and damped air steer', () => {
  const state = createInitialSimulationState('playing', undefined, 1);
  const input = createInitialInput();
  const ramp = state.ramps[0];
  assert.ok(ramp, 'Level 1 must have intro ramp');

  // Stage Lofi directly approaching the ramp aligned with ramp centerline
  state.distance = ramp.zStart - 4;
  state.travelDistance = state.distance;
  state.lateralOffset = ramp.offsetX;

  let sawRampDeck = false;
  let sawTakeoff = false;
  let sawAirborne = false;
  let sawLanding = false;
  let returnedGrounded = false;
  let maxHeight = 0;

  // Test normal jump WITHOUT holding Grab -> must still jump & land cleanly
  for (let i = 0; i < 80; i++) {
    const ev = stepSimulation(state, input, 0.03);
    if (state.jumpState === 'GROUNDED' && state.heightAboveGround > 0.25) {
      sawRampDeck = true;
    }
    if (ev.tookOff) sawTakeoff = true;
    if (state.jumpState === 'AIRBORNE') {
      sawAirborne = true;
      maxHeight = Math.max(maxHeight, state.heightAboveGround);
    }
    if (ev.landed) {
      sawLanding = true;
      assert.equal(state.jumpState, 'LANDING');
      assert.equal(ev.landedGrabTrick, false, 'Normal jump without Grab must not award Grab trick');
    }
    if (sawLanding && state.jumpState === 'GROUNDED') {
      returnedGrounded = true;
      break;
    }
  }

  assert.equal(sawRampDeck, true, 'Rider should smoothly climb the snow ramp deck');
  assert.equal(sawTakeoff, true, 'Crossing ramp lip should trigger automatic takeoff');
  assert.equal(sawAirborne, true, 'Jump should enter AIRBORNE state');
  assert.ok(maxHeight > ramp.height + 1.0, `Expected real vertical jump arc > ramp height (got ${maxHeight.toFixed(2)}m)`);
  assert.equal(sawLanding, true, 'Jump should touch down into LANDING state');
  assert.equal(returnedGrounded, true, 'LANDING knee-bend state should recover cleanly back to GROUNDED');
  assert.equal(state.grabCount, 0);

  // Verify airborne steering is active yet strictly damped compared to grounded steering
  const groundState = createInitialSimulationState('playing', undefined, 1);
  const airState = createInitialSimulationState('playing', undefined, 1);
  airState.jumpState = 'AIRBORNE';
  airState.heightAboveGround = 3.0;
  airState.verticalVelocity = 5.0;

  const steerInput = createInitialInput();
  steerInput.right = true;
  for (let i = 0; i < 5; i++) {
    stepSimulation(groundState, steerInput, 0.03);
    stepSimulation(airState, steerInput, 0.03);
  }
  assert.ok(airState.lateralVelocity > 1.0, 'Airborne lateral steering should remain active');
  assert.ok(
    airState.lateralVelocity < groundState.lateralVelocity * 0.65,
    `Airborne steering (${airState.lateralVelocity.toFixed(2)}) must be limited vs ground (${groundState.lateralVelocity.toFixed(2)})`,
  );
});

test('height-aware collision clears low boulders when airborne high enough, while low height or tall pines still collide', () => {
  const state = createInitialSimulationState('playing', undefined, 2);
  const input = createInitialInput();

  const lowRock = state.obstacles.find((o) => o.kind === 'rock');
  const tallPine = state.obstacles.find((o) => o.kind === 'pine');
  assert.ok(lowRock && tallPine, 'Level 2 must include both rocks and pine trees');

  // 1. Sailing high above a low rock -> clears cleanly with zero hit!
  state.distance = lowRock.z - 0.5;
  state.lateralOffset = lowRock.offsetX;
  state.jumpState = 'AIRBORNE';
  state.heightAboveGround = lowRock.clearanceHeight + 1.2;
  state.verticalVelocity = 2.0;

  const overRockEv = stepSimulation(state, input, 0.03);
  assert.equal(overRockEv.collidedObstacle, null, 'High airborne rider should clear low rock underneath');
  assert.equal(state.hitCount, 0);
  assert.equal(lowRock.hit, false);

  // 2. Passing through a tall pine at medium height (< pine clearanceHeight) -> still collides fairly!
  state.distance = tallPine.z - 0.5;
  state.lateralOffset = tallPine.offsetX;
  state.jumpState = 'AIRBORNE';
  state.heightAboveGround = 2.0;
  state.verticalVelocity = 1.0;

  const intoPineEv = stepSimulation(state, input, 0.03);
  assert.equal(intoPineEv.collidedObstacle?.id, tallPine.id, 'Tall pine tree must still collide when below treetop');
  assert.equal(state.hitCount, 1);
});

test('Grab trick activates only while AIRBORNE, releases smoothly, and increments count strictly once upon LANDING', () => {
  const state = createInitialSimulationState('playing', undefined, 1);
  const input = createInitialInput();

  // Holding Grab on snow while GROUNDED must NOT engage Grab or increment count
  input.grab = true;
  for (let i = 0; i < 10; i++) {
    stepSimulation(state, input, 0.03);
  }
  assert.equal(state.grabAmount, 0, 'Grab must not activate while grounded');
  assert.equal(state.grabCount, 0);

  // Stage approach into Level 1 intro ramp
  const ramp = state.ramps[0];
  state.distance = ramp.zStart - 3;
  state.travelDistance = state.distance;
  state.lateralOffset = ramp.offsetX;
  input.grab = false;

  // Ride until takeoff
  for (let i = 0; i < 40; i++) {
    const ev = stepSimulation(state, input, 0.025);
    if (ev.tookOff) break;
  }
  assert.equal(state.jumpState, 'AIRBORNE');

  // Hold Grab mid-air for ~0.25s -> grabAmount rises cleanly, grabCount STILL 0 in mid-air!
  input.grab = true;
  for (let i = 0; i < 10; i++) {
    const ev = stepSimulation(state, input, 0.025);
    assert.equal(ev.landedGrabTrick, false, 'Grab reward must NEVER fire in mid-air');
    assert.equal(state.grabCount, 0, 'grabCount must remain 0 until clean landing');
  }
  assert.ok(state.grabAmount > 0.7, `Grab pose blend should be clearly active in air (got ${state.grabAmount.toFixed(2)})`);

  // Release Grab before touchdown -> smoothly returns toward landing stance
  input.grab = false;
  let grabAwardEvents = 0;
  let preLandGrabAmount = state.grabAmount;
  for (let i = 0; i < 50; i++) {
    const ev = stepSimulation(state, input, 0.025);
    if (state.jumpState === 'AIRBORNE') {
      assert.ok(state.grabAmount <= preLandGrabAmount + 1e-6, 'Grab pose should release smoothly toward neutral');
      preLandGrabAmount = state.grabAmount;
    }
    if (ev.landedGrabTrick) {
      grabAwardEvents += 1;
    }
    if (ev.landed) break;
  }

  assert.equal(grabAwardEvents, 1, 'Grab trick must be awarded strictly once on successful landing');
  assert.equal(state.grabCount, 1);
  assert.ok(state.trickFeedbackTimer > 0.8);
});

test('Level 3 followers jump sequentially after Lofi at the ramp lip (never simultaneously) and land cleanly', () => {
  const state = createInitialSimulationState('playing', undefined, 3);
  const input = createInitialInput();
  assert.equal(state.followers.length, 2, 'Level 3 starts with strictly 2 followers');

  const bonusRamp = state.ramps[0];
  assert.equal(bonusRamp.kind, 'bonus');

  // Stage Lofi + pre-seeded trail directly approaching Level 3's Bonus Ramp lane
  const startZ = bonusRamp.zStart - 12;
  state.distance = startZ;
  state.travelDistance = startZ;
  state.lateralOffset = bonusRamp.offsetX;
  state.pathHistory = [];
  for (let d = startZ - 20; d <= startZ; d += 0.35) {
    const wx = getTrackCenterX(d) + bonusRamp.offsetX;
    state.pathHistory.push({
      travelDistance: d,
      distance: d,
      worldX: wx,
      worldY: 0,
      heightAboveGround: 0,
      jumpState: 'GROUNDED',
      landingProgress: 0,
      rampPitch: 0,
      grabAmount: 0,
      yaw: 0,
      lean: 0,
      brakeAmount: 0,
      slopePitch: -Math.atan(SLOPE_GRADIENT),
    });
  }

  let heroTakeoffStep = -1;
  let f0AirborneStep = -1;
  let f1AirborneStep = -1;
  let f0PeakHeight = 0;
  let f1PeakHeight = 0;
  let f0MaxGrab = 0;

  for (let step = 0; step < 120; step++) {
    // Hold Grab briefly while hero is mid-air so followers also mimic Grab sequentially
    input.grab = state.jumpState === 'AIRBORNE' && state.verticalVelocity > -2;
    const ev = stepSimulation(state, input, 0.025);

    if (ev.tookOff && heroTakeoffStep < 0) {
      heroTakeoffStep = step;
      // At the exact instant hero takes off, neither follower should already be airborne!
      assert.notEqual(
        state.followers[0].jumpState,
        'AIRBORNE',
        'Follower 1 must NOT jump simultaneously with hero at hero takeoff',
      );
      assert.notEqual(
        state.followers[1].jumpState,
        'AIRBORNE',
        'Follower 2 must NOT jump simultaneously with hero at hero takeoff',
      );
    }

    if (state.followers[0].jumpState === 'AIRBORNE' && f0AirborneStep < 0) {
      f0AirborneStep = step;
    }
    if (state.followers[1].jumpState === 'AIRBORNE' && f1AirborneStep < 0) {
      f1AirborneStep = step;
    }
    f0PeakHeight = Math.max(f0PeakHeight, state.followers[0].heightAboveGround);
    f1PeakHeight = Math.max(f1PeakHeight, state.followers[1].heightAboveGround);
    f0MaxGrab = Math.max(f0MaxGrab, state.followers[0].grabAmount);

    // Verify followers never penetrate ramp deck underneath them
    for (const f of state.followers) {
      const fLat = f.worldX - getTrackCenterX(f.distance);
      const rUnder = evaluateRampSurface(state.ramps, f.distance, fLat);
      if (rUnder.onRamp) {
        assert.ok(
          f.heightAboveGround + 1e-3 >= rUnder.surfaceHeight,
          `Follower ${f.id} must ride above ramp surface (${f.heightAboveGround.toFixed(2)} >= ${rUnder.surfaceHeight.toFixed(2)})`,
        );
      }
    }
  }

  assert.ok(heroTakeoffStep > 0, 'Hero must launch off Level 3 bonus ramp');
  assert.ok(
    f0AirborneStep > heroTakeoffStep,
    `Follower 1 must take off sequentially AFTER hero (${f0AirborneStep} > ${heroTakeoffStep})`,
  );
  assert.ok(
    f1AirborneStep > f0AirborneStep,
    `Follower 2 must take off sequentially AFTER Follower 1 (${f1AirborneStep} > ${f0AirborneStep})`,
  );
  assert.ok(f0PeakHeight > bonusRamp.height + 1.0, `Follower 1 should reach real jump peak (got ${f0PeakHeight.toFixed(2)}m)`);
  assert.ok(f1PeakHeight > bonusRamp.height + 1.0, `Follower 2 should reach real jump peak (got ${f1PeakHeight.toFixed(2)}m)`);
  assert.ok(f0MaxGrab > 0.5, 'Followers should smoothly mirror Grab pose during their own air window');

  // After landing, all riders must return cleanly to ground height 0 with 2 followers intact
  assert.equal(state.heightAboveGround, 0);
  assert.equal(state.followers[0].heightAboveGround, 0);
  assert.equal(state.followers[1].heightAboveGround, 0);
  assert.equal(state.followers.length, 2, 'Followers must never detach during jumps');
});

test('manual jump (W / ArrowUp) launches from snow, prevents mid-air double jump, and followers jump sequentially', () => {
  const state = createInitialSimulationState('playing', undefined, 3);
  const input = createInitialInput();
  assert.equal(state.jumpState, 'GROUNDED');

  // Press W / ArrowUp -> immediate takeoff into AIRBORNE
  input.jumpQueued = true;
  const takeoffEv = stepSimulation(state, input, 0.025);
  assert.equal(takeoffEv.tookOff, true);
  assert.equal(state.jumpState, 'AIRBORNE');
  assert.equal(input.jumpQueued, false, 'Jump press should be consumed cleanly');

  // Pressing jump again mid-air must NOT double-jump or reset vertical velocity upward
  let peakHeight = 0;
  let landed = false;
  let follower0Peak = 0;
  for (let i = 0; i < 65; i++) {
    if (i === 12) {
      input.jumpQueued = true; // Attempt illegal mid-air double jump
    }
    const prevVy = state.verticalVelocity;
    const ev = stepSimulation(state, input, 0.025);
    if (i === 12 && state.jumpState === 'AIRBORNE') {
      assert.equal(ev.tookOff, false, 'Mid-air double jump must be blocked');
      assert.ok(state.verticalVelocity < prevVy, 'Gravity must keep pulling downward in mid-air');
    }
    peakHeight = Math.max(peakHeight, state.heightAboveGround);
    follower0Peak = Math.max(follower0Peak, state.followers[0].heightAboveGround);
    if (ev.landed) landed = true;
  }

  assert.ok(peakHeight >= 2.2, `Manual jump should reach >= 2.2m peak height (got ${peakHeight.toFixed(2)}m)`);
  assert.equal(landed, true, 'Manual jump must touch down cleanly');
  assert.equal(state.jumpState, 'GROUNDED');
  assert.ok(follower0Peak >= 1.8, `Follower should sequentially mirror manual jump (got ${follower0Peak.toFixed(2)}m)`);
});

test('fallen pine log obstacles appear ONLY on Level 3+, span across the road, collide when grounded, and clear on W/ArrowUp jump', () => {
  // Levels 1 & 2 must have zero fallen logs
  const lv1 = createInitialSimulationState('playing', undefined, 1);
  const lv2 = createInitialSimulationState('playing', undefined, 2);
  const lv3 = createInitialSimulationState('playing', undefined, 3);

  assert.equal(lv1.obstacles.filter((o) => o.kind === 'fallen_log').length, 0, 'Level 1 must have 0 fallen logs');
  assert.equal(lv2.obstacles.filter((o) => o.kind === 'fallen_log').length, 0, 'Level 2 must have 0 fallen logs');

  const lv3Logs = lv3.obstacles.filter((o) => o.kind === 'fallen_log');
  assert.equal(lv3Logs.length, 1, `Level 3 should gently introduce 1 fallen log (found ${lv3Logs.length})`);
  const lv5 = createInitialSimulationState('playing', undefined, 5);
  const lv5Logs = lv5.obstacles.filter((o) => o.kind === 'fallen_log');
  assert.ok(lv5Logs.length >= 2, `Level 5 should feature fallen logs across the course (found ${lv5Logs.length})`);
  for (const log of [...lv3Logs, ...lv5Logs]) {
    assert.ok((log.barHalfWidth ?? 0) >= 8.5, `Fallen log must span full road width (barHalfWidth=${log.barHalfWidth})`);
    assert.ok(log.clearanceHeight > 0.8 && log.clearanceHeight <= 1.25, 'Fallen log clearanceHeight should be jumpable');
  }

  // 1. Riding grounded into a fallen log (even off-center at x = +5.5m) collides!
  const targetLog = lv3Logs[0];
  lv3.distance = targetLog.z - 0.8;
  lv3.travelDistance = lv3.distance;
  lv3.lateralOffset = 5.5;
  const groundedInput = createInitialInput();
  let collided = false;
  for (let i = 0; i < 6; i++) {
    const ev = stepSimulation(lv3, groundedInput, 0.025);
    if (ev.collidedObstacle?.id === targetLog.id) {
      collided = true;
      break;
    }
  }
  assert.equal(collided, true, 'Grounded snowboarder must collide with full-width fallen log');
  assert.equal(lv3.hitCount, 1);

  // 2. Pressing W / ArrowUp ahead of the fallen log clears it cleanly with ZERO hits!
  const lv3Jump = createInitialSimulationState('playing', undefined, 3);
  const logToJump = lv3Jump.obstacles.find((o) => o.kind === 'fallen_log')!;
  lv3Jump.distance = logToJump.z - 10.0;
  lv3Jump.travelDistance = lv3Jump.distance;
  lv3Jump.lateralOffset = -3.5;

  const jumpInput = createInitialInput();
  jumpInput.jumpQueued = true;

  let clearedLog = false;
  for (let i = 0; i < 45; i++) {
    const ev = stepSimulation(lv3Jump, jumpInput, 0.025);
    assert.equal(ev.collidedObstacle, null, 'Jumping cleanly over fallen log must cause zero collisions');
    if (lv3Jump.distance > logToJump.z + 2.5) {
      clearedLog = true;
      break;
    }
  }
  assert.equal(clearedLog, true, 'Player should sail cleanly past the fallen log');
  assert.equal(lv3Jump.hitCount, 0);
});

test('snow trail records distance-gated points, intensifies on turns, breaks cleanly in mid-air, and fades out', () => {
  const buf = createSnowTrailBuffer();

  // 1. Style check: hard carving is wider, stronger, and persists longer than straight gliding
  const straightStyle = computeTrailStyle(0);
  const carveStyle = computeTrailStyle(0.9);
  assert.ok(carveStyle.halfWidth > straightStyle.halfWidth, 'Turning should carve a wider snow groove');
  assert.ok(carveStyle.intensity > straightStyle.intensity, 'Turning should deepen trail intensity');
  assert.ok(carveStyle.maxAge > straightStyle.maxAge, 'Turning should persist longer in the snow');

  // 2. Grounded recording respects minStepMeters gating
  assert.equal(pushTrailSample(buf, 0, 0, 0, 0, 22, 0, 'GROUNDED'), true);
  assert.equal(buf.nodes.length, 1);
  assert.equal(buf.nodes[0].segmentStart, true);

  // Tiny step below minStepMeters must be skipped
  assert.equal(
    pushTrailSample(buf, 0.05, 0, -(TRAIL_CONFIG.minStepMeters * 0.5), 0, 22, 0, 'GROUNDED'),
    false,
  );
  assert.equal(buf.nodes.length, 1);

  // Valid carving step records a connected node with stronger intensity
  assert.equal(pushTrailSample(buf, 0.6, 0, -1.0, 0.85, 22, 0.2, 'GROUNDED'), true);
  assert.equal(buf.nodes.length, 2);
  assert.equal(buf.nodes[1].segmentStart, false);
  assert.ok(buf.nodes[1].intensity > buf.nodes[0].intensity);

  // 3. Airborne frames must break the trail and never emit mid-air nodes
  assert.equal(pushTrailSample(buf, 0.9, 2.4, -2.5, 0.5, 22, 0.1, 'AIRBORNE'), false);
  assert.equal(buf.pendingBreak, true);
  assert.equal(buf.nodes.length, 2);

  // Resuming GROUNDED starts a detached segment cleanly
  assert.equal(pushTrailSample(buf, 1.0, 0, -5.0, -0.7, 22, -0.15, 'GROUNDED'), true);
  assert.equal(buf.nodes.length, 3);
  assert.equal(buf.nodes[2].segmentStart, true, 'Landing after jump must start a new disconnected trail segment');

  // 4. Fading over time monotonically decreases alpha and prunes fully faded prefix nodes
  const initialAlpha = computeTrailNodeAlpha(buf.nodes[0]);
  stepTrailBuffer(buf, 1.0);
  const midAlpha = computeTrailNodeAlpha(buf.nodes[0]);
  assert.ok(midAlpha < initialAlpha && midAlpha > 0, 'Trail alpha should smoothly decay with age');

  stepTrailBuffer(buf, TRAIL_CONFIG.carveLifetime + 1.0);
  assert.equal(buf.nodes.length, 0, 'Fully faded trail nodes should be pruned from the buffer');

  // 5. Reset clears nodes and primes a clean segment start
  pushTrailSample(buf, 0, 0, -10, 0.4, 22, 0, 'GROUNDED');
  assert.equal(buf.nodes.length, 1);
  resetTrailBuffer(buf);
  assert.equal(buf.nodes.length, 0);
  assert.equal(buf.pendingBreak, true);
});

test('dynamic PositionalAudio ambient targets scale wind & snow friction with Lofi speed, silence snow in mid-air, and produce seamless loop buffers', () => {
  // Inactive or muted must strictly output zero gains
  const mutedTargets = computeAmbientAudioTargets({
    active: true,
    muted: true,
    speedRatio: 1.0,
    forwardSpeed: 26,
    carveIntensity: 0.8,
    avalancheDanger: 0.8,
    airborne: false,
    lean: 0.7,
    heightAboveGround: 0,
  });
  assert.equal(mutedTargets.windGain, 0);
  assert.equal(mutedTargets.snowGain, 0);
  assert.equal(mutedTargets.avalancheGain, 0);

  // Speed scaling: cruise speed produces louder/brighter wind & snow friction than slowed speed
  const slowTargets = computeAmbientAudioTargets({
    active: true,
    muted: false,
    speedRatio: 0.42,
    forwardSpeed: 10.8,
    carveIntensity: 0,
    avalancheDanger: 0.05,
    airborne: false,
    lean: 0,
    heightAboveGround: 0,
  });
  const fastStraight = computeAmbientAudioTargets({
    active: true,
    muted: false,
    speedRatio: 1.05,
    forwardSpeed: 27.5,
    carveIntensity: 0,
    avalancheDanger: 0.05,
    airborne: false,
    lean: 0,
    heightAboveGround: 0,
  });
  const fastCarve = computeAmbientAudioTargets({
    active: true,
    muted: false,
    speedRatio: 1.05,
    forwardSpeed: 27.5,
    carveIntensity: 0.9,
    avalancheDanger: 0.75,
    airborne: false,
    lean: 0.85,
    heightAboveGround: 0,
  });
  const airborneFast = computeAmbientAudioTargets({
    active: true,
    muted: false,
    speedRatio: 1.05,
    forwardSpeed: 27.5,
    carveIntensity: 0.8,
    avalancheDanger: 0.1,
    airborne: true,
    lean: -0.4,
    heightAboveGround: 3.5,
  });

  assert.ok(fastStraight.windGain > slowTargets.windGain, 'Wind intensity must rise with Lofi speed');
  assert.ok(fastStraight.windFilterFreq > slowTargets.windFilterFreq, 'Wind cutoff must brighten with speed');
  assert.ok(fastStraight.windPlaybackRate > slowTargets.windPlaybackRate, 'Wind pitch/rush must increase with speed');
  assert.ok(fastStraight.snowGain > slowTargets.snowGain, 'Snow friction intensity must rise with Lofi speed');
  assert.ok(fastCarve.snowGain > fastStraight.snowGain, 'Hard carving must intensify snow friction scrape');
  assert.ok(fastCarve.snowFilterFreq > fastStraight.snowFilterFreq, 'Hard carving must raise snow bandpass frequency');
  assert.ok(fastCarve.windOffsetX > 1.5, 'Right lean should subtly pan spatial wind anchor right');
  assert.ok(fastCarve.avalancheGain > 0.05, 'Close avalanche danger should drive spatial avalanche rumble');
  assert.equal(airborneFast.snowGain, 0, 'Snow friction must drop strictly to 0 while Lofi is airborne');
  assert.ok(airborneFast.windGain > fastStraight.windGain, 'High airborne jump should boost alpine wind rush');

  // Procedural noise buffers must stay bounded in [-1, 1] and wrap seamlessly at loop boundaries
  const windSamples = new Float32Array(4096);
  const snowSamples = new Float32Array(4096);
  fillAlpineWindSamples(windSamples, 1337);
  fillSnowFrictionSamples(snowSamples, 4242);

  let windEnergy = 0;
  let snowEnergy = 0;
  for (let i = 0; i < windSamples.length; i++) {
    assert.ok(windSamples[i] >= -1 && windSamples[i] <= 1);
    assert.ok(snowSamples[i] >= -1 && snowSamples[i] <= 1);
    windEnergy += Math.abs(windSamples[i]);
    snowEnergy += Math.abs(snowSamples[i]);
  }
  assert.ok(windEnergy > 100, 'Alpine wind buffer must contain non-zero signal');
  assert.ok(snowEnergy > 100, 'Snow friction buffer must contain non-zero signal');
});

test('keyboard steering uses Last-Input-Priority (SOCD), survives dual-key release, and mobile drag honors deadzone', () => {
  const tracker = createKeyboardSteerTracker();

  // 1. Holding both ArrowLeft and KeyA, then releasing ArrowLeft still steers left!
  pressSteerKey(tracker, 'ArrowLeft');
  pressSteerKey(tracker, 'KeyA');
  const afterPartialRelease = releaseSteerKey(tracker, 'ArrowLeft');
  assert.equal(afterPartialRelease.left, true, 'Releasing ArrowLeft while KeyA is still held must keep steering left');
  assert.equal(afterPartialRelease.right, false);

  // 2. Rapid S-carve overlap: pressing ArrowRight while KeyA is still held prioritizes newest key (Right)
  const overlapRight = pressSteerKey(tracker, 'ArrowRight');
  assert.equal(overlapRight.right, true, 'Last-Input-Priority must steer right immediately on overlap');
  assert.equal(overlapRight.left, false);

  // Releasing ArrowRight smoothly returns control to still-held KeyA!
  const backToLeft = releaseSteerKey(tracker, 'ArrowRight');
  assert.equal(backToLeft.left, true, 'Releasing overlapping right key should fall back to held left key');
  assert.equal(backToLeft.right, false);

  // Clearing resets cleanly
  clearKeyboardSteerTracker(tracker);
  assert.equal(tracker.leftCodes.size, 0);
  assert.equal(tracker.rightCodes.size, 0);
  assert.equal(tracker.lastPressedDir, 0);

  // 3. Mobile drag deadzone suppresses tiny thumb jitter (< 6px) and smoothly scales beyond deadzone
  assert.equal(computeDragSteerNormalized(4, 100, 6), 0);
  assert.equal(computeDragSteerNormalized(-5.5, 100, 6), 0);
  assert.ok(computeDragSteerNormalized(53, 100, 6) > 0.45 && computeDragSteerNormalized(53, 100, 6) < 0.55);
  assert.equal(computeDragSteerNormalized(140, 100, 6), 1);
  assert.equal(computeDragSteerNormalized(-140, 100, 6), -1);
});

test('victory arrival gates UI readiness behind coasting & +1 recruit join and is mutually exclusive with Game Over', () => {
  const arrival = createShelterArrivalState();
  assert.equal(arrival.victoryUiReady, false);
  assert.equal(arrival.stage, 'idle');

  assert.equal(triggerShelterCelebrationOnce(arrival), true);
  assert.equal(arrival.stage, 'coasting');
  assert.equal(arrival.victoryUiReady, false);

  // Mutual exclusivity: Game Over cannot fire once Victory has triggered
  assert.equal(triggerGameOverSequenceOnce(arrival), false);
  assert.equal(arrival.gameoverActive, false);

  // Mid-sequence (0.5s): Lofi is coasting, recruit hasn't finished, UI buttons MUST remain hidden
  for (let i = 0; i < 10; i++) {
    stepShelterArrival(arrival, 0.05);
  }
  assert.ok(arrival.arrivalGlideProgress > 0.4 && arrival.arrivalGlideProgress < 1);
  assert.equal(arrival.victoryUiReady, false, 'Victory UI must stay gated during arrival coast');

  // After full arrival + recruit sequence (~1.7s total): pose, recruit, and victoryUiReady all complete
  for (let i = 0; i < 24; i++) {
    stepShelterArrival(arrival, 0.05);
  }
  assert.equal(arrival.arrivalGlideProgress, 1);
  assert.equal(arrival.victoryPoseProgress, 1);
  assert.equal(arrival.recruitJoinProgress, 1);
  assert.equal(arrival.stage, 'ready');
  assert.equal(arrival.victoryUiReady, true, 'Victory UI unlocks after arrival & +1 recruit complete');

  // Reset clears everything cleanly so Game Over or next run can trigger
  resetShelterArrival(arrival);
  assert.equal(arrival.victoryUiReady, false);
  assert.equal(arrival.recruitJoinProgress, 0);
  assert.equal(arrival.stage, 'idle');
});

test('Game Over snow-burial sequence transitions smoothly, blocks Victory, never adds Yetis, and resets cleanly on retry', () => {
  const arrival = createShelterArrivalState();
  assert.equal(triggerGameOverSequenceOnce(arrival), true);
  assert.equal(triggerGameOverSequenceOnce(arrival), false, 'Game Over trigger must be idempotent');
  assert.equal(triggerShelterCelebrationOnce(arrival), false, 'Victory cannot trigger during Game Over');
  assert.equal(arrival.gameoverUiReady, false);

  // Early burial (~0.25s): snow mound rising, UI still gated
  for (let i = 0; i < 5; i++) {
    stepGameOverSequence(arrival, 0.05);
  }
  assert.ok(arrival.gameoverBurialProgress > 0.25 && arrival.gameoverBurialProgress < 0.8);
  assert.equal(arrival.gameoverUiReady, false);

  // Complete burial (~0.75s total): snow mound settled & UI ready
  for (let i = 0; i < 10; i++) {
    stepGameOverSequence(arrival, 0.05);
  }
  assert.equal(arrival.gameoverBurialProgress, 1);
  assert.equal(arrival.gameoverUiReady, true);

  // Simulation retry on Level 2 preserves exact 1 follower (never awards extra Yeti)
  const sim = createInitialSimulationState('playing', undefined, 2);
  sim.phase = 'gameover';
  retryCurrentLevel(sim, 'playing');
  resetShelterArrival(arrival);
  assert.equal(sim.levelNumber, 2);
  assert.equal(sim.followers.length, 1);
  assert.equal(sim.unlockedFollowers, 1);
  assert.equal(arrival.gameoverActive, false);
  assert.equal(arrival.gameoverBurialProgress, 0);
  assert.equal(arrival.gameoverUiReady, false);
});

test('snow particle physics applies real gravity, boundary-layer alpine wind shear, and wind-carried drift', () => {
  setActiveTrackProfile(2);
  const lowWind = sampleAlpineWind(1.2, 0, -120, 0.1, 2, { x: 0, y: 0, z: 0 });
  const highWind = sampleAlpineWind(1.2, 0, -120, 2.5, 2, { x: 0, y: 0, z: 0 });
  const lv3Wind = sampleAlpineWind(1.2, 0, -120, 2.5, 3, { x: 0, y: 0, z: 0 });

  assert.ok(
    Math.hypot(highWind.x, highWind.z) > Math.hypot(lowWind.x, lowWind.z),
    'Boundary-layer wind shear should be stronger higher above the snowpack',
  );
  assert.ok(
    Math.hypot(lv3Wind.x, lv3Wind.z) > Math.hypot(highWind.x, highWind.z),
    'Higher alpine level (Puncak Badai) should have stronger mountain gusts',
  );

  // Compare a heavy snow clump vs fine mist released high above snow with zero initial velocity
  const baseGroundY = sampleCollisionSurfaceHeight(0, -120, []);
  const clump: ParticleKinematics = {
    x: 0,
    y: baseGroundY + 12,
    z: -120,
    vx: 0,
    vy: 0,
    vz: 0,
    gravityScale: 1.35,
    drag: 1.15,
    windFactor: 0.35,
    restitution: 0.32,
    friction: 0.52,
    radius: 0.09,
    kind: PARTICLE_KIND.CLUMP,
    bounceCount: 0,
    settled: false,
  };
  const mist: ParticleKinematics = {
    ...clump,
    gravityScale: 0.45,
    drag: 3.5,
    windFactor: 1.3,
    radius: 0.06,
    kind: PARTICLE_KIND.MIST,
  };
  const res: ParticleStepResult = {
    collided: false,
    impactSpeed: 0,
    shouldEmitSplash: false,
    groundY: 0,
    nx: 0,
    ny: 1,
    nz: 0,
  };

  for (let i = 0; i < 12; i++) {
    stepSnowParticlePhysics(clump, 0.025, 0.8 + i * 0.025, 2, [], res);
    stepSnowParticlePhysics(mist, 0.025, 0.8 + i * 0.025, 2, [], res);
  }

  assert.ok(clump.vy < -3.2, `Gravity should pull heavy clump swiftly downward (vy=${clump.vy.toFixed(2)})`);
  assert.ok(clump.y < mist.y, 'Heavy snow clump must fall faster than airy snow mist under gravity');
  assert.ok(
    Math.abs(mist.vx) > Math.abs(clump.vx) * 2.0,
    'Airy mist must be deflected significantly further by alpine wind than heavy clumps',
  );
});

test('snow particle ground & ramp collisions clamp strictly above surface, reflect along 3D slope normal, emit splash, and settle cleanly', () => {
  setActiveTrackProfile(1);
  const lv1 = LEVEL_CONFIGS[0];
  const ramp = lv1.ramps[0];

  // 1. Sloped downhill terrain normal should tilt forward toward -Z (downhill)
  const norm = sampleCollisionSurfaceNormal(0, -200, [], { x: 0, y: 1, z: 0 });
  assert.ok(Math.abs(Math.hypot(norm.x, norm.y, norm.z) - 1) < 1e-5, 'Surface normal must be unit length');
  assert.ok(norm.y > 0.9 && norm.z < -0.1, `Downhill slope normal should tilt toward -Z (got nz=${norm.z.toFixed(3)})`);

  // 2. Drop a fast clump directly onto sloped snow -> must collide, never tunnel, bounce upward/downhill, emit splash, and eventually settle
  const dropX = getTrackCenterX(200);
  const dropZ = -200;
  const startGroundY = sampleCollisionSurfaceHeight(dropX, dropZ, []);
  const clump: ParticleKinematics = {
    x: dropX,
    y: startGroundY + 1.4,
    z: dropZ,
    vx: 1.5,
    vy: -4.2,
    vz: -2.0,
    gravityScale: 1.35,
    drag: 1.1,
    windFactor: 0.3,
    restitution: 0.34,
    friction: 0.55,
    radius: 0.09,
    kind: PARTICLE_KIND.CLUMP,
    bounceCount: 0,
    settled: false,
  };
  const res: ParticleStepResult = {
    collided: false,
    impactSpeed: 0,
    shouldEmitSplash: false,
    groundY: 0,
    nx: 0,
    ny: 1,
    nz: 0,
  };

  let sawFirstCollision = false;
  let sawSplash = false;
  let sawSettled = false;

  for (let step = 0; step < 90; step++) {
    stepSnowParticlePhysics(clump, 0.02, step * 0.02, 1, [], res);
    const localGround = sampleCollisionSurfaceHeight(clump.x, clump.z, []);
    assert.ok(
      clump.y >= localGround + clump.radius - 1e-5,
      `Particle must never tunnel below snow surface (${clump.y.toFixed(3)} >= ${(localGround + clump.radius).toFixed(3)})`,
    );
    if (res.collided && !sawFirstCollision) {
      sawFirstCollision = true;
      assert.ok(res.impactSpeed >= SNOW_PARTICLE_PHYSICS.splashImpactThreshold);
      assert.ok(clump.vy > 0.3, 'First high-speed collision must bounce particle upward along snow normal');
    }
    if (res.shouldEmitSplash) sawSplash = true;
    if (clump.settled) sawSettled = true;
  }

  assert.equal(sawFirstCollision, true, 'Falling snow clump must collide with the snowpack');
  assert.equal(sawSplash, true, 'High-speed first impact must trigger secondary powder mist splash');
  assert.equal(sawSettled, true, 'Particle must settle cleanly on snowpack instead of jittering forever');

  // 3. Particle falling onto a snow ramp deck collides at elevated ramp height (not buried inside ramp!)
  const rampMidDist = ramp.zStart + ramp.length * 0.65;
  const rampX = getTrackCenterX(rampMidDist) + ramp.offsetX;
  const rampZ = -rampMidDist;
  const bareGroundY = sampleCollisionSurfaceHeight(rampX, rampZ, []);
  const rampDeckY = sampleCollisionSurfaceHeight(rampX, rampZ, lv1.ramps);
  assert.ok(rampDeckY > bareGroundY + 0.5, 'Ramp deck collision height must sit clearly above bare snow');

  const rampDrop: ParticleKinematics = {
    x: rampX,
    y: rampDeckY + 0.35,
    z: rampZ,
    vx: 0,
    vy: -3.5,
    vz: 0,
    gravityScale: 1.0,
    drag: 1.5,
    windFactor: 0.4,
    restitution: 0.3,
    friction: 0.5,
    radius: 0.07,
    kind: PARTICLE_KIND.SPRAY,
    bounceCount: 0,
    settled: false,
  };
  let hitRampDeck = false;
  for (let i = 0; i < 15; i++) {
    stepSnowParticlePhysics(rampDrop, 0.02, i * 0.02, 1, lv1.ramps, res);
    if (res.collided) {
      hitRampDeck = true;
      assert.ok(
        rampDrop.y >= rampDeckY - 0.15,
        'Particle colliding with ramp must bounce off elevated ramp deck',
      );
      break;
    }
  }
  assert.equal(hitRampDeck, true, 'Particle dropping over a snow ramp must collide with the ramp surface');
});

test('mandatory outcome consistency (A-E): Lv1 defeat solo, Lv1 victory two-beat recruit, Lv2 start/defeat/retry preserve exact state snapshot', () => {
  const input = createInitialInput();

  // --- A. Game baru -> Level 1 -> Kalah: Hero saja, UI Level 1, 0 pengikut, 0 rekrutan ---
  const state = createInitialSimulationState('title', undefined, 1);
  startNewGame(state, 'playing');
  assert.equal(state.levelNumber, 1);
  assert.equal(state.followers.length, 0);

  state.distance = 120;
  state.avalancheDistance = 0.2;
  state.forwardSpeed = SIM_CONFIG.hitSlowSpeed;
  state.slowdownTimer = 1.0;
  const lv1Loss = stepSimulation(state, input, 0.05);
  assert.equal(lv1Loss.becameGameOver, true);
  assert.equal(state.phase, 'gameover');
  assert.equal(state.levelNumber, 1, 'Losing on Level 1 must NEVER advance levelNumber');
  assert.equal(state.followers.length, 0, 'Losing on Level 1 must have strictly 0 followers');
  assert.equal(state.unlockedFollowers, 0, 'Losing on Level 1 must NEVER grant a recruit');
  assert.deepEqual(state.outcomeSnapshot, {
    kind: 'gameover',
    levelNumber: 1,
    levelName: LEVEL_CONFIGS[0].name,
    activeFollowers: 0,
    recruitedFollowers: 0,
    progressPct: Math.round((state.distance / state.levelLength) * 100),
    score: 0,
    grabCount: 0,
    peakMultiplier: 1,
  });
  const lv1LossHud = buildHudSnapshot(state, null, { gameoverUiReady: true });
  assert.equal(lv1LossHud.levelNumber, 1);
  assert.equal(lv1LossHud.followerCount, 0);
  assert.equal(lv1LossHud.recruitedFollowers, 0);

  retryCurrentLevel(state, 'playing');
  assert.equal(state.levelNumber, 1);
  assert.equal(state.followers.length, 0);
  assert.equal(state.outcomeSnapshot, null);

  // --- B. Level 1 -> Menang: Hero tiba sendirian (Pengikut tiba: 0), lalu 1 rekrutan diperkenalkan SETELAH coast selesai ---
  state.distance = state.levelLength - 0.5;
  const lv1Win = stepSimulation(state, input, 0.05);
  assert.equal(lv1Win.becameVictory, true);
  assert.equal(state.phase, 'victory');
  assert.equal(state.levelNumber, 1, 'Winning Level 1 must stay on Level 1 until player advances');
  assert.equal(state.followers.length, 0);
  const lv1WinSnap = buildHudSnapshot(state, null);
  assert.equal(lv1WinSnap.levelNumber, 1);
  assert.equal(lv1WinSnap.followerCount, 0);
  assert.equal(lv1WinSnap.recruitedFollowers, 1);

  const arrival = createShelterArrivalState();
  triggerShelterCelebrationOnce(arrival);
  for (let i = 0; i < 16; i++) {
    stepShelterArrival(arrival, 0.05); // 0.80s (< arrivalCoastDuration 0.85s)
    assert.equal(arrival.recruitJoinProgress, 0, 'New recruit must NOT emerge before Hero finishes arriving alone');
    assert.equal(arrival.victoryUiReady, false);
  }
  for (let i = 0; i < 18; i++) {
    stepShelterArrival(arrival, 0.05); // reaches 1.70s
  }
  assert.equal(arrival.arrivalGlideProgress, 1);
  assert.equal(arrival.recruitJoinProgress, 1);
  assert.equal(arrival.victoryUiReady, true);

  const lv1WinHud = buildHudSnapshot(state, null, {
    victoryUiReady: arrival.victoryUiReady,
    recruitJoinProgress: arrival.recruitJoinProgress,
  });
  assert.equal(lv1WinHud.levelNumber, 1);
  assert.equal(lv1WinHud.followerCount, 0, 'Level 1 Victory UI must report Pengikut tiba: 0');
  assert.equal(lv1WinHud.recruitedFollowers, 1);

  // --- C. Lanjut Level 2: tepat 1 pengikut sejak awal ---
  assert.equal(advanceToNextLevel(state), true);
  assert.equal(state.phase, 'playing');
  assert.equal(state.levelNumber, 2);
  assert.equal(state.followers.length, 1, 'Level 2 must begin with strictly 1 follower');
  assert.equal(state.outcomeSnapshot, null);

  // --- D. Level 2 -> Kalah: Hero + 1 pengikut, UI Level 2, tanpa rekrutan tambahan ---
  state.distance = 140;
  state.avalancheDistance = 0.2;
  state.forwardSpeed = SIM_CONFIG.hitSlowSpeed;
  state.slowdownTimer = 1.0;
  const lv2Loss = stepSimulation(state, input, 0.05);
  assert.equal(lv2Loss.becameGameOver, true);
  assert.equal(state.phase, 'gameover');
  assert.equal(state.levelNumber, 2);
  assert.equal(state.followers.length, 1);
  assert.equal(state.unlockedFollowers, 1, 'Losing on Level 2 must NEVER add a recruit');

  const lv2LossHud = buildHudSnapshot(state, null, { gameoverUiReady: true });
  assert.equal(lv2LossHud.levelNumber, 2);
  assert.equal(lv2LossHud.followerCount, 1);
  assert.equal(lv2LossHud.recruitedFollowers, 0);

  // --- E. Retry Level 2: tetap Level 2 dengan tepat 1 pengikut ---
  retryCurrentLevel(state, 'playing');
  assert.equal(state.phase, 'playing');
  assert.equal(state.levelNumber, 2);
  assert.equal(state.followers.length, 1);
  assert.equal(state.unlockedFollowers, 1);
  assert.equal(state.outcomeSnapshot, null);
});

test('multi-variant alpine pines (4 track + 5 perimeter) and granite boulders (3) distribute deterministically without changing hitboxes', () => {
  const lv1Obstacles = buildLevelObstacles(LEVEL_CONFIGS[0]);
  const trackPineVariants = new Set<number>();
  const trackRockVariants = new Set<number>();

  for (const obs of lv1Obstacles) {
    if (obs.kind === 'pine') {
      const v = pickTrackPineVariant(obs.id, obs.z, obs.offsetX);
      assert.ok(v >= 0 && v < TRACK_PINE_VARIANT_COUNT, 'Track pine variant must stay in [0..3]');
      assert.equal(
        PINE_VARIANT_PROFILES[v].trackEligible,
        true,
        'Track obstacle pines must only use full-height track-eligible silhouettes',
      );
      trackPineVariants.add(v);
    } else if (obs.kind === 'rock') {
      const v = pickRockVariant(obs.id, obs.z, obs.offsetX);
      assert.ok(v >= 0 && v < ROCK_VARIANT_COUNT, 'Rock variant must stay in [0..2]');
      trackRockVariants.add(v);
    }
  }

  assert.equal(
    trackPineVariants.size,
    TRACK_PINE_VARIANT_COUNT,
    'All 4 distinct full-height pine variants must appear on the Level 1 track',
  );
  assert.equal(
    trackRockVariants.size,
    ROCK_VARIANT_COUNT,
    'All 3 distinct sculpted boulder variants must appear on the Level 1 track',
  );

  const perimPineVariants = new Set<number>();
  let idx = 0;
  for (let distZ = -20; distZ < 420; distZ += 12.5) {
    for (const side of [-1, 1]) {
      for (let tier = 0; tier < 2; tier++) {
        const v = pickPerimeterPineVariant(idx++, distZ, side, tier);
        assert.ok(v >= 0 && v < PERIMETER_PINE_VARIANT_COUNT);
        perimPineVariants.add(v);
      }
    }
  }
  assert.equal(
    perimPineVariants.size,
    PERIMETER_PINE_VARIANT_COUNT,
    'Perimeter pine grove must mix all 5 distinct pine silhouettes including compact snow saplings',
  );
});

test('instanced 3D snow puff scale envelope blooms, stretches in flight, flattens when settled, and fades cleanly to zero', () => {
  const out = { x: 0, y: 0, z: 0 };

  // 1. Birth -> Peak bloom around age 0.16
  computeInstancedSnowScale(0.0, 1.0, PARTICLE_KIND.SPRAY, 0, false, 0, out);
  const birthY = out.y;
  computeInstancedSnowScale(0.16, 1.0, PARTICLE_KIND.SPRAY, 0, false, 0, out);
  const peakY = out.y;
  assert.ok(peakY > birthY, 'Snow puff should bloom smoothly after emission');

  // 2. Fast airborne spray elongates slightly along flight axis
  computeInstancedSnowScale(0.2, 1.0, PARTICLE_KIND.SPRAY, 0, false, 49, out);
  assert.ok(out.y > out.x, 'Fast airborne spray puff should show subtle dynamic stretch');

  // 3. Settled snow puff flattens softly into the snowpack
  computeInstancedSnowScale(0.5, 1.0, PARTICLE_KIND.CLUMP, 1, true, 0.2, out);
  assert.ok(out.x > out.y * 1.8, 'Settled snow clump should flatten vertically against the snow surface');

  // 4. Wind-carried mist puffs billow wider than standard spray at the same age
  const mistOut = { x: 0, y: 0, z: 0 };
  computeInstancedSnowScale(0.6, 1.0, PARTICLE_KIND.MIST, 0, false, 4, mistOut);
  computeInstancedSnowScale(0.6, 1.0, PARTICLE_KIND.SPRAY, 0, false, 4, out);
  assert.ok(mistOut.x > out.x, 'Mist puffs should billow wider while drifting with alpine wind');

  // 5. End of life fades cleanly to exact 0 scale (zero popping)
  computeInstancedSnowScale(1.0, 1.0, PARTICLE_KIND.SPRAY, 0, false, 0, out);
  assert.equal(out.x, 0);
  assert.equal(out.y, 0);
  assert.equal(out.z, 0);
});

test('horizontal camera sway responds symmetrically to carving lean, scales with speed, and stays strictly within comfort bounds', () => {
  // 1. Deadzone: straight glide or tiny micro-lean yields exact 0 sway
  const straight = computeCameraSwayTarget({
    phase: 'playing',
    lean: 0.03,
    speedRatio: 1.0,
    jumpHeight: 0,
    isPortrait: false,
  });
  assert.equal(straight.cameraOffsetX, 0);
  assert.equal(straight.lookOffsetX, 0);

  // 2. Carving right shifts camera gently outside (-X) and leads look target into turn (+X)
  const rightCarve = computeCameraSwayTarget({
    phase: 'playing',
    lean: 0.85,
    speedRatio: 1.0,
    jumpHeight: 0,
    isPortrait: false,
  });
  const leftCarve = computeCameraSwayTarget({
    phase: 'playing',
    lean: -0.85,
    speedRatio: 1.0,
    jumpHeight: 0,
    isPortrait: false,
  });
  assert.ok(rightCarve.cameraOffsetX < -0.35, 'Right carve shifts camera smoothly toward outer edge (-X)');
  assert.ok(rightCarve.lookOffsetX > 0.9, 'Right carve leads look-ahead smoothly into right turn (+X)');
  assert.ok(
    Math.abs(rightCarve.cameraOffsetX + leftCarve.cameraOffsetX) < 1e-9 &&
      Math.abs(rightCarve.lookOffsetX + leftCarve.lookOffsetX) < 1e-9,
    'Left and right carving camera sway must be perfectly symmetric',
  );

  // 3. Speed scaling: faster carving produces stronger sway than post-hit slowdown, clamped within comfort bounds
  const slowCarve = computeCameraSwayTarget({
    phase: 'playing',
    lean: 1.0,
    speedRatio: 0.4,
    jumpHeight: 0,
    isPortrait: false,
  });
  const fastCarve = computeCameraSwayTarget({
    phase: 'playing',
    lean: 1.0,
    speedRatio: 1.15,
    jumpHeight: 0,
    isPortrait: false,
  });
  assert.ok(
    Math.abs(fastCarve.cameraOffsetX) > Math.abs(slowCarve.cameraOffsetX),
    'Higher downhill speed should subtly enhance carving camera sway',
  );
  assert.ok(
    Math.abs(fastCarve.cameraOffsetX) <= CAMERA_SWAY_CONFIG.maxCameraOffsetLandscape + 1e-9,
    'Camera sway offset must never exceed landscape comfort cap',
  );
  assert.ok(
    Math.abs(fastCarve.lookOffsetX) <= CAMERA_SWAY_CONFIG.maxLookLeadLandscape + 1e-9,
    'Look-ahead lead must never exceed landscape comfort cap',
  );

  // 4. Portrait viewport uses narrower horizontal comfort cap
  const portraitCarve = computeCameraSwayTarget({
    phase: 'playing',
    lean: 1.0,
    speedRatio: 1.0,
    jumpHeight: 0,
    isPortrait: true,
  });
  assert.ok(
    Math.abs(portraitCarve.cameraOffsetX) <= CAMERA_SWAY_CONFIG.maxCameraOffsetPortrait + 1e-9 &&
      Math.abs(portraitCarve.cameraOffsetX) < Math.abs(fastCarve.cameraOffsetX),
    'Portrait framing must apply tighter horizontal sway bounds',
  );

  // 5. Airborne attenuation keeps jump arcs steady & comfortable
  const airborneCarve = computeCameraSwayTarget({
    phase: 'playing',
    lean: 1.0,
    speedRatio: 1.0,
    jumpHeight: 2.2,
    isPortrait: false,
  });
  assert.ok(
    Math.abs(airborneCarve.cameraOffsetX) <= Math.abs(fastCarve.cameraOffsetX) * 0.56,
    'Mid-air height should attenuate horizontal camera sway so jump arcs stay steady',
  );

  // 6. Anti-motion-sickness damping: rapid left-right oscillation is low-pass filtered with zero overshoot
  const state = createCameraSwayState();
  let maxRapidOffset = 0;
  for (let i = 0; i < 40; i++) {
    const lean = i % 2 === 0 ? 1 : -1;
    stepCameraSway(state, {
      dt: 0.05,
      phase: 'playing',
      lean,
      speedRatio: 1.0,
      jumpHeight: 0,
      isPortrait: false,
    });
    maxRapidOffset = Math.max(maxRapidOffset, Math.abs(state.cameraOffsetX));
  }
  assert.ok(
    maxRapidOffset < CAMERA_SWAY_CONFIG.maxCameraOffsetLandscape * 0.35,
    `Rapid alternating taps must be smoothly filtered (saw max ${maxRapidOffset.toFixed(3)}m)`,
  );

  // 7. Smooth approach during sustained turn, freeze when paused, and clean decay on victory/title
  for (let i = 0; i < 30; i++) {
    stepCameraSway(state, {
      dt: 0.05,
      phase: 'playing',
      lean: 1.0,
      speedRatio: 1.0,
      jumpHeight: 0,
      isPortrait: false,
    });
  }
  const carvedOffset = state.cameraOffsetX;
  assert.ok(carvedOffset < -0.7, 'Sustained right carve converges smoothly to target sway');

  stepCameraSway(state, {
    dt: 0.05,
    phase: 'paused',
    lean: 0,
    speedRatio: 0,
    jumpHeight: 0,
    isPortrait: false,
  });
  assert.equal(state.cameraOffsetX, carvedOffset, 'Paused phase preserves current sway without snapping');

  for (let i = 0; i < 40; i++) {
    stepCameraSway(state, {
      dt: 0.05,
      phase: 'victory',
      lean: 1.0,
      speedRatio: 1.0,
      jumpHeight: 0,
      isPortrait: false,
    });
  }
  assert.equal(state.cameraOffsetX, 0, 'Non-playing phases decay horizontal sway cleanly to exact 0');
  assert.equal(state.lookOffsetX, 0, 'Non-playing phases decay look lead cleanly to exact 0');
});

test('transparent outcome PNG assets are true RGBA (colorType 6) with alpha=0 outer corners and no opaque box background', () => {
  const assetPaths = [
    OUTCOME_ASSETS.victoryHero,
    OUTCOME_ASSETS.defeatHero,
    OUTCOME_ASSETS.smallYeti,
  ];

  for (const webPath of assetPaths) {
    assert.ok(webPath.endsWith('.png'), `Outcome asset must remain PNG (got ${webPath})`);
    const diskPath = path.resolve(process.cwd(), 'public', webPath.replace(/^\/+/, ''));
    assert.equal(fs.existsSync(diskPath), true, `Missing local asset on disk: ${diskPath}`);

    const buf = fs.readFileSync(diskPath);
    // Verify PNG signature
    assert.equal(buf[0], 137);
    assert.equal(buf[1], 80);
    assert.equal(buf[2], 78);
    assert.equal(buf[3], 71);

    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    const bitDepth = buf[24];
    const colorType = buf[25];

    assert.equal(bitDepth, 8, `${webPath}: expected 8-bit depth`);
    assert.equal(colorType, 6, `${webPath}: expected true RGBA PNG (colorType 6), got ${colorType}`);
    assert.ok(width >= 400 && height >= 400, `${webPath}: expected high-resolution cutout`);

    // Inflate IDAT to verify all 4 outer corners have alpha === 0 (no rectangular box background!)
    let offset = 8;
    const idatChunks: Buffer[] = [];
    while (offset < buf.length) {
      const len = buf.readUInt32BE(offset);
      const type = buf.toString('ascii', offset + 4, offset + 8);
      if (type === 'IDAT') {
        idatChunks.push(buf.subarray(offset + 8, offset + 8 + len));
      }
      offset += 12 + len;
    }
    const raw = zlib.inflateSync(Buffer.concat(idatChunks));
    const stride = width * 4 + 1;
    const cornerAlphas = [
      raw[0 * stride + 1 + 3], // top-left
      raw[0 * stride + 1 + (width - 1) * 4 + 3], // top-right
      raw[(height - 1) * stride + 1 + 3], // bottom-left
      raw[(height - 1) * stride + 1 + (width - 1) * 4 + 3], // bottom-right
    ];
    assert.deepEqual(
      cornerAlphas,
      [0, 0, 0, 0],
      `${webPath}: all 4 corners must be transparent (alpha=0), got ${JSON.stringify(cornerAlphas)}`,
    );

    // Center pixel area must contain opaque hero artwork
    const midY = Math.floor(height * 0.5);
    let opaqueCount = 0;
    for (let x = 0; x < width; x++) {
      if (raw[midY * stride + 1 + x * 4 + 3] > 200) opaqueCount++;
    }
    assert.ok(opaqueCount > width * 0.25, `${webPath}: center row must contain solid hero pixels`);
  }
});

test('outcome overlay model reads exact level follower snapshot on Game Over (Lv1=0, Lv2=1, Lv3=2, LvN=N-1) with zero recruit or NPCs', () => {
  const input = createInitialInput();

  for (const levelNum of [1, 2, 3]) {
    const state = createInitialSimulationState('playing', undefined, levelNum);
    // Force avalanche catch-up defeat
    state.avalancheDistance = 0.01;
    state.forwardSpeed = SIM_CONFIG.hitSlowSpeed;
    const ev = stepSimulation(state, input, 0.05);
    assert.equal(ev.becameGameOver, true);
    assert.equal(state.phase, 'gameover');

    // Before gameoverUiReady -> overlay stays hidden
    const preHud = buildHudSnapshot(state, null, { gameoverUiReady: false });
    assert.equal(buildOutcomeOverlayModel(preHud), null);

    // Once gameoverUiReady -> overlay matches exact snapshot followerCount = levelNum - 1
    const readyHud = buildHudSnapshot(state, null, { gameoverUiReady: true });
    const model = buildOutcomeOverlayModel(readyHud);
    assert.ok(model, `Expected Game Over overlay model for Level ${levelNum}`);
    assert.equal(model.kind, 'gameover');
    assert.equal(model.heroSrc, OUTCOME_ASSETS.defeatHero);
    assert.equal(model.arrivedFollowerCount, levelNum - 1);
    assert.equal(
      model.leftFollowers.length + model.rightFollowers.length,
      levelNum - 1,
      `Level ${levelNum} defeat must display strictly ${levelNum - 1} Small Yeti(s)`,
    );
    assert.equal(model.showRecruitBanner, false, 'Defeat must never show a recruit banner');
    assert.equal(model.recruitedFollowers, 0, 'Defeat must never add a recruit');
    assert.equal(model.recruitLabel, null);

    // Retry must keep follower count strictly at levelNum - 1
    retryCurrentLevel(state, 'playing');
    assert.equal(state.followers.length, levelNum - 1);
    assert.equal(state.unlockedFollowers, levelNum - 1);
  }

  // General Level N slot distribution check (e.g. Level 5 -> 4 Small Yetis)
  const lv5Slots = buildOutcomeFollowerSlots(4);
  assert.equal(lv5Slots.leftFollowers.length + lv5Slots.rightFollowers.length, 4);
  assert.equal(lv5Slots.leftFollowers.length, 2);
  assert.equal(lv5Slots.rightFollowers.length, 2);
});

test('victory outcome overlay gates on arrival completion and clearly separates arrived followers from +1 new recruit across Levels 1..10', () => {
  const input = createInitialInput();

  for (const levelNum of [1, 2, 3, 10]) {
    const state = createInitialSimulationState('playing', undefined, levelNum);
    state.distance = state.levelLength - 0.5;
    const ev = stepSimulation(state, input, 0.05);
    assert.equal(ev.becameVictory, true);

    // During arrival phase (victoryUiReady=false), PNG overlay must wait until arrival finishes
    const arrivingHud = buildHudSnapshot(state, null, {
      victoryUiReady: false,
      recruitJoinProgress: 0.4,
    });
    assert.equal(buildOutcomeOverlayModel(arrivingHud), null);

    // After arrival phase completes (victoryUiReady=true), overlay displays arrived (levelNum - 1) and +1 recruit separately
    const readyHud = buildHudSnapshot(state, null, {
      victoryUiReady: true,
      recruitJoinProgress: 1,
    });
    const model = buildOutcomeOverlayModel(readyHud);
    assert.ok(model);
    assert.equal(model.kind, 'victory');
    assert.equal(model.heroSrc, OUTCOME_ASSETS.victoryHero);
    assert.equal(model.arrivedFollowerCount, levelNum - 1);
    assert.equal(model.leftFollowers.length + model.rightFollowers.length, levelNum - 1);
    assert.equal(model.showRecruitBanner, true);
    assert.equal(model.recruitedFollowers, 1);
    assert.equal(model.recruitLabel, UI_COPY.victory.recruitMessage);
    if (levelNum === 1) {
      assert.equal(model.arrivedFollowersLabel, 'Lofi arrived safely!');
      assert.equal(model.nextLevelCrewLabel, 'Next level: 1 Lil Yeti');
    } else if (levelNum === 2) {
      assert.equal(model.arrivedFollowersLabel, '1 Lil Yeti arrived safely!');
      assert.equal(model.nextLevelCrewLabel, 'Next level: 2 Lil Yetis');
    } else if (levelNum === 3) {
      assert.equal(model.arrivedFollowersLabel, '2 Lil Yetis arrived safely!');
      assert.equal(model.nextLevelCrewLabel, 'Next level: 3 Lil Yetis');
    } else {
      assert.equal(model.arrivedFollowersLabel, '9 Lil Yetis arrived safely!');
      assert.equal(model.nextLevelCrewLabel, 'Crew: 10 Lil Yetis');
      assert.equal(model.hasNextLevel, false);
    }
  }
});

test('winter sky and horizon fog palette clearly separates blue sky from bright snow without washing out horizon', () => {
  const splitRgb = (hex: number) => ({
    r: (hex >> 16) & 0xff,
    g: (hex >> 8) & 0xff,
    b: hex & 0xff,
  });

  const zenith = splitRgb(SKY_PALETTE.zenithHex);
  const horizon = splitRgb(SKY_PALETTE.horizonHex);
  const fog = splitRgb(FOG_CONFIG.colorHex);
  const mountain = splitRgb(DAYLIGHT_RIG.distantMountainHex);

  assert.ok(zenith.b >= 170 && zenith.r <= 40, `Expected deep daytime azure zenith, got ${JSON.stringify(zenith)}`);
  assert.ok(zenith.b - zenith.r >= 130, 'Zenith must be distinctly rich blue');

  assert.ok(horizon.b >= 200 && horizon.r <= 150, `Expected soft blue horizon (non-white), got ${JSON.stringify(horizon)}`);
  assert.ok(horizon.b - horizon.r >= 70, 'Horizon must retain strong blue tint separate from snow');

  assert.ok(fog.b - fog.r >= 55, `Fog must be cool blue-gray matching horizon, got ${JSON.stringify(fog)}`);
  assert.ok(FOG_CONFIG.density <= 0.0026 && FOG_CONFIG.density >= 0.0014, 'Fog density must preserve obstacle & mountain visibility');

  const horizonLum = 0.2126 * horizon.r + 0.7152 * horizon.g + 0.0722 * horizon.b;
  const mountainLum = 0.2126 * mountain.r + 0.7152 * mountain.g + 0.0722 * mountain.b;
  assert.ok(horizonLum - mountainLum >= 25, 'Distant mountains must contrast clearly against horizon sky');
});

test('upgraded 3D shelter keeps door larger than Lofi and keeps entrance stairs clear of stopping plaza and greeter NPCs', () => {
  assert.ok(SHELTER_ARCHITECTURE.doorWidth >= 3.0, 'Shelter door must be comfortably wider than Lofi');
  assert.ok(SHELTER_ARCHITECTURE.doorHeight >= 3.8, 'Shelter door must be comfortably taller than Lofi');
  assert.equal(SHELTER_ARCHITECTURE.stairSteps, 3, 'Shelter must feature 3 wooden entrance steps');
  assert.ok(SHELTER_ARCHITECTURE.wallLogCourses >= 6, 'Shelter walls must stack horizontal timber log courses');

  const plazaDepth = getArrivalPlazaDepth();
  const stairsFrontFromFinish = plazaDepth - SHELTER_ARCHITECTURE.stairsProjection;
  assert.ok(
    stairsFrontFromFinish - SHELTER_LAYOUT.arrivalCoastDistance >= 9.0,
    `Expected >= 9m clear stopping plaza in front of shelter stairs, got ${(stairsFrontFromFinish - SHELTER_LAYOUT.arrivalCoastDistance).toFixed(2)}m`,
  );

  for (const greeter of SHELTER_LAYOUT.greeterSlots) {
    assert.ok(
      Math.abs(greeter.offsetX) - SHELTER_ARCHITECTURE.stairsHalfWidth >= 2.5,
      `Greeter at x=${greeter.offsetX} must remain well clear of shelter stairs`,
    );
  }
});

test('character never turns automatically on curved tracks: neutral input preserves straight worldX and zero lateral velocity', () => {
  const state = createInitialSimulationState('playing', undefined, 8);
  const input = createInitialInput();

  // Locate a strongly curving segment of Level 8 where track center shifts sharply across 20m
  let curvedZ = 180;
  let bestShift = 0;
  for (let z = 140; z <= 700; z += 10) {
    const shift = Math.abs(getTrackCenterX(z + 20) - getTrackCenterX(z));
    if (shift > bestShift) {
      bestShift = shift;
      curvedZ = z;
    }
  }
  assert.ok(bestShift >= 4.0, `Expected a strong curved test segment (>= 4m shift), found ${bestShift.toFixed(2)}m`);

  state.distance = curvedZ;
  state.travelDistance = curvedZ;
  state.lateralOffset = 0;
  state.lateralVelocity = 0;
  state.visualLean = 0;
  state.invulnTimer = 2.0; // Isolate pure steering physics from obstacles

  const startWorldX = getTrackCenterX(state.distance) + state.lateralOffset;
  const startCenterX = getTrackCenterX(state.distance);

  // Glide hands-free for 0.45s (~12.5m) while still strictly inside snowbanks
  for (let i = 0; i < 15; i++) {
    stepSimulation(state, input, 0.03);
    const maxOffset = getTrackHalfWidth(state.distance) - SIM_CONFIG.edgePadding;
    if (Math.abs(state.lateralOffset) < maxOffset - 0.1) {
      const currWorldX = getTrackCenterX(state.distance) + state.lateralOffset;
      assert.ok(
        Math.abs(currWorldX - startWorldX) < 1e-5,
        `Hands-free worldX must stay strictly straight (start=${startWorldX.toFixed(3)}, now=${currWorldX.toFixed(3)})`,
      );
      assert.equal(state.lateralVelocity, 0, 'Neutral input must never inject automatic lateral velocity');
      assert.equal(state.visualLean, 0, 'Neutral input must never lean automatically');
    }
  }

  // Confirm the track actually curved beneath Lofi while Lofi held a straight world-space heading
  const trackShift = Math.abs(getTrackCenterX(state.distance) - startCenterX);
  assert.ok(trackShift >= 2.0, `Track should curve beneath rider (${trackShift.toFixed(2)}m)`);
  assert.ok(
    Math.abs(state.lateralOffset) >= 1.5,
    'Holding no keys on a bend should drift relative to track center instead of auto-steering on rails',
  );
  const latestSample = state.pathHistory[state.pathHistory.length - 1];
  assert.equal(latestSample.yaw, 0, 'Recorded heading yaw must be 0 when gliding straight with zero steering');

  // Now steer actively into the curve (away from whichever bank we drifted toward) -> worldX responds cleanly to player input
  const preSteerWorldX = getTrackCenterX(state.distance) + state.lateralOffset;
  const steerDir = state.lateralOffset >= 0 ? -1 : 1;
  input.left = steerDir < 0;
  input.right = steerDir > 0;
  for (let i = 0; i < 12; i++) {
    stepSimulation(state, input, 0.03);
  }
  const postSteerWorldX = getTrackCenterX(state.distance) + state.lateralOffset;
  assert.ok(
    (postSteerWorldX - preSteerWorldX) * steerDir > 2.0,
    'Active manual steering must carve cleanly in the requested world-space direction',
  );
  assert.ok(state.lateralVelocity * steerDir > 6.0);
});

test('arena winding curve difficulty, speed, and narrowing escalate smoothly across all 10 levels and stay 100% carvable', () => {
  const metrics = LEVEL_CONFIGS.map((l) => measureLevelCurveMetrics(l.levelNumber));

  // Strictly progressive cross-level escalation across all 10 levels
  for (let i = 1; i < metrics.length; i++) {
    assert.ok(
      metrics[i].totalLateralTurnMeters > metrics[i - 1].totalLateralTurnMeters,
      `Expected total lateral turn meters Lv${i + 1} (${metrics[i].totalLateralTurnMeters.toFixed(1)}) > Lv${i} (${metrics[i - 1].totalLateralTurnMeters.toFixed(1)})`,
    );
    assert.ok(
      metrics[i].meanAbsSlope > metrics[i - 1].meanAbsSlope,
      `Expected mean curve slope Lv${i + 1} (${metrics[i].meanAbsSlope.toFixed(3)}) > Lv${i} (${metrics[i - 1].meanAbsSlope.toFixed(3)})`,
    );
    assert.ok(
      LEVEL_CONFIGS[i].baseSpeed > LEVEL_CONFIGS[i - 1].baseSpeed,
      `Base cruise speed must escalate smoothly Lv${i} -> Lv${i + 1}`,
    );
  }

  // Within-level progressive escalation (late course curvier than opening stretch)
  for (let i = 0; i < metrics.length; i++) {
    assert.ok(
      metrics[i].lateMeanSlope > metrics[i].earlyMeanSlope,
      `Level ${i + 1} late curves (${metrics[i].lateMeanSlope.toFixed(3)}) should exceed early curves (${metrics[i].earlyMeanSlope.toFixed(3)})`,
    );
    // Player manual steering authority must comfortably outpace the steepest switchback on EVERY level 1..10
    const steepestCurveLateralSpeed = metrics[i].peakAbsSlope * LEVEL_CONFIGS[i].baseSpeed;
    assert.ok(
      SIM_CONFIG.maxLateralSpeed > steepestCurveLateralSpeed * 1.15,
      `Level ${i + 1}: maxLateralSpeed (${SIM_CONFIG.maxLateralSpeed}) must comfortably exceed steepest curve speed (${steepestCurveLateralSpeed.toFixed(2)})`,
    );
  }

  // Level 3 must be significantly gentler than Level 10 (fixing old abrupt Level 3 difficulty spike)
  assert.ok(
    metrics[2].peakAbsSlope < metrics[9].peakAbsSlope * 0.72,
    `Level 3 peak slope (${metrics[2].peakAbsSlope.toFixed(3)}) should remain clearly gentler than Level 10 (${metrics[9].peakAbsSlope.toFixed(3)})`,
  );
});

test('atmospheric mountain wind and granular crunchy snow-contact audio synthesize seamless loops and obey ground/airborne physics', () => {
  const sampleRate = 44100;
  const crunchBuf = new Float32Array(sampleRate * 2);
  const windBuf = new Float32Array(sampleRate * 2);
  fillSnowCrunchSamples(crunchBuf, sampleRate, 9137);
  fillAlpineWindSamples(windBuf, 2027);

  let crunchPeak = 0;
  let crunchSqSum = 0;
  let windPeak = 0;
  let windSqSum = 0;
  for (let i = 0; i < crunchBuf.length; i++) {
    const c = crunchBuf[i];
    const w = windBuf[i];
    assert.ok(Number.isFinite(c) && Math.abs(c) <= 1.0, 'Crunch sample must stay finite and bounded');
    assert.ok(Number.isFinite(w) && Math.abs(w) <= 1.0, 'Wind sample must stay finite and bounded');
    crunchPeak = Math.max(crunchPeak, Math.abs(c));
    crunchSqSum += c * c;
    windPeak = Math.max(windPeak, Math.abs(w));
    windSqSum += w * w;
  }

  const crunchRms = Math.sqrt(crunchSqSum / crunchBuf.length);
  const windRms = Math.sqrt(windSqSum / windBuf.length);
  const crunchCrest = crunchPeak / Math.max(1e-6, crunchRms);
  const windCrest = windPeak / Math.max(1e-6, windRms);

  assert.ok(crunchRms > 0.04, `Crunchy snow buffer must be clearly audible (rms=${crunchRms.toFixed(4)})`);
  assert.ok(windRms > 0.08, `Soft mountain wind buffer must be clearly audible (rms=${windRms.toFixed(4)})`);
  assert.ok(
    crunchCrest >= 3.0 && crunchCrest > windCrest,
    `Crunchy snow micro-grains should have crisp transient crest factor (${crunchCrest.toFixed(2)}) > smooth wind (${windCrest.toFixed(2)})`,
  );
  assert.ok(
    Math.abs(crunchBuf[0] - crunchBuf[crunchBuf.length - 1]) < 0.12,
    'Crunchy snow buffer must cross-fade seamlessly at loop boundary',
  );
  assert.ok(
    Math.abs(windBuf[0] - windBuf[windBuf.length - 1]) < 0.08,
    'Alpine wind buffer must cross-fade seamlessly at loop boundary',
  );

  // Target gain behavior: grounded glide vs carving vs snowbank edge vs airborne vs muted
  const groundedStraight = computeAmbientAudioTargets({
    active: true,
    muted: false,
    speedRatio: 1.0,
    forwardSpeed: 26,
    carveIntensity: 0,
    edgeScrape: 0,
    avalancheDanger: 0,
    airborne: false,
    lean: 0,
    heightAboveGround: 0,
  });
  const groundedCarve = computeAmbientAudioTargets({
    active: true,
    muted: false,
    speedRatio: 1.0,
    forwardSpeed: 26,
    carveIntensity: 0.9,
    edgeScrape: 0,
    avalancheDanger: 0,
    airborne: false,
    lean: 0.9,
    heightAboveGround: 0,
  });
  const groundedEdge = computeAmbientAudioTargets({
    active: true,
    muted: false,
    speedRatio: 1.0,
    forwardSpeed: 26,
    carveIntensity: 0.2,
    edgeScrape: 0.95,
    avalancheDanger: 0,
    airborne: false,
    lean: 0.2,
    heightAboveGround: 0,
  });
  const airborne = computeAmbientAudioTargets({
    active: true,
    muted: false,
    speedRatio: 1.0,
    forwardSpeed: 26,
    carveIntensity: 0.8,
    edgeScrape: 1.0,
    avalancheDanger: 0,
    airborne: true,
    lean: 0.5,
    heightAboveGround: 3.2,
  });
  const muted = computeAmbientAudioTargets({
    active: true,
    muted: true,
    speedRatio: 1.0,
    forwardSpeed: 26,
    carveIntensity: 0.8,
    edgeScrape: 0.8,
    avalancheDanger: 0.9,
    airborne: false,
    lean: 0.5,
    heightAboveGround: 0,
  });

  assert.ok(groundedStraight.windGain > 0.12 && groundedStraight.windGain < 0.3, 'Gentle mountain wind plays continuously on snow');
  assert.ok(groundedStraight.snowCrunchGain > 0.1, 'Snowboard contact produces audible crunchy snow sound on snow');
  assert.ok(groundedCarve.snowCrunchGain > groundedStraight.snowCrunchGain * 1.4, 'Carving intensifies crunchy snow contact');
  assert.ok(groundedCarve.snowCrunchFreq > groundedStraight.snowCrunchFreq + 300, 'Carving brightens snow crystal crunch frequency');
  assert.ok(groundedEdge.snowCrunchGain > groundedStraight.snowCrunchGain * 1.2, 'Edging along snowbank intensifies snow crunch');

  assert.equal(airborne.snowGain, 0, 'Snow glide must silence immediately while airborne');
  assert.equal(airborne.snowCrunchGain, 0, 'Crunchy snow contact must silence immediately while airborne');
  assert.ok(airborne.windGain > groundedStraight.windGain, 'Soft alpine wind swells slightly when jumping through mountain air');

  assert.equal(muted.windGain, 0);
  assert.equal(muted.snowGain, 0);
  assert.equal(muted.snowCrunchGain, 0);
});

test('progressive arena generation escalates smoothly across all 10 levels with gentle Level 3 and >= 4.5m passable gaps', () => {
  const profiles = LEVEL_CONFIGS.map((l) => computeArenaDifficultyProfile(l.levelNumber));
  for (let i = 1; i < profiles.length; i++) {
    assert.ok(
      profiles[i].densityScale > profiles[i - 1].densityScale,
      `densityScale must escalate smoothly Lv${i} -> Lv${i + 1}`,
    );
    assert.ok(
      profiles[i].curveIntensityScale > profiles[i - 1].curveIntensityScale,
      `curveIntensityScale must escalate smoothly Lv${i} -> Lv${i + 1}`,
    );
    assert.ok(
      profiles[i].minRowStepMeters < profiles[i - 1].minRowStepMeters,
      `minRowStepMeters must tighten smoothly Lv${i} -> Lv${i + 1}`,
    );
  }

  const densitiesPer100m: number[] = [];
  const totalCounts: number[] = [];

  for (const level of LEVEL_CONFIGS) {
    setActiveTrackProfile(level.levelNumber);
    const diff = computeArenaDifficultyProfile(level.levelNumber);
    const obstacles = buildLevelObstacles(level, level.spawnSeed, diff);
    const activeSpan = Math.max(100, level.length - 210);
    const per100m = (obstacles.length / activeSpan) * 100;
    densitiesPer100m.push(per100m);
    totalCounts.push(obstacles.length);

    // Every single non-fallen-log window must still retain a fair passable gap >= 4.5m
    const regularObs = obstacles.filter((o) => o.kind !== 'fallen_log');
    for (let i = 0; i < regularObs.length; i++) {
      const zRef = regularObs[i].z;
      const halfW = getTrackHalfWidth(zRef) - SIM_CONFIG.edgePadding;
      const windowObs = regularObs.filter((o) => Math.abs(o.z - zRef) <= 6.5);
      const intervals = windowObs
        .map((o) => ({
          start: o.offsetX - o.radius - SIM_CONFIG.playerRadius,
          end: o.offsetX + o.radius + SIM_CONFIG.playerRadius,
        }))
        .sort((a, b) => a.start - b.start);
      let cursor = -halfW;
      let maxGap = 0;
      for (const seg of intervals) {
        if (seg.start > cursor) maxGap = Math.max(maxGap, seg.start - cursor);
        cursor = Math.max(cursor, seg.end);
      }
      if (halfW > cursor) maxGap = Math.max(maxGap, halfW - cursor);
      assert.ok(
        maxGap >= 4.5,
        `Level ${level.levelNumber} at z=${zRef.toFixed(1)}m must preserve >= 4.5m passable gap (got ${maxGap.toFixed(2)}m)`,
      );
    }
  }

  assert.ok(
    totalCounts[0] < totalCounts[2] && totalCounts[2] < totalCounts[5] && totalCounts[5] < totalCounts[7],
    `Expected steady obstacle count growth Lv1 < Lv3 < Lv6 < Lv8, got ${JSON.stringify(totalCounts)}`,
  );
  assert.ok(
    densitiesPer100m[0] < densitiesPer100m[2] &&
      densitiesPer100m[2] < densitiesPer100m[6] &&
      densitiesPer100m[6] < densitiesPer100m[7],
    `Expected smooth density/100m growth Lv1 < Lv3 < Lv7 < Lv8, got ${densitiesPer100m.map((d) => d.toFixed(2)).join(' -> ')}`,
  );
  // Level 3 must be genuinely moderate (not close to Level 8 peak rock-garden density)
  assert.ok(
    densitiesPer100m[2] < densitiesPer100m[7] * 0.72,
    `Level 3 density (${densitiesPer100m[2].toFixed(2)}/100m) must remain clearly gentler than Level 8 (${densitiesPer100m[7].toFixed(2)}/100m)`,
  );
});

test('MiniMap layout & live snapshot accurately project winding track ribbon, obstacles, ramps, avalanche, followers, and player progress', () => {
  for (const level of LEVEL_CONFIGS) {
    const state = createInitialSimulationState('playing', undefined, level.levelNumber);
    const layout = buildMiniMapLayout(
      state.levelNumber,
      state.levelLength,
      state.ramps,
      state.obstacles,
    );

    assert.ok(layout.ribbonPath.startsWith('M') && layout.ribbonPath.endsWith('Z'), 'Ribbon must be a closed SVG polygon path');
    assert.ok(layout.centerlinePath.startsWith('M'), 'Centerline must be a valid SVG path');
    assert.equal(layout.ramps.length, state.ramps.length, 'All level ramps must appear on MiniMap');
    assert.equal(layout.obstacles.length, state.obstacles.length, 'All level obstacles must appear on MiniMap');
    assert.equal(layout.shelterY, MINIMAP_VIEWBOX.padTop, 'Shelter icon must sit cleanly at top of MiniMap');

    // Start snapshot (z=0) vs mid-track snapshot (z=50%)
    const startSnap = buildMiniMapSnapshot(layout, {
      playerWorldX: getTrackCenterX(0),
      playerDistance: 0,
      lateralVelocity: 0,
      forwardSpeed: state.levelBaseSpeed,
      avalancheDistance: 28,
      followers: state.followers,
    });
    const midZ = state.levelLength * 0.5;
    const midSnap = buildMiniMapSnapshot(layout, {
      playerWorldX: getTrackCenterX(midZ) + 6,
      playerDistance: midZ,
      lateralVelocity: 10,
      forwardSpeed: state.levelBaseSpeed,
      avalancheDistance: 12,
      followers: state.followers,
    });

    assert.ok(
      midSnap.playerY < startSnap.playerY - 60,
      `Player marker must move upward toward shelter as distance increases (startY=${startSnap.playerY}, midY=${midSnap.playerY})`,
    );
    assert.ok(
      midSnap.avalancheY >= midSnap.playerY,
      `Avalanche must remain behind (below) player on MiniMap (avalY=${midSnap.avalancheY}, playerY=${midSnap.playerY})`,
    );
    assert.ok(midSnap.playerHeadingDeg > 10, 'Steering right must tilt MiniMap player chevron clockwise');
    assert.equal(
      midSnap.followers.length,
      level.levelNumber - 1,
      `MiniMap must display exact follower count (${level.levelNumber - 1})`,
    );
  }
});

test('avalanche visual snow surge stays camera-safe and never covers the viewport across all pursuit distances', () => {
  const puffs = createAvalanchePuffLayouts();
  assert.ok(puffs.length >= 10, 'Avalanche wave should contain multiple sculpted snow puffs');

  const playerDistance = 240;
  const playerY = -playerDistance * 0.16;

  // Test both Desktop (backDist=9.8m, heightUp=5.05m) and Portrait (backDist=11.8m, heightUp=6.0m) cameras
  const cameras = [
    { label: 'desktop', backDist: 9.8, heightUp: 5.05 },
    { label: 'portrait', backDist: 11.8, heightUp: 6.0 },
  ];

  for (const cam of cameras) {
    const camX = 0;
    const camY = playerY + cam.heightUp;
    const camZ = -(playerDistance - cam.backDist);

    // 1. Safe distance (>= 17m): completely hidden so it never clips rear near-plane
    const safePose = computeAvalancheVisualPose({
      playerDistance,
      avalancheDistance: 24,
      cameraWorldZ: camZ,
      visible: true,
    });
    assert.equal(safePose.shouldRender, false, `${cam.label}: avalanche should be hidden at safe 24m margin`);

    // 2. Sweep every close pursuit distance from 16m down to 0m
    for (let avalDist = 0; avalDist <= 16; avalDist += 0.5) {
      const pose = computeAvalancheVisualPose({
        playerDistance,
        avalancheDistance: avalDist,
        cameraWorldZ: camZ,
        visible: true,
      });

      if (avalDist <= 10) {
        assert.equal(
          pose.shouldRender,
          true,
          `${cam.label}: close avalanche (${avalDist}m) should render cleanly behind Lofi`,
        );
      }
      if (!pose.shouldRender) continue;

      // Group must stay strictly ahead of camera lens and strictly behind Lofi's tail
      const camTrackDist = -camZ;
      assert.ok(
        pose.groupTrackDistance >= camTrackDist + AVALANCHE_VISUAL_CONFIG.minForwardOfCamera - 1e-6,
        `${cam.label}: avalanche at ${avalDist}m must keep >= ${AVALANCHE_VISUAL_CONFIG.minForwardOfCamera}m forward of camera`,
      );
      assert.ok(
        pose.groupTrackDistance <= playerDistance - AVALANCHE_VISUAL_CONFIG.minLagBehindPlayer + 1e-6,
        `${cam.label}: avalanche at ${avalDist}m must stay behind Lofi's snowboard`,
      );

      const groupY = -pose.groupTrackDistance * 0.16;
      const groupZ = -pose.groupTrackDistance;

      for (const puff of puffs) {
        const xf = computeAvalanchePuffTransform({
          puff,
          pose,
          groupWorldX: 0,
          groupWorldY: groupY,
          groupWorldZ: groupZ,
          cameraX: camX,
          cameraY: camY,
          cameraZ: camZ,
          time: 1.7,
        });

        // Strict top height cap above snowpack so center lane NEVER blocks Lofi or downhill sightline
        const topHeight = xf.localY + xf.scaleY;
        if (!puff.isFlank) {
          assert.ok(
            topHeight <= AVALANCHE_VISUAL_CONFIG.maxCenterTopHeight + 0.01,
            `${cam.label}: center puff top (${topHeight.toFixed(2)}m) must stay <= ${AVALANCHE_VISUAL_CONFIG.maxCenterTopHeight}m`,
          );
        } else {
          assert.ok(
            topHeight <= AVALANCHE_VISUAL_CONFIG.maxFlankTopHeight + 0.01,
            `${cam.label}: flank puff top (${topHeight.toFixed(2)}m) must stay <= ${AVALANCHE_VISUAL_CONFIG.maxFlankTopHeight}m`,
          );
        }

        // Hard 3D camera-surface clearance check on every visible puff
        if (xf.cameraClearance > 0.01) {
          const maxRad = Math.max(xf.scaleX, xf.scaleY, xf.scaleZ);
          const distToCam = Math.hypot(
            xf.localX - camX,
            groupY + xf.localY - camY,
            groupZ + xf.localZ - camZ,
          );
          assert.ok(
            distToCam - maxRad >= AVALANCHE_VISUAL_CONFIG.cameraHardCutoffMeters - 0.05,
            `${cam.label}: visible puff surface (${(distToCam - maxRad).toFixed(2)}m from camera) must never clip lens`,
          );
        }
      }
    }
  }
});

test('English UI terminology and singular/plural Lil Yeti & Crew formatters match specification across 0, 1, and multiple companions', () => {
  // Singular / plural Lil Yeti counts (excluding Lofi)
  assert.equal(formatLilYetiCount(0), '0 Lil Yetis');
  assert.equal(formatLilYetiCount(1), '1 Lil Yeti');
  assert.equal(formatLilYetiCount(2), '2 Lil Yetis');
  assert.equal(formatLilYetiCount(5), '5 Lil Yetis');

  // Level Start callouts driven strictly by actual companion count
  assert.equal(formatLevelStartCallout(0), 'Lofi rides solo!');
  assert.equal(formatLevelStartCallout(1), 'Ride with 1 Lil Yeti!');
  assert.equal(formatLevelStartCallout(2), 'Ride with 2 Lil Yetis!');
  assert.equal(formatLevelStartCallout(4), 'Ride with 4 Lil Yetis!');

  // Victory arrival & next-level strings
  assert.equal(formatArrivalSummary(0), 'Lofi arrived safely!');
  assert.equal(formatArrivalSummary(1), '1 Lil Yeti arrived safely!');
  assert.equal(formatArrivalSummary(2), '2 Lil Yetis arrived safely!');
  assert.equal(formatNextLevelCrew(1), 'Next level: 1 Lil Yeti');
  assert.equal(formatNextLevelCrew(2), 'Next level: 2 Lil Yetis');

  // Game Over & Pause strings
  assert.equal(formatGameOverLevelInfo(2, 47), 'Level 2 · Progress 47%');
  assert.equal(formatCrewStatus(0), 'Riding solo');
  assert.equal(formatCrewStatus(1), 'Crew: 1 Lil Yeti');
  assert.equal(formatCrewStatus(2), 'Crew: 2 Lil Yetis');
  assert.equal(formatPauseSummary(0, 12), 'Riding solo · Progress 12%');
  assert.equal(formatPauseSummary(1, 64), 'Crew: 1 Lil Yeti · Progress 64%');
  assert.equal(formatPauseSummary(2, 88), 'Crew: 2 Lil Yetis · Progress 88%');

  // Verify Game Over overlay model uses exact English Crew copy and NEVER shows recruitment copy
  for (const levelNum of [1, 2, 3]) {
    const state = createInitialSimulationState('playing', undefined, levelNum);
    state.distance = Math.round(state.levelLength * 0.4);
    state.avalancheDistance = 0.01;
    state.forwardSpeed = SIM_CONFIG.hitSlowSpeed;
    stepSimulation(state, createInitialInput(), 0.05);
    const hud = buildHudSnapshot(state, null, { gameoverUiReady: true });
    const model = buildOutcomeOverlayModel(hud);
    assert.ok(model);
    assert.equal(model.showRecruitBanner, false);
    assert.equal(model.recruitLabel, null);
    assert.equal(model.nextLevelCrewLabel, null);
    assert.equal(model.levelInfoLabel, `Level ${levelNum} · Progress ${hud.progressPct}%`);
    if (levelNum === 1) assert.equal(model.arrivedFollowersLabel, 'Riding solo');
    if (levelNum === 2) assert.equal(model.arrivedFollowersLabel, 'Crew: 1 Lil Yeti');
    if (levelNum === 3) assert.equal(model.arrivedFollowersLabel, 'Crew: 2 Lil Yetis');
  }
  // Recruitment message gating: must NEVER fire before the new Lil Yeti finishes joining
  assert.equal(hasRecruitJoined(0), false);
  assert.equal(hasRecruitJoined(0.25), false);
  assert.equal(hasRecruitJoined(0.85), false);
  assert.equal(hasRecruitJoined(0.95), true);
  assert.equal(hasRecruitJoined(1), true);

  // Dictionary audit: ensure zero Indonesian or outdated terms appear anywhere in UI_COPY
  const allCopyText = JSON.stringify(UI_COPY);
  assert.equal(/Pengikut|Yeti Kecil|Follower|Small Yeti|TRIK|LOMPAT/i.test(allCopyText), false);
});

test('3-hit crash tolerance rule: Lofi reliably survives 2 consecutive obstacle hits and loses on the 3rd hit across Levels 1, 3, 5, and 10', () => {
  const input = createInitialInput();

  for (const levelNum of [1, 3, 5, 10]) {
    const state = createInitialSimulationState('playing', undefined, levelNum);
    // Start mid-course with clean obstacle list so we trigger 3 exact consecutive hits
    state.distance = Math.round(state.levelLength * 0.35);
    state.travelDistance = state.distance;
    state.avalancheDistance = SIM_CONFIG.avalancheStartDistance;
    state.obstacles = [];

    const triggerHitAndRecoverToInvulnEnd = () => {
      // Place an obstacle right in front of Lofi
      const hitZ = state.distance + 0.4;
      const hitWorldX = getTrackCenterX(hitZ) + state.lateralOffset;
      state.obstacles = [
        {
          id: state.hitCount + 1,
          kind: 'rock',
          z: hitZ,
          offsetX: state.lateralOffset,
          worldX: hitWorldX,
          worldY: 0,
          radius: 1.4,
          clearanceHeight: 1.5,
          scale: 1,
          scaleX: 1,
          scaleY: 1,
          scaleZ: 1,
          rotationY: 0,
          tiltX: 0,
          tiltZ: 0,
          tint: 1,
          hit: false,
        },
      ];

      // Step into the obstacle and let the entire slowdown + invuln window (~1.5s) play out
      for (let i = 0; i < 60; i++) {
        if (state.phase !== 'playing') break;
        stepSimulation(state, input, 0.025);
      }
    };

    // Hit 1 -> MUST survive with healthy avalanche gap
    triggerHitAndRecoverToInvulnEnd();
    assert.equal(state.hitCount, 1, `Level ${levelNum}: expected 1st hit registered`);
    assert.equal(state.phase, 'playing', `Level ${levelNum}: must survive 1st obstacle hit`);
    assert.ok(
      state.avalancheDistance >= 14.0,
      `Level ${levelNum}: after 1st hit avalanche should stay >= 14m (got ${state.avalancheDistance.toFixed(2)}m)`,
    );

    // Hit 2 (immediately after invuln) -> MUST STILL survive in DANGER state!
    triggerHitAndRecoverToInvulnEnd();
    assert.equal(state.hitCount, 2, `Level ${levelNum}: expected 2nd hit registered`);
    assert.equal(state.phase, 'playing', `Level ${levelNum}: must survive 2nd obstacle hit (3-hit rule)`);
    assert.ok(
      state.avalancheDistance >= 4.0 && state.avalancheDistance <= 12.0,
      `Level ${levelNum}: after 2nd hit avalanche should be in recoverable DANGER range 4..12m (got ${state.avalancheDistance.toFixed(2)}m)`,
    );

    // Hit 3 (immediately after invuln) -> MUST trigger Game Over!
    triggerHitAndRecoverToInvulnEnd();
    assert.equal(state.hitCount, 3, `Level ${levelNum}: expected 3rd hit registered`);
    assert.equal(state.phase, 'gameover', `Level ${levelNum}: 3rd consecutive hit must trigger Game Over`);
    assert.equal(state.avalancheDistance, 0);
  }
});

test('continuous 2-track BGM playlist plays Track 1 then Track 2 then loops back to Track 1 without resetting on level completion', () => {
  assert.equal(BGM_PLAYLIST.length, 2);
  assert.equal(BGM_TRACK_SRC, '/assets/aistudio/2_53b010d2.mp3');
  assert.equal(
    BGM_SECOND_TRACK_SRC,
    '/assets/aistudio/kontraa-false-alarm-future-bounce-music-254837_f0565bf5.mp3',
  );
  assert.equal(BGM_PLAYLIST[0].src, BGM_TRACK_SRC);
  assert.equal(BGM_PLAYLIST[1].src, BGM_SECOND_TRACK_SRC);

  for (const track of BGM_PLAYLIST) {
    const absPath = path.join(process.cwd(), 'public', track.src.replace(/^\//, ''));
    assert.equal(fs.existsSync(absPath), true, `Missing BGM asset: ${absPath}`);
    assert.ok(fs.statSync(absPath).size > 100_000, `Expected real MP3 payload for ${track.src}`);
  }

  // Verify old deprecated background music files remain removed
  assert.equal(
    fs.existsSync(path.join(process.cwd(), 'public/assets/aistudio/1_8e852f6e.mp3')),
    false,
    'Old BGM track 1 should remain deleted',
  );
  assert.equal(
    fs.existsSync(path.join(process.cwd(), 'public/assets/aistudio/3_fc67b93b.mp3')),
    false,
    'Old BGM track 3 should remain deleted',
  );

  // Sequential wrap-around on natural track end: 0 -> 1 -> 0 -> 1
  assert.equal(getNextBgmTrackIndex(0), 1);
  assert.equal(getNextBgmTrackIndex(1), 0);

  const playlist = createBgmPlaylistState(0);
  assert.equal(playlist.currentIndex, 0);
  assert.equal(playlist.trackSrc, BGM_TRACK_SRC);

  // Track 1 ends naturally -> automatically switches to Track 2
  advanceBgmPlaylistOnEnded(playlist);
  assert.equal(playlist.currentIndex, 1);
  assert.equal(playlist.trackSrc, BGM_SECOND_TRACK_SRC);

  // Track 2 ends naturally -> automatically wraps back to Track 1
  advanceBgmPlaylistOnEnded(playlist);
  assert.equal(playlist.currentIndex, 0);
  assert.equal(playlist.trackSrc, BGM_TRACK_SRC);

  // Level changes & level completion NEVER force a track switch or reset
  for (let lv = 1; lv <= 10; lv++) {
    assert.equal(getBgmTrackIndexForLevel(lv, 0), 0);
    assert.equal(getBgmTrackIndexForLevel(lv, 1), 1);
  }
  assert.equal(shouldResetBgmOnPhaseChange('playing'), false);
  assert.equal(shouldResetBgmOnPhaseChange('victory'), false);
  assert.equal(shouldResetBgmOnPhaseChange('paused'), false);
  assert.equal(shouldResetBgmOnPhaseChange('gameover'), false);
  assert.equal(shouldResetBgmOnPhaseChange('title'), true);

  advanceBgmPlaylistOnEnded(playlist);
  assert.equal(playlist.currentIndex, 1);
  resetBgmPlaylistState(playlist);
  assert.equal(playlist.currentIndex, 0);
  assert.equal(playlist.trackSrc, BGM_TRACK_SRC);

  // Verify audio.ts uses natural `ended` event (NOT single-track `loop = true`)
  const audioSrc = fs.readFileSync(path.join(process.cwd(), 'src/game/audio.ts'), 'utf8');
  assert.equal(audioSrc.includes('el.loop = false'), true);
  assert.equal(audioSrc.includes('el.loop = true'), false);
  assert.equal(audioSrc.includes("el.addEventListener('ended', handleBgmEnded)"), true);

  // Re-audited mix: BGM is clear & present while SFX stay crisp without drowning out music
  const playingSafe = computeBgmTargetVolume('playing', false, 0, 0);
  const playingDanger = computeBgmTargetVolume('playing', false, 1, 0);
  const playingDucked = computeBgmTargetVolume('playing', false, 0, 1);
  const pausedVol = computeBgmTargetVolume('paused', false, 0.5, 0);
  const victoryVol = computeBgmTargetVolume('victory', false, 0, 0);
  assert.ok(
    playingSafe >= 0.26 && playingSafe <= 0.34,
    `Expected clear, balanced BGM bed in 0.26..0.34 (got ${playingSafe})`,
  );
  assert.ok(playingDanger > playingSafe && playingDanger <= 0.38);
  assert.ok(
    playingDucked < playingSafe * 0.88 && playingDucked > playingSafe * 0.72,
    `Expected subtle musical SFX ducking without pumping BGM (safe=${playingSafe}, ducked=${playingDucked})`,
  );
  assert.ok(pausedVol > 0 && pausedVol < playingSafe);
  assert.ok(victoryVol > 0 && victoryVol < playingSafe);
  assert.equal(computeBgmTargetVolume('title', false, 0, 0), 0);
  assert.equal(computeBgmTargetVolume('gameover', false, 0, 0), 0);
  assert.equal(computeBgmTargetVolume('playing', true, 1, 0), 0);

  // Softened SFX master & one-shot bus gains keep sound effects gentle below the background music
  assert.ok(SFX_MIX_CONFIG.spatialMasterGain >= 0.35 && SFX_MIX_CONFIG.spatialMasterGain <= 0.55);
  assert.ok(SFX_MIX_CONFIG.oneShotBusGain >= 0.45 && SFX_MIX_CONFIG.oneShotBusGain <= 0.65);

  // Dynamic duck envelope holds peak briefly then releases smoothly to 0
  assert.equal(computeActiveSfxDuck(1050, 0.9, 1000, 400), 0.9);
  const midDuck = computeActiveSfxDuck(1250, 0.9, 1000, 400);
  assert.ok(midDuck > 0.05 && midDuck < 0.7);
  assert.equal(computeActiveSfxDuck(1450, 0.9, 1000, 400), 0);
});

test('distant background mountains sculpt asymmetrical multi-ridge silhouettes with slope-following rock & snow planes', () => {
  assert.equal(BACKGROUND_MOUNTAIN_ARCHETYPES.length, 3);
  assert.ok(BACKGROUND_MOUNTAIN_SPECS.length >= 9);

  for (let a = 0; a < BACKGROUND_MOUNTAIN_ARCHETYPES.length; a++) {
    // 1. Grounded skirt: outer perimeter strictly returns 0 height so nothing floats
    assert.equal(sampleMountainHeight(0.99, 0, a).height, 0);
    assert.equal(sampleMountainHeight(-0.99, 0.2, a).height, 0);
    assert.equal(sampleMountainHeight(0, 0.99, a).height, 0);

    // 2. Asymmetry check: mirror pairs across X must differ noticeably (not a plain symmetrical cone)
    let asymSum = 0;
    const probeXs = [0.22, 0.38, 0.52, 0.66];
    const probeZs = [-0.15, 0.05, 0.25, 0.45];
    for (const px of probeXs) {
      for (const pz of probeZs) {
        const left = sampleMountainHeight(-px, pz, a).height;
        const right = sampleMountainHeight(px, pz, a).height;
        asymSum += Math.abs(left - right);
      }
    }
    assert.ok(
      asymSum > 0.9,
      `Archetype ${a} must be genuinely asymmetrical (got asymSum=${asymSum.toFixed(3)})`,
    );

    // 3. Multi-ridge check: silhouette profile across X (max height over Z) has >= 2 distinct local peaks
    const profile: number[] = [];
    for (let i = 0; i <= 40; i++) {
      const nx = -0.9 + (i / 40) * 1.8;
      let colMax = 0;
      for (let j = 0; j <= 20; j++) {
        const nz = -0.8 + (j / 20) * 1.6;
        colMax = Math.max(colMax, sampleMountainHeight(nx, nz, a).height);
      }
      profile.push(colMax);
    }
    let localPeaks = 0;
    for (let i = 2; i < profile.length - 2; i++) {
      if (
        profile[i] > 0.2 &&
        profile[i] >= profile[i - 1] &&
        profile[i] > profile[i + 1] &&
        profile[i] > profile[i - 2] - 0.005
      ) {
        localPeaks++;
      }
    }
    assert.ok(
      localPeaks >= 2,
      `Archetype ${a} must exhibit multiple stepped ridges/shoulders (found ${localPeaks} silhouette peaks)`,
    );
  }

  // 4. Slope-aware rock vs snow classification: steep cliff vs snow gully/ridge crest
  const steepRock = computeMountainSurfaceColor({
    heightNorm: 0.45,
    normalX: 0.7,
    normalY: 0.28,
    normalZ: 0.65,
    gullyDepth: 0,
    ridgeFactor: 0.85,
  });
  const snowSlope = computeMountainSurfaceColor({
    heightNorm: 0.72,
    normalX: -0.2,
    normalY: 0.86,
    normalZ: 0.46,
    gullyDepth: 0.55,
    ridgeFactor: -0.3,
  });

  assert.ok(steepRock.snowMask < 0.15, `Steep rock cliff must stay exposed rock (snowMask=${steepRock.snowMask})`);
  assert.ok(snowSlope.snowMask > 0.85, `Snow slope/gully must classify cleanly as snow (snowMask=${snowSlope.snowMask})`);

  const rockLum = 0.2126 * steepRock.r + 0.7152 * steepRock.g + 0.0722 * steepRock.b;
  const snowLum = 0.2126 * snowSlope.r + 0.7152 * snowSlope.g + 0.0722 * snowSlope.b;
  assert.ok(
    snowLum - rockLum >= 0.35,
    `Snow planes must contrast cleanly against alpine rock faces (rockLum=${rockLum.toFixed(2)}, snowLum=${snowLum.toFixed(2)})`,
  );

  // 5. All flanking mountains stay strictly outside the playable valley corridor
  for (const m of BACKGROUND_MOUNTAIN_SPECS) {
    const isHorizonBackdrop = m.z < -1300;
    if (!isHorizonBackdrop) {
      assert.ok(
        Math.abs(m.x) >= 135,
        `Flanking mountain at z=${m.z} must stay clear of playable track & side hills (x=${m.x})`,
      );
    }
  }
});

test('ambient snowfall starts light, increases monotonically approaching shelter, surges with avalanche danger, and wraps cleanly outside camera lens', () => {
  const startSafe = computeSnowfallTargets({
    progress: 0.0,
    avalancheDanger: 0.0,
    phase: 'playing',
    levelNumber: 1,
  });
  const midSafe = computeSnowfallTargets({
    progress: 0.45,
    avalancheDanger: 0.0,
    phase: 'playing',
    levelNumber: 1,
  });
  const nearShelterSafe = computeSnowfallTargets({
    progress: 0.92,
    avalancheDanger: 0.0,
    phase: 'playing',
    levelNumber: 1,
  });
  const nearShelterDanger = computeSnowfallTargets({
    progress: 0.92,
    avalancheDanger: 0.88,
    phase: 'playing',
    levelNumber: 1,
  });
  const midDanger = computeSnowfallTargets({
    progress: 0.45,
    avalancheDanger: 0.85,
    phase: 'playing',
    levelNumber: 1,
  });

  // 1. Light initial snowfall at top of slope
  assert.ok(
    startSafe.activeCount >= SNOWFALL_CONFIG.minFlakes && startSafe.activeCount <= 260,
    `Expected light initial snowfall <= 260 flakes (got ${startSafe.activeCount})`,
  );
  assert.ok(startSafe.opacity >= 0.4 && startSafe.opacity <= 0.55);

  // 2. Monotonic density & drift ramp as player approaches shelter
  assert.ok(
    midSafe.activeCount > startSafe.activeCount + 60,
    `Mid-slope snowfall (${midSafe.activeCount}) must clearly exceed start (${startSafe.activeCount})`,
  );
  assert.ok(
    nearShelterSafe.activeCount > midSafe.activeCount + 140,
    `Near-shelter snowfall (${nearShelterSafe.activeCount}) must clearly exceed mid-slope (${midSafe.activeCount})`,
  );
  assert.ok(nearShelterSafe.opacity > startSafe.opacity);
  assert.ok(nearShelterSafe.fallSpeed > startSafe.fallSpeed);

  // 3. Approaching avalanche intensifies snowfall & wind surge as visual feedback
  assert.ok(
    midDanger.activeCount > midSafe.activeCount + 120,
    `Close avalanche must visibly boost snowfall density (${midDanger.activeCount} vs ${midSafe.activeCount})`,
  );
  assert.ok(
    Math.abs(midDanger.windDriftZ) > Math.abs(midSafe.windDriftZ) + 1.5,
    'Close avalanche must drive stronger downhill wind-swept snow surge',
  );
  assert.ok(
    nearShelterDanger.activeCount >= nearShelterSafe.activeCount &&
      nearShelterDanger.activeCount <= SNOWFALL_CONFIG.maxFlakes,
  );
  // Keep opacity bounded so gameplay obstacles always remain clearly readable
  assert.ok(nearShelterDanger.opacity <= 0.8);

  // 4. Seamless volume wrapping handles large downhill travel & level resets
  const wrappedNeg = wrapSnowflakeCoord(-950, -120, SNOWFALL_CONFIG.boxHalfDepth);
  assert.ok(
    wrappedNeg >= -120 - SNOWFALL_CONFIG.boxHalfDepth &&
      wrappedNeg <= -120 + SNOWFALL_CONFIG.boxHalfDepth,
  );

  // 5. Camera-lens exclusion pushes snowflakes away from direct lens collision
  const out = { x: 0, y: 0, z: 0 };
  stepSnowflakePosition(
    {
      x: 0.1,
      y: 5.05,
      z: 9.7,
      speedScale: 1,
      phase: 1.5,
      dt: 0.016,
      time: 2.0,
      targets: nearShelterDanger,
      centerX: 0,
      centerY: 5,
      centerZ: -16,
      cameraX: 0,
      cameraY: 5,
      cameraZ: 9.8,
    },
    out,
  );
  const camDist = Math.hypot(out.x - 0, out.y - 5, out.z - 9.8);
  assert.ok(
    camDist >= SNOWFALL_CONFIG.cameraClearanceRadius,
    `Snowflake must stay clear of camera lens (dist=${camDist.toFixed(2)}m)`,
  );
});

test('opening video replaces title thumbnail with end-of-video PLAY button and OutcomeOverlay preserves hero size without text overlap', () => {
  // 1. Opening video asset exists on disk and is wired in GameHUD.tsx
  const videoRelPath = 'public/assets/aistudio/202611221927_31369b59.mp4';
  const videoAbsPath = path.join(process.cwd(), videoRelPath);
  assert.equal(fs.existsSync(videoAbsPath), true, `Missing opening video asset: ${videoAbsPath}`);
  assert.ok(fs.statSync(videoAbsPath).size > 50_000, 'Expected real MP4 payload for opening video');

  const gameHudSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/GameHUD.tsx'),
    'utf8',
  );
  assert.equal(
    gameHudSrc.includes("'/assets/aistudio/202611221927_31369b59.mp4'"),
    true,
    'GameHUD.tsx must reference the new opening MP4 video',
  );
  assert.equal(
    gameHudSrc.includes('lofi-thumbnail_3eb5d1a2.png') ||
      gameHudSrc.includes('202611221710_bf3dabda.mp4'),
    false,
    'Previous title thumbnail and old opening video must no longer be referenced',
  );
  assert.equal(
    gameHudSrc.includes('onEnded={() => setIntroVideoEnded(true)}'),
    true,
    'Opening video must reveal PLAY via onEnded',
  );
  assert.equal(
    gameHudSrc.includes('{introVideoEnded && ('),
    true,
    'PLAY button must be gated behind introVideoEnded',
  );

  // 2. OutcomeOverlay preserves exact heroSizeClass dimensions while preventing stage collapse overlap
  const outcomeSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/OutcomeOverlay.tsx'),
    'utf8',
  );
  assert.equal(
    outcomeSrc.includes('md:max-h-[382px] md:max-w-[430px]'),
    true,
    'Hero victory dimensions must remain preserved unchanged',
  );
  assert.equal(
    outcomeSrc.includes('flex-1 min-h-0'),
    false,
    'Hero character stage must NOT collapse with flex-1 min-h-0 (causes text overlap on short viewports)',
  );
  assert.equal(
    outcomeSrc.includes('text-[clamp(26px,4vw,46px)]'),
    true,
    'Heading must use responsive clamp(26px, 4vw, 46px) scale',
  );
  assert.equal(
    outcomeSrc.includes('text-[clamp(12px,1.2vw,16px)]'),
    true,
    'Subtitle must use responsive clamp(12px, 1.2vw, 16px) scale',
  );
  assert.equal(
    outcomeSrc.includes('text-[clamp(12px,1.1vw,15px)]'),
    true,
    'Arrival panel text must use responsive clamp(12px, 1.1vw, 15px) scale',
  );
  assert.equal(
    outcomeSrc.includes('overflow-y-auto') && outcomeSrc.includes('my-auto'),
    true,
    'OutcomeOverlay must allow clean vertical scrolling fallback without clipping the top header',
  );
});

test('randomized wind gusts trigger subtle steering push, zero camera screen-shake, particle pushing, and wind audio swell', () => {
  // 1. Opening calm grace period keeps launch completely steady (protects clean launch & zero auto-turn)
  const gust = createWindGustState(424242);
  for (let i = 0; i < 55; i++) {
    stepWindGust(gust, 0.05, 1); // 2.75s < initialGraceMin (3.0s)
    assert.equal(gust.active, false);
    assert.equal(gust.intensity, 0);
    assert.equal(gust.signedForce, 0);
    assert.equal(getWindGustSteeringAccel(gust, 1, false), 0);
  }

  // 2. Randomized scheduler over 60s produces multiple varied gusts across both -1 and +1 directions
  const seenDirs = new Set<number>();
  const seenDurations: number[] = [];
  const seenPeaks: number[] = [];
  let lastCount = 0;
  for (let i = 0; i < 1200; i++) {
    stepWindGust(gust, 0.05, 4);
    if (gust.gustCount !== lastCount) {
      lastCount = gust.gustCount;
      seenDirs.add(gust.direction);
      seenDurations.push(gust.duration);
      seenPeaks.push(gust.peakStrength);
    }
    assert.ok(gust.intensity >= 0 && gust.intensity <= 1);
    assert.ok(Math.abs(gust.signedForce) <= 1.0001);
  }
  assert.ok(gust.gustCount >= 5, `Expected at least 5 gusts over 60s (got ${gust.gustCount})`);
  assert.equal(seenDirs.size, 2, 'Randomized gusts must blow in both left (-1) and right (+1) directions');
  const uniqueDurations = new Set(seenDurations.map((d) => d.toFixed(3)));
  assert.ok(uniqueDurations.size >= 3, 'Gust durations should vary organically');

  // Different seeds must produce distinct randomized gust schedules
  const gustA = createWindGustState(11111);
  const gustB = createWindGustState(99999);
  assert.notEqual(gustA.cooldown, gustB.cooldown);

  // 3. Steering push: active gust gently nudges unsteered rider and increases upwind steering resistance
  //    while player manual carving authority comfortably dominates even on Level 10
  const maxLv10Accel =
    WIND_GUST_CONFIG.baseSteeringPushAccel * (1 + 9 * WIND_GUST_CONFIG.levelStrengthBonus);
  assert.ok(
    SIM_CONFIG.lateralAccel > maxLv10Accel * 3.8,
    `Manual steering (${SIM_CONFIG.lateralAccel}) must easily overpower peak Lv10 gust (${maxLv10Accel.toFixed(2)})`,
  );

  const simNeutral = createInitialSimulationState('playing', 777, 1);
  simNeutral.obstacles = [];
  simNeutral.windGust.active = true;
  simNeutral.windGust.elapsed = 1.2;
  simNeutral.windGust.duration = 3.0;
  simNeutral.windGust.direction = 1;
  simNeutral.windGust.peakStrength = 1.0;
  simNeutral.windGust.intensity = 0.9;
  simNeutral.windGust.signedForce = 0.9;
  const startLatOffset = simNeutral.lateralOffset;
  const neutralInput = createInitialInput();
  for (let i = 0; i < 12; i++) {
    stepSimulation(simNeutral, neutralInput, 0.025);
  }
  assert.ok(
    simNeutral.lateralVelocity > 0.5 && simNeutral.lateralOffset > startLatOffset + 0.05,
    `Rightward gust should gently push unsteered rider right (vel=${simNeutral.lateralVelocity.toFixed(2)}, dx=${(simNeutral.lateralOffset - startLatOffset).toFixed(2)})`,
  );

  // Counter-steering upwind vs calm: upwind steering covers slightly less distance (slightly harder) yet still carves cleanly upwind
  const simCalmSteer = createInitialSimulationState('playing', 777, 1);
  simCalmSteer.obstacles = [];
  simCalmSteer.windGust.active = false;
  simCalmSteer.windGust.cooldown = 30;

  const simUpwindSteer = createInitialSimulationState('playing', 777, 1);
  simUpwindSteer.obstacles = [];
  simUpwindSteer.windGust.active = true;
  simUpwindSteer.windGust.elapsed = 1.0;
  simUpwindSteer.windGust.duration = 3.2;
  simUpwindSteer.windGust.direction = 1; // pushing right while player steers left
  simUpwindSteer.windGust.peakStrength = 1.0;
  simUpwindSteer.windGust.intensity = 0.95;
  simUpwindSteer.windGust.signedForce = 0.95;

  const leftInput = { ...createInitialInput(), left: true };
  for (let i = 0; i < 16; i++) {
    stepSimulation(simCalmSteer, leftInput, 0.025);
    stepSimulation(simUpwindSteer, leftInput, 0.025);
  }
  assert.ok(
    simUpwindSteer.lateralVelocity < -5,
    `Player must still carve strongly upwind (got vel=${simUpwindSteer.lateralVelocity.toFixed(2)})`,
  );
  assert.ok(
    Math.abs(simUpwindSteer.lateralOffset) < Math.abs(simCalmSteer.lateralOffset) - 0.15,
    'Upwind crosswind gust should make carving against the wind slightly more difficult than calm air',
  );

  // 4. Camera screen-shake is strictly disabled (exact 0 calm & peak gust, landscape & portrait)
  const calmShake = computeWindGustCameraShake(0, 1, 5.2, false);
  assert.deepEqual(calmShake, { offsetX: 0, offsetY: 0, lookOffsetX: 0, lookOffsetY: 0 });
  assert.equal(WIND_GUST_CONFIG.shakeMaxPosXLandscape, 0);
  assert.equal(WIND_GUST_CONFIG.shakeMaxPosYLandscape, 0);
  assert.equal(WIND_GUST_CONFIG.shakeMaxPosXPortrait, 0);
  assert.equal(WIND_GUST_CONFIG.shakeMaxPosYPortrait, 0);

  for (let t = 0; t < 4; t += 0.07) {
    const ls = computeWindGustCameraShake(1.0, -1, t, false);
    const pt = computeWindGustCameraShake(1.0, 1, t, true);
    assert.deepEqual(ls, { offsetX: 0, offsetY: 0, lookOffsetX: 0, lookOffsetY: 0 });
    assert.deepEqual(pt, { offsetX: 0, offsetY: 0, lookOffsetX: 0, lookOffsetY: 0 });
  }

  // 5. Particle-pushing effects on BOTH ambient snowfall and 3D snow spray particles + spatial wind audio swell
  const pushRight = computeWindGustParticlePush(0.95);
  const pushLeft = computeWindGustParticlePush(-0.95);
  assert.ok(pushRight.snowfallPushX > 10 && pushRight.sprayPushX > 7);
  assert.ok(pushLeft.snowfallPushX < -10 && pushLeft.sprayPushX < -7);
  assert.ok(pushRight.flutterBoost > 1.0);

  const snowCalm = computeSnowfallTargets({ phase: 'playing', levelNumber: 1, progress: 0.3, avalancheDanger: 0.1, windGustForce: 0 });
  const snowRight = computeSnowfallTargets({ phase: 'playing', levelNumber: 1, progress: 0.3, avalancheDanger: 0.1, windGustForce: 0.9 });
  const snowLeft = computeSnowfallTargets({ phase: 'playing', levelNumber: 1, progress: 0.3, avalancheDanger: 0.1, windGustForce: -0.9 });
  assert.ok(snowRight.windDriftX > snowCalm.windDriftX + 10, 'Rightward gust must push snowfall flakes strongly +X');
  assert.ok(snowLeft.windDriftX < snowCalm.windDriftX - 10, 'Leftward gust must push snowfall flakes strongly -X');
  assert.ok(snowRight.opacity <= 0.79, 'Snowfall gust opacity must stay comfortably readable');

  const windSampleCalm = { x: 0, y: 0, z: 0 };
  const windSampleGust = { x: 0, y: 0, z: 0 };
  sampleAlpineWind(4.0, 0, -20, 2.2, 1, windSampleCalm, 0, 0);
  sampleAlpineWind(4.0, 0, -20, 2.2, 1, windSampleGust, pushRight.sprayPushX, pushRight.sprayPushZ);
  assert.ok(
    windSampleGust.x > windSampleCalm.x + 7,
    `3D snow spray wind field must accelerate strongly in gust direction (${windSampleCalm.x.toFixed(2)} -> ${windSampleGust.x.toFixed(2)})`,
  );

  // Verify 3D particle step actually pushes airborne snow particles laterally when gust is active
  const pCalm: ParticleKinematics = {
    x: 0,
    y: 2.5,
    z: -20,
    vx: 0,
    vy: 1.5,
    vz: -4,
    gravityScale: 0.45,
    drag: 2.6,
    windFactor: 1.15,
    restitution: 0.12,
    friction: 0.72,
    radius: 0.14,
    kind: PARTICLE_KIND.MIST,
    bounceCount: 0,
    settled: false,
  };
  const pGust: ParticleKinematics = { ...pCalm };
  const stepOut: ParticleStepResult = {
    collided: false,
    impactSpeed: 0,
    shouldEmitSplash: false,
    groundY: 0,
    nx: 0,
    ny: 1,
    nz: 0,
  };
  for (let i = 0; i < 12; i++) {
    stepSnowParticlePhysics(pCalm, 0.025, 4 + i * 0.025, 1, [], stepOut, 0, 0);
    stepSnowParticlePhysics(
      pGust,
      0.025,
      4 + i * 0.025,
      1,
      [],
      stepOut,
      pushRight.sprayPushX,
      pushRight.sprayPushZ,
    );
  }
  assert.ok(
    pGust.x > pCalm.x + 0.35,
    `Gust must visibly push airborne snow spray particles sideways (calmX=${pCalm.x.toFixed(2)}, gustX=${pGust.x.toFixed(2)})`,
  );

  // Spatial wind audio swells smoothly during gusts and stays identical when calm
  const audioCalm = computeAmbientAudioTargets({
    active: true, muted: false, speedRatio: 1, forwardSpeed: 24,
    carveIntensity: 0, avalancheDanger: 0, airborne: false, lean: 0,
    heightAboveGround: 0, windGustIntensity: 0, windGustDirection: 1,
  });
  const audioGust = computeAmbientAudioTargets({
    active: true, muted: false, speedRatio: 1, forwardSpeed: 24,
    carveIntensity: 0, avalancheDanger: 0, airborne: false, lean: 0,
    heightAboveGround: 0, windGustIntensity: 0.9, windGustDirection: 1,
  });
  assert.ok(audioGust.windGain > audioCalm.windGain + 0.05 && audioGust.windGain <= 0.29);
  assert.ok(audioGust.windFilterFreq > audioCalm.windFilterFreq + 200);
  assert.ok(audioGust.windOffsetX < audioCalm.windOffsetX - 2.0);
});

test('dynamic depth-based fog thickens cleanly at higher altitudes and inside blizzard sections while keeping obstacles readable', () => {
  // 1. Baseline clear Level 1 foothills matches crisp alpine baseline density
  const lv1Clear = computeDynamicFogTargets({
    phase: 'playing',
    levelNumber: 1,
    distance: 40,
    levelLength: 780,
    windGustIntensity: 0,
    avalancheDanger: 0,
    time: 0,
  });
  assert.equal(lv1Clear.blizzardIntensity, 0);
  assert.ok(
    Math.abs(lv1Clear.density - DYNAMIC_FOG_CONFIG.baseDensity) < 0.0002,
    `Expected Lv1 clear fog density near ${DYNAMIC_FOG_CONFIG.baseDensity}, got ${lv1Clear.density}`,
  );
  assert.ok(lv1Clear.skyHazeAmount < 0.05);
  assert.ok(lv1Clear.keyLightScale >= 0.98);

  // 2. Ascending mountain altitudes (Level 1 -> 4 -> 7 -> 10) monotonically thickens depth fog outside blizzards
  const altSamples = [1, 4, 7, 10].map((lv) => {
    const len = LEVEL_CONFIGS[lv - 1].length;
    const alt = computeMountainAltitudeFactor(lv, 40, len);
    const fog = computeDynamicFogTargets({
      phase: 'playing',
      levelNumber: lv,
      distance: 40,
      levelLength: len,
      windGustIntensity: 0,
      avalancheDanger: 0,
      time: 0,
    });
    return { lv, alt, density: fog.density, skyHaze: fog.skyHazeAmount };
  });
  for (let i = 1; i < altSamples.length; i++) {
    assert.ok(
      altSamples[i].alt > altSamples[i - 1].alt,
      `Level ${altSamples[i].lv} altitude factor must exceed Level ${altSamples[i - 1].lv}`,
    );
    assert.ok(
      altSamples[i].density > altSamples[i - 1].density + 0.0007,
      `Level ${altSamples[i].lv} clear depth fog (${altSamples[i].density.toFixed(5)}) must thicken over Level ${altSamples[i - 1].lv} (${altSamples[i - 1].density.toFixed(5)})`,
    );
  }
  assert.ok(
    altSamples[3].density >= 0.006,
    `Level 10 Summit high-altitude fog should be noticeably thicker (got ${altSamples[3].density.toFixed(5)})`,
  );

  // 3. Blizzard sections thicken depth fog & sky horizon haze smoothly, and clear near shelter
  for (const lv of [1, 4, 7, 10]) {
    const len = LEVEL_CONFIGS[lv - 1].length;
    const zones = getBlizzardZonesForLevel(lv, len);
    assert.ok(zones.length >= 1, `Level ${lv} should define at least one blizzard section`);
    const midZ = (zones[0].zStart + zones[0].zEnd) * 0.5;
    const clearOutside = computeDynamicFogTargets({
      phase: 'playing',
      levelNumber: lv,
      distance: 25,
      levelLength: len,
    });
    const insideBlizzard = computeDynamicFogTargets({
      phase: 'playing',
      levelNumber: lv,
      distance: midZ,
      levelLength: len,
    });
    assert.ok(
      insideBlizzard.blizzardIntensity >= 0.4,
      `Level ${lv} mid-blizzard intensity must be active (got ${insideBlizzard.blizzardIntensity.toFixed(2)})`,
    );
    assert.ok(
      insideBlizzard.density > clearOutside.density + 0.003,
      `Level ${lv} blizzard fog (${insideBlizzard.density.toFixed(5)}) must thicken significantly over clear track (${clearOutside.density.toFixed(5)})`,
    );
    assert.ok(
      insideBlizzard.skyHazeAmount > clearOutside.skyHazeAmount + 0.2,
      `Level ${lv} blizzard must raise synchronized sky horizon haze`,
    );
    assert.ok(
      insideBlizzard.density <= DYNAMIC_FOG_CONFIG.maxDensityCap,
      `Fog density (${insideBlizzard.density.toFixed(5)}) must never exceed obstacle-readability cap ${DYNAMIC_FOG_CONFIG.maxDensityCap}`,
    );
    assert.ok(
      insideBlizzard.colorB >= insideBlizzard.colorR,
      'Blizzard fog must maintain a cool blue-silver mountain mist palette',
    );

    // Approaching shelter clears blizzard smoothly so the cozy shelter reads clearly
    const shelterBlizzard = sampleBlizzardSectionIntensity(lv, len * 0.985, len);
    assert.ok(
      shelterBlizzard < 0.05,
      `Blizzard should ease out near shelter finish on Level ${lv} (got ${shelterBlizzard.toFixed(3)})`,
    );
  }

  // 4. Victory & Title phases restore crisp visibility cleanly
  const lv10Victory = computeDynamicFogTargets({
    phase: 'victory',
    levelNumber: 10,
    distance: 1500,
    levelLength: 1500,
  });
  const lv10PeakBlizzard = computeDynamicFogTargets({
    phase: 'playing',
    levelNumber: 10,
    distance: 1050,
    levelLength: 1500,
    windGustIntensity: 0.9,
  });
  assert.ok(lv10PeakBlizzard.density >= 0.0135 && lv10PeakBlizzard.density <= DYNAMIC_FOG_CONFIG.maxDensityCap);
  assert.ok(lv10Victory.density < 0.0045 && lv10Victory.blizzardIntensity === 0);

  // 5. Exponential damping transitions smoothly without sudden pops
  const liveFog = createDynamicFogState();
  stepDynamicFogState(
    liveFog,
    { phase: 'playing', levelNumber: 10, distance: 35, levelLength: 1500 },
    0.016,
    true,
  );
  const startDensity = liveFog.density;
  stepDynamicFogState(
    liveFog,
    { phase: 'playing', levelNumber: 10, distance: 1050, levelLength: 1500 },
    0.05,
    false,
  );
  assert.ok(
    liveFog.density > startDensity && liveFog.density < lv10PeakBlizzard.density - 0.004,
    'Damped fog step should ease smoothly rather than snapping in one frame',
  );
  for (let i = 0; i < 80; i++) {
    stepDynamicFogState(
      liveFog,
      { phase: 'playing', levelNumber: 10, distance: 1050, levelLength: 1500 },
      0.05,
      false,
    );
  }
  assert.ok(liveFog.density > 0.013, 'Damped fog should converge cleanly inside a sustained blizzard');

  // 6. Blizzard intensity unifies with snowfall system without exceeding opacity cap
  const snowClear = computeSnowfallTargets({
    phase: 'playing',
    levelNumber: 7,
    progress: 0.3,
    avalancheDanger: 0,
    blizzardIntensity: 0,
  });
  const snowBlizzard = computeSnowfallTargets({
    phase: 'playing',
    levelNumber: 7,
    progress: 0.3,
    avalancheDanger: 0,
    blizzardIntensity: 0.92,
  });
  assert.ok(snowBlizzard.activeCount > snowClear.activeCount + 120);
  assert.ok(snowBlizzard.windDriftX > snowClear.windDriftX + 3.0);
  assert.ok(snowBlizzard.opacity <= 0.8);
});

test('Lil Yeti collectibles spawn deterministically clear of obstacles along the path, award live run score without altering crew or speed, and reset cleanly', () => {
  // 1. Deterministic placement & obstacle clearance across all 10 levels
  for (const level of LEVEL_CONFIGS) {
    setActiveTrackProfile(level.levelNumber);
    const obstacles = buildLevelObstacles(level, level.spawnSeed);
    const itemsA = spawnLevelCollectibles(level, obstacles, level.spawnSeed);
    const itemsB = spawnLevelCollectibles(level, obstacles, level.spawnSeed);

    assert.equal(itemsA.length, itemsB.length, `Level ${level.levelNumber}: spawning must be deterministic`);
    assert.ok(
      itemsA.length >= 10 && itemsA.length <= COLLECTIBLE_CONFIG.maxCollectibles,
      `Level ${level.levelNumber}: expected 10..${COLLECTIBLE_CONFIG.maxCollectibles} collectibles, got ${itemsA.length}`,
    );

    // First collectible sits cleanly on the opening straightaway for immediate visibility
    assert.equal(itemsA[0].z, COLLECTIBLE_CONFIG.firstCollectibleZ);
    assert.equal(itemsA[0].offsetX, 0);

    for (let i = 0; i < itemsA.length; i++) {
      const c = itemsA[i];
      const halfW = getTrackHalfWidth(c.z);
      assert.ok(
        Math.abs(c.offsetX) <= halfW - 2.0,
        `Level ${level.levelNumber}: collectible #${c.id} must stay well inside playable snow bounds`,
      );
      assert.equal(c.collected, false);
      assert.equal(c.points, COLLECTIBLE_CONFIG.pointsPerLilYeti);
      if (i > 0) {
        assert.ok(c.z > itemsA[i - 1].z, 'Collectibles must be sorted ascending along downhill Z');
      }

      // Clearance from every rock & pine obstacle
      for (const obs of obstacles) {
        if (obs.kind === 'fallen_log') continue;
        const dist = Math.hypot(obs.worldX - c.worldX, obs.z - c.z);
        assert.ok(
          dist >= obs.radius + COLLECTIBLE_CONFIG.minObstacleClearance - 0.05,
          `Level ${level.levelNumber}: collectible #${c.id} overlaps ${obs.kind} #${obs.id} (dist=${dist.toFixed(2)}m)`,
        );
      }
    }
  }

  // 2. Riding straight down Level 1 collects the opening Lil Yeti collectible without slowing Lofi or changing follower count
  const state = createInitialSimulationState('playing', undefined, 1);
  const input = createInitialInput();
  const initialHud = buildHudSnapshot(state, null);
  assert.equal(initialHud.score, 0);
  assert.equal(initialHud.collectedCollectibles, 0);
  assert.equal(initialHud.totalCollectibles, state.collectibles.length);
  assert.equal(initialHud.scoreFeedbackActive, false);

  let totalPickupEvents = 0;
  let lastPickupPos: { x: number; y: number; z: number } | null = null;
  let speedBeforePickup = 0;
  let speedAfterPickup = 0;

  // Step 2.4s straight down Level 1 (reaches ~62m, cleanly passing z=44m)
  for (let i = 0; i < 80; i++) {
    const preSpeed = state.forwardSpeed;
    const ev = stepSimulation(state, input, 0.03);
    if (ev.collectedCount > 0) {
      totalPickupEvents += ev.collectedCount;
      lastPickupPos = ev.lastCollectedPos;
      speedBeforePickup = preSpeed;
      speedAfterPickup = state.forwardSpeed;
    }
  }

  assert.equal(totalPickupEvents, 1, 'Opening Lil Yeti collectible must be collected exactly once (never double-counted)');
  assert.ok(lastPickupPos !== null, 'Pickup event must emit world position for sparkle burst');
  assert.equal(state.collectibles[0].collected, true);
  assert.ok(
    state.collectibles[0].collectAnimProgress >= 0.99,
    'Collected Lil Yeti pop-out animation must advance cleanly to 1.0',
  );
  assert.equal(state.score, COLLECTIBLE_CONFIG.pointsPerLilYeti);
  assert.equal(state.collectedCollectiblesCount, 1);
  assert.equal(state.followers.length, 0, 'Collecting path collectibles must NEVER alter trailing crew count (levelNumber - 1)');
  assert.ok(
    speedAfterPickup >= speedBeforePickup - 0.01,
    'Collecting a Lil Yeti must never slow Lofi down',
  );

  // Collect a second collectible directly to verify cumulative score & HUD feedback pulse
  const second = state.collectibles[1];
  state.distance = second.z - 0.3;
  state.lateralOffset = second.offsetX;
  const ev2 = stepSimulation(state, input, 0.02);
  assert.equal(ev2.collectedCount, 1);
  assert.equal(ev2.collectedPoints, COLLECTIBLE_CONFIG.pointsPerLilYeti);
  assert.equal(state.score, COLLECTIBLE_CONFIG.pointsPerLilYeti * 2);
  assert.equal(state.collectedCollectiblesCount, 2);

  const liveHud = buildHudSnapshot(state, null);
  assert.equal(liveHud.score, 200);
  assert.equal(liveHud.collectedCollectibles, 2);
  assert.equal(liveHud.totalCollectibles, state.collectibles.length);
  assert.equal(liveHud.scoreFeedbackActive, true);

  // 3. Retry, Next Level, and Start New Game all reset score and collectibles cleanly
  retryCurrentLevel(state, 'playing');
  assert.equal(state.score, 0);
  assert.equal(state.collectedCollectiblesCount, 0);
  assert.equal(state.collectibles.every((c) => !c.collected && c.collectAnimProgress === 0), true);

  // Finish Level 1 and advance to Level 2
  state.distance = state.levelLength - 0.2;
  state.score = 300;
  state.collectedCollectiblesCount = 3;
  stepSimulation(state, input, 0.05);
  assert.equal(state.phase, 'victory');
  assert.equal(advanceToNextLevel(state), true);
  assert.equal(state.levelNumber, 2);
  assert.equal(state.score, 0);
  assert.equal(state.collectedCollectiblesCount, 0);
  assert.equal(state.followers.length, 1);
  assert.equal(state.collectibles.every((c) => !c.collected), true);

  // Start New Game resets back to Level 1 with score = 0
  state.score = 500;
  startNewGame(state, 'playing');
  assert.equal(state.levelNumber, 1);
  assert.equal(state.score, 0);
  assert.equal(state.collectedCollectiblesCount, 0);
});

test('Level 3 steep-descent challenge: terrain, warning, gravity/brake balance, 4-state camera, Lil Yetis spacing, Levels 1-2 untouched, and clean resets', () => {
  // 1. Levels 1 & 2 remain completely unchanged (zero steep descents, constant base pitch)
  for (const lvl of [1, 2]) {
    const cfg = LEVEL_CONFIGS[lvl - 1];
    assert.equal(cfg.steepDescents, undefined, `Level ${lvl} must have no steep descents`);
    const sample = evaluateSteepDescentAt(cfg.steepDescents, 620);
    assert.equal(sample.phase, 'NORMAL');
    assert.equal(sample.warningActive, false);
    assert.equal(sample.slopeFactor, 0);
    assert.ok(
      Math.abs(getTrackPitchAt(lvl, 620) - -Math.atan(SLOPE_GRADIENT)) < 1e-6,
      `Level ${lvl} slope pitch must remain baseline SLOPE_GRADIENT`,
    );
  }

  // 2. Level 3 has exactly one short, wide steep downhill section with sparse obstacles and gentle post-landing recovery
  const lv3 = LEVEL_CONFIGS[2];
  assert.ok(lv3.steepDescents && lv3.steepDescents.length === 1, 'Level 3 must have exactly 1 steep descent zone');
  const zone = lv3.steepDescents![0];
  assert.equal(UI_COPY.hud.steepDropWarning, 'STEEP DROP — HOLD TO BRAKE');
  assert.equal(UI_COPY.hud.mobileBrake, 'BRAKE');

  // Elevation drops clearly steeper inside [zStart, zEnd] and remains C^1/C^2 smooth at boundaries
  const midZ = (zone.zStart + zone.zEnd) * 0.5;
  const normalPitch = Math.abs(getTrackPitchAt(3, 200));
  const steepPitch = Math.abs(getTrackPitchAt(3, midZ));
  assert.ok(
    steepPitch > normalPitch + 0.22,
    `Steep midpoint pitch (${steepPitch.toFixed(3)}) must clearly exceed normal slope (${normalPitch.toFixed(3)})`,
  );
  const yStart = getTrackElevationForLevel(3, zone.zStart);
  const yEnd = getTrackElevationForLevel(3, zone.zEnd);
  const baseDrop = (zone.zEnd - zone.zStart) * SLOPE_GRADIENT;
  assert.ok(
    yStart - yEnd > baseDrop + 10,
    `Steep slope must drop noticeably more elevation than regular slope (${(yStart - yEnd).toFixed(1)}m vs ${baseDrop.toFixed(1)}m)`,
  );

  // Track widens across steep slope & recovery bowl compared to baseline Level 3 width, and recovery area has no sharp turn right after landing
  const wBaseline = getTrackHalfWidthForLevel(3, 250);
  const wSlope = getTrackHalfWidthForLevel(3, midZ);
  const wRecovery = getTrackHalfWidthForLevel(3, zone.zEnd + 30);
  assert.ok(wSlope > wBaseline + 2.5, `Steep slope half-width (${wSlope.toFixed(1)}) must be wide vs baseline (${wBaseline.toFixed(1)})`);
  assert.ok(wRecovery > wBaseline + 2.0, `Recovery landing half-width (${wRecovery.toFixed(1)}) must be wide vs baseline (${wBaseline.toFixed(1)})`);
  for (let z = zone.zEnd; z <= zone.zEnd + 55; z += 5) {
    const absTurnSlope = Math.abs(
      getTrackCenterXForLevel(3, z + 0.5) - getTrackCenterXForLevel(3, z - 0.5),
    );
    assert.ok(
      absTurnSlope < 0.22,
      `Recovery zone at z=${z}m must not have a sharp turn immediately after landing (|dx/dz|=${absTurnSlope.toFixed(3)})`,
    );
  }

  // Sparse obstacles inside steep descent with wide open center carving corridor
  const lv3Sim = createInitialSimulationState('playing', undefined, 3);
  assert.equal(lv3Sim.followers.length, 2, 'Level 3 must still start with Lofi + 2 Lil Yetis');
  const steepObstacles = lv3Sim.obstacles.filter(
    (o) => o.z >= zone.zStart - 4 && o.z <= zone.zEnd + 10,
  );
  assert.ok(
    steepObstacles.length <= 4,
    `Obstacles inside steep descent must stay sparse (found ${steepObstacles.length})`,
  );
  const centerBlocking = steepObstacles.filter((o) => Math.abs(o.offsetX) < 3.5);
  assert.equal(centerBlocking.length, 0, 'Center carving line through steep drop must stay clear');

  // 3. Gravity accelerates unbraked Lofi on the steep slope & excessive speed makes steering harder
  const unbraked = createInitialSimulationState('playing', undefined, 3);
  unbraked.obstacles = [];
  unbraked.windGust.cooldown = 999;
  unbraked.distance = zone.zStart - 4;
  unbraked.travelDistance = zone.zStart - 4;
  const startSpeed = unbraked.forwardSpeed;
  const neutralIn = createInitialInput();
  let peakUnbrakedSpeed = startSpeed;
  let sawWarning = false;
  let sawDescent = false;
  let sawRecovery = false;
  for (let i = 0; i < 140; i++) {
    stepSimulation(unbraked, neutralIn, 0.03);
    if (unbraked.forwardSpeed > peakUnbrakedSpeed) peakUnbrakedSpeed = unbraked.forwardSpeed;
    if (unbraked.steepWarningActive) sawWarning = true;
    if (unbraked.steepPhase === 'DESCENT') sawDescent = true;
    if (unbraked.steepPhase === 'RECOVERY') sawRecovery = true;
  }
  assert.equal(sawWarning, true, 'Warning banner state must trigger ahead of steep slope');
  assert.equal(sawDescent, true, 'DESCENT phase must trigger on the steep slope');
  assert.equal(sawRecovery, true, 'RECOVERY phase must trigger in the landing area');
  assert.ok(
    peakUnbrakedSpeed > startSpeed + 6.0,
    `Gravity must accelerate Lofi on steep slope (${startSpeed.toFixed(1)} -> ${peakUnbrakedSpeed.toFixed(1)} m/s)`,
  );

  // Excessive speed degrades steering acceleration & lateral damping compared to cruise speed
  const cruiseBal = computeSpeedSteerBalance(lv3.baseSpeed, lv3.baseSpeed, 0, false);
  const fastBal = computeSpeedSteerBalance(peakUnbrakedSpeed, lv3.baseSpeed, 0, false);
  assert.ok(
    fastBal.steerAccelMult < cruiseBal.steerAccelMult - 0.18,
    `Overspeed must reduce steering authority (${fastBal.steerAccelMult.toFixed(2)} vs ${cruiseBal.steerAccelMult.toFixed(2)})`,
  );
  assert.ok(
    fastBal.lateralDampingMult < cruiseBal.lateralDampingMult - 0.18,
    `Overspeed must reduce lateral damping (${fastBal.lateralDampingMult.toFixed(2)} vs ${cruiseBal.lateralDampingMult.toFixed(2)})`,
  );

  // 4. Smooth braking reduces speed without stopping instantly, keeps steering active, widens snow spray,
  //    and excessive braking allows the avalanche to close in and threaten the player
  const braked = createInitialSimulationState('playing', undefined, 3);
  braked.obstacles = [];
  braked.windGust.cooldown = 999;
  braked.distance = zone.zStart + 10;
  braked.travelDistance = zone.zStart + 10;
  braked.forwardSpeed = lv3.baseSpeed + 5;
  const speedBeforeBrake = braked.forwardSpeed;
  const avalBeforeBrake = braked.avalancheDistance;
  const brakeSteerIn = { ...createInitialInput(), brake: true, right: true };

  // First single frame of braking must NOT stop the board instantly
  stepSimulation(braked, brakeSteerIn, 0.03);
  assert.ok(
    braked.forwardSpeed > speedBeforeBrake - 2.0 && braked.forwardSpeed >= STEEP_DESCENT_CONFIG.minBrakeSpeed,
    `Brake must decelerate smoothly, never instant-stop (speed=${braked.forwardSpeed.toFixed(2)})`,
  );
  assert.ok(braked.brakeAmount > 0.1 && braked.brakeAmount < 0.6, 'brakeAmount must ramp smoothly');

  // Continue braking while steering right: speed drops smoothly, steering stays active, snow spray widens
  let peakSteerLatVel = 0;
  for (let i = 0; i < 40; i++) {
    stepSimulation(braked, brakeSteerIn, 0.03);
    if (braked.lateralVelocity > peakSteerLatVel) {
      peakSteerLatVel = braked.lateralVelocity;
    }
  }
  assert.ok(
    braked.forwardSpeed < speedBeforeBrake - 6.0 && braked.forwardSpeed >= STEEP_DESCENT_CONFIG.minBrakeSpeed,
    `Sustained braking must lower speed smoothly toward minBrakeSpeed (speed=${braked.forwardSpeed.toFixed(2)})`,
  );
  assert.ok(
    peakSteerLatVel > 5.0 && braked.lateralOffset > 4.0,
    `Steering must remain active while holding brake (peakLatVel=${peakSteerLatVel.toFixed(2)}, offset=${braked.lateralOffset.toFixed(2)})`,
  );
  const sprayNormal = computeCarveDustProfile(0, braked.forwardSpeed, 'GROUNDED', 0);
  const sprayBraking = computeCarveDustProfile(0, braked.forwardSpeed, 'GROUNDED', braked.brakeAmount);
  assert.equal(sprayNormal.active, false);
  assert.equal(sprayBraking.active, true);
  assert.ok(sprayBraking.burstCount >= 6, 'Braking must produce wider snow spray bursts');

  // Excessive braking on flat/normal slope lets avalanche close in and threaten the player
  const overBraked = createInitialSimulationState('playing', undefined, 3);
  overBraked.obstacles = [];
  overBraked.windGust.cooldown = 999;
  const brakeOnly = { ...createInitialInput(), brake: true };
  for (let i = 0; i < 120; i++) {
    stepSimulation(overBraked, brakeOnly, 0.03);
  }
  assert.ok(
    overBraked.avalancheDistance < avalBeforeBrake - 12,
    `Excessive braking must allow avalanche to approach and threaten Lofi (${avalBeforeBrake.toFixed(1)} -> ${overBraked.avalancheDistance.toFixed(1)}m)`,
  );

  // 5. 4-State camera transition: NORMAL -> APPROACH -> DESCENT -> RECOVERY -> NORMAL
  //    Smooth interpolation (~0.8-1.2s), never sudden cut, stays strictly behind Lofi
  const camState = createSteepCameraRigState();
  assert.equal(camState.phase, 'NORMAL');
  assert.equal(camState.extraBack, 0);
  assert.equal(camState.extraHeight, 0);

  let maxStepBack = 0;
  let prevBack = 0;
  for (let i = 0; i < 34; i++) {
    stepSteepCameraRigState(camState, 'APPROACH', 0, false, 0.03);
    maxStepBack = Math.max(maxStepBack, Math.abs(camState.extraBack - prevBack));
    prevBack = camState.extraBack;
  }
  assert.ok(camState.extraBack > 2.2 && camState.extraHeight > 1.8, 'APPROACH must smoothly elevate & pull back');
  assert.ok(maxStepBack < 0.35, `Camera transition must be smooth with zero sudden cut (maxStep=${maxStepBack.toFixed(3)})`);

  for (let i = 0; i < 36; i++) {
    stepSteepCameraRigState(camState, 'DESCENT', 1.0, false, 0.03);
  }
  assert.ok(
    camState.extraBack > 4.2 && camState.extraHeight > 3.6 && camState.lookDownBias < -1.8,
    'DESCENT camera must reveal slope & landing area from higher & farther behind Lofi',
  );

  for (let i = 0; i < 55; i++) {
    stepSteepCameraRigState(camState, 'RECOVERY', 0, false, 0.03);
  }
  assert.ok(
    camState.extraBack < 0.35 && camState.extraHeight < 0.35,
    'RECOVERY must smoothly return camera offsets back toward NORMAL',
  );

  // 6. Lil Yetis follow the steep descent & landing safely, mimic braking, and NEVER stack or collide
  const convoySim = createInitialSimulationState('playing', undefined, 3);
  convoySim.obstacles = [];
  convoySim.windGust.cooldown = 999;
  convoySim.distance = zone.zStart - 35;
  convoySim.travelDistance = zone.zStart - 35;
  convoySim.pathHistory = [];
  for (let d = convoySim.distance - 24; d <= convoySim.distance; d += 0.4) {
    const wx = getTrackCenterX(d);
    convoySim.pathHistory.push({
      travelDistance: d,
      distance: d,
      worldX: wx,
      worldY: getTrackElevationForLevel(3, d),
      heightAboveGround: 0,
      jumpState: 'GROUNDED',
      landingProgress: 0,
      rampPitch: 0,
      grabAmount: 0,
      yaw: 0,
      lean: 0,
      brakeAmount: 0,
      slopePitch: getTrackPitchAt(3, d),
    });
  }

  let minLeaderGap = Infinity;
  let minFollowerPairGap = Infinity;
  let sawFollowerBraking = false;
  for (let i = 0; i < 180; i++) {
    const inDrop = convoySim.distance >= zone.zStart + 6 && convoySim.distance <= zone.zEnd - 12;
    const stepIn = {
      ...createInitialInput(),
      brake: inDrop && i % 2 === 0,
      left: i >= 40 && i < 65,
      right: i >= 80 && i < 105,
    };
    stepSimulation(convoySim, stepIn, 0.03);
    assert.equal(convoySim.followers.length, 2, 'Never lose Lil Yetis during steep descent');

    const lofiX = getTrackCenterX(convoySim.distance) + convoySim.lateralOffset;
    const f0 = convoySim.followers[0];
    const f1 = convoySim.followers[1];
    const gap0 = Math.hypot(lofiX - f0.worldX, convoySim.distance - f0.distance);
    const gap01 = Math.hypot(f0.worldX - f1.worldX, f0.distance - f1.distance);
    minLeaderGap = Math.min(minLeaderGap, gap0);
    minFollowerPairGap = Math.min(minFollowerPairGap, gap01);
    if (f0.brakeAmount > 0.35 && f1.brakeAmount > 0.35) {
      sawFollowerBraking = true;
    }
  }
  assert.ok(
    convoySim.distance > zone.zEnd + 30,
    'Lofi and both Lil Yetis must traverse the steep descent and reach recovery safely',
  );
  assert.equal(sawFollowerBraking, true, 'Both Lil Yetis must mimic braking on the steep section');
  assert.ok(
    minLeaderGap >= 2.1,
    `First Lil Yeti must never collide/stack with Lofi during braking (minGap=${minLeaderGap.toFixed(2)}m)`,
  );
  assert.ok(
    minFollowerPairGap >= 2.1,
    `Lil Yetis must never collide/stack with each other during braking (minGap=${minFollowerPairGap.toFixed(2)}m)`,
  );

  // 7. Retry and Next Level cleanly reset steep descent & camera state without duplication
  retryCurrentLevel(convoySim, 'playing');
  resetSteepCameraRigState(camState);
  assert.equal(convoySim.levelNumber, 3);
  assert.equal(convoySim.followers.length, 2);
  assert.equal(convoySim.steepPhase, 'NORMAL');
  assert.equal(convoySim.brakeAmount, 0);
  assert.equal(convoySim.steepWarningActive, false);
  assert.equal(camState.extraBack, 0);
  assert.equal(LEVEL_CONFIGS[2].steepDescents?.length, 1, 'Retry must not duplicate Level 3 steep descent');

  // Advance from Level 3 Victory -> Level 4 cleanly resets steep descent state
  convoySim.distance = convoySim.levelLength - 0.2;
  stepSimulation(convoySim, createInitialInput(), 0.05);
  assert.equal(convoySim.phase, 'victory');
  assert.equal(advanceToNextLevel(convoySim), true);
  assert.equal(convoySim.levelNumber, 4);
  assert.equal(convoySim.followers.length, 3);
  assert.equal(convoySim.steepPhase, 'NORMAL');
  assert.equal(convoySim.brakeAmount, 0);
  assert.equal(buildHudSnapshot(convoySim, null).hasSteepDescent, true);
});

test('trick system & anti-farming score audit: zero score from flat-ground jump/grab spam, finite ramp & obstacle-clear tricks, collectible multiplier, crash/timeout decay, and clean resets', () => {
  // 1. Pure trick style selection & anti-farming scoring math
  assert.equal(selectGrabTrickStyle(0, false, 0), 'INDY');
  assert.equal(selectGrabTrickStyle(-0.8, false, 0), 'METHOD');
  assert.equal(selectGrabTrickStyle(0.8, false, 0), 'TAIL');
  assert.equal(selectGrabTrickStyle(0, true, 1), 'NOSE');

  // Empty flat-snow jumps & flat-snow grabs MUST strictly award 0 points, 0 multiplier, 0 timer refresh
  const flatPlainJump = evaluateTrickLanding({
    grabbed: false,
    grabHoldTime: 0,
    minGrabHoldSeconds: SIM_CONFIG.minGrabHoldSeconds,
    peakAirHeight: 2.35,
    launchedFromRamp: false,
    clearedObstacle: false,
    grabStyle: 'INDY',
    currentMultiplier: 2,
    currentTimer: 3.0,
  });
  assert.equal(flatPlainJump.awardedTrick, false);
  assert.equal(flatPlainJump.awardedGrab, false);
  assert.equal(flatPlainJump.points, 0);
  assert.equal(flatPlainJump.label, null);
  assert.equal(flatPlainJump.nextMultiplier, 2);
  assert.equal(flatPlainJump.nextTimer, 3.0);

  const flatGrabSpam = evaluateTrickLanding({
    grabbed: true,
    grabHoldTime: 0.45,
    minGrabHoldSeconds: SIM_CONFIG.minGrabHoldSeconds,
    peakAirHeight: 2.35,
    launchedFromRamp: false,
    clearedObstacle: false,
    grabStyle: 'INDY',
    currentMultiplier: 1,
    currentTimer: 0,
  });
  assert.equal(flatGrabSpam.awardedTrick, false);
  assert.equal(flatGrabSpam.awardedGrab, false);
  assert.equal(flatGrabSpam.points, 0);
  assert.equal(flatGrabSpam.nextMultiplier, 1);

  // Obstacle-clear Grab trick awards base grab points & raises multiplier
  const firstObstacleGrab = evaluateTrickLanding({
    grabbed: true,
    grabHoldTime: 0.25,
    minGrabHoldSeconds: SIM_CONFIG.minGrabHoldSeconds,
    peakAirHeight: 1.6,
    launchedFromRamp: false,
    clearedObstacle: true,
    grabStyle: 'INDY',
    currentMultiplier: 1,
    currentTimer: 0,
  });
  assert.equal(firstObstacleGrab.awardedGrab, true);
  assert.equal(firstObstacleGrab.points, TRICK_CONFIG.grabBasePoints);
  assert.equal(firstObstacleGrab.nextMultiplier, 2);
  assert.equal(firstObstacleGrab.label, 'INDY GRAB');

  // Ramp Big Air Grab awards base + big-air bonus × multiplier
  const rampBigGrab = evaluateTrickLanding({
    grabbed: true,
    grabHoldTime: 0.5,
    minGrabHoldSeconds: SIM_CONFIG.minGrabHoldSeconds,
    peakAirHeight: 3.1,
    launchedFromRamp: true,
    clearedObstacle: false,
    grabStyle: 'METHOD',
    currentMultiplier: 3,
    currentTimer: 5,
  });
  assert.equal(
    rampBigGrab.points,
    (TRICK_CONFIG.grabBasePoints + TRICK_CONFIG.bigAirGrabBonus) * 3,
  );
  assert.equal(rampBigGrab.nextMultiplier, 4);
  assert.equal(rampBigGrab.label, 'SUPER METHOD GRAB');

  // Multiplier caps cleanly at TRICK_CONFIG.maxMultiplier (5x)
  const cappedGrab = evaluateTrickLanding({
    grabbed: true,
    grabHoldTime: 0.25,
    minGrabHoldSeconds: SIM_CONFIG.minGrabHoldSeconds,
    peakAirHeight: 1.6,
    launchedFromRamp: false,
    clearedObstacle: true,
    grabStyle: 'TAIL',
    currentMultiplier: TRICK_CONFIG.maxMultiplier,
    currentTimer: 4,
  });
  assert.equal(cappedGrab.nextMultiplier, TRICK_CONFIG.maxMultiplier);

  // 2. Full simulation ANTI-FARMING test: spamming Jump & Grab repeatedly from the start on open snow = 0 score!
  const sim = createInitialSimulationState('playing', 4242, 1);
  sim.obstacles = [];
  sim.ramps = [];
  sim.collectibles = [];
  sim.windGust.cooldown = 999;

  for (let spam = 0; spam < 6; spam++) {
    const spamIn = createInitialInput();
    spamIn.jumpQueued = true;
    spamIn.grab = spam % 2 === 1; // alternate plain jumps and Jump+Grab spam!
    for (let i = 0; i < 80; i++) {
      if (sim.jumpState === 'AIRBORNE' && sim.verticalVelocity < -4.2) {
        spamIn.grab = false;
      }
      const ev = stepSimulation(sim, spamIn, 0.025);
      if (sim.jumpState === 'AIRBORNE' && sim.grabAmount > 0.3) {
        assert.equal(
          buildHudSnapshot(sim, null).canScoreCurrentGrab,
          false,
          'Flat-ground grab must NOT show score multiplier preview in HUD',
        );
      }
      if (ev.landed) {
        assert.equal(ev.landedGrabTrick, false, 'Flat-ground jump spam must never fire landedGrabTrick');
        assert.equal(ev.landedTrickPoints, 0, 'Flat-ground jump spam must award 0 points');
        break;
      }
    }
    const settle = createInitialInput();
    for (let i = 0; i < 10; i++) stepSimulation(sim, settle, 0.025);
  }
  assert.equal(sim.score, 0, 'Repeated jumping/grabbing on open snow must strictly yield 0 score');
  assert.equal(sim.grabCount, 0, 'Repeated flat-ground grabs must not increment grabCount');
  assert.equal(sim.scoreMultiplier, 1, 'Repeated flat-ground jumps must keep multiplier at 1x');
  assert.equal(sim.lastTrickLabel, null);

  // 3. Legitimate scoring: Ramp launch + Grab -> awards Ramp Grab & raises multiplier 1x -> 2x (and deduplicates ramp ID)
  const rampZ = Math.round(sim.distance + 8);
  sim.ramps = [
    {
      id: 901,
      zStart: rampZ,
      length: 13.0,
      height: 2.3,
      width: 6.0,
      offsetX: sim.lateralOffset,
      launchVy: 11.8,
      landingClearMeters: 45,
      kind: 'medium',
    },
  ];
  let landedRampGrab = false;
  let sawEligibleHud = false;
  for (let i = 0; i < 160; i++) {
    const inp = createInitialInput();
    if (sim.jumpState === 'AIRBORNE' && sim.verticalVelocity > -4.2) {
      inp.grab = true;
    }
    const ev = stepSimulation(sim, inp, 0.025);
    if (sim.jumpState === 'AIRBORNE' && sim.grabAmount > 0.3) {
      if (buildHudSnapshot(sim, null).canScoreCurrentGrab) sawEligibleHud = true;
    }
    if (ev.landed) {
      landedRampGrab = ev.landedGrabTrick;
      break;
    }
  }
  assert.equal(sawEligibleHud, true, 'Ramp grab must show live trick HUD eligibility');
  assert.equal(landedRampGrab, true, 'Ramp launch + mid-air grab must award cleanly on landing');
  assert.equal(sim.grabCount, 1);
  assert.equal(sim.scoreMultiplier, 2, 'First landed ramp grab must escalate score multiplier to 2x');
  assert.equal(sim.peakMultiplier, 2);
  assert.equal(
    sim.score,
    TRICK_CONFIG.grabBasePoints + TRICK_CONFIG.bigAirGrabBonus,
    `Ramp big-air grab at 1x must award exact ramp grab points (got ${sim.score})`,
  );
  assert.ok(sim.scoredRampIds.includes(901), 'Scored ramp ID must be recorded to prevent repeat farming');

  // Re-running the same ramp ID (901) must award 0 points (deduplication check)
  const scoreAfterRamp1 = sim.score;
  const dupRampZ = Math.round(sim.distance + 8);
  sim.ramps = [{ ...sim.ramps[0], id: 901, zStart: dupRampZ, offsetX: sim.lateralOffset }];
  for (let i = 0; i < 160; i++) {
    const inp = createInitialInput();
    if (sim.jumpState === 'AIRBORNE' && sim.verticalVelocity > -4.2) inp.grab = true;
    const ev = stepSimulation(sim, inp, 0.025);
    if (ev.landed) break;
  }
  assert.equal(sim.score, scoreAfterRamp1, 'Same ramp ID must never award points twice in one run');
  sim.ramps = [];

  // 4. Legitimate scoring: Jumping cleanly OVER a fallen log + Grab -> awards Obstacle Grab at 2x -> escalates to 3x
  const settle2 = createInitialInput();
  for (let i = 0; i < 10; i++) stepSimulation(sim, settle2, 0.025);
  const logZ = sim.distance + 6.5;
  const logWorldX = getTrackCenterX(logZ);
  sim.obstacles = [
    {
      id: 801,
      kind: 'fallen_log',
      z: logZ,
      offsetX: 0,
      worldX: logWorldX,
      worldY: 0,
      radius: 1.0,
      barHalfWidth: 11.0,
      halfDepthZ: 0.72,
      clearanceHeight: 1.05,
      scale: 1,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      rotationY: 0,
      tiltX: 0,
      tiltZ: 0,
      tint: 1,
      hit: false,
    },
  ];
  const scoreBeforeLogGrab = sim.score;
  const logJumpIn = createInitialInput();
  logJumpIn.jumpQueued = true;
  logJumpIn.grab = true;
  let landedLogGrab = false;
  for (let i = 0; i < 90; i++) {
    if (sim.jumpState === 'AIRBORNE' && sim.verticalVelocity < -4.2) logJumpIn.grab = false;
    const ev = stepSimulation(sim, logJumpIn, 0.025);
    if (ev.landed) {
      landedLogGrab = ev.landedGrabTrick;
      break;
    }
  }
  assert.equal(landedLogGrab, true, 'Jumping cleanly over a fallen log with Grab must award trick points');
  assert.equal(sim.grabCount, 2);
  assert.equal(sim.scoreMultiplier, 3, 'Chained obstacle grab must escalate multiplier to 3x');
  assert.ok(
    sim.score - scoreBeforeLogGrab >= TRICK_CONFIG.grabBasePoints * 2,
    `Obstacle grab at 2x must award at least 2x grabBasePoints (delta=${sim.score - scoreBeforeLogGrab})`,
  );
  assert.ok(sim.scoredObstacleIds.includes(801), 'Cleared obstacle ID must be recorded to prevent repeat farming');

  // 5. Lil Yeti collectible collected while multiplier = 3x awards 3x collectible points & refreshes timer
  const multPickup = applyCollectibleMultiplier(COLLECTIBLE_CONFIG.pointsPerLilYeti, 3, 2.0);
  assert.equal(multPickup.points, COLLECTIBLE_CONFIG.pointsPerLilYeti * 3);
  assert.ok(multPickup.nextTimer > 2.0);

  const scoreBeforePickup = sim.score;
  sim.lateralVelocity = 0;
  const targetZ = sim.distance + sim.forwardSpeed * 0.03;
  const targetX = getTrackCenterX(targetZ) + sim.lateralOffset;
  const targetY = getTrackElevationForLevel(1, targetZ);
  sim.collectibles = [
    {
      id: 999,
      z: targetZ,
      offsetX: sim.lateralOffset,
      worldX: targetX,
      worldY: targetY,
      hoverHeight: 0.75,
      points: COLLECTIBLE_CONFIG.pointsPerLilYeti,
      collected: false,
      collectAnimProgress: 0,
    },
  ];
  stepSimulation(sim, createInitialInput(), 0.03);
  assert.equal(
    sim.score - scoreBeforePickup,
    COLLECTIBLE_CONFIG.pointsPerLilYeti * 3,
    'Collectible pickup during 3x multiplier must award 3x points',
  );

  // 6. Ungrabbed jump over a second obstacle awards OBSTACLE CLEAR (50 × 3 = 150) & refreshes timer
  for (let i = 0; i < 10; i++) stepSimulation(sim, settle2, 0.025);
  sim.multiplierTimer = 2.0;
  const scoreBeforeObsAir = sim.score;
  const log2Z = sim.distance + 6.5;
  sim.obstacles = [
    {
      id: 802,
      kind: 'fallen_log',
      z: log2Z,
      offsetX: 0,
      worldX: getTrackCenterX(log2Z),
      worldY: 0,
      radius: 1.0,
      barHalfWidth: 11.0,
      halfDepthZ: 0.72,
      clearanceHeight: 1.05,
      scale: 1,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      rotationY: 0,
      tiltX: 0,
      tiltZ: 0,
      tint: 1,
      hit: false,
    },
  ];
  const jumpOnlyIn = createInitialInput();
  jumpOnlyIn.jumpQueued = true;
  for (let i = 0; i < 80; i++) {
    const ev = stepSimulation(sim, jumpOnlyIn, 0.025);
    if (ev.landed) break;
  }
  assert.equal(
    sim.score - scoreBeforeObsAir,
    TRICK_CONFIG.cleanAirBasePoints * 3,
    'Clean ungrabbed obstacle jump during 3x multiplier must award 3x obstacle clear points',
  );
  assert.equal(sim.lastTrickLabel, 'OBSTACLE CLEAR');
  assert.ok(sim.multiplierTimer > 7.0, 'Obstacle clear jump must refresh active combo timer');
  assert.equal(sim.grabCount, 2, 'Ungrabbed obstacle clear must not increment grabCount');

  // 7. Combo decay timer expiration resets multiplier cleanly to 1x
  const expired = stepTrickMultiplierTimer(3, 0.5, 1.0);
  assert.equal(expired.multiplier, 1);
  assert.equal(expired.timer, 0);

  // 8. Hitting an obstacle breaks active combo multiplier back to 1x
  sim.scoreMultiplier = 4;
  sim.multiplierTimer = 6.0;
  sim.invulnTimer = 0;
  const crashZ = sim.distance + 0.4;
  const crashX = getTrackCenterX(crashZ) + sim.lateralOffset;
  sim.obstacles = [
    {
      id: 777,
      kind: 'rock',
      z: crashZ,
      offsetX: sim.lateralOffset,
      worldX: crashX,
      worldY: 0,
      radius: 1.5,
      clearanceHeight: 1.5,
      scale: 1,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      rotationY: 0,
      tiltX: 0,
      tiltZ: 0,
      tint: 1,
      hit: false,
    },
  ];
  const crashEv = stepSimulation(sim, createInitialInput(), 0.025);
  assert.ok(crashEv.collidedObstacle, 'Expected deterministic obstacle collision');
  assert.equal(sim.scoreMultiplier, 1, 'Obstacle collision must reset active score multiplier to 1x');
  assert.equal(sim.multiplierTimer, 0);

  // 9. Retry, Victory frozen outcome summary, Next Level, and Start New Game reset all score & dedup state cleanly
  sim.score = 1250;
  sim.scoreMultiplier = 4;
  sim.peakMultiplier = 4;
  sim.multiplierTimer = 5.0;
  sim.lastTrickLabel = 'SUPER INDY GRAB';
  retryCurrentLevel(sim, 'playing');
  assert.equal(sim.score, 0);
  assert.equal(sim.scoreMultiplier, 1);
  assert.equal(sim.peakMultiplier, 1);
  assert.equal(sim.multiplierTimer, 0);
  assert.equal(sim.lastTrickLabel, null);
  assert.equal(sim.grabCount, 0);
  assert.equal(sim.scoredRampIds.length, 0);
  assert.equal(sim.scoredObstacleIds.length, 0);

  sim.score = 900;
  sim.grabCount = 3;
  sim.scoreMultiplier = 3;
  sim.peakMultiplier = 4;
  sim.distance = sim.levelLength - 0.1;
  stepSimulation(sim, createInitialInput(), 0.05);
  assert.equal(sim.phase, 'victory');
  const victoryHud = buildHudSnapshot(sim, null, { victoryUiReady: true, recruitJoinProgress: 1 });
  const victoryModel = buildOutcomeOverlayModel(victoryHud);
  assert.ok(victoryModel, 'Victory outcome overlay model should build when ready');
  assert.equal(victoryModel.score, 900);
  assert.equal(victoryModel.grabCount, 3);
  assert.equal(victoryModel.peakMultiplier, 4);

  assert.equal(advanceToNextLevel(sim), true);
  assert.equal(sim.score, 0);
  assert.equal(sim.scoreMultiplier, 1);
  assert.equal(sim.peakMultiplier, 1);
  assert.equal(sim.multiplierTimer, 0);
  assert.equal(sim.scoredRampIds.length, 0);
  assert.equal(sim.scoredObstacleIds.length, 0);

  startNewGame(sim, 'playing');
  assert.equal(sim.score, 0);
  assert.equal(sim.scoreMultiplier, 1);
  assert.equal(sim.peakMultiplier, 1);
  assert.equal(sim.lastTrickLabel, null);
});

test('Level 4 — Carving Pass: 3 Lil Yetis, longer S-curve downhill, outside snow mounds, carving+braking physics, outside-curve camera, clean resets, and Levels 1-3 unchanged', () => {
  // 1. Levels 1-3 remain completely unchanged
  assert.equal(LEVEL_CONFIGS[0].name, 'Snowy Foothills');
  assert.equal(LEVEL_CONFIGS[1].name, 'Frosty Ridge');
  assert.equal(LEVEL_CONFIGS[2].name, 'Pine Valley');
  assert.equal(getLevelTrackProfile(1).carvingPass, undefined);
  assert.equal(getLevelTrackProfile(2).carvingPass, undefined);
  assert.equal(getLevelTrackProfile(3).carvingPass, undefined);
  assert.equal(LEVEL_CONFIGS[2].steepDescents?.length, 1);
  assert.equal(LEVEL_CONFIGS[2].steepDescents![0].id, 'lv3-steep-drop');
  assert.equal(LEVEL_CONFIGS[2].steepDescents![0].zStart, 598);
  assert.equal(LEVEL_CONFIGS[2].steepDescents![0].zEnd, 676);
  for (const lvl of [1, 2, 3]) {
    const p = getLevelTrackProfile(lvl);
    assert.equal(
      generateCarvingPassSnowMounds(p.carvingPass, (z) => getTrackHalfWidthForLevel(lvl, z)).length,
      0,
      `Level ${lvl} must have zero Carving Pass snow mounds`,
    );
  }

  // 2. Level 4 identity, starting crew (exactly 3 Lil Yetis), and longer S-shaped downhill than Level 3
  const lv3Zone = LEVEL_CONFIGS[2].steepDescents![0];
  const lv4Cfg = LEVEL_CONFIGS[3];
  const lv4Profile = getLevelTrackProfile(4);
  assert.equal(lv4Cfg.levelNumber, 4);
  assert.equal(lv4Cfg.name, 'Carving Pass');
  assert.ok(lv4Cfg.steepDescents && lv4Cfg.steepDescents.length === 1, 'Level 4 must have 1 Carving Pass downhill');
  const lv4Zone = lv4Cfg.steepDescents![0];
  assert.ok(lv4Profile.carvingPass, 'Level 4 track profile must define carvingPass');
  const carvingCfg = lv4Profile.carvingPass!;

  const lv3Span = lv3Zone.zEnd - lv3Zone.zStart;
  const lv4Span = lv4Zone.zEnd - lv4Zone.zStart;
  assert.ok(
    lv4Span > lv3Span * 2.0,
    `Level 4 Carving Pass (${lv4Span}m) must be clearly longer than Level 3 drop (${lv3Span}m)`,
  );

  const lv4Sim = createInitialSimulationState('playing', lv4Cfg.spawnSeed, 4);
  assert.equal(lv4Sim.levelNumber, 4);
  assert.equal(lv4Sim.followers.length, 3, 'Level 4 must start with exactly 3 Lil Yetis');

  // 3. Readable S-curve geometry, wide route, flat recovery area with no immediate sharp turn, sparse obstacles, and outside snow mounds
  const bend1PeakZ = carvingCfg.zStart + lv4Span * 0.304;
  const inflectionZ = carvingCfg.zStart + lv4Span * 0.5;
  const bend2PeakZ = carvingCfg.zStart + lv4Span * 0.696;
  const bend1X = getTrackCenterXForLevel(4, bend1PeakZ);
  const midX = getTrackCenterXForLevel(4, inflectionZ);
  const bend2X = getTrackCenterXForLevel(4, bend2PeakZ);
  assert.ok(bend1X > 6.5, `Bend 1 should sweep clearly right (+X, got ${bend1X.toFixed(2)})`);
  assert.ok(Math.abs(midX) < 0.2, `S-curve inflection midpoint should cross center cleanly (got ${midX.toFixed(2)})`);
  assert.ok(bend2X < -6.5, `Bend 2 should sweep clearly left (-X, got ${bend2X.toFixed(2)})`);

  // Wide pass across both curves and recovery area
  const baseHalfW = lv4Profile.baseHalfWidth;
  const bend1HalfW = getTrackHalfWidthForLevel(4, bend1PeakZ);
  const recoveryHalfW = getTrackHalfWidthForLevel(4, lv4Zone.zEnd + 36);
  assert.ok(
    bend1HalfW > baseHalfW + 3.2,
    `S-curve downhill must widen noticeably for readability (got ${bend1HalfW.toFixed(2)} vs base ${baseHalfW})`,
  );
  assert.ok(
    recoveryHalfW > baseHalfW + 3.0,
    `Flat recovery area must stay wide after landing (got ${recoveryHalfW.toFixed(2)} vs base ${baseHalfW})`,
  );

  // Flat recovery area: zero extra gradient and zero sharp turn immediately after zEnd
  for (let z = lv4Zone.zEnd + 4; z <= lv4Zone.zEnd + 74; z += 10) {
    const pitch = Math.abs(getTrackPitchAt(4, z));
    const basePitch = Math.atan(SLOPE_GRADIENT);
    assert.ok(
      Math.abs(pitch - basePitch) < 0.002,
      `Recovery z=${z} must be back to normal slope (no extra drop)`,
    );
    const localSlope = Math.abs(
      (getTrackCenterXForLevel(4, z + 2) - getTrackCenterXForLevel(4, z - 2)) / 4,
    );
    assert.ok(
      localSlope < 0.06,
      `Recovery area z=${z} must not contain a sharp turn immediately after landing (slope=${localSlope.toFixed(3)})`,
    );
  }

  // Sparse obstacles inside S-descent with clear visible safe route before each curve & empty approach/recovery
  const approachObs = lv4Sim.obstacles.filter(
    (o) => o.z >= lv4Zone.zStart - lv4Zone.approachDistance && o.z < lv4Zone.zStart,
  );
  const descentObs = lv4Sim.obstacles.filter(
    (o) => o.z >= lv4Zone.zStart && o.z <= lv4Zone.zEnd,
  );
  const recoveryObs = lv4Sim.obstacles.filter(
    (o) => o.z > lv4Zone.zEnd && o.z <= lv4Zone.zEnd + lv4Zone.recoveryDistance,
  );
  assert.equal(approachObs.length, 0, 'Approach before Carving Pass must have a clear sightline');
  assert.ok(descentObs.length <= 4, `Obstacles in Carving Pass must stay sparse (found ${descentObs.length})`);
  assert.equal(recoveryObs.length, 0, 'Flat recovery area after descent must stay obstacle-free');
  for (const o of descentObs) {
    assert.ok(
      Math.abs(o.offsetX) >= 6.5,
      `Obstacle at z=${o.z} must stay off the central safe route (offsetX=${o.offsetX.toFixed(2)})`,
    );
  }

  // Outside-curve snow mounds sit strictly on the OUTSIDE of each curve and outside the playable lane
  const mounds = generateCarvingPassSnowMounds(carvingCfg, (z) =>
    getTrackHalfWidthForLevel(4, z),
  );
  assert.ok(mounds.length >= 16, `Expected clear outside-curve snow mounds (got ${mounds.length})`);
  const rightOutsideMounds = mounds.filter((m) => m.side === 1);
  const leftOutsideMounds = mounds.filter((m) => m.side === -1);
  assert.ok(rightOutsideMounds.length >= 6, 'Curve 1 outside (+X) must be lined with snow mounds');
  assert.ok(leftOutsideMounds.length >= 6, 'Curve 2 outside (-X) must be lined with snow mounds');
  for (const m of mounds) {
    const expectedOutside = getCarvingCurveOutsideSide(carvingCfg, m.z);
    if (!m.isOuterTier) {
      assert.equal(
        m.side,
        expectedOutside,
        `Snow mound at z=${m.z.toFixed(1)} must sit strictly on the outside of the curve`,
      );
    }
    const halfW = getTrackHalfWidthForLevel(4, m.z);
    assert.ok(
      Math.abs(m.offsetX) > halfW,
      `Snow mound at z=${m.z.toFixed(1)} must stay outside the playable snow lane (|offsetX|=${Math.abs(m.offsetX).toFixed(2)}, halfW=${halfW.toFixed(2)})`,
    );
  }

  // 4. Carving + Braking physics balance:
  // (a) Pure carving speed bleed helps control downhill speed on Carving Pass
  const bleedCarving = computeCarvingSpeedBleedRate({
    forwardSpeed: 33,
    baseSpeed: lv4Cfg.baseSpeed,
    steerAxis: 1,
    visualLean: 0.85,
    isAirborne: false,
    isBraking: false,
    slopeFactor: 0.75,
  });
  const bleedStraight = computeCarvingSpeedBleedRate({
    forwardSpeed: 33,
    baseSpeed: lv4Cfg.baseSpeed,
    steerAxis: 0,
    visualLean: 0,
    isAirborne: false,
    isBraking: false,
    slopeFactor: 0.75,
  });
  assert.ok(bleedCarving > 4.0, `Active carving must bleed excess downhill speed (got ${bleedCarving.toFixed(2)} m/s^2)`);
  assert.equal(bleedStraight, 0, 'Riding straight must not trigger carving speed bleed');

  const stageBeforePass = () => {
    const s = createInitialSimulationState('playing', lv4Cfg.spawnSeed, 4);
    const startZ = lv4Zone.zStart - 16;
    s.distance = startZ;
    s.travelDistance = startZ;
    s.lateralOffset = 0;
    s.windGust.cooldown = 999; // Isolate deterministic carving/braking physics from random wind gusts
    s.pathHistory = [];
    for (let d = startZ - 26; d <= startZ; d += 0.4) {
      const wx = getTrackCenterXForLevel(4, d);
      s.pathHistory.push({
        travelDistance: d,
        distance: d,
        worldX: wx,
        worldY: getTrackElevationForLevel(4, d),
        heightAboveGround: 0,
        jumpState: 'GROUNDED',
        landingProgress: 0,
        rampPitch: 0,
        grabAmount: 0,
        yaw: 0,
        lean: 0,
        brakeAmount: 0,
        slopePitch: getTrackPitchAt(4, d),
      });
    }
    return s;
  };

  // (b) Unbraked straight descent builds excessive speed & steering difficulty
  const straightSim = stageBeforePass();
  let peakStraightSpeed = 0;
  for (let i = 0; i < 180 && straightSim.distance < lv4Zone.zEnd; i++) {
    stepSimulation(straightSim, createInitialInput(), 0.05);
    if (straightSim.forwardSpeed > peakStraightSpeed) peakStraightSpeed = straightSim.forwardSpeed;
  }
  const straightSteerBalance = computeSpeedSteerBalance(
    peakStraightSpeed,
    lv4Cfg.baseSpeed,
    0,
    false,
  );
  assert.ok(
    peakStraightSpeed > lv4Cfg.baseSpeed + 8.0,
    `Unbraked straight descent must build excessive speed (peak=${peakStraightSpeed.toFixed(1)} m/s)`,
  );
  assert.ok(
    straightSteerBalance.steerAccelMult < 0.72,
    `Excessive speed must make steering noticeably harder (steerAccelMult=${straightSteerBalance.steerAccelMult.toFixed(2)})`,
  );

  // (c) Carving alone (without braking) helps control speed vs straight unbraked
  const carveOnlySim = stageBeforePass();
  let peakCarveOnlySpeed = 0;
  for (let i = 0; i < 220 && carveOnlySim.distance < lv4Zone.zEnd; i++) {
    const inp = createInitialInput();
    // Actively steer to follow the S-curve centerline
    const targetSlope =
      (getTrackCenterXForLevel(4, carveOnlySim.distance + 6) -
        getTrackCenterXForLevel(4, carveOnlySim.distance)) /
      6;
    const desiredSteer = Math.max(
      -1,
      Math.min(1, targetSlope * 3.0 - carveOnlySim.lateralOffset * 0.25),
    );
    inp.steerAxis = desiredSteer;
    stepSimulation(carveOnlySim, inp, 0.05);
    if (carveOnlySim.forwardSpeed > peakCarveOnlySpeed) peakCarveOnlySpeed = carveOnlySim.forwardSpeed;
  }
  assert.ok(
    peakCarveOnlySpeed < peakStraightSpeed - 2.0,
    `Carving through curves must reduce peak speed vs straight unbraked (${peakCarveOnlySpeed.toFixed(1)} vs ${peakStraightSpeed.toFixed(1)})`,
  );

  // (d) Braking alone (continuous brake, no steering) creates heavy avalanche pressure AND fails to follow S-curves
  const brakeOnlySim = stageBeforePass();
  const initialAvalanche = brakeOnlySim.avalancheDistance;
  let minAvalancheBrakeOnly = initialAvalanche;
  for (let i = 0; i < 260 && brakeOnlySim.phase === 'playing' && brakeOnlySim.distance < lv4Zone.zEnd; i++) {
    const inp = createInitialInput();
    inp.brake = true;
    stepSimulation(brakeOnlySim, inp, 0.05);
    minAvalancheBrakeOnly = Math.min(minAvalancheBrakeOnly, brakeOnlySim.avalancheDistance);
  }
  assert.ok(
    initialAvalanche - minAvalancheBrakeOnly > 14.0 || brakeOnlySim.phase === 'gameover',
    `Excessive continuous braking must let avalanche close in dramatically (start=${initialAvalanche.toFixed(1)}m, min=${minAvalancheBrakeOnly.toFixed(1)}m, phase=${brakeOnlySim.phase})`,
  );

  // Also verify that braking without steering fails to track the S-curve even before avalanche catches up
  const noSteerBrakeSim = stageBeforePass();
  noSteerBrakeSim.avalancheDistance = 90;
  let maxAbsOffsetBrakeOnly = 0;
  for (let i = 0; i < 220 && noSteerBrakeSim.phase === 'playing' && noSteerBrakeSim.distance < lv4Zone.zEnd; i++) {
    const inp = createInitialInput();
    inp.brake = i % 2 === 0; // Intermittent braking with zero steering
    stepSimulation(noSteerBrakeSim, inp, 0.05);
    maxAbsOffsetBrakeOnly = Math.max(maxAbsOffsetBrakeOnly, Math.abs(noSteerBrakeSim.lateralOffset));
  }
  assert.ok(
    maxAbsOffsetBrakeOnly > 7.0,
    `Braking alone without steering must drift wide off the S-curve centerline (maxOffset=${maxAbsOffsetBrakeOnly.toFixed(1)}m)`,
  );

  // (e) Combined steering/carving + tactical braking completes the S-descent cleanly with all 3 Lil Yetis!
  const combinedSim = stageBeforePass();
  let sawDescent = false;
  let sawRecovery = false;
  let minFollowerGap = Infinity;
  let maxTrailLag = 0;
  const followerBraked = [false, false, false];
  for (let i = 0; i < 280 && combinedSim.distance < lv4Zone.zEnd + 46; i++) {
    const inp = createInitialInput();
    const aheadSlope =
      (getTrackCenterXForLevel(4, combinedSim.distance + 8) -
        getTrackCenterXForLevel(4, combinedSim.distance)) /
      8;
    inp.steerAxis = Math.max(
      -1,
      Math.min(1, aheadSlope * 2.8 - combinedSim.lateralOffset * 0.3),
    );
    // Tactical speed-check brake whenever downhill speed exceeds baseSpeed + 3.2 m/s
    inp.brake = combinedSim.forwardSpeed > lv4Cfg.baseSpeed + 3.2;

    stepSimulation(combinedSim, inp, 0.05);
    if (combinedSim.steepPhase === 'DESCENT') sawDescent = true;
    if (combinedSim.steepPhase === 'RECOVERY') sawRecovery = true;
    assert.equal(combinedSim.followers.length, 3, 'Never lose any Lil Yeti during Level 4 Carving Pass');

    // Measure spacing between Lofi and all 3 Lil Yetis + every adjacent follower pair
    const lofiX = getTrackCenterXForLevel(4, combinedSim.distance) + combinedSim.lateralOffset;
    const f0Gap = Math.hypot(
      lofiX - combinedSim.followers[0].worldX,
      combinedSim.distance - combinedSim.followers[0].distance,
    );
    minFollowerGap = Math.min(minFollowerGap, f0Gap);
    for (let fIdx = 0; fIdx < 3; fIdx++) {
      if (combinedSim.followers[fIdx].brakeAmount > 0.25) {
        followerBraked[fIdx] = true;
      }
      const lag = combinedSim.distance - combinedSim.followers[fIdx].distance;
      if (lag > maxTrailLag) maxTrailLag = lag;
      if (fIdx > 0) {
        const pairGap = Math.hypot(
          combinedSim.followers[fIdx - 1].worldX - combinedSim.followers[fIdx].worldX,
          combinedSim.followers[fIdx - 1].distance - combinedSim.followers[fIdx].distance,
        );
        minFollowerGap = Math.min(minFollowerGap, pairGap);
      }
    }
  }
  assert.equal(combinedSim.phase, 'playing', 'Combined carving + braking must complete the S-descent without defeat');
  assert.equal(sawDescent, true);
  assert.equal(sawRecovery, true);
  assert.ok(
    combinedSim.distance > lv4Zone.zEnd + 35 &&
      combinedSim.followers.every((f) => f.distance > lv4Zone.zEnd + 20),
    'Lofi and all 3 Lil Yetis must complete the S-shaped descent into recovery',
  );
  assert.deepEqual(
    followerBraked,
    [true, true, true],
    'All 3 Lil Yetis must mimic braking on the carving descent',
  );
  assert.ok(
    minFollowerGap >= 2.15,
    `Lil Yetis must never collide or stack during S-curve carving & braking (minGap=${minFollowerGap.toFixed(2)}m)`,
  );
  assert.ok(
    maxTrailLag < 11.5,
    `Lil Yetis must never fall behind during S-curve carving (maxLag=${maxTrailLag.toFixed(2)}m)`,
  );
  assert.ok(
    combinedSim.avalancheDistance > 10.0,
    `Combined carving + tactical braking must keep a safe avalanche margin (got ${combinedSim.avalancheDistance.toFixed(1)}m)`,
  );

  // 5. Camera outside-curve shift: shifts smoothly toward outside of each bend, returns to 0 after descent, zero cuts, unaffected by tricks
  const bend1OutsideTarget = computeCarvingCameraOutsideTarget(
    carvingCfg,
    'DESCENT',
    bend1PeakZ,
    false,
  );
  const bend2OutsideTarget = computeCarvingCameraOutsideTarget(
    carvingCfg,
    'DESCENT',
    bend2PeakZ,
    false,
  );
  assert.ok(
    bend1OutsideTarget.curveOutsideX > 1.2,
    `Camera must shift toward outside (+X) on Bend 1 (got ${bend1OutsideTarget.curveOutsideX.toFixed(2)})`,
  );
  assert.ok(
    bend2OutsideTarget.curveOutsideX < -1.2,
    `Camera must shift toward outside (-X) on Bend 2 (got ${bend2OutsideTarget.curveOutsideX.toFixed(2)})`,
  );
  assert.equal(
    computeCarvingCameraOutsideTarget(carvingCfg, 'RECOVERY', lv4Zone.zEnd + 20, false).curveOutsideX,
    0,
    'Camera target must return to normal (0 shift) in RECOVERY',
  );

  const camState = createSteepCameraRigState();
  let prevCurveX = 0;
  let maxCurveStepDelta = 0;
  let peakBend1Shift = 0;
  let minBend2Shift = 0;
  for (let z = lv4Zone.zStart - 30; z <= lv4Zone.zEnd + 90; z += 1.5) {
    const sample = evaluateSteepDescentAt(lv4Cfg.steepDescents, z);
    stepSteepCameraRigState(camState, sample.phase, sample.slopeFactor, false, 0.05, false, {
      cameraMode: 'carving',
      carvingPass: carvingCfg,
      playerDistance: z,
    });
    maxCurveStepDelta = Math.max(maxCurveStepDelta, Math.abs(camState.curveOutsideX - prevCurveX));
    prevCurveX = camState.curveOutsideX;
    peakBend1Shift = Math.max(peakBend1Shift, camState.curveOutsideX);
    minBend2Shift = Math.min(minBend2Shift, camState.curveOutsideX);
  }
  assert.ok(peakBend1Shift > 1.0, `Smoothed camera must shift right toward Bend 1 outside (peak=${peakBend1Shift.toFixed(2)})`);
  assert.ok(minBend2Shift < -1.0, `Smoothed camera must shift left toward Bend 2 outside (min=${minBend2Shift.toFixed(2)})`);
  assert.ok(
    maxCurveStepDelta < 0.35,
    `Camera outside-curve shift must interpolate smoothly with zero sudden cuts (maxStep=${maxCurveStepDelta.toFixed(3)})`,
  );
  assert.ok(
    Math.abs(camState.curveOutsideX) < 0.15,
    `Camera must return smoothly to normal after the descent (end=${camState.curveOutsideX.toFixed(3)})`,
  );
  // Confirm normal behind-character camera framing stays close (not a huge side/front camera jump)
  assert.ok(
    Math.abs(computeCarvingPassCenterOffset(carvingCfg, bend1PeakZ)) > 7 &&
      Math.abs(computeCarvingPassCurvature(carvingCfg, bend1PeakZ)) > 0.002,
  );

  // 6. Retry & Next Level reset cleanly without duplicating course zones, mounds, or camera state
  retryCurrentLevel(combinedSim, 'playing');
  resetSteepCameraRigState(camState);
  assert.equal(combinedSim.levelNumber, 4);
  assert.equal(combinedSim.followers.length, 3);
  assert.equal(combinedSim.steepPhase, 'NORMAL');
  assert.equal(combinedSim.brakeAmount, 0);
  assert.equal(camState.curveOutsideX, 0);
  assert.equal(camState.curveLookOffsetX, 0);
  assert.equal(LEVEL_CONFIGS[3].steepDescents?.length, 1, 'Retry must not duplicate Level 4 Carving Pass');
  assert.equal(
    generateCarvingPassSnowMounds(carvingCfg, (z) => getTrackHalfWidthForLevel(4, z)).length,
    mounds.length,
    'Retry must produce identical snow mound count with zero duplication',
  );

  // Advance Level 4 Victory -> Level 5 cleanly resets camera & course state
  combinedSim.distance = combinedSim.levelLength - 0.1;
  stepSimulation(combinedSim, createInitialInput(), 0.05);
  assert.equal(combinedSim.phase, 'victory');
  assert.equal(advanceToNextLevel(combinedSim), true);
  assert.equal(combinedSim.levelNumber, 5);
  assert.equal(combinedSim.followers.length, 4);
  assert.equal(combinedSim.steepPhase, 'NORMAL');
  assert.equal(combinedSim.brakeAmount, 0);
  assert.equal(getLevelTrackProfile(5).carvingPass, undefined);
  assert.equal(
    generateCarvingPassSnowMounds(getLevelTrackProfile(5).carvingPass, (z) =>
      getTrackHalfWidthForLevel(5, z),
    ).length,
    0,
  );
});

test('control audit: SOCD repeat immunity, multi-key Brake/Grab tracking, zero-overhang drag reversal, and zero camera vibration', () => {
  // 1. SOCD repeat immunity: holding KeyA, overlapping KeyD (carve right), then receiving OS keydown repeats
  //    for KeyA must NEVER steal steering back left or cause left/right stutter.
  const steerTracker = createKeyboardSteerTracker();
  pressSteerKey(steerTracker, 'KeyA');
  const overlapRight = pressSteerKey(steerTracker, 'KeyD');
  assert.equal(overlapRight.right, true);
  assert.equal(overlapRight.left, false);

  const afterKeyARepeat = pressSteerKey(steerTracker, 'KeyA');
  assert.equal(
    afterKeyARepeat.right,
    true,
    'OS key repeat on earlier held KeyA must never steal Last-Input-Priority from KeyD',
  );
  assert.equal(afterKeyARepeat.left, false);

  // Pressing a DIFFERENT left alias (ArrowLeft) while KeyD is held IS a genuine new press and switches left
  const newLeftAlias = pressSteerKey(steerTracker, 'ArrowLeft');
  assert.equal(newLeftAlias.left, true);
  assert.equal(newLeftAlias.right, false);

  // Releasing KeyD while KeyA & ArrowLeft are held stays cleanly left
  const afterDropD = releaseSteerKey(steerTracker, 'KeyD');
  assert.equal(afterDropD.left, true);
  assert.equal(afterDropD.right, false);

  // 2. Multi-key Brake (KeyS + ArrowDown) and Grab/Trick (Space + KeyE + KeyT) tracking
  const brakeTracker = createHeldActionKeyTracker();
  assert.equal(pressActionKey(brakeTracker, 'KeyS'), true);
  assert.equal(pressActionKey(brakeTracker, 'ArrowDown'), true);
  assert.equal(
    releaseActionKey(brakeTracker, 'ArrowDown'),
    true,
    'Releasing ArrowDown while KeyS is still held must keep braking active',
  );
  assert.equal(releaseActionKey(brakeTracker, 'KeyS'), false);

  const grabTracker = createHeldActionKeyTracker();
  assert.equal(pressActionKey(grabTracker, 'Space'), true);
  assert.equal(pressActionKey(grabTracker, 'KeyE'), true);
  assert.equal(
    releaseActionKey(grabTracker, 'Space'),
    true,
    'Releasing Space while KeyE is still held must keep grab active',
  );
  clearHeldActionKeyTracker(grabTracker);
  assert.equal(grabTracker.heldCodes.size, 0);

  // 3. Zero-overhang drag steering: pushing far right clamps anchor tightly to dragRangePixels so
  //    immediately pulling back reduces steering on the very first pixels (zero dead overhang lag).
  const mobileRange = computeDragRangePixels(390);
  const desktopRange = computeDragRangePixels(1440);
  assert.ok(mobileRange >= 52 && mobileRange <= 60, `Expected crisp mobile drag range (got ${mobileRange})`);
  assert.ok(desktopRange >= 80 && desktopRange <= 92, `Expected ergonomic desktop drag range (got ${desktopRange})`);

  const pushedFarRight = stepDragSteer(500, 200, 80, 6);
  assert.equal(pushedFarRight.steer, 1);
  assert.equal(
    pushedFarRight.nextAnchorX,
    420,
    'Anchor must clamp strictly at clientX - dragRange with zero 1.15x dead overhang',
  );
  const pulledBack = stepDragSteer(480, pushedFarRight.nextAnchorX, 80, 6);
  assert.ok(
    pulledBack.steer < 0.78 && pulledBack.steer > 0.65,
    `Pulling back 20px from full-right must respond immediately (got ${pulledBack.steer.toFixed(3)})`,
  );

  // 4. Verify cameraRig has zero camera screen-shake source references
  const camSrc = fs.readFileSync(path.join(process.cwd(), 'src/game/cameraRig.ts'), 'utf8');
  assert.ok(
    !camSrc.includes('computeWindGustCameraShake'),
    'cameraRig.ts must not invoke camera screen-shake during gameplay',
  );
  assert.ok(
    camSrc.includes('camera.position.copy(currentPos)') && camSrc.includes('camera.lookAt(currentLook)'),
    'cameraRig.ts must apply pure smoothed camera position and lookAt without jitter offsets',
  );
});

test('Level 5 — Drop & Jump: 4 Lil Yetis, short downhill, clear split, optional ramp vs safe route, sequential jumps, smooth camera, retry/next-level, and Levels 1-4 preserved', () => {
  // 1. Levels 1-4 remain completely unchanged
  const lv1 = LEVEL_CONFIGS[0];
  const lv2 = LEVEL_CONFIGS[1];
  const lv3 = LEVEL_CONFIGS[2];
  const lv4 = LEVEL_CONFIGS[3];
  const lv5 = LEVEL_CONFIGS[4];
  assert.equal(lv1.name, 'Snowy Foothills');
  assert.equal(lv1.length, 780);
  assert.equal(lv2.name, 'Frosty Ridge');
  assert.equal(lv2.length, 860);
  assert.equal(lv3.name, 'Pine Valley');
  assert.equal(lv3.length, 940);
  assert.equal(lv3.steepDescents?.length, 1);
  assert.equal(lv3.steepDescents?.[0].id, 'lv3-steep-drop');
  assert.equal(lv4.name, 'Carving Pass');
  assert.equal(lv4.length, 1020);
  assert.equal(lv4.steepDescents?.length, 1);
  assert.equal(lv4.steepDescents?.[0].id, 'lv4-carving-pass');
  assert.ok(getLevelTrackProfile(4).carvingPass !== undefined, 'Level 4 carvingPass must remain intact');

  // 2. Level 5 identity, 4 Lil Yetis at start, shorter/easier downhill than Level 4
  assert.equal(lv5.name, 'Drop & Jump');
  assert.equal(lv5.steepDescents?.length, 1);
  const dropZone = lv5.steepDescents![0];
  const lv4Zone = lv4.steepDescents![0];
  assert.equal(dropZone.cameraMode, 'dropJump');
  const lv5DropLen = dropZone.zEnd - dropZone.zStart;
  const lv4DropLen = lv4Zone.zEnd - lv4Zone.zStart;
  assert.ok(
    lv5DropLen < lv4DropLen && lv5DropLen >= 60 && lv5DropLen <= 110,
    `Level 5 downhill (${lv5DropLen}m) must be shorter than Level 4 (${lv4DropLen}m)`,
  );
  assert.ok(
    dropZone.extraGradient < lv4Zone.extraGradient,
    `Level 5 gradient (${dropZone.extraGradient}) must be gentler than Level 4 (${lv4Zone.extraGradient})`,
  );

  const sim = createInitialSimulationState('playing', undefined, 5);
  assert.equal(sim.levelNumber, 5);
  assert.equal(sim.followers.length, 4, 'Level 5 must start with exactly 4 Lil Yetis');
  assert.equal(sim.ramps.length, 2, 'Level 5 must keep its 2 ramps (optional split ramp + late ramp)');
  const optRamp = sim.ramps[0];
  assert.equal(optRamp.id, 501);
  assert.ok(optRamp.width >= 6.4, `Optional ramp width (${optRamp.width}m) must be forgiving`);
  assert.ok(
    optRamp.zStart >= dropZone.zEnd && optRamp.zStart <= dropZone.zEnd + 10,
    'Optional ramp must begin right after the short downhill',
  );

  // 3. Layout geometry: clear split divider, unobstructed safe left lane, wide landing bowl, no sharp turn after landing
  const splitDividerObs = sim.obstacles.filter(
    (o) => o.z >= 546 && o.z <= 612 && Math.abs(o.offsetX) < 2.0,
  );
  assert.ok(
    splitDividerObs.length >= 3,
    `Expected visible split divider obstacles between safe and ramp lanes (got ${splitDividerObs.length})`,
  );
  const safeLaneObstacles = sim.obstacles.filter(
    (o) => o.z >= 480 && o.z <= 710 && o.offsetX < -2.2,
  );
  assert.equal(
    safeLaneObstacles.length,
    0,
    `Safe left lane beside ramp must be unobstructed (found ${safeLaneObstacles.length} obstacles)`,
  );
  const landingObstacles = sim.obstacles.filter(
    (o) => o.z >= optRamp.zStart + optRamp.length && o.z <= 710 && o.offsetX > 1.5,
  );
  assert.equal(
    landingObstacles.length,
    0,
    `Wide landing runway after ramp must be completely unobstructed (found ${landingObstacles.length})`,
  );
  for (let z = 590; z <= 705; z += 15) {
    const hw = getTrackHalfWidth(z);
    assert.ok(hw >= 18.0, `Landing & recovery area at z=${z} must be wide (got halfWidth=${hw.toFixed(1)}m)`);
    const absSlope = Math.abs(getTrackCenterX(z + 0.5) - getTrackCenterX(z - 0.5));
    assert.ok(
      absSlope < 0.22,
      `No sharp turn immediately after landing at z=${z} (got |dX/dz|=${absSlope.toFixed(3)})`,
    );
  }

  // Helper to stage Lofi & all 4 Lil Yetis cleanly at the top of the short downhill
  const stageBeforeDrop = (state: ReturnType<typeof createInitialSimulationState>, startZ: number, startLat: number) => {
    state.distance = startZ;
    state.travelDistance = startZ;
    state.lateralOffset = startLat;
    state.lateralVelocity = 0;
    state.forwardSpeed = state.levelBaseSpeed;
    state.pathHistory = [];
    for (let d = startZ - 26; d <= startZ; d += 0.4) {
      const wx = getTrackCenterX(d) + startLat;
      const slopeTan = getTrackCenterX(d + 0.5) - getTrackCenterX(d - 0.5);
      state.pathHistory.push({
        travelDistance: d,
        distance: d,
        worldX: wx,
        worldY: getTrackElevationForLevel(5, d),
        heightAboveGround: 0,
        jumpState: 'GROUNDED',
        landingProgress: 0,
        rampPitch: 0,
        grabAmount: 0,
        yaw: -Math.atan(slopeTan),
        lean: 0,
        brakeAmount: 0,
        slopePitch: getTrackPitchAt(5, d),
      });
    }
    for (let i = 0; i < state.followers.length; i++) {
      const fd = startZ - (i + 1) * SIM_CONFIG.followerSpacing;
      const fx = getTrackCenterX(fd) + startLat;
      state.followers[i].distance = fd;
      state.followers[i].worldX = fx;
      state.followers[i].worldY = getTrackElevationForLevel(5, fd);
      state.followers[i].heightAboveGround = 0;
      state.followers[i].jumpState = 'GROUNDED';
      state.followers[i].landingProgress = 0;
      state.followers[i].rampPitch = 0;
      state.followers[i].grabAmount = 0;
      state.followers[i].brakeAmount = 0;
    }
  };

  // 4. Optional Ramp Route — Lofi + all 4 Lil Yetis jump sequentially without stacking!
  const runRampRoute = (holdBrakeOnDrop: boolean) => {
    const s = createInitialSimulationState('playing', undefined, 5);
    stageBeforeDrop(s, 470, optRamp.offsetX);
    let takeoffZ = -1;
    let touchdownZ = -1;
    let peakHeight = 0;
    const followerPeakHeights = [0, 0, 0, 0];
    const followerTakeoffTimes = [-1, -1, -1, -1];
    let minFollowerSeparation = Infinity;
    let elapsed = 0;

    for (let step = 0; step < 650 && s.distance < 710; step++) {
      const dt = 1 / 60;
      elapsed += dt;
      const input = createInitialInput();
      const latErr = optRamp.offsetX - s.lateralOffset;
      if (s.distance < optRamp.zStart + optRamp.length) {
        if (latErr > 0.35) input.right = true;
        else if (latErr < -0.35) input.left = true;
      }
      if (holdBrakeOnDrop && s.distance >= 525 && s.distance <= 566) {
        input.brake = true;
      }
      const prevJump = s.jumpState;
      stepSimulation(s, input, dt);
      if (prevJump !== 'AIRBORNE' && s.jumpState === 'AIRBORNE' && takeoffZ < 0) {
        takeoffZ = s.distance;
      }
      if (takeoffZ > 0 && touchdownZ < 0 && s.jumpState !== 'AIRBORNE' && s.distance > takeoffZ + 4) {
        touchdownZ = s.distance;
      }
      peakHeight = Math.max(peakHeight, s.heightAboveGround);
      assert.equal(s.followers.length, 4, 'Must never lose Lil Yetis during Level 5 ramp jump');
      for (let i = 0; i < s.followers.length; i++) {
        const f = s.followers[i];
        followerPeakHeights[i] = Math.max(followerPeakHeights[i], f.heightAboveGround);
        if (followerTakeoffTimes[i] < 0 && f.jumpState === 'AIRBORNE') {
          followerTakeoffTimes[i] = elapsed;
        }
      }
      for (let i = 0; i < s.followers.length; i++) {
        for (let j = i + 1; j < s.followers.length; j++) {
          const dx = s.followers[i].worldX - s.followers[j].worldX;
          const dz = s.followers[i].distance - s.followers[j].distance;
          const sep = Math.hypot(dx, dz);
          if (sep < minFollowerSeparation) minFollowerSeparation = sep;
        }
      }
    }
    return {
      s,
      takeoffZ,
      touchdownZ,
      jumpDist: touchdownZ - takeoffZ,
      peakHeight,
      followerPeakHeights,
      followerTakeoffTimes,
      minFollowerSeparation,
    };
  };

  const fastJump = runRampRoute(false);
  const brakedJump = runRampRoute(true);

  assert.equal(fastJump.s.hitCount, 0, 'Unbraked optional ramp route must complete with 0 collisions');
  assert.ok(fastJump.takeoffZ > 580 && fastJump.takeoffZ < 592, `Expected takeoff near ramp lip (got ${fastJump.takeoffZ.toFixed(1)})`);
  assert.ok(
    fastJump.touchdownZ > 610 && fastJump.touchdownZ < 675,
    `Fast ramp jump must land safely inside wide landing zone (got z=${fastJump.touchdownZ.toFixed(1)})`,
  );
  assert.ok(
    brakedJump.touchdownZ > 595 && brakedJump.touchdownZ < 660,
    `Braked ramp jump must also land safely inside wide landing zone (got z=${brakedJump.touchdownZ.toFixed(1)})`,
  );
  assert.ok(
    fastJump.jumpDist > brakedJump.jumpDist + 2.5,
    `Speed must naturally affect jump distance (fast=${fastJump.jumpDist.toFixed(1)}m vs braked=${brakedJump.jumpDist.toFixed(1)}m)`,
  );
  assert.ok(fastJump.peakHeight > 2.2, `Lofi must achieve clear ramp air height (got ${fastJump.peakHeight.toFixed(2)}m)`);
  for (let i = 0; i < 4; i++) {
    assert.ok(
      fastJump.followerPeakHeights[i] > 1.8,
      `Lil Yeti #${i + 1} must jump over the ramp (peak=${fastJump.followerPeakHeights[i].toFixed(2)}m)`,
    );
    assert.ok(
      fastJump.followerTakeoffTimes[i] > 0,
      `Lil Yeti #${i + 1} must reach AIRBORNE state`,
    );
    if (i > 0) {
      assert.ok(
        fastJump.followerTakeoffTimes[i] > fastJump.followerTakeoffTimes[i - 1],
        `Lil Yetis must jump sequentially one after another (#${i} t=${fastJump.followerTakeoffTimes[i - 1].toFixed(3)}s < #${i + 1} t=${fastJump.followerTakeoffTimes[i].toFixed(3)}s)`,
      );
    }
  }
  assert.ok(
    fastJump.minFollowerSeparation >= 2.0,
    `All 4 Lil Yetis must stay cleanly separated with zero stacking during jump (minSep=${fastJump.minFollowerSeparation.toFixed(2)}m)`,
  );

  // 5. Safe Route + Braking simulation: holding Brake while steering into safe left lane works smoothly
  const safeSim = createInitialSimulationState('playing', undefined, 5);
  stageBeforeDrop(safeSim, 470, 0);
  let sawBrakingSlowdown = false;
  let minSafeSep = Infinity;
  for (let step = 0; step < 650 && safeSim.distance < 710; step++) {
    const dt = 1 / 60;
    const input = createInitialInput();
    if (safeSim.lateralOffset > -7.2) input.left = true;
    if (safeSim.distance >= 505 && safeSim.distance <= 560) {
      input.brake = true;
    }
    stepSimulation(safeSim, input, dt);
    if (safeSim.brakeAmount > 0.5 && safeSim.forwardSpeed < safeSim.levelBaseSpeed) {
      sawBrakingSlowdown = true;
    }
    for (let i = 0; i < safeSim.followers.length; i++) {
      for (let j = i + 1; j < safeSim.followers.length; j++) {
        const sep = Math.hypot(
          safeSim.followers[i].worldX - safeSim.followers[j].worldX,
          safeSim.followers[i].distance - safeSim.followers[j].distance,
        );
        if (sep < minSafeSep) minSafeSep = sep;
      }
    }
  }
  assert.equal(safeSim.hitCount, 0, 'Safe left route must be cleanly navigable with 0 hits');
  assert.equal(safeSim.followers.length, 4, 'All 4 Lil Yetis must remain on safe route');
  assert.equal(safeSim.jumpState, 'GROUNDED', 'Safe route stays smoothly grounded beside ramp');
  assert.ok(sawBrakingSlowdown, 'Braking must slow Lofi smoothly on Level 5');
  assert.ok(minSafeSep >= 2.0, `Followers must not stack on safe route (minSep=${minSafeSep.toFixed(2)}m)`);

  // 6. Smooth 'dropJump' camera interpolation across downhill + airborne jump + return after landing
  const camRig = createSteepCameraRigState();
  let prevBack = 0;
  let prevHeight = 0;
  let maxBackStep = 0;
  let maxHeightStep = 0;
  let peakJumpBack = 0;
  let peakJumpHeight = 0;
  for (let d = 425; d <= 725; d += 2) {
    const jumpH = d >= 585 && d <= 625 ? Math.sin(((d - 585) / 40) * Math.PI) * 3.0 : 0;
    const sample = evaluateSteepDescentAt(lv5.steepDescents, d);
    stepSteepCameraRigState(camRig, sample.phase, sample.slopeFactor, false, 0.05, false, {
      cameraMode: 'dropJump',
      playerDistance: d,
      playerJumpHeight: jumpH,
      activeZone: dropZone,
    });
    maxBackStep = Math.max(maxBackStep, Math.abs(camRig.extraBack - prevBack));
    maxHeightStep = Math.max(maxHeightStep, Math.abs(camRig.extraHeight - prevHeight));
    prevBack = camRig.extraBack;
    prevHeight = camRig.extraHeight;
    assert.equal(camRig.curveOutsideX, 0, 'Level 5 dropJump camera must stay centered behind Lofi (no side/carving shift)');
    if (d >= 585 && d <= 620) {
      peakJumpBack = Math.max(peakJumpBack, camRig.extraBack);
      peakJumpHeight = Math.max(peakJumpHeight, camRig.extraHeight);
    }
  }
  assert.ok(peakJumpBack >= 2.2, `Camera must pull back smoothly during downhill & jump (got ${peakJumpBack.toFixed(2)}m)`);
  assert.ok(peakJumpHeight >= 1.9, `Camera must raise smoothly during downhill & jump (got ${peakJumpHeight.toFixed(2)}m)`);
  assert.ok(maxBackStep < 0.35 && maxHeightStep < 0.35, `Camera transitions must be smooth with zero sudden cuts (steps: ${maxBackStep.toFixed(3)}, ${maxHeightStep.toFixed(3)})`);
  for (let i = 0; i < 40; i++) {
    stepSteepCameraRigState(camRig, 'NORMAL', 0, false, 0.05, false, {
      cameraMode: 'dropJump',
      playerDistance: 745,
      playerJumpHeight: 0,
      activeZone: dropZone,
    });
  }
  assert.ok(
    camRig.extraBack < 0.05 && camRig.extraHeight < 0.05,
    `Camera must smoothly return to normal after landing (got back=${camRig.extraBack.toFixed(3)}, h=${camRig.extraHeight.toFixed(3)})`,
  );

  // 7. Retry & Next Level (Level 5 -> Level 6) reset cleanly without duplicating course or camera state
  const stateForReset = fastJump.s;
  retryCurrentLevel(stateForReset);
  assert.equal(stateForReset.levelNumber, 5);
  assert.equal(stateForReset.followers.length, 4, 'Retry on Level 5 must keep exactly 4 Lil Yetis');
  assert.equal(stateForReset.ramps.length, 2, 'Retry must not duplicate Level 5 ramps');
  assert.equal(stateForReset.steepPhase, 'NORMAL', 'Retry must reset steep camera phase to NORMAL');
  assert.equal(stateForReset.brakeAmount, 0, 'Retry must reset brakeAmount to 0');

  stateForReset.distance = stateForReset.levelLength - 1;
  stepSimulation(stateForReset, createInitialInput(), 0.1);
  assert.equal(stateForReset.phase, 'victory');
  advanceToNextLevel(stateForReset);
  assert.equal(stateForReset.levelNumber, 6);
  assert.equal(stateForReset.followers.length, 5, 'Advancing from Level 5 Victory to Level 6 must unlock 5th Lil Yeti');
  assert.equal(stateForReset.steepPhase, 'NORMAL', 'Next Level must reset steep camera phase to NORMAL');
  assert.equal(stateForReset.brakeAmount, 0, 'Next Level must reset brakeAmount to 0');
});

test('Level 6-10 steering audit: scaled carving authority, >=10.5m/s curve headroom, airborne carvability, snowbank peel-off, and Levels 1-5 preserved', () => {
  // 1. Levels 1-5 preserve exact baseline steering profile unchanged
  for (let lv = 1; lv <= 5; lv++) {
    const p = computeLevelSteeringProfile(lv);
    assert.equal(p.lateralAccel, 46.0, `Level ${lv} must keep baseline lateralAccel`);
    assert.equal(p.maxLateralSpeed, 18.5, `Level ${lv} must keep baseline maxLateralSpeed`);
    assert.equal(p.counterSteerBoost, 1.45, `Level ${lv} must keep baseline counterSteerBoost`);
    assert.equal(p.activeDrag, 1.6, `Level ${lv} must keep baseline activeDrag`);
  }

  // 2. Levels 6-10 comfortably outpace peak switchback curve speeds on snow AND while airborne
  for (let lv = 6; lv <= 10; lv++) {
    const cfg = LEVEL_CONFIGS[lv - 1];
    const m = measureLevelCurveMetrics(lv);
    const p = computeLevelSteeringProfile(lv);
    const maxCruise = cfg.baseSpeed + 1.6;
    const peakCurveLatSpeed = m.peakAbsSlope * maxCruise;
    const headroom = p.maxLateralSpeed - peakCurveLatSpeed;
    assert.ok(
      headroom >= 10.5,
      `Level ${lv}: maxLateralSpeed (${p.maxLateralSpeed.toFixed(1)}) must keep >=10.5 m/s headroom over peak curve (${peakCurveLatSpeed.toFixed(2)}, got ${headroom.toFixed(2)})`,
    );
    const airMaxLat = p.maxLateralSpeed * p.airborneMaxLateralFactor;
    assert.ok(
      airMaxLat > peakCurveLatSpeed,
      `Level ${lv}: airborne max lateral speed (${airMaxLat.toFixed(1)}) must still outpace peak curve (${peakCurveLatSpeed.toFixed(2)})`,
    );
  }

  // 3. Snowbank edge-escape helper: never auto-turns on neutral input, peels off immediately when actively steering inward
  assert.equal(
    computeEdgeEscapeVelocity(0, 0, -1, 14.0, 25.0),
    0,
    'Neutral steer at left snowbank must never inject auto-steering velocity',
  );
  assert.ok(
    computeEdgeEscapeVelocity(0, 1, -1, 14.0, 25.0) >= 13.9,
    'Actively steering right away from left snowbank on a right bend must match curve speed immediately',
  );
  assert.ok(
    computeEdgeEscapeVelocity(0, -1, 1, -14.0, 25.0) <= -13.9,
    'Actively steering left away from right snowbank on a left bend must match curve speed immediately',
  );

  // 4. Full simulation check on Level 6 and Level 10 sharpest switchbacks: active steering carves cleanly through the bend without sticking to snowbanks
  for (const lv of [6, 8, 10]) {
    const s = createInitialSimulationState('playing', undefined, lv);
    s.obstacles = [];
    // Locate the sharpest curve point on this level
    let steepestZ = 200;
    let steepestAbs = 0;
    for (let z = 180; z < s.levelLength - 180; z += 4) {
      const slope = Math.abs(getTrackCenterX(z + 0.5) - getTrackCenterX(z - 0.5));
      if (slope > steepestAbs) {
        steepestAbs = slope;
        steepestZ = z;
      }
    }
    s.distance = Math.max(120, steepestZ - 45);
    s.travelDistance = s.distance;
    s.lateralOffset = 0;
    s.lateralVelocity = 0;
    s.forwardSpeed = s.levelBaseSpeed + 1.2;

    let maxAbsOffset = 0;
    let wallStuckFrames = 0;
    for (let step = 0; step < 260 && s.distance < steepestZ + 80; step++) {
      const inp = createInitialInput();
      // Simple human-like steering aiming toward centerline using 16m lookahead
      const aheadCurve = getTrackCenterX(s.distance + 16) - getTrackCenterX(s.distance);
      const desiredLatError = aheadCurve * 0.45 - s.lateralOffset;
      if (desiredLatError > 0.6) inp.right = true;
      else if (desiredLatError < -0.6) inp.left = true;
      stepSimulation(s, inp, 1 / 60);
      maxAbsOffset = Math.max(maxAbsOffset, Math.abs(s.lateralOffset));
      const hw = getTrackHalfWidth(s.distance) - SIM_CONFIG.edgePadding;
      if (Math.abs(s.lateralOffset) >= hw - 0.05) {
        wallStuckFrames += 1;
      }
    }
    assert.equal(
      wallStuckFrames,
      0,
      `Level ${lv}: active steering through sharpest switchback (z=${steepestZ}) must carve cleanly without ever hitting the snowbank wall (maxOffset=${maxAbsOffset.toFixed(2)}m)`,
    );
  }
});

test('Level 6 — Pine Slalom: 5 Lil Yetis, deterministic zig-zag pine gates, wide safe routes, gentle slope, braking balance, smooth camera, retry/next-level, and Levels 1-5 preserved', () => {
  // 1. Levels 1-5 remain completely unchanged
  assert.equal(LEVEL_CONFIGS[0].name, 'Snowy Foothills');
  assert.equal(LEVEL_CONFIGS[1].name, 'Frosty Ridge');
  assert.equal(LEVEL_CONFIGS[2].name, 'Pine Valley');
  assert.equal(LEVEL_CONFIGS[3].name, 'Carving Pass');
  assert.equal(LEVEL_CONFIGS[4].name, 'Drop & Jump');
  assert.equal(LEVEL_CONFIGS[4].steepDescents?.[0].id, 'lv5-drop-jump');

  // 2. Level 6 identity, 5 Lil Yetis, mostly flat / gently sloping slalom zone with no steep-drop warning
  const lv6 = LEVEL_CONFIGS[5];
  assert.equal(lv6.name, 'Pine Slalom');
  assert.equal(lv6.steepDescents?.length, 1);
  const slalomZone = lv6.steepDescents![0];
  assert.equal(slalomZone.id, 'lv6-pine-slalom');
  assert.equal(slalomZone.cameraMode, 'slalom');
  assert.ok(slalomZone.extraGradient <= 0.04, `Slalom slope must be mostly flat/gentle (got ${slalomZone.extraGradient})`);
  assert.equal(
    evaluateSteepDescentAt(lv6.steepDescents, slalomZone.zStart - 10).warningActive,
    false,
    'Flat Pine Slalom must not show a steep-drop brake warning',
  );

  const sim = createInitialSimulationState('playing', undefined, 6);
  assert.equal(sim.levelNumber, 6);
  assert.equal(sim.followers.length, 5, 'Level 6 must start with exactly 5 Lil Yetis');

  // 3. Deterministic zig-zag pine gates (no random trees inside slalom z=420..660 or recovery z=660..760)
  const slalomObstacles = sim.obstacles.filter((o) => o.z >= 418 && o.z <= 662);
  assert.equal(
    slalomObstacles.length,
    18,
    `Pine Slalom must contain only the 18 deterministic zig-zag pines (no random trees, got ${slalomObstacles.length})`,
  );
  assert.ok(
    slalomObstacles.every((o) => o.kind === 'pine'),
    'All obstacles inside Pine Slalom must be pine trees',
  );
  const recoveryObstacles = sim.obstacles.filter((o) => o.z > 662 && o.z <= 758);
  assert.equal(
    recoveryObstacles.length,
    0,
    `Recovery area after Pine Slalom must be completely obstacle-free (found ${recoveryObstacles.length})`,
  );

  // Verify every zig-zag gate leaves its alternating safe lane >= 10m wide & unobstructed
  const gateCenters = [
    { z: 451, safeSide: 1 },
    { z: 491, safeSide: -1 },
    { z: 531, safeSide: 1 },
    { z: 571, safeSide: -1 },
    { z: 611, safeSide: 1 },
    { z: 651, safeSide: -1 },
  ] as const;
  for (const gate of gateCenters) {
    const gateObs = slalomObstacles.filter((o) => Math.abs(o.z - gate.z) <= 8);
    assert.equal(gateObs.length, 3, `Expected 3 barrier pines at gate z=${gate.z}`);
    // All barrier pines must sit strictly on the blocked side, leaving the safe side 100% open
    for (const pine of gateObs) {
      assert.ok(
        pine.offsetX * gate.safeSide < -1.0,
        `Gate z=${gate.z} pine at x=${pine.offsetX.toFixed(1)} must never encroach on safe side (${gate.safeSide > 0 ? 'RIGHT' : 'LEFT'})`,
      );
    }
    const usableHalfW = getTrackHalfWidth(gate.z) - SIM_CONFIG.edgePadding;
    assert.ok(
      usableHalfW >= 12.0,
      `Slalom width at gate z=${gate.z} must provide a wide readable safe route (usableHalfW=${usableHalfW.toFixed(1)}m)`,
    );
  }

  // No sharp turn immediately after the recovery area (z = 660..810)
  for (let z = 660; z <= 810; z += 15) {
    const absSlope = Math.abs(getTrackCenterX(z + 0.5) - getTrackCenterX(z - 0.5));
    assert.ok(
      absSlope < 0.2,
      `No sharp turn immediately after recovery at z=${z} (got |dX/dz|=${absSlope.toFixed(3)})`,
    );
  }

  // Helper to stage Lofi & all 5 Lil Yetis right before the Pine Slalom
  const stageBeforeSlalom = (state: ReturnType<typeof createInitialSimulationState>, startZ = 402) => {
    state.distance = startZ;
    state.travelDistance = startZ;
    state.lateralOffset = 0;
    state.lateralVelocity = 0;
    state.forwardSpeed = state.levelBaseSpeed;
    state.avalancheDistance = SIM_CONFIG.avalancheStartDistance;
    state.pathHistory = [];
    for (let d = startZ - 30; d <= startZ; d += 0.4) {
      const wx = getTrackCenterX(d);
      const slopeTan = getTrackCenterX(d + 0.5) - getTrackCenterX(d - 0.5);
      state.pathHistory.push({
        travelDistance: d,
        distance: d,
        worldX: wx,
        worldY: getTrackElevationForLevel(6, d),
        heightAboveGround: 0,
        jumpState: 'GROUNDED',
        landingProgress: 0,
        rampPitch: 0,
        grabAmount: 0,
        yaw: -Math.atan(slopeTan),
        lean: 0,
        brakeAmount: 0,
        slopePitch: getTrackPitchAt(6, d),
      });
    }
    for (let i = 0; i < state.followers.length; i++) {
      const fd = startZ - (i + 1) * SIM_CONFIG.followerSpacing;
      const fx = getTrackCenterX(fd);
      state.followers[i].distance = fd;
      state.followers[i].worldX = fx;
      state.followers[i].worldY = getTrackElevationForLevel(6, fd);
      state.followers[i].heightAboveGround = 0;
      state.followers[i].jumpState = 'GROUNDED';
      state.followers[i].brakeAmount = 0;
    }
  };

  // Smooth zig-zag target line through the 6 alternating safe lanes
  const targetOffsetAt = (z: number): number => {
    if (z < 466) return 6.2; // Gate 1 RIGHT
    if (z < 506) return -6.2; // Gate 2 LEFT
    if (z < 546) return 6.2; // Gate 3 RIGHT
    if (z < 586) return -6.2; // Gate 4 LEFT
    if (z < 626) return 6.2; // Gate 5 RIGHT
    if (z < 668) return -6.2; // Gate 6 LEFT
    return 0; // Center smoothly in recovery area
  };

  // 4. Full Pine Slalom run: Lofi + all 5 Lil Yetis carve through all 6 gates with optional short braking
  const runSlalom = (brakeMode: 'none' | 'short' | 'excessive') => {
    const s = createInitialSimulationState('playing', undefined, 6);
    stageBeforeSlalom(s, 402);
    const followerBraked = [false, false, false, false, false];
    let minFollowerSep = Infinity;
    let maxLag = 0;
    for (let step = 0; step < 1100 && s.distance < 720 && s.phase === 'playing'; step++) {
      const dt = 1 / 60;
      const inp = createInitialInput();
      const targetX = targetOffsetAt(s.distance + 10);
      const err = targetX - s.lateralOffset;
      if (err > 0.55) inp.right = true;
      else if (err < -0.55) inp.left = true;
      if (brakeMode === 'short' && s.distance >= 472 && s.distance <= 502) {
        inp.brake = true;
      } else if (brakeMode === 'excessive' && s.distance >= 425 && s.distance <= 620) {
        inp.brake = true;
      }
      stepSimulation(s, inp, dt);
      assert.equal(s.followers.length, 5, 'Must never lose Lil Yetis during Level 6 Pine Slalom');
      for (let i = 0; i < 5; i++) {
        if (s.followers[i].brakeAmount > 0.25) followerBraked[i] = true;
        maxLag = Math.max(maxLag, s.distance - s.followers[i].distance);
        for (let j = i + 1; j < 5; j++) {
          const sep = Math.hypot(
            s.followers[i].worldX - s.followers[j].worldX,
            s.followers[i].distance - s.followers[j].distance,
          );
          if (sep < minFollowerSep) minFollowerSep = sep;
        }
      }
    }
    return { s, followerBraked, minFollowerSep, maxLag };
  };

  const noBrakeRun = runSlalom('none');
  const shortBrakeRun = runSlalom('short');
  const excessiveBrakeRun = runSlalom('excessive');

  assert.equal(noBrakeRun.s.hitCount, 0, 'Pine Slalom must be cleanly completable without requiring continuous braking');
  assert.equal(noBrakeRun.s.phase, 'playing');
  assert.ok(noBrakeRun.s.distance >= 718, 'Lofi must complete the slalom into the recovery area without braking');
  assert.ok(
    noBrakeRun.s.followers.every((f) => f.distance > 685),
    'All 5 Lil Yetis must complete the slalom cleanly behind Lofi',
  );

  assert.equal(shortBrakeRun.s.hitCount, 0, 'Short tactical braking slalom run must complete with 0 hits');
  assert.deepEqual(
    shortBrakeRun.followerBraked,
    [true, true, true, true, true],
    'All 5 Lil Yetis must mimic braking on the same slalom section',
  );
  assert.ok(
    shortBrakeRun.minFollowerSep >= 2.0,
    `All 5 Lil Yetis must stay separated without colliding/stacking (minSep=${shortBrakeRun.minFollowerSep.toFixed(2)}m)`,
  );
  assert.ok(
    shortBrakeRun.maxLag < 17.5,
    `All 5 Lil Yetis must stay close behind Lofi without falling behind (maxLag=${shortBrakeRun.maxLag.toFixed(2)}m)`,
  );
  assert.ok(
    excessiveBrakeRun.s.avalancheDistance < noBrakeRun.s.avalancheDistance - 8.0,
    `Excessive braking must let the avalanche close in noticeably (excessive=${excessiveBrakeRun.s.avalancheDistance.toFixed(1)}m vs noBrake=${noBrakeRun.s.avalancheDistance.toFixed(1)}m)`,
  );

  // 5. Smooth 'slalom' camera: raises & pulls back gently, stays centered behind Lofi, returns cleanly after slalom
  const camRig = createSteepCameraRigState();
  let prevBack = 0;
  let prevHeight = 0;
  let maxBackStep = 0;
  let maxHeightStep = 0;
  let peakBack = 0;
  let peakHeight = 0;
  for (let d = 360; d <= 770; d += 2) {
    const sample = evaluateSteepDescentAt(lv6.steepDescents, d);
    stepSteepCameraRigState(camRig, sample.phase, sample.slopeFactor, false, 0.05, false, {
      cameraMode: 'slalom',
      playerDistance: d,
      activeZone: slalomZone,
    });
    maxBackStep = Math.max(maxBackStep, Math.abs(camRig.extraBack - prevBack));
    maxHeightStep = Math.max(maxHeightStep, Math.abs(camRig.extraHeight - prevHeight));
    prevBack = camRig.extraBack;
    prevHeight = camRig.extraHeight;
    assert.equal(camRig.curveOutsideX, 0, 'Level 6 slalom camera must stay strictly behind Lofi');
    peakBack = Math.max(peakBack, camRig.extraBack);
    peakHeight = Math.max(peakHeight, camRig.extraHeight);
  }
  assert.ok(peakBack >= 2.2, `Slalom camera must pull back smoothly (got ${peakBack.toFixed(2)}m)`);
  assert.ok(peakHeight >= 2.2, `Slalom camera must raise smoothly (got ${peakHeight.toFixed(2)}m)`);
  assert.ok(
    maxBackStep < 0.35 && maxHeightStep < 0.35,
    `Slalom camera must interpolate smoothly without sudden cuts (steps: ${maxBackStep.toFixed(3)}, ${maxHeightStep.toFixed(3)})`,
  );
  for (let i = 0; i < 40; i++) {
    stepSteepCameraRigState(camRig, 'NORMAL', 0, false, 0.05, false, {
      cameraMode: 'slalom',
      playerDistance: 800,
      activeZone: slalomZone,
    });
  }
  assert.ok(
    camRig.extraBack < 0.05 && camRig.extraHeight < 0.05,
    `Slalom camera must smoothly return to normal after recovery (back=${camRig.extraBack.toFixed(3)}, h=${camRig.extraHeight.toFixed(3)})`,
  );

  // 6. Retry & Next Level (Level 6 -> Level 7) reset cleanly with zero course or camera duplication
  const resetState = shortBrakeRun.s;
  retryCurrentLevel(resetState);
  assert.equal(resetState.levelNumber, 6);
  assert.equal(resetState.followers.length, 5, 'Retry on Level 6 must keep exactly 5 Lil Yetis');
  assert.equal(resetState.ramps.length, 2, 'Retry must not duplicate Level 6 ramps');
  assert.equal(
    resetState.obstacles.filter((o) => o.z >= 418 && o.z <= 662).length,
    18,
    'Retry must not duplicate slalom pine trees',
  );
  assert.equal(resetState.steepPhase, 'NORMAL', 'Retry must reset camera phase to NORMAL');
  assert.equal(resetState.brakeAmount, 0, 'Retry must reset brakeAmount to 0');

  resetState.distance = resetState.levelLength - 1;
  stepSimulation(resetState, createInitialInput(), 0.1);
  assert.equal(resetState.phase, 'victory');
  advanceToNextLevel(resetState);
  assert.equal(resetState.levelNumber, 7);
  assert.equal(resetState.followers.length, 6, 'Next Level after Level 6 Victory must start Level 7 with 6 Lil Yetis');
  assert.equal(resetState.steepPhase, 'NORMAL');
  assert.equal(resetState.brakeAmount, 0);
});

test('custom MP3 SFX mapping: gameOver, road collectible pickup, and finish fanfare resolve to valid local assets and respect mute/mix rules', () => {
  // 1. Exact mappings requested by user
  assert.equal(
    SFX_TRACK_SRCS.gameOver,
    '/assets/aistudio/freesound_community-negative_beeps-6008_1ac25b4a.mp3',
  );
  assert.equal(
    SFX_TRACK_SRCS.collectible,
    '/assets/aistudio/universfield-video-game-bonus-323603_d5dfb245.mp3',
  );
  assert.equal(
    SFX_TRACK_SRCS.finish,
    '/assets/aistudio/freesound_community-tada-fanfare-a-6313_5fa556d6.mp3',
  );

  // 2. Every SFX file exists in public/ and is a non-empty MP3 asset
  const keys = ['gameOver', 'collectible', 'finish'] as const;
  for (const key of keys) {
    const cfg = getSfxClipConfig(key);
    assert.equal(cfg.src, SFX_CLIP_CONFIG[key].src);
    assert.ok(cfg.src.endsWith('.mp3'), `${key} SFX must be an MP3 asset`);
    const diskPath = path.resolve(process.cwd(), 'public', cfg.src.replace(/^\//, ''));
    assert.ok(fs.existsSync(diskPath), `Missing SFX asset on disk: ${diskPath}`);
    const stats = fs.statSync(diskPath);
    assert.ok(stats.size > 1000, `SFX asset ${key} appears empty (${stats.size} bytes)`);

    // Unmuted gain is softened in (0.2..0.45], muted is strictly 0
    const unmutedVol = computeSfxClipVolume(key, false);
    assert.ok(unmutedVol > 0.2 && unmutedVol <= 0.45, `Unexpected softened gain for ${key}: ${unmutedVol}`);
    assert.equal(computeSfxClipVolume(key, true), 0, `${key} SFX must silence when muted`);
    assert.ok(cfg.duckDurationMs >= 300, `${key} duck window should be >= 300ms`);
  }

  // 3. Existing 2-track continuous BGM playlist remains untouched
  assert.equal(BGM_PLAYLIST.length, 2);
  assert.equal(BGM_PLAYLIST[0].src, BGM_TRACK_SRC);
  assert.equal(BGM_PLAYLIST[1].src, BGM_SECOND_TRACK_SRC);
});

test('Level 7 — Avalanche Alley: 6 Lil Yetis, downhill-flat-downhill rhythm, natural flat speed decay, fair avalanche pressure, smooth rear camera, retry/next-level, and Levels 1-6 preserved', () => {
  // 1. Levels 1-6 remain completely unchanged
  assert.equal(LEVEL_CONFIGS[0].name, 'Snowy Foothills');
  assert.equal(LEVEL_CONFIGS[1].name, 'Frosty Ridge');
  assert.equal(LEVEL_CONFIGS[2].name, 'Pine Valley');
  assert.equal(LEVEL_CONFIGS[3].name, 'Carving Pass');
  assert.equal(LEVEL_CONFIGS[4].name, 'Drop & Jump');
  assert.equal(LEVEL_CONFIGS[5].name, 'Pine Slalom');
  assert.equal(LEVEL_CONFIGS[5].steepDescents?.[0].id, 'lv6-pine-slalom');

  // 2. Level 7 identity, 6 Lil Yetis, and two downhills separated by a flat momentum section
  const lv7 = LEVEL_CONFIGS[6];
  assert.equal(lv7.name, 'Avalanche Alley');
  assert.equal(lv7.steepDescents?.length, 2, 'Level 7 must define 2 downhill sections');
  assert.equal(lv7.flatZones?.length, 1, 'Level 7 must define 1 flat momentum section between the downhills');

  const drop1 = lv7.steepDescents![0];
  const drop2 = lv7.steepDescents![1];
  const flat = lv7.flatZones![0];
  assert.equal(drop1.id, 'lv7-alley-drop-1');
  assert.equal(drop2.id, 'lv7-alley-drop-2');
  assert.equal(flat.id, 'lv7-alley-flat');
  assert.equal(drop1.cameraMode, 'alley');
  assert.equal(drop2.cameraMode, 'alley');

  // Sequence order: Downhill 1 -> Flat section -> Longer Downhill 2 -> Wide recovery before shelter
  assert.ok(drop1.zEnd < flat.zStart + 20 && flat.zEnd < drop2.zStart + 10);
  const drop1Len = drop1.zEnd - drop1.zStart;
  const drop2Len = drop2.zEnd - drop2.zStart;
  const flatLen = flat.zEnd - flat.zStart;
  assert.ok(drop2Len > drop1Len, `Second downhill (${drop2Len}m) must be longer than first (${drop1Len}m)`);
  assert.ok(flatLen >= 200, `Flat section (${flatLen}m) must be long enough to lose speed naturally`);
  assert.ok(lv7.length - drop2.zEnd >= 300, 'Wide recovery area before shelter must be generous');

  // Pitch verification: Downhill 1 & 2 steeper than base, Flat visibly flatter than base
  const basePitch = Math.atan(SLOPE_GRADIENT);
  const drop1MidPitch = Math.abs(getTrackPitchAt(7, (drop1.zStart + drop1.zEnd) * 0.5));
  const flatMidPitch = Math.abs(getTrackPitchAt(7, (flat.zStart + flat.zEnd) * 0.5));
  const drop2MidPitch = Math.abs(getTrackPitchAt(7, (drop2.zStart + drop2.zEnd) * 0.5));
  assert.ok(drop1MidPitch > basePitch + 0.14, `Downhill 1 must be visibly downhill (${drop1MidPitch.toFixed(3)})`);
  assert.ok(flatMidPitch < basePitch * 0.35, `Flat section must be visibly flat (${flatMidPitch.toFixed(3)} vs base ${basePitch.toFixed(3)})`);
  assert.ok(drop2MidPitch > basePitch + 0.16, `Downhill 2 must be visibly downhill (${drop2MidPitch.toFixed(3)})`);
  assert.equal(evaluateFlatZoneAt(lv7.flatZones, (flat.zStart + flat.zEnd) * 0.5).active, true);

  // Elevation continuity (no cliffs, gaps, or vertical kinks across entire Level 7)
  setActiveTrackProfile(7);
  for (let z = 0; z < lv7.length; z += 4) {
    const dy = getTrackElevationForLevel(7, z + 4) - getTrackElevationForLevel(7, z);
    assert.ok(dy <= 0.35 && dy >= -2.5, `Level 7 elevation must stay smooth without cliffs/gaps at z=${z} (dy=${dy.toFixed(3)})`);
  }

  // No sharp turns immediately after either landing (Landing 1: 460..540, Landing 2: 916..1060)
  for (let z = 460; z <= 540; z += 16) {
    const absSlope = Math.abs(getTrackCenterX(z + 0.5) - getTrackCenterX(z - 0.5));
    assert.ok(absSlope < 0.24, `No sharp turn immediately after Landing 1 at z=${z} (|dX/dz|=${absSlope.toFixed(3)})`);
  }
  for (let z = 916; z <= 1060; z += 16) {
    const absSlope = Math.abs(getTrackCenterX(z + 0.5) - getTrackCenterX(z - 0.5));
    assert.ok(absSlope < 0.24, `No sharp turn immediately after Landing 2 at z=${z} (|dX/dz|=${absSlope.toFixed(3)})`);
  }

  // Starts with exactly 6 Lil Yetis & wide recovery area before shelter is obstacle-free
  const sim = createInitialSimulationState('playing', undefined, 7);
  assert.equal(sim.levelNumber, 7);
  assert.equal(sim.followers.length, 6, 'Level 7 must start with exactly 6 Lil Yetis');
  const recoveryObs = sim.obstacles.filter((o) => o.z >= 916 && o.z <= 1140);
  assert.equal(
    recoveryObs.length,
    0,
    `Wide recovery area after Downhill 2 must stay completely clear (found ${recoveryObs.length})`,
  );

  // 3. Full Level 7 rhythm simulations: balanced vs excessive flat braking vs unbraked overspeed
  const runAlley = (mode: 'balanced' | 'overbrakeFlat' | 'noBrake') => {
    const s = createInitialSimulationState('playing', undefined, 7);
    const dt = 1 / 60;
    let flatEntrySpeed = 0;
    let flatMinSpeed = Infinity;
    let maxDrop2Speed = 0;
    let minSteerMultOnDrop2 = 1;
    let maxOverspeedOnDrop2 = 0;
    let minAvalancheDist = s.avalancheDistance;
    let minFollowerGap = Infinity;
    let maxFollowerBrake = 0;

    for (let step = 0; step < 3600 && s.phase === 'playing'; step++) {
      // Pick the clearest visible safe lane ahead among [-5.5, -3, 0, 3, 5.5]
      const candidates = [0, -3.2, 3.2, -5.8, 5.8];
      let targetLat = 0;
      let bestScore = -Infinity;
      for (const cand of candidates) {
        let minClear = 20;
        for (const obs of s.obstacles) {
          const dz = obs.z - s.distance;
          if (dz > -1.5 && dz < 42) {
            const latGap = Math.abs(obs.offsetX - cand) - obs.radius;
            const weightedGap = latGap + (dz / 42) * 1.4;
            if (weightedGap < minClear) minClear = weightedGap;
          }
        }
        const score = minClear - Math.abs(cand) * 0.06;
        if (score > bestScore) {
          bestScore = score;
          targetLat = cand;
        }
      }
      const slopeAhead = getTrackCenterX(s.distance + 4) - getTrackCenterX(s.distance);
      const desiredWorldLatVel =
        (targetLat - s.lateralOffset) * 3.4 + (slopeAhead / 4) * s.forwardSpeed;
      const input = createInitialInput();
      if (desiredWorldLatVel - s.lateralVelocity > 0.5) input.right = true;
      else if (desiredWorldLatVel - s.lateralVelocity < -0.5) input.left = true;

      const onDrop1 = s.distance >= drop1.zStart + 18 && s.distance <= drop1.zEnd - 12;
      const onFlat = s.distance >= flat.zStart + 10 && s.distance <= flat.zEnd - 10;
      const onDrop2 = s.distance >= drop2.zStart + 20 && s.distance <= drop2.zEnd - 14;

      if (mode === 'balanced') {
        // Brake moderately on downhills (pulse/cap speed cleanly), NEVER brake on flat section
        input.brake = (onDrop1 || onDrop2) && s.forwardSpeed > s.levelBaseSpeed + 1.5;
      } else if (mode === 'overbrakeFlat') {
        // Hold brake excessively across the flat section (creates real avalanche pressure)
        input.brake = onFlat || (onDrop1 && s.forwardSpeed > s.levelBaseSpeed - 4);
      } else {
        input.brake = false;
      }

      stepSimulation(s, input, dt);

      if (s.distance >= flat.zStart && flatEntrySpeed === 0) {
        flatEntrySpeed = s.forwardSpeed;
      }
      if (s.distance >= flat.zStart + 20 && s.distance <= flat.zEnd - 10) {
        flatMinSpeed = Math.min(flatMinSpeed, s.forwardSpeed);
      }
      if (s.distance >= drop2.zStart + 30 && s.distance <= drop2.zEnd) {
        maxDrop2Speed = Math.max(maxDrop2Speed, s.forwardSpeed);
        const bal = computeSpeedSteerBalance(
          s.forwardSpeed,
          s.levelBaseSpeed,
          s.brakeAmount,
          s.jumpState === 'AIRBORNE',
        );
        minSteerMultOnDrop2 = Math.min(minSteerMultOnDrop2, bal.steerAccelMult);
        maxOverspeedOnDrop2 = Math.max(maxOverspeedOnDrop2, bal.overspeedRatio);
      }

      minAvalancheDist = Math.min(minAvalancheDist, s.avalancheDistance);
      const lofiWorldX = getTrackCenterX(s.distance) + s.lateralOffset;
      for (let i = 0; i < s.followers.length; i++) {
        maxFollowerBrake = Math.max(maxFollowerBrake, s.followers[i].brakeAmount);
        const leadDist = i === 0 ? s.distance : s.followers[i - 1].distance;
        const leadX = i === 0 ? lofiWorldX : s.followers[i - 1].worldX;
        const gap = Math.hypot(leadX - s.followers[i].worldX, leadDist - s.followers[i].distance);
        minFollowerGap = Math.min(minFollowerGap, gap);
      }
    }

    return {
      s,
      flatEntrySpeed,
      flatMinSpeed,
      maxDrop2Speed,
      minSteerMultOnDrop2,
      maxOverspeedOnDrop2,
      minAvalancheDist,
      minFollowerGap,
      maxFollowerBrake,
    };
  };

  const balanced = runAlley('balanced');
  assert.equal(balanced.s.phase, 'victory', 'Balanced rhythm run must safely complete Level 7');
  assert.equal(balanced.s.hitCount, 0, 'Balanced run must clear sparse Level 7 obstacles with 0 hits');
  assert.equal(balanced.s.followers.length, 6, 'All 6 Lil Yetis must remain with Lofi through finish');
  assert.ok(
    balanced.flatEntrySpeed - balanced.flatMinSpeed >= 2.2,
    `Flat section must naturally bleed speed (entry=${balanced.flatEntrySpeed.toFixed(1)}, min=${balanced.flatMinSpeed.toFixed(1)})`,
  );
  assert.ok(
    balanced.minAvalancheDist >= 10.0,
    `Balanced rhythm run must keep fair avalanche clearance (minDist=${balanced.minAvalancheDist.toFixed(1)}m)`,
  );
  assert.ok(
    balanced.minFollowerGap >= 2.0,
    `All 6 Lil Yetis must stay cleanly separated without stacking (minGap=${balanced.minFollowerGap.toFixed(2)}m)`,
  );
  assert.ok(
    balanced.maxFollowerBrake >= 0.4,
    `Lil Yetis must mimic braking on downhill sections (maxFollowerBrake=${balanced.maxFollowerBrake.toFixed(2)})`,
  );

  const overbrakeFlat = runAlley('overbrakeFlat');
  assert.ok(
    overbrakeFlat.minAvalancheDist < balanced.minAvalancheDist - 8.0,
    `Excessive braking on the flat section must create strong avalanche pressure (overbrake=${overbrakeFlat.minAvalancheDist.toFixed(1)}m vs balanced=${balanced.minAvalancheDist.toFixed(1)}m)`,
  );

  const noBrake = runAlley('noBrake');
  assert.ok(
    noBrake.maxDrop2Speed > lv7.baseSpeed + 8.0,
    `Skipping brakes on Downhill 2 must build high speed (got ${noBrake.maxDrop2Speed.toFixed(1)} m/s)`,
  );
  assert.ok(
    noBrake.maxOverspeedOnDrop2 >= 0.65 && noBrake.minSteerMultOnDrop2 <= 0.76,
    `Excessive unbraked speed on Downhill 2 must make steering harder (overspeed=${noBrake.maxOverspeedOnDrop2.toFixed(2)}, steerMult=${noBrake.minSteerMultOnDrop2.toFixed(2)})`,
  );

  // 4. Camera smoothness across Downhill 1 -> NORMAL Flat -> Downhill 2 -> NORMAL Recovery/Shelter
  const camRig = createSteepCameraRigState();
  let peakDrop1Back = 0;
  let flatCenterBack = 99;
  let peakDrop2Back = 0;
  let maxFrameJump = 0;
  let prevBack = 0;
  let prevHeight = 0;

  for (let z = 250; z <= 1150; z += 0.48) {
    const sample = evaluateSteepDescentAt(lv7.steepDescents, z);
    stepSteepCameraRigState(camRig, sample.phase, sample.slopeFactor, false, 1 / 60, false, {
      cameraMode: sample.zone?.cameraMode ?? 'alley',
      playerDistance: z,
      activeZone: sample.zone ?? undefined,
    });
    const jump = Math.hypot(camRig.extraBack - prevBack, camRig.extraHeight - prevHeight);
    maxFrameJump = Math.max(maxFrameJump, jump);
    prevBack = camRig.extraBack;
    prevHeight = camRig.extraHeight;

    assert.equal(camRig.curveOutsideX, 0, 'Level 7 rear camera must never shift into a side camera');
    if (z >= drop1.zStart + 30 && z <= drop1.zEnd) {
      peakDrop1Back = Math.max(peakDrop1Back, camRig.extraBack);
    }
    if (z >= 620 && z <= 660) {
      flatCenterBack = Math.min(flatCenterBack, camRig.extraBack);
    }
    if (z >= drop2.zStart + 40 && z <= drop2.zEnd) {
      peakDrop2Back = Math.max(peakDrop2Back, camRig.extraBack);
    }
  }
  assert.ok(peakDrop1Back >= 2.2, `Camera must smoothly pull back on Downhill 1 (got ${peakDrop1Back.toFixed(2)})`);
  assert.ok(flatCenterBack < 0.08, `Camera must smoothly return to normal on flat section (got ${flatCenterBack.toFixed(3)})`);
  assert.ok(peakDrop2Back >= 2.4, `Camera must smoothly pull back on Downhill 2 (got ${peakDrop2Back.toFixed(2)})`);
  assert.ok(camRig.extraBack < 0.05 && camRig.extraHeight < 0.05, 'Camera must return to normal after Downhill 2');
  assert.ok(maxFrameJump < 0.25, `Camera transitions must be smooth with zero sudden cuts (maxJump=${maxFrameJump.toFixed(3)})`);

  // 5. Retry & Next Level (Level 7 -> Level 8) reset cleanly with zero course or camera duplication
  const resetState = balanced.s;
  const obsCountBefore = resetState.obstacles.length;
  retryCurrentLevel(resetState);
  assert.equal(resetState.levelNumber, 7);
  assert.equal(resetState.followers.length, 6, 'Retry on Level 7 must preserve exactly 6 Lil Yetis');
  assert.equal(resetState.obstacles.length, obsCountBefore, 'Retry must not duplicate Level 7 obstacles');
  assert.equal(resetState.steepPhase, 'NORMAL', 'Retry must reset steepPhase to NORMAL');
  assert.equal(resetState.brakeAmount, 0, 'Retry must reset brakeAmount to 0');

  resetState.distance = resetState.levelLength - 1;
  stepSimulation(resetState, createInitialInput(), 0.1);
  assert.equal(resetState.phase, 'victory');
  advanceToNextLevel(resetState);
  assert.equal(resetState.levelNumber, 8);
  assert.equal(resetState.followers.length, 7, 'Next Level after Level 7 Victory must start Level 8 with 7 Lil Yetis');
  assert.equal(resetState.steepPhase, 'NORMAL');
  assert.equal(resetState.brakeAmount, 0);
});

test('Level 8 — Rock Garden: 7 Lil Yetis, grouped rock layout with readable short vs safe route choices, gentle slope, braking balance, smooth camera, clean resets, and Levels 1-7 unchanged', () => {
  // 1. Levels 1-7 remain completely untouched
  assert.equal(LEVEL_CONFIGS[0].name, 'Snowy Foothills');
  assert.equal(LEVEL_CONFIGS[1].name, 'Frosty Ridge');
  assert.equal(LEVEL_CONFIGS[2].name, 'Pine Valley');
  assert.equal(LEVEL_CONFIGS[3].name, 'Carving Pass');
  assert.equal(LEVEL_CONFIGS[4].name, 'Drop & Jump');
  assert.equal(LEVEL_CONFIGS[5].name, 'Pine Slalom');
  assert.equal(LEVEL_CONFIGS[6].name, 'Avalanche Alley');

  // 2. Level 8 identity, gentle/flat slope, wide rock garden, zero steep-drop warning, smooth terrain
  const lv8 = LEVEL_CONFIGS[7];
  assert.equal(lv8.levelNumber, 8);
  assert.equal(lv8.name, 'Rock Garden');
  assert.equal(lv8.steepDescents?.length, 1);
  assert.equal(lv8.flatZones?.length, 1);
  const gardenZone = lv8.steepDescents![0];
  assert.equal(gardenZone.id, 'lv8-rock-garden');
  assert.equal(gardenZone.cameraMode, 'rockGarden');
  assert.equal(gardenZone.zStart, 440);
  assert.equal(gardenZone.zEnd, 760);

  // Never triggers steep-drop warning banner across the entire rock garden
  for (let z = 360; z <= 900; z += 10) {
    const sample = evaluateSteepDescentAt(lv8.steepDescents, z);
    assert.equal(sample.warningActive, false, `Level 8 Rock Garden must not show steep-drop warning at z=${z}`);
  }

  // Gentle slope (flatter than normal mountain slope) and smooth C1 elevation continuity (no cliffs or gaps)
  const basePitch = Math.atan(SLOPE_GRADIENT);
  const gardenMidPitch = Math.abs(getTrackPitchAt(8, 600));
  assert.ok(
    gardenMidPitch < basePitch - 0.04 && gardenMidPitch > 0.04,
    `Rock Garden must be mostly flat/gently sloping (midPitch=${gardenMidPitch.toFixed(3)}, base=${basePitch.toFixed(3)})`,
  );
  for (let z = 380; z <= 880; z += 2) {
    const y0 = getTrackElevationForLevel(8, z);
    const y1 = getTrackElevationForLevel(8, z + 2);
    assert.ok(y0 - y1 >= 0 && y0 - y1 < 0.75, `No cliff or sudden drop at z=${z} (dy=${(y0 - y1).toFixed(3)})`);
  }

  // No sharp curve immediately before the first rocks (z = 380..470) or in recovery (z = 760..880)
  for (let z = 380; z <= 875; z += 5) {
    const slope = Math.abs((getTrackCenterXForLevel(8, z + 2) - getTrackCenterXForLevel(8, z - 2)) / 4);
    assert.ok(slope < 0.22, `Rock Garden & recovery must not place rocks immediately after a sharp curve (z=${z}, |dX/dz|=${slope.toFixed(3)})`);
  }

  // 3. Deterministic structured rock groups: 28 rocks, 0 trees inside garden, 0 obstacles in approach/recovery, no rock hidden behind another
  const initState = createInitialSimulationState('playing', undefined, 8);
  assert.equal(initState.followers.length, 7, 'Level 8 must start with Lofi and exactly 7 Lil Yetis');
  assert.equal(initState.ramps.length, 2, 'Level 8 retains 2 optional ramps outside Rock Garden');

  const approachObs = initState.obstacles.filter((o) => o.z >= 390 && o.z < 440);
  const gardenObs = initState.obstacles.filter((o) => o.z >= 440 && o.z <= 760);
  const recoveryObs = initState.obstacles.filter((o) => o.z > 760 && o.z <= 885);

  assert.equal(approachObs.length, 0, `Approach sightline before Rock Garden must be obstacle-free (found ${approachObs.length})`);
  assert.equal(gardenObs.length, 28, `Rock Garden must contain exact 28 structured group rocks (found ${gardenObs.length})`);
  assert.equal(
    gardenObs.filter((o) => o.kind === 'rock').length,
    28,
    'Rock Garden must contain only structured rocks (0 trees hiding rocks)',
  );
  assert.equal(recoveryObs.length, 0, `Recovery area after Rock Garden must be completely obstacle-free (found ${recoveryObs.length})`);

  // Verify no rock is hidden directly behind another rock in the same lane (staggered z/offsetX)
  for (let i = 0; i < gardenObs.length; i++) {
    for (let j = i + 1; j < gardenObs.length; j++) {
      const a = gardenObs[i];
      const b = gardenObs[j];
      const dz = Math.abs(a.z - b.z);
      const dx = Math.abs(a.offsetX - b.offsetX);
      assert.ok(
        !(dz < 18 && dx < 1.8),
        `Rocks #${a.id} (z=${a.z}, x=${a.offsetX}) and #${b.id} (z=${b.z}, x=${b.offsetX}) must not hide directly behind one another`,
      );
    }
  }

  // 4. Both route choices work:
  //    - 'direct': shorter central route through more rocks (with tactical short braking in tight spots)
  //    - 'safer': slightly longer outer wide route with fewer rocks & larger rock clearance (minimal/no braking needed)
  //    - 'overbrake': holding brake continuously across the rock garden slows Lofi and brings avalanche much closer
  const runRockGarden = (mode: 'direct' | 'safer' | 'overbrake') => {
    const s = createInitialSimulationState('playing', undefined, 8);
    s.windGust.cooldown = 999; // isolate deterministic rock garden navigation
    const dt = 1 / 60;
    let gardenStartTravel = 0;
    let gardenEndTravel = 0;
    let nearbyRockCount = 0;
    const countedRockIds = new Set<number>();
    let minRockClearance = Infinity;
    let minAvalancheDist = s.avalancheDistance;
    let minFollowerGap = Infinity;
    let maxFollowerBrake = 0;

    // Sector-specific waypoints inside Rock Garden (z = 440..760)
    const getDesiredGardenOffset = (z: number): number => {
      if (mode === 'safer') {
        // Wide outer safer arcs using the 32m open aprons between sectors:
        // Sector 1 RIGHT (+9.4) -> apron at z=494 sweeps to Sector 2 LEFT (-9.4) -> z=574 to +9.4 -> z=654 to -9.4
        if (z < 494) return 9.4;
        if (z < 574) return -9.4;
        if (z < 654) return 9.4;
        if (z < 746) return -9.4;
        return 0;
      }
      // Direct shorter center route threading the staggered boulder clusters:
      // Sector 1 rocks: 456(-2.2), 479(+2.6), 502(-2.0) -> weave +2.2, -2.0, +2.2
      if (z < 462) return 2.2;
      if (z < 485) return -2.0;
      if (z < 514) return 2.2;
      // Sector 2 rocks: 536(+2.2), 559(-2.6), 582(+2.0) -> weave -2.2, +2.0, -2.2
      if (z < 542) return -2.2;
      if (z < 565) return 2.0;
      if (z < 594) return -2.2;
      // Sector 3 rocks: 616(-2.2), 639(+2.6), 662(-2.0) -> weave +2.2, -2.0, +2.2
      if (z < 622) return 2.2;
      if (z < 645) return -2.0;
      if (z < 674) return 2.2;
      // Sector 4 rocks: 696(+2.2), 719(-2.6), 742(+2.0) -> weave -2.2, +2.0, -2.2
      if (z < 702) return -2.2;
      if (z < 725) return 2.0;
      if (z < 754) return -2.2;
      return 0;
    };

    for (let step = 0; step < 3800 && s.phase === 'playing'; step++) {
      let targetLat = 0;
      if (s.distance >= 415 && s.distance <= 772) {
        targetLat = getDesiredGardenOffset(s.distance);
      } else {
        // Outside rock garden: pick clearest safe lane ahead
        const candidates = [0, -3.4, 3.4, -6.0, 6.0];
        let bestScore = -Infinity;
        for (const cand of candidates) {
          let minClear = 20;
          for (const obs of s.obstacles) {
            const dz = obs.z - s.distance;
            if (dz > -1.5 && dz < 42 && obs.kind !== 'fallen_log') {
              const latGap = Math.abs(obs.offsetX - cand) - obs.radius;
              const weightedGap = latGap + (dz / 42) * 1.4;
              if (weightedGap < minClear) minClear = weightedGap;
            }
          }
          const score = minClear - Math.abs(cand) * 0.06;
          if (score > bestScore) {
            bestScore = score;
            targetLat = cand;
          }
        }
      }

      const slopeAhead = getTrackCenterX(s.distance + 4) - getTrackCenterX(s.distance);
      const desiredWorldLatVel =
        (targetLat - s.lateralOffset) * 4.2 + (slopeAhead / 4) * s.forwardSpeed;
      const input = createInitialInput();
      if (desiredWorldLatVel - s.lateralVelocity > 0.35) input.right = true;
      else if (desiredWorldLatVel - s.lateralVelocity < -0.35) input.left = true;

      // Jump cleanly over any fallen_log on the late stretch outside Rock Garden
      if (s.jumpState === 'GROUNDED') {
        for (const obs of s.obstacles) {
          if (obs.kind === 'fallen_log') {
            const dz = obs.z - s.distance;
            if (dz > 2 && dz < 11) {
              input.jumpQueued = true;
              break;
            }
          }
        }
      }

      const inGarden = s.distance >= gardenZone.zStart && s.distance <= gardenZone.zEnd;
      if (mode === 'direct') {
        // Short tactical braking taps (~0.35s) entering tight center-cluster bends
        input.brake =
          inGarden &&
          ((s.distance >= 464 && s.distance <= 476) ||
            (s.distance >= 544 && s.distance <= 556) ||
            (s.distance >= 624 && s.distance <= 636) ||
            (s.distance >= 704 && s.distance <= 716));
      } else if (mode === 'overbrake') {
        // Hold brake continuously throughout the entire rock garden
        input.brake = inGarden;
      } else {
        // Safer wider route requires zero continuous braking
        input.brake = false;
      }

      stepSimulation(s, input, dt);

      if (s.distance >= gardenZone.zStart && gardenStartTravel === 0) {
        gardenStartTravel = s.travelDistance;
      }
      if (s.distance >= gardenZone.zEnd && gardenEndTravel === 0) {
        gardenEndTravel = s.travelDistance;
      }

      if (inGarden) {
        for (const rock of gardenObs) {
          const dz = Math.abs(rock.z - s.distance);
          if (dz < 3.5) {
            const clearance = Math.hypot(rock.offsetX - s.lateralOffset, dz) - rock.radius;
            if (clearance < minRockClearance) minRockClearance = clearance;
            if (clearance < 3.2 && !countedRockIds.has(rock.id)) {
              countedRockIds.add(rock.id);
              nearbyRockCount += 1;
            }
          }
        }
      }

      minAvalancheDist = Math.min(minAvalancheDist, s.avalancheDistance);
      const lofiWorldX = getTrackCenterX(s.distance) + s.lateralOffset;
      for (let i = 0; i < s.followers.length; i++) {
        maxFollowerBrake = Math.max(maxFollowerBrake, s.followers[i].brakeAmount);
        const leadDist = i === 0 ? s.distance : s.followers[i - 1].distance;
        const leadX = i === 0 ? lofiWorldX : s.followers[i - 1].worldX;
        const gap = Math.hypot(leadX - s.followers[i].worldX, leadDist - s.followers[i].distance);
        minFollowerGap = Math.min(minFollowerGap, gap);
      }
    }

    return {
      s,
      gardenTravel: gardenEndTravel - gardenStartTravel,
      nearbyRockCount,
      minRockClearance,
      minAvalancheDist,
      minFollowerGap,
      maxFollowerBrake,
    };
  };

  const direct = runRockGarden('direct');
  assert.equal(direct.s.phase, 'victory', 'Shorter rockier center route must complete Level 8 cleanly');
  assert.equal(direct.s.hitCount, 0, 'Shorter route with tactical braking must finish with 0 obstacle hits');
  assert.equal(direct.s.followers.length, 7, 'All 7 Lil Yetis must stay with Lofi on the shorter route');
  assert.ok(
    direct.minFollowerGap >= 2.0,
    `All 7 Lil Yetis must stay cleanly separated without stacking on shorter route (minGap=${direct.minFollowerGap.toFixed(2)}m)`,
  );
  assert.ok(
    direct.maxFollowerBrake >= 0.35,
    `Lil Yetis must mimic braking on tight sections (maxFollowerBrake=${direct.maxFollowerBrake.toFixed(2)})`,
  );

  const safer = runRockGarden('safer');
  assert.equal(safer.s.phase, 'victory', 'Longer wider safer route must complete Level 8 cleanly');
  assert.equal(safer.s.hitCount, 0, 'Safer route must finish with 0 obstacle hits');
  assert.equal(safer.s.followers.length, 7, 'All 7 Lil Yetis must stay with Lofi on the safer route');
  assert.ok(
    safer.minFollowerGap >= 2.0,
    `All 7 Lil Yetis must stay cleanly separated on safer route (minGap=${safer.minFollowerGap.toFixed(2)}m)`,
  );
  assert.ok(
    safer.minAvalancheDist >= 10.0,
    `Safer route must stay well ahead of avalanche without continuous braking (minDist=${safer.minAvalancheDist.toFixed(1)}m)`,
  );

  // Verify the meaningful trade-off between the two routes:
  // Safer outer route travels slightly farther across z=440..760 AND passes fewer nearby rocks / wider clearance!
  assert.ok(
    safer.gardenTravel > direct.gardenTravel + 3.0,
    `Safer route must be slightly longer than the direct rockier route (safer=${safer.gardenTravel.toFixed(1)}m vs direct=${direct.gardenTravel.toFixed(1)}m)`,
  );
  assert.ok(
    safer.nearbyRockCount < direct.nearbyRockCount,
    `Safer route must pass fewer nearby rocks than direct route (safer=${safer.nearbyRockCount} vs direct=${direct.nearbyRockCount})`,
  );
  assert.ok(
    safer.minRockClearance > direct.minRockClearance,
    `Safer route must offer wider minimum rock clearance (safer=${safer.minRockClearance.toFixed(2)}m vs direct=${direct.minRockClearance.toFixed(2)}m)`,
  );

  // Excessive braking throughout the Rock Garden slows Lofi and lets the avalanche close in noticeably
  const overbrake = runRockGarden('overbrake');
  assert.ok(
    overbrake.minAvalancheDist < safer.minAvalancheDist - 12.0,
    `Excessive continuous braking must let avalanche approach (overbrake=${overbrake.minAvalancheDist.toFixed(1)}m vs safer=${safer.minAvalancheDist.toFixed(1)}m)`,
  );

  // 5. Smooth rear 'rockGarden' camera transitions: slightly raise & pull back, return to normal, zero sudden cuts, never side/front
  const camRig = createSteepCameraRigState();
  let peakGardenBack = 0;
  let peakGardenHeight = 0;
  let maxFrameJump = 0;
  let prevBack = 0;
  let prevHeight = 0;

  for (let z = 340; z <= 940; z += 0.48) {
    const sample = evaluateSteepDescentAt(lv8.steepDescents, z);
    stepSteepCameraRigState(camRig, sample.phase, sample.slopeFactor, false, 1 / 60, false, {
      cameraMode: sample.zone?.cameraMode ?? 'rockGarden',
      playerDistance: z,
      activeZone: sample.zone ?? undefined,
    });
    const jump = Math.hypot(camRig.extraBack - prevBack, camRig.extraHeight - prevHeight);
    maxFrameJump = Math.max(maxFrameJump, jump);
    prevBack = camRig.extraBack;
    prevHeight = camRig.extraHeight;

    assert.equal(camRig.curveOutsideX, 0, 'Level 8 rear camera must never shift into a side camera');
    if (z >= gardenZone.zStart + 25 && z <= gardenZone.zEnd) {
      peakGardenBack = Math.max(peakGardenBack, camRig.extraBack);
      peakGardenHeight = Math.max(peakGardenHeight, camRig.extraHeight);
    }
  }
  assert.ok(
    peakGardenBack >= 2.2 && peakGardenHeight >= 2.2,
    `Camera must slightly raise & pull back during Rock Garden (back=${peakGardenBack.toFixed(2)}, height=${peakGardenHeight.toFixed(2)})`,
  );
  assert.ok(
    camRig.extraBack < 0.05 && camRig.extraHeight < 0.05,
    `Camera must smoothly return to normal after Rock Garden (endBack=${camRig.extraBack.toFixed(3)}, endHeight=${camRig.extraHeight.toFixed(3)})`,
  );
  assert.ok(
    maxFrameJump < 0.25,
    `Camera transitions must be smooth with zero sudden cuts (maxJump=${maxFrameJump.toFixed(3)})`,
  );

  // 6. Retry & Next Level (Level 8 -> Level 9) cleanly reset course & camera state with zero duplication
  const resetState = safer.s;
  const obsCountBefore = resetState.obstacles.length;
  const rampCountBefore = resetState.ramps.length;
  retryCurrentLevel(resetState);
  assert.equal(resetState.levelNumber, 8);
  assert.equal(resetState.followers.length, 7, 'Retry on Level 8 must preserve exactly 7 Lil Yetis');
  assert.equal(resetState.obstacles.length, obsCountBefore, 'Retry must not duplicate Level 8 rocks or obstacles');
  assert.equal(resetState.ramps.length, rampCountBefore, 'Retry must not duplicate Level 8 ramps');
  assert.equal(resetState.steepPhase, 'NORMAL', 'Retry must reset steepPhase to NORMAL');
  assert.equal(resetState.brakeAmount, 0, 'Retry must reset brakeAmount to 0');

  resetState.distance = resetState.levelLength - 1;
  stepSimulation(resetState, createInitialInput(), 0.1);
  assert.equal(resetState.phase, 'victory');
  advanceToNextLevel(resetState);
  assert.equal(resetState.levelNumber, 9);
  assert.equal(resetState.followers.length, 8, 'Next Level after Level 8 Victory must start Level 9 with 8 Lil Yetis');
  assert.equal(resetState.steepPhase, 'NORMAL');
  assert.equal(resetState.brakeAmount, 0);
});

test('Level 9 — Double Drop: 8 Lil Yetis, two separate downhills + flat recovery + wide shelter recovery, braking balance, smooth rear camera, retry/next-level, and Levels 1-8 unchanged', () => {
  // 1. Levels 1-8 remain completely untouched
  assert.equal(LEVEL_CONFIGS[0].name, 'Snowy Foothills');
  assert.equal(LEVEL_CONFIGS[1].name, 'Frosty Ridge');
  assert.equal(LEVEL_CONFIGS[2].name, 'Pine Valley');
  assert.equal(LEVEL_CONFIGS[3].name, 'Carving Pass');
  assert.equal(LEVEL_CONFIGS[4].name, 'Drop & Jump');
  assert.equal(LEVEL_CONFIGS[5].name, 'Pine Slalom');
  assert.equal(LEVEL_CONFIGS[6].name, 'Avalanche Alley');
  assert.equal(LEVEL_CONFIGS[7].name, 'Rock Garden');

  // 2. Level 9 layout sequence: Drop 1 (moderate) -> Flat Recovery -> Drop 2 (longer, gentle curve) -> Wide Shelter Recovery
  const lv9 = LEVEL_CONFIGS[8];
  assert.equal(lv9.levelNumber, 9);
  assert.equal(lv9.name, 'Double Drop');
  assert.equal(lv9.steepDescents?.length, 2, 'Level 9 must have exactly two separate downhill sections');
  assert.equal(lv9.flatZones?.length, 1, 'Level 9 must have a flat recovery area between the two downhills');

  const drop1 = lv9.steepDescents![0];
  const drop2 = lv9.steepDescents![1];
  const recoveryFlat = lv9.flatZones![0];

  assert.equal(drop1.id, 'lv9-double-drop-1');
  assert.equal(drop2.id, 'lv9-double-drop-2');
  assert.equal(recoveryFlat.id, 'lv9-double-drop-recovery');
  assert.ok(drop1.zEnd < recoveryFlat.zStart, 'Flat recovery must follow Drop 1');
  assert.ok(recoveryFlat.zEnd < drop2.zStart, 'Drop 2 must follow the flat recovery area');
  assert.ok(
    recoveryFlat.zEnd - recoveryFlat.zStart >= 200,
    `Flat recovery must be long enough to regain control (span=${recoveryFlat.zEnd - recoveryFlat.zStart}m)`,
  );
  assert.ok(
    drop2.zEnd - drop2.zStart > drop1.zEnd - drop1.zStart + 40,
    `Second downhill (${drop2.zEnd - drop2.zStart}m) must be longer than first downhill (${drop1.zEnd - drop1.zStart}m)`,
  );
  assert.ok(
    drop2.extraGradient > drop1.extraGradient,
    'Second downhill should escalate moderately beyond first downhill',
  );

  // Pitch profile & C1 elevation continuity (no cliffs or gaps)
  const basePitch = Math.atan(SLOPE_GRADIENT);
  const drop1MidPitch = Math.abs(getTrackPitchAt(9, (drop1.zStart + drop1.zEnd) * 0.5));
  const flatMidPitch = Math.abs(getTrackPitchAt(9, (recoveryFlat.zStart + recoveryFlat.zEnd) * 0.5));
  const drop2MidPitch = Math.abs(getTrackPitchAt(9, (drop2.zStart + drop2.zEnd) * 0.5));
  assert.ok(drop1MidPitch > basePitch + 0.16, `Drop 1 must be a clear downhill (pitch=${drop1MidPitch.toFixed(3)})`);
  assert.ok(flatMidPitch < basePitch - 0.10, `Recovery area must flatten noticeably (pitch=${flatMidPitch.toFixed(3)})`);
  assert.ok(drop2MidPitch > drop1MidPitch + 0.02, `Drop 2 must pitch steeper than Drop 1 (${drop2MidPitch.toFixed(3)} vs ${drop1MidPitch.toFixed(3)})`);

  for (let z = 280; z <= 1260; z += 2) {
    const y0 = getTrackElevationForLevel(9, z);
    const y1 = getTrackElevationForLevel(9, z + 2);
    assert.ok(y0 - y1 >= 0 && y0 - y1 < 1.35, `Smooth elevation without cliffs/gaps at z=${z} (dy=${(y0 - y1).toFixed(3)})`);
  }

  // No sharp turn immediately after Landing 1 (z = 505..620) or Landing 2 (z = 1005..1140)
  for (let z = drop1.zEnd; z <= drop1.zEnd + 115; z += 5) {
    const slope = Math.abs((getTrackCenterXForLevel(9, z + 2) - getTrackCenterXForLevel(9, z - 2)) / 4);
    assert.ok(slope < 0.22, `No sharp turn right after Landing 1 at z=${z} (|dX/dz|=${slope.toFixed(3)})`);
  }
  for (let z = drop2.zEnd; z <= drop2.zEnd + 135; z += 5) {
    const slope = Math.abs((getTrackCenterXForLevel(9, z + 2) - getTrackCenterXForLevel(9, z - 2)) / 4);
    assert.ok(slope < 0.22, `No sharp turn right after Landing 2 at z=${z} (|dX/dz|=${slope.toFixed(3)})`);
  }

  // Drop 2 has a clear gentle curve (not dead straight, not sharp)
  let drop2PeakCurveSlope = 0;
  for (let z = drop2.zStart + 10; z <= drop2.zEnd - 10; z += 5) {
    const slope = Math.abs((getTrackCenterXForLevel(9, z + 2) - getTrackCenterXForLevel(9, z - 2)) / 4);
    if (slope > drop2PeakCurveSlope) drop2PeakCurveSlope = slope;
  }
  assert.ok(
    drop2PeakCurveSlope >= 0.14 && drop2PeakCurveSlope <= 0.44,
    `Second downhill should feature a gentle carvable curve (peak |dX/dz|=${drop2PeakCurveSlope.toFixed(3)})`,
  );

  // Starts with Lofi + exactly 8 Lil Yetis; sparse obstacles with clear crests & completely open shelter recovery
  const initState = createInitialSimulationState('playing', undefined, 9);
  assert.equal(initState.followers.length, 8, 'Level 9 must start with Lofi and exactly 8 Lil Yetis');

  const approach1Obs = initState.obstacles.filter((o) => o.z >= 290 && o.z < drop1.zStart);
  const drop1Obs = initState.obstacles.filter((o) => o.z >= drop1.zStart && o.z <= drop1.zEnd);
  const flatObs = initState.obstacles.filter((o) => o.z > drop1.zEnd && o.z < drop2.zStart);
  const drop2Obs = initState.obstacles.filter((o) => o.z >= drop2.zStart && o.z <= drop2.zEnd);
  const shelterRecoveryObs = initState.obstacles.filter((o) => o.z > drop2.zEnd && o.z <= 1255);

  assert.equal(approach1Obs.length, 0, 'Approach crest before Drop 1 must be unobstructed');
  assert.ok(drop1Obs.length <= 4, `Drop 1 obstacles must be sparse (found ${drop1Obs.length})`);
  assert.ok(flatObs.length <= 3, `Flat recovery obstacles must be sparse (found ${flatObs.length})`);
  assert.ok(drop2Obs.length <= 5, `Drop 2 obstacles must be sparse (found ${drop2Obs.length})`);
  assert.equal(shelterRecoveryObs.length, 0, 'Wide recovery area before shelter must be obstacle-free');
  for (const obs of [...drop1Obs, ...flatObs, ...drop2Obs]) {
    assert.ok(
      Math.abs(obs.offsetX) >= 6.0,
      `Obstacle at z=${obs.z} must leave a wide central safe route (offsetX=${obs.offsetX})`,
    );
  }

  // 3. Full physics runs:
  //    - 'controlled': brake on both downhills, release in flat recovery to reset speed & direction -> Victory, 0 hits, 8 Lil Yetis
  //    - 'overbrake': brake excessively across recovery & drops -> strong avalanche pressure
  //    - 'noBrake': skip braking on downhills -> high speed degrades steering authority
  const runDoubleDrop = (mode: 'controlled' | 'overbrake' | 'noBrake') => {
    const s = createInitialSimulationState('playing', undefined, 9);
    s.windGust.cooldown = 999; // isolate deterministic downhill/recovery physics
    const dt = 1 / 60;
    let recoveryEntrySpeed = 0;
    let recoveryMidSpeed = 0;
    let maxDrop2Speed = 0;
    let minSteerMultDrop2 = 1;
    let maxOverspeedDrop2 = 0;
    let minAvalancheDist = s.avalancheDistance;
    let minFollowerGap = Infinity;
    let maxFollowerBrake = 0;

    for (let step = 0; step < 4000 && s.phase === 'playing'; step++) {
      const candidates = [0, -3.2, 3.2, -5.8, 5.8];
      let targetLat = 0;
      let bestScore = -Infinity;
      for (const cand of candidates) {
        let minClear = 20;
        for (const obs of s.obstacles) {
          const dz = obs.z - s.distance;
          if (dz > -1.5 && dz < 42) {
            const latGap = Math.abs(obs.offsetX - cand) - obs.radius;
            const weightedGap = latGap + (dz / 42) * 1.4;
            if (weightedGap < minClear) minClear = weightedGap;
          }
        }
        const score = minClear - Math.abs(cand) * 0.06;
        if (score > bestScore) {
          bestScore = score;
          targetLat = cand;
        }
      }

      const slopeAhead = getTrackCenterX(s.distance + 4) - getTrackCenterX(s.distance);
      const desiredWorldLatVel =
        (targetLat - s.lateralOffset) * 3.8 + (slopeAhead / 4) * s.forwardSpeed;
      const input = createInitialInput();
      if (desiredWorldLatVel - s.lateralVelocity > 0.4) input.right = true;
      else if (desiredWorldLatVel - s.lateralVelocity < -0.4) input.left = true;

      const onDrop1 = s.distance >= drop1.zStart + 18 && s.distance <= drop1.zEnd - 12;
      const onRecovery = s.distance >= recoveryFlat.zStart + 10 && s.distance <= recoveryFlat.zEnd - 10;
      const onDrop2 = s.distance >= drop2.zStart + 20 && s.distance <= drop2.zEnd - 14;

      if (mode === 'controlled') {
        // Brake on both downhills when speed rises above cruise, release in recovery to reset cleanly
        input.brake = (onDrop1 || onDrop2) && s.forwardSpeed > s.levelBaseSpeed + 1.8;
      } else if (mode === 'overbrake') {
        // Hold brake excessively through recovery and drops
        input.brake = onRecovery || (onDrop1 && s.forwardSpeed > s.levelBaseSpeed - 4);
      } else {
        input.brake = false;
      }

      stepSimulation(s, input, dt);

      if (s.distance >= recoveryFlat.zStart && recoveryEntrySpeed === 0) {
        recoveryEntrySpeed = s.forwardSpeed;
      }
      if (s.distance >= (recoveryFlat.zStart + recoveryFlat.zEnd) * 0.5 && recoveryMidSpeed === 0) {
        recoveryMidSpeed = s.forwardSpeed;
      }
      if (s.distance >= drop2.zStart + 35 && s.distance <= drop2.zEnd) {
        maxDrop2Speed = Math.max(maxDrop2Speed, s.forwardSpeed);
        const bal = computeSpeedSteerBalance(
          s.forwardSpeed,
          s.levelBaseSpeed,
          s.brakeAmount,
          s.jumpState === 'AIRBORNE',
        );
        minSteerMultDrop2 = Math.min(minSteerMultDrop2, bal.steerAccelMult);
        maxOverspeedDrop2 = Math.max(maxOverspeedDrop2, bal.overspeedRatio);
      }

      minAvalancheDist = Math.min(minAvalancheDist, s.avalancheDistance);
      const lofiWorldX = getTrackCenterX(s.distance) + s.lateralOffset;
      for (let i = 0; i < s.followers.length; i++) {
        maxFollowerBrake = Math.max(maxFollowerBrake, s.followers[i].brakeAmount);
        const leadDist = i === 0 ? s.distance : s.followers[i - 1].distance;
        const leadX = i === 0 ? lofiWorldX : s.followers[i - 1].worldX;
        const gap = Math.hypot(leadX - s.followers[i].worldX, leadDist - s.followers[i].distance);
        minFollowerGap = Math.min(minFollowerGap, gap);
      }
    }

    return {
      s,
      recoveryEntrySpeed,
      recoveryMidSpeed,
      maxDrop2Speed,
      minSteerMultDrop2,
      maxOverspeedDrop2,
      minAvalancheDist,
      minFollowerGap,
      maxFollowerBrake,
    };
  };

  const controlled = runDoubleDrop('controlled');
  assert.equal(controlled.s.phase, 'victory', 'Controlled braking on both drops must complete Level 9 cleanly');
  assert.equal(controlled.s.hitCount, 0, 'Controlled run must clear Level 9 with 0 obstacle hits');
  assert.equal(controlled.s.followers.length, 8, 'All 8 Lil Yetis must finish Level 9 with Lofi');
  assert.ok(
    Math.abs(controlled.recoveryMidSpeed - lv9.baseSpeed) <= 1.6,
    `Recovery area must smoothly reset speed back near cruise (${controlled.recoveryMidSpeed.toFixed(1)} vs ${lv9.baseSpeed})`,
  );
  assert.ok(
    controlled.minAvalancheDist >= 10.0,
    `Controlled Double Drop run must keep fair avalanche clearance (minDist=${controlled.minAvalancheDist.toFixed(1)}m)`,
  );
  assert.ok(
    controlled.minFollowerGap >= 2.0,
    `All 8 Lil Yetis must stay cleanly separated without stacking (minGap=${controlled.minFollowerGap.toFixed(2)}m)`,
  );
  assert.ok(
    controlled.maxFollowerBrake >= 0.35,
    `Lil Yetis must mimic braking on downhills (maxFollowerBrake=${controlled.maxFollowerBrake.toFixed(2)})`,
  );

  const overbrake = runDoubleDrop('overbrake');
  assert.ok(
    overbrake.minAvalancheDist < controlled.minAvalancheDist - 8.0,
    `Excessive braking must bring avalanche significantly closer (overbrake=${overbrake.minAvalancheDist.toFixed(1)}m vs controlled=${controlled.minAvalancheDist.toFixed(1)}m)`,
  );

  const noBrake = runDoubleDrop('noBrake');
  assert.ok(
    noBrake.maxDrop2Speed > lv9.baseSpeed + 8.0,
    `Skipping brakes on Drop 2 must build high speed (got ${noBrake.maxDrop2Speed.toFixed(1)} m/s)`,
  );
  assert.ok(
    noBrake.maxOverspeedDrop2 >= 0.65 && noBrake.minSteerMultDrop2 <= 0.76,
    `Excessive unbraked speed on Drop 2 must make steering noticeably harder (overspeed=${noBrake.maxOverspeedDrop2.toFixed(2)}, steerMult=${noBrake.minSteerMultDrop2.toFixed(2)})`,
  );

  // 4. Smooth rear camera transitions across Drop 1 -> NORMAL Flat Recovery -> Drop 2 -> NORMAL Shelter Recovery
  const camRig = createSteepCameraRigState();
  let peakDrop1Back = 0;
  let recoveryCenterBack = 99;
  let peakDrop2Back = 0;
  let maxFrameJump = 0;
  let prevBack = 0;
  let prevHeight = 0;

  for (let z = 260; z <= 1220; z += 0.48) {
    const sample = evaluateSteepDescentAt(lv9.steepDescents, z);
    stepSteepCameraRigState(camRig, sample.phase, sample.slopeFactor, false, 1 / 60, false, {
      cameraMode: sample.zone?.cameraMode ?? 'alley',
      playerDistance: z,
      activeZone: sample.zone ?? undefined,
    });
    const jump = Math.hypot(camRig.extraBack - prevBack, camRig.extraHeight - prevHeight);
    maxFrameJump = Math.max(maxFrameJump, jump);
    prevBack = camRig.extraBack;
    prevHeight = camRig.extraHeight;

    assert.equal(camRig.curveOutsideX, 0, 'Level 9 rear camera must never shift into a side camera');
    if (z >= drop1.zStart + 30 && z <= drop1.zEnd) {
      peakDrop1Back = Math.max(peakDrop1Back, camRig.extraBack);
    }
    if (z >= 640 && z <= 700) {
      recoveryCenterBack = Math.min(recoveryCenterBack, camRig.extraBack);
    }
    if (z >= drop2.zStart + 40 && z <= drop2.zEnd) {
      peakDrop2Back = Math.max(peakDrop2Back, camRig.extraBack);
    }
  }
  assert.ok(peakDrop1Back >= 2.2, `Camera must smoothly pull back on Drop 1 (got ${peakDrop1Back.toFixed(2)})`);
  assert.ok(recoveryCenterBack < 0.08, `Camera must smoothly return to normal in flat recovery (got ${recoveryCenterBack.toFixed(3)})`);
  assert.ok(peakDrop2Back >= 2.4, `Camera must smoothly pull back on Drop 2 (got ${peakDrop2Back.toFixed(2)})`);
  assert.ok(camRig.extraBack < 0.05 && camRig.extraHeight < 0.05, 'Camera must return smoothly to normal after Drop 2');
  assert.ok(maxFrameJump < 0.25, `Camera transitions must be smooth with zero sudden cuts (maxJump=${maxFrameJump.toFixed(3)})`);

  // 5. Retry & Next Level (Level 9 -> Level 10) cleanly reset course & camera state with zero duplication
  const resetState = controlled.s;
  const obsCountBefore = resetState.obstacles.length;
  retryCurrentLevel(resetState);
  assert.equal(resetState.levelNumber, 9);
  assert.equal(resetState.followers.length, 8, 'Retry on Level 9 must preserve exactly 8 Lil Yetis');
  assert.equal(resetState.obstacles.length, obsCountBefore, 'Retry must not duplicate Level 9 obstacles');
  assert.equal(resetState.steepPhase, 'NORMAL', 'Retry must reset steepPhase to NORMAL');
  assert.equal(resetState.brakeAmount, 0, 'Retry must reset brakeAmount to 0');

  resetState.distance = resetState.levelLength - 1;
  stepSimulation(resetState, createInitialInput(), 0.1);
  assert.equal(resetState.phase, 'victory');
  advanceToNextLevel(resetState);
  assert.equal(resetState.levelNumber, 10);
  assert.equal(resetState.followers.length, 9, 'Next Level after Level 9 Victory must start Level 10 with 9 Lil Yetis');
  assert.equal(resetState.steepPhase, 'NORMAL');
  assert.equal(resetState.brakeAmount, 0);
});

test('Level 10 — Summit Run: 9 Lil Yetis, 6-section layout (carving -> recovery -> optional ramp/safe -> wide landing recovery -> final downhill -> shelter recovery), braking balance, smooth rear camera, retry/next-level, and Levels 1-9 unchanged', () => {
  // 1. Levels 1-9 remain completely untouched
  assert.equal(LEVEL_CONFIGS[0].name, 'Snowy Foothills');
  assert.equal(LEVEL_CONFIGS[1].name, 'Frosty Ridge');
  assert.equal(LEVEL_CONFIGS[2].name, 'Pine Valley');
  assert.equal(LEVEL_CONFIGS[3].name, 'Carving Pass');
  assert.equal(LEVEL_CONFIGS[4].name, 'Drop & Jump');
  assert.equal(LEVEL_CONFIGS[5].name, 'Pine Slalom');
  assert.equal(LEVEL_CONFIGS[6].name, 'Avalanche Alley');
  assert.equal(LEVEL_CONFIGS[7].name, 'Rock Garden');
  assert.equal(LEVEL_CONFIGS[8].name, 'Double Drop');
  assert.equal(LEVEL_CONFIGS[8].length, 1420);
  assert.equal(LEVEL_CONFIGS[8].steepDescents?.length, 2);

  // 2. Level 10 — Summit Run 6-section layout sequence
  const lv10 = LEVEL_CONFIGS[9];
  const lv10Profile = getLevelTrackProfile(10);
  assert.equal(lv10.levelNumber, 10);
  assert.equal(lv10.name, 'Summit Run');
  assert.equal(lv10.steepDescents?.length, 3, 'Level 10 must have 3 downhill/carving sections');
  assert.equal(lv10.flatZones?.length, 3, 'Level 10 must have 3 recovery areas');
  assert.equal(lv10.ramps.length, 1, 'Level 10 must have 1 optional ramp in section 3');
  assert.ok(lv10.splitZone, 'Level 10 must provide an optional ramp route + visible safe route');
  assert.ok(lv10Profile.carvingPass, 'Level 10 must have a carving S-curve section');

  const carving = lv10.steepDescents![0];
  const rec1 = lv10.flatZones![0];
  const dropJump = lv10.steepDescents![1];
  const ramp = lv10.ramps[0];
  const rec2 = lv10.flatZones![1];
  const finalDrop = lv10.steepDescents![2];
  const recShelter = lv10.flatZones![2];

  // Strict 6-section chronological ordering
  assert.ok(carving.zEnd < rec1.zStart, 'Section 2 (Recovery 1) must follow Section 1 (Carving)');
  assert.ok(rec1.zEnd < dropJump.zStart, 'Section 3 (Downhill + Ramp/Safe) must follow Section 2');
  assert.ok(ramp.zStart >= dropJump.zEnd && ramp.zStart < rec2.zStart, 'Optional ramp sits cleanly at Section 3 exit into Section 4');
  assert.ok(rec2.zEnd < finalDrop.zStart, 'Section 5 (Final Downhill) must follow Section 4 (Landing & Recovery)');
  assert.ok(finalDrop.zEnd < recShelter.zStart, 'Section 6 (Shelter Recovery) must follow Section 5');
  assert.ok(recShelter.zEnd < lv10.length - 60, 'Shelter recovery finishes cleanly before Shelter arrival');

  // C1 elevation continuity (no cliffs, gaps, or instant-failure hazards)
  for (let z = 200; z <= lv10.length - 20; z += 2) {
    const y0 = getTrackElevationForLevel(10, z);
    const y1 = getTrackElevationForLevel(10, z + 2);
    assert.ok(
      y0 - y1 >= 0 && y0 - y1 < 1.35,
      `Smooth continuous terrain without cliffs/gaps at z=${z} (dy=${(y0 - y1).toFixed(3)})`,
    );
  }

  // No sharp turn immediately after any landing (Carving exit, Ramp landing, Final downhill exit)
  for (let z = carving.zEnd + 5; z <= rec1.zEnd; z += 5) {
    const slope = Math.abs((getTrackCenterXForLevel(10, z + 2) - getTrackCenterXForLevel(10, z - 2)) / 4);
    assert.ok(slope < 0.22, `No sharp turn after Carving at z=${z} (|dX/dz|=${slope.toFixed(3)})`);
  }
  for (let z = ramp.zStart + ramp.length; z <= rec2.zEnd; z += 5) {
    const slope = Math.abs((getTrackCenterXForLevel(10, z + 2) - getTrackCenterXForLevel(10, z - 2)) / 4);
    assert.ok(slope < 0.22, `No sharp turn after Ramp landing at z=${z} (|dX/dz|=${slope.toFixed(3)})`);
  }
  for (let z = finalDrop.zEnd; z <= recShelter.zEnd; z += 5) {
    const slope = Math.abs((getTrackCenterXForLevel(10, z + 2) - getTrackCenterXForLevel(10, z - 2)) / 4);
    assert.ok(slope < 0.22, `No sharp turn after Final Downhill at z=${z} (|dX/dz|=${slope.toFixed(3)})`);
  }

  // Starts with Lofi and exactly 9 Lil Yetis; sparse obstacles with clear safe route and empty recovery areas
  const initState = createInitialSimulationState('playing', undefined, 10);
  assert.equal(initState.followers.length, 9, 'Level 10 must start with Lofi and exactly 9 Lil Yetis');
  assert.equal(
    initState.obstacles.filter((o) => o.kind === 'fallen_log').length,
    0,
    'Level 10 must not block the safe route with full-width fallen logs',
  );
  assert.ok(initState.obstacles.length <= 26, `Level 10 obstacles must remain sparse (got ${initState.obstacles.length})`);
  assert.equal(
    initState.obstacles.filter((o) => o.z >= rec1.zStart && o.z <= rec1.zEnd).length,
    0,
    'Section 2 recovery area must be obstacle-free',
  );
  assert.equal(
    initState.obstacles.filter((o) => o.z >= rec2.zStart && o.z <= rec2.zEnd).length,
    0,
    'Section 4 wide landing & recovery area must be obstacle-free',
  );
  assert.equal(
    initState.obstacles.filter((o) => o.z >= recShelter.zStart && o.z <= lv10.length).length,
    0,
    'Section 6 wide shelter recovery area must be obstacle-free',
  );

  // 3. Full physics simulation runs across all 1500m:
  //    - 'rampControlled': carve S-curves + take optional ramp + brake final downhill -> Victory, 0 hits, 9 Lil Yetis all jump sequentially
  //    - 'safeControlled': carve S-curves + take left safe route (staying grounded) + brake final downhill -> Victory, 0 hits, 9 Lil Yetis
  //    - 'noBrake': skip braking on final downhill -> excessive speed makes steering harder
  //    - 'overbrake': brake excessively across recovery & downhill -> avalanche approaches closely
  const runSummit = (mode: 'rampControlled' | 'safeControlled' | 'noBrake' | 'overbrake') => {
    const s = createInitialSimulationState('playing', undefined, 10);
    s.windGust.cooldown = 999; // isolate deterministic course & braking physics
    const dt = 1 / 60;
    let lofiRampJumpPeak = 0;
    let maxFinalDropSpeed = 0;
    let minSteerMultFinal = 1;
    let maxOverspeedFinal = 0;
    let minAvalancheDist = s.avalancheDistance;
    let minFollowerGap = Infinity;
    let maxFollowerBrake = 0;
    const followerPeakHeights = s.followers.map(() => 0);
    const followerJumpStartSteps = s.followers.map(() => -1);

    for (let step = 0; step < 5000 && s.phase === 'playing'; step++) {
      let targetLat = 0;
      if (s.distance >= 660 && s.distance <= 820) {
        // Choose optional right ramp route or left safe route
        targetLat = mode === 'safeControlled' ? -7.2 : ramp.offsetX;
      } else {
        const candidates = [0, -3.0, 3.0, -5.6, 5.6];
        let bestScore = -Infinity;
        for (const cand of candidates) {
          let minClear = 20;
          for (const obs of s.obstacles) {
            const dz = obs.z - s.distance;
            if (dz > -1.5 && dz < 42) {
              const latGap = Math.abs(obs.offsetX - cand) - obs.radius;
              const weightedGap = latGap + (dz / 42) * 1.4;
              if (weightedGap < minClear) minClear = weightedGap;
            }
          }
          const score = minClear - Math.abs(cand) * 0.06;
          if (score > bestScore) {
            bestScore = score;
            targetLat = cand;
          }
        }
      }

      const slopeAhead = getTrackCenterX(s.distance + 4) - getTrackCenterX(s.distance);
      const desiredWorldLatVel =
        (targetLat - s.lateralOffset) * 4.0 + (slopeAhead / 4) * s.forwardSpeed;
      const input = createInitialInput();
      if (desiredWorldLatVel - s.lateralVelocity > 0.35) input.right = true;
      else if (desiredWorldLatVel - s.lateralVelocity < -0.35) input.left = true;

      const onCarve = s.distance >= carving.zStart + 18 && s.distance <= carving.zEnd - 10;
      const onDropJump = s.distance >= dropJump.zStart + 16 && s.distance <= dropJump.zEnd - 8;
      const onFinalDrop = s.distance >= finalDrop.zStart + 16 && s.distance <= finalDrop.zEnd - 12;
      const onRec =
        (s.distance >= rec1.zStart + 10 && s.distance <= rec1.zEnd - 10) ||
        (s.distance >= rec2.zStart + 10 && s.distance <= rec2.zEnd - 10);

      if (mode === 'rampControlled' || mode === 'safeControlled') {
        input.brake =
          (onCarve && s.forwardSpeed > s.levelBaseSpeed + 1.8) ||
          (onDropJump && s.forwardSpeed > s.levelBaseSpeed + 2.4) ||
          (onFinalDrop && s.forwardSpeed > s.levelBaseSpeed + 1.6);
      } else if (mode === 'overbrake') {
        input.brake = onRec || onFinalDrop || (onCarve && s.forwardSpeed > s.levelBaseSpeed - 4);
      } else {
        input.brake = false;
      }

      stepSimulation(s, input, dt);

      if (s.distance >= ramp.zStart && s.distance <= ramp.zStart + 90) {
        lofiRampJumpPeak = Math.max(lofiRampJumpPeak, s.heightAboveGround);
      }
      if (s.distance >= finalDrop.zStart + 35 && s.distance <= finalDrop.zEnd) {
        maxFinalDropSpeed = Math.max(maxFinalDropSpeed, s.forwardSpeed);
        const bal = computeSpeedSteerBalance(
          s.forwardSpeed,
          s.levelBaseSpeed,
          s.brakeAmount,
          s.jumpState === 'AIRBORNE',
        );
        minSteerMultFinal = Math.min(minSteerMultFinal, bal.steerAccelMult);
        maxOverspeedFinal = Math.max(maxOverspeedFinal, bal.overspeedRatio);
      }

      minAvalancheDist = Math.min(minAvalancheDist, s.avalancheDistance);
      const lofiWorldX = getTrackCenterX(s.distance) + s.lateralOffset;
      for (let i = 0; i < s.followers.length; i++) {
        const f = s.followers[i];
        maxFollowerBrake = Math.max(maxFollowerBrake, f.brakeAmount);
        if (f.distance >= ramp.zStart - 2 && f.distance <= ramp.zStart + 95) {
          followerPeakHeights[i] = Math.max(followerPeakHeights[i], f.heightAboveGround);
          if (f.heightAboveGround > 0.6 && followerJumpStartSteps[i] === -1) {
            followerJumpStartSteps[i] = step;
          }
        }
        const leadDist = i === 0 ? s.distance : s.followers[i - 1].distance;
        const leadX = i === 0 ? lofiWorldX : s.followers[i - 1].worldX;
        const gap = Math.hypot(leadX - f.worldX, leadDist - f.distance);
        minFollowerGap = Math.min(minFollowerGap, gap);
      }
    }

    return {
      s,
      lofiRampJumpPeak,
      maxFinalDropSpeed,
      minSteerMultFinal,
      maxOverspeedFinal,
      minAvalancheDist,
      minFollowerGap,
      maxFollowerBrake,
      followerPeakHeights,
      followerJumpStartSteps,
    };
  };

  // Optional Ramp Route run
  const rampRun = runSummit('rampControlled');
  assert.equal(rampRun.s.phase, 'victory', 'Controlled Summit Run via optional ramp must finish in Victory');
  assert.equal(rampRun.s.hitCount, 0, 'Controlled ramp route must finish with 0 hits');
  assert.equal(rampRun.s.followers.length, 9, 'All 9 Lil Yetis must finish Summit Run with Lofi');
  assert.ok(rampRun.lofiRampJumpPeak >= 2.6, `Lofi must launch cleanly off optional ramp (peak=${rampRun.lofiRampJumpPeak.toFixed(2)}m)`);
  assert.ok(rampRun.minAvalancheDist >= 10.0, `Avalanche clearance must remain fair (minDist=${rampRun.minAvalancheDist.toFixed(1)}m)`);
  assert.ok(rampRun.minFollowerGap >= 2.0, `All 9 Lil Yetis must stay cleanly separated without stacking (minGap=${rampRun.minFollowerGap.toFixed(2)}m)`);
  assert.ok(rampRun.maxFollowerBrake >= 0.35, `Lil Yetis must mimic braking on Summit Run (maxFollowerBrake=${rampRun.maxFollowerBrake.toFixed(2)})`);
  for (let i = 0; i < 9; i++) {
    assert.ok(
      rampRun.followerPeakHeights[i] >= 2.0,
      `Lil Yeti #${i + 1} must jump off the optional ramp (peak=${rampRun.followerPeakHeights[i].toFixed(2)}m)`,
    );
    if (i > 0) {
      assert.ok(
        rampRun.followerJumpStartSteps[i] > rampRun.followerJumpStartSteps[i - 1],
        `Lil Yeti #${i + 1} must jump sequentially after #${i} (step ${rampRun.followerJumpStartSteps[i]} vs ${rampRun.followerJumpStartSteps[i - 1]})`,
      );
    }
  }

  // Visible Safe Route run
  const safeRun = runSummit('safeControlled');
  assert.equal(safeRun.s.phase, 'victory', 'Controlled Summit Run via left safe route must finish in Victory');
  assert.equal(safeRun.s.hitCount, 0, 'Safe route must finish with 0 hits');
  assert.equal(safeRun.s.followers.length, 9, 'All 9 Lil Yetis must finish safe route with Lofi');
  assert.ok(safeRun.lofiRampJumpPeak < 0.2, `Safe route must stay grounded without hitting ramp (peak=${safeRun.lofiRampJumpPeak.toFixed(2)}m)`);
  assert.ok(safeRun.minFollowerGap >= 2.0, `Safe route Lil Yetis must stay separated (minGap=${safeRun.minFollowerGap.toFixed(2)}m)`);

  // Unbraked final downhill makes steering harder
  const noBrake = runSummit('noBrake');
  assert.ok(
    noBrake.maxFinalDropSpeed > lv10.baseSpeed + 8.0,
    `Skipping brakes on final downhill must build high speed (got ${noBrake.maxFinalDropSpeed.toFixed(1)} m/s)`,
  );
  assert.ok(
    noBrake.maxOverspeedFinal >= 0.65 && noBrake.minSteerMultFinal <= 0.76,
    `Excessive speed must make steering harder (overspeed=${noBrake.maxOverspeedFinal.toFixed(2)}, steerMult=${noBrake.minSteerMultFinal.toFixed(2)})`,
  );

  // Excessive braking allows avalanche to approach
  const overbrake = runSummit('overbrake');
  assert.ok(
    overbrake.minAvalancheDist < rampRun.minAvalancheDist - 8.0,
    `Excessive braking must let avalanche approach closely (overbrake=${overbrake.minAvalancheDist.toFixed(1)}m vs controlled=${rampRun.minAvalancheDist.toFixed(1)}m)`,
  );

  // 4. Smooth rear camera transitions across all 6 sections (never front/side, never sudden cut, zero trick rotation)
  const camRig = createSteepCameraRigState();
  let peakCarveBack = 0;
  let peakCarveHeight = 0;
  let rec1MinBack = 99;
  let peakDropJumpBack = 0;
  let rec2MinBack = 99;
  let peakFinalDropBack = 0;
  let maxFrameJump = 0;
  let prevBack = 0;
  let prevHeight = 0;

  for (let z = 220; z <= 1420; z += 0.48) {
    const sample = evaluateSteepDescentAt(lv10.steepDescents, z);
    const activeCameraMode = sample.zone?.cameraMode ?? 'alley';
    const jumpHeight =
      z >= ramp.zStart + ramp.length && z <= ramp.zStart + ramp.length + 34 ? 2.4 : 0;
    stepSteepCameraRigState(camRig, sample.phase, sample.slopeFactor, false, 1 / 60, false, {
      cameraMode: activeCameraMode,
      carvingPass: activeCameraMode === 'carving' ? lv10Profile.carvingPass : undefined,
      playerDistance: z,
      playerJumpHeight: jumpHeight,
      activeZone: sample.zone ?? undefined,
    });
    const jump = Math.hypot(camRig.extraBack - prevBack, camRig.extraHeight - prevHeight);
    maxFrameJump = Math.max(maxFrameJump, jump);
    prevBack = camRig.extraBack;
    prevHeight = camRig.extraHeight;

    // Never a full side camera (gentle outside nudge only inside carving, 0 everywhere else)
    if (activeCameraMode !== 'carving') {
      assert.ok(Math.abs(camRig.curveOutsideX) < 1.2, `Rear camera must stay behind Lofi at z=${z.toFixed(1)} (outsideX=${camRig.curveOutsideX.toFixed(2)})`);
    }
    if (z >= carving.zStart + 30 && z <= carving.zEnd) {
      peakCarveBack = Math.max(peakCarveBack, camRig.extraBack);
      peakCarveHeight = Math.max(peakCarveHeight, camRig.extraHeight);
    }
    if (z >= 565 && z <= 590) rec1MinBack = Math.min(rec1MinBack, camRig.extraBack);
    if (z >= dropJump.zStart + 25 && z <= ramp.zStart + 30) peakDropJumpBack = Math.max(peakDropJumpBack, camRig.extraBack);
    if (z >= 900 && z <= 940) rec2MinBack = Math.min(rec2MinBack, camRig.extraBack);
    if (z >= finalDrop.zStart + 40 && z <= finalDrop.zEnd) peakFinalDropBack = Math.max(peakFinalDropBack, camRig.extraBack);
  }
  assert.ok(peakCarveBack >= 1.2 && peakCarveHeight >= 1.0, `Camera must smoothly elevate & pull back during carving (back=${peakCarveBack.toFixed(2)}, height=${peakCarveHeight.toFixed(2)})`);
  assert.ok(rec1MinBack < 0.12, `Camera must return smoothly to normal in Recovery 1 (got ${rec1MinBack.toFixed(3)})`);
  assert.ok(peakDropJumpBack >= 2.2, `Camera must pull back during optional ramp downhill/jump (got ${peakDropJumpBack.toFixed(2)})`);
  assert.ok(rec2MinBack < 0.12, `Camera must return smoothly to normal in Recovery 2 (got ${rec2MinBack.toFixed(3)})`);
  assert.ok(peakFinalDropBack >= 2.4, `Camera must pull back during final downhill (got ${peakFinalDropBack.toFixed(2)})`);
  assert.ok(camRig.extraBack < 0.05 && camRig.extraHeight < 0.05, 'Camera must return smoothly to normal before Shelter');
  assert.ok(maxFrameJump < 0.25, `Camera transitions must be smooth with zero sudden cuts (maxJump=${maxFrameJump.toFixed(3)})`);

  // 5. Retry on Level 10 & Next Level (Level 9 -> Level 10, and Level 10 final-level cap) never duplicate course or camera state
  const resetState = rampRun.s;
  const obsCountBefore = resetState.obstacles.length;
  const rampCountBefore = resetState.ramps.length;
  retryCurrentLevel(resetState);
  assert.equal(resetState.levelNumber, 10);
  assert.equal(resetState.followers.length, 9, 'Retry on Level 10 must preserve exactly 9 Lil Yetis');
  assert.equal(resetState.obstacles.length, obsCountBefore, 'Retry must not duplicate Level 10 obstacles');
  assert.equal(resetState.ramps.length, rampCountBefore, 'Retry must not duplicate Level 10 ramps');
  assert.equal(resetState.steepPhase, 'NORMAL', 'Retry must reset steepPhase to NORMAL');
  assert.equal(resetState.brakeAmount, 0, 'Retry must reset brakeAmount to 0');

  resetState.distance = resetState.levelLength - 1;
  stepSimulation(resetState, createInitialInput(), 0.1);
  assert.equal(resetState.phase, 'victory');
  const advancedPast10 = advanceToNextLevel(resetState);
  assert.equal(advancedPast10, false, 'Level 10 is the final progression level (no Level 11)');

  const fromLv9 = createInitialSimulationState('playing', undefined, 9);
  fromLv9.distance = fromLv9.levelLength - 1;
  stepSimulation(fromLv9, createInitialInput(), 0.1);
  assert.equal(fromLv9.phase, 'victory');
  assert.equal(advanceToNextLevel(fromLv9), true, 'Next Level from Level 9 must advance to Level 10');
  assert.equal(fromLv9.levelNumber, 10);
  assert.equal(fromLv9.followers.length, 9, 'Transition from Level 9 to Level 10 starts with 9 Lil Yetis');
  assert.equal(fromLv9.obstacles.length, obsCountBefore, 'Next Level transition must not duplicate Level 10 obstacles');
  assert.equal(fromLv9.ramps.length, rampCountBefore, 'Next Level transition must not duplicate Level 10 ramps');
  assert.equal(fromLv9.steepPhase, 'NORMAL');
  assert.equal(fromLv9.brakeAmount, 0);
});

test('Sui wallet login & profile logic: Demo Mode isolation, address normalization/shortening, compact Sui payload, badges, monotonic merge, and URL/icon security', () => {
  const walletA = '0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234569f0e';
  const walletB = '0xdeadbeef0000000000000000000000000000000000000000000000000000cafe';
  const shortHex = '0xabc';

  // 1. Strict Sui address validation, canonical normalization, and shortening
  assert.equal(isValidSuiAddress(walletA), true);
  assert.equal(isValidSuiAddress(shortHex), true);
  assert.equal(isValidSuiAddress('not-a-sui-address'), false);
  assert.equal(isValidSuiAddress('0xGGGG'), false);
  assert.equal(normalizeSuiAddress(shortHex), `0x${'0'.repeat(61)}abc`);
  assert.equal(shortenSuiAddress(walletA), '0x1a2b…9f0e');
  assert.equal(normalizeSuiAddress('invalid'), null);

  // 2. Demo Mode isolation: refuses to write any Sui profile without a connected wallet
  const emptyA = createEmptySuiProfile(walletA, '2026-11-22T12:00:00.000Z');
  assert.equal(emptyA.highestCompletedLevel, 0);
  assert.equal(emptyA.lilYetisRecruited, 0);
  assert.deepEqual(emptyA.badges, []);
  assert.equal(saveWalletSuiProfile(null, emptyA), false, 'Demo Mode must NEVER save progress to Sui');
  assert.equal(
    saveWalletSuiProfile(walletB, emptyA),
    false,
    'Cross-wallet profile writes must be rejected',
  );

  // 3. Monotonic level completion, Lil Yetis recruitment cap (9), and deterministic badges
  let prof = applyLevelCompletionToProfile(emptyA, 1, '2026-11-22T12:01:00.000Z');
  assert.equal(prof.highestCompletedLevel, 1);
  assert.equal(prof.lilYetisRecruited, 1);
  assert.deepEqual(prof.badges, ['first_shelter']);

  prof = applyLevelCompletionToProfile(prof, 5, '2026-11-22T12:05:00.000Z');
  assert.equal(prof.highestCompletedLevel, 5);
  assert.equal(prof.lilYetisRecruited, 5);
  assert.deepEqual(prof.badges, ['first_shelter', 'steep_survivor', 'alpine_carver']);

  // Completing an earlier level (e.g. Level 2 replay) must NEVER regress highest level or badges
  const afterReplay = applyLevelCompletionToProfile(prof, 2, '2026-11-22T12:06:00.000Z');
  assert.equal(afterReplay.highestCompletedLevel, 5);
  assert.equal(afterReplay.lilYetisRecruited, 5);
  assert.deepEqual(afterReplay.badges, ['first_shelter', 'steep_survivor', 'alpine_carver']);

  // Completing Level 10 caps Lil Yetis strictly at 9 and unlocks all 5 level progression badges
  const summitProf = applyLevelCompletionToProfile(afterReplay, 10, '2026-11-22T12:10:00.000Z');
  assert.equal(summitProf.highestCompletedLevel, 10);
  assert.equal(summitProf.lilYetisRecruited, 9);
  assert.equal(computeRecruitedLilYetis(10), 9);
  assert.equal(SUI_BADGE_DEFINITIONS.length, 6);
  assert.deepEqual(
    summitProf.badges,
    ['first_shelter', 'steep_survivor', 'alpine_carver', 'yeti_squad', 'summit_champion'],
  );

  // 4. Compact Sui payload serialization: strictly tiny metadata only (no audio, images, or secrets)
  const serialized = serializeSuiProfilePayload(summitProf);
  assert.ok(
    serialized.length < 350 && serialized.length <= MAX_PROFILE_PAYLOAD_BYTES,
    `Serialized Sui profile must remain tiny (got ${serialized.length} bytes)`,
  );
  assert.equal(serialized.includes('privateKey'), false);
  assert.equal(serialized.includes('.mp3'), false);
  assert.equal(serialized.includes('.png'), false);

  const reloaded = parseSuiProfilePayload(walletA, serialized);
  assert.ok(reloaded, 'Valid serialized Sui profile must parse cleanly');
  assert.equal(reloaded.walletAddress, walletA);
  assert.equal(reloaded.highestCompletedLevel, 10);
  assert.equal(reloaded.lilYetisRecruited, 9);
  assert.deepEqual(reloaded.badges, summitProf.badges);

  // Malformed or oversized payloads are rejected; unknown badges are stripped
  assert.equal(parseSuiProfilePayload(walletA, '{bad-json'), null);
  assert.equal(parseSuiProfilePayload(walletA, 'x'.repeat(MAX_PROFILE_PAYLOAD_BYTES + 10)), null);
  const tampered = parseSuiProfilePayload(
    walletA,
    JSON.stringify({
      v: 1,
      highestCompletedLevel: 3,
      lilYetisRecruited: 99,
      badges: ['first_shelter', 'injected_fake_badge'],
      updatedAt: '2026-11-22T12:12:00.000Z',
    }),
  );
  assert.ok(tampered);
  assert.equal(tampered.highestCompletedLevel, 3);
  assert.equal(tampered.lilYetisRecruited, 9, 'Lil Yetis count must be clamped <= 9');
  assert.equal(tampered.badges.includes('injected_fake_badge' as never), false);
  assert.deepEqual(deriveBadgesForProgress(3, 3), ['first_shelter', 'steep_survivor']);

  // 5. Monotonic merge preserves highest progress across devices/reloads & isolates wallets
  const merged = mergeSuiProfiles(prof, summitProf);
  assert.equal(merged.highestCompletedLevel, 10);
  assert.equal(merged.lilYetisRecruited, 9);
  assert.notEqual(buildSuiProfileStorageKey(walletA), buildSuiProfileStorageKey(walletB));
  assert.throws(() => mergeSuiProfiles(prof, createEmptySuiProfile(walletB)));

  // 6. Security checks on Sui RPC URLs & wallet icon URLs
  assert.equal(isAllowedSuiRpcUrl('https://fullnode.testnet.sui.io:443'), true);
  assert.equal(isAllowedSuiRpcUrl('https://fullnode.mainnet.sui.io'), true);
  assert.equal(isAllowedSuiRpcUrl('http://fullnode.testnet.sui.io'), false);
  assert.equal(isAllowedSuiRpcUrl('http://127.0.0.1:9000'), false);
  assert.equal(isAllowedSuiRpcUrl('https://169.254.169.254/latest'), false);
  assert.equal(isAllowedSuiRpcUrl('https://evil.example.com'), false);
  assert.equal(sanitizeWalletIconUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeWalletIconUrl('https://wallet.sui.io/icon.png'), 'https://wallet.sui.io/icon.png');
  assert.equal(
    sanitizeWalletIconUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='),
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
  );
});

test('Sui daily login streak counter and Streak Fire badge: consecutive days, same-day idempotence, missed-day reset, serialization, and merge', () => {
  const wallet = '0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234569f0e';
  assert.equal(DAILY_STREAK_FIRE_THRESHOLD, 2);

  // Calendar date key validation & day delta calculation
  assert.equal(toCalendarDateKey('2026-11-22'), '2026-11-22');
  assert.equal(toCalendarDateKey('2026-02-31'), null, 'Impossible calendar date must be rejected');
  assert.equal(toCalendarDateKey('not-a-date'), null);
  assert.equal(computeCalendarDayDelta('2026-11-21', '2026-11-22'), 1);
  assert.equal(computeCalendarDayDelta('2026-11-30', '2026-12-01'), 1);
  assert.equal(computeCalendarDayDelta('2026-11-22', '2026-11-22'), 0);
  assert.equal(computeCalendarDayDelta('2026-11-20', '2026-11-22'), 2);

  // 1. First login starts streak at 1 without activating Streak Fire yet
  const empty = createEmptySuiProfile(wallet, '2026-11-20T09:00:00.000Z');
  assert.equal(empty.loginStreak, 0);
  assert.equal(empty.lastLoginDate, null);
  assert.equal(hasStreakFireBadge(empty), false);

  const day1 = applyDailyLoginToProfile(empty, '2026-11-20', '2026-11-20T09:00:00.000Z');
  assert.equal(day1.loginStreak, 1);
  assert.equal(day1.lastLoginDate, '2026-11-20');
  assert.equal(hasStreakFireBadge(day1), false);
  assert.equal(day1.badges.includes('streak_fire'), false);

  // 2. Repeated login on the same calendar day is idempotent
  const day1Again = applyDailyLoginToProfile(day1, '2026-11-20', '2026-11-20T21:30:00.000Z');
  assert.equal(day1Again.loginStreak, 1);
  assert.equal(day1Again.lastLoginDate, '2026-11-20');
  assert.equal(hasStreakFireBadge(day1Again), false);

  // 3. Consecutive daily login increments streak and activates Streak Fire badge
  const day2 = applyDailyLoginToProfile(day1Again, '2026-11-21', '2026-11-21T08:00:00.000Z');
  assert.equal(day2.loginStreak, 2);
  assert.equal(day2.lastLoginDate, '2026-11-21');
  assert.equal(hasStreakFireBadge(day2), true);
  assert.equal(day2.badges.includes('streak_fire'), true);

  const day3 = applyDailyLoginToProfile(day2, '2026-11-22', '2026-11-22T10:15:00.000Z');
  assert.equal(day3.loginStreak, 3);
  assert.equal(day3.lastLoginDate, '2026-11-22');
  assert.equal(hasStreakFireBadge(day3), true);
  assert.equal(day3.badges.includes('streak_fire'), true);

  // Completing levels while on a streak preserves streak & Streak Fire badge
  const day3WithWin = applyLevelCompletionToProfile(day3, 1, '2026-11-22T10:20:00.000Z');
  assert.equal(day3WithWin.loginStreak, 3);
  assert.deepEqual(day3WithWin.badges, ['first_shelter', 'streak_fire']);

  // 4. Compact Sui payload round-trips loginStreak, lastLoginDate, and streak_fire badge
  const serialized = serializeSuiProfilePayload(day3WithWin);
  assert.ok(
    serialized.length < 350 && serialized.length <= MAX_PROFILE_PAYLOAD_BYTES,
    `Serialized streak profile must stay compact (got ${serialized.length} bytes)`,
  );
  const parsed = parseSuiProfilePayload(wallet, serialized);
  assert.ok(parsed);
  assert.equal(parsed.loginStreak, 3);
  assert.equal(parsed.lastLoginDate, '2026-11-22');
  assert.equal(hasStreakFireBadge(parsed), true);
  assert.deepEqual(parsed.badges, ['first_shelter', 'streak_fire']);

  // 5. Clock skew behind stored date does not reset or double-increment streak
  const clockSkew = applyDailyLoginToProfile(day3WithWin, '2026-11-21', '2026-11-21T23:00:00.000Z');
  assert.equal(clockSkew.loginStreak, 3);
  assert.equal(clockSkew.lastLoginDate, '2026-11-22');
  assert.equal(hasStreakFireBadge(clockSkew), true);

  // 6. Missing a full day (gap >= 2 days) resets streak to 1 and deactivates Streak Fire
  const afterGap = applyDailyLoginToProfile(day3WithWin, '2026-11-24', '2026-11-24T09:00:00.000Z');
  assert.equal(afterGap.loginStreak, 1);
  assert.equal(afterGap.lastLoginDate, '2026-11-24');
  assert.equal(hasStreakFireBadge(afterGap), false);
  assert.equal(afterGap.badges.includes('streak_fire'), false);
  assert.equal(afterGap.badges.includes('first_shelter'), true, 'Level badges remain earned after streak reset');

  // 7. Merging two profile snapshots keeps the newer calendar date's streak
  const merged = mergeSuiProfiles(day2, day3WithWin);
  assert.equal(merged.loginStreak, 3);
  assert.equal(merged.lastLoginDate, '2026-11-22');
  assert.equal(hasStreakFireBadge(merged), true);

  // 8. Demo Mode still refuses to save streak data
  assert.equal(saveWalletSuiProfile(null, day3WithWin), false);
});








